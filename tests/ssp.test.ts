/* =====================================================================
   THE SSP ROLLUP, AND THE THREE WAYS IT COULD LIE TO A REGULATOR.

   This is the page an operator shows to somebody else, which changes
   the discipline: on a working screen a wrong number is corrected by
   the person who typed it, and on this one it is read out to an
   Authority.

   The three lies, in order of how much they would cost:

     1. RENDERING AN ABSENCE AS A MEASUREMENT. "0 CFIT events" reads as
        "we have no CFIT risk". It means nothing has been tagged CFIT.

     2. SCORING IT. "4 of 6" tells a regulator an operator is a third
        non-compliant, when measuring four may be the correct and
        defensible answer for their operation.

     3. COUNTING AN EMPTY INDICATOR AS EVIDENCE. Filing an indicator is
        a declaration of intent; the series is the evidence.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import { rollUp, SSP_CAVEAT } from "../packages/shared/src/ssp";
import { HRC_CATEGORIES, NASP_HIGH_RISK } from "../packages/shared/src/taxonomy";
import { NASP_INDICATORS } from "../packages/shared/src/nasp";

const roll = (
  indicators: Parameters<typeof rollUp>[2],
  reports: Parameters<typeof rollUp>[3] = {},
) => rollUp(HRC_CATEGORIES, NASP_INDICATORS, indicators, reports);

describe("what it covers", () => {
  it("has a row for every national category and no others", () => {
    /* Derived from the taxonomy rather than counted here — charter
       rule 10. If Kenya's plan gains a seventh, this follows it. */
    const r = roll([]);
    expect(r.rows).toHaveLength(NASP_HIGH_RISK.length);
    expect(r.rows.map((x) => x.code).sort()).toEqual(
      NASP_HIGH_RISK.map((c) => c.code).sort(),
    );
  });

  it("does not invent a category the plan does not name", () => {
    /* RAMP and GCOL are this product's additions for ground events —
       real, and not the State's. A rollup that included them would tell
       an operator the Authority is counting something it is not. */
    const codes = roll([]).rows.map((x) => x.code);
    expect(codes).not.toContain("RAMP");
    expect(codes).not.toContain("GCOL");
  });
});

describe("the three standings", () => {
  it("MEASURED needs periods, not merely an indicator on file", () => {
    /* Lie 3. An indicator with no series is an intention. */
    const declared = roll([{ name: "Runway excursions", hrc: "RE", periods: [] }]);
    expect(declared.rows.find((r) => r.code === "RE")!.standing).toBe("REPORTED");

    const measured = roll([{ name: "Runway excursions", hrc: "RE", periods: [{}, {}] }]);
    const row = measured.rows.find((r) => r.code === "RE")!;
    expect(row.standing).toBe("MEASURED");
    expect(row.indicators[0]!.periods).toBe(2);
  });

  it("REPORTED when events are tagged and nothing counts them", () => {
    const r = roll([], { RI: 3 });
    const row = r.rows.find((x) => x.code === "RI")!;
    expect(row.standing).toBe("REPORTED");
    expect(row.reports).toBe(3);
    expect(row.meaning).toMatch(/data already exists/i);
  });

  it("UNSEEN SAYS WHAT IT DOES NOT MEAN, in words", () => {
    /* Lie 1, and the assertion this file exists for. */
    const row = roll([]).rows.find((x) => x.code === "CFIT")!;
    expect(row.standing).toBe("UNSEEN");
    expect(row.reports).toBe(0);
    expect(row.meaning).toBeTruthy();
    expect(row.meaning!).toMatch(/does not mean the risk is absent/i);
    expect(row.meaning!).toMatch(/about your records/i);
  });

  it("and a MEASURED row carries no caveat, because none is owed", () => {
    /* The other direction — a module that always attached a warning
       would satisfy the assertion above and be noise. */
    const row = roll([{ name: "RE rate", hrc: "RE", periods: [{}] }])
      .rows.find((x) => x.code === "RE")!;
    expect(row.meaning).toBeNull();
  });
});

describe("what it refuses to do", () => {
  it("RETURNS NO SCORE, NO PERCENTAGE AND NO TOTAL", () => {
    /* Lie 2. Asserted structurally: if somebody adds `score` or
       `percentage` to the shape, this fails and they have to argue for
       it rather than ship it. */
    const r = roll([{ name: "RE rate", hrc: "RE", periods: [{}] }], { RI: 2 });
    const keys = Object.keys(r);
    expect(keys.sort()).toEqual(["ownIndicators", "rows"]);
    for (const bad of ["score", "percentage", "percent", "grade", "covered", "total"]) {
      expect(keys, `the rollup grew a ${bad}`).not.toContain(bad);
    }
    expect(JSON.stringify(r)).not.toMatch(/\bof 6\b/);
  });

  it("says so in the caveat a screen has to print", () => {
    expect(SSP_CAVEAT).toMatch(/not a score/i);
    expect(SSP_CAVEAT).toMatch(/may not apply/i);
  });
});

describe("the operator's own indicators", () => {
  it("COUNTS THEM RATHER THAN IGNORING THEM", () => {
    /* An operator measuring things of their own choosing is doing SMS
       correctly. A rollup that dropped them would read as "you measure
       nothing", which is both false and insulting. */
    const r = roll([
      { name: "Ramp damage", hrc: null, periods: [{}] },
      { name: "Late fuel uplift", periods: [{}] },
      { name: "RE rate", hrc: "RE", periods: [{}] },
    ]);
    expect(r.ownIndicators).toBe(2);
  });

  it("treats an indicator tagged with a non-national code as the operator's own", () => {
    /* RAMP is a real tag in this product and not in the plan. It is not
       a national indicator and it is not nothing. */
    const r = roll([{ name: "Ground damage", hrc: "RAMP", periods: [{}] }]);
    expect(r.ownIndicators).toBe(1);
    expect(r.rows.every((x) => x.indicators.length === 0)).toBe(true);
  });
});

describe("a gap comes with a next step", () => {
  it("names the national indicators an operator could actually populate", () => {
    const row = roll([]).rows.find((x) => x.code === "RE")!;
    expect(row.available.length).toBeGreaterThan(0);
    expect(row.available.join(" ")).toMatch(/go around|rejected take-off/i);
  });

  it("OFFERS NOTHING IT KNOWS AN OPERATOR CANNOT PRODUCE", () => {
    /* nasp.ts marks TCAS/RA unreachable — it needs TCAS II, which is
       not fitted below 5,700 kg or 19 seats. Offering it to a Caravan
       operator as their next step is how a screen full of impossible
       suggestions teaches somebody the tool is not for them. */
    const mac = roll([]).rows.find((x) => x.code === "MAC")!;
    expect(mac.available.join(" ")).not.toMatch(/TCAS/i);
    const cfit = roll([]).rows.find((x) => x.code === "CFIT")!;
    expect(cfit.available.join(" ")).not.toMatch(/EGPWS/i);
  });
});
