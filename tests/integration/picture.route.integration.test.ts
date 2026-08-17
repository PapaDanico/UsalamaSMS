/* ============================================================
   THE RISK PICTURE, through the real route.

   picture.test.ts holds the arithmetic. What only a database can answer
   is the GATHERING: which rows each figure is built from, over what
   window, and whether a second operator's data can reach any of it.

   THE TWO CHECKS WORTH MOST HERE both concern a number that would look
   entirely reasonable if it were wrong:

     · the open-queue counts are over ALL TIME while the report count is
       over the window, and a report filed before the window that is
       still untriaged is exactly the one that must not vanish from
       "how many are open";
     · time to closure reads the FIRST closure, so reopening a report
       does not make the operator's own figures worse.

   Both would pass a smoke test, render without error, and mislead.
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

const DAY = 86_400_000;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

describe.skipIf(!hasDatabase)("the risk picture, through the real route", () => {
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
  });

  /* `days !== undefined`, not `days ?` — the truthy form sent no query
     parameter at all for days=0, so the clamp test below was measuring
     the default and reporting it as the floor. The one case a clamp
     exists for is the one a truthy check drops. */
  const picture = (token: string, days?: number) =>
    app.inject({
      method: "GET",
      url: `/api/v1/picture${days === undefined ? "" : `?days=${days}`}`,
      headers: { authorization: `Bearer ${token}` },
    });

  const report = (clientId: string, ago: number, state = "SUBMITTED", oid = orgId) =>
    prisma().safetyReport.create({
      data: {
        orgId: oid, clientId, type: "HAZARD", title: `Report ${clientId}`,
        narrative: "x", state: state as never,
        createdAt: new Date(Date.now() - ago * DAY),
      },
    });

  it("returns every band and every state, including the empty ones", async () => {
    /* A GROUP BY returns no row for a state with nothing in it. A
       picture that omits a band when it is empty looks identical to one
       whose query broke, and the second is the one worth noticing. */
    const body = (await picture(tokenFor(managerId, orgId, "SAFETY_MANAGER"))).json();
    expect(Object.keys(body.reporting.queue.by).sort()).toEqual([
      "ACTIONS_OPEN", "CLOSED", "SUBMITTED", "TRIAGED", "UNDER_INVESTIGATION",
    ]);
    expect(Object.keys(body.register.open.by).sort()).toEqual([
      "ACCEPTABLE", "INTOLERABLE", "TOLERABLE",
    ]);
    expect(body.reporting.queue.total).toBe(0);
  });

  it("THE OPEN QUEUE IS ALL TIME WHILE THE COUNT IS THE WINDOW", async () => {
    /* The check worth most. A report filed five months ago and never
       triaged is the single most important row in an SMS, and a
       90-day window would drop it out of "how many are open" — leaving
       a dashboard that gets cleaner the longer something is ignored. */
    await report("old-untriaged", 150);
    await report("recent", 5);

    const body = (await picture(tokenFor(managerId, orgId, "SAFETY_MANAGER"), 90)).json();
    expect(body.reporting.count, "the count is over the window").toBe(1);
    expect(
      body.reporting.queue.by.SUBMITTED,
      "a report older than the window fell out of the open queue",
    ).toBe(2);
    expect(body.reporting.queueScope).toBe("all");
  });

  it("MEASURES THE FIRST CLOSURE, not the latest, off real transition rows", async () => {
    /* Closed on day 3, reopened, closed again on day 20. It took three
       days the first time. Reporting 20 would describe the reopening as
       slowness, and an indicator that punishes reopening is one that
       stops reports being reopened. */
    const r = await report("reopened", 30);
    const move = (from: string, to: string, ago: number) =>
      prisma().reportTransition.create({
        data: {
          orgId, reportId: r.id, fromState: from as never, toState: to as never,
          byUserId: managerId, at: new Date(Date.now() - ago * DAY),
          ...(to === "CLOSED" ? { note: "done" } : {}),
        },
      });
    await move("SUBMITTED", "TRIAGED", 29);
    await move("TRIAGED", "CLOSED", 27);          // day 3
    await move("CLOSED", "ACTIONS_OPEN", 15);
    await move("ACTIONS_OPEN", "CLOSED", 10);     // day 20

    // Four more so the sample clears MIN_SAMPLE and a median is shown.
    for (let i = 0; i < 4; i++) {
      const x = await report(`quick-${i}`, 10);
      await prisma().reportTransition.create({
        data: {
          orgId, reportId: x.id, fromState: "TRIAGED", toState: "CLOSED",
          note: "done", byUserId: managerId, at: new Date(Date.now() - 9 * DAY),
        },
      });
    }

    const body = (await picture(tokenFor(managerId, orgId, "SAFETY_MANAGER"), 180)).json();
    expect(body.reporting.closure.n, "the reopened report was counted twice").toBe(5);
    expect(body.reporting.closure.median).toBe(1);
    expect(
      body.reporting.closure.p90,
      "the tail should be the reopened report's FIRST closure at 3 days, not its second at 20",
    ).toBe(3);
  });

  it("NAMES A RISK OWNED BELOW ITS BAND — the thing no incumbent checks", async () => {
    const hazard = await prisma().hazard.create({
      data: { orgId, title: "Bird activity on approach", description: "x", source: "REPORT" },
    });
    await prisma().riskAssessment.create({
      data: {
        orgId, hazardId: hazard.id, consequence: "Ingestion on short final.",
        severity: "B_HAZARDOUS", likelihood: "OCCASIONAL", score: 8,
        tolerability: "TOLERABLE", owner: "SAFETY_OFFICER",
        alarpJustification: "Bird control contract in place.",
      },
    });

    const body = (await picture(tokenFor(managerId, orgId, "SAFETY_MANAGER"))).json();
    expect(body.register.open.by.TOLERABLE).toBe(1);
    expect(body.register.holderGaps).toHaveLength(1);
    expect(body.register.holderGaps[0].verdict).toBe("below");
    expect(body.register.holderGaps[0].needs).toBe("ACCOUNTABLE_EXECUTIVE");
    expect(body.register.holderGaps[0].hazard).toContain("Bird");
  });

  it("counts a risk at its RESIDUAL band, where it has one", async () => {
    /* The position actually being carried, not the one it started from.
       Counting the initial band would make a register of successfully
       mitigated risks read as a register full of amber. */
    const hazard = await prisma().hazard.create({
      data: { orgId, title: "Loose fastener", description: "x", source: "REPORT" },
    });
    await prisma().riskAssessment.create({
      data: {
        orgId, hazardId: hazard.id, consequence: "Panel departure.",
        severity: "B_HAZARDOUS", likelihood: "OCCASIONAL", score: 8,
        tolerability: "TOLERABLE",
        residualSeverity: "D_MINOR", residualLikelihood: "IMPROBABLE",
        residualScore: 2, residualTolerability: "ACCEPTABLE",
        owner: "SAFETY_MANAGER",
        alarpJustification: "Task card raised.",
      },
    });

    const body = (await picture(tokenFor(managerId, orgId, "SAFETY_MANAGER"))).json();
    expect(body.register.open.by.ACCEPTABLE).toBe(1);
    expect(body.register.open.by.TOLERABLE).toBe(0);
    expect(body.register.holderGaps, "a mitigated risk was reported as a governance gap")
      .toHaveLength(0);
  });

  it("counts a change that took effect and was never reviewed", async () => {
    await prisma().changeAssessment.create({
      data: {
        orgId, title: "Second aircraft", description: "x", trigger: "FLEET",
        assessedOn: new Date(Date.now() - 60 * DAY),
        effectiveFrom: new Date(Date.now() - 30 * DAY),
        severity: "C_MAJOR", likelihood: "REMOTE", score: 6, tolerability: "ACCEPTABLE",
        status: "IN_EFFECT", updatedAt: new Date(),
      },
    });
    const body = (await picture(tokenFor(managerId, orgId, "SAFETY_MANAGER"))).json();
    expect(body.changes.inEffectUnreviewed).toBe(1);
  });

  it("SEES NOTHING OF ANOTHER OPERATOR, in any figure on the page", async () => {
    await report("theirs-1", 5, "SUBMITTED", otherOrgId);
    await report("theirs-2", 5, "CLOSED", otherOrgId);
    const theirHazard = await prisma().hazard.create({
      data: { orgId: otherOrgId, title: "Their hazard", description: "x", source: "REPORT" },
    });
    await prisma().riskAssessment.create({
      data: {
        orgId: otherOrgId, hazardId: theirHazard.id, consequence: "x",
        severity: "A_CATASTROPHIC", likelihood: "FREQUENT", score: 20,
        tolerability: "INTOLERABLE", owner: "SAFETY_OFFICER",
      },
    });

    const body = (await picture(tokenFor(managerId, orgId, "SAFETY_MANAGER"))).json();
    expect(body.reporting.queue.total).toBe(0);
    expect(body.register.open.total).toBe(0);
    expect(body.register.holderGaps).toHaveLength(0);
    expect(JSON.stringify(body)).not.toContain("Their hazard");
  });

  it("REFUSES TO CALL THE COUNT A RATE, on the wire and not only in the module", async () => {
    await report("one", 5);
    const body = (await picture(tokenFor(managerId, orgId, "SAFETY_MANAGER"), 30)).json();
    expect(body.reporting.rate).toBeNull();
    expect(body.reporting.note).toMatch(/not a rate/i);
    expect(body.reporting.window ?? body.window.days).toBeTruthy();
  });

  it("clamps an absurd window rather than trusting it", async () => {
    for (const [asked, expected] of [[0, 7], [99999, 730], [NaN, 90]] as const) {
      const body = (await picture(tokenFor(managerId, orgId, "SAFETY_MANAGER"), asked)).json();
      expect(body.window.days).toBe(expected);
    }
  });

  it("refuses a role that may not read the organisation's reports", async () => {
    expect((await picture(tokenFor(frontlineId, orgId, "FRONTLINE"))).statusCode).toBe(403);
  });

  /* ==============================================================
     BARRIER HEALTH — the part only a database can answer.

     barriers.test.ts holds the judgements: what counts as degraded,
     and what the module refuses to claim. What it cannot hold is the
     GATHERING, and the gathering is where this one can fail silently.

     THE ATTRIBUTION PATH IS A TWO-HOP JOIN. `hrcTags` lives on
     SafetyReport; a register entry reaches it only through
     RiskAssessment -> Hazard -> SafetyReport, and a corrective action
     only through its own `reportId`. Get either wrong — select the
     wrong relation, forget the nested select, join through a null —
     and the route still answers 200 with a perfectly well-formed
     barrier block in which NOTHING is attributed. The screen would
     then print "0 of 9 could be placed", which is a sentence this
     product might legitimately print, so nothing downstream can tell
     the broken join from an operator whose findings genuinely carry no
     category.

     That is why the assertion is that a finding WITH a category
     arrives WITH it, alongside one that has none. A test that only
     checked the total would pass with the join removed.
     ============================================================== */
  it("REACHES THE HRC THROUGH TWO JOINS, and says what it could not reach", async () => {
    const tagged = await prisma().safetyReport.create({
      data: {
        orgId, clientId: "bwi-report", type: "HAZARD", title: "Birds on the threshold",
        narrative: "x", hrcTags: ["BWI"],
      },
    });

    /* 1 · an overdue mitigation raised FROM that report — reachable. */
    await prisma().correctiveAction.create({
      data: {
        orgId, reportId: tagged.id, action: "Re-brief crews on the threshold",
        ownerPost: "SAFETY_MANAGER", dueOn: new Date(Date.now() - 31 * DAY),
      },
    });

    /* 2 · a register entry whose hazard came from that report — the
           two-hop path, and the one most likely to be got wrong. */
    const hazard = await prisma().hazard.create({
      data: {
        orgId, reportId: tagged.id, title: "Bird activity at the threshold",
        description: "x", source: "REPORT",
      },
    });
    await prisma().riskAssessment.create({
      data: {
        orgId, hazardId: hazard.id, consequence: "Engine ingestion",
        severity: "B_HAZARDOUS", likelihood: "OCCASIONAL", score: 8,
        tolerability: "TOLERABLE", owner: "SAFETY_MANAGER",
        reviewBy: new Date(Date.now() - 5 * DAY),
      },
    });

    /* 3 · a training lapse, which can reach no category by any path. */
    await prisma().trainingRecord.create({
      data: {
        orgId, userId: frontlineId, course: "Dangerous goods awareness",
        completedOn: new Date(Date.now() - 400 * DAY),
        expiresOn: new Date(Date.now() - 35 * DAY),
      },
    });

    const b = (await picture(tokenFor(managerId, orgId, "SAFETY_MANAGER"))).json().barriers;

    expect(b.total, "all three degraded barriers should be read").toBe(3);
    expect(b.byKind.MITIGATION).toBe(1);
    expect(b.byKind.CONTROL_REVIEW).toBe(1);
    expect(b.byKind.COMPETENCE).toBe(1);

    /* The join actually carried the tag, through both paths. */
    expect(
      b.byHrc,
      "nothing reached a high-risk category — the report join returned no tags, which " +
        "is indistinguishable on screen from an operator whose findings carry none",
    ).toEqual([{ code: "BWI", label: "Bird or wildlife strike", count: 2 }]);

    /* And what could not be placed is counted rather than dropped. */
    expect(b.unattributed).toBe(1);
    expect(b.attribution).toBeCloseTo(2 / 3, 5);
    expect(b.degraded).toHaveLength(3);
    expect(b.truncated).toBe(false);
  });

  it("A CANCELLED ACTION AND A CLOSED FINDING ARE NOT DEGRADED BARRIERS", async () => {
    /* The route's WHERE clauses, not the module's guards — a `where`
       that forgot `cancelledOn: null` would report an action the
       operator explicitly decided against as an open failure, and the
       module never sees the row to refuse it. */
    await prisma().correctiveAction.create({
      data: {
        orgId, action: "Superseded control", ownerPost: "SAFETY_MANAGER",
        dueOn: new Date(Date.now() - 40 * DAY),
        cancelledOn: new Date(Date.now() - 30 * DAY),
        cancelledReason: "Replaced by a procedural change",
        findingId: (
          await prisma().auditFinding.create({
            data: {
              orgId, auditRef: "IA-01", finding: "Closed already",
              ownerPost: "SAFETY_MANAGER",
              dueBy: new Date(Date.now() - 20 * DAY),
              closedOn: new Date(Date.now() - 2 * DAY),
            },
          })
        ).id,
      },
    });

    const b = (await picture(tokenFor(managerId, orgId, "SAFETY_MANAGER"))).json().barriers;
    expect(b.total).toBe(0);
    expect(b.attribution, "an empty record is fully attributed, not zero").toBe(1);
  });

  it("does not read another operator's degraded barriers", async () => {
    /* An action carries exactly one source — the CHECK in the migration
       — so the competitor's action hangs off the competitor's report. */
    const theirs = await prisma().safetyReport.create({
      data: {
        orgId: otherOrgId, clientId: "theirs", type: "HAZARD",
        title: "Their report", narrative: "x", hrcTags: ["RE"],
      },
    });
    await prisma().correctiveAction.create({
      data: {
        orgId: otherOrgId, reportId: theirs.id, action: "Their overdue action",
        ownerPost: "SAFETY_MANAGER", dueOn: new Date(Date.now() - 10 * DAY),
      },
    });
    const body = (await picture(tokenFor(managerId, orgId, "SAFETY_MANAGER"))).json();
    expect(body.barriers.total).toBe(0);
    expect(JSON.stringify(body)).not.toContain("Their overdue action");
  });

  it("requires a token", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/picture" })).statusCode,
    ).toBe(401);
  });
});
