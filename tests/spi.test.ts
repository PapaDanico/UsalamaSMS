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
  mean,
  rate,
  rates,
  spiVerdict,
  stdDev,
  targetStatus,
  watch,
  type Indicator,
  type Period,
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
