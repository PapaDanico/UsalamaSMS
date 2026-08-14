/* ============================================================
   RECORDING THAT THE AUTHORITY WAS TOLD, through the real route.

   The deadline engine is the most carefully unit-tested thing in this
   repository and, until this route existed, it could not be called from
   anywhere in the API: `deadlineStatus` takes a `submittedAt` meaning
   "the duty was discharged" and no column held one. So a notified
   occurrence and a forgotten one were the same row, and the countdown
   on the triage queue counted down for ever.

   What only a database can answer, and what these exercise:

     · THE REFUSALS ACTUALLY FIRE against a real row — a future date, a
       date before the occurrence, a second notification over the first,
       and a report type that owes nobody anything. Each is a way the
       record could be made to say a deadline was met when it was not;
     · THE AUDIT CHAIN EXTENDS, and does so WITHOUT the authority's
       reference in it;
     · TENANCY holds: another operator's report is not found rather than
       forbidden, because "forbidden" confirms the id exists.
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
let otherOrgId: string;
let managerId: string;
let frontlineId: string;
let morId: string;
let hazardId: string;
let otherMorId: string;

const OCCURRED = new Date("2026-08-10T06:00:00.000Z");

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

describe.skipIf(!hasDatabase)("POST /api/v1/reports/:id/notified", () => {
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
    orgId = org.id;
    otherOrgId = other.id;

    const mk = async (email: string, role: string, oid: string) =>
      (
        await prisma().user.create({
          data: { orgId: oid, email, passwordHash: "x", name: email, role: role as never },
        })
      ).id;
    managerId = await mk("manager@a.test", "SAFETY_MANAGER", orgId);
    frontlineId = await mk("ramp@a.test", "FRONTLINE", orgId);

    const mkReport = async (oid: string, clientId: string, type: string) =>
      (
        await prisma().safetyReport.create({
          data: {
            orgId: oid, clientId, type: type as never,
            title: "Runway excursion on landing roll",
            narrative: "x",
            occurredAt: type === "MOR" ? OCCURRED : null,
            awareAt: type === "MOR" ? OCCURRED : null,
          },
        })
      ).id;
    morId = await mkReport(orgId, "c-1", "MOR");
    hazardId = await mkReport(orgId, "c-2", "HAZARD");
    otherMorId = await mkReport(otherOrgId, "c-3", "MOR");
  });

  const manager = () => tokenFor(managerId, orgId, "SAFETY_MANAGER");
  const frontline = () => tokenFor(frontlineId, orgId, "FRONTLINE");

  const notify = (token: string, id: string, body: unknown = {}) =>
    app.inject({
      method: "POST", url: `/api/v1/reports/${id}/notified`,
      headers: { authorization: `Bearer ${token}` }, payload: body as never,
    });

  it("records the notification, defaulting the time to receipt", async () => {
    const res = await notify(manager(), morId);
    expect(res.statusCode).toBe(200);
    expect(res.json().reportedToAuthorityAt).toBeTruthy();

    const row = await prisma().safetyReport.findFirstOrThrow({ where: { id: morId } });
    expect(row.reportedToAuthorityById).toBe(managerId);
  });

  it("takes the time the call was actually made, when it is given", async () => {
    const at = "2026-08-10T09:30:00.000Z";
    const res = await notify(manager(), morId, { at, reference: "KCAA/OCC/2026/114" });
    expect(res.statusCode).toBe(200);
    expect(res.json().reportedToAuthorityAt).toBe(at);
    expect(res.json().authorityReference).toBe("KCAA/OCC/2026/114");
  });

  /* THE ENTRY THAT WOULD MAKE AN OVERDUE REPORT LOOK COMPLIANT. */
  it("refuses a notification dated in the future", async () => {
    const at = new Date(Date.now() + 86_400_000).toISOString();
    const res = await notify(manager(), morId, { at });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/future/i);
  });

  /* A typed year, which silently moves the record into a window it
     never belonged to. */
  it("refuses a notification that precedes the occurrence", async () => {
    const res = await notify(manager(), morId, { at: "2025-01-01T00:00:00.000Z" });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/precede/i);
  });

  /* Re-dating a late notification into compliance. The first entry is
     the one the deadline was judged against. */
  it("refuses a second notification rather than overwriting the first", async () => {
    const first = await notify(manager(), morId, { at: "2026-08-10T09:00:00.000Z" });
    expect(first.statusCode).toBe(200);

    const second = await notify(manager(), morId, { at: "2026-08-10T07:00:00.000Z" });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe("already_recorded");

    const row = await prisma().safetyReport.findFirstOrThrow({ where: { id: morId } });
    expect(row.reportedToAuthorityAt?.toISOString()).toBe("2026-08-10T09:00:00.000Z");
  });

  /* A discharge on a duty that never existed reads later as evidence of
     a report that was never reportable. */
  it("refuses to notify a report that carries no notification duty", async () => {
    const res = await notify(manager(), hazardId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("not_reportable");
  });

  it("refuses a role without triage permission", async () => {
    const res = await notify(frontline(), morId);
    expect(res.statusCode).toBe(403);
  });

  /* Not 403. "Forbidden" confirms the id exists, which is the
     difference between refusing access and confirming a record. */
  it("does not find another operator's report", async () => {
    const res = await notify(manager(), otherMorId);
    expect(res.statusCode).toBe(404);

    const row = await prisma().safetyReport.findFirstOrThrow({ where: { id: otherMorId } });
    expect(row.reportedToAuthorityAt).toBeNull();
  });

  describe("the audit record", () => {
    it("extends the chain", async () => {
      const before = await prisma().auditLog.count({ where: { orgId } });
      await notify(manager(), morId);
      const after = await prisma().auditLog.count({ where: { orgId } });
      expect(after).toBe(before + 1);

      const entry = await prisma().auditLog.findFirstOrThrow({
        where: { orgId, entityId: morId },
        orderBy: { seq: "desc" },
      });
      expect(entry.action).toBe("report.notified_authority");
      expect(entry.userId).toBe(managerId);
    });

    /* The chain is exportable and the detail travels with it. The
       authority's acknowledgement is the operator's record to hand over
       deliberately, not something duplicated into every export. */
    it("does not put the authority's reference into the audit detail", async () => {
      await notify(manager(), morId, { reference: "KCAA/OCC/2026/114" });
      const entry = await prisma().auditLog.findFirstOrThrow({
        where: { orgId, entityId: morId },
        orderBy: { seq: "desc" },
      });
      expect(JSON.stringify(entry.detail)).not.toContain("KCAA/OCC/2026/114");
      expect(JSON.stringify(entry.detail)).toContain("hasReference");
    });
  });

  describe("what the digest then says", () => {
    const digest = (token: string) =>
      app.inject({
        method: "GET", url: "/api/v1/digest",
        headers: { authorization: `Bearer ${token}` },
      });

    /* THE POINT OF THE WHOLE CHANGE. Before the column existed, this
       occurrence would have been reported overdue every day for ever
       whether or not anybody had telephoned the authority. */
    it("stops counting an occurrence once it is recorded as notified", async () => {
      const before = await digest(manager());
      expect(before.statusCode).toBe(200);
      const deadlinesBefore = before.json().digest.items.filter(
        (i: { kind: string }) => i.kind === "DEADLINE",
      );
      expect(deadlinesBefore).toHaveLength(1);

      await notify(manager(), morId);

      const after = await digest(manager());
      const deadlinesAfter = after.json().digest.items.filter(
        (i: { kind: string }) => i.kind === "DEADLINE",
      );
      expect(deadlinesAfter).toHaveLength(0);
    });

    it("never puts the reference or a narrative into the digest", async () => {
      await notify(manager(), morId, { reference: "KCAA/OCC/2026/114" });
      const res = await digest(manager());
      const body = JSON.stringify(res.json().digest);
      expect(body).not.toContain("KCAA/OCC/2026/114");
      expect(body).not.toMatch(/runway excursion/i);
    });
  });
});
