// =====================================================================
// UsalamaSMS API — the Fastify instance.
//
// This file did not exist until the pre-flight audit went looking for
// it. Routes, auth helpers, the audit chain and the de-identification
// pipeline were all written and none of them were reachable: there was
// no server to mount them on. A repository of correct modules that
// cannot be started is not a system, and the gates could not have told
// anyone, because a module nothing imports still typechecks and still
// passes its unit tests.
// =====================================================================
import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import { ENV, prisma, verifyAuditChain, authenticate, requirePermission } from "./core";
import { syncRoutes } from "./routes.sync";
import { authRoutes } from "./routes.auth";

export async function build(): Promise<FastifyInstance> {
  const app = Fastify({
    // Trust the proxy for client IPs — rate limiting is per-IP and every
    // deployment of this sits behind one.
    trustProxy: true,
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
      // ==============================================================
      // REDACTION IS NOT OPTIONAL HERE.
      //
      // The whole product rests on a promise that a safety narrative
      // reaches the safety office and nobody else. A request logger that
      // prints bodies would write those narratives — and the identity of
      // anonymous reporters — into a log aggregator with a completely
      // different access model, where they are searchable by anyone with
      // operations access and retained on somebody else's schedule.
      //
      // This is the same failure as the sync receipt: not a leak in the
      // feature, a leak in the plumbing around it.
      // ==============================================================
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body.narrative",
          "req.body.password",
          "req.body.items",
          "res.headers['set-cookie']",
        ],
        censor: "[REDACTED]",
      },
      serializers: {
        req(req) {
          // Explicitly enumerated. A default serializer that grows a
          // field in a future Fastify release must not silently start
          // logging it.
          return { method: req.method, url: req.url, id: req.id };
        },
      },
    },
  });

  // Body limit sized to the schema: a narrative is capped at 20,000
  // characters and a sync batch at 100 items. 1 MB covers the largest
  // legitimate batch with room, and refuses anything built to exhaust
  // memory before Zod ever sees it.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string", bodyLimit: 1_048_576 },
    (_req, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch {
        done(Object.assign(new Error("invalid_json"), { statusCode: 400 }), undefined);
      }
    },
  );

  app.setErrorHandler((err: FastifyError, req, reply) => {
    // Log the detail, return none of it. An error message is the single
    // most reliable source of schema and infrastructure information an
    // attacker gets for free, and here it can also contain narrative
    // fragments from a failed insert.
    req.log.error({ err: { message: err.message, code: err.code } }, "request failed");
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    reply.code(status).send({ error: status === 500 ? "internal_error" : err.message });
  });

  // ------------------------------ Health ------------------------------
  // Unauthenticated and deliberately uninformative: liveness only. A
  // health endpoint that reports database status, versions or migration
  // state is a reconnaissance endpoint with a friendly name.
  //
  // REGISTERED AT BOTH PATHS, because the app is served two ways and
  // each convention is right for one of them. On a container host the
  // process owns the origin and /health is what every orchestrator
  // probes. Behind the Netlify Function the app is mounted at /api/*,
  // so a request to /health never reaches Fastify at all — and until
  // tests/integration/function.integration caught it, both health
  // endpoints were unreachable in the deployment shape this repository
  // actually ships, while docs/06-DEPLOYMENT.md confidently told the
  // reader to curl /api/health.
  //
  // Two routes, one handler each, no ambiguity about which is canonical:
  // whichever one your deployment can reach.
  for (const prefix of ["", "/api"]) {
    app.get(`${prefix}/health`, async () => ({ ok: true }));

    app.get(`${prefix}/ready`, async (_req, reply) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return { ok: true };
      } catch {
        return reply.code(503).send({ ok: false });
      }
    });
  }

  // ------------------------------ Routes ------------------------------
  await app.register(authRoutes);
  await app.register(syncRoutes);

  // Regulator oversight: verify an org's audit chain by content.
  //
  // NOTE the deliberate asymmetry — a REGULATOR_INSPECTOR may verify the
  // chain and read the audit log, and may not read narratives. Oversight
  // is a question about whether the operator's own record is intact, not
  // a licence to read what frontline staff wrote in confidence.
  app.get<{ Params: { orgId: string } }>(
    "/api/v1/orgs/:orgId/audit/verify",
    { preHandler: [authenticate, requirePermission("regulator.oversight")] },
    async (req, reply) => {
      // Scoped to the caller's own tenancy unless they are an inspector
      // assigned to it. Until inspector-to-org assignment exists, an
      // inspector may only verify the org on their own token — which is
      // restrictive and is the safe direction to be wrong in.
      if (req.params.orgId !== req.auth!.org) {
        return reply.code(403).send({ error: "forbidden" });
      }
      return verifyAuditChain(req.params.orgId);
    },
  );

  return app;
}

// ------------------------------- Start --------------------------------
// Guarded so importing this module in a test does not bind a port.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*[/\\]/, ""))) {
  const port = Number(process.env["PORT"] ?? 8080);
  build()
    .then((app) =>
      app.listen({ port, host: "0.0.0.0" }).then(() => {
        // ENV is referenced so the fail-fast env validation in core.ts
        // runs at startup rather than on the first request that needs it.
        app.log.info({ port, ttl: ENV.ACCESS_TTL }, "usalamasms api listening");
      }),
    )
    .catch((err) => {
      console.error("FATAL: could not start", err);
      process.exit(1);
    });
}
