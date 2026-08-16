/* =====================================================================
   THE NATIONAL PLAN, ASSERTED AGAINST THE DOCUMENT.

   This file exists because the model built from search results was
   wrong in a specific, expensive way: it said Kenya adopts GASP's five
   high-risk categories. The plan lists six. The sixth is bird strikes,
   and the plan's code for it is BWI — which a migration was about to
   rewrite to CICTT's BIRD, on the strength of a search-derived
   assumption, destroying the only tagged report in production and
   walking the product off its regulator's vocabulary.

   So what the plan says is pinned here, and the flag that says
   somebody read it is pinned too.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  NASP_SOURCE,
  NASP_VERIFIED_AGAINST_PRIMARY,
  NASP_ASPIRATIONAL_GOAL,
  NASP_INDICATORS,
  REACHABLE_NASP_INDICATORS,
  NASP_CAVEAT,
} from "../packages/shared/src/nasp";
import { NASP_HIGH_RISK, HRC_CATEGORIES } from "../packages/shared/src/taxonomy";

describe("what the national plan actually says", () => {
  it("was read, and says so", () => {
    expect(NASP_VERIFIED_AGAINST_PRIMARY).toBe(true);
    expect(NASP_SOURCE).toMatch(/National Aviation Safety Plan/i);
  });

  it("carries the aspirational goal in the plan's own terms", () => {
    expect(NASP_ASPIRATIONAL_GOAL).toMatch(/zero fatalities/i);
    expect(NASP_ASPIRATIONAL_GOAL).toMatch(/2030/);
  });

  it("lists the indicators under Goal 1, with the rate basis the plan states", () => {
    const by = (m: string) => NASP_INDICATORS.find((i) => i.measure.includes(m));
    /* The plan writes these two "per 100 movements", which is a rate
       basis this product's SPI model can take directly — that is the
       whole reason they are worth quoting rather than summarising. */
    expect(by("Go around")?.per).toBe("100 movements");
    expect(by("Rejected take-off")?.per).toBe("100 movements");
    expect(by("BWI incidents")?.per).toMatch(/quarter/);
  });

  it("says which an operator can populate, and why not for the rest", () => {
    /* Offering a safety manager an indicator needing TCAS II on a
       Caravan is how a screen full of empty rows teaches somebody the
       tool is not for them. */
    expect(REACHABLE_NASP_INDICATORS.length).toBeGreaterThan(4);
    expect(REACHABLE_NASP_INDICATORS.length).toBeLessThan(NASP_INDICATORS.length);
    for (const i of NASP_INDICATORS) {
      if (!i.reachable) expect(i.why, `${i.measure} is unreachable and unexplained`).toBeTruthy();
    }
  });

  it("keeps every national indicator's HRC a tag a reporter can actually pick", () => {
    /* An indicator keyed to a category nobody can tag counts nothing.
       This is the join the two vocabularies exist to make possible. */
    const tags = new Set(HRC_CATEGORIES.map((c) => c.code));
    for (const i of NASP_INDICATORS) {
      if (i.hrc) expect(tags, `${i.hrc} is not a taggable category`).toContain(i.hrc);
    }
  });

  it("agrees with the six categories the plan names", () => {
    expect(NASP_HIGH_RISK).toHaveLength(6);
    expect(NASP_HIGH_RISK.map((c) => c.code)).toContain("BWI");
  });

  it("says these are an offer rather than an obligation", () => {
    /* A product that quietly turns a State's plan into a rule for an
       operator has invented a requirement the regulator did not make. */
    expect(NASP_CAVEAT).toMatch(/yours to choose/i);
    expect(NASP_CAVEAT).toMatch(/none of these is required/i);
  });
});
