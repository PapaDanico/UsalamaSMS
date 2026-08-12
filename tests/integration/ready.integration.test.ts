// =====================================================================
// The readiness probe, against a real database.
//
// The unit test keeps the table LIST honest. This asserts the probe
// actually goes red when a table is missing — which is the behaviour
// that was absent when #20's code met a database without its migration,
// and `/api/ready` answered {"ok":true} while /sms was unusable.
//
// A real relation is made to disappear rather than the query being
// stubbed — stubbing would test the mock, and the failure mode was a
// genuinely absent table. It is RENAMED rather than dropped, for a
// reason worth recording: DROP does not roll back `_prisma_migrations`,
// so re-running the migration to repair it is a no-op and every later
// test inherits a broken schema. A rename is exactly as invisible to
// `to_regclass` and is reversible in one statement.
// =====================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

process.env["JWT_SECRET"] = "integration-test-secret-not-a-real-one";
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;

describe.skipIf(!hasDatabase)("the readiness probe", () => {
  beforeAll(async () => {
    migrate();
    const { build } = await import("../../apps/api/src/server");
    app = await build();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await disconnect();
  });

  const ready = () => app.inject({ method: "GET", url: "/api/ready" });

  it("is ready when the schema is whole", async () => {
    await reset();
    const res = await ready();
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("REFUSES READY WHEN A TABLE THE CODE QUERIES IS ABSENT", async () => {
    await reset();
    // The exact shape of the outage: code deployed, migration not run.
    await prisma().$executeRawUnsafe('ALTER TABLE "SafetyPolicy" RENAME TO "SafetyPolicy__hidden"');
    try {
      const res = await ready();
      expect(res.statusCode, "a database missing a table reported itself ready").toBe(503);
      const body = res.json();
      expect(body.ok).toBe(false);
      expect(body.reason).toBe("schema_behind_code");
      // Named, because "not ready" without the reason is a second thing
      // to go and find out at the moment somebody least wants to.
      expect(body.missingTables).toContain("SafetyPolicy");
      expect(body.detail).toMatch(/migration/i);
    } finally {
      // Put it back, or every test after this one inherits the damage —
      // the shared-state trap this suite has already been bitten by
      // once. The test below exists to prove this line ran.
      await prisma().$executeRawUnsafe('ALTER TABLE "SafetyPolicy__hidden" RENAME TO "SafetyPolicy"');
    }
  });

  it("is ready again once the table is back", async () => {
    await reset();
    const res = await ready();
    expect(res.statusCode, "the drop was not repaired").toBe(200);
  });
});
