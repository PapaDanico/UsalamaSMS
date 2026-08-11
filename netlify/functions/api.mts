/* ============================================================
   The API, as a Netlify Function.

   WHY THIS SHAPE, AND WHAT IT COSTS.

   The API is a Fastify application designed to be a long-lived process:
   it holds a Prisma connection pool and takes per-org advisory locks
   while appending to the audit chain. Netlify Functions are Lambda —
   short-lived, concurrent, and cold-started. That is a real mismatch
   and it is worth naming rather than discovering later:

     · CONNECTIONS. Every warm Lambda holds its own Prisma pool. Fifty
       concurrent invocations against a direct Postgres connection will
       exhaust Supabase's connection limit, and the symptom is random
       timeouts that look like a network problem rather than like a
       configuration one. Use the TRANSACTION POOLER url here (port
       6543, `?pgbouncer=true&connection_limit=1`), not the direct one.

     · ADVISORY LOCKS still work. `pg_advisory_xact_lock` is transaction
       scoped, so it is released at commit and is safe under pgbouncer's
       transaction pooling. A session-scoped lock would NOT be, and that
       is why appendAudit uses the xact variant — it was the right
       choice before this file existed, and it is what makes this file
       possible.

     · COLD STARTS. Prisma's engine adds roughly a second to a cold
       invocation. For a ramp agent whose report is already queued in
       IndexedDB and syncing in the background, that is invisible. For a
       triage screen it would not be.

   The honest recommendation is that this API eventually lives on a
   container host that keeps a process warm. This exists because Netlify
   is what the repository is already connected to, and a deployed
   endpoint that works beats an undeployed one that would work better.

   ROUTING: every /api/* path reaches Fastify, which does its own
   routing. One function rather than one per route, so there is exactly
   one place where auth, rate limiting and error handling are applied.
   ============================================================ */

import type { Config, Context } from "@netlify/functions";

/** Cached across warm invocations. Building Fastify per request would
    pay the Prisma cold start every time. */
let appPromise: Promise<{
  inject: (opts: unknown) => Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }>;
}> | null = null;

/**
 * Configuration this function cannot run without.
 *
 * Checked HERE, before the server module is imported, because core.ts
 * validates its environment at import time and calls process.exit(1).
 * In a long-lived process that is exactly right — a misconfigured
 * deploy dies at boot rather than on the first request that needs a
 * salt. In a Lambda it is a crash with an opaque platform error, and
 * whoever is looking at it has no idea which variable is missing.
 */
function missingConfig(): string[] {
  const missing: string[] = [];

  /* The Netlify Supabase extension sets SUPABASE_DATABASE_URL to the
     project's REST API base — `https://<ref>.supabase.co` — not to a
     Postgres connection string. Accepting it on the strength of its
     name produces a Prisma protocol error on a deploy that has just
     been told it is correctly connected, which is a bad hour for
     whoever is looking at it.

     So the SCHEME decides, not the name. */
  const candidate = Netlify.env.get("DATABASE_URL") ?? Netlify.env.get("SUPABASE_DATABASE_URL");
  if (!candidate) {
    missing.push("DATABASE_URL — the Postgres URI from Supabase → Connect");
  } else if (!/^postgres(ql)?:\/\//.test(candidate)) {
    missing.push(
      "DATABASE_URL — set, but not a Postgres URI. The Supabase extension's " +
        "SUPABASE_DATABASE_URL is the REST API base (https://…), not a " +
        "connection string; set DATABASE_URL explicitly.",
    );
  }

  for (const name of ["JWT_SECRET", "DEIDENT_SALT"] as const) {
    if (!Netlify.env.get(name)) missing.push(name);
  }
  return missing;
}

export default async (req: Request, _context: Context): Promise<Response> => {
  const missing = missingConfig();
  if (missing.length > 0) {
    // 503 rather than 500: the service is not broken, it is not
    // configured. The distinction matters to whoever is on call, and
    // naming the variables saves them an hour.
    //
    // The NAMES are safe to return; the values never are.
    return Response.json(
      {
        error: "not_configured",
        missing,
        hint: "Set these on the Netlify project. See docs/06-DEPLOYMENT.md.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    if (!appPromise) {
      appPromise = import("../../apps/api/src/server.js").then(async (mod) => {
        const app = await mod.build();
        await app.ready();
        return app as never;
      });
    }
    const app = await appPromise;

    const url = new URL(req.url);
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

    /* `inject` rather than an AWS-Lambda adapter, deliberately. It is
       the same entry point tests/integration/sync.route.integration
       drives, so the deployed path and the tested path are the same
       code — an adapter would introduce a translation layer that
       nothing in this repository exercises. */
    const res = await app.inject({
      method: req.method,
      url: url.pathname + url.search,
      headers: headersToObject(req.headers),
      ...(body === undefined ? {} : { payload: body }),
    });

    return new Response(res.body, {
      status: res.statusCode,
      headers: res.headers as HeadersInit,
    });
  } catch (err) {
    // A thrown error here is a cold-start or connection failure. The
    // detail goes to the function log; the caller gets nothing, because
    // a Prisma connection error carries the database host and, in some
    // shapes, fragments of the query.
    console.error("[usalamasms] function failed", err);
    // Reset so the next invocation retries the build rather than
    // serving a permanently poisoned cached promise.
    appPromise = null;
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
};

/**
 * Headers as a plain object.
 *
 * `Object.fromEntries(req.headers)` reads correctly and does not
 * typecheck: Headers is only iterable when the DOM.Iterable lib is
 * loaded, and this project's tsconfig deliberately loads ES2022 + DOM.
 * forEach is on Headers unconditionally, so this needs no lib change
 * and no assertion — and it stayed invisible until a test imported this
 * module and pulled it into the typecheck graph.
 */
function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export const config: Config = {
  path: "/api/*",
};
