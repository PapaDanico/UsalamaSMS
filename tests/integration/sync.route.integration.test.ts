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

  it("SURVIVES A RETRIED CONFLICT — a lost response must not poison the outbox", async () => {
    // The conflict receipt's key is deterministic: clientId plus the
    // server's current updatedAt. So when the response to a batch is
    // lost — the radio dropping after the server commits, which is the
    // ordinary case this outbox exists for — the client retries, the
    // server's updatedAt has not moved, and the receipt insert violates
    // @@unique([orgId, clientId]).
    //
    // Uncaught, that threw out of the handler: 500 for the WHOLE batch,
    // client backs off every item, retries, hits it again. A device
    // nobody can reach, stuck forever, because one packet was dropped.
    // SAFETY_MANAGER, because safetyReport:UPDATE requires
    // report.triage and FRONTLINE does not hold it — which the
    // per-item permission check correctly refuses, as a sibling test
    // asserts.
    const token = tokenFor(frontlineId, orgId, "SAFETY_MANAGER");
    await batch([reportItem(20)], token);

    const conflicting = {
      clientId: uuid(20),
      entityType: "safetyReport",
      op: "UPDATE",
      clientUpdatedAt: new Date().toISOString(),
      // A baseVersion the server will not agree with.
      baseVersion: new Date(0).toISOString(),
      payload: { title: "Edited on the device while offline" },
    };

    const first = await batch([conflicting], token);
    expect(first.statusCode).toBe(200);
    // Not "duplicate": the CREATE's receipt shares this clientId, and an
    // idempotency lookup that ignored `op` matched it — which the client
    // reads as "already have it" and answers by DELETING the edit.
    expect(first.json().results[0].status).toBe("conflict");

    // THE RETRY. Same item, same server state, same receipt key.
    const retry = await batch([conflicting], token);
    expect(retry.statusCode, "a retried conflict took the whole batch down with a 500").toBe(200);
    expect(retry.json().results[0].status).toBe("conflict");

    // And a healthy item in the same retried batch still applies, which
    // is what "not poisoned" actually means to the device.
    const mixed = await batch([conflicting, reportItem(21)], token);
    expect(mixed.statusCode).toBe(200);
    const results = mixed.json().results;
    expect(results.find((r: { clientId: string }) => r.clientId === uuid(21)).status).toBe("applied");
  });

  it("A CONFLICT ON AN ANONYMOUS REPORT NAMES NOBODY", async () => {
    // Found by audit, and it had been shipping. The CREATE receipt is
    // careful — for an anonymous report it stores a keyed device hash
    // and nulls userId and deviceId. The CONFLICT receipt wrote both
    // unconditionally, under a clientId containing the anonymous
    // report's own key as a prefix. One LIKE join named the reporter.
    //
    // The confidentiality suite's guard could not see it: that join is
    // on exact equality, and the suffix defeats it. So this test lives
    // here, on the real route, and joins the way an attacker would.
    const token = tokenFor(frontlineId, orgId, "SAFETY_MANAGER");
    await batch([reportItem(30, { isAnonymous: true })], token);

    const conflicting = {
      clientId: uuid(30),
      entityType: "safetyReport",
      op: "UPDATE",
      clientUpdatedAt: new Date().toISOString(),
      baseVersion: new Date(0).toISOString(),
      payload: { title: "Edited on the device while offline" },
    };
    const res = await batch([conflicting], token);
    expect(res.json().results[0].status).toBe("conflict");

    const leaked = await prisma().$queryRawUnsafe<Array<{ userId: string | null }>>(
      `SELECT s."userId", s."deviceId"
         FROM "SafetyReport" r
         JOIN "SyncReceipt"  s ON s."clientId" LIKE r."clientId" || '%'
        WHERE r."isAnonymous" = true
          AND (s."userId" IS NOT NULL OR s."deviceId" IS NOT NULL)`,
    );
    expect(
      leaked,
      "a receipt keyed on an anonymous report's clientId carries the reporter or their device",
    ).toHaveLength(0);

    // And the conflict is still RECORDED — the fix must not buy
    // anonymity by dropping the row the retry path depends on.
    const receipt = await prisma().syncReceipt.findFirstOrThrow({
      where: { orgId, conflict: true },
    });
    expect(receipt.resolution).toBe("server_wins");
    expect(receipt.deviceHash, "the device is still recognisable as a duplicate").not.toBeNull();
  });

  it("still records the reporter on a conflict for a NAMED report", async () => {
    // The inverse, so the fix cannot be "null everything and pass".
    const token = tokenFor(frontlineId, orgId, "SAFETY_MANAGER");
    await batch([reportItem(31)], token);
    await batch(
      [{
        clientId: uuid(31),
        entityType: "safetyReport",
        op: "UPDATE",
        clientUpdatedAt: new Date().toISOString(),
        baseVersion: new Date(0).toISOString(),
        payload: { title: "Edited" },
      }],
      token,
    );
    const receipt = await prisma().syncReceipt.findFirstOrThrow({
      where: { orgId, conflict: true },
    });
    expect(receipt.userId).toBe(frontlineId);
    expect(receipt.deviceId).not.toBeNull();
  });

  it("A COLLIDING REPORT ID FROM ANOTHER TENANT IS A DUPLICATE, NOT A 500", async () => {
    // clientId is generated on the device. It was globally unique, so
    // one operator's value colliding with another's raised an uncaught
    // P2002 inside the batch loop and returned 500 for the WHOLE batch —
    // the client backed off all hundred items and retried into the same
    // wall forever. The identical fix was applied to SyncReceipt long
    // ago, with a comment explaining why; SafetyReport was missed.
    //
    // It was also a cross-tenant existence oracle: 500 versus 200
    // answered "does this id exist in another operator's data?"
    const otherUser = await prisma().user.create({
      data: {
        orgId: otherOrgId, email: `rival+${otherOrgId}@example.test`,
        passwordHash: "unused", name: "Rival Ramp", role: "FRONTLINE",
      },
    });
    await batch([reportItem(40)], tokenFor(frontlineId, orgId, "FRONTLINE"));

    const res = await batch(
      [reportItem(40), reportItem(41)],
      tokenFor(otherUser.id, otherOrgId, "FRONTLINE"),
    );
    expect(res.statusCode, "a cross-tenant id collision took the whole batch down").toBe(200);
    const results = res.json().results;
    expect(results.find((r: { clientId: string }) => r.clientId === uuid(40)).status).toBe("applied");
    // And the healthy item in the same batch still applied, which is what
    // "not poisoned" means to the device.
    expect(results.find((r: { clientId: string }) => r.clientId === uuid(41)).status).toBe("applied");

    // Both operators now hold their own report under the same clientId,
    // and neither can see the other's.
    const mine = await prisma().safetyReport.findMany({ where: { clientId: uuid(40) } });
    expect(mine).toHaveLength(2);
    expect(new Set(mine.map((r) => r.orgId))).toEqual(new Set([orgId, otherOrgId]));
  });

  it("treats a repeated CREATE as a duplicate rather than a 500", async () => {
    // The same defect from the other direction: two tabs on one tablet
    // regaining signal together both pass the receipt lookup, which runs
    // outside the transaction, and both reach the insert.
    const token = tokenFor(frontlineId, orgId, "FRONTLINE");
    await batch([reportItem(42)], token);
    await prisma().syncReceipt.deleteMany({ where: { clientId: uuid(42) } });

    const res = await batch([reportItem(42)], token);
    expect(res.statusCode).toBe(200);
    expect(res.json().results[0].status).toBe("duplicate");
    expect(await prisma().safetyReport.count({ where: { orgId, clientId: uuid(42) } })).toBe(1);
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
