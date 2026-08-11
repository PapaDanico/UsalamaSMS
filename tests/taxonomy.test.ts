import { describe, it, expect } from "vitest";
import { CreateReportSchema, isValidLocation, isValidAircraftType } from "../packages/shared/src/index";

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
