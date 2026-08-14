/* ============================================================
   ELEMENT 3.1, through the real route and a real Postgres.

   Regulation 9(5) of L.N. 32/2026: a service provider's SMS "shall have
   safety performance indicators and targets acceptable to the
   Authority". The indicators were computed correctly and kept in one
   browser's localStorage, so an operator asked to produce theirs had to
   produce a handset. These checks are about the half that was missing —
   that the measurement reaches a place the safety office can read and
   another operator cannot.

   The arithmetic is NOT re-tested here. rate(), mean(), stdDev() and
   alertLevels() have their own suite and have not changed; repeating
   them through HTTP would only prove that a network call does not
   corrupt a division.
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
let officerId: string;
let otherManagerId: string;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

const INDICATOR = {
  name: "Unstable approaches",
  kind: "LOWER_CONSEQUENCE",
  exposureUnit: "sectors",
  per: 1000,
  direction: "LOWER_IS_BETTER",
  target: 2,
  owner: "Samuel Kiprono",
};

describe.skipIf(!hasDatabase)("safety performance indicators, through the real route", () => {
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
    frontlineId = await mk("frontline@a.test", "FRONTLINE", orgId);
    officerId = await mk("officer@a.test", "SAFETY_OFFICER", orgId);
    otherManagerId = await mk("manager@b.test", "SAFETY_MANAGER", otherOrgId);
  });

  const post = (path: string, token: string, body: unknown) =>
    app.inject({ method: "POST", url: path, headers: { authorization: `Bearer ${token}` }, payload: body as never });
  const get = (path: string, token: string) =>
    app.inject({ method: "GET", url: path, headers: { authorization: `Bearer ${token}` } });

  it("stores an indicator and reads it back with its periods", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const created = await post("/api/v1/spi", manager, INDICATOR);
    expect(created.statusCode).toBe(201);
    const id = created.json().indicator.id as string;

    for (const p of [
      { label: "2026-Q1", events: 4, exposure: 1200 },
      { label: "2026-Q2", events: 2, exposure: 1300 },
    ]) {
      expect((await post(`/api/v1/spi/${id}/periods`, manager, p)).statusCode).toBe(201);
    }

    const listed = await get("/api/v1/spi", manager);
    expect(listed.statusCode).toBe(200);
    const [indicator] = listed.json().indicators;
    expect(indicator.name).toBe(INDICATOR.name);
    expect(indicator.periods.map((p: { label: string }) => p.label)).toEqual(["2026-Q1", "2026-Q2"]);
  });

  it("NEVER RETURNS AN ALERT LEVEL, because it is derived", async () => {
    /* Charter rule 6, asserted against the wire rather than the schema.
       A stored alert level is the same defect as a stored deadline:
       correct when written and silently wrong once the next period
       lands. The API owes the caller the series; the caller computes. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const id = (await post("/api/v1/spi", manager, INDICATOR)).json().indicator.id;
    await post(`/api/v1/spi/${id}/periods`, manager, { label: "2026-Q1", events: 4, exposure: 1200 });

    const body = (await get("/api/v1/spi", manager)).payload;
    expect(body).not.toMatch(/alertLevel/i);
    expect(body).not.toMatch(/"alert"/i);
  });

  it("REFUSES THE SAME PERIOD TWICE, and says which one", async () => {
    /* C-07, on the server. A period appended twice doubles the exposure
       it contributes, so the rate falls and the alert level moves for a
       reason that did not happen — an improvement the operator did not
       earn, which is the direction nobody checks. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const id = (await post("/api/v1/spi", manager, INDICATOR)).json().indicator.id;
    const period = { label: "2026-Q1", events: 4, exposure: 1200 };

    expect((await post(`/api/v1/spi/${id}/periods`, manager, period)).statusCode).toBe(201);
    const again = await post(`/api/v1/spi/${id}/periods`, manager, period);
    expect(again.statusCode).toBe(409);
    expect(again.json().message).toContain("2026-Q1");

    const [indicator] = (await get("/api/v1/spi", manager)).json().indicators;
    expect(indicator.periods).toHaveLength(1);
  });

  it("refuses a second indicator with the same name", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    expect((await post("/api/v1/spi", manager, INDICATOR)).statusCode).toBe(201);
    const again = await post("/api/v1/spi", manager, INDICATOR);
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe("duplicate_name");
  });

  it("REFUSES A NEGATIVE COUNT AND A ZERO EXPOSURE", async () => {
    /* Both would read as an improvement. A negative event count drags a
       rate below zero; a zero exposure divides by nothing and the rate
       is not a number, which renders as a blank rather than as a
       problem. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const id = (await post("/api/v1/spi", manager, INDICATOR)).json().indicator.id;

    for (const bad of [
      { label: "2026-Q1", events: -1, exposure: 1200 },
      { label: "2026-Q2", events: 4, exposure: 0 },
      { label: "2026-Q3", events: 1.5, exposure: 1200 },
    ]) {
      const res = await post(`/api/v1/spi/${id}/periods`, manager, bad);
      expect(res.statusCode, `${JSON.stringify(bad)} was accepted`).toBe(400);
    }
  });

  it("ANOTHER OPERATOR CANNOT READ OR APPEND TO THIS ONE'S INDICATORS", async () => {
    /* The tenancy boundary, which is the reason this moved off the
       handset in the first place. A not-found rather than a refusal:
       a refusal confirms the indicator exists. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const stranger = tokenFor(otherManagerId, otherOrgId, "SAFETY_MANAGER");
    const id = (await post("/api/v1/spi", manager, INDICATOR)).json().indicator.id;

    expect((await get("/api/v1/spi", stranger)).json().indicators).toHaveLength(0);

    const intrusion = await post(`/api/v1/spi/${id}/periods`, stranger, {
      label: "2026-Q1", events: 99, exposure: 1,
    });
    expect(intrusion.statusCode).toBe(404);

    const [mine] = (await get("/api/v1/spi", manager)).json().indicators;
    expect(mine.periods).toHaveLength(0);
  });

  it("SEPARATES READING AN INDICATOR FROM CONFIGURING ONE", async () => {
    /* The safety officer reads the series and cannot move the target.
       That separation is the point: an indicator whose target can be
       adjusted by whoever is looking at it is not a measurement, and
       spi.configure sits with the safety manager for the same reason
       policy.sign sits only with the accountable executive. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const officer = tokenFor(officerId, orgId, "SAFETY_OFFICER");
    await post("/api/v1/spi", manager, INDICATOR);

    expect((await get("/api/v1/spi", officer)).statusCode).toBe(200);
    const denied = await post("/api/v1/spi", officer, { ...INDICATOR, name: "Theirs" });
    expect(denied.statusCode).toBe(403);
  });

  it("WITHHOLDS THE INDICATORS FROM A FRONTLINE REPORTER, deliberately", async () => {
    /* Not an oversight in the matrix, and worth pinning so nobody
       "fixes" it. FRONTLINE holds report.create, report.read.own,
       document.read and training.read.own — the form and the documents
       needed to fill it in. The organisation's safety performance is
       the safety office's instrument, and the same reasoning withholds
       the staff roster from this role on the /sms routes.

       If that judgement is ever revisited it should be revisited on
       purpose, which is what this check forces. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const frontline = tokenFor(frontlineId, orgId, "FRONTLINE");
    await post("/api/v1/spi", manager, INDICATOR);

    expect((await get("/api/v1/spi", frontline)).statusCode).toBe(403);
    expect((await post("/api/v1/spi", frontline, INDICATOR)).statusCode).toBe(403);
  });

  it("APPENDS AN AUDIT ENTRY FOR THE INDICATOR AND FOR EACH PERIOD", async () => {
    /* An indicator that can be reconfigured without trace is one whose
       target can be moved after the fact to make a period look
       acceptable. That is the whole reason the audit chain exists. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const id = (await post("/api/v1/spi", manager, INDICATOR)).json().indicator.id;
    await post(`/api/v1/spi/${id}/periods`, manager, { label: "2026-Q1", events: 4, exposure: 1200 });

    const actions = (
      await prisma().auditLog.findMany({ where: { orgId }, orderBy: { seq: "asc" } })
    ).map((a) => a.action);
    expect(actions).toContain("spi.configure");
    expect(actions).toContain("spi.period.append");
  });

  it("RECORDS WHAT WAS DONE ABOUT A PERIOD — element 3.1's own evidence", async () => {
    /* The element asks for "indicators with a defined trigger, and a
       record of what happened the last time one was crossed". The
       trigger has been here since alertLevels() landed; without this
       half the element is a chart. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const id = (await post("/api/v1/spi", manager, INDICATOR)).json().indicator.id;
    const created = await post(`/api/v1/spi/${id}/periods`, manager, {
      label: "2026-Q1", events: 9, exposure: 1200,
    });
    const periodId = created.json().period.id;

    const res = await post(`/api/v1/spi/${id}/periods/${periodId}/action`, manager, {
      actionTaken: "Approach briefing revised; go-around policy restated at the crew meeting.",
      actionOn: "2026-04-14",
    });
    expect(res.statusCode).toBe(200);

    const [indicator] = (await get("/api/v1/spi", manager)).json().indicators;
    expect(indicator.periods[0].actionTaken).toContain("go-around policy");
    expect(indicator.periods[0].actionOn).toBeTruthy();
  });

  it("STILL RETURNS NO ALERT LEVEL, even beside a recorded response", async () => {
    /* The response is attached to the PERIOD, not to a level. If
       recording what was done had quietly introduced a stored level,
       this is where it would show — and a stored level is the defect
       the whole module was built to avoid. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const id = (await post("/api/v1/spi", manager, INDICATOR)).json().indicator.id;
    const p = await post(`/api/v1/spi/${id}/periods`, manager, {
      label: "2026-Q1", events: 9, exposure: 1200,
    });
    const written = await post(
      `/api/v1/spi/${id}/periods/${p.json().period.id}/action`,
      manager,
      { actionTaken: "Reviewed." },
    );

    /* BOTH RESPONSES, and the second one is why this check was rewritten.
       It read only the list, so a mutation that returned a stored level
       from the ACTION route itself passed — the new endpoint's own body
       was never looked at. A rule about what the API may not say has to
       be asserted against every place the API speaks. */
    const listed = (await get("/api/v1/spi", manager)).payload;
    expect(listed).not.toMatch(/alertLevel/i);
    expect(listed).not.toMatch(/"alert"/i);
    expect(written.payload).not.toMatch(/alertLevel/i);
    expect(written.payload).not.toMatch(/"alert"/i);
  });

  it("ANOTHER OPERATOR CANNOT WRITE A RESPONSE ONTO THIS ONE'S PERIOD", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const stranger = tokenFor(otherManagerId, otherOrgId, "SAFETY_MANAGER");
    const id = (await post("/api/v1/spi", manager, INDICATOR)).json().indicator.id;
    const p = await post(`/api/v1/spi/${id}/periods`, manager, {
      label: "2026-Q1", events: 4, exposure: 1200,
    });
    const periodId = p.json().period.id;

    const intrusion = await post(
      `/api/v1/spi/${id}/periods/${periodId}/action`,
      stranger,
      { actionTaken: "Nothing, it is fine." },
    );
    expect(intrusion.statusCode).toBe(404);

    const [mine] = (await get("/api/v1/spi", manager)).json().indicators;
    expect(mine.periods[0].actionTaken).toBeNull();
  });

  it("refuses an empty response rather than recording that nothing was written", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const id = (await post("/api/v1/spi", manager, INDICATOR)).json().indicator.id;
    const p = await post(`/api/v1/spi/${id}/periods`, manager, {
      label: "2026-Q1", events: 4, exposure: 1200,
    });
    const res = await post(
      `/api/v1/spi/${id}/periods/${p.json().period.id}/action`,
      manager,
      { actionTaken: "   " },
    );
    expect(res.statusCode).toBe(400);
  });

  it("requires a token at all", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/spi" })).statusCode).toBe(401);
  });
});
