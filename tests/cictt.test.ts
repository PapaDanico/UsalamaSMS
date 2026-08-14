/* ============================================================
   THE CODES A STATE FILES.

   This module is the one place in the product that carries somebody
   else's taxonomy, and it carries it INCOMPLETELY on purpose — codes
   and published names, never definitions, and fewer categories than
   CICTT 4.8 defines. Most of what is asserted here is therefore about
   the honesty of that partial position rather than about the lookups,
   because the lookups are trivial and the honesty is what an operator
   is relying on when they pick a category.
   ============================================================ */
import { describe, it, expect } from "vitest";
import {
  OCCURRENCE_CATEGORIES,
  CATEGORY_GROUPS,
  categoriesIn,
  categoryFor,
  unrecognised,
  CICTT_CAVEAT,
  CICTT_VERSION,
  CICTT_VERIFIED_AGAINST_PRIMARY,
} from "../packages/shared/src/cictt";

describe("the taxonomy is internally consistent", () => {
  it("has no duplicate codes", () => {
    const codes = OCCURRENCE_CATEGORIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("puts every category in a declared group, and every group has categories", () => {
    /* BOTH DIRECTIONS. A category whose group is not in CATEGORY_GROUPS
       renders nowhere at all — the form iterates the groups — and a
       group with nothing in it renders an empty fieldset with a legend,
       which reads as "no categories apply here" rather than as a
       mistake. */
    for (const c of OCCURRENCE_CATEGORIES) {
      expect(CATEGORY_GROUPS).toContain(c.group);
    }
    for (const g of CATEGORY_GROUPS) {
      expect(categoriesIn(g).length).toBeGreaterThan(0);
    }
  });

  it("accounts for every category exactly once across the groups", () => {
    const grouped = CATEGORY_GROUPS.flatMap((g) => categoriesIn(g));
    expect(grouped.length).toBe(OCCURRENCE_CATEGORIES.length);
  });

  it("gives every category a name that is not just its code", () => {
    /* The screen shows the code AND its name because "RE" is legible
       only to somebody who already knows the taxonomy. A row whose
       label is its own code would render that badge as "RE RE" and
       teach nobody anything. */
    for (const c of OCCURRENCE_CATEGORIES) {
      expect(c.label.trim().length).toBeGreaterThan(c.code.length);
      expect(c.label).not.toBe(c.code);
    }
  });
});

describe("looking a code up never throws", () => {
  it("resolves a known code", () => {
    expect(categoryFor("LOC-I")?.label).toMatch(/loss of control/i);
  });

  it("returns null rather than throwing on anything else", () => {
    for (const junk of ["", "  ", "NOPE", "loc-i", "'; DROP TABLE"]) {
      expect(categoryFor(junk)).toBeNull();
    }
  });
});

describe("an unknown code is REPORTED, not refused", () => {
  /* The rule this module exists to hold. The list is incomplete by
     admission, so an operator sending a legitimate CICTT code this
     build has not got yet has found a gap in the software — they have
     not made an error in their report. The route stores what it was
     given and reports what it could not resolve; refusing would turn a
     shortfall here into a rejected occurrence. */
  it("names only the codes it does not hold", () => {
    expect(unrecognised(["RE", "LOC-I"])).toEqual([]);
    expect(unrecognised(["RE", "ZZZ", "LOC-I"])).toEqual(["ZZZ"]);
  });

  it("is empty for an empty submission", () => {
    expect(unrecognised([])).toEqual([]);
  });

  it("does not silently accept a lower-case code", () => {
    /* The API upper-cases before it gets here. If that ever stops, this
       says so rather than letting `re` be stored as a category that
       matches nothing on any subsequent read. */
    expect(unrecognised(["re"])).toEqual(["re"]);
  });
});

describe("the partial position is stated, not implied", () => {
  it("declares that the primary document has NOT been read", () => {
    /* Flipping this to true is a claim that somebody opened CICTT 4.8
       beside the module and checked every row. If that is ever done,
       this assertion is what makes them change the flag deliberately
       rather than find it already true. */
    expect(CICTT_VERIFIED_AGAINST_PRIMARY).toBe(false);
  });

  it("carries no definitions, only codes and names", () => {
    /* THE ASSERTION IS THE ABSENCE. A category's definition runs to a
       paragraph with usage notes and exclusions, and it is what decides
       a borderline case. Anything long enough to read as a definition
       in this file would be a paraphrase from a secondary source
       wearing the authority of the primary one. */
    for (const c of OCCURRENCE_CATEGORIES) {
      expect(c.label.length).toBeLessThan(120);
      expect(Object.keys(c).sort()).toEqual(["code", "group", "label"]);
    }
  });

  it("says the list is incomplete, and offers somewhere to put what does not fit", () => {
    expect(CICTT_CAVEAT).toMatch(/not\s+\n?\s*complete|incomplete/i);
    expect(OCCURRENCE_CATEGORIES.some((c) => c.code === "OTHR")).toBe(true);
    expect(OCCURRENCE_CATEGORIES.some((c) => c.code === "UNK")).toBe(true);
  });

  it("names the version the codes came from, in the caveat a user reads", () => {
    /* Not only in a constant a developer reads. A safety officer
       picking a category is entitled to know which edition of the
       taxonomy they are picking from, because the categories change
       between them. */
    expect(CICTT_CAVEAT).toContain(CICTT_VERSION);
  });

  it("tells the reader definitions are elsewhere rather than leaving it to be noticed", () => {
    expect(CICTT_CAVEAT).toMatch(/definition/i);
  });
});
