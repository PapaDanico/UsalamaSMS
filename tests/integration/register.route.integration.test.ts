/* ============================================================
   ELEMENTS 2.1 and 2.2, through the real route and a real Postgres.

   The register was the second of the three toolkits living in one
   browser. The matrix behind it was never the problem — riskScore()
   and tolerability() are shared, tested and rendered on /methodology.
   What was missing is the thing that makes a register a register:
   hazards held where the safety office can see them, with an owner, a
   review date and a status.

   THE ONE INVARIANT WORTH MOST HERE. The score and band are STORED,
   deliberately and against charter rule 6's usual direction, because an
   assessment is a decision taken on a date under the matrix as it
   stood. That exception is only safe while the stored value and the
   shared function agree — a register whose band disagrees with the
   scale it was scored on is a register an auditor stops trusting. So
   the checks below compare what came back from Postgres against
   tolerability() rather than against a number typed into the test.
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
let frontlineId: string;
let otherManagerId: string;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

const ENTRY = {
  hazard: "Bird activity on approach to runway 06",
  consequence: "Ingestion on short final leading to loss of thrust below 500 ft.",
  severity: "B_HAZARDOUS",
  likelihood: "OCCASIONAL",
  controls: "Aerodrome bird control log reviewed weekly; crews briefed at dispatch.",
  residualSeverity: "B_HAZARDOUS",
  residualLikelihood: "REMOTE",
  owner: "Samuel Kiprono",
  reviewBy: "2026-12-01",
  status: "MITIGATED",
};

describe.skipIf(!hasDatabase)("the risk register, through the real route", () => {
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
    otherManagerId = await mk("manager@b.test", "SAFETY_MANAGER", otherOrgId);
  });

  const post = (path: string, token: string, body: unknown) =>
    app.inject({ method: "POST", url: path, headers: { authorization: `Bearer ${token}` }, payload: body as never });
  const get = (path: string, token: string) =>
    app.inject({ method: "GET", url: path, headers: { authorization: `Bearer ${token}` } });

  it("stores an entry and reads it back whole", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    expect((await post("/api/v1/register", manager, ENTRY)).statusCode).toBe(201);

    const [entry] = (await get("/api/v1/register", manager)).json().entries;
    expect(entry.hazard).toBe(ENTRY.hazard);
    expect(entry.owner).toBe("Samuel Kiprono");
    expect(entry.reviewBy).toBe("2026-12-01");
    expect(entry.status).toBe("MITIGATED");
    expect(entry.controls).toContain("bird control log");
  });

  it("SCORES FROM THE SAME MATRIX /methodology RENDERS", async () => {
    /* The invariant the stored-score exception rests on. Compared
       against tolerability() rather than against a literal, so the day
       somebody revises the matrix this fails instead of leaving the
       register quietly disagreeing with the scale on the wall. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    await post("/api/v1/register", manager, ENTRY);

    const row = await prisma().riskAssessment.findFirstOrThrow({ where: { orgId } });
    expect(row.score).toBe(riskScore("B_HAZARDOUS", "OCCASIONAL"));
    expect(row.tolerability).toBe(tolerability("B_HAZARDOUS", "OCCASIONAL"));
    expect(row.residualScore).toBe(riskScore("B_HAZARDOUS", "REMOTE"));
    expect(row.residualTolerability).toBe(tolerability("B_HAZARDOUS", "REMOTE"));
  });

  it("REFUSES HALF A RESIDUAL POSITION", async () => {
    /* A residual severity with no residual likelihood is a control
       whose effect nobody stated. Accepting it would render a residual
       band the entry does not have — and the residual band is the one
       an executive signs against. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const half = { ...ENTRY };
    delete (half as Record<string, unknown>)["residualLikelihood"];

    const res = await post("/api/v1/register", manager, half);
    expect(res.statusCode).toBe(400);
    expect(await prisma().riskAssessment.count({ where: { orgId } })).toBe(0);
  });

  it("accepts an entry with no residual position at all", async () => {
    // Assessed today, controlled next week. A real state, and the
    // opposite sign of the check above.
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const bare = { ...ENTRY };
    delete (bare as Record<string, unknown>)["residualSeverity"];
    delete (bare as Record<string, unknown>)["residualLikelihood"];

    expect((await post("/api/v1/register", manager, bare)).statusCode).toBe(201);
    const row = await prisma().riskAssessment.findFirstOrThrow({ where: { orgId } });
    expect(row.residualScore).toBeNull();
    expect(row.residualTolerability).toBeNull();
  });

  it("ANOTHER OPERATOR'S REGISTER IS NOT VISIBLE", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const stranger = tokenFor(otherManagerId, otherOrgId, "SAFETY_MANAGER");
    await post("/api/v1/register", manager, ENTRY);

    expect((await get("/api/v1/register", stranger)).json().entries).toHaveLength(0);
    expect((await get("/api/v1/register", manager)).json().entries).toHaveLength(1);
  });

  it("withholds the register from a frontline reporter", async () => {
    /* Same judgement as the indicators and the staff roster: the
       reporting form and the documents to fill it in, not the safety
       office's instruments. Pinned so it is revisited on purpose. */
    const frontline = tokenFor(frontlineId, orgId, "FRONTLINE");
    expect((await get("/api/v1/register", frontline)).statusCode).toBe(403);
    expect((await post("/api/v1/register", frontline, ENTRY)).statusCode).toBe(403);
  });

  it("APPENDS AN AUDIT ENTRY, because a register that can be rewritten is a list", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    await post("/api/v1/register", manager, ENTRY);
    const actions = (await prisma().auditLog.findMany({ where: { orgId } })).map((a) => a.action);
    expect(actions).toContain("risk.register.entry");
  });

  it("marks a typed hazard as coming from the register, not from a report", async () => {
    /* The reporting queue is not wired into this yet and /coverage says
       so. The source field is what will make that difference visible
       when it is, rather than a migration guessing later. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    await post("/api/v1/register", manager, ENTRY);
    const hazard = await prisma().hazard.findFirstOrThrow({ where: { orgId } });
    expect(hazard.source).toBe("REGISTER");
    expect(hazard.reportId).toBeNull();
  });

  it("requires a token", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/register" })).statusCode).toBe(401);
  });
});
