/* ============================================================
   THE FIVE ATTRIBUTES A STATE FILES, THROUGH THE REAL ROUTE.

   adrep.test.ts covers the vocabulary. This covers the things only a
   database can answer, and every one of them is a way the column could
   end up holding something nobody determined:

     1. AN OMITTED KEY MUST NOT CLEAR A COLUMN. The classification form
        and the attribute panel post together, and a client that submits
        categories without the panel open would erase five
        determinations made yesterday. Omission is not a decision.

     2. AN EXPLICIT NULL MUST CLEAR IT. A safety officer who coded
        SERIOUS from a first account and learns the injury was minor
        needs a way back to "not yet coded" that is not "pick
        something".

     3. A VALUE FROM THE WRONG VOCABULARY MUST BE REFUSED. These five
        are closed, unlike cicttCodes — an unrecognised value is a
        client bug, and storing it puts something in a column that
        groups with nothing.

     4. THE RE-DETERMINATION MUST BE AUDITABLE ON BOTH SIDES. Injury
        level decides whether an occurrence is an Annex 13 accident, so
        "was MINOR, is now SERIOUS" is what an investigator later asks
        who recorded and when. A record of the new value alone cannot
        answer whether a level was walked back.

     5. TENANCY. Another operator's report id answers not-found, not
        forbidden — a refusal confirms the row exists.
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
let reporterId: string;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

describe.skipIf(!hasDatabase)("coding the five ADREP attributes", () => {
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
    const other = await prisma().org.create({ data: { name: "Somebody Else AOC" } });
    otherOrgId = other.id;
    const mk = async (org: string, email: string, role: string) =>
      (
        await prisma().user.create({
          data: { orgId: org, email, passwordHash: "x", name: email, role: role as never },
        })
      ).id;
    managerId = await mk(orgId, "manager@a.test", "SAFETY_MANAGER");
    reporterId = await mk(orgId, "ramp@a.test", "FRONTLINE");
  });

  const manager = () => tokenFor(managerId, orgId, "SAFETY_MANAGER");
  const reporter = () => tokenFor(reporterId, orgId, "FRONTLINE");

  const CID = "33333333-3333-4333-8333-333333333333";

  const mkReport = async (org = orgId) =>
    prisma().safetyReport.create({
      data: {
        orgId: org,
        clientId: CID,
        type: "MOR" as never,
        title: "Excursion on the landing roll",
        narrative: "x",
      },
    });

  const classify = (token: string, id: string, body: Record<string, unknown>) =>
    app.inject({
      method: "PUT",
      url: `/api/v1/reports/${id}/codes`,
      headers: { authorization: `Bearer ${token}` },
      payload: { cicttCodes: ["RE"], ...body },
    });

  const stored = (id: string) =>
    prisma().safetyReport.findUnique({
      where: { id },
      select: {
        injuryLevel: true, aircraftDamage: true,
        lightCondition: true, metCondition: true, operationType: true,
      },
    });

  it("writes all five alongside the occurrence categories", async () => {
    const report = await mkReport();
    const res = await classify(manager(), report.id, {
      injuryLevel: "SERIOUS",
      aircraftDamage: "SUBSTANTIAL",
      lightCondition: "NIGHT",
      metCondition: "IMC",
      operationType: "CAT_NON_SCHEDULED",
    });

    expect(res.statusCode).toBe(200);
    expect(await stored(report.id)).toEqual({
      injuryLevel: "SERIOUS",
      aircraftDamage: "SUBSTANTIAL",
      lightCondition: "NIGHT",
      metCondition: "IMC",
      operationType: "CAT_NON_SCHEDULED",
    });
  });

  /* TRAP 1. The one that would lose real work silently. */
  it("leaves a column alone when the key is not sent at all", async () => {
    const report = await mkReport();
    await classify(manager(), report.id, { injuryLevel: "FATAL", metCondition: "VMC" });

    /* A second submission that carries only the categories — which is
       exactly what a client posting the classification form without the
       attribute panel would send. */
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/reports/${report.id}/codes`,
      headers: { authorization: `Bearer ${manager()}` },
      payload: { cicttCodes: ["RE", "LOC-I"] },
    });

    expect(res.statusCode).toBe(200);
    const after = await stored(report.id);
    expect(after?.injuryLevel).toBe("FATAL");
    expect(after?.metCondition).toBe("VMC");
  });

  /* TRAP 2. Omission is not a decision; null is. */
  it("clears a column when null is sent deliberately", async () => {
    const report = await mkReport();
    await classify(manager(), report.id, { injuryLevel: "SERIOUS" });
    const res = await classify(manager(), report.id, { injuryLevel: null });

    expect(res.statusCode).toBe(200);
    expect((await stored(report.id))?.injuryLevel).toBeNull();
  });

  /* An explicit UNKNOWN is a determination and is stored as one. Null
     and UNKNOWN are different facts and the column has to hold both. */
  it("stores an explicit UNKNOWN rather than treating it as no answer", async () => {
    const report = await mkReport();
    await classify(manager(), report.id, { lightCondition: "UNKNOWN" });
    expect((await stored(report.id))?.lightCondition).toBe("UNKNOWN");
  });

  /* TRAP 3. Closed vocabularies, unlike cicttCodes. */
  it("refuses a value from a different vocabulary", async () => {
    const report = await mkReport();
    const res = await classify(manager(), report.id, { injuryLevel: "IMC" });
    expect(res.statusCode).toBe(400);
    expect((await stored(report.id))?.injuryLevel).toBeNull();
  });

  it("refuses free text, and writes nothing at all when it does", async () => {
    const report = await mkReport();
    const res = await classify(manager(), report.id, {
      metCondition: "VMC",
      injuryLevel: "fairly bad",
    });
    expect(res.statusCode).toBe(400);
    /* THE WHOLE SUBMISSION IS REFUSED, not the invalid half. A partial
       write here would store a met condition beside an injury level the
       officer thinks they set. */
    expect(await stored(report.id)).toEqual({
      injuryLevel: null, aircraftDamage: null,
      lightCondition: null, metCondition: null, operationType: null,
    });
  });

  it("normalises case rather than creating a second value", async () => {
    const report = await mkReport();
    const res = await classify(manager(), report.id, { metCondition: "vmc" });
    expect(res.statusCode).toBe(200);
    expect((await stored(report.id))?.metCondition).toBe("VMC");
  });

  /* TRAP 4. Both sides, because a record of the new value alone cannot
     answer whether a determination was walked back. */
  it("audits both sides of a re-determination", async () => {
    const report = await mkReport();
    await classify(manager(), report.id, { injuryLevel: "MINOR" });
    await classify(manager(), report.id, { injuryLevel: "SERIOUS" });

    const entries = await prisma().auditLog.findMany({
      where: { orgId, entityId: report.id, action: "report.classify" },
      orderBy: { seq: "asc" },
    });
    const last = entries.at(-1)!;
    const detail = last.detail as { adrep?: { from: Record<string, unknown>; to: Record<string, unknown> } };
    expect(detail.adrep?.from["injuryLevel"]).toBe("MINOR");
    expect(detail.adrep?.to["injuryLevel"]).toBe("SERIOUS");
  });

  /* And the other half of that: an entry that touched none of them does
     not grow a field saying nothing. */
  it("leaves the attributes out of the audit entry when none were sent", async () => {
    const report = await mkReport();
    await app.inject({
      method: "PUT",
      url: `/api/v1/reports/${report.id}/codes`,
      headers: { authorization: `Bearer ${manager()}` },
      payload: { cicttCodes: ["RE"] },
    });
    const entry = await prisma().auditLog.findFirst({
      where: { orgId, entityId: report.id, action: "report.classify" },
    });
    expect((entry!.detail as Record<string, unknown>)["adrep"]).toBeUndefined();
  });

  /* Coding an occurrence is a trained judgement. report.create is held
     by every frontline reporter and must not carry this with it. */
  it("refuses a reporter who does not hold report.triage", async () => {
    const report = await mkReport();
    const res = await classify(reporter(), report.id, { injuryLevel: "NONE" });
    expect(res.statusCode).toBe(403);
    expect((await stored(report.id))?.injuryLevel).toBeNull();
  });

  /* TRAP 5. Not-found rather than forbidden — a refusal confirms the
     row exists. */
  it("answers not-found for another operator's report", async () => {
    const theirs = await mkReport(otherOrgId);
    const res = await classify(manager(), theirs.id, { injuryLevel: "NONE" });
    expect(res.statusCode).toBe(404);
    expect((await stored(theirs.id))?.injuryLevel).toBeNull();
  });

  /* The screen renders what is STORED, so the read paths have to carry
     it — a panel that opens blank invites somebody to re-determine what
     was already determined. */
  it("carries the stored values back on the queue and the disposition", async () => {
    const report = await mkReport();
    await classify(manager(), report.id, { lightCondition: "TWILIGHT", operationType: "AERIAL_WORK" });

    const queue = await app.inject({
      method: "GET", url: "/api/v1/reports/queue",
      headers: { authorization: `Bearer ${manager()}` },
    });
    const row = queue.json().reports.find((r: { id: string }) => r.id === report.id);
    expect(row.lightCondition).toBe("TWILIGHT");
    expect(row.operationType).toBe("AERIAL_WORK");

    const disposition = await app.inject({
      method: "GET", url: `/api/v1/reports/${report.id}/disposition`,
      headers: { authorization: `Bearer ${manager()}` },
    });
    expect(disposition.json().lightCondition).toBe("TWILIGHT");
  });

  /* A partial submission leaves the untouched columns alone, and the
     response has to say what the ROW now holds rather than echoing what
     was sent — otherwise the screen renders blanks over stored values. */
  it("reads back the whole row, not the half that was submitted", async () => {
    const report = await mkReport();
    await classify(manager(), report.id, { injuryLevel: "NONE", metCondition: "VMC" });
    const res = await classify(manager(), report.id, { lightCondition: "DAYLIGHT" });
    const body = res.json();
    expect(body.injuryLevel).toBe("NONE");
    expect(body.metCondition).toBe("VMC");
    expect(body.lightCondition).toBe("DAYLIGHT");
  });
});
