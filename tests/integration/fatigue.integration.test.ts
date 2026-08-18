/* =====================================================================
   FATIGUE, THROUGH THE REAL ROUTE.

   fatigue.test.ts holds the arithmetic. What only a database can answer
   is whether the duty a reporter filed survives the wire into the
   columns the picture reads, whether the operator's declared limits are
   the ones it is compared against, and — the assertion worth most here
   — whether the narrative stays behind.

   A FATIGUE NARRATIVE IS THE MOST CAREER-SENSITIVE SENTENCE IN THIS
   PRODUCT. It is somebody saying they were too tired to fly safely. The
   duty figures are what the analysis needs; the words are not, and a
   route that shipped them to a summary screen would be the /picture
   defect on the one record where it costs a job.
   ===================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

const MARKER = "I-WAS-TOO-TIRED-CONFIDENTIAL-MARKER";

let app: FastifyInstance;
let orgId = "";
let otherOrgId = "";
let managerId = "";
let adminId = "";

const token = (sub: string, org: string, role: string) =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET,
    { algorithm: "HS256", issuer: "usalamasms", expiresIn: "15m" });

const get = (url: string, who: string, role: string, org = orgId) =>
  app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token(who, org, role)}` } });

const declare = (who: string, role: string, body: unknown, org = orgId) =>
  app.inject({
    method: "PUT", url: "/api/v1/fatigue/limits",
    headers: { authorization: `Bearer ${token(who, org, role)}` },
    payload: body as never,
  });

const fatigueReport = (oid: string, duty: Record<string, unknown>, clientId: string) =>
  prisma().safetyReport.create({
    data: {
      orgId: oid, clientId, type: "FATIGUE",
      title: "Too tired on the last sector",
      narrative: `${MARKER} the duty ran long and I was not fit to fly it`,
      ...duty,
    } as never,
  });

describe.skipIf(!hasDatabase)("fatigue, through the real route", () => {
  beforeAll(async () => {
    migrate();
    const { build } = await import("../../apps/api/src/server");
    app = await build();
    await app.ready();
  });
  afterAll(async () => { await app?.close(); await disconnect(); });

  beforeEach(async () => {
    await reset();
    const soon = new Date(Date.now() + 8.64e7);
    orgId = (await prisma().org.create({
      data: { name: "Strip Air", jurisdiction: "KE", trialEndsOn: soon },
    })).id;
    otherOrgId = (await prisma().org.create({
      data: { name: "Lake Air", jurisdiction: "KE", trialEndsOn: soon },
    })).id;
    managerId = (await prisma().user.create({
      data: { orgId, email: "sm@strip.test", name: "Safety Manager",
        role: "SAFETY_MANAGER", passwordHash: "x" },
    })).id;
    adminId = (await prisma().user.create({
      data: { orgId, email: "ae@strip.test", name: "Accountable Executive",
        role: "ACCOUNTABLE_EXECUTIVE", passwordHash: "x" },
    })).id;
  });

  it("THE NARRATIVE NEVER LEAVES THIS ROUTE", async () => {
    await fatigueReport(orgId, { fatigueDutyHours: 12 }, "f-1");
    const res = await get("/api/v1/fatigue", managerId, "SAFETY_MANAGER");
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().total).toBe(1);
    expect(res.body, "a fatigue narrative reached the summary screen").not.toContain(MARKER);
  });

  it("REFUSES A NUMBER WITH NO INSTRUMENT BEHIND IT", async () => {
    /* The whole reason this product ships no State's limit table is that
       an unsourced limit is indistinguishable from a wrong one. The rule
       has to hold for the operator's own figures too. */
    const res = await declare(adminId, "ACCOUNTABLE_EXECUTIVE", { maxDutyHours: 13 });
    expect(res.statusCode, res.body).toBe(400);
    expect(res.json().error).toBe("instrument_required");
    expect(await prisma().fatigueLimit.count()).toBe(0);
  });

  it("accepts them together, and records the declaration in the audit chain", async () => {
    const res = await declare(adminId, "ACCOUNTABLE_EXECUTIVE", {
      maxFlightTimeHours: 8, maxDutyHours: 13, minRestHours: 10,
      instrument: "OM-A 7.1",
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().declared).toBe(true);

    const rows = await prisma().auditLog.findMany({
      where: { orgId, action: "fatigue.limits.declared" },
    });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0]!.detail)).toMatch(/OM-A 7\.1/);
  });

  it("the SAFETY MANAGER may declare them too, not only the executive", async () => {
    /* config.manage, the permission this product already uses for what
       an operator declares about itself. It was org.manage for one
       draft, which only SYSTEM_ADMIN holds — so the one role that
       deliberately reads no narrative would have been the only one able
       to state what binds the operator. This assertion is what caught
       it. */
    const res = await declare(managerId, "SAFETY_MANAGER", {
      maxDutyHours: 13, instrument: "OM-A 7.1",
    });
    expect(res.statusCode, res.body).toBe(200);
  });

  it("and a role that declares nothing about the operator is refused", async () => {
    const officer = await prisma().user.create({
      data: { orgId, email: "so@strip.test", name: "Safety Officer",
        role: "SAFETY_OFFICER", passwordHash: "x" },
    });
    const res = await declare(officer.id, "SAFETY_OFFICER", {
      maxDutyHours: 13, instrument: "OM-A 7.1",
    });
    expect(res.statusCode).toBe(403);
    expect(await prisma().fatigueLimit.count()).toBe(0);
  });

  it("THE FINDING THIS EXISTS FOR — inside every declared limit, still too tired", async () => {
    await declare(adminId, "ACCOUNTABLE_EXECUTIVE", {
      maxFlightTimeHours: 8, maxDutyHours: 13, minRestHours: 10,
      instrument: "OM-A 7.1",
    });
    /* A duty comfortably inside all three, at three in the morning, on
       four hours of sleep, rated 6 of 7. */
    await fatigueReport(orgId, {
      fatigueFlightTimeHours: 7, fatigueDutyHours: 12, fatigueRestBeforeHours: 11,
      fatigueSectors: 6, fatigueSleepPrior24: 4,
      fatigueStartLocalHour: 3, fatigueEndLocalHour: 15, fatigueSamnPerelli: 6,
    }, "f-within");

    const body = (await get("/api/v1/fatigue", managerId, "SAFETY_MANAGER")).json();
    expect(body.counts.withinDeclared).toBe(1);
    expect(body.counts.exceededDeclared).toBe(0);
    expect(body.counts.impairmentReported).toBe(1);

    const f = body.reports[0].factors.join(" | ");
    expect(f).toMatch(/circadian low/i);
    expect(f).toMatch(/six hours of sleep/i);
  });

  it("and names the limit a duty went past", async () => {
    await declare(adminId, "ACCOUNTABLE_EXECUTIVE", {
      maxDutyHours: 13, instrument: "OM-A 7.1",
    });
    await fatigueReport(orgId, { fatigueDutyHours: 15 }, "f-over");

    const body = (await get("/api/v1/fatigue", managerId, "SAFETY_MANAGER")).json();
    expect(body.counts.exceededDeclared).toBe(1);
    expect(body.reports[0].exceeded.join(" ")).toMatch(/15h against a declared 13h/);
  });

  it("SAYS SO WHEN NOTHING IS DECLARED, rather than reporting compliance", async () => {
    await fatigueReport(orgId, { fatigueDutyHours: 20 }, "f-undeclared");
    const body = (await get("/api/v1/fatigue", managerId, "SAFETY_MANAGER")).json();
    expect(body.declared).toBe(false);
    expect(body.counts.noLimitsDeclared).toBe(1);
    expect(body.counts.withinDeclared, "an undeclared limit was read as compliance").toBe(0);
  });

  it("CANNOT SEE ANOTHER OPERATOR'S FATIGUE REPORTS", async () => {
    await fatigueReport(otherOrgId, { fatigueDutyHours: 14 }, "f-theirs");
    await fatigueReport(orgId, { fatigueDutyHours: 9 }, "f-ours");
    const body = (await get("/api/v1/fatigue", managerId, "SAFETY_MANAGER")).json();
    expect(body.total).toBe(1);
    expect(body.reports[0].clientId).toBe("f-ours");
  });

  it("and their declared limits are not ours", async () => {
    await prisma().fatigueLimit.create({
      data: { orgId: otherOrgId, maxDutyHours: 9, instrument: "Their OM" },
    });
    const body = (await get("/api/v1/fatigue/limits", managerId, "SAFETY_MANAGER")).json();
    expect(body.declared).toBe(false);
    expect(body.limits).toBeNull();
  });

  it("refuses the picture to a role that does not read the queue", async () => {
    const frontline = await prisma().user.create({
      data: { orgId, email: "f@strip.test", name: "Ramp", role: "FRONTLINE", passwordHash: "x" },
    });
    const res = await get("/api/v1/fatigue", frontline.id, "FRONTLINE");
    expect(res.statusCode).toBe(403);
  });

  it("CARRIES THE CAVEAT, so a quiet page is not read as an FRMS", async () => {
    const body = (await get("/api/v1/fatigue", managerId, "SAFETY_MANAGER")).json();
    expect(body.caveat).toMatch(/not a Fatigue Risk Management System/i);
    expect(body.verifiedAgainstPrimary).toBe(false);
    expect(body.scale).toHaveLength(7);
  });

  it("and a retracted fatigue report is out of the picture", async () => {
    await fatigueReport(orgId, { fatigueDutyHours: 9, retractedAt: new Date() }, "f-gone");
    const body = (await get("/api/v1/fatigue", managerId, "SAFETY_MANAGER")).json();
    expect(body.total).toBe(0);
  });
});
