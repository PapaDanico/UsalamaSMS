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
import rateLimit from "@fastify/rate-limit";
import {
  ENV, prisma, verifyAuditChain, authenticate, requirePermission,
  deIdentifyVcr, ResidualIdentifiersError,
} from "./core";
import { syncRoutes } from "./routes.sync";
import { authRoutes } from "./routes.auth";
import { smsRoutes } from "./routes.sms";
import { spiRoutes } from "./routes.spi";
import { registerRoutes } from "./routes.register";
import { changeRoutes } from "./routes.change";
import { reportRoutes } from "./routes.reports";
import { configRoutes } from "./routes.config";
import { pictureRoutes } from "./routes.picture";
import { actionRoutes } from "./routes.actions";
import { erpRoutes } from "./routes.erp";
import { exportRoutes } from "./routes.export";
import { rateLimitKey } from "./rate-limit-key";
import { missingTables } from "./schema-guard";

export async function build(): Promise<FastifyInstance> {
  const app = Fastify({
    // ==================================================================
    // ONE HOP, not `true`. The difference is the whole rate limit.
    //
    // `trustProxy: true` makes Fastify resolve req.ip as the LEFTMOST
    // X-Forwarded-For entry, which is the one the caller writes. The
    // comment that used to sit here asserted the opposite — that a
    // caller could not forge their way into a fresh bucket. Booting a
    // Fastify instance with that exact configuration says otherwise:
    //
    //   trustProxy: true   XFF "FORGED, 9.9.9.9, 8.8.8.8" -> FORGED
    //   trustProxy: 1      XFF "FORGED, 9.9.9.9, 8.8.8.8" -> 8.8.8.8
    //
    // A number trusts that many hops from the right, so what survives is
    // what the immediate proxy appended rather than what arrived with
    // the request. One hop, because there is one proxy.
    //
    // This alone is not sufficient — a caller sending a SINGLE forged
    // entry is still the rightmost — which is why rateLimitKey() below
    // prefers the platform's own header over the IP entirely. Both are
    // here on purpose: the header is the control, the hop count is what
    // stops the fallback being free to forge.
    // ==================================================================
    trustProxy: 1,
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

  // =====================================================================
  // RATE LIMITING — the plugin that makes three route configs real.
  //
  // routes.auth.ts and routes.sync.ts have carried `config.rateLimit`
  // since they were written, with a comment above the login one saying
  // that login is the one endpoint worth brute-forcing. All three were
  // INERT: Fastify ignores unknown keys in a route's `config` object, so
  // a limit declared without this plugin registered is a comment with
  // punctuation. Login accepted unlimited attempts.
  //
  // Nothing could have caught it. The declaration reads exactly like an
  // enforced limit, the reasoning above it is correct, and every gate
  // passed. That is charter rule 11 from an angle it did not anticipate:
  // not a check that stopped checking, a check that never started.
  // scripts/check-claims.mjs now fails if a route declares a limit this
  // file does not enable.
  //
  // GLOBAL FALSE, deliberately. Only the routes that opt in are limited,
  // so /health stays free for orchestrator probes and a future read
  // endpoint does not inherit a login-shaped limit by accident.
  // =====================================================================
  await app.register(rateLimit, {
    global: false,
    // Per-IP. `trustProxy` above means this is the client address from
    // X-Forwarded-For rather than the edge's — behind Netlify the header
    // is set by the platform, so a caller cannot forge their way into a
    // fresh bucket by sending their own.
    keyGenerator: (req) => rateLimitKey(req.headers, req.ip),
    // In-memory, which means PER INSTANCE. On a container host that is
    // the whole limit. On Lambda each warm instance keeps its own
    // counter, so the effective limit is the configured one times the
    // concurrency — a real weakening, and the honest fix is a shared
    // store (Redis) rather than a larger number here. Stated because a
    // limit whose true value is unknown to its reader is barely a limit.
    // Even so: 10-per-instance beats unbounded by the entire distance
    // between a control and no control.
    // `statusCode` is carried on the object deliberately. The plugin
    // hands whatever this returns to setErrorHandler below, which decides
    // the status from `err.statusCode` — without it the throttle arrived
    // as a 500, telling a client to retry a request the server had in
    // fact refused on purpose. Found by asserting 429 and getting 500.
    errorResponseBuilder: () => ({ statusCode: 429, error: "too_many_requests" }),
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    // Log the detail, return none of it. An error message is the single
    // most reliable source of schema and infrastructure information an
    // attacker gets for free, and here it can also contain narrative
    // fragments from a failed insert.
    req.log.error({ err: { message: err.message, code: err.code } }, "request failed");

    // A throttled request is not a failure of this service and must not
    // be logged or answered as one. It also must not be reshaped: the
    // limiter already built the body, and rewriting it here to
    // `err.message` produced "Rate limit exceeded, retry in 15 minutes"
    // — a sentence that tells a brute-forcer exactly how long to wait.
    const thrown = err as FastifyError & { error?: string };
    if (err.statusCode === 429) {
      reply.code(429).send({ error: thrown.error ?? "too_many_requests" });
      return;
    }

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

    /* READY MEANS READY. `SELECT 1` proves a connection and nothing
       else — which is why this endpoint answered {"ok":true} for the
       whole window in which #20's code was deployed against a database
       that had never had its migration applied. See schema-guard.ts.

       The schema check runs on every probe rather than being cached at
       boot: on a serverless function the process is short-lived and a
       cache would mostly measure cold starts, and a migration applied
       while instances are warm should turn this green without a
       redeploy. It is one query. */
    app.get(`${prefix}/ready`, async (_req, reply) => {
      try {
        const missing = await missingTables(prisma);
        if (missing.length) {
          return reply.code(503).send({
            ok: false,
            reason: "schema_behind_code",
            missingTables: missing,
            detail:
              "The database is reachable but does not have every table this build " +
              "queries. Run the outstanding Prisma migration — deploying code does " +
              "not apply one.",
          });
        }
        return { ok: true };
      } catch {
        return reply.code(503).send({ ok: false, reason: "unreachable" });
      }
    });
  }

  // ------------------------------ Routes ------------------------------
  await app.register(authRoutes);
  await app.register(syncRoutes);
  await app.register(smsRoutes);
  await app.register(spiRoutes);
  await app.register(registerRoutes);
  await app.register(changeRoutes);
  await app.register(reportRoutes);
  await app.register(configRoutes);
  await app.register(pictureRoutes);
  await app.register(actionRoutes);
  await app.register(erpRoutes);
  await app.register(exportRoutes);

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

  // =====================================================================
  // De-identify a voluntary confidential report.
  //
  // THIS PIPELINE HAD NO ROUTE. deIdentifyVcr, its reviewer-friction
  // design, the ResidualIdentifiersError and the in-transaction audit
  // append were all written, all correct, and reachable by nothing but
  // their own tests. The same defect as "the routes had no server",
  // one layer up, and equally invisible: an exported function that
  // nothing imports still typechecks and still passes every unit test.
  //
  // The operation is IRREVERSIBLE. It nulls reporterId and replaces the
  // narrative with the scrubbed copy — deliberately, because encryption
  // that can be undone is a promise that can be broken by whoever holds
  // the key. So the route is POST, it is tenant-scoped, and the audit
  // entry naming the reviewer commits in the same transaction as the
  // change.
  // =====================================================================
  app.post<{ Params: { id: string }; Body: { acceptResidual?: boolean } }>(
    "/api/v1/reports/:id/deidentify",
    {
      preHandler: [authenticate, requirePermission("report.deidentify.review")],
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      // Scoped BEFORE the pipeline runs, not inside it. deIdentifyVcr
      // takes a report id and would happily de-identify another
      // operator's report — it is a pure operation and tenant scoping is
      // the route's job, exactly as it is for every other read here.
      const report = await prisma.safetyReport.findFirst({
        where: { id: req.params.id, orgId: req.auth!.org },
        select: { id: true },
      });
      // 404 rather than 403 for a report in another tenancy: the two
      // answers differ only for someone probing ids that are not theirs,
      // and the distinction tells them which ones exist.
      if (!report) return reply.code(404).send({ error: "not_found" });

      try {
        const { residual } = await deIdentifyVcr(req.params.id, req.auth!.sub, {
          reviewerAcceptedResidual: req.body?.acceptResidual === true,
        });
        return reply.send({ ok: true, residual });
      } catch (err) {
        if (err instanceof ResidualIdentifiersError) {
          // 409, not 400. The request is well-formed and the server is
          // working; the operation is BLOCKED pending a human decision,
          // and the spans it could not remove come back so the reviewer
          // can look at them and decide.
          //
          // These spans are fragments of a narrative, so this response
          // is exactly as confidential as the report — which is why the
          // route sits behind report.deidentify.review and not behind
          // any triage-level permission.
          return reply.code(409).send({
            error: "residual_identifiers",
            residual: err.residual,
            hint: "A named reviewer must confirm before distribution. Re-send with acceptResidual: true.",
          });
        }
        throw err;
      }
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
