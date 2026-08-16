import { describe, it, expect } from "vitest";
import { CreateReportSchema, isValidLocation, isValidAircraftType } from "../packages/shared/src/index";
import { HRC_CATEGORIES, HRC_GROUPS, NASP_HIGH_RISK, cicttFor } from "../packages/shared/src/taxonomy";
import { OCCURRENCE_CATEGORIES } from "../packages/shared/src/cictt";

const base = {
  clientId: "8f2c1e5a-3d4b-4c9e-9a1b-2f3e4d5c6b7a",
  type: "HAZARD" as const,
  title: "Bird activity on 06",
  narrative: "A flock crossed the approach path three mornings running.",
};

describe("the taxonomy is enforced on the REQUEST, not only in the dropdown", () => {
  it("accepts a code from the list", () => {
    expect(isValidLocation("HKJK")).toBe(true);
    expect(CreateReportSchema.safeParse({ ...base, location: "HKJK" }).success).toBe(true);
  });

  it("accepts free text that is plainly not a code", () => {
    // The escape hatch has to work, or people put the real answer in the
    // narrative where nothing can count it.
    expect(isValidLocation("A private strip 40 km north of Nanyuki")).toBe(true);
  });

  it("REJECTS a code-shaped string that is not in the list", () => {
    // "HKRE" is a plausible typo of HKJK. Letting it through creates the
    // second aerodrome the taxonomy exists to prevent.
    expect(isValidLocation("HKRE")).toBe(false);
    expect(CreateReportSchema.safeParse({ ...base, location: "HKRE" }).success).toBe(false);
  });

  it("rejects the sentinel outright", () => {
    // __OTHER__ in a location column is a value that looks like a place
    // and groups with nothing.
    expect(isValidLocation("__OTHER__")).toBe(false);
    expect(CreateReportSchema.safeParse({ ...base, location: "__OTHER__" }).success).toBe(false);
  });

  it("applies the same rule to aircraft type", () => {
    expect(isValidAircraftType("DH8D")).toBe(true);
    expect(isValidAircraftType("Cessna 210 Centurion")).toBe(true);
    expect(isValidAircraftType("DH9Z")).toBe(false);
    expect(isValidAircraftType("__OTHER__")).toBe(false);
  });

  it("still allows a report with neither field", () => {
    expect(CreateReportSchema.safeParse(base).success).toBe(true);
  });
});

/* =====================================================================
   THE REPORTER'S CHIPS ARE A SUBSET OF THE OFFICE'S TAXONOMY.

   Two vocabularies for one concept is how a count goes quietly wrong.
   `hrcTags` is what a reporter picks on the form; `cicttCodes` is what
   the safety office assigns at triage. They are different columns
   serving different people, which is exactly why nothing complained
   when two of the six chips used codes CICTT does not have: `LOC_I`
   for `LOC-I`, and `BWI` for `BIRD`.

   Nothing broke. Nothing joined them, so there was nothing to break —
   until an indicator wants to count loss-of-control events, which is
   the first thing a safety performance indicator aligned to a national
   safety plan has to do. Two spellings would have been two counts, and
   an operator would have shown a regulator the smaller one.

   Found by listing both sets and subtracting, rather than by reading
   either file. Gated here so the subset relationship is enforced.
   ===================================================================== */
describe("the occurrence vocabulary is one vocabulary", () => {
  it("gives every reporter chip a code the CICTT registry knows", () => {
    const known = new Set(OCCURRENCE_CATEGORIES.map((c) => c.code));
    /* Through `cicttFor`, because the national plan and the ADREP
       registry legitimately disagree on birdstrike — BWI against BIRD
       — and both are right in their own document. The bridge is what
       must resolve, not the raw tag. */
    const strangers = HRC_CATEGORIES.filter((c) => !known.has(cicttFor(c.code)));
    expect(
      strangers.map((c) => c.code),
      "chip codes absent from the CICTT registry — two vocabularies for one concept"
    ).toEqual([]);
  });

  it("found a registry to check against, rather than passing on an empty set", () => {
    /* Charter rule 11. A subset assertion against nothing is perfect. */
    expect(OCCURRENCE_CATEGORIES.length).toBeGreaterThan(20);
    expect(HRC_CATEGORIES.length).toBeGreaterThan(6);
  });

  it("offers the ground, which is where a charter operator's events happen", () => {
    /* The six it replaced were the five GASP categories plus birdstrike
       — every one airborne. A tug hitting a fairing could not be
       tagged, and untaggable is uncountable. */
    const ground = HRC_CATEGORIES.filter((c) => c.group === "On the ground");
    expect(ground.length).toBeGreaterThan(2);
    expect(ground.map((c) => c.code)).toContain("RAMP");
    expect(ground.map((c) => c.code)).toContain("GCOL");
  });

  it("marks Kenya's six national high-risk categories, exactly as the plan lists them", () => {
    /* KENYA NATIONAL AVIATION SAFETY PLAN, section 5.1.1.1, read from
       the document rather than from a search result:

         (a) CFIT  (b) LOC-I  (c) MAC  (d) RE  (e) RI  (f) Bird Strikes (BWI)

       SIX, and BWI is the plan's own code — it recurs in the plan's
       indicator table as "BWI incidents per quarter/per aerodrome".
       The working assumption before reading it was that BWI was a typo
       for CICTT's BIRD and should be migrated away. That would have
       walked this product off the vocabulary its regulator publishes,
       and rewritten the only tagged report in production to match a
       taxonomy the State does not use. */
    expect(NASP_HIGH_RISK.map((c) => c.code).sort()).toEqual(
      ["BWI", "CFIT", "LOC-I", "MAC", "RE", "RI"].sort()
    );
  });

  it("keeps BWI as a tag, because the national plan does", () => {
    expect(HRC_CATEGORIES.map((c) => c.code)).toContain("BWI");
    /* And it still reaches the ADREP registry through the bridge. */
    expect(cicttFor("BWI")).toBe("BIRD");
    expect(cicttFor("RE")).toBe("RE");
  });

  it("puts every chip in a group the form actually renders", () => {
    /* The form iterates HRC_GROUPS and filters by group. A chip whose
       group is absent from that list renders nowhere — present in the
       data, invisible on the screen, and silent. */
    for (const c of HRC_CATEGORIES) {
      expect(HRC_GROUPS, `${c.code} sits in a group the form never renders`).toContain(c.group);
    }
  });
});
