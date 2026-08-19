/* =====================================================================
   STARTER SPI TESTS.

   Three things this file guards:

   1. THE LIST COMPILES AND IS INTERNALLY CONSISTENT. Every starter
      has a unique id, a non-empty name, a valid kind/direction/type
      combination, and a positive per. None of these can be asserted
      by TypeScript alone — a string field set to "" is typed correctly
      and wrong.

   2. THE FILTER FUNCTION BEHAVES CORRECTLY. `startersFor` must include
      starters marked "ALL", include kind-specific starters for the
      right kind, and exclude them for the wrong kind. The four cases
      are all tested, and the mutation that matters — changing a kind-
      specific starter to the wrong kind — reddens the specific test.

   3. EVERY STARTER SPANS BOTH INDICATOR HALVES. Doc 9859's rarity
      axis (HIGH/LOWER_CONSEQUENCE) and the Authority's field 3
      (ACTIVITY/OUTCOME) are different questions. A list that only has
      outcome indicators cannot demonstrate a leading-indicator
      programme; a list with only activity indicators misses the
      reactive half. Both types must be present.

   WHAT IT DOES NOT ASSERT. The content of rationale, limitations and
   source strings — those are judgements, not counts, and a test that
   checked for a specific word would make a legitimate update fail
   rather than catching a genuine error. The rule is: non-empty, which
   TypeScript already enforces at the type boundary; and present as a
   field on every starter, which the interface enforces.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  SPI_STARTERS,
  startersFor,
  type SpiStarter,
} from "../packages/shared/src/spi-starters";

describe("SPI_STARTERS structural integrity", () => {
  it("has at least six starters — fewer means somebody deleted one without a test failing", () => {
    /* The minimum that makes the list useful rather than illustrative.
       If this fails because one was removed deliberately, lower the
       number and record the reason here. */
    expect(SPI_STARTERS.length).toBeGreaterThanOrEqual(6);
  });

  it("every id is unique", () => {
    const ids = SPI_STARTERS.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every id is a non-empty kebab-case slug", () => {
    for (const s of SPI_STARTERS) {
      expect(s.id, s.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("every name is non-empty", () => {
    for (const s of SPI_STARTERS) {
      expect(s.name.trim(), s.id).not.toBe("");
    }
  });

  it("every per is a positive integer", () => {
    for (const s of SPI_STARTERS) {
      expect(Number.isInteger(s.per), s.id).toBe(true);
      expect(s.per, s.id).toBeGreaterThan(0);
    }
  });

  it("every kind is a valid IndicatorKind", () => {
    const VALID = new Set(["HIGH_CONSEQUENCE", "LOWER_CONSEQUENCE"]);
    for (const s of SPI_STARTERS) {
      expect(VALID.has(s.kind), `${s.id}: ${s.kind}`).toBe(true);
    }
  });

  it("every direction is a valid Direction", () => {
    const VALID = new Set(["LOWER_IS_BETTER", "HIGHER_IS_BETTER"]);
    for (const s of SPI_STARTERS) {
      expect(VALID.has(s.direction), `${s.id}: ${s.direction}`).toBe(true);
    }
  });

  it("every indicatorType is a valid IndicatorType", () => {
    const VALID = new Set(["ACTIVITY", "OUTCOME"]);
    for (const s of SPI_STARTERS) {
      expect(VALID.has(s.indicatorType), `${s.id}: ${s.indicatorType}`).toBe(true);
    }
  });

  it("every starter has non-empty rationale, formula, limitations and source", () => {
    for (const s of SPI_STARTERS) {
      expect(s.rationale.trim(), `${s.id} rationale`).not.toBe("");
      expect(s.formula.trim(), `${s.id} formula`).not.toBe("");
      expect(s.limitations.trim(), `${s.id} limitations`).not.toBe("");
      expect(s.source.trim(), `${s.id} source`).not.toBe("");
      expect(s.youStillDecide.trim(), `${s.id} youStillDecide`).not.toBe("");
    }
  });

  it("every forKinds is either 'ALL' or a non-empty array of valid OperatorKinds", () => {
    const VALID_KINDS = new Set(["AOC", "RPAS", "HELIPORT", "MRO"]);
    for (const s of SPI_STARTERS) {
      if (s.forKinds === "ALL") continue;
      expect(Array.isArray(s.forKinds), s.id).toBe(true);
      expect((s.forKinds as string[]).length, s.id).toBeGreaterThan(0);
      for (const k of s.forKinds as string[]) {
        expect(VALID_KINDS.has(k), `${s.id}: ${k}`).toBe(true);
      }
    }
  });
});

describe("the starter list spans both indicator halves", () => {
  it("includes at least one ACTIVITY (leading) indicator", () => {
    /* A programme with only outcome indicators cannot demonstrate
       proactive safety management to the Authority. */
    expect(SPI_STARTERS.some((s) => s.indicatorType === "ACTIVITY")).toBe(true);
  });

  it("includes at least one OUTCOME (lagging) indicator", () => {
    expect(SPI_STARTERS.some((s) => s.indicatorType === "OUTCOME")).toBe(true);
  });

  it("includes at least one HIGH_CONSEQUENCE indicator", () => {
    /* Doc 9859 §9.2 requires SPIs to span the performance spectrum.
       A list with only lower-consequence indicators cannot demonstrate that. */
    expect(SPI_STARTERS.some((s) => s.kind === "HIGH_CONSEQUENCE")).toBe(true);
  });

  it("includes at least one LOWER_CONSEQUENCE indicator", () => {
    expect(SPI_STARTERS.some((s) => s.kind === "LOWER_CONSEQUENCE")).toBe(true);
  });

  it("includes at least one HIGHER_IS_BETTER indicator", () => {
    /* Without one, the list cannot model a programme that measures
       positive safety behaviour — only the absence of bad events. */
    expect(SPI_STARTERS.some((s) => s.direction === "HIGHER_IS_BETTER")).toBe(true);
  });
});

describe("startersFor filters correctly", () => {
  it("returns all starters when no kind is given", () => {
    expect(startersFor()).toEqual(SPI_STARTERS);
    expect(startersFor(null)).toEqual(SPI_STARTERS);
    expect(startersFor(undefined)).toEqual(SPI_STARTERS);
  });

  it("always includes 'ALL' starters for any valid kind", () => {
    const allStarters = SPI_STARTERS.filter((s) => s.forKinds === "ALL");
    if (allStarters.length === 0) return; // none marked ALL — no assertion to make
    for (const kind of ["AOC", "RPAS", "HELIPORT", "MRO"] as const) {
      const result = startersFor(kind);
      for (const s of allStarters) {
        expect(result.some((r) => r.id === s.id), `${s.id} missing from ${kind}`).toBe(true);
      }
    }
  });

  it("includes kind-specific starters for the matching kind", () => {
    /* days-to-first-closure is forKinds: "ALL" and always present;
       mel-deferral-age-days is AOC-only. Use it to prove kind filtering
       works without hard-coding the full list. */
    const aocOnly = SPI_STARTERS.filter(
      (s) => s.forKinds !== "ALL" && (s.forKinds as string[]).includes("AOC"),
    );
    if (aocOnly.length === 0) return;
    const result = startersFor("AOC");
    for (const s of aocOnly) {
      expect(result.some((r) => r.id === s.id), `${s.id} missing from AOC results`).toBe(true);
    }
  });

  it("excludes AOC-only starters from RPAS results", () => {
    const aocOnly = SPI_STARTERS.filter(
      (s) =>
        s.forKinds !== "ALL" &&
        (s.forKinds as string[]).includes("AOC") &&
        !(s.forKinds as string[]).includes("RPAS"),
    );
    if (aocOnly.length === 0) return; // no AOC-only starters — nothing to assert
    const rpasResult = startersFor("RPAS");
    for (const s of aocOnly) {
      expect(rpasResult.some((r) => r.id === s.id), `${s.id} should not appear in RPAS`).toBe(
        false,
      );
    }
  });

  it("excludes MRO-only starters from HELIPORT results", () => {
    const mroOnly = SPI_STARTERS.filter(
      (s) =>
        s.forKinds !== "ALL" &&
        (s.forKinds as string[]).includes("MRO") &&
        !(s.forKinds as string[]).includes("HELIPORT"),
    );
    if (mroOnly.length === 0) return;
    const heliResult = startersFor("HELIPORT");
    for (const s of mroOnly) {
      expect(heliResult.some((r) => r.id === s.id), `${s.id} should not appear in HELIPORT`).toBe(
        false,
      );
    }
  });

  it("every kind returns at least two starters", () => {
    /* An operator should never face a list of one. If this fails for
       a newly added kind, add another starter or lower the floor with
       a comment explaining why one is enough. */
    for (const kind of ["AOC", "RPAS", "HELIPORT", "MRO"] as const) {
      expect(startersFor(kind).length, kind).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("the 'days-to-first-closure' starter is present and correct", () => {
  /* This is the indicator the transition record was built for. Its
     presence and correctness is tested by name because it is the
     one we can most precisely reason about — the product already
     holds the data, so the starter pre-fills what it knows. */
  const starter = SPI_STARTERS.find((s) => s.id === "days-to-first-closure") as SpiStarter;

  it("exists in the list", () => {
    expect(starter).toBeDefined();
  });

  it("is forKinds ALL — every operator type should track closure time", () => {
    expect(starter.forKinds).toBe("ALL");
  });

  it("is an OUTCOME indicator — it measures what happened, not a precursor", () => {
    expect(starter.indicatorType).toBe("OUTCOME");
  });

  it("is LOWER_IS_BETTER — a shorter time is a faster investigation", () => {
    expect(starter.direction).toBe("LOWER_IS_BETTER");
  });
});
