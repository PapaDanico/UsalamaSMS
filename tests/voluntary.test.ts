/* ============================================================
   Regulation 13 of L.N. 32/2026, asserted against the module that
   claims to carry it.

   WHY THESE ARE WORTH HAVING. The product shipped a "voluntary and
   confidential" report type for months and stated none of what the
   regulation requires such a system to be or define. A category label
   is the easiest kind of overclaim to make and the hardest to notice,
   because nothing about it is wrong — it is simply not the thing the
   regulation is about.

   The checks below are therefore about COMPLETENESS AND ATTRIBUTION
   rather than about wording: all six sub-paragraphs present, each
   citing where it came from, and none of them silently dropped by a
   later edit that tidied the list.
   ============================================================ */

import { describe, it, expect } from "vitest";
import {
  VOLUNTARY_REQUIREMENTS,
  VOLUNTARY_REQUIREMENT_COUNT,
  VOLUNTARY_PROTECTION,
  VOLUNTARY_INSTRUMENT,
  unanswered,
} from "../packages/shared/src/voluntary";

describe("regulation 13 — the voluntary reporting system", () => {
  it("CARRIES ALL SIX OF 13(3), and names them (a) to (f)", () => {
    /* The regulation lists six. Five is not a shorter list, it is a
       system that fails to define something — and the one most likely
       to be dropped in a tidy-up is (e), how reports are processed,
       because it is the longest to write. */
    expect(VOLUNTARY_REQUIREMENT_COUNT).toBe(6);
    const cites = VOLUNTARY_REQUIREMENTS.map((r) => r.cite);
    expect(cites).toEqual([
      "13(3)(a)",
      "13(3)(b)",
      "13(3)(c)",
      "13(3)(d)",
      "13(3)(e)",
      "13(3)(f)",
    ]);
  });

  it("keeps them in the regulation's order, not a form's", () => {
    // The order a reader checks against the gazette. Reordering to suit
    // a layout makes that check harder for whoever most needs to do it.
    const letters = VOLUNTARY_REQUIREMENTS.map((r) => r.cite.slice(-2, -1));
    expect(letters).toEqual([...letters].sort());
  });

  it("gives every requirement both a requirement and a question", () => {
    /* Two registers on purpose: the regulation's words, so an operator
       can match them to the instrument, and the question they actually
       answer. A requirement with no question is a quotation nobody can
       act on. */
    /* ASSERTED AS PRESENT AND SHAPED, NOT AS LONG ENOUGH. The first
       version required more than fifteen characters and failed on
       13(3)(c) — "Who can report." — which is exactly fifteen because
       that is how brief the regulation itself is there. An arbitrary
       length threshold that fails a faithful transcription is a check
       pushing the code to pad a quotation, which is the opposite of
       what this module is for. */
    for (const r of VOLUNTARY_REQUIREMENTS) {
      expect(r.requirement.trim(), `${r.cite} has no requirement`).not.toBe("");
      expect(r.requirement, `${r.cite}'s requirement is not a statement`).toMatch(/\.$/);
      expect(r.question.trim(), `${r.cite} has no question`).not.toBe("");
      expect(r.question, `${r.cite}'s question is not a question`).toMatch(/\?$/);
      expect(r.requirement, `${r.cite} is a placeholder`).not.toMatch(/TODO|TBC|\bxxx\b/i);
    }
  });

  it("STATES 13(2)'s PROTECTION AS A REQUIREMENT, not as a reassurance", () => {
    /* "We treat reports confidentially" is a promise a product makes.
       Non-punitive, affording protection to the sources, is a property
       the operator's system must have — and the difference is what an
       inspector asks about. */
    expect(VOLUNTARY_PROTECTION.cite).toBe("regulation 13(2)");
    expect(VOLUNTARY_PROTECTION.text).toMatch(/non-punitive/i);
    expect(VOLUNTARY_PROTECTION.text).toMatch(/protection to the sources/i);
  });

  it("cites the gazetted instrument, not the advisory circular it replaced", () => {
    expect(VOLUNTARY_INSTRUMENT).toMatch(/L\.N\. 32 of 2026/);
    expect(VOLUNTARY_INSTRUMENT).toMatch(/regulation 13/);
    expect(VOLUNTARY_INSTRUMENT).not.toMatch(/CAA-AC-SMS/);
  });

  it("REPORTS WHAT IS UNANSWERED RATHER THAN A SCORE", () => {
    /* Regulation 13(3) is not scored. An operator that has not defined
       who may report has not partly defined it, and "four of six"
       invites exactly that reading — which is the overclaim this whole
       module exists to stop making. */
    expect(unanswered({}).length).toBe(6);

    const partial = { "13(3)(a)": "To find hazards before they bite.", "13(3)(c)": "Anyone." };
    const left = unanswered(partial);
    expect(left.length).toBe(4);
    expect(left.map((r) => r.cite)).not.toContain("13(3)(a)");
    expect(left.map((r) => r.cite)).toContain("13(3)(e)");
  });

  it("treats whitespace as unanswered, because a space is not a definition", () => {
    const blank = Object.fromEntries(VOLUNTARY_REQUIREMENTS.map((r) => [r.cite, "   "]));
    expect(unanswered(blank).length).toBe(6);
  });

  it("counts nothing left when all six are answered", () => {
    const full = Object.fromEntries(
      VOLUNTARY_REQUIREMENTS.map((r) => [r.cite, "An actual answer."]),
    );
    expect(unanswered(full)).toHaveLength(0);
  });
});
