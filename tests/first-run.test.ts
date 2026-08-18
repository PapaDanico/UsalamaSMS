/* =====================================================================
   AN EMPTY RECORD IS NOT A CLEAR ONE.

   Measured on 18 August 2026: a brand-new operator — signed in, nothing
   filed, no indicator, nothing on the register — opened /today and read
   "Nothing needs you today", over a lede listing four things that were
   not wrong. Every clause was true and together they told somebody who
   had done nothing at all that everything was fine.

   today.ts already refused to call an UNKNOWN clear, and gave the
   reason: a screen whose job is to answer "is everything all right"
   must not say the most reassuring possible thing at the moment it
   knows least. These assert the same argument extended to EMPTY.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  establishment, nextStep, FIRST_RUN, type RecordScale,
} from "../packages/shared/src/today";

const scale = (r: number, i: number, k: number): RecordScale => ({
  reports: r, indicators: i, registerEntries: k,
});

describe("whether an operator is running yet", () => {
  it("NOTHING AT ALL IS EMPTY — the state the screen could not see", () => {
    expect(establishment(scale(0, 0, 0))).toBe("EMPTY");
  });

  it("ONE REPORT IS NOT EMPTY, so the first step stops being offered", () => {
    /* The other direction, and it matters as much. A product that keeps
       offering the first step to somebody who took it reads as not
       having noticed they did. */
    expect(establishment(scale(1, 0, 0))).toBe("STARTED");
  });

  it("and a retracted-only history still counts as reporting", () => {
    /* computeRecordScale counts reports without filtering retractedAt:
       filing and correcting is a working reporting culture, not an
       empty one. This asserts the shape that decision produces. */
    expect(establishment(scale(3, 0, 0))).not.toBe("EMPTY");
  });

  it("reports AND an indicator is established", () => {
    expect(establishment(scale(1, 1, 0))).toBe("ESTABLISHED");
  });

  it("an indicator with no reports is STARTED, not established", () => {
    /* An indicator counts occurrences. One defined over a record with
       no reports has nothing to count, and grading that as established
       would be the overstating twin of the defect this file exists
       for. */
    expect(establishment(scale(0, 1, 0))).toBe("STARTED");
  });
});

describe("the first fifteen minutes", () => {
  it("IS THREE STEPS, IN THE ORDER THAT MAKES EACH ONE WORTH DOING", () => {
    expect(FIRST_RUN.map((s) => s.key)).toEqual(["REPORT", "INDICATOR", "REGISTER"]);
  });

  it("names an instrument for the step that has one, rather than asserting authority", () => {
    const indicator = FIRST_RUN.find((s) => s.key === "INDICATOR")!;
    expect(indicator.why).toMatch(/L\.N\. 32/);
    expect(indicator.why).toMatch(/9\(5\)/);
  });

  it("every step goes somewhere and says what happens there", () => {
    for (const s of FIRST_RUN) {
      expect(s.where, `${s.key} has no destination`).toMatch(/^\//);
      expect(s.action.length, `${s.key} has no call to action`).toBeGreaterThan(3);
      expect(s.why.length, `${s.key} does not say why`).toBeGreaterThan(20);
    }
  });

  it("POINTS AT THE REPORT FORM FIRST, which is the whole product's entry", () => {
    expect(nextStep(scale(0, 0, 0))?.where).toBe("/report");
  });

  it("moves on once the report exists, rather than repeating itself", () => {
    expect(nextStep(scale(1, 0, 0))?.key).toBe("INDICATOR");
    expect(nextStep(scale(1, 1, 0))?.key).toBe("REGISTER");
  });

  it("AND STOPS once the operator is running", () => {
    /* A sequence with no end is a nag. */
    expect(nextStep(scale(1, 1, 1))).toBeNull();
  });
});
