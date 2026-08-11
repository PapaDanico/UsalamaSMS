// =====================================================================
// The Netlify Function handler, exercised directly.
//
// netlify/functions/api.mts is the only code in this repository that
// nothing else covers: it translates a web Request into a Fastify
// injection and a Fastify reply back into a Response. That translation
// is small, and small translations are where status codes get dropped,
// headers get lost and bodies arrive as "[object Object]".
//
// It also holds the not-configured branch, which is the FIRST thing
// anyone deploying this will meet — and a 503 that fails to name the
// missing variable is a support conversation instead of a fix.
//
// This cannot reach the deployed function; egress from this environment
// to netlify.app is blocked. It runs the same module the deploy bundles,
// against the same Postgres the other integration suites use.
// =====================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import argon2 from "argon2";
import { prisma, reset, migrate, disconnect, hasDatabase, DATABASE_URL } from "./db.setup";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
const PASSWORD = "a-sufficiently-long-test-password";

/**
 * The function reads configuration through Netlify's global rather than
 * process.env, so the global has to exist before the module is imported.
 */
function installNetlifyGlobal(env: Record<string, string | undefined>): void {
  (globalThis as Record<string, unknown>)["Netlify"] = {
    env: { get: (name: string) => env[name] },
  };
}

type Handler = (req: Request, ctx: unknown) => Promise<Response>;

async function loadHandler(env: Record<string, string | undefined>): Promise<Handler> {
  installNetlifyGlobal(env);
  vi.resetModules(); // the handler caches its Fastify instance across calls
  const mod = await import("../../netlify/functions/api.mjs");
  return mod.default as Handler;
}

const BASE = "https://usalamasms.netlify.app";

describe.skipIf(!hasDatabase)("the Netlify Function handler", () => {
  beforeAll(() => migrate());
  afterAll(() => disconnect());

  beforeEach(async () => {
    await reset();
    process.env["JWT_SECRET"] = JWT_SECRET;
    process.env["DEIDENT_SALT"] = "integration-test-salt";
    process.env["LOG_LEVEL"] = "silent";
  });

  it("answers 503 and NAMES what is missing when unconfigured", async () => {
    // The first thing anyone deploying this meets. A Lambda that
    // crashes on an absent variable produces a platform error that says
    // nothing about which one.
    const handler = await loadHandler({ JWT_SECRET, DEIDENT_SALT: "x" }); // no database url
    const res = await handler(new Request(`${BASE}/api/health`), {});

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("not_configured");
    expect(body.missing.join(" ")).toMatch(/DATABASE_URL/);
    // The NAMES are safe to return. The values never are.
    expect(JSON.stringify(body)).not.toContain(JWT_SECRET);
  });

  it("REJECTS the Supabase extension's SUPABASE_DATABASE_URL, which is not a connection string", async () => {
    // The trap this test exists for. The Netlify Supabase extension
    // sets SUPABASE_DATABASE_URL to the project's REST API base —
    // literally `https://<ref>.supabase.co` — for use with
    // createClient(). It is not a Postgres URI, and accepting it on the
    // strength of its name produces a Prisma protocol error on a deploy
    // that has just been told it is correctly connected.
    //
    // An earlier version of this code did exactly that.
    const handler = await loadHandler({
      SUPABASE_DATABASE_URL: "https://wbixxhpaswstaphfsowz.supabase.co",
      JWT_SECRET,
      DEIDENT_SALT: "x",
    });
    const res = await handler(new Request(`${BASE}/api/health`), {});

    expect(res.status).toBe(503);
    const body = await res.json();
    // And it must SAY why, not merely refuse.
    expect(body.missing.join(" ")).toMatch(/not a Postgres URI/i);
    expect(body.missing.join(" ")).toMatch(/REST API base/i);
  });

  it("accepts SUPABASE_DATABASE_URL when it genuinely holds a Postgres URI", async () => {
    // The variable is not banned — the SCHEME decides, not the name. If
    // somebody sets it to a real connection string, that works.
    const handler = await loadHandler({
      SUPABASE_DATABASE_URL: DATABASE_URL,
      JWT_SECRET,
      DEIDENT_SALT: "integration-test-salt",
    });
    const res = await handler(new Request(`${BASE}/api/health`), {});
    expect(res.status).toBe(200);
  });

  it("routes a GET through to Fastify and returns its status and body", async () => {
    const handler = await loadHandler({
      DATABASE_URL,
      JWT_SECRET,
      DEIDENT_SALT: "integration-test-salt",
    });

    const health = await handler(new Request(`${BASE}/api/health`), {});
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    // /ready actually queries Postgres — it is the check that tells a
    // deployment whether its database is reachable, as opposed to
    // whether the process started.
    const ready = await handler(new Request(`${BASE}/api/ready`), {});
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ ok: true });
  });

  it("returns 404 for an unknown route rather than the app shell", async () => {
    const handler = await loadHandler({ DATABASE_URL, JWT_SECRET, DEIDENT_SALT: "x" });
    const res = await handler(new Request(`${BASE}/api/nope`), {});
    expect(res.status).toBe(404);
  });

  it("carries a POST body through, and the response status back", async () => {
    // The translation this test exists for. A dropped body arrives as an
    // empty payload and every login fails validation; a dropped status
    // turns a 401 into a 200 with an error object, which a client will
    // happily treat as success.
    const handler = await loadHandler({
      DATABASE_URL,
      JWT_SECRET,
      DEIDENT_SALT: "integration-test-salt",
    });

    const org = await prisma().org.create({ data: { name: "Design Partner AOC" } });
    await prisma().user.create({
      data: {
        orgId: org.id,
        email: "safety@example.test",
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
        name: "Safety Manager",
        role: "SAFETY_MANAGER",
      },
    });

    const ok = await handler(
      new Request(`${BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "safety@example.test", password: PASSWORD }),
      }),
      {},
    );
    expect(ok.status).toBe(200);
    const session = await ok.json();
    expect(session.accessToken).toBeTruthy();

    const bad = await handler(
      new Request(`${BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "safety@example.test", password: "wrong-password-here" }),
      }),
      {},
    );
    expect(bad.status).toBe(401);

    // And the token issued through the function works on a protected
    // route THROUGH THE FUNCTION — headers survive both directions.
    const me = await handler(
      new Request(`${BASE}/api/v1/auth/me`, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      }),
      {},
    );
    expect(me.status).toBe(200);
    expect((await me.json()).orgId).toBe(org.id);
  });
});
