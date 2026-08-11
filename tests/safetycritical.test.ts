// Safety-critical unit tests — risk matrix, reporting deadlines, RBAC.
import { describe, it, expect } from "vitest";
import {
  riskScore, tolerability, can, acceptanceAuthority,
  reportingDeadline, deadlineStatus, isStale, isProvisional,
  MOR_OBLIGATIONS, JURISDICTIONS, PERMISSIONS, NARRATIVE_PERMISSIONS,
  RiskAssessInputSchema, CreateReportSchema,
  type Severity, type Likelihood, type Role,
} from "../packages/shared/src/index";

const SEVS: Severity[] = ["A_CATASTROPHIC","B_HAZARDOUS","C_MAJOR","D_MINOR","E_NEGLIGIBLE"];
const LIKS: Likelihood[] = ["FREQUENT","OCCASIONAL","REMOTE","IMPROBABLE","EXTREMELY_IMPROBABLE"];

describe("risk matrix (Doc 9859 4th Ed, 5x5)", () => {
  it("computes deterministic scores 1..25 for all 25 cells", () => {
    const scores = new Set<number>();
    for (const s of SEVS) for (const l of LIKS) {
      const v = riskScore(s, l);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(25);
      scores.add(v);
    }
    expect(scores.has(25)).toBe(true);
    expect(scores.has(1)).toBe(true);
  });

  it("classifies canonical red cells as INTOLERABLE", () => {
    expect(tolerability("A_CATASTROPHIC","FREQUENT")).toBe("INTOLERABLE");   // 5x5
    expect(tolerability("A_CATASTROPHIC","REMOTE")).toBe("INTOLERABLE");     // 5x3
    expect(tolerability("B_HAZARDOUS","OCCASIONAL")).toBe("INTOLERABLE");    // 4x4
    expect(tolerability("C_MAJOR","FREQUENT")).toBe("INTOLERABLE");          // 3x5
  });

  it("classifies canonical green cells as ACCEPTABLE", () => {
    expect(tolerability("E_NEGLIGIBLE","EXTREMELY_IMPROBABLE")).toBe("ACCEPTABLE"); // 1x1
    expect(tolerability("D_MINOR","REMOTE")).toBe("ACCEPTABLE");                    // 2x3
    expect(tolerability("C_MAJOR","IMPROBABLE")).toBe("ACCEPTABLE");                // 3x2
  });

  it("classifies amber (ALARP) cells as TOLERABLE", () => {
    expect(tolerability("A_CATASTROPHIC","IMPROBABLE")).toBe("TOLERABLE");   // 5x2
    expect(tolerability("C_MAJOR","REMOTE")).toBe("TOLERABLE");              // 3x3
    expect(tolerability("D_MINOR","FREQUENT")).toBe("TOLERABLE");            // 2x5
  });

  it("covers every cell with exactly one classification", () => {
    for (const s of SEVS) for (const l of LIKS) {
      expect(["INTOLERABLE","TOLERABLE","ACCEPTABLE"]).toContain(tolerability(s, l));
    }
  });

  it("cannot be replaced by a threshold on the score", () => {
    // 5x3 and 3x5 both score 15 and classify differently. This is the
    // property that makes the explicit cell set necessary rather than
    // fussy: any rule of the form `score >= n` gets one of them wrong.
    expect(riskScore("A_CATASTROPHIC","REMOTE")).toBe(15);
    expect(riskScore("C_MAJOR","FREQUENT")).toBe(15);
    expect(tolerability("A_CATASTROPHIC","REMOTE")).toBe("INTOLERABLE");
    expect(tolerability("C_MAJOR","FREQUENT")).toBe("INTOLERABLE");
    // ...and the pair that proves the same score can straddle the line:
    expect(riskScore("B_HAZARDOUS","REMOTE")).toBe(12);      // 4x3 amber
    expect(riskScore("C_MAJOR","OCCASIONAL")).toBe(12);      // 3x4 amber
    expect(riskScore("D_MINOR","FREQUENT")).toBe(10);        // 2x5 amber
    expect(riskScore("A_CATASTROPHIC","IMPROBABLE")).toBe(10); // 5x2 amber
  });

  it("routes acceptance to the right authority", () => {
    expect(acceptanceAuthority("INTOLERABLE")).toBe("risk.accept.intolerable");
    expect(acceptanceAuthority("TOLERABLE")).toBe("risk.accept.tolerable");
    expect(acceptanceAuthority("ACCEPTABLE")).toBeNull();
  });
});

describe("regulatory reporting deadlines", () => {
  const occurredAt = new Date("2026-08-11T10:00:00Z");

  it("KENYA IS 24 HOURS, NOT 72 — the constant this engine replaced", () => {
    // The previous implementation added 72 hours and cited "KCAA MOR AC".
    // 72 is the EU figure. KCAA CAA-AC-SMS004A requires the pertinent
    // information within 24 hours. An operator trusting the old constant
    // would have seen a comfortable green countdown for two full days
    // after going non-compliant.
    expect(MOR_OBLIGATIONS.KE.hours).toBe(24);
    const { due } = reportingDeadline("KE", { occurredAt, awareAt: occurredAt });
    expect(due.toISOString()).toBe("2026-08-12T10:00:00.000Z");
  });

  it("runs from AWARENESS, not from the occurrence", () => {
    // The engineer who finds a Friday defect on Monday reports from
    // Monday. Anchoring to occurredAt consumed the operator's entire
    // window whenever discovery lagged the event — exactly the case
    // where the deadline is hardest to meet.
    const awareAt = new Date("2026-08-14T08:00:00Z"); // three days later
    const { due } = reportingDeadline("KE", { occurredAt, awareAt });
    expect(due.toISOString()).toBe("2026-08-15T08:00:00.000Z");
    // Under the old occurrence-anchored rule this deadline had already
    // passed two days before the operator knew anything had happened.
    expect(due.getTime()).toBeGreaterThan(occurredAt.getTime() + 72 * 3600 * 1000);
  });

  it("refuses an awareness time that precedes the occurrence", () => {
    expect(() =>
      reportingDeadline("KE", { occurredAt, awareAt: new Date("2026-08-10T10:00:00Z") }),
    ).toThrow(/precedes/);
  });

  it("gives every jurisdiction an instrument and a verification date", () => {
    // Charter rule 4: a number without a date is a number nobody can
    // judge. A row that cannot cite its instrument is not a row.
    for (const j of JURISDICTIONS) {
      const o = MOR_OBLIGATIONS[j];
      expect(o.instrument.length).toBeGreaterThan(10);
      expect(o.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(o.hours).toBeGreaterThan(0);
    }
  });

  it("marks unverified jurisdictions as provisional rather than as fact", () => {
    expect(isProvisional("KE")).toBe(false);
    expect(isProvisional("EU")).toBe(false);
    // These are carried at the ICAO-common figure pending a read of the
    // primary instrument, and the product must say so rather than
    // present a guess in the same typeface as a citation.
    expect(isProvisional("UG")).toBe(true);
    expect(isProvisional("TZ")).toBe(true);
    expect(isProvisional("RW")).toBe(true);
  });

  it("NEVER reports MET for an obligation nobody has discharged", () => {
    // This test previously asserted MET here, and the implementation
    // obliged. An unsubmitted Kenyan MOR therefore read "met" for
    // eighteen of its twenty-four hours — the same class of confident
    // wrong compliance signal as the 72-hour constant this module
    // replaced, reintroduced by a missing enum member.
    const { due, obligation } = reportingDeadline("KE", { occurredAt, awareAt: occurredAt });
    const opts = { obligation };

    expect(deadlineStatus(due, new Date("2026-08-11T12:00:00Z"), opts)).toBe("PENDING");
    expect(deadlineStatus(due, new Date("2026-08-12T06:00:00Z"), opts)).toBe("DUE_SOON");
    expect(deadlineStatus(due, new Date("2026-08-12T11:00:00Z"), opts)).toBe("OVERDUE");

    // The invariant, stated directly: without a submission there is no
    // hour of the window at which this function may say MET.
    for (let h = 0; h <= 30; h++) {
      const now = new Date(occurredAt.getTime() + h * 3_600_000);
      expect(deadlineStatus(due, now, opts), `hour ${h} reported MET unsubmitted`).not.toBe("MET");
    }
  });

  it("scales DUE_SOON to the jurisdiction's own window", () => {
    // Six flat hours is a nudge inside the EU's 72 and a quarter of
    // Kenya's 24. Proportional puts the warning at the same point in the
    // obligation wherever it was filed.
    const ke = reportingDeadline("KE", { occurredAt, awareAt: occurredAt });
    const eu = reportingDeadline("EU", { occurredAt, awareAt: occurredAt });

    // Kenya: 24h window, due 12 Aug 10:00Z, so it warns from 04:00Z.
    expect(deadlineStatus(ke.due, new Date("2026-08-12T03:00:00Z"), { obligation: ke.obligation })).toBe("PENDING");
    expect(deadlineStatus(ke.due, new Date("2026-08-12T05:00:00Z"), { obligation: ke.obligation })).toBe("DUE_SOON");

    // EU: 72h window, warns with 18h left — not 6.
    expect(deadlineStatus(eu.due, new Date("2026-08-13T20:00:00Z"), { obligation: eu.obligation })).toBe("DUE_SOON");
    expect(deadlineStatus(eu.due, new Date("2026-08-13T14:00:00Z"), { obligation: eu.obligation })).toBe("PENDING");
  });

  it("treats a late submission as OVERDUE, not retroactively met", () => {
    const { due } = reportingDeadline("KE", { occurredAt, awareAt: occurredAt });
    // Submitted in time stays MET even when read long afterwards.
    expect(
      deadlineStatus(due, new Date("2027-01-01T00:00:00Z"), {
        submittedAt: new Date("2026-08-12T09:00:00Z"),
      }),
    ).toBe("MET");
    // Submitted an hour late does not become compliant by being filed.
    expect(
      deadlineStatus(due, new Date("2027-01-01T00:00:00Z"), {
        submittedAt: new Date("2026-08-12T11:00:00Z"),
      }),
    ).toBe("OVERDUE");
  });

  it("measures staleness against the publisher's own cycle", () => {
    // Charter rule 5. A 36-month circular at 13 months is current.
    const ke = MOR_OBLIGATIONS.KE;
    expect(isStale(ke, new Date("2027-09-11T00:00:00Z"))).toBe(false);
    expect(isStale(ke, new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("RBAC matrix", () => {
  it("frontline cannot triage or accept risk", () => {
    expect(can("FRONTLINE","report.triage")).toBe(false);
    expect(can("FRONTLINE","risk.accept.tolerable")).toBe(false);
    expect(can("FRONTLINE","report.create")).toBe(true);
  });

  it("only the Accountable Executive can accept INTOLERABLE risk", () => {
    expect(can("ACCOUNTABLE_EXECUTIVE","risk.accept.intolerable")).toBe(true);
    expect(can("SAFETY_MANAGER","risk.accept.intolerable")).toBe(false);
    expect(can("KEY_MANAGEMENT","risk.accept.intolerable")).toBe(false);
  });

  it("regulator inspector is read/oversight only", () => {
    expect(can("REGULATOR_INSPECTOR","regulator.oversight")).toBe(true);
    expect(can("REGULATOR_INSPECTOR","report.create")).toBe(false);
    expect(can("REGULATOR_INSPECTOR","risk.assess")).toBe(false);
  });

  it("SYSTEM_ADMIN cannot read safety narratives", () => {
    // Deliberate, and the reason is in index.ts: the person with the
    // broadest technical access is the person a reporter has most reason
    // to fear. Confidentiality that does not hold against the
    // administrator is not confidentiality.
    for (const p of NARRATIVE_PERMISSIONS) {
      expect(can("SYSTEM_ADMIN", p)).toBe(false);
    }
  });

  it("every role is present in the permission table", () => {
    // Charter rule 11 in miniature: a role added to the enum without a
    // permission set would return undefined from PERMISSIONS[role] and
    // throw inside can(). Better to fail here than at a request.
    const roles: Role[] = [
      "FRONTLINE","SAFETY_OFFICER","SAFETY_MANAGER","INVESTIGATOR",
      "KEY_MANAGEMENT","ACCOUNTABLE_EXECUTIVE","REGULATOR_INSPECTOR","SYSTEM_ADMIN",
    ];
    for (const r of roles) {
      expect(PERMISSIONS[r]).toBeInstanceOf(Set);
      expect(PERMISSIONS[r].size).toBeGreaterThan(0);
    }
    expect(Object.keys(PERMISSIONS).sort()).toEqual([...roles].sort());
  });
});

describe("input validation", () => {
  const base = {
    clientId: "8f2c1e5a-3d4b-4c9e-9a1b-2f3e4d5c6b7a",
    type: "HAZARD" as const,
    title: "Bird activity on 06",
    narrative: "Large flock observed on short final, three consecutive days.",
  };

  it("requires occurredAt on a MOR, because the deadline depends on it", () => {
    expect(CreateReportSchema.safeParse({ ...base, type: "MOR" }).success).toBe(false);
    expect(
      CreateReportSchema.safeParse({ ...base, type: "MOR", occurredAt: "2026-08-11T10:00:00Z" })
        .success,
    ).toBe(true);
  });

  it("rejects an awareness time before the occurrence at the schema boundary", () => {
    const r = CreateReportSchema.safeParse({
      ...base, type: "MOR",
      occurredAt: "2026-08-11T10:00:00Z",
      awareAt: "2026-08-10T10:00:00Z",
    });
    expect(r.success).toBe(false);
  });

  it("requires an ALARP justification for a TOLERABLE risk", () => {
    // The amber band means "as low as reasonably practicable" — the
    // justification IS the evidence. An unjustified TOLERABLE is an
    // unaccepted risk wearing an accepted badge.
    const tolerable = {
      hazardId: "8f2c1e5a-3d4b-4c9e-9a1b-2f3e4d5c6b7a",
      consequence: "Runway excursion on a contaminated surface.",
      severity: "C_MAJOR" as const,
      likelihood: "REMOTE" as const, // 3x3 -> TOLERABLE
    };
    expect(tolerability("C_MAJOR", "REMOTE")).toBe("TOLERABLE");
    expect(RiskAssessInputSchema.safeParse(tolerable).success).toBe(false);
    expect(
      RiskAssessInputSchema.safeParse({
        ...tolerable,
        alarpJustification: "Friction testing added to the daily inspection; NOTAM raised.",
      }).success,
    ).toBe(true);
  });

  it("does not demand ALARP text for an ACCEPTABLE risk", () => {
    expect(
      RiskAssessInputSchema.safeParse({
        hazardId: "8f2c1e5a-3d4b-4c9e-9a1b-2f3e4d5c6b7a",
        consequence: "Minor delay to turnaround.",
        severity: "E_NEGLIGIBLE" as const,
        likelihood: "EXTREMELY_IMPROBABLE" as const,
      }).success,
    ).toBe(true);
  });
});
