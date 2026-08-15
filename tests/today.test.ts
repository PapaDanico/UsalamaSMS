/* ============================================================
   THE JUDGEMENT /today MAKES, TESTED WITHOUT A BROWSER.

   Every decision on that screen used to live inside a render function,
   and nothing executed it. The accessibility sweep and the smoke suite
   both meet /today SIGNED OUT, so the reporter view, the digest view
   and both failure branches shipped with no test touching them — the
   same shape as the scheduled function that could not run, and found
   the same way: by asking what actually executes this.

   These are the decisions, not the markup. Whether a card renders is a
   browser's problem; whether a screen is allowed to say "nothing needs
   you today" is this product's.
   ============================================================ */
import { describe, it, expect } from "vitest";
import {
  VERDICT,
  whenText,
  viewFor,
  reporterIsClear,
} from "../packages/shared/src/today";

describe("which question a role is asked", () => {
  it("gives the safety office the digest", () => {
    expect(viewFor(true)).toBe("OFFICE");
  });

  /* The defect this split was written for: a ramp agent met "your role
     does not include reading the operator's record" on a page titled
     what needs YOU today. */
  it("gives a reporter their own view rather than a refusal", () => {
    expect(viewFor(false)).toBe("REPORTER");
  });
});

describe("the verdict a digest's urgency carries", () => {
  /* NOW AND TODAY MUST NOT READ THE SAME. digest.ts is careful that an
     OVERDUE regulatory obligation and a LAPSED currency are both late
     and only one is a breach owed to an authority whose clock has run
     out. A screen that grades them identically has undone the grading
     it is rendering — and the first version of this screen did. */
  it("says something different for NOW than for TODAY", () => {
    expect(VERDICT.NOW.line).not.toBe(VERDICT.TODAY.line);
  });

  it("names the regulatory deadline in the worst grade, where it belongs", () => {
    expect(VERDICT.NOW.line.toLowerCase()).toContain("regulatory");
  });

  it("grades the badge down as the urgency falls", () => {
    expect(VERDICT.NOW.badge).toBe("ALERT");
    expect(VERDICT.TODAY.badge).toBe("CAUTION");
    expect(VERDICT.SOON.badge).toBe("SAFE");
  });

  /* A table read by nothing is a table that drifts from the ternary
     beside it — the defect digest.ts recorded about its own urgency
     maps, and the one this screen repeated before review. */
  it("carries a word for every urgency the digest can produce", () => {
    for (const urgency of ["NOW", "TODAY", "SOON"] as const) {
      expect(VERDICT[urgency].word, urgency).toBeTruthy();
    }
  });
});

describe("days rendered as something read without arithmetic", () => {
  it("says nothing at all where there is no clock", () => {
    expect(whenText(null)).toBe("");
    expect(whenText(undefined)).toBe("");
  });

  /* Zero is TODAY and null is silence, and conflating them is how a
     digest invented a deadline for an obligation worded "without
     delay". */
  it("keeps 'no clock' and 'due today' apart", () => {
    expect(whenText(0)).toBe("soonest is today");
    expect(whenText(null)).not.toBe(whenText(0));
  });

  it("reads a past deadline as overdue rather than as negative days", () => {
    expect(whenText(-3)).toBe("soonest overdue by 3 days");
    expect(whenText(-3)).not.toContain("-3");
  });

  it("says tomorrow rather than 1 days", () => {
    expect(whenText(1)).toBe("soonest is tomorrow");
  });

  it("counts plainly beyond that", () => {
    expect(whenText(9)).toBe("soonest in 9 days");
  });
});

describe("whether a reporter's day is clear", () => {
  it("is clear when all three are known and nothing is outstanding", () => {
    expect(reporterIsClear({ unsent: 0, lapsing: 0, gaps: 0 })).toBe(true);
  });

  it("is not clear with a report still on the handset", () => {
    expect(reporterIsClear({ unsent: 1, lapsing: 0, gaps: 0 })).toBe(false);
  });

  it("is not clear with a certificate running out", () => {
    expect(reporterIsClear({ unsent: 0, lapsing: 2, gaps: 0 })).toBe(false);
  });

  it("is not clear with training the role requires and no record of", () => {
    expect(reporterIsClear({ unsent: 0, lapsing: 0, gaps: 6 })).toBe(false);
  });

  /* THE THREE THAT MATTER MOST. An unknown is never clear.
   *
   * The first version of this screen reported an unreadable OUTBOX and
   * silently swallowed an unreachable TRAINING route, which rendered as
   * no lapsing certificates and no gaps — and read as "your training is
   * fine" to somebody whose training the screen could not see. Saying
   * the most reassuring possible thing at the moment it knows least is
   * the failure this product exists to refuse. */
  it("is not clear when the outbox could not be read", () => {
    expect(reporterIsClear({ unsent: null, lapsing: 0, gaps: 0 })).toBe(false);
  });

  it("is not clear when the training record could not be read", () => {
    expect(reporterIsClear({ unsent: 0, lapsing: null, gaps: 0 })).toBe(false);
  });

  it("is not clear when the curriculum could not be read", () => {
    expect(reporterIsClear({ unsent: 0, lapsing: 0, gaps: null })).toBe(false);
  });
});
