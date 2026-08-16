// =====================================================================
// Safety performance indicators — the arithmetic, and the ways it lies.
//
// Every assertion here names a wrong answer the code could give, not
// just a right one it does. The four that matter most:
//
//   · a rate computed on zero exposure (Infinity, averaged into a
//     baseline, poisons every level derived from it);
//   · an alert level computed from too few points (fires on the next
//     ordinary period and is disbelieved thereafter);
//   · a period judged against a baseline that includes itself (the
//     indicator moves its own goalposts, towards silence);
//   · an indicator where higher is better (a reporting-rate collapse
//     must alert DOWNWARD, and a tool that only alerts upward stays
//     quiet through the only failure that indicator exists to catch).
// =====================================================================

import { describe, expect, it } from "vitest";
import {
  ALERT_CRITERIA,
  INDICATOR_KINDS,
  MIN_BASELINE,
  alertLevels,
  breaches,
  canAppendPeriod,
  periodOrder,
  mean,
  rate,
  rates,
  spiVerdict,
  stdDev,
  targetStatus,
  watch,
  type Indicator,
  type Period,
  periodWindow,
  retirementAdvice,
  correlation,
  isFlat,
  DUPLICATE_CORRELATION,
} from "../packages/shared/src/spi";

const periods = (events: number[], exposure = 1000): Period[] =>
  events.map((e, i) => ({ label: `P${i + 1}`, events: e, exposure }));

const indicator = (over: Partial<Indicator> = {}): Indicator => ({
  id: "spi-1",
  name: "Unstable approaches",
  kind: "LOWER_CONSEQUENCE",
  exposureUnit: "approaches",
  per: 1000,
  direction: "LOWER_IS_BETTER",
  owner: "Safety Manager",
  periods: [],
  ...over,
});

describe("the rate", () => {
  it("is events per the indicator's own basis", () => {
    expect(rate({ label: "P", events: 7, exposure: 3500 }, 1000)).toBe(2);
  });

  it("REFUSES zero exposure rather than returning Infinity", () => {
    // The defect this exists for: a quarter the fleet did not fly is not
    // a rate of zero and it is certainly not an arbitrarily large
    // number. One Infinity in a baseline makes the average Infinity and
    // the standard deviation NaN, and every level computed from it is
    // silently meaningless.
    const r = rate({ label: "grounded", events: 3, exposure: 0 }, 1000);
    expect(r).toBeNull();
    expect(r).not.toBe(Infinity);
  });

  it("refuses negative counts and a non-positive basis", () => {
    expect(rate({ label: "P", events: -1, exposure: 100 }, 1000)).toBeNull();
    expect(rate({ label: "P", events: 1, exposure: -100 }, 1000)).toBeNull();
    expect(rate({ label: "P", events: 1, exposure: 100 }, 0)).toBeNull();
  });

  it("drops the periods it cannot rate rather than dropping the indicator", () => {
    const series = rates(
      indicator({
        periods: [
          { label: "A", events: 2, exposure: 1000 },
          { label: "grounded", events: 0, exposure: 0 },
          { label: "C", events: 4, exposure: 1000 },
        ],
      }),
    );
    expect(series).toEqual([2, 4]);
  });
});

describe("the order periods are entered in", () => {
  it("places the shapes it can place, and refuses to guess at the rest", () => {
    expect(periodOrder("2026-Q1")).toBeLessThan(periodOrder("2026-Q2")!);
    expect(periodOrder("2026-Q4")).toBeLessThan(periodOrder("2027-Q1")!);
    expect(periodOrder("2026-01")).toBeLessThan(periodOrder("2026-12")!);
    expect(periodOrder("2026-03-01")).toBeLessThan(periodOrder("2026-03-28")!);
    expect(periodOrder("2025")).toBeLessThan(periodOrder("2026")!);
    expect(periodOrder("2026 Q2")).toBe(periodOrder("2026-Q2"));

    // "March" sorted alphabetically precedes "May", which is wrong. A
    // guard that rejects a legitimate cadence is worse than the defect
    // it replaces, so an unrecognised label has no position at all.
    expect(periodOrder("March")).toBeNull();
    expect(periodOrder("Winter season")).toBeNull();
    expect(periodOrder("2026-13")).toBeNull();
  });

  it("REFUSES A DUPLICATE, whatever the label looks like", () => {
    // The same quarter twice counts it twice into the baseline and moves
    // every alert level with it.
    const existing = periods([4, 4]).map((p, i) => ({ ...p, label: ["Q1", "Q2"][i]! }));
    expect(canAppendPeriod(existing, "Q2").ok).toBe(false);
    expect(canAppendPeriod(existing, " q2 ").ok, "case and padding are the same period").toBe(false);
    expect(canAppendPeriod(existing, "Q3").ok).toBe(true);
  });

  it("REFUSES A PERIOD ENTERED OUT OF SEQUENCE", () => {
    // The defect this exists for: back-filling last year after this year
    // silently judges every period against the wrong baseline, and the
    // screen shows the result with the same confidence as a right one.
    const existing = [
      { label: "2026-Q1", events: 4, exposure: 1000 },
      { label: "2026-Q2", events: 4, exposure: 1000 },
    ];
    const refused = canAppendPeriod(existing, "2025-Q4");
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.reason).toMatch(/comes before/);
    expect(canAppendPeriod(existing, "2026-Q3").ok).toBe(true);
  });

  it("does not refuse a cadence it cannot read", () => {
    // An operator whose periods are "Summer", "Monsoon", "Winter" gets
    // the duplicate guard and no ordering opinion.
    const existing = [{ label: "Monsoon", events: 4, exposure: 1000 }];
    expect(canAppendPeriod(existing, "Winter").ok).toBe(true);
    expect(canAppendPeriod(existing, "Summer").ok).toBe(true);
  });

  it("refuses an empty label rather than recording a nameless period", () => {
    expect(canAppendPeriod([], "   ").ok).toBe(false);
  });
});

describe("the statistics", () => {
  it("computes the mean", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it("uses the POPULATION standard deviation, not the sample one", () => {
    // [2,4,4,4,5,5,7,9]: population σ is exactly 2; the sample formula
    // gives ~2.138. At six points the difference is ~10%, which moves
    // every alert level outward and makes the tool quieter than it
    // should be. Naming the number the wrong formula returns is the
    // point of this assertion.
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).not.toBeCloseTo(2.138, 3);
  });

  it("refuses an empty series rather than returning NaN", () => {
    expect(() => mean([])).toThrow(RangeError);
    expect(() => stdDev([])).toThrow(RangeError);
  });
});

describe("alert levels", () => {
  it(`refuses fewer than ${MIN_BASELINE} periods, and says why`, () => {
    const short = alertLevels([1, 2, 3, 4, 5]);
    expect(short.levels).toBeNull();
    expect(short.reason).toMatch(/5 of 6/);
    expect(short.reason).toMatch(/unusual/);
  });

  it("sets them above the average when lower is better", () => {
    const { levels } = alertLevels([2, 4, 4, 4, 5, 5, 7, 9], "LOWER_IS_BETTER");
    expect(levels).not.toBeNull();
    expect(levels!.average).toBe(5);
    expect(levels!.sd).toBe(2);
    expect(levels!.one).toBe(7);
    expect(levels!.two).toBe(9);
    expect(levels!.three).toBe(11);
  });

  it("sets them BELOW the average when higher is better", () => {
    // A reporting-rate indicator. The failure worth alerting on is a
    // collapse, and levels above the average would never see it.
    const { levels } = alertLevels([2, 4, 4, 4, 5, 5, 7, 9], "HIGHER_IS_BETTER");
    expect(levels!.one).toBe(3);
    expect(levels!.two).toBe(1);
    expect(levels!.three).toBe(-1);
  });

  it("ignores non-finite values instead of propagating them", () => {
    const { levels } = alertLevels([1, 1, 1, 1, 1, 1, Number.NaN]);
    expect(levels!.points).toBe(6);
    expect(Number.isFinite(levels!.average)).toBe(true);
  });
});

describe("watching a period", () => {
  it("judges each period against the history BEFORE it, never including itself", () => {
    // The defect: a baseline that includes the period it judges. Six
    // steady periods then one far out. Judged correctly the seventh is
    // beyond 3σ; folded into its own baseline it drags the average and
    // the level up with it and reports nothing at all.
    const series = [2, 2, 2, 2, 2, 2, 20];
    const [point] = watch(series, "LOWER_IS_BETTER");
    expect(point!.index).toBe(6);
    expect(point!.levels.average).toBe(2);
    expect(point!.levels.sd).toBe(0);
    expect(point!.sigma).toBe(3);

    const selfJudged = alertLevels(series).levels!;
    expect(selfJudged.average).toBeGreaterThan(2);
    expect(20 > selfJudged.three).toBe(false);
  });

  it(`never judges the first ${MIN_BASELINE} periods`, () => {
    expect(watch([9, 9, 9, 9, 9, 9])).toHaveLength(0);
    expect(watch([1, 1, 1, 1, 1, 1, 1])).toHaveLength(1);
  });

  it("records the FURTHEST level a period is beyond", () => {
    const point = watch([1, 1, 1, 1, 1, 3, 99])[0]!;
    expect(point.sigma).toBe(3);
  });
});

describe("the crossing criteria", () => {
  it("states three, redundant on purpose", () => {
    expect(ALERT_CRITERIA).toHaveLength(3);
    expect(ALERT_CRITERIA.map((c) => `${c.consecutive}x${c.sigma}`)).toEqual([
      "1x3",
      "2x2",
      "3x1",
    ]);
  });

  it("fires on one period beyond three standard deviations", () => {
    const v = spiVerdict(indicator({ periods: periods([2, 2, 2, 2, 2, 2, 40]) }));
    expect(v.breaches.map((b) => b.criterion.id)).toContain("single-3sd");
    expect(v.headline).toMatch(/^Alert/);
  });

  it("catches the DRIFT that no single period makes obvious", () => {
    // Nothing here is dramatic. Every watched period sits a little over
    // one standard deviation, which is exactly the shape that goes
    // unnoticed without a rule — and turns into the shape that does not.
    const v = spiVerdict(
      indicator({ periods: periods([10, 11, 9, 10, 11, 9, 13, 14, 15]) }),
    );
    const ids = v.breaches.map((b) => b.criterion.id);
    expect(ids).toContain("three-1sd");
    expect(v.headline).toMatch(/^Alert/);
  });

  it("counts a period beyond 3σ towards a run at 2σ", () => {
    // Otherwise a worse pair reports less than a milder one: 3.5σ then
    // 2.5σ would fail "two consecutive beyond 2σ" while 2.5σ then 2.5σ
    // passed it.
    const watched = [
      { index: 6, value: 99, levels: alertLevels([1, 1, 1, 1, 1, 2]).levels!, sigma: 3 as const },
      { index: 7, value: 50, levels: alertLevels([1, 1, 1, 1, 1, 2]).levels!, sigma: 2 as const },
    ];
    expect(breaches(watched).map((b) => b.criterion.id)).toContain("two-2sd");
  });

  it("does not join a run across a period it could not rate", () => {
    const watched = [
      { index: 6, value: 9, levels: alertLevels([1, 1, 1, 1, 1, 2]).levels!, sigma: 2 as const },
      { index: 9, value: 9, levels: alertLevels([1, 1, 1, 1, 1, 2]).levels!, sigma: 2 as const },
    ];
    expect(breaches(watched)).toHaveLength(0);
  });

  it("stays quiet on an operation that is simply steady", () => {
    const v = spiVerdict(indicator({ periods: periods([10, 11, 9, 10, 11, 9, 10, 11]) }));
    expect(v.breaches).toHaveLength(0);
    expect(v.headline).toBe("Inside its alert levels");
  });

  it("ALERTS DOWNWARD when higher is better", () => {
    // Reports filed per 1,000 hours. The operation stops reporting; a
    // tool that only alerts upward calls this a quiet quarter.
    const v = spiVerdict(
      indicator({
        name: "Reports filed",
        direction: "HIGHER_IS_BETTER",
        periods: periods([40, 42, 38, 41, 39, 40, 2]),
      }),
    );
    expect(v.headline).toMatch(/^Alert/);
    expect(v.breaches.map((b) => b.criterion.id)).toContain("single-3sd");

    // And the same series read as an adverse indicator says nothing,
    // which is the proof that direction is doing the work.
    const asAdverse = spiVerdict(
      indicator({ direction: "LOWER_IS_BETTER", periods: periods([40, 42, 38, 41, 39, 40, 2]) }),
    );
    expect(asAdverse.breaches).toHaveLength(0);
  });

  it("does not lead with a breach that is history", () => {
    // A spike six periods ago that was dealt with is not a live alert.
    // A screen that keeps shouting about it is one the safety office
    // learns to scroll past — and then misses the next one.
    const v = spiVerdict(
      indicator({ periods: periods([2, 2, 2, 2, 2, 2, 40, 2, 2, 2, 2, 2]) }),
    );
    expect(v.breaches.length).toBeGreaterThan(0);
    expect(v.headline).not.toMatch(/^Alert/);
  });
});

describe("targets", () => {
  it("is a different question from the alert level", () => {
    // Steady, inside its levels, and nowhere near what the organisation
    // committed to. That is a finding, not a quiet month.
    const v = spiVerdict(
      indicator({ target: 2, periods: periods([10, 11, 9, 10, 11, 9, 10]) }),
    );
    expect(v.breaches).toHaveLength(0);
    expect(v.target).toBe("MISSED");
    expect(v.headline).toMatch(/short of its target/);
  });

  it("reads the comparison the right way round for each direction", () => {
    expect(targetStatus(3, 5, "LOWER_IS_BETTER")).toBe("MET");
    expect(targetStatus(3, 5, "HIGHER_IS_BETTER")).toBe("MISSED");
    expect(targetStatus(5, 5, "LOWER_IS_BETTER")).toBe("MET");
    expect(targetStatus(null, 5, "LOWER_IS_BETTER")).toBe("NO_TARGET");
    expect(targetStatus(3, undefined, "LOWER_IS_BETTER")).toBe("NO_TARGET");
  });
});

describe("a new indicator", () => {
  it("says it has no levels yet rather than drawing one through four points", () => {
    const v = spiVerdict(indicator({ periods: periods([3, 4, 3]) }));
    expect(v.levels).toBeNull();
    expect(v.reason).toMatch(/of 6/);
    expect(v.headline).toBe("Recording, with no alert levels yet");
  });

  it("survives having no periods at all", () => {
    const v = spiVerdict(indicator({ periods: [] }));
    expect(v.latest).toBeNull();
    expect(v.headline).toBe("No periods recorded yet");
    expect(v.breaches).toHaveLength(0);
  });
});

describe("the vocabulary", () => {
  it("separates high-consequence from lower-consequence, as Doc 9859 does", () => {
    expect(INDICATOR_KINDS.map((k) => k.key)).toEqual([
      "HIGH_CONSEQUENCE",
      "LOWER_CONSEQUENCE",
    ]);
  });

  it("says why the two are treated differently rather than just listing them", () => {
    for (const kind of INDICATOR_KINDS) {
      expect(kind.definition.length).toBeGreaterThan(30);
      expect(kind.note.length).toBeGreaterThan(30);
      expect(kind.examples.length).toBeGreaterThan(0);
    }
  });
});

describe("the window a period label covers", () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  it("RESOLVES A QUARTER TO ITS THREE MONTHS", () => {
    const w = periodWindow("2026-Q1")!;
    expect(iso(w.from)).toBe("2026-01-01");
    expect(iso(w.to)).toBe("2026-04-01");
  });

  it("IS HALF-OPEN, so consecutive periods cannot double-count a boundary", () => {
    /* A report filed at midnight on 1 April belongs to Q2 and to Q2
       only. An inclusive `to` would count it in both quarters, which
       inflates one denominator and one numerator at once — the kind of
       error that survives review because both numbers look plausible. */
    const q1 = periodWindow("2026-Q1")!;
    const q2 = periodWindow("2026-Q2")!;
    expect(q1.to.getTime()).toBe(q2.from.getTime());

    const boundary = new Date("2026-04-01T00:00:00.000Z");
    const inQ1 = boundary >= q1.from && boundary < q1.to;
    const inQ2 = boundary >= q2.from && boundary < q2.to;
    expect(inQ1).toBe(false);
    expect(inQ2).toBe(true);
  });

  it("handles the fourth quarter rolling into the next year", () => {
    const w = periodWindow("2026-Q4")!;
    expect(iso(w.from)).toBe("2026-10-01");
    expect(iso(w.to)).toBe("2027-01-01");
  });

  it("resolves months, days and years", () => {
    expect(iso(periodWindow("2026-02")!.to)).toBe("2026-03-01");
    // December rolls the year, which a naive month+1 gets wrong.
    expect(iso(periodWindow("2026-12")!.to)).toBe("2027-01-01");
    expect(iso(periodWindow("2026-08-14")!.to)).toBe("2026-08-15");
    expect(iso(periodWindow("2026")!.to)).toBe("2027-01-01");
  });

  it("REFUSES A LABEL IT CANNOT DATE, rather than guessing", () => {
    /* "Winter ops" and "Rotation 4" are cadences an operator may
       legitimately use. A product that quietly decided one of them
       meant a quarter would be confidently wrong about a number
       somebody reports to an authority. */
    expect(periodWindow("Winter ops")).toBeNull();
    expect(periodWindow("Rotation 4")).toBeNull();
    expect(periodWindow("")).toBeNull();
    expect(periodWindow("2026-13")).toBeNull();
    expect(periodWindow("2026-Q5")).toBeNull();
  });

  it("accepts every label periodOrder does, and no others", () => {
    /* The two functions read the same labels and must not drift: a
       label the screen sorts by but cannot count for is a screen that
       silently offers nothing on some rows and not others. */
    for (const label of ["2026-Q1", "2026-08", "2026-08-14", "2026", "Winter ops", "2026-13"]) {
      expect(
        periodWindow(label) === null,
        `${label}: periodOrder and periodWindow disagree about whether it is dateable`,
      ).toBe(periodOrder(label) === null);
    }
  });
});

/* =====================================================================
   §8.4 — WHEN AN INDICATOR HAS STOPPED EARNING ITS PLACE.

   CAA-AC-SMS009 §8.4 lists six reasons to continue, discontinue or
   change an SPI. Two are arithmetic and are raised here; four are
   judgements about the operation and are deliberately not attempted.
   ===================================================================== */
describe("retirement advice, from CAA-AC-SMS009 §8.4", () => {
  const ind = (id: string, name: string, events: number[]): Indicator => ({
    id,
    name,
    kind: "LOWER_CONSEQUENCE",
    exposureUnit: "sectors",
    per: 1000,
    direction: "LOWER_IS_BETTER",
    owner: "Safety manager",
    periods: events.map((e, i) => ({ label: `2026-P${i + 1}`, events: e, exposure: 1000 })),
  });

  describe("§8.4.1 — an indicator that never moves", () => {
    it("raises the circular's own example: a line reading zero throughout", () => {
      const advice = retirementAdvice(ind("a", "Bird strikes", [0, 0, 0, 0, 0, 0]));
      expect(advice.map((a) => a.id)).toContain("FLAT");
      expect(advice.find((a) => a.id === "FLAT")!.provision).toBe("CAA-AC-SMS009 §8.4.1");
    });

    it("stays quiet while there is too little history to call it a pattern", () => {
      /* FLAT_PERIODS is ours, not the circular's — §8.4.1 says
         "continually" and names no number. Firing on three identical
         quarters would fire on every new indicator in its first year. */
      expect(retirementAdvice(ind("a", "Bird strikes", [0, 0, 0])).length).toBe(0);
    });

    it("does not call a moving line flat, however slightly it moves", () => {
      expect(retirementAdvice(ind("a", "Bird strikes", [0, 0, 0, 0, 0, 1])).length).toBe(0);
    });

    /* isFlat is exported and used by the risk picture as well as by
       retirementAdvice, so it is tested directly rather than only
       through its caller — the circular's own examples are zero per
       cent and one hundred per cent, and both must read as flat. */
    it("reads the circular's two examples — nought throughout, and full throughout", () => {
      expect(isFlat([0, 0, 0, 0, 0, 0])).toBe(true);
      expect(isFlat([100, 100, 100, 100, 100, 100])).toBe(true);
      expect(isFlat([0, 0, 0, 0, 0, 0.5])).toBe(false);
      expect(isFlat([0, 0, 0]), "too short to be a pattern").toBe(false);
    });
  });

  describe("§8.4.2 — two indicators telling one story", () => {
    it("raises a duplicate when a sibling tracks it almost exactly", () => {
      const a = ind("a", "Unstable approaches", [10, 12, 14, 11, 13, 15]);
      const b = ind("b", "Go-arounds", [20, 24, 28, 22, 26, 30]);
      const advice = retirementAdvice(a, [b]);
      const dup = advice.find((x) => x.id === "DUPLICATE");
      expect(dup, "a perfectly proportional sibling is a duplicate").toBeDefined();
      expect(dup!.provision).toBe("CAA-AC-SMS009 §8.4.2");
      expect(dup!.because).toContain("Go-arounds");
    });

    it("leaves genuinely different lines alone", () => {
      const a = ind("a", "Unstable approaches", [10, 12, 14, 11, 13, 15]);
      const b = ind("b", "Ground damage", [30, 4, 19, 2, 27, 6]);
      expect(correlation([10, 12, 14, 11, 13, 15], [30, 4, 19, 2, 27, 6])!).toBeLessThan(0);
      expect(retirementAdvice(a, [b]).some((x) => x.id === "DUPLICATE")).toBe(false);
    });

    /* ================================================================
       THE ONE THAT MAKES THE THRESHOLD LOAD-BEARING.

       The test above passes against ANY threshold — its two series
       correlate at -0.20, so nothing between 0 and 1 would flag them.
       DUPLICATE_CORRELATION could be quietly loosened from 0.95 to 0.5
       and the suite stayed green, which was measured rather than
       supposed: the mutation was run and it passed.

       This pair correlates at 0.838 — clearly moving together, and not
       tightly enough to be one line drawn twice. It is the case the
       constant exists to exclude, so it pins the constant from below
       the way the proportional pair above pins it from above.
       ================================================================ */
    it("does not call a pair duplicates merely for trending together", () => {
      const a = ind("a", "Unstable approaches", [10, 12, 14, 11, 13, 15]);
      const b = ind("b", "Technical delays", [12, 11, 16, 10, 12, 18]);
      const r = correlation([10, 12, 14, 11, 13, 15], [12, 11, 16, 10, 12, 18])!;
      expect(r, "the fixture must sit between a loose threshold and the real one")
        .toBeGreaterThan(0.5);
      expect(r).toBeLessThan(DUPLICATE_CORRELATION);
      expect(retirementAdvice(a, [b]).some((x) => x.id === "DUPLICATE")).toBe(false);
    });

    it("never reports an indicator as a duplicate of itself", () => {
      const a = ind("a", "Unstable approaches", [10, 12, 14, 11, 13, 15]);
      expect(retirementAdvice(a, [a]).some((x) => x.id === "DUPLICATE")).toBe(false);
    });

    /* A flat line correlates with nothing — both denominators vanish.
       §8.4.1 catches that case first, and correlation must not invent
       a number for it. */
    it("returns no correlation for a line that never moves", () => {
      expect(correlation([1, 1, 1, 1, 1, 1], [2, 4, 6, 8, 10, 12])).toBeNull();
    });

    it("returns no correlation without enough shared history", () => {
      expect(correlation([1, 2, 3], [2, 4, 6])).toBeNull();
    });
  });

  /* THE FOUR IT MUST NOT ATTEMPT. §8.4.3 to §8.4.6 are judgements about
     the operation — whether a programme is finished, what matters more
     now, whether to narrow a measure, whether the objectives moved. A
     tool guessing at those would invent safety priorities and attribute
     them to the Authority. */
  it("offers only the two reasons that are arithmetic", () => {
    const a = ind("a", "Bird strikes", [0, 0, 0, 0, 0, 0]);
    const b = ind("b", "Bird strikes duplicate", [0, 0, 0, 0, 0, 0]);
    const ids = new Set(retirementAdvice(a, [b]).map((x) => x.id));
    expect([...ids].sort()).toEqual(["FLAT"]);
    for (const advice of retirementAdvice(a, [b])) {
      expect(advice.provision).toMatch(/§8\.4\.[12]$/);
    }
  });

  /* §8.7: "An SPI being triggered is not necessarily catastrophic or an
     indication of failure." Advice that instructed rather than suggested
     would contradict the circular it cites. */
  it("suggests rather than instructs, and shows its working", () => {
    for (const advice of retirementAdvice(ind("a", "Bird strikes", [0, 0, 0, 0, 0, 0]))) {
      expect(advice.consider).toMatch(/whether/i);
      expect(advice.because.length, "advice with no measurement cannot be argued with")
        .toBeGreaterThan(40);
      expect(advice.consider).not.toMatch(/\byou must\b|\bretire this\b|\bdelete\b/i);
    }
  });
});
