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
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    await post("/api/v1/register", manager, ENTRY);
    const hazard = await prisma().hazard.findFirstOrThrow({ where: { orgId } });
    expect(hazard.source).toBe("REGISTER");
    expect(hazard.reportId).toBeNull();
  });

  /* ============================================================
     RAISED FROM A REPORT — the join this product did not have.

     `Hazard.reportId` has been in the schema since the first migration
     and NOTHING HAS EVER WRITTEN IT. Every hazard in every register was
     typed by hand while the reports that should have produced them sat
     in the queue, which is the finding element 2.1 exists to prevent:
     hazard identification is meant to be fed by the reporting system.

     WHAT MUST NOT TRAVEL is the report's content. A register is
     printed, taken to a meeting and shown to an inspector; a narrative
     is protected and may be anonymous. So the link is an ID, the
     hazard's words are the safety officer's own, and the assertions
     below check the second half as hard as the first.
     ============================================================ */
  describe("raised from a report", () => {
    const filedReport = async (oid: string, uid: string) =>
      (
        await prisma().safetyReport.create({
          data: {
            orgId: oid,
            reporterId: uid,
            clientId: crypto.randomUUID(),
            type: "HAZARD",
            title: "Flock of ibis on the 06 threshold at first light",
            narrative:
              "Second morning running. Kip on the early turn said the same thing happened " +
              "to him on Tuesday and nobody had told dispatch.",
            jurisdiction: "KE",
            awareAt: new Date(),
          },
        })
      ).id;

    it("LINKS THE HAZARD TO THE REPORT AND CARRIES NONE OF ITS WORDS", async () => {
      const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
      const reportId = await filedReport(orgId, frontlineId);

      const res = await post("/api/v1/register", manager, {
        ...ENTRY,
        hazard: "Bird activity on the 06 approach at first light",
        consequence: "Ingestion on short final leading to loss of thrust below 500 ft.",
        fromReportId: reportId,
      });
      expect(res.statusCode).toBe(201);

      const hazard = await prisma().hazard.findFirstOrThrow({ where: { orgId } });
      expect(hazard.reportId).toBe(reportId);
      expect(hazard.source).toBe("REPORT");

      /* THE HALF THAT MATTERS MORE. The narrative names a colleague and
         describes when he was on duty — at a six-aircraft operator that
         identifies him. None of it may reach a register. */
      const stored = `${hazard.title}\n${hazard.description}`;
      expect(stored).not.toContain("Kip");
      expect(stored).not.toContain("Tuesday");
      expect(stored).not.toContain("nobody had told dispatch");

      // And the same holds for what the screen reads back.
      const [entry] = (await get("/api/v1/register", manager)).json().entries;
      expect(entry.source).toBe("REPORT");
      expect(entry.fromReportId).toBe(reportId);
      expect(`${entry.hazard}\n${entry.consequence}`).not.toContain("Kip");
    });

    it("REFUSES ANOTHER OPERATOR'S REPORT BY NAME, rather than on a constraint", async () => {
      /* reportId is a foreign key, so an id from another tenant would
         either be accepted — putting one operator's report in another's
         register — or fail with a database error the caller cannot act
         on. Neither is an answer. */
      const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
      const theirs = await filedReport(otherOrgId, otherManagerId);

      const res = await post("/api/v1/register", manager, { ...ENTRY, fromReportId: theirs });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("report_not_found");
      expect(await prisma().hazard.count({ where: { orgId } })).toBe(0);
    });

    it("refuses a report id that does not exist at all", async () => {
      const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
      const res = await post("/api/v1/register", manager, {
        ...ENTRY,
        fromReportId: "11111111-2222-3333-4444-555555555555",
      });
      expect(res.statusCode).toBe(404);
      expect(await prisma().hazard.count({ where: { orgId } })).toBe(0);
    });

    it("lets one report raise more than one hazard", async () => {
      /* Deliberately not idempotent on the report. One occurrence
         routinely reveals several hazards — the bird activity, and the
         fact that the previous sighting never reached dispatch — and
         refusing the second would push it into a free-text register
         entry with no link at all. */
      const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
      const reportId = await filedReport(orgId, frontlineId);

      await post("/api/v1/register", manager, { ...ENTRY, hazard: "Bird activity", fromReportId: reportId });
      await post("/api/v1/register", manager, {
        ...ENTRY, hazard: "Sightings not reaching dispatch", fromReportId: reportId,
      });

      const raised = await prisma().hazard.findMany({ where: { orgId, reportId } });
      expect(raised).toHaveLength(2);
      expect(raised.every((h) => h.source === "REPORT")).toBe(true);
    });
  });

  it("requires a token", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/register" })).statusCode).toBe(401);
  });

  /* ============================================================
     ACCEPTING A RISK — the act, and the four refusals around it.

     WHAT THIS SUITE EXISTS FOR. Before it, `acceptedById` and
     `acceptedAt` had been in the schema since the first migration and
     no code had ever written either; `risk.accept.tolerable` was in the
     matrix and no route read it; and `status` came off the request
     body, so any holder of `hazard.manage` — which includes the Safety
     Officer — could file the reddest cell on the Doc 9859 matrix
     already marked ACCEPTED.

     The register then read "accepted" against a risk nobody with the
     standing to accept it had ever seen, which is precisely what the
     escalation rule in holder.ts was written to prevent while nothing
     called it.
     ============================================================ */
  describe("acceptance", () => {
    let officerId: string;
    let execId: string;

    beforeEach(async () => {
      officerId = (
        await prisma().user.create({
          data: {
            orgId, email: "officer@a.test", passwordHash: "x",
            name: "Grace Wanjiru", role: "SAFETY_OFFICER" as never,
          },
        })
      ).id;
      execId = (
        await prisma().user.create({
          data: {
            orgId, email: "ae@a.test", passwordHash: "x",
            name: "Daniel Mwangi", role: "ACCOUNTABLE_EXECUTIVE" as never,
          },
        })
      ).id;
    });

    /** File an entry and return the assessment id the accept route takes. */
    const file = async (overrides: Record<string, unknown> = {}): Promise<string> => {
      const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
      const res = await post("/api/v1/register", manager, { ...ENTRY, ...overrides });
      expect(res.statusCode).toBe(201);
      return res.json().entry.assessmentId;
    };

    it("REFUSES TO TAKE 'ACCEPTED' FROM THE REQUEST BODY", async () => {
      /* The defect this whole block was written for. A safety officer
         holds hazard.manage, so they could file this — and the entry
         would read as signed off by nobody. */
      const officer = tokenFor(officerId, orgId, "SAFETY_OFFICER");
      const res = await post("/api/v1/register", officer, {
        ...ENTRY,
        severity: "A_CATASTROPHIC",
        likelihood: "FREQUENT",
        residualSeverity: "A_CATASTROPHIC",
        residualLikelihood: "FREQUENT",
        status: "ACCEPTED",
      });
      expect(res.statusCode).toBe(400);

      // And nothing was written under any other status either.
      expect(await prisma().riskAssessment.count({ where: { orgId } })).toBe(0);
    });

    it("records WHO signed and WHEN, which is the line an auditor reads", async () => {
      const id = await file({
        residualSeverity: "D_MINOR", residualLikelihood: "IMPROBABLE", // green
      });
      const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
      const res = await post(`/api/v1/register/${id}/accept`, manager, {});
      expect(res.statusCode).toBe(200);

      const row = await prisma().riskAssessment.findFirstOrThrow({ where: { id } });
      expect(row.acceptedById).toBe(managerId);
      expect(row.acceptedAt).toBeInstanceOf(Date);
      expect(row.status).toBe("ACCEPTED");

      // And the screen can name them without a second request.
      const [entry] = (await get("/api/v1/register", manager)).json().entries;
      expect(entry.acceptedBy).toBe("manager@a.test");
      expect(entry.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("REFUSES AN AMBER RISK TO THE SAFETY MANAGER — RA 1210's escalation", async () => {
      /* The differentiator, enforced. A tolerable risk is being
         accepted because reducing it further is not reasonably
         practicable: a judgement about money against safety, which
         belongs with the post that can spend it. The refusal names that
         post rather than saying "forbidden". */
      const id = await file(); // B_HAZARDOUS x REMOTE residual = amber
      const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
      const res = await post(`/api/v1/register/${id}/accept`, manager, {
        alarpJustification: "Bird control contract in place and reviewed weekly.",
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("below_authority");
      expect(res.json().requires).toBe("ACCOUNTABLE_EXECUTIVE");

      const row = await prisma().riskAssessment.findFirstOrThrow({ where: { id } });
      expect(row.acceptedById).toBeNull();
      expect(row.status).not.toBe("ACCEPTED");
    });

    it("lets the accountable executive sign the same amber risk", async () => {
      const id = await file();
      const exec = tokenFor(execId, orgId, "ACCOUNTABLE_EXECUTIVE");
      const res = await post(`/api/v1/register/${id}/accept`, exec, {
        alarpJustification: "Bird control contract in place and reviewed weekly.",
      });
      expect(res.statusCode).toBe(200);

      const row = await prisma().riskAssessment.findFirstOrThrow({ where: { id } });
      expect(row.acceptedById).toBe(execId);
      expect(row.alarpJustification).toContain("Bird control contract");
    });

    it("REFUSES AN AMBER RISK WITH NO ALARP STATEMENT, even to the executive", async () => {
      /* RiskAssessInputSchema has required this since the SRA was
         written. The register was built with its own schema and never
         inherited it, so the one band where ALARP is the whole question
         could be signed with nothing said. */
      const id = await file();
      const exec = tokenFor(execId, orgId, "ACCOUNTABLE_EXECUTIVE");
      const res = await post(`/api/v1/register/${id}/accept`, exec, {});
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("alarp_required");

      const row = await prisma().riskAssessment.findFirstOrThrow({ where: { id } });
      expect(row.acceptedAt).toBeNull();
    });

    it("REFUSES AN INTOLERABLE RISK TO EVERYBODY, the executive included", async () => {
      /* Doc 9859's red band is not "acceptable with a senior enough
         signature". Escalating it would turn a refusal into a queue. */
      const id = await file({
        severity: "A_CATASTROPHIC", likelihood: "FREQUENT",
        residualSeverity: "A_CATASTROPHIC", residualLikelihood: "OCCASIONAL",
      });
      const exec = tokenFor(execId, orgId, "ACCOUNTABLE_EXECUTIVE");
      const res = await post(`/api/v1/register/${id}/accept`, exec, {
        alarpJustification: "Everything reasonably practicable has been done.",
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("not_ownable");
      expect(res.json().message).toContain("controls have to change");
    });

    it("REFUSES THE SAFETY OFFICER OUTRIGHT — no acceptance permission at all", async () => {
      const id = await file({
        residualSeverity: "D_MINOR", residualLikelihood: "IMPROBABLE",
      });
      const officer = tokenFor(officerId, orgId, "SAFETY_OFFICER");
      expect((await post(`/api/v1/register/${id}/accept`, officer, {})).statusCode).toBe(403);
    });

    it("will not overwrite a signature by accepting twice", async () => {
      const id = await file({
        residualSeverity: "D_MINOR", residualLikelihood: "IMPROBABLE",
      });
      const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
      expect((await post(`/api/v1/register/${id}/accept`, manager, {})).statusCode).toBe(200);

      const exec = tokenFor(execId, orgId, "ACCOUNTABLE_EXECUTIVE");
      const second = await post(`/api/v1/register/${id}/accept`, exec, {});
      expect(second.statusCode).toBe(409);
      expect(second.json().error).toBe("already_accepted");

      const row = await prisma().riskAssessment.findFirstOrThrow({ where: { id } });
      expect(row.acceptedById).toBe(managerId);
    });

    it("cannot accept another operator's risk", async () => {
      const id = await file({
        residualSeverity: "D_MINOR", residualLikelihood: "IMPROBABLE",
      });
      const outsider = tokenFor(otherManagerId, otherOrgId, "SAFETY_MANAGER");
      expect((await post(`/api/v1/register/${id}/accept`, outsider, {})).statusCode).toBe(404);
    });

    it("names the band it was accepted in, in the audit trail", async () => {
      /* "risk.accept" alone cannot answer the question an inspector
         actually asks, which is who accepted the amber ones. */
      const id = await file();
      const exec = tokenFor(execId, orgId, "ACCOUNTABLE_EXECUTIVE");
      await post(`/api/v1/register/${id}/accept`, exec, {
        alarpJustification: "Reviewed weekly; further reduction not reasonably practicable.",
      });
      const actions = (await prisma().auditLog.findMany({ where: { orgId } })).map((a) => a.action);
      expect(actions).toContain("risk.accept.tolerable");
    });
  });
});
