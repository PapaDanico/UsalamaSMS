/* =====================================================================
   AMENDMENT 2, AND THE TWO WAYS THIS COULD BECOME A SALES PAGE.

   A readiness checklist is a lead magnet, which is exactly why it
   needs tests. Two failures would both be profitable and both be
   wrong:

     1. every change maps to a surface of this product, so the answer
        to "are you ready" is always "buy this";
     2. the date drifts, or is clamped, so nobody is ever told they
        are late.

   The assertions below exist to make both impossible.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  CHANGES, NEWLY_IN_SCOPE, AMENDMENT2_DATES, AMENDMENT2_SOURCE,
  AMENDMENT2_VERIFIED_AGAINST_PRIMARY, daysUntilApplicable, assessReadiness,
} from "../packages/shared/src/amendment2";

const BEFORE = new Date("2026-08-17T00:00:00.000Z");
const AFTER = new Date("2026-12-08T00:00:00.000Z");

describe("the date, which is the whole reason this exists", () => {
  it("counts down to the APPLICABLE date, not the effective one", () => {
    /* Effective binds the State; applicable is when an operator is
       audited. Counting to the wrong one would tell every operator
       they were nine months late. */
    expect(AMENDMENT2_DATES.applicable).toBe("2026-11-26");
    expect(daysUntilApplicable(BEFORE)).toBe(101);
  });

  it("GOES NEGATIVE RATHER THAN CLAMPING AT ZERO", () => {
    /* "0 days left" and "12 days overdue" are different sentences, and
       a checklist that could only ever say zero would quietly stop
       being urgent on the one day it matters most. */
    expect(daysUntilApplicable(AFTER)).toBeLessThan(0);
    expect(assessReadiness([], AFTER).overdue).toBe(true);
    expect(assessReadiness([], BEFORE).overdue).toBe(false);
  });

  it("keeps the three dates in the order they actually happen", () => {
    expect(Date.parse(AMENDMENT2_DATES.adopted))
      .toBeLessThan(Date.parse(AMENDMENT2_DATES.effective));
    expect(Date.parse(AMENDMENT2_DATES.effective))
      .toBeLessThan(Date.parse(AMENDMENT2_DATES.applicable));
  });
});

describe("what it will not turn into", () => {
  it("DOES NOT MAP EVERY CHANGE TO SOMETHING WE SELL", () => {
    /* The assertion this file exists for. If every change had a
       surface, the checklist would answer "buy this" to every question
       and be worthless as a diagnostic — and an operator would find out
       the hard way that we do not do information sharing. */
    const unsupported = CHANGES.filter((c) => c.surface === null);
    expect(unsupported.length).toBeGreaterThan(0);
    for (const c of unsupported) {
      expect(c.notHere, `${c.key} has no surface and no explanation`).toBeTruthy();
      expect(c.notHere!.length).toBeGreaterThan(40);
    }
  });

  it("and separates 'still outstanding' from 'we can help'", () => {
    const r = assessReadiness([], BEFORE);
    expect(r.outstanding.length).toBe(CHANGES.length);
    /* Strictly fewer, because at least one change is something this
       product does not do. */
    expect(r.weCanHelpWith.length).toBeLessThan(r.outstanding.length);
  });

  it("produces NO percentage", () => {
    const r = assessReadiness(["PERFORMANCE"], BEFORE) as unknown as Record<string, unknown>;
    /* A single number reads as "83% compliant", which is not a thing an
       auditor recognises and not a claim anybody here can make on an
       operator's behalf. */
    expect(r.score).toBeUndefined();
    expect(r.percentage).toBeUndefined();
  });

  it("says it was not read from the amended Annex itself", () => {
    expect(AMENDMENT2_VERIFIED_AGAINST_PRIMARY).toBe(false);
    expect(AMENDMENT2_SOURCE).toMatch(/not from the amended Annex/i);
    /* And that it feeds no deadline — reporting windows come from
       L.N. 32, read as an instrument, and stay that way. */
    expect(AMENDMENT2_SOURCE).toMatch(/L\.N\. 32/);
  });
});

describe("scoring an operator's own answers", () => {
  it("counts what they say they can show, and lists the rest", () => {
    const r = assessReadiness(["PERFORMANCE", "SDCPS"], BEFORE);
    expect(r.ready).toEqual(["PERFORMANCE", "SDCPS"]);
    expect(r.outstanding.map((c) => c.key)).not.toContain("PERFORMANCE");
    expect(r.outstanding).toHaveLength(CHANGES.length - 2);
  });

  it("an operator who can show everything has nothing outstanding", () => {
    const r = assessReadiness(CHANGES.map((c) => c.key), BEFORE);
    expect(r.outstanding).toHaveLength(0);
    expect(r.weCanHelpWith).toHaveLength(0);
  });

  it("ignores answers that are not changes", () => {
    const r = assessReadiness(["NOT_A_CHANGE"], BEFORE);
    expect(r.ready).toHaveLength(0);
    expect(r.outstanding).toHaveLength(CHANGES.length);
  });
});

describe("who is newly captured", () => {
  it("names the three populations, each with why it is hard for them", () => {
    expect(NEWLY_IN_SCOPE.length).toBe(3);
    for (const p of NEWLY_IN_SCOPE) {
      expect(p.who.length).toBeGreaterThan(15);
      expect(p.note.length).toBeGreaterThan(30);
    }
    expect(NEWLY_IN_SCOPE.map((p) => p.who).join(" ")).toMatch(/RPAS/);
    expect(NEWLY_IN_SCOPE.map((p) => p.who).join(" ")).toMatch(/heliport/i);
  });

  it("every change says what an operator must SHOW, not what it means", () => {
    for (const c of CHANGES) {
      expect(c.show.length, c.key).toBeGreaterThan(40);
      expect(c.title.length, c.key).toBeGreaterThan(15);
    }
  });
});
