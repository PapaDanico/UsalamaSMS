/* =====================================================================
   FATIGUE, AND THE ANSWER THAT IS WORTH MORE THAN COMPLIANCE.

   The assertion this file exists for is the WITHIN_DECLARED one: a duty
   inside every limit the operator set for itself, flown by somebody who
   then filed a fatigue report. A module that only reported breaches
   would pass a casual reading and would be the prescriptive approach
   wearing a dashboard — the finding it cannot produce is precisely the
   compliant duty that still hurt somebody.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  assess, touchesWocl, hasDeclaredLimits,
  SAMN_PERELLI, SAMN_PERELLI_IMPAIRMENT_FROM,
  WOCL_START_HOUR, WOCL_END_HOUR,
  FATIGUE_VERIFIED_AGAINST_PRIMARY, FATIGUE_CAVEAT, FATIGUE_SOURCES,
} from "../packages/shared/src/fatigue";

const LIMITS = {
  maxFlightTimeHours: 8,
  maxDutyHours: 13,
  minRestHours: 10,
  instrument: "OM-A 7.1",
};

describe("the scale, and the threshold that is not ours", () => {
  it("carries all seven Samn-Perelli levels, in order and numbered", () => {
    expect(SAMN_PERELLI).toHaveLength(7);
    expect(SAMN_PERELLI.map((s) => s.level)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(SAMN_PERELLI.every((s) => s.label.length > 8)).toBe(true);
  });

  it("puts the impairment threshold inside the scale rather than past its end", () => {
    /* A threshold of 8 on a 7-point scale can never fire, and would make
       every assertion about impairment below pass by never happening. */
    expect(SAMN_PERELLI_IMPAIRMENT_FROM).toBeGreaterThan(1);
    expect(SAMN_PERELLI_IMPAIRMENT_FROM).toBeLessThanOrEqual(7);
    expect(SAMN_PERELLI.some((s) => s.level >= SAMN_PERELLI_IMPAIRMENT_FROM)).toBe(true);
  });

  it("HAS NOT READ THE PRIMARY, and says so", () => {
    /* The same flag as cictt.ts, for the same reason. If somebody flips
       this without opening Annex 6 and Doc 9966, the constant has
       stopped meaning anything and so has the one it is modelled on. */
    expect(FATIGUE_VERIFIED_AGAINST_PRIMARY).toBe(false);
    expect(FATIGUE_SOURCES.length).toBeGreaterThan(0);
  });

  it("REFUSES THE FRMS CLAIM ON THE SCREEN, not in a footnote", () => {
    expect(FATIGUE_CAVEAT).toMatch(/not a Fatigue Risk Management System/i);
    expect(FATIGUE_CAVEAT).toMatch(/approve/i);
    /* And it says the limits are the operator's, because a reader who
       thought otherwise would read this as a legal check. */
    expect(FATIGUE_CAVEAT).toMatch(/you declared/i);
  });
});

describe("the window of circadian low", () => {
  it("catches a duty that runs through it", () => {
    expect(touchesWocl(23, 7)).toBe(true);
    expect(touchesWocl(1, 4)).toBe(true);
  });

  it("AND A DUTY THAT CROSSES MIDNIGHT WITHOUT REACHING IT", () => {
    /* THE TRAP. A naive range comparison reports 22:00-01:00 as clean
       because 22 > 6 and 1 < 2 under the wrong sign, and reports
       21:00-23:00 as dirty. Both are night duties; only one touches the
       window, and getting it backwards makes every night sector look
       identical. */
    expect(touchesWocl(22, 1), "22:00-01:00 does not reach 02:00").toBe(false);
    expect(touchesWocl(22, 3), "22:00-03:00 does reach it").toBe(true);
  });

  it("and a daytime duty touches nothing", () => {
    expect(touchesWocl(8, 17)).toBe(false);
    expect(touchesWocl(6, 12), "06:00 is the first hour outside the window").toBe(false);
  });

  it("the window is a real span rather than an empty one", () => {
    /* WOCL_END <= WOCL_START collapses the window and every assertion
       above about a clean duty passes perfectly. */
    expect(WOCL_END_HOUR).toBeGreaterThan(WOCL_START_HOUR);
  });

  it("is unbothered by a figure it cannot use", () => {
    expect(touchesWocl(Number.NaN, 5)).toBe(false);
  });
});

describe("what the operator declared", () => {
  it("counts nothing as nothing, and a zero as nothing", () => {
    expect(hasDeclaredLimits(null)).toBe(false);
    expect(hasDeclaredLimits({})).toBe(false);
    expect(hasDeclaredLimits({ maxDutyHours: 0 })).toBe(false);
    expect(hasDeclaredLimits({ instrument: "OM-A 7.1" })).toBe(false);
  });

  it("counts one number as declared", () => {
    expect(hasDeclaredLimits({ maxDutyHours: 13 })).toBe(true);
  });
});

describe("reading a fatigue report against the operator's own limits", () => {
  it("SAYS SO WHEN NOTHING WAS DECLARED, rather than reporting compliance", () => {
    /* The dangerous alternative is treating a blank limit as unlimited,
       which reports every duty as within limits and is the exact shape
       of a check that cannot fail. */
    const a = assess({ dutyHours: 20, samnPerelli: 7 }, null);
    expect(a.verdict).toBe("NO_LIMITS_DECLARED");
    expect(a.exceeded).toEqual([]);
    expect(a.headline).toMatch(/declare the limits/i);
    /* And the factors still land — a 7 of 7 is worth knowing with or
       without a limit to compare it to. */
    expect(a.impairmentReported).toBe(true);
  });

  it("SAYS INCOMPLETE when the duty carries nothing the limits can be read against", () => {
    const a = assess({ sectors: 8, samnPerelli: 6 }, LIMITS);
    expect(a.verdict).toBe("INCOMPLETE");
    expect(a.headline).toMatch(/not carry enough/i);
    expect(a.factors.join(" ")).toMatch(/8 sectors/);
  });

  it("NAMES EVERY LIMIT THE DUTY WENT PAST, with both numbers", () => {
    const a = assess(
      { flightTimeHours: 9.5, dutyHours: 14, restBeforeHours: 8, samnPerelli: 6 },
      LIMITS,
    );
    expect(a.verdict).toBe("EXCEEDED_DECLARED");
    expect(a.exceeded).toHaveLength(3);
    expect(a.exceeded.join(" | ")).toMatch(/9\.5h against a declared 8h/);
    expect(a.exceeded.join(" | ")).toMatch(/Rest before duty: 8h against a declared 10h/);
  });

  it("treats rest as a FLOOR and flight time as a CEILING", () => {
    /* The sign error that would make short rest look compliant. Eight
       hours of rest against a declared minimum of ten is a breach; nine
       hours of flight time against a maximum of ten is not. */
    const shortRest = assess({ restBeforeHours: 8 }, { minRestHours: 10 });
    expect(shortRest.verdict).toBe("EXCEEDED_DECLARED");

    const underCeiling = assess({ flightTimeHours: 9 }, { maxFlightTimeHours: 10 });
    expect(underCeiling.verdict).toBe("WITHIN_DECLARED");
  });

  it("does not call a duty EXACTLY at the limit a breach", () => {
    /* > rather than >=. A duty flown precisely to the limit complied
       with it, and reporting it as a breach would teach a safety office
       to stop believing the screen. */
    const a = assess({ dutyHours: 13 }, { maxDutyHours: 13 });
    expect(a.verdict).toBe("WITHIN_DECLARED");

    const rest = assess({ restBeforeHours: 10 }, { minRestHours: 10 });
    expect(rest.verdict).toBe("WITHIN_DECLARED");
  });

  it("THE ANSWER THIS MODULE EXISTS FOR — inside every limit, and still too tired", () => {
    /* The finding the prescriptive approach cannot produce on its own.
       A screen that only ever reported breaches would be duty-limit
       compliance with a dashboard on top. */
    const a = assess(
      {
        flightTimeHours: 7, dutyHours: 12, restBeforeHours: 11,
        sectors: 6, sleepPrior24Hours: 4,
        startLocalHour: 3, endLocalHour: 15, samnPerelli: 6,
      },
      LIMITS,
    );
    expect(a.verdict).toBe("WITHIN_DECLARED");
    expect(a.exceeded).toEqual([]);
    expect(a.headline).toMatch(/inside every declared limit/i);
    expect(a.headline).toMatch(/not what settles it/i);

    /* And every contributing factor is surfaced, because the count on
       its own would read as an ordinary compliant duty. */
    const f = a.factors.join(" | ");
    expect(f).toMatch(/circadian low/i);
    expect(f).toMatch(/six hours of sleep/i);
    expect(f).toMatch(/6 sectors/);
    expect(f).toMatch(/Samn-Perelli/);
    expect(a.impairmentReported).toBe(true);
  });

  it("keeps a rested, alert, compliant duty quiet", () => {
    /* The other direction. A module that attached a factor to
       everything would make the factor list worthless. */
    const a = assess(
      {
        flightTimeHours: 4, dutyHours: 8, restBeforeHours: 12,
        sectors: 2, sleepPrior24Hours: 8,
        startLocalHour: 8, endLocalHour: 16, samnPerelli: 3,
      },
      LIMITS,
    );
    expect(a.verdict).toBe("WITHIN_DECLARED");
    expect(a.factors).toEqual([]);
    expect(a.impairmentReported).toBe(false);
  });

  it("reports impairment from the authors' threshold and not one below it", () => {
    expect(assess({ dutyHours: 5, samnPerelli: 4 }, LIMITS).impairmentReported).toBe(false);
    expect(assess({ dutyHours: 5, samnPerelli: 5 }, LIMITS).impairmentReported).toBe(true);
  });
});
