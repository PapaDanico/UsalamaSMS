import { describe, expect, it } from "vitest";
import { SETI_BY_ID, SETI_CRITERIA, SETI_LEVELS } from "../packages/shared/src/seti";

describe("CAA SET-I criterion registry", () => {
  it("contains each criterion in the supplied assessment tool exactly once", () => {
    expect(SETI_CRITERIA).toHaveLength(48);
    expect(new Set(SETI_CRITERIA.map((criterion) => criterion.id)).size).toBe(48);
  });

  it("includes the criteria that previously had no product evidence workflow", () => {
    for (const id of ["0.1.5", "1.3.3", "5.1.1", "5.1.2", "6.1.3", "6.1.4"]) {
      expect(SETI_BY_ID.get(id)).toBeDefined();
    }
  });

  it("uses the SET-I evidence progression rather than an invented maturity score", () => {
    expect(SETI_LEVELS).toEqual(["PRESENT", "SUITABLE", "OPERATING", "EFFECTIVE"]);
  });
});
