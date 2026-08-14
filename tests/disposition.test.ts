/* ============================================================
   WHAT HAPPENED TO THE REPORT.

   The defect this module closes is not a wrong answer, it is four
   unreachable ones: `ReportState` has five values and nothing wrote the
   column, so every report ever filed was SUBMITTED, permanently. The
   permissions were declared too — `report.investigate` and
   `report.close` were granted to roles and had no route behind them.

   THE CHECK WORTH MOST HERE is the last one: the graph must be able to
   reach every state it declares. A state machine with an unreachable
   state is exactly the defect that shipped, and a test that only
   exercises the transitions somebody remembered to write would have
   passed on the broken product too — there were no transitions at all.
   ============================================================ */

import { describe, it, expect } from "vitest";
import {
  REPORT_STATES,
  TRANSITIONS,
  transitionsFrom,
  transitionBetween,
  mayTransition,
  daysToFirstClosure,
} from "../packages/shared/src/disposition";
import { can } from "../packages/shared/src/permissions";
import type { Permission } from "../packages/shared/src/permissions";

const asRole = (role: string) => (p: Permission) => can(role as never, p);
const never = () => false;
const always = () => true;

describe("the report disposition graph", () => {
  it("CAN REACH EVERY STATE IT DECLARES — the defect, generalised", () => {
    /* Four of the five states were unreachable in the shipped product
       because nothing wrote the column at all. This asserts the
       property that was violated rather than the six moves that fix
       it, so adding a sixth state without a way into it goes red. */
    const reachable = new Set(["SUBMITTED"]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of TRANSITIONS) {
        if (reachable.has(t.from) && !reachable.has(t.to)) {
          reachable.add(t.to);
          grew = true;
        }
      }
    }
    for (const s of REPORT_STATES) {
      expect(reachable.has(s), `${s} cannot be reached from SUBMITTED`).toBe(true);
    }
  });

  it("has no move that leaves a report where it already is", () => {
    // A self-transition would write a history row saying nothing
    // happened, and an inspector counting dispositions would count it.
    for (const t of TRANSITIONS) expect(t.from).not.toBe(t.to);
  });

  it("declares no duplicate move, or one of the two is dead code", () => {
    const seen = new Set(TRANSITIONS.map((t) => `${t.from}->${t.to}`));
    expect(seen.size).toBe(TRANSITIONS.length);
  });

  it("REFUSES A CLOSURE STRAIGHT FROM SUBMITTED", () => {
    /* Triage is where the type, location and phase are settled against
       the taxonomy. A report closed before that step never entered the
       data the aggregation exists to make possible — and a duplicate is
       worth the one click it costs to keep the queue's own numbers
       honest. */
    expect(transitionBetween("SUBMITTED", "CLOSED")).toBeNull();
    const v = mayTransition("SUBMITTED", "CLOSED", always, "duplicate of #4");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("illegal");
  });

  it("names the available moves when it refuses an illegal one", () => {
    // "That is not allowed" with no next step is a dead end on a screen.
    const v = mayTransition("SUBMITTED", "ACTIONS_OPEN", always, null);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.message).toContain("TRIAGED");
  });

  it("LETS A CLOSED REPORT BE REOPENED, with a reason", () => {
    /* Refusing this makes people either close nothing or edit the
       record, and both are worse than a reopening that says why. */
    expect(transitionBetween("CLOSED", "ACTIONS_OPEN")).not.toBeNull();
    expect(mayTransition("CLOSED", "ACTIONS_OPEN", always, "actions did not hold").ok).toBe(true);

    const bare = mayTransition("CLOSED", "ACTIONS_OPEN", always, undefined);
    expect(bare.ok).toBe(false);
    if (!bare.ok) expect(bare.reason).toBe("note_required");
  });

  it("REQUIRES A NOTE ON EVERY CLOSURE, by whichever route", () => {
    // A closure with no statement of what was done is what makes a
    // queue worthless to whoever reads it next. There are three ways in
    // and all three must ask.
    for (const from of ["TRIAGED", "UNDER_INVESTIGATION", "ACTIONS_OPEN"] as const) {
      expect(transitionBetween(from, "CLOSED")?.requiresNote, `${from} -> CLOSED`).toBe(true);
      const v = mayTransition(from, "CLOSED", always, "   ");
      expect(v.ok, `${from} -> CLOSED accepted whitespace as a note`).toBe(false);
    }
  });

  it("separates a forbidden move from an illegal one and from a missing note", () => {
    /* Three refusals, three different things the caller must do: fix
       the request, ask somebody else, or finish the form. Collapsing
       them makes "you may not close this" look like a bug. */
    const forbidden = mayTransition("TRIAGED", "CLOSED", never, "done");
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.reason).toBe("forbidden");

    const noNote = mayTransition("TRIAGED", "CLOSED", always, "");
    if (!noNote.ok) expect(noNote.reason).toBe("note_required");

    const illegal = mayTransition("CLOSED", "TRIAGED", always, "x");
    if (!illegal.ok) expect(illegal.reason).toBe("illegal");
  });

  it("MATCHES THE ROLES THE PERMISSION MATRIX ALREADY GRANTED", () => {
    /* report.investigate and report.close were declared and granted
       before any route existed. The graph must use those, not invent a
       parallel authority — a safety officer triages, a safety manager
       closes. */
    expect(mayTransition("SUBMITTED", "TRIAGED", asRole("SAFETY_OFFICER"), null).ok).toBe(true);

    const officerCloses = mayTransition("TRIAGED", "CLOSED", asRole("SAFETY_OFFICER"), "done");
    expect(officerCloses.ok, "a safety officer must not be able to close a report").toBe(false);

    expect(mayTransition("TRIAGED", "CLOSED", asRole("SAFETY_MANAGER"), "done").ok).toBe(true);
  });

  it("gives a frontline reporter no disposition at all", () => {
    for (const t of TRANSITIONS) {
      expect(
        mayTransition(t.from, t.to, asRole("FRONTLINE"), "note").ok,
        `FRONTLINE could move ${t.from} -> ${t.to}`,
      ).toBe(false);
    }
  });

  it("gives every move a reason an operator could put in their own manual", () => {
    for (const t of TRANSITIONS) {
      expect(t.label.trim().length, `${t.from}->${t.to} has no label`).toBeGreaterThan(0);
      expect(t.because.trim().length, `${t.from}->${t.to} has no reason`).toBeGreaterThan(40);
      expect(t.because, `${t.from}->${t.to}'s reason is not a sentence`).toMatch(/\.$/);
    }
  });

  it("offers nothing from a state with no exits, and says so", () => {
    const terminal = REPORT_STATES.filter((s) => transitionsFrom(s).length === 0);
    // There are none today; if one is added, the message must not be
    // "the available moves are: " with nothing after it.
    for (const s of terminal) {
      const v = mayTransition(s, "TRIAGED", always, "x");
      if (!v.ok) expect(v.message).toContain("terminal");
    }
  });
});

describe("time from filing to closure", () => {
  const d = (iso: string) => new Date(iso);

  it("is null while nothing has closed", () => {
    expect(daysToFirstClosure(d("2026-08-01T00:00:00Z"), [])).toBeNull();
    expect(
      daysToFirstClosure(d("2026-08-01T00:00:00Z"), [
        { to: "TRIAGED", at: d("2026-08-02T00:00:00Z") },
      ]),
    ).toBeNull();
  });

  it("MEASURES THE FIRST CLOSURE, not the latest", () => {
    /* The whole reason this reads a history rather than a column. A
       report closed on day 3, reopened on day 40 and closed again on
       day 45 took three days the first time; answering 45 would report
       the reopening as slowness, and an indicator that punishes
       reopening is an indicator that stops reports being reopened. */
    const filed = d("2026-08-01T00:00:00Z");
    expect(
      daysToFirstClosure(filed, [
        { to: "CLOSED", at: d("2026-08-04T00:00:00Z") },
        { to: "ACTIONS_OPEN", at: d("2026-09-10T00:00:00Z") },
        { to: "CLOSED", at: d("2026-09-15T00:00:00Z") },
      ]),
    ).toBe(3);
  });

  it("is unaffected by the order the history arrives in", () => {
    const filed = d("2026-08-01T00:00:00Z");
    expect(
      daysToFirstClosure(filed, [
        { to: "CLOSED", at: d("2026-09-15T00:00:00Z") },
        { to: "CLOSED", at: d("2026-08-04T00:00:00Z") },
      ]),
    ).toBe(3);
  });

  it("NEVER REPORTS A NEGATIVE DURATION, whatever the clocks say", () => {
    /* A report is filed on a handset that may be offline for days and
       whose clock is whatever somebody set it to. A closure timestamped
       before the filing must read as zero, not as minus four — an
       indicator that can go negative is one an operator stops
       believing. */
    expect(
      daysToFirstClosure(d("2026-08-05T00:00:00Z"), [
        { to: "CLOSED", at: d("2026-08-01T00:00:00Z") },
      ]),
    ).toBe(0);
  });

  it("counts a same-day closure as zero days rather than a fraction", () => {
    expect(
      daysToFirstClosure(d("2026-08-01T08:00:00Z"), [
        { to: "CLOSED", at: d("2026-08-01T17:00:00Z") },
      ]),
    ).toBe(0);
  });
});
