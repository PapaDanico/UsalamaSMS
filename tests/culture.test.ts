/* =====================================================================
   The safety culture survey, and the three things it refuses to do.
   Each refusal is asserted here, because a refusal nothing tests is a
   paragraph rather than a property.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CULTURE_ITEMS, CULTURE_SCALE, CULTURE_MIN, CULTURE_MAX, CULTURE_MIN_RESPONSES,
  dimensionsOf, pointsFor, score, bandFor, leadFinding,
  type CultureResponse, type CultureDimension,
} from "../packages/shared/src/culture";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../packages/shared/src/culture.ts"),
  "utf8",
);

/** Everyone answers the same point on every item. */
const everyone = (n: number, people: number): CultureResponse[] =>
  Array.from({ length: people }, () =>
    Object.fromEntries(CULTURE_ITEMS.map((i) => [i.id, n])),
  );

const meanOf = (v: ReturnType<typeof score>, d: CultureDimension): number => {
  if (v.kind !== "SCORED") throw new Error("expected a scored verdict");
  return v.dimensions.find((x) => x.dimension === d)!.mean;
};

describe("the survey instrument", () => {
  it("EVERY DIMENSION'S REASONING IS IN THE SOURCE, because these are not ICAO's", () => {
    /* The same discipline discovery.ts uses. This product cannot read
       Doc 9859 from this environment, so the dimensions are its own
       judgement — and a judgement with no argument beside it is a
       preference. The header must carry a line for each. */
    const header = SOURCE.slice(0, SOURCE.indexOf("export type CultureDimension"));
    expect(header.length, "the header is not there at all").toBeGreaterThan(1500);
    for (const d of dimensionsOf()) {
      expect(header, `${d} is a dimension with no argument in the header`).toContain(d);
    }
  });

  it("says plainly that it is not ICAO's questionnaire", () => {
    // Charter rule 12. If this sentence is ever deleted the module
    // starts implying an authority it does not have.
    expect(SOURCE).toMatch(/NOT ICAO/i);
  });

  it("every item belongs to a declared dimension and no dimension is empty", () => {
    const declared = new Set(dimensionsOf());
    for (const i of CULTURE_ITEMS) expect(declared.has(i.dimension)).toBe(true);
    for (const d of declared) {
      expect(CULTURE_ITEMS.filter((i) => i.dimension === d).length,
        `${d} has no items, so it can never be scored`).toBeGreaterThan(1);
    }
  });

  it("carries reversed items, or it measures agreeableness", () => {
    const reversed = CULTURE_ITEMS.filter((i) => i.reversed);
    expect(reversed.length, "no reversed items — a respondent can agree with everything")
      .toBeGreaterThan(2);
    // And they are spread, not all in one dimension.
    expect(new Set(reversed.map((i) => i.dimension)).size).toBeGreaterThan(2);
  });

  it("uses the whole declared scale and nothing outside it", () => {
    expect(CULTURE_SCALE.map((s) => s.value)).toEqual([1, 2, 3, 4, 5]);
    expect(Math.min(...CULTURE_SCALE.map((s) => s.value))).toBe(CULTURE_MIN);
    expect(Math.max(...CULTURE_SCALE.map((s) => s.value))).toBe(CULTURE_MAX);
    for (const s of CULTURE_SCALE) expect(s.label.length).toBeGreaterThan(3);
  });
});

describe("REFUSAL 1 — results are suppressed below the minimum", () => {
  it("refuses to score four people, however complete their answers", () => {
    const v = score(everyone(5, CULTURE_MIN_RESPONSES - 1));
    expect(v.kind).toBe("SUPPRESSED");
    if (v.kind !== "SUPPRESSED") throw new Error("unreachable");
    expect(v.needed).toBe(CULTURE_MIN_RESPONSES);
  });

  it("and the refusal carries no dimension means at all", () => {
    /* The point of computing suppression FIRST. If a mean over four
       people existed on the returned object, something downstream
       would eventually render it. */
    const v = score(everyone(1, 2));
    expect(JSON.stringify(v)).not.toContain("mean");
    expect(Object.keys(v)).not.toContain("dimensions");
  });

  it("scores at exactly the minimum, so the boundary is not off by one", () => {
    expect(score(everyone(4, CULTURE_MIN_RESPONSES)).kind).toBe("SCORED");
  });

  it("has no way to lower the threshold", () => {
    // An operator who could lower it would lower it on the day the
    // answers were interesting.
    expect(score.length, "score() takes a second argument — a threshold override?").toBe(1);
  });
});

describe("REFUSAL 2 — no single culture score", () => {
  it("returns five dimensions and nothing that averages them", () => {
    const v = score(everyone(4, 8));
    if (v.kind !== "SCORED") throw new Error("expected SCORED");
    expect(v.dimensions.map((d) => d.dimension).sort()).toEqual([...dimensionsOf()].sort());
    const keys = Object.keys(v);
    for (const forbidden of ["score", "overall", "index", "total", "grade"]) {
      expect(keys, `the verdict exposes ${forbidden} — that is the single number`)
        .not.toContain(forbidden);
    }
  });
});

describe("reversed items are flipped exactly once", () => {
  it("a respondent who agrees with everything scores LOW where agreeing is bad", () => {
    /* THE MUTATION THIS EXISTS FOR: delete the reversal in pointsFor
       and CONSEQUENCE reads 5.0 — a workforce that expects to be
       punished for reporting, reported as the healthiest thing about
       them. */
    const v = score(everyone(CULTURE_MAX, 10));
    expect(meanOf(v, "WILL_REPORT")).toBeLessThan(CULTURE_MAX);
    // CONSEQUENCE is two-thirds reversed, so agreeing with everything
    // must not produce the top of the scale.
    expect(meanOf(v, "CONSEQUENCE")).toBeLessThan(3.5);
  });

  it("and a respondent who disagrees with everything is its mirror", () => {
    const high = score(everyone(CULTURE_MAX, 10));
    const low = score(everyone(CULTURE_MIN, 10));
    for (const d of dimensionsOf()) {
      expect(meanOf(high, d) + meanOf(low, d)).toBeCloseTo(CULTURE_MIN + CULTURE_MAX, 10);
    }
  });

  it("pointsFor leaves a normal item alone", () => {
    const plain = CULTURE_ITEMS.find((i) => !i.reversed)!;
    expect(pointsFor(plain, 2)).toBe(2);
    const flipped = CULTURE_ITEMS.find((i) => i.reversed)!;
    expect(pointsFor(flipped, 2)).toBe(4);
  });
});

describe("malformed and missing answers", () => {
  it("ignores out-of-range and non-numeric answers rather than averaging them in", () => {
    const bad = Array.from({ length: 6 }, () => ({
      wr1: 99, wr2: -3, wr3: Number.NaN, cq1: 4,
    })) as unknown as CultureResponse[];
    const v = score(bad);
    if (v.kind !== "SCORED") throw new Error("expected SCORED");
    const will = v.dimensions.find((d) => d.dimension === "WILL_REPORT")!;
    expect(will.answered, "an out-of-range answer was counted").toBe(0);
    const cq = v.dimensions.find((d) => d.dimension === "CONSEQUENCE")!;
    expect(cq.answered).toBe(6);
  });

  it("an unanswered dimension reports zero answered rather than a mean of zero", () => {
    /* A mean of 0 would render as the worst possible result for a
       question nobody was asked. The screen reads `answered` first. */
    const v = score(Array.from({ length: 6 }, () => ({ cq1: 5 })));
    if (v.kind !== "SCORED") throw new Error("expected SCORED");
    const fb = v.dimensions.find((d) => d.dimension === "FEEDBACK")!;
    expect(fb.answered).toBe(0);
    expect(Number.isFinite(fb.mean)).toBe(true);
  });
});

describe("bands and the lead finding", () => {
  it("bands split at 3 and 4, and the boundaries belong to the band above", () => {
    expect(bandFor(2.99)).toBe("WEAK");
    expect(bandFor(3)).toBe("MIXED");
    expect(bandFor(3.99)).toBe("MIXED");
    expect(bandFor(4)).toBe("STRONG");
  });

  it("WILL_REPORT leads when it is weak, EVEN THOUGH another dimension is worse", () => {
    /* An operator whose people will not file does not have a feedback
       problem; it has no reports to feed back on.

       THE FIXTURE HAS TO MAKE FEEDBACK STRICTLY WORSE, and the first
       version did not. It put WILL_REPORT and FEEDBACK both at 1.0,
       which the weakest-dimension fallback resolves to WILL_REPORT
       anyway because reduce() keeps the first on a tie and WILL_REPORT
       is first in DIMENSIONS. Deleting the rule this test exists for
       left it GREEN — it was asserting array order.

       So WILL_REPORT is WEAK at 2.0 and FEEDBACK is worse at 1.0.
       Only the rule can now return WILL_REPORT. */
    const responses = Array.from({ length: 6 }, () => ({
      wr1: 2, wr2: 2, wr3: 4,          // WILL_REPORT = 2.0, WEAK
      fb1: 1, fb2: 1, fb3: 5,          // FEEDBACK   = 1.0, strictly worse
      cq1: 5, cq2: 1, cq3: 1,
    }));
    const v = score(responses);
    const mean = (d: CultureDimension) =>
      v.kind === "SCORED" ? v.dimensions.find((x) => x.dimension === d)!.mean : NaN;
    expect(mean("FEEDBACK"), "the fixture must make FEEDBACK strictly worse")
      .toBeLessThan(mean("WILL_REPORT"));
    expect(leadFinding(v)).toBe("WILL_REPORT");
  });

  it("otherwise the weakest dimension leads", () => {
    const responses = Array.from({ length: 6 }, () => ({
      wr1: 5, wr2: 5, wr3: 1,          // WILL_REPORT strong
      fb1: 1, fb2: 1, fb3: 5,          // FEEDBACK weakest
      ac1: 4, ac2: 4, ac3: 2,
    }));
    expect(leadFinding(score(responses))).toBe("FEEDBACK");
  });

  it("says nothing at all when the result is suppressed", () => {
    expect(leadFinding(score(everyone(5, 2)))).toBeNull();
  });
});

describe("REFUSAL 3 — nothing leaves the device", () => {
  it("the module makes no network call and imports nothing that could", () => {
    /* The claim is the ABSENCE of a request, which is the only version
       of it that cannot be quietly broken later. */
    expect(SOURCE).not.toMatch(/\bfetch\s*\(/);
    expect(SOURCE).not.toMatch(/XMLHttpRequest|navigator\.sendBeacon|WebSocket/);
    expect(SOURCE).not.toMatch(/^\s*import\s/m);
  });
});
