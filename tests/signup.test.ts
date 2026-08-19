import { describe, it, expect } from "vitest";
import { SignupSchema } from "../packages/shared/src/signup";
import { LoginSchema } from "../packages/shared/src/index";
import { JURISDICTIONS } from "../packages/shared/src/regulations";

describe("SignupSchema validation and sanitization", () => {
  const validSignup = {
    orgName: "Safari Express Ltd",
    name: "Dan Moi",
    email: "danmoi08@gmail.com",
    password: "secure-long-password-123",
  };

  it("accepts valid operator signup with default jurisdiction KE", () => {
    const parsed = SignupSchema.safeParse(validSignup);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.jurisdiction).toBe("KE");
      expect(parsed.data.email).toBe("danmoi08@gmail.com");
    }
  });

  it("trims and lowercases email on signup", () => {
    const parsed = SignupSchema.safeParse({
      ...validSignup,
      email: "   DANMOI08@GMAIL.COM   ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("danmoi08@gmail.com");
    }
  });

  it("supports all East African / ICAO baseline jurisdictions", () => {
    for (const jurisdiction of JURISDICTIONS) {
      const parsed = SignupSchema.safeParse({
        ...validSignup,
        jurisdiction,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.jurisdiction).toBe(jurisdiction);
      }
    }
  });

  it("rejects passwords shorter than 12 characters", () => {
    const parsed = SignupSchema.safeParse({
      ...validSignup,
      password: "too-short",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts valid fleet, bases, fleetTypes, and operationTypes", () => {
    const parsed = SignupSchema.safeParse({
      ...validSignup,
      fleet: 8,
      aocNumber: "AOC-KE-042",
      fleetTypes: ["C208", "DH8D"],
      bases: ["HKJK", "HKNW"],
      operationTypes: ["CAT_NON_SCHEDULED"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.fleet).toBe(8);
      expect(parsed.data.aocNumber).toBe("AOC-KE-042");
      expect(parsed.data.fleetTypes).toEqual(["C208", "DH8D"]);
    }
  });
});

describe("LoginSchema validation and sanitization", () => {
  it("trims and lowercases email on login", () => {
    const parsed = LoginSchema.safeParse({
      email: "  Danmoi08@Gmail.com  ",
      password: "password123456",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("danmoi08@gmail.com");
    }
  });
});
