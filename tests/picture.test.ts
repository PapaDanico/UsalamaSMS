/* ============================================================
   THE RISK PICTURE.

   Most of these checks are about what the picture REFUSES to say. That
   is deliberate, and it is where the value is: a dashboard's failure
   mode is not a wrong number, it is a confident one — a mean dragged by
   a single four-hundred-day closure, an arrow drawn through two points,
   or a "rate" that is really reports per elapsed day.

   Every one of those looks like measurement and none of them is, and an
   operator puts these figures in front of an authority.
   ============================================================ */

import { describe, it, expect } from "vitest";
import {
  tally,
  sampleOf,
  trendOf,
  holderGaps,
  reportCount,
  MIN_SAMPLE,
  MIN_TREND_POINTS,
} from "../packages/shared/src/picture";

describe("counting by band", () => {
  it("KEEPS THE EMPTY BANDS, because absence and zero are different", () => {
    /* A GROUP BY returns no row for a band with nothing in it. A
       picture that omits "intolerable" when there are none looks
       identical to one where the query broke — and the second is the
       one an operator needs to notice. */
    const t = tally(["INTOLERABLE", "TOLERABLE", "ACCEPTABLE"] as const, [
      { key: "ACCEPTABLE" as const, count: 4 },
    ]);
    expect(t.by.INTOLERABLE).toBe(0);
    expect(t.by.TOLERABLE).toBe(0);
    expect(t.by.ACCEPTABLE).toBe(4);
    expect(t.total).toBe(4);
  });

  it("ignores a key it was not told about rather than inventing a column", () => {
    const t = tally(["A", "B"] as const, [
      { key: "A" as const, count: 1 },
      { key: "Z" as never, count: 99 },
    ]);
    expect(t.total).toBe(1);
    expect(Object.keys(t.by).sort()).toEqual(["A", "B"]);
  });
});

describe("time to closure", () => {
  it("USES THE MEDIAN, so one stalled report does not describe the rest", () => {
    /* The single most important choice in this module. One report that
       sat four hundred days — waiting on a part or on a regulator, which
       is ordinary — drags a mean past every other value in the set. A
       safety manager reading "average 96 days" against a set that mostly
       closed inside a fortnight has been told something false about
       their own operation. */
    const days = [2, 3, 4, 5, 6, 400];
    const s = sampleOf(days);
    const mean = days.reduce((a, b) => a + b, 0) / days.length;
    expect(mean).toBeGreaterThan(60);
    expect(s.median).toBeLessThan(10);
  });

  it("REPORTS THE TAIL BESIDE IT, because the tail is the actionable part", () => {
    const s = sampleOf([2, 3, 4, 5, 6, 400]);
    expect(s.p90).toBe(400);
    expect(s.median).not.toBe(s.p90);
  });

  it("REFUSES A MEDIAN OVER TOO SMALL A SAMPLE, and says why", () => {
    const s = sampleOf([1, 2, 3, 4]);
    expect(s.n).toBe(4);
    expect(s.median).toBeNull();
    expect(s.note).toMatch(/anecdote/i);
    // And the floor is the one the module declares, not a number typed here.
    expect(sampleOf(Array(MIN_SAMPLE).fill(3)).median).toBe(3);
  });

  it("says nothing has closed rather than reporting zero days", () => {
    /* Zero on a dashboard reads as a measurement — "we close everything
       the same day" — which is the opposite of "we have closed
       nothing". */
    const s = sampleOf([]);
    expect(s.median).toBeNull();
    expect(s.note).toMatch(/nothing has been closed/i);
  });
});

describe("trend", () => {
  it("REFUSES TO DRAW A LINE THROUGH TWO POINTS", () => {
    expect(trendOf([4, 9])).toBe("TOO_SHORT");
    expect(trendOf([9])).toBe("TOO_SHORT");
    expect(trendOf([])).toBe("TOO_SHORT");
    expect(trendOf(Array(MIN_TREND_POINTS).fill(5))).not.toBe("TOO_SHORT");
  });

  it("COMPARES AGAINST THE PRECEDING MEAN, not against the previous point", () => {
    /* Last-two is what a spreadsheet arrow does and it inverts on
       ordinary noise. This series is flat around 10 with one busy month
       in the middle; against the previous point the final month reads
       as a fall, and the year has not fallen. */
    expect(trendOf([10, 10, 20, 10])).toBe("FLAT");
  });

  it("HAS A FLAT BAND, so the arrow is not always pointing somewhere", () => {
    // A picture where every indicator always points up or down is a
    // picture where the arrows stop being read.
    expect(trendOf([10, 10, 10, 10])).toBe("FLAT");
    expect(trendOf([10, 10, 10, 10.5])).toBe("FLAT");
  });

  it("reports a real move in the right direction", () => {
    expect(trendOf([4, 5, 4, 20])).toBe("RISING");
    expect(trendOf([20, 22, 21, 4])).toBe("FALLING");
  });

  it("does not divide by zero when nothing preceded it", () => {
    expect(trendOf([0, 0, 0])).toBe("FLAT");
    expect(trendOf([0, 0, 7])).toBe("RISING");
  });
});

describe("who is carrying what — the RA 1210 gap", () => {
  const risk = (over: Record<string, unknown>) => ({
    id: "r1",
    hazard: "Bird activity on approach",
    tolerability: "ACCEPTABLE" as const,
    owner: "SAFETY_MANAGER",
    ...over,
  });

  it("FINDS A RISK OWNED BELOW ITS BAND — the thing no incumbent checks", () => {
    const gaps = holderGaps([risk({ tolerability: "TOLERABLE", owner: "SAFETY_MANAGER" })]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.verdict).toBe("below");
    expect(gaps[0]!.needs).toBe("ACCOUNTABLE_EXECUTIVE");
  });

  it("says nothing about a risk owned correctly", () => {
    expect(holderGaps([risk({})])).toHaveLength(0);
    expect(
      holderGaps([risk({ tolerability: "TOLERABLE", owner: "ACCOUNTABLE_EXECUTIVE" })]),
    ).toHaveLength(0);
  });

  it("JUDGES THE RESIDUAL BAND WHERE THERE IS ONE", () => {
    /* The same rule the register and the change route use: a risk with
       controls in place is carried at the position it is actually being
       carried at. Judging the initial band would report a gap against
       every risk an operator has successfully mitigated, which trains
       people to ignore the list. */
    const gaps = holderGaps([
      risk({
        tolerability: "TOLERABLE",
        residualTolerability: "ACCEPTABLE",
        owner: "SAFETY_MANAGER",
      }),
    ]);
    expect(gaps).toHaveLength(0);
  });

  it("and it works in the direction that matters too", () => {
    // Controls that did NOT bring it down are still a gap.
    const gaps = holderGaps([
      risk({
        tolerability: "ACCEPTABLE",
        residualTolerability: "INTOLERABLE",
        owner: "SAFETY_MANAGER",
      }),
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.band).toBe("INTOLERABLE");
  });

  it("KEEPS 'BELOW' AND 'UNKNOWN' APART, because they need different answers", () => {
    /* Below is a finding — a red risk owned by a safety officer is a
       governance gap. Unknown is a question — "the Director" may
       genuinely be the accountable executive, because the owner field
       has a free-text escape on purpose. Collapsing them either accuses
       an operator of a gap it does not have, or buries a real one among
       naming differences. */
    const gaps = holderGaps([
      risk({ id: "named", tolerability: "TOLERABLE", owner: "The Director" }),
      risk({ id: "junior", tolerability: "TOLERABLE", owner: "SAFETY_OFFICER" }),
    ]);
    expect(gaps.map((g) => g.verdict)).toEqual(["below", "unknown"]);
    // And the real finding sorts above the question.
    expect(gaps[0]!.id).toBe("junior");
  });

  it("puts the worst band first within a verdict", () => {
    const gaps = holderGaps([
      risk({ id: "amber", tolerability: "TOLERABLE", owner: "SAFETY_OFFICER" }),
      risk({ id: "red", tolerability: "INTOLERABLE", owner: "SAFETY_OFFICER" }),
    ]);
    expect(gaps.map((g) => g.id)).toEqual(["red", "amber"]);
  });

  it("treats a missing owner as a question, not as compliant", () => {
    const gaps = holderGaps([risk({ owner: null })]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.verdict).toBe("unknown");
  });
});

describe("the report count", () => {
  it("REFUSES TO CALL ITSELF A RATE, and names what is missing", () => {
    /* Dividing by elapsed days produces "reports per day", which looks
       like Doc 9859's indicator, is not it, and gets worse the moment
       an operator's flying is seasonal. A picture that answers a
       question it was not asked is how a number reaches an authority
       that then asks where it came from. */
    const r = reportCount(12, 90);
    expect(r.rate).toBeNull();
    expect(r.count).toBe(12);
    expect(r.note).toMatch(/not a rate/i);
    expect(r.note).toMatch(/1,000 flight hours|departure/i);
  });

  it("says where the rate can actually be computed", () => {
    // Pointing at the indicator screen rather than leaving a dead end:
    // exposure is asked for there, per period, on purpose.
    expect(reportCount(1, 30).note).toMatch(/exposure/i);
  });

  it("gets the singular right, because a dashboard that says '1 reports' is not read twice", () => {
    expect(reportCount(1, 30).note).toContain("1 report in");
    expect(reportCount(2, 30).note).toContain("2 reports in");
  });
});
