/* ============================================================
   THE STP SHAPE, AND THE TWO CLAIMS IT MUST NOT MAKE.

   The arithmetic here is trivial and is not what these tests are for.
   Three things could go wrong silently and expensively:

     1. the product starts calling its output an ICAO STP;
     2. an objective degrades into a topic, and stops being assessable;
     3. a short course quietly drops modules, so a management band is
        told safety data protection is not their concern.

   Each is a sentence somebody would write in good faith while tidying.
   ============================================================ */
import { describe, it, expect } from "vitest";
import {
  IS_AN_ICAO_STP, STP_METHOD_SOURCE, isAssessable, UNASSESSABLE_VERBS,
  minutesPerModule, outlineFor, allOutlines,
} from "../packages/shared/src/stp";
import {
  TRAINING_BANDS, SYLLABUS_MODULES, RECOMMENDED_TIMING,
  CURRICULUM_VERIFIED_AGAINST_PRIMARY, CURRICULUM_INSTRUMENT,
} from "../packages/shared/src/curriculum";

describe("what it refuses to claim", () => {
  it("DOES NOT CLAIM TO BE AN ICAO STP", () => {
    /* ICAO's Standardized Training Packages are ICAO's own products.
       Shipping one and saying so is a claim an auditor can disprove. */
    expect(IS_AN_ICAO_STP).toBe(false);
  });

  it("names the methodology and the syllabus separately", () => {
    /* The method is ICAO's; the content is KCAA's. Conflating them is
       how the false claim gets made by accident. */
    expect(STP_METHOD_SOURCE).toMatch(/TRAINAIR PLUS/);
    expect(STP_METHOD_SOURCE).toMatch(/CAA-AC-SMS011/);
  });

  it("carries the circular it was read from, and that it WAS read", () => {
    expect(CURRICULUM_VERIFIED_AGAINST_PRIMARY).toBe(true);
    expect(CURRICULUM_INSTRUMENT.reference).toBe("CAA-AC-SMS011");
    /* The cover/header disagreement is recorded rather than resolved. */
    expect(CURRICULUM_INSTRUMENT.issuedDateDisputed).toBeTruthy();
  });
});

describe("an objective is assessable, or it is a topic", () => {
  it("rejects the verbs two assessors cannot agree on", () => {
    for (const v of UNASSESSABLE_VERBS) {
      expect(isAssessable(`${v} hazard identification`), v).toBe(false);
    }
  });

  it("accepts an observable performance", () => {
    expect(isAssessable("Raise a hazard and assign an initial risk index")).toBe(true);
    expect(isAssessable("File a safety report through the operator's reporting system")).toBe(true);
  });

  it("EVERY objective this module ships is assessable, and names its standard", () => {
    /* The assertion the whole file exists for. An objective with no
       standard cannot be marked; one with an unobservable verb cannot
       be marked consistently. */
    for (const course of allOutlines()) {
      expect(course.objectives.length, course.bandKey).toBeGreaterThan(0);
      for (const o of course.objectives) {
        expect(isAssessable(o.performance), `${course.bandKey}: ${o.performance}`).toBe(true);
        expect(o.conditions.length, o.performance).toBeGreaterThan(10);
        expect(o.standard.length, o.performance).toBeGreaterThan(10);
      }
    }
  });
});

describe("the courses themselves", () => {
  it("gives every band every module, at different depth", () => {
    /* Section 8.5 tailors DEPTH, not the module list. Dropping Module 6
       from the one-day management course would tell a finance director
       that safety data protection is not their concern — and section
       9.1.11 puts it directly on their list. */
    for (const course of allOutlines()) {
      expect(course.content.map((c) => c.moduleNumber), course.bandKey)
        .toEqual(SYLLABUS_MODULES.map((m) => m.number));
    }
  });

  it("spends the whole course and no more", () => {
    for (const band of TRAINING_BANDS) {
      const spent = minutesPerModule(band.days).reduce((a, b) => a + b, 0);
      const budget = band.days * 6 * 60;
      /* Rounded to five minutes per module, so six modules can drift by
         at most fifteen minutes either way. */
      expect(Math.abs(spent - budget), band.key).toBeLessThanOrEqual(15);
    }
  });

  it("WEIGHTS BY SECTION COUNT rather than dividing equally", () => {
    /* Module 2 has eight sections and Module 4 has two. An equal split
       would give them the same time, which is the easy lie this
       function exists to avoid. */
    const m = minutesPerModule(5);
    const two = SYLLABUS_MODULES.findIndex((x) => x.number === 2);
    const four = SYLLABUS_MODULES.findIndex((x) => x.number === 4);
    expect(m[two]!).toBeGreaterThan(m[four]!);
  });

  it("asks for practical assessment exactly where Appendix I does", () => {
    for (const band of TRAINING_BANDS) {
      const course = outlineFor(band);
      const hasPractical = course.assessment.some((a) => /practical/i.test(a));
      expect(hasPractical, band.key).toBe(band.practicalRequired);
    }
  });

  it("states the recurrence AND that it is a recommendation, not a rule", () => {
    /* The distinction this repository keeps everywhere: an advisory
       circular recommends, the Regulations prescribe. An operator told
       otherwise would think it was law. */
    expect(RECOMMENDED_TIMING.refresherMonths).toBe(24);
    for (const course of allOutlines()) {
      expect(course.recurrence).toMatch(/24 months/);
      expect(course.recurrence, course.bandKey).toMatch(/not prescribed by regulation/i);
    }
  });

  it("the four bands are Appendix I's four, with its durations", () => {
    expect(TRAINING_BANDS.map((b) => b.days)).toEqual([2, 2, 1, 5]);
    expect(TRAINING_BANDS.map((b) => b.practicalRequired)).toEqual([false, true, false, true]);
  });
});
