/* ============================================================
   CORRECTIVE ACTIONS, through the real route.

   capa.test.ts holds the arithmetic. What only a database can answer:

     · THE CHECK CONSTRAINT. "Exactly one source" is the rule that makes
       one table serve four kinds of action, and Prisma cannot express
       it — so it is a CHECK in the migration, and a check nobody has
       ever seen fire is a check nobody knows works;
     · THE SEPARATION OF DUTIES, end to end. The person who marks an
       action complete cannot be the person who verifies it, and that
       has to hold against a real row rather than against an object
       literal;
     · TENANCY, on the SOURCE as well as on the action. An action hung
       off another operator's report id would not leak that report, but
       it would confirm the id exists.
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
let officerId: string;
let execId: string;
let reportId: string;
let otherReportId: string;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

describe.skipIf(!hasDatabase)("corrective actions, through the real route", () => {
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
    officerId = await mk("officer@a.test", "SAFETY_OFFICER", orgId);
    execId = await mk("ae@a.test", "ACCOUNTABLE_EXECUTIVE", orgId);

    const rep = (oid: string, clientId: string) =>
      prisma().safetyReport.create({
        data: { orgId: oid, clientId, type: "HAZARD", title: "Fuel bowser guard missing", narrative: "x" },
      });
    reportId = (await rep(orgId, "c-1")).id;
    otherReportId = (await rep(otherOrgId, "c-2")).id;
  });

  const manager = () => tokenFor(managerId, orgId, "SAFETY_MANAGER");
  const officer = () => tokenFor(officerId, orgId, "SAFETY_OFFICER");
  const exec = () => tokenFor(execId, orgId, "ACCOUNTABLE_EXECUTIVE");

  const create = (token: string, body: unknown) =>
    app.inject({
      method: "POST", url: "/api/v1/actions",
      headers: { authorization: `Bearer ${token}` }, payload: body as never,
    });
  const act = (token: string, id: string, what: string, body: unknown = {}) =>
    app.inject({
      method: "POST", url: `/api/v1/actions/${id}/${what}`,
      headers: { authorization: `Bearer ${token}` }, payload: body as never,
    });
  const list = (token: string) =>
    app.inject({
      method: "GET", url: "/api/v1/actions",
      headers: { authorization: `Bearer ${token}` },
    });

  const good = () => ({
    action: "Fit a guard to the fuel bowser drive coupling.",
    ownerPost: "SAFETY_MANAGER",
    dueOn: "2026-09-30",
    reportId,
  });

  it("records an action against a report and derives its status", async () => {
    const res = await create(manager(), good());
    expect(res.statusCode).toBe(201);
    const a = res.json().action;
    expect(a.reportId).toBe(reportId);
    expect(a.dueOn).toBe("2026-09-30");
    // Derived, not stored — and no column exists to store it in.
    expect(a.status).toBeDefined();
    expect(
      Object.keys(await prisma().correctiveAction.findFirstOrThrow()),
    ).not.toContain("status");
  });

  it("REFUSES AN ACTION WITH NO SOURCE, and one with two", async () => {
    /* With none it appears in no list and nobody does it; with two it is
       counted twice. Refused by the schema before the CHECK is reached,
       so an operator gets a sentence rather than a Postgres error. */
    const none = await create(manager(), { ...good(), reportId: undefined });
    expect(none.statusCode).toBe(400);

    const risk = await seedRisk();
    const two = await create(manager(), { ...good(), riskId: risk });
    expect(two.statusCode).toBe(400);

    expect(await prisma().correctiveAction.count()).toBe(0);
  });

  it("AND THE DATABASE REFUSES IT TOO — the CHECK constraint fires", async () => {
    /* The route's own validation could be removed in a refactor. This
       asserts the constraint underneath it, by going around the route
       entirely. A check nobody has seen fire is a check nobody knows
       works. */
    await expect(
      prisma().correctiveAction.create({
        data: { orgId, action: "orphan", ownerPost: "SAFETY_MANAGER", updatedAt: new Date() },
      }),
    ).rejects.toThrow();

    const risk = await seedRisk();
    await expect(
      prisma().correctiveAction.create({
        data: {
          orgId, action: "two sources", ownerPost: "SAFETY_MANAGER",
          reportId, riskId: risk, updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("THE PERSON WHO COMPLETED IT CANNOT VERIFY IT", async () => {
    /* The rule the whole loop rests on. Asserted end to end, because
       the refusal has to survive the route reading the row back. */
    const id = (await create(manager(), good())).json().action.id;
    expect((await act(manager(), id, "complete", { completionNote: "Guard fitted." })).statusCode)
      .toBe(200);

    const self = await act(manager(), id, "verify");
    expect(self.statusCode).toBe(409);
    expect(self.json().message).toMatch(/cannot also verify|asserted twice/i);

    // And somebody else can.
    const other = await act(exec(), id, "verify", { verificationNote: "Inspected 20 August." });
    expect(other.statusCode).toBe(200);
    expect(other.json().action.status).toBe("VERIFIED");
  });

  it("refuses a verification before there is anything to verify", async () => {
    const id = (await create(manager(), good())).json().action.id;
    const early = await act(exec(), id, "verify");
    expect(early.statusCode).toBe(409);
    expect(early.json().message).toMatch(/not been marked complete/i);
  });

  it("A SAFETY OFFICER MAY RAISE AND COMPLETE, AND MAY NOT VERIFY", async () => {
    /* Verification sits at audit.read, which the safety manager and key
       management hold and the safety officer does not — the separation
       this rule needs, taken from the matrix rather than invented. */
    const id = (await create(officer(), good())).json().action.id;
    expect((await act(officer(), id, "complete")).statusCode).toBe(200);
    expect((await act(officer(), id, "verify")).statusCode).toBe(403);
  });

  it("CANCELLING REQUIRES A REASON, and is not a delete", async () => {
    const id = (await create(manager(), good())).json().action.id;

    expect((await act(manager(), id, "cancel", {})).statusCode).toBe(400);
    expect((await act(manager(), id, "cancel", { cancelledReason: "" })).statusCode).toBe(400);

    const ok = await act(manager(), id, "cancel", {
      cancelledReason: "Bowser withdrawn from service; the hazard no longer exists.",
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().action.status).toBe("CANCELLED");
    // The row is still there. A cancellation is a recorded decision.
    expect(await prisma().correctiveAction.count({ where: { orgId } })).toBe(1);
  });

  it("refuses to complete an action that was cancelled", async () => {
    const id = (await create(manager(), good())).json().action.id;
    await act(manager(), id, "cancel", { cancelledReason: "Not proceeding." });
    const late = await act(manager(), id, "complete");
    expect(late.statusCode).toBe(409);
    expect(late.json().message).toMatch(/raise a new action/i);
  });

  it("CANNOT HANG AN ACTION OFF ANOTHER OPERATOR'S REPORT", async () => {
    // Not a leak of the report, but it would confirm the id exists.
    const res = await create(manager(), { ...good(), reportId: otherReportId });
    expect(res.statusCode).toBe(404);
    expect(await prisma().correctiveAction.count()).toBe(0);
  });

  it("cannot reach another operator's action at all", async () => {
    const id = (await create(manager(), good())).json().action.id;
    const stranger = tokenFor(
      (await prisma().user.create({
        data: { orgId: otherOrgId, email: "s@b.test", passwordHash: "x", name: "s", role: "SAFETY_MANAGER" },
      })).id,
      otherOrgId, "SAFETY_MANAGER",
    );
    expect((await act(stranger, id, "complete")).statusCode).toBe(404);
    expect((await list(stranger)).json().actions).toHaveLength(0);
  });

  it("SORTS UNDATED ACTIONS LAST, not first", async () => {
    /* Postgres sorts NULL first ascending by default, which would put
       every undated action above every overdue one — the least urgent
       rows at the top of a list whose whole job is urgency. */
    await create(manager(), { ...good(), dueOn: undefined });
    await create(manager(), { ...good(), dueOn: "2026-01-01" });
    await create(manager(), { ...good(), dueOn: "2026-12-01" });

    const body = (await list(manager())).json();
    expect(body.actions.map((a: { dueOn: string | null }) => a.dueOn))
      .toEqual(["2026-01-01", "2026-12-01", null]);
    expect(body.summary.undated).toBe(1);
    expect(body.summary.overdue).toBe(1);
  });

  it("appends an audit entry for every move", async () => {
    const id = (await create(manager(), good())).json().action.id;
    await act(manager(), id, "complete");
    await act(exec(), id, "verify");

    const actions = (await prisma().auditLog.findMany({ where: { orgId } })).map((a) => a.action);
    expect(actions).toContain("action.create");
    expect(actions).toContain("action.complete");
    expect(actions).toContain("action.verify");
  });

  it("requires a token", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/actions" })).statusCode).toBe(401);
  });

  async function seedRisk(): Promise<string> {
    const hazard = await prisma().hazard.create({
      data: { orgId, title: "Bowser drive coupling", description: "x", source: "REPORT" },
    });
    return (
      await prisma().riskAssessment.create({
        data: {
          orgId, hazardId: hazard.id, consequence: "Entanglement.",
          severity: "B_HAZARDOUS", likelihood: "REMOTE", score: 6,
          tolerability: "ACCEPTABLE", owner: "SAFETY_MANAGER",
        },
      })
    ).id;
  }
});
