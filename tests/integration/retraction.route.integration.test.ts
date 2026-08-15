/* ============================================================
   WITHDRAWING A REPORT, THROUGH THE REAL SYNC ROUTE.

   The design note for this feature named four traps before a line of it
   was written, and each one is a defect this repository has already met
   somewhere else. These are those four, plus the property that makes
   the whole feature safe to have at all.

     1. THE REPLAY. The ordinary case this outbox exists for is a radio
        that drops AFTER the server commits. A retraction that errors on
        "already retracted" poisons an outbox on a device nobody can
        reach — every later item queues behind it for ever.

     2. THE ANONYMITY JOIN. The conflict receipt already got this wrong
        once, under a clientId carrying the anonymous report's own key
        as a prefix. A retraction receipt is the third place to get it
        wrong, so the assertion joins on a PREFIX rather than on
        equality — an exact-match test is what let the first one
        through.

     3. THE TOMBSTONE. Nothing is removed. A hard delete destroys
        evidence an auditor is entitled to and breaks the append-only
        chain that makes the rest of the record worth anything.

     4. WHOSE REPORT IT IS. report.create is held by every frontline
        reporter. Without narrowing, it would be a licence to retract
        the operator's whole queue.

   AND THE ONE THAT MAKES IT NOT AN ABUSE: the export still carries a
   retracted report. Every other read drops it, because those answer
   "what needs doing". If the export dropped it too, retraction would be
   a way to remove an inconvenient occurrence from what a regulator
   sees.
   ============================================================ */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;
let orgId: string;
let reporterId: string;
let otherReporterId: string;
let managerId: string;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

describe.skipIf(!hasDatabase)("withdrawing a report, through sync", () => {
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
    orgId = org.id;
    const mk = async (email: string, role: string) =>
      (
        await prisma().user.create({
          data: { orgId, email, passwordHash: "x", name: email, role: role as never },
        })
      ).id;
    reporterId = await mk("ramp@a.test", "FRONTLINE");
    otherReporterId = await mk("ramp2@a.test", "FRONTLINE");
    managerId = await mk("manager@a.test", "SAFETY_MANAGER");
  });

  const reporter = () => tokenFor(reporterId, orgId, "FRONTLINE");
  const otherReporter = () => tokenFor(otherReporterId, orgId, "FRONTLINE");
  const manager = () => tokenFor(managerId, orgId, "SAFETY_MANAGER");

  const mkReport = async (clientId: string, opts: { anonymous?: boolean } = {}) =>
    prisma().safetyReport.create({
      data: {
        orgId, clientId, type: "HAZARD" as never,
        title: "Bird activity on the threshold", narrative: "x",
        isAnonymous: Boolean(opts.anonymous),
        reporterId: opts.anonymous ? null : reporterId,
      },
    });

  /* clientId is a UUID by schema — it is generated on the handset and
     is the idempotency key, so the constraint is real rather than
     decorative. The first version of this file used CID.plain and every
     assertion failed on a 400, which is the schema doing its job. */
  const CID = {
    plain: "11111111-1111-4111-8111-111111111111",
    anon: "22222222-2222-4222-8222-222222222222",
  };

  const retract = (token: string, clientId: string, reason?: string) =>
    app.inject({
      method: "POST", url: "/api/v1/sync/batch",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        deviceId: "device-under-test-01",
        items: [
          {
            clientId, entityType: "safetyReport", op: "DELETE",
            payload: reason ? { reason } : {},
            clientUpdatedAt: new Date().toISOString(),
          },
        ],
      } as never,
    });

  it("records the retraction and leaves the row in place", async () => {
    await mkReport(CID.plain);
    const res = await retract(reporter(), CID.plain, "filed twice");
    expect(res.statusCode).toBe(200);
    expect(res.json().results[0].status).toBe("applied");

    /* TRAP 3. The row is still there — a tombstone, not a removal. */
    const row = await prisma().safetyReport.findFirstOrThrow({ where: { clientId: CID.plain } });
    expect(row.retractedAt).toBeTruthy();
    expect(row.retractedById).toBe(reporterId);
    expect(row.retractedReason).toBe("filed twice");
    expect(row.title).toBe("Bird activity on the threshold");
  });

  /* TRAP 1. A dropped response is the ordinary case, not the exception. */
  it("answers a replayed retraction without erroring", async () => {
    await mkReport(CID.plain);
    const first = await retract(reporter(), CID.plain);
    expect(first.json().results[0].status).toBe("applied");

    const replay = await retract(reporter(), CID.plain);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().results[0].status).toBe("duplicate");

    /* And the first retraction is the one that stands — a replay must
       not re-date it, or a device with a slow radio rewrites when the
       correction happened. */
    const row = await prisma().safetyReport.findFirstOrThrow({ where: { clientId: CID.plain } });
    const audits = await prisma().auditLog.count({
      where: { orgId, action: "report.retracted" },
    });
    expect(audits).toBe(1);
    expect(row.retractedById).toBe(reporterId);
  });

  /* TRAP 4. report.create is held by every reporter. */
  it("refuses to retract somebody else's report", async () => {
    await mkReport(CID.plain);
    const res = await retract(otherReporter(), CID.plain);
    expect(res.json().results[0].status).toBe("forbidden");

    const row = await prisma().safetyReport.findFirstOrThrow({ where: { clientId: CID.plain } });
    expect(row.retractedAt).toBeNull();
  });

  /* The safety office does not get to withdraw a reporter's report
     either. Closing it is their act and is recorded as one; withdrawal
     is the reporter saying it should not have been filed. */
  it("refuses to let the safety office withdraw somebody's report", async () => {
    await mkReport(CID.plain);
    const res = await retract(manager(), CID.plain);
    expect(res.json().results[0].status).toBe("forbidden");
  });

  /* TRAP 2, and the anonymity property. An anonymous report has no
     reporterId, so nothing can be matched to it — which means it cannot
     be retracted through this path AT ALL. That is the anonymity
     working, not a gap: accepting one would mean the server held
     something joining a device to an anonymous filing. */
  it("cannot retract an anonymous report, by anybody", async () => {
    await mkReport(CID.anon, { anonymous: true });
    const res = await retract(reporter(), CID.anon);
    expect(res.json().results[0].status).toBe("forbidden");

    const row = await prisma().safetyReport.findFirstOrThrow({ where: { clientId: CID.anon } });
    expect(row.retractedAt).toBeNull();
  });

  /* The join the conflict receipt was caught by, run against the
     retraction receipt. A PREFIX match, because exact equality is what
     let the first one through. */
  it("leaves no receipt that joins a device to an anonymous filing", async () => {
    await mkReport(CID.anon, { anonymous: true });
    await retract(reporter(), CID.anon);
    await mkReport(CID.plain);
    await retract(reporter(), CID.plain);

    const leaks = await prisma().$queryRawUnsafe<{ n: bigint }[]>(`
      SELECT COUNT(*)::bigint AS n
        FROM "SafetyReport" r
        JOIN "SyncReceipt"  s
          ON s."clientId" LIKE r."clientId" || ':%'
       WHERE r."isAnonymous" AND (s."userId" IS NOT NULL OR s."deviceId" IS NOT NULL)
    `);
    expect(Number(leaks[0]?.n ?? -1)).toBe(0);
  });

  describe("what then stops counting, and what does not", () => {
    const queue = () =>
      app.inject({
        method: "GET", url: "/api/v1/reports/queue",
        headers: { authorization: `Bearer ${manager()}` },
      });

    it("leaves the safety office's queue", async () => {
      await mkReport(CID.plain);
      expect((await queue()).json().reports).toHaveLength(1);

      await retract(reporter(), CID.plain);
      const after = await queue();
      expect(after.json().reports).toHaveLength(0);
    });

    /* THE PROPERTY THAT MAKES THIS NOT AN ABUSE. If an export hid a
       withdrawn report, retraction would be a way to remove an
       inconvenient occurrence from what a regulator reads. */
    it("still appears in the export an inspector reads", async () => {
      await mkReport(CID.plain);
      await retract(reporter(), CID.plain, "filed twice");

      const res = await app.inject({
        method: "GET", url: "/api/v1/export",
        headers: { authorization: `Bearer ${manager()}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.stringify(res.json());
      expect(body).toContain("Bird activity on the threshold");
      expect(body).toContain("filed twice");
    });

    /* The audit chain is the other half of that: the retraction is an
       event on the record, not an erasure of one. */
    it("appends to the audit chain without carrying the reason into it", async () => {
      await mkReport(CID.plain);
      await retract(reporter(), CID.plain, "wrong aircraft registration");

      const entry = await prisma().auditLog.findFirstOrThrow({
        where: { orgId, action: "report.retracted" },
        orderBy: { seq: "desc" },
      });
      expect(entry.userId).toBe(reporterId);
      expect(JSON.stringify(entry.detail)).not.toContain("wrong aircraft");
      expect(JSON.stringify(entry.detail)).toContain("hasReason");
    });
  });
});
