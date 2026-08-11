// =====================================================================
// THE PHASE 1 GATE, end to end.
//
// docs/02-STRATEGY.md sets the gate as: "a frontline user files a report
// offline AND IT ARRIVES." The smoke suite proves the first half in a
// real browser. This proves the second half through the real Fastify
// instance, the real route, the real middleware and a real Postgres —
// no replicated logic, no mocks.
//
// The other integration files re-create the write path so they can
// isolate a property. That is useful and it is not the same claim: a
// re-created path proves the DATABASE behaves, not that the ROUTE does.
// Everything here goes through app.inject() and a genuine JWT.
// =====================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

const JWT_SECRET = "integration-test-secret-not-a-real-one";

// core.ts validates these at import time and calls process.exit(1) if
// they are missing — deliberately, so a misconfigured deploy fails at
// boot rather than on the first VCR. Set before the import below.
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
// The server logs every request. Useful in production, and in a test
// run it buries the assertion output under a wall of JSON.
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;
let orgId: string;
let otherOrgId: string;
let frontlineId: string;

function tokenFor(sub: string, org: string, role: string): string {
  return jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "15m",
    issuer: "usalamasms",
  });
}

const uuid = (n: number): string =>
  `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

describe.skipIf(!hasDatabase)("POST /api/v1/sync/batch — a report arrives", () => {
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

  beforeEach(async () => {
    await reset();
    const org = await prisma().org.create({ data: { name: "Design Partner AOC" } });
    const other = await prisma().org.create({ data: { name: "Competitor" } });
    const user = await prisma().user.create({
      data: {
        orgId: org.id,
        email: `ramp+${org.id}@example.test`,
        passwordHash: "unused",
        name: "Ramp Agent",
        role: "FRONTLINE",
      },
    });
    orgId = org.id;
    otherOrgId = other.id;
    frontlineId = user.id;
  });

  function batch(items: unknown[], token: string) {
    return app.inject({
      method: "POST",
      url: "/api/v1/sync/batch",
      headers: { authorization: `Bearer ${token}` },
      payload: { deviceId: "device-1234567890", items },
    });
  }

  const reportItem = (n: number, overrides: Record<string, unknown> = {}) => ({
    clientId: uuid(n),
    entityType: "safetyReport",
    op: "CREATE",
    clientUpdatedAt: new Date().toISOString(),
    payload: {
      clientId: uuid(n),
      type: "HAZARD",
      title: "Bird activity on short final",
      narrative: "A flock crossed the approach path below 300 ft AGL for a third morning.",
      awareAt: new Date().toISOString(),
      jurisdiction: "KE",
      hrcTags: ["BWI"],
      isAnonymous: false,
      ...overrides,
    },
  });

  it("ARRIVES — a queued offline report reaches the database", async () => {
    const res = await batch([reportItem(1)], tokenFor(frontlineId, orgId, "FRONTLINE"));

    expect(res.statusCode).toBe(200);
    expect(res.json().results).toEqual([
      expect.objectContaining({ clientId: uuid(1), status: "applied" }),
    ]);

    const stored = await prisma().safetyReport.findFirstOrThrow({ where: { clientId: uuid(1) } });
    expect(stored.orgId).toBe(orgId);
    expect(stored.title).toBe("Bird activity on short final");
    expect(stored.hrcTags).toEqual(["BWI"]);
    expect(stored.reporterId).toBe(frontlineId);
    expect(stored.awareAt).not.toBeNull();
  });

  it("writes an audit entry that verifies", async () => {
    await batch([reportItem(2)], tokenFor(frontlineId, orgId, "FRONTLINE"));
    const audit = await prisma().auditLog.findFirstOrThrow({ where: { orgId } });
    expect(audit.action).toBe("report.create.sync");
    expect(audit.prevHash).toBe("0".repeat(64));
    expect(audit.hash).toHaveLength(64);
  });

  it("is idempotent — the same clientId twice applies once", async () => {
    const token = tokenFor(frontlineId, orgId, "FRONTLINE");
    const first = await batch([reportItem(3)], token);
    const second = await batch([reportItem(3)], token);

    expect(first.json().results[0].status).toBe("applied");
    expect(second.json().results[0].status).toBe("duplicate");

    // The device retries the whole batch after a dropped response; one
    // occurrence must not become two rows in the safety record.
    expect(await prisma().safetyReport.count({ where: { clientId: uuid(3) } })).toBe(1);
  });

  it("STORES NO IDENTIFIER for an anonymous report, through the real route", async () => {
    await batch(
      [reportItem(4, { isAnonymous: true, type: "VCR" })],
      tokenFor(frontlineId, orgId, "FRONTLINE"),
    );

    const report = await prisma().safetyReport.findFirstOrThrow({ where: { clientId: uuid(4) } });
    expect(report.reporterId).toBeNull();

    const receipt = await prisma().syncReceipt.findFirstOrThrow({ where: { clientId: uuid(4) } });
    expect(receipt.userId).toBeNull();
    expect(receipt.deviceId).toBeNull();

    // The audit entry records the action without the actor.
    const audit = await prisma().auditLog.findFirstOrThrow({ where: { orgId } });
    expect(audit.userId).toBeNull();

    // And the join still returns nothing.
    const leaked = await prisma().$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM "SafetyReport" r
         JOIN "SyncReceipt" s ON s."clientId" = r."clientId"
        WHERE r."isAnonymous" = true AND s."userId" IS NOT NULL`,
    );
    expect(leaked).toHaveLength(0);
  });

  it("does not store a regulatory deadline — charter rule 6", async () => {
    await batch(
      [reportItem(5, { type: "MOR", occurredAt: new Date().toISOString() })],
      tokenFor(frontlineId, orgId, "FRONTLINE"),
    );
    const stored = await prisma().safetyReport.findFirstOrThrow({ where: { clientId: uuid(5) } });
    expect(Object.keys(stored)).not.toContain("regulatorDeadline");
    // The inputs the deadline is computed FROM are stored instead.
    expect(stored.awareAt).not.toBeNull();
    expect(stored.jurisdiction).toBe("KE");
  });

  it("rejects an unauthenticated batch", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sync/batch",
      payload: { deviceId: "device-1234567890", items: [reportItem(6)] },
    });
    expect(res.statusCode).toBe(401);
    expect(await prisma().safetyReport.count()).toBe(0);
  });

  it("refuses an entity the caller's role cannot create", async () => {
    // FRONTLINE holds report.create and not hazard.manage. The route
    // used to authorise the WHOLE batch against report.create.
    const res = await batch(
      [
        {
          clientId: uuid(7),
          entityType: "hazard",
          op: "CREATE",
          clientUpdatedAt: new Date().toISOString(),
          payload: {},
        },
      ],
      tokenFor(frontlineId, orgId, "FRONTLINE"),
    );
    expect(res.json().results[0].status).toBe("forbidden");
  });

  it("writes into the caller's tenancy and no other", async () => {
    await batch([reportItem(8)], tokenFor(frontlineId, orgId, "FRONTLINE"));
    expect(await prisma().safetyReport.count({ where: { orgId: otherOrgId } })).toBe(0);
    expect(await prisma().safetyReport.count({ where: { orgId } })).toBe(1);
  });

  it("returns exactly one result per item", async () => {
    // The client matches results back by clientId and leaves anything
    // unmatched queued forever — a short response is a permanently
    // stuck report on a device nobody can reach.
    const items = [reportItem(10), reportItem(11), reportItem(12)];
    const res = await batch(items, tokenFor(frontlineId, orgId, "FRONTLINE"));
    expect(res.json().results).toHaveLength(items.length);
    expect(res.json().results.map((r: { clientId: string }) => r.clientId).sort()).toEqual(
      items.map((i) => i.clientId).sort(),
    );
  });

  it("rejects a malformed payload without taking the batch down", async () => {
    const res = await batch(
      [reportItem(13, { narrative: "too short" }), reportItem(14)],
      tokenFor(frontlineId, orgId, "FRONTLINE"),
    );
    const results = res.json().results;
    expect(results.find((r: { clientId: string }) => r.clientId === uuid(13)).status).toBe("rejected");
    // The valid item in the same batch still applies. One bad report
    // must not strand the other twenty-four on the device.
    expect(results.find((r: { clientId: string }) => r.clientId === uuid(14)).status).toBe("applied");
  });
});
