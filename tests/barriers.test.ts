/* ============================================================
   BARRIER HEALTH.

   The assertions that matter here are not "it counts overdue things".
   They are the two judgements the module makes on the operator's
   behalf, both of which could be made wrongly and silently:

     1. what counts as degraded — a cancelled action is a decision, not
        a failure, and counting it would punish honest closure;
     2. what it refuses to claim — four of the six precursors cannot
        reach an HRC, and a per-category view built from the two that
        can would print a confident number from a fraction of the
        evidence.

   The attribution assertions are the load-bearing ones. Drop them and
   this module can quietly start hiding whatever it cannot place.
   ============================================================ */

import { describe, expect, it } from "vitest";
import { barrierHealth, BARRIER_KINDS } from "../packages/shared/src/barriers";

const NOW = new Date("2026-08-17T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("what counts as a degraded barrier", () => {
  it("reports an action past its due date, with the days the operator is late by", () => {
    const h = barrierHealth(
      { actions: [{ id: "a", action: "Re-brief crews", dueOn: daysAgo(9), ownerPost: "SAFETY_MANAGER" }] },
      NOW
    );
    expect(h.degraded).toHaveLength(1);
    expect(h.degraded[0]!.kind).toBe("MITIGATION");
    expect(h.degraded[0]!.daysLate).toBe(9);
    expect(h.degraded[0]!.ownerPost).toBe("SAFETY_MANAGER");
  });

  it("does not report one that is not due yet", () => {
    const h = barrierHealth({ actions: [{ id: "a", action: "x", dueOn: daysAhead(3) }] }, NOW);
    expect(h.degraded).toHaveLength(0);
  });

  it("does not report one with no due date at all", () => {
    /* capa.ts records undated actions deliberately rather than guessing
       a date. An undated action is not late; inventing a deadline to
       make it appear here would be this module setting the commitment. */
    const h = barrierHealth({ actions: [{ id: "a", action: "x", dueOn: null }] }, NOW);
    expect(h.degraded).toHaveLength(0);
  });

  it("treats a CANCELLED action as a decision rather than a failure", () => {
    const h = barrierHealth(
      { actions: [{ id: "a", action: "x", dueOn: daysAgo(40), cancelledOn: daysAgo(30) }] },
      NOW
    );
    expect(h.degraded).toHaveLength(0);
  });

  it("and a completed one as closed, however late it was", () => {
    const h = barrierHealth(
      { actions: [{ id: "a", action: "x", dueOn: daysAgo(40), completedOn: daysAgo(1) }] },
      NOW
    );
    expect(h.degraded).toHaveLength(0);
  });

  it("reports each of the six kinds from its own record", () => {
    const h = barrierHealth(
      {
        actions: [{ id: "1", action: "a", dueOn: daysAgo(1) }],
        assessments: [{ id: "2", hazardTitle: "Bird activity", reviewBy: daysAgo(2) }],
        training: [{ id: "3", who: "R. Otieno", course: "SMS induction", expiresOn: daysAgo(3) }],
        changes: [{ id: "4", title: "New night operation", reviewDueOn: daysAgo(4) }],
        findings: [{ id: "5", auditRef: "IA-02", finding: "No ramp checklist", dueBy: daysAgo(5) }],
        crossing: [{ id: "6", name: "Unstable approaches", headline: "Alert — the drift" }],
      },
      NOW
    );
    expect(new Set(h.degraded.map((d) => d.kind))).toEqual(
      new Set(Object.keys(BARRIER_KINDS))
    );
  });

  it("a reviewed change and a closed finding are not degraded", () => {
    const h = barrierHealth(
      {
        changes: [{ id: "4", title: "x", reviewDueOn: daysAgo(9), reviewedOn: daysAgo(1) }],
        findings: [{ id: "5", auditRef: "IA", finding: "y", dueBy: daysAgo(9), closedOn: daysAgo(1) }],
      },
      NOW
    );
    expect(h.degraded).toHaveLength(0);
  });

  it("a crossing indicator has no daysLate, because it is not past a date", () => {
    const h = barrierHealth(
      { crossing: [{ id: "s", name: "Runway incursions", headline: "Alert — one period beyond 3 SD" }] },
      NOW
    );
    expect(h.degraded[0]!.daysLate).toBeNull();
  });

  it("carries spi.ts's own headline rather than restating it", () => {
    /* The three crossing criteria mean different things — a spike and
       the drift that becomes one — and collapsing them to a single
       phrase throws away the distinction they exist to draw. */
    const spike = barrierHealth(
      { crossing: [{ id: "s", name: "Runway incursions", headline: "Alert — one period beyond 3 SD" }] },
      NOW
    );
    const drift = barrierHealth(
      { crossing: [{ id: "s", name: "Runway incursions", headline: "Alert — three consecutive beyond 1 SD" }] },
      NOW
    );
    expect(spike.degraded[0]!.what).not.toBe(drift.degraded[0]!.what);
    expect(spike.degraded[0]!.what).toContain("one period beyond 3 SD");
    expect(drift.degraded[0]!.what).toContain("three consecutive beyond 1 SD");
  });

  it("ranks by how late, not by kind", () => {
    const h = barrierHealth(
      {
        actions: [{ id: "recent", action: "a", dueOn: daysAgo(2) }],
        findings: [{ id: "ancient", auditRef: "IA", finding: "f", dueBy: daysAgo(90) }],
      },
      NOW
    );
    expect(h.degraded.map((d) => d.id)).toEqual(["ancient", "recent"]);
  });
});

describe("what it refuses to claim", () => {
  it("attributes a finding to every HRC its report carried", () => {
    const h = barrierHealth(
      { actions: [{ id: "a", action: "x", dueOn: daysAgo(1), hrcs: ["BWI", "RE"] }] },
      NOW
    );
    expect(h.byHrc.BWI).toHaveLength(1);
    expect(h.byHrc.RE).toHaveLength(1);
    expect(h.unattributed).toHaveLength(0);
    expect(h.attribution).toBe(1);
  });

  it("NAMES what it cannot attribute rather than dropping it", () => {
    /* THE ASSERTION THIS MODULE EXISTS FOR. Training, changes, findings
       and indicators have no path to an HRC in the schema — hrcTags is
       on SafetyReport and nowhere else. A grouping that silently kept
       only the attributable findings would show a per-category picture
       built from a quarter of the evidence, with nothing on it saying
       so. */
    const h = barrierHealth(
      {
        actions: [{ id: "att", action: "x", dueOn: daysAgo(1), hrcs: ["BWI"] }],
        training: [{ id: "t", who: "A", course: "Dangerous goods", expiresOn: daysAgo(1) }],
        changes: [{ id: "c", title: "y", reviewDueOn: daysAgo(1) }],
        findings: [{ id: "f", auditRef: "IA", finding: "z", dueBy: daysAgo(1) }],
      },
      NOW
    );
    expect(h.degraded).toHaveLength(4);
    expect(h.unattributed.map((d) => d.id).sort()).toEqual(["c", "f", "t"]);
    expect(h.attribution).toBeCloseTo(0.25, 5);
  });

  it("an empty record is fully attributed rather than zero, so a clean operator is not shown a false gap", () => {
    const h = barrierHealth({}, NOW);
    expect(h.degraded).toHaveLength(0);
    expect(h.attribution).toBe(1);
  });

  it("a finding on two HRCs appears under both without being double-counted overall", () => {
    const h = barrierHealth(
      { actions: [{ id: "a", action: "x", dueOn: daysAgo(1), hrcs: ["MAC", "LOC-I"] }] },
      NOW
    );
    expect(h.degraded).toHaveLength(1);
    expect(Object.keys(h.byHrc).sort()).toEqual(["LOC-I", "MAC"]);
  });

  it("every kind declares what a degradation of it means", () => {
    /* A kind with no sentence is a label on a screen nobody can read. */
    for (const [kind, meaning] of Object.entries(BARRIER_KINDS)) {
      expect(meaning.length).toBeGreaterThan(20);
      expect(kind).toMatch(/^[A-Z_]+$/);
    }
  });
});
