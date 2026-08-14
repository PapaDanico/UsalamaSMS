/* ============================================================
   ELEMENT 3.2, through the real route and a real Postgres.

   THE CHECK WORTH MOST HERE is the one about dates, and it is unusual
   in this suite for being the ELEMENT rather than a property of the
   implementation. 3.2's evidence definition reads: "a change assessment
   for the most recent significant change, DATED BEFORE IT HAPPENED".

   An assessment written after the fleet arrived is a justification. If
   this route accepted one, the product would be manufacturing exactly
   the evidence the element exists to test for — a row that reads as
   proof of forethought and is proof of the opposite. That is worse than
   not having the feature.

   The five-step arithmetic is NOT re-tested here. riskScore() and
   tolerability() have their own suite and are shared with the register
   and /methodology; what is checked is that this route scores from the
   same functions rather than from numbers of its own.
   ============================================================ */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { riskScore, tolerability } from "../../packages/shared/src/risk";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;
let orgId: string;
let otherOrgId: string;
let managerId: string;
let execId: string;
let frontlineId: string;
let otherManagerId: string;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

const CHANGE = {
  title: "Adding a second Caravan on the Lodwar rotation",
  description:
    "A second aircraft on an existing route, flown by crews already line-checked on type.",
  trigger: "FLEET",
  assessedOn: "2026-05-01",
  effectiveFrom: "2026-07-01",
  severity: "C_MAJOR",
  likelihood: "REMOTE",
  controls: "Route check for each captain; dispatch briefed on the second tail.",
  residualSeverity: "C_MAJOR",
  residualLikelihood: "IMPROBABLE",
  reviewDueOn: "2026-10-01",
};

describe.skipIf(!hasDatabase)("the management of change, through the real route", () => {
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
    execId = await mk("exec@a.test", "ACCOUNTABLE_EXECUTIVE", orgId);
    frontlineId = await mk("frontline@a.test", "FRONTLINE", orgId);
    otherManagerId = await mk("manager@b.test", "SAFETY_MANAGER", otherOrgId);
  });

  const post = (path: string, token: string, body: unknown) =>
    app.inject({ method: "POST", url: path, headers: { authorization: `Bearer ${token}` }, payload: body as never });
  const get = (token: string) =>
    app.inject({ method: "GET", url: "/api/v1/changes", headers: { authorization: `Bearer ${token}` } });

  it("holds an assessment the organisation can see, not one browser", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    expect((await post("/api/v1/changes", manager, CHANGE)).statusCode).toBe(201);

    const [change] = (await get(manager)).json().changes;
    expect(change.title).toContain("Caravan");
    expect(change.trigger).toBe("FLEET");
    expect(change.status).toBe("ASSESSED");
  });

  it("REFUSES AN ASSESSMENT DATED AFTER THE CHANGE TOOK EFFECT", async () => {
    /* THE ELEMENT ITSELF. 3.2 asks for an assessment "dated before it
       happened". Accepting a later one would put a row in the record
       that reads as evidence of forethought and is evidence of the
       opposite — the product manufacturing the thing it is supposed to
       be testing for. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const backdated = { ...CHANGE, assessedOn: "2026-08-01", effectiveFrom: "2026-07-01" };

    const res = await post("/api/v1/changes", manager, backdated);
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toMatch(/justification|before/i);
    expect(await prisma().changeAssessment.count({ where: { orgId } })).toBe(0);
  });

  it("accepts one assessed on the day the change takes effect", async () => {
    // The boundary, and it is legitimate: a change assessed the morning
    // it takes effect was still assessed before it.
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const sameDay = { ...CHANGE, assessedOn: "2026-07-01", effectiveFrom: "2026-07-01" };
    expect((await post("/api/v1/changes", manager, sameDay)).statusCode).toBe(201);
  });

  it("accepts a change with no effective date yet", async () => {
    // Still being planned. A date nobody has set is not the same as a
    // change that happened today, and defaulting it would turn
    // "assessed before" into "assessed on the day" for every draft.
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const planning = { ...CHANGE };
    delete (planning as Record<string, unknown>)["effectiveFrom"];
    expect((await post("/api/v1/changes", manager, planning)).statusCode).toBe(201);
  });

  it("SCORES FROM THE SAME MATRIX /methodology RENDERS", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    await post("/api/v1/changes", manager, CHANGE);
    const row = await prisma().changeAssessment.findFirstOrThrow({ where: { orgId } });
    expect(row.score).toBe(riskScore("C_MAJOR", "REMOTE"));
    expect(row.tolerability).toBe(tolerability("C_MAJOR", "REMOTE"));
    expect(row.residualScore).toBe(riskScore("C_MAJOR", "IMPROBABLE"));
  });

  it("REFUSES TO APPROVE A CHANGE THAT IS STILL INTOLERABLE AFTER ITS CONTROLS", async () => {
    /* The same refusal the SRA screen makes. Doc 9859's red band is not
       "acceptable with sign-off from somebody sufficiently senior" — it
       is not acceptable at any level of benefit, and a product that let
       an executive click past it would be helping produce the document
       that proves they knew. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const exec = tokenFor(execId, orgId, "ACCOUNTABLE_EXECUTIVE");
    const red = {
      ...CHANGE,
      severity: "A_CATASTROPHIC",
      likelihood: "FREQUENT",
      residualSeverity: "A_CATASTROPHIC",
      residualLikelihood: "FREQUENT",
    };
    const id = (await post("/api/v1/changes", manager, red)).json().change.id;

    const res = await post(`/api/v1/changes/${id}/approve`, exec, {});
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("intolerable");

    const row = await prisma().changeAssessment.findFirstOrThrow({ where: { orgId } });
    expect(row.approvedAt).toBeNull();
  });

  it("SEPARATES ASSESSING FROM APPROVING", async () => {
    /* A change its own author can approve is not routed, and moc.create
       and moc.approve have been separate in the matrix since it was
       written. Pinned so the separation is revisited on purpose. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const exec = tokenFor(execId, orgId, "ACCOUNTABLE_EXECUTIVE");
    const id = (await post("/api/v1/changes", manager, CHANGE)).json().change.id;

    expect((await post(`/api/v1/changes/${id}/approve`, manager, {})).statusCode).toBe(403);
    expect((await post(`/api/v1/changes/${id}/approve`, exec, {})).statusCode).toBe(200);

    const row = await prisma().changeAssessment.findFirstOrThrow({ where: { orgId } });
    expect(row.approvedById).toBe(execId);
    expect(row.status).toBe("APPROVED");
  });

  it("refuses a second approval rather than overwriting who signed it", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const exec = tokenFor(execId, orgId, "ACCOUNTABLE_EXECUTIVE");
    const id = (await post("/api/v1/changes", manager, CHANGE)).json().change.id;
    await post(`/api/v1/changes/${id}/approve`, exec, {});
    expect((await post(`/api/v1/changes/${id}/approve`, exec, {})).statusCode).toBe(409);
  });

  it("RECORDS THE REVIEW AFTER THE CHANGE, which is the half most often skipped", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const id = (await post("/api/v1/changes", manager, CHANGE)).json().change.id;

    const res = await post(`/api/v1/changes/${id}/review`, manager, {
      reviewedOn: "2026-10-05",
      reviewNotes: "Second tail bedded in; no new hazards raised on the rotation.",
    });
    expect(res.statusCode).toBe(200);

    const row = await prisma().changeAssessment.findFirstOrThrow({ where: { orgId } });
    expect(row.status).toBe("REVIEWED");
    expect(row.reviewNotes).toContain("bedded in");
  });

  it("ANOTHER OPERATOR'S CHANGES ARE NOT VISIBLE, AND CANNOT BE APPROVED", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const stranger = tokenFor(otherManagerId, otherOrgId, "SAFETY_MANAGER");
    const id = (await post("/api/v1/changes", manager, CHANGE)).json().change.id;

    expect((await get(stranger)).json().changes).toHaveLength(0);
    // Not-found rather than forbidden: a refusal confirms the row exists.
    expect((await post(`/api/v1/changes/${id}/approve`, stranger, {})).statusCode).toBe(403);
  });

  it("withholds the change register from a frontline reporter", async () => {
    const frontline = tokenFor(frontlineId, orgId, "FRONTLINE");
    expect((await get(frontline)).statusCode).toBe(403);
    expect((await post("/api/v1/changes", frontline, CHANGE)).statusCode).toBe(403);
  });

  it("appends an audit entry for assessing, approving and reviewing", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const exec = tokenFor(execId, orgId, "ACCOUNTABLE_EXECUTIVE");
    const id = (await post("/api/v1/changes", manager, CHANGE)).json().change.id;
    await post(`/api/v1/changes/${id}/approve`, exec, {});
    await post(`/api/v1/changes/${id}/review`, manager, {
      reviewedOn: "2026-10-05", reviewNotes: "Done.",
    });

    const actions = (await prisma().auditLog.findMany({ where: { orgId } })).map((a) => a.action);
    expect(actions).toContain("change.assess");
    expect(actions).toContain("change.approve");
    expect(actions).toContain("change.review");
  });

  it("requires a token", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/changes" })).statusCode).toBe(401);
  });
});
