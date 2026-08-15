/* ============================================================
   THE ORGANISATION'S QUEUE, WHICH NOTHING OWNED.

   routes.reports.ts is covered — by the disposition suite, the
   retraction suite, the notified suite and the ADREP suite. Every one
   of those is about something the route does; none is about the route.
   The queue's own projection is asserted only as a side effect of a
   file named after occurrence attributes, which means the day somebody
   changes the `select` the failing test is in a file about something
   else, and the natural reaction is to fix the assertion rather than
   the change.

   WHAT THIS ASSERTS is the queue as a queue: what it carries, what it
   leaves out, what it says about its own limits, and who may read it.
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
let otherManagerId: string;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

describe.skipIf(!hasDatabase)("the organisation's reporting queue", () => {
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
    otherManagerId = await mk(otherOrgId, "manager@b.test", "SAFETY_MANAGER");
  });

  const manager = () => tokenFor(managerId, orgId, "SAFETY_MANAGER");
  const reporter = () => tokenFor(reporterId, orgId, "FRONTLINE");
  const otherManager = () => tokenFor(otherManagerId, otherOrgId, "SAFETY_MANAGER");

  const queue = (token: string) =>
    app.inject({
      method: "GET",
      url: "/api/v1/reports/queue",
      headers: { authorization: `Bearer ${token}` },
    });

  let n = 0;
  const mkReport = async (
    org = orgId,
    extra: Record<string, unknown> = {},
  ) => {
    n += 1;
    const hex = n.toString(16).padStart(12, "0");
    return prisma().safetyReport.create({
      data: {
        orgId: org,
        clientId: `00000000-0000-4000-8000-${hex}`,
        type: "MOR" as never,
        title: `Excursion ${n}`,
        narrative: "x",
        ...extra,
      },
    });
  };

  it("carries this operator's reports", async () => {
    await mkReport();
    await mkReport();
    const body = (await queue(manager())).json();

    expect(body.reports).toHaveLength(2);
    expect(body.truncated).toBe(false);
  });

  /* Another operator's report is not in this operator's queue, and the
     WHERE clause is where that is enforced rather than a filter after
     the fact. */
  it("carries nothing of another operator's", async () => {
    await mkReport(otherOrgId);
    expect((await queue(manager())).json().reports).toHaveLength(0);
    expect((await queue(otherManager())).json().reports).toHaveLength(1);
  });

  /* A RETRACTED REPORT IS NOT TODAY'S WORK. The reporter withdrew it —
     a duplicate, or one filed against the wrong aircraft — and leaving
     it here makes the safety office triage work already withdrawn. The
     row and its audit entry remain; only the queue stops showing it. */
  it("drops a retracted report from the queue and not from the record", async () => {
    const live = await mkReport();
    const gone = await mkReport();
    await prisma().safetyReport.update({
      where: { id: gone.id },
      data: { retractedAt: new Date(), retractedReason: "duplicate" },
    });

    const ids = (await queue(manager())).json().reports.map((r: { id: string }) => r.id);
    expect(ids).toContain(live.id);
    expect(ids).not.toContain(gone.id);

    /* Still there. Retraction is a tombstone, never a delete. */
    expect(await prisma().safetyReport.findUnique({ where: { id: gone.id } })).not.toBeNull();
  });

  /* The screen computes a reporting deadline per row and, until this
     column travelled with the row, had no way to know the call had been
     made — so the countdown counted down for ever. */
  it("carries whether the authority was told", async () => {
    const told = new Date();
    await mkReport(orgId, { reportedToAuthorityAt: told });
    const row = (await queue(manager())).json().reports[0];

    expect(row.reportedToAuthorityAt).toBe(told.toISOString());
  });

  /* THE REFERENCE IS DELIBERATELY NOT HERE. It is the operator's record
     to hand over, not a field to spray across every queue response. */
  it("does not spray the authority's reference across the queue", async () => {
    await mkReport(orgId, {
      reportedToAuthorityAt: new Date(),
      authorityReference: "KCAA/2026/0001",
    });
    expect((await queue(manager())).body).not.toContain("KCAA/2026/0001");
  });

  /* Returned rather than left to the client to work out, for the same
     reason the deadline is computed server-side: a screen that decides
     which buttons a role may press is a second copy of the permission
     matrix, and it is the copy that goes stale. */
  it("says what THIS caller may do to each row", async () => {
    await mkReport();
    const row = (await queue(manager())).json().reports[0];

    expect(Array.isArray(row.available)).toBe(true);
    expect(row.available.length).toBeGreaterThan(0);
    for (const move of row.available) {
      expect(move.to).toBeTruthy();
      expect(move.label).toBeTruthy();
    }
  });

  it("offers a frontline reporter fewer moves than the safety manager", async () => {
    await mkReport();
    const asManager = (await queue(manager())).json().reports[0].available.length;
    const asReporter = (await queue(reporter())).json();

    /* A reporter may not hold report.read.org at all, in which case the
       route refuses — which is itself the answer. Either way they do
       not get the safety manager's moves. */
    if (asReporter.reports) {
      expect(asReporter.reports[0].available.length).toBeLessThan(asManager);
    } else {
      expect([401, 403]).toContain((await queue(reporter())).statusCode);
    }
  });

  /* STATED RATHER THAN LEFT TO BE INFERRED FROM A ROUND NUMBER. A
     truncated queue that looks complete is how a report at the bottom
     stops existing. */
  it("declares whether it was truncated at all", async () => {
    await mkReport();
    expect((await queue(manager())).json()).toHaveProperty("truncated");
  });

  it("refuses without a token", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/reports/queue" })).statusCode,
    ).toBe(401);
  });
});
