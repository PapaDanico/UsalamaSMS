/* ============================================================
   WHAT HAPPENED TO THE REPORT — through the real route.

   The unit tests hold the graph. These hold the two things only a
   database can answer.

   FIRST: THE STORED STATE AND THE HISTORY MUST NOT DISAGREE.
   SafetyReport.state is written alongside the transition row because
   the triage queue's index is on it, and the moment those two writes
   can come apart, a report exists whose history does not explain where
   it is. That is the risk this denormalisation buys, so it is the
   assertion that pays for it.

   SECOND: TIME-TO-CLOSURE OFF REAL ROWS. The unit test proves the
   arithmetic reads the FIRST closure; this proves the route writes a
   history the arithmetic can read at all — which is the whole reason
   the table exists rather than a closedAt column.
   ============================================================ */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";
import { daysToFirstClosure } from "../../packages/shared/src/disposition";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;
let orgId: string;
let otherOrgId: string;
let managerId: string;
let officerId: string;
let frontlineId: string;
let otherManagerId: string;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

describe.skipIf(!hasDatabase)("report disposition, through the real route", () => {
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

  let reportId: string;

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
    frontlineId = await mk("frontline@a.test", "FRONTLINE", orgId);
    otherManagerId = await mk("manager@b.test", "SAFETY_MANAGER", otherOrgId);

    reportId = (
      await prisma().safetyReport.create({
        data: {
          orgId,
          clientId: "c-1",
          type: "HAZARD",
          title: "Loose panel fastener on the nose gear door",
          narrative: "Found during the walkaround.",
          reporterId: frontlineId,
        },
      })
    ).id;
  });

  const move = (token: string, body: unknown, id = reportId) =>
    app.inject({
      method: "POST", url: `/api/v1/reports/${id}/disposition`,
      headers: { authorization: `Bearer ${token}` }, payload: body as never,
    });
  const look = (token: string, id = reportId) =>
    app.inject({
      method: "GET", url: `/api/v1/reports/${id}/disposition`,
      headers: { authorization: `Bearer ${token}` },
    });

  it("A REPORT CAN LEAVE SUBMITTED AT ALL — the whole defect", async () => {
    /* Four of the five states were unreachable because nothing wrote
       the column. This is the one-line version of why the table
       exists. */
    const officer = tokenFor(officerId, orgId, "SAFETY_OFFICER");
    const res = await move(officer, { to: "TRIAGED" });
    expect(res.statusCode).toBe(201);

    const row = await prisma().safetyReport.findUniqueOrThrow({ where: { id: reportId } });
    expect(row.state).toBe("TRIAGED");
  });

  it("THE STORED STATE AND THE HISTORY AGREE, at every step", async () => {
    /* The assertion that pays for storing state alongside the history.
       Walked all the way to closure and back out again, checking both
       after every move — a partial write anywhere leaves a report whose
       history does not explain where it is. */
    const officer = tokenFor(officerId, orgId, "SAFETY_OFFICER");
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");

    const walk: Array<[string, Record<string, unknown>]> = [
      [officer, { to: "TRIAGED" }],
      [manager, { to: "UNDER_INVESTIGATION" }],
      [manager, { to: "ACTIONS_OPEN" }],
      [manager, { to: "CLOSED", note: "Fastener replaced, task card raised." }],
      [manager, { to: "ACTIONS_OPEN", note: "Recurred on the sister aircraft." }],
    ];

    for (const [token, body] of walk) {
      const res = await move(token, body);
      expect(res.statusCode, `${JSON.stringify(body)} was refused: ${res.body}`).toBe(201);

      const stored = await prisma().safetyReport.findUniqueOrThrow({ where: { id: reportId } });
      const history = await prisma().reportTransition.findMany({
        where: { reportId }, orderBy: { at: "asc" },
      });
      expect(
        stored.state,
        "the report's state disagrees with the last transition recorded for it",
      ).toBe(history[history.length - 1]!.toState);
    }

    const history = await prisma().reportTransition.findMany({
      where: { reportId }, orderBy: { at: "asc" },
    });
    expect(history).toHaveLength(5);
    // And each move starts where the previous one ended: no gaps.
    for (let i = 1; i < history.length; i++) {
      expect(history[i]!.fromState).toBe(history[i - 1]!.toState);
    }
  });

  it("TIME-TO-CLOSURE IS DERIVABLE FROM WHAT THE ROUTE WROTE", async () => {
    /* The point of the history table over a closedAt column. Closed,
       reopened, closed again — the indicator must read the FIRST
       closure, or reopening a report makes the operator's own numbers
       worse and nobody reopens anything. */
    const officer = tokenFor(officerId, orgId, "SAFETY_OFFICER");
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    await move(officer, { to: "TRIAGED" });
    await move(manager, { to: "CLOSED", note: "Duplicate of an existing register entry." });
    await move(manager, { to: "ACTIONS_OPEN", note: "Not a duplicate after all." });
    await move(manager, { to: "CLOSED", note: "Corrective action verified." });

    const report = await prisma().safetyReport.findUniqueOrThrow({ where: { id: reportId } });
    const history = await prisma().reportTransition.findMany({
      where: { reportId }, orderBy: { at: "asc" },
      select: { toState: true, at: true },
    });

    const days = daysToFirstClosure(
      report.createdAt,
      history.map((h) => ({ to: h.toState as never, at: h.at })),
    );
    expect(days, "a closure the same day should read as zero, not null").toBe(0);
    expect(history.filter((h) => h.toState === "CLOSED")).toHaveLength(2);
  });

  it("REFUSES A CLOSURE WITH NO NOTE, and says what is missing", async () => {
    const officer = tokenFor(officerId, orgId, "SAFETY_OFFICER");
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    await move(officer, { to: "TRIAGED" });

    const res = await move(manager, { to: "CLOSED" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("note_required");

    // Whitespace is not a note.
    expect((await move(manager, { to: "CLOSED", note: "   " })).statusCode).toBe(400);

    // And nothing was written by either attempt.
    expect(await prisma().reportTransition.count({ where: { reportId, toState: "CLOSED" } })).toBe(0);
    expect(
      (await prisma().safetyReport.findUniqueOrThrow({ where: { id: reportId } })).state,
    ).toBe("TRIAGED");
  });

  it("A SAFETY OFFICER MAY TRIAGE AND MAY NOT CLOSE", async () => {
    /* report.close was declared in the permission matrix and granted to
       SAFETY_MANAGER long before any route could use it. The route uses
       the matrix rather than a second one. */
    const officer = tokenFor(officerId, orgId, "SAFETY_OFFICER");
    expect((await move(officer, { to: "TRIAGED" })).statusCode).toBe(201);

    const res = await move(officer, { to: "CLOSED", note: "done" });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain("report.close");
  });

  it("refuses an illegal move and names the ones that are legal", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const res = await move(manager, { to: "CLOSED", note: "not triaged yet" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("illegal");
    expect(res.json().message).toContain("TRIAGED");
  });

  it("REFUSES A MOVE MADE FROM A STALE SCREEN", async () => {
    /* Two people with the queue open. Without this, the second one's
       move is applied from wherever the report actually is, which can
       silently undo the first one's disposition. */
    const officer = tokenFor(officerId, orgId, "SAFETY_OFFICER");
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    await move(officer, { to: "TRIAGED" });
    await move(manager, { to: "UNDER_INVESTIGATION" });

    const stale = await move(manager, { to: "UNDER_INVESTIGATION", fromState: "SUBMITTED" });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe("conflict");
    expect(stale.json().state).toBe("UNDER_INVESTIGATION");
  });

  it("ANOTHER OPERATOR'S REPORT ANSWERS NOT-FOUND, not forbidden", async () => {
    // A refusal confirms the row exists.
    const stranger = tokenFor(otherManagerId, otherOrgId, "SAFETY_MANAGER");
    expect((await move(stranger, { to: "TRIAGED" })).statusCode).toBe(404);
    expect((await look(stranger)).statusCode).toBe(404);
    expect(await prisma().reportTransition.count()).toBe(0);
  });

  it("TELLS A SAFETY OFFICER WHO TO ASK once their part is done", async () => {
    /* WRITTEN ON A WRONG ASSUMPTION AND THE MATRIX WAS RIGHT. I
       expected an officer to be offered the investigation. They are
       not: SAFETY_OFFICER holds `report.triage` and neither
       `report.investigate` nor `report.close`, which is a deliberate
       handoff that predates this route — the officer sorts the inbox,
       the manager or the investigator takes it from there.

       So the property asserted is the one that actually presents, and
       it is the more interesting one: after triage the officer has
       NOTHING available, and every move they cannot make is named with
       the permission it needs. A screen that simply hides those buttons
       teaches an officer that the product cannot close a report; one
       that names the permission teaches them who to ask. */
    const officer = tokenFor(officerId, orgId, "SAFETY_OFFICER");
    await move(officer, { to: "TRIAGED" });

    const seen = (await look(officer)).json();
    expect(seen.state).toBe("TRIAGED");
    expect(seen.available).toHaveLength(0);
    expect(
      seen.unavailable.map((u: { to: string; needs: string }) => `${u.to}:${u.needs}`).sort(),
    ).toEqual(["CLOSED:report.close", "UNDER_INVESTIGATION:report.investigate"]);
    expect(seen.history).toHaveLength(1);

    // And a manager looking at the same report is offered both.
    const asManager = (await look(tokenFor(managerId, orgId, "SAFETY_MANAGER"))).json();
    expect(asManager.available.map((a: { to: string }) => a.to).sort())
      .toEqual(["CLOSED", "UNDER_INVESTIGATION"]);
    expect(asManager.unavailable).toHaveLength(0);
  });

  it("appends an audit entry that does NOT carry the note", async () => {
    /* The note can quote a narrative, and the audit log is read by
       roles holding no narrative permission. The move is the auditable
       fact; the note stays on the row the tenancy check already
       guards. */
    const officer = tokenFor(officerId, orgId, "SAFETY_OFFICER");
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    await move(officer, { to: "TRIAGED" });
    await move(manager, { to: "CLOSED", note: "Discussed with the captain who filed it." });

    const entries = await prisma().auditLog.findMany({ where: { orgId, action: "report.disposition" } });
    expect(entries).toHaveLength(2);
    /* Serialised with a BigInt replacer rather than plain: AuditLog.seq
       is a BigInt and JSON.stringify throws on it, which failed this
       check for a reason that had nothing to do with what it asserts. A
       check that dies before reaching its assertion is not a check. */
    const asText = JSON.stringify(entries, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    expect(asText).not.toContain("captain");
    expect(entries.map((e) => (e.detail as { to: string }).to)).toEqual(["TRIAGED", "CLOSED"]);
  });

  it("requires a token", async () => {
    expect(
      (await app.inject({
        method: "POST", url: `/api/v1/reports/${reportId}/disposition`, payload: { to: "TRIAGED" },
      })).statusCode,
    ).toBe(401);
  });
});
