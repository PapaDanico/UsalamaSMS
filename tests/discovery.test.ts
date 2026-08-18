/* =====================================================================
   THE COMBINATION AN OPERATOR HAS TO BE ABLE TO SHOW.

   Annex 19 asks for a hazard identification process "based on a
   combination of reactive, proactive and predictive methods of safety
   data collection". Before this module, `Hazard.source` held two values
   — REPORT and REGISTER — and REGISTER meant "somebody typed it",
   which is equally true of a workshop finding, an audit finding and a
   note from a meeting. The combination could not be evidenced.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  METHODS, ROUTES, DISCOVERY_KEYS, methodOf, balance, evidencesCombination,
} from "../packages/shared/src/discovery";

describe("the three methods and this product's routes to them", () => {
  it("covers all three, or the module cannot express the requirement", () => {
    const methods = new Set(ROUTES.map((r) => r.method));
    expect([...methods].sort()).toEqual(["PREDICTIVE", "PROACTIVE", "REACTIVE"]);
  });

  it("EVERY ROUTE'S MAPPING IS ARGUED IN THE SOURCE, because that is this product's judgement", () => {
    /* ICAO names methods, not features. Mapping a feature to a method is
       an argument, and an argument nobody can read is an assertion.

       READ FROM THE FILE rather than from a `why` field on every route,
       because that field was ~700 bytes shipped to every browser that
       opens the register and no screen rendered it. The argument is for
       a developer or an auditor reading the source, so this asserts it
       is THERE — a route added without a line in the mapping table
       fails here, in the same commit. */
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../packages/shared/src/discovery.ts"),
      "utf8",
    );
    const table = src.slice(src.indexOf("THE MAPPING, AND THE ARGUMENT"), src.indexOf("*/"));
    expect(table.length, "the mapping table is not in the header at all").toBeGreaterThan(200);
    for (const r of ROUTES) {
      expect(table, `${r.key} claims a method with no line in the mapping table`)
        .toContain(r.key);
    }
  });

  it("every method carries what it means in an auditor's words", () => {
    for (const m of Object.values(METHODS)) {
      expect(m.means.length).toBeGreaterThan(30);
      expect(m.label.length).toBeGreaterThan(3);
    }
  });

  it("the accepted keys are DERIVED from the routes, not typed beside them", () => {
    expect([...DISCOVERY_KEYS].sort()).toEqual(ROUTES.map((r) => r.key).sort());
  });

  it("a report is reactive, by the instrument's own definition", () => {
    expect(methodOf("REPORT")).toBe("REACTIVE");
  });
});

describe("what the register can evidence", () => {
  it("AN UNRECORDED METHOD IS UNKNOWN, NEVER PROACTIVE", () => {
    /* The whole reason the backfill left rows null. Mapping "somebody
       typed it" to proactive would manufacture exactly the evidence the
       operator is being asked to produce. */
    expect(methodOf(null)).toBeNull();
    expect(methodOf("REGISTER")).toBeNull();
    expect(methodOf(undefined)).toBeNull();
    expect(methodOf("SOMETHING_ELSE")).toBeNull();
  });

  it("counts each method and keeps the unknowns separate", () => {
    const b = balance(["REPORT", "AUDIT", "WORKSHOP", "INDICATOR", null, "REGISTER"]);
    expect(b.counts).toEqual({ REACTIVE: 1, PROACTIVE: 2, PREDICTIVE: 1 });
    expect(b.unknown).toBe(2);
    expect(b.total).toBe(6);
  });

  it("NAMES THE MISSING METHODS rather than leaving them to be counted", () => {
    /* A set of bars where one is absent reads as a small number, not as
       an absence — the same objection /picture makes about withheld
       barrier records. */
    const b = balance(["REPORT", "REPORT", "REPORT"]);
    expect(b.missing).toEqual(["PROACTIVE", "PREDICTIVE"]);
    expect(evidencesCombination(b)).toBe(false);
  });

  it("and says so when all three are there", () => {
    const b = balance(["REPORT", "WORKSHOP", "BARRIER"]);
    expect(b.missing).toEqual([]);
    expect(evidencesCombination(b)).toBe(true);
  });

  it("AN EMPTY REGISTER EVIDENCES NOTHING, rather than vacuously satisfying it", () => {
    /* balance([]) has no method missing a count and every count zero.
       Reading that as "all three present" is the empty-set trap this
       repository keeps meeting. */
    const b = balance([]);
    expect(b.missing).toEqual(["REACTIVE", "PROACTIVE", "PREDICTIVE"]);
    expect(evidencesCombination(b)).toBe(false);
  });

  it("and a register of unknowns evidences nothing either", () => {
    const b = balance([null, null, "REGISTER"]);
    expect(b.unknown).toBe(3);
    expect(evidencesCombination(b)).toBe(false);
  });
});
