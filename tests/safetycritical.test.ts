// Safety-critical unit tests — risk matrix, reporting deadlines, RBAC.
import { describe, it, expect } from "vitest";
import {
  riskScore, tolerability, can, acceptanceAuthority,
  reportingDeadline, deadlineStatus, isStale, isProvisional, isProvisionalObligation,
  MOR_OBLIGATIONS, JURISDICTIONS, PERMISSIONS, NARRATIVE_PERMISSIONS,
  RiskAssessInputSchema, CreateReportSchema,
  type Severity, type Likelihood, type Role,
} from "../packages/shared/src/index";

const SEVS: Severity[] = ["A_CATASTROPHIC","B_HAZARDOUS","C_MAJOR","D_MINOR","E_NEGLIGIBLE"];
const LIKS: Likelihood[] = ["FREQUENT","OCCASIONAL","REMOTE","IMPROBABLE","EXTREMELY_IMPROBABLE"];

describe("the scale REFUSES what is not on it", () => {
  /* Found by writing an SRA test that expected a null and got a band.
     Both functions used to index the lookup tables directly, so an
     unrecognised severity produced `undefined`, a key of
     "undefinedx3", membership of neither the red set nor the amber
     one — and therefore **ACCEPTABLE**. A malformed severity graded
     green, on the one calculation whose whole job is to refuse to
     flatter.

     It survived because every caller wrapped these in try/catch and a
     test asserted the result was "not intolerable". That was true, and
     true for the wrong reason: nothing threw, so the catch guarded an
     exception that could not happen and the assertion passed on a
     silent green.

     These assert the REASON rather than the outcome, which is the
     difference between the two versions of this check. */
  it("throws on a severity that is not on the scale, rather than grading it", () => {
    expect(() => tolerability("NOT_A_SEVERITY" as never, "REMOTE")).toThrow(/Doc 9859 scale/);
    expect(() => riskScore("NOT_A_SEVERITY" as never, "REMOTE")).toThrow(/Doc 9859 scale/);
  });

  it("throws on a likelihood that is not on the scale", () => {
    expect(() => tolerability("C_MAJOR", "SOMETIMES" as never)).toThrow(/Doc 9859 scale/);
  });

  it("never returns ACCEPTABLE for an unrecognised value", () => {
    // The specific wrong answer, named. If somebody restores the direct
    // lookup this is what comes back, and it is the dangerous one.
    let result: unknown = "did not throw";
    try {
      result = tolerability("" as never, "" as never);
    } catch {
      result = "threw";
    }
    expect(result).not.toBe("ACCEPTABLE");
  });

  it("still grades every real cell", () => {
    // The refusal must not have narrowed the scale itself.
    expect(tolerability("A_CATASTROPHIC", "FREQUENT")).toBe("INTOLERABLE");
    expect(tolerability("E_NEGLIGIBLE", "EXTREMELY_IMPROBABLE")).toBe("ACCEPTABLE");
    expect(riskScore("C_MAJOR", "REMOTE")).toBe(9);
  });
});

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
    expect(due!.toISOString()).toBe("2026-08-12T10:00:00.000Z");
  });

  it("runs from AWARENESS, not from the occurrence", () => {
    // The engineer who finds a Friday defect on Monday reports from
    // Monday. Anchoring to occurredAt consumed the operator's entire
    // window whenever discovery lagged the event — exactly the case
    // where the deadline is hardest to meet.
    const awareAt = new Date("2026-08-14T08:00:00Z"); // three days later
    const { due } = reportingDeadline("KE", { occurredAt, awareAt });
    expect(due!.toISOString()).toBe("2026-08-15T08:00:00.000Z");
    // Under the old occurrence-anchored rule this deadline had already
    // passed two days before the operator knew anything had happened.
    expect(due!.getTime()).toBeGreaterThan(occurredAt.getTime() + 72 * 3600 * 1000);
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
      // Null is allowed and means the instrument sets no period. A
      // ZERO or a negative would be an arithmetic accident, and a
      // deadline in the past is the one direction that matters.
      if (o.hours !== null) expect(o.hours).toBeGreaterThan(0);
    }
  });

  it("carries NO provisional row — the three that were are gone", () => {
    // Uganda, Tanzania and Rwanda were carried at 72 hours as an
    // "ICAO-common" default. There is no such default: ICAO names no
    // period at all. Three rows of a compliance tool therefore stated a
    // deadline no instrument anywhere supports, and a provisional label
    // made that visible without making it true.
    for (const j of JURISDICTIONS) expect(isProvisional(j)).toBe(false);
  });

  it("still MARKS a provisional row, now that no real one trips it", () => {
    // The guard has no instances today, which is exactly when a guard
    // quietly stops working. Exercised against a synthetic row so this
    // can still fail — a test that only asserts `false` five times
    // would pass just as happily if isProvisional always returned it.
    const synthetic = {
      ...MOR_OBLIGATIONS.KE,
      note: "PROVISIONAL — a secondary source, pending a read of the instrument.",
    };
    expect(isProvisionalObligation(synthetic)).toBe(true);
    expect(isProvisionalObligation(MOR_OBLIGATIONS.KE)).toBe(false);
  });

  it("gives ICAO NO deadline, because ICAO publishes none", () => {
    // The whole reason this jurisdiction exists. Annex 13 requires
    // notification with a minimum of delay and names no hour figure;
    // Annex 19 leaves the period to the State. Returning a date here —
    // any date — would be the confident wrong deadline this module was
    // written to remove, reintroduced under a more respectable citation.
    expect(MOR_OBLIGATIONS.ICAO.hours).toBeNull();
    const { due } = reportingDeadline("ICAO", { occurredAt, awareAt: occurredAt });
    expect(due).toBeNull();
  });

  it("reports an undischarged ICAO obligation as WITHOUT_DELAY, never PENDING", () => {
    // PENDING says there is time left. Under a minimum-of-delay
    // obligation there is no window to be inside, so PENDING would tell
    // an operator it was comfortable when the instrument asks it to
    // file now.
    const { due, obligation } = reportingDeadline("ICAO", { occurredAt, awareAt: occurredAt });
    expect(deadlineStatus(due, new Date("2027-01-01T00:00:00Z"), { obligation })).toBe(
      "WITHOUT_DELAY",
    );
    // Filing discharges it: there was never a window to have missed.
    expect(
      deadlineStatus(due, new Date("2027-01-01T00:00:00Z"), {
        obligation,
        submittedAt: new Date("2026-12-01T00:00:00Z"),
      }),
    ).toBe("MET");
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
    // Six flat hours is a quarter of Kenya's 24 and a nudge inside a
    // 72-hour one. Proportional puts the warning at the same point in
    // the obligation wherever it was filed.
    //
    // The second window is SYNTHETIC. It used to be the EU row, and
    // that row was removed when the product scoped itself to the State
    // of Registry — leaving only one numeric obligation, against which
    // a scaling test cannot fail. A rule about proportion needs two
    // proportions, so the second is constructed here rather than
    // borrowed from whichever jurisdiction happens to be in the
    // registry this month.
    const ke = reportingDeadline("KE", { occurredAt, awareAt: occurredAt });
    const long = { ...MOR_OBLIGATIONS.KE, hours: 72 };
    const longDue = new Date(occurredAt.getTime() + 72 * 3_600_000);

    // Kenya: 24h window, due 12 Aug 10:00Z, so it warns from 04:00Z.
    expect(deadlineStatus(ke.due, new Date("2026-08-12T03:00:00Z"), { obligation: ke.obligation })).toBe("PENDING");
    expect(deadlineStatus(ke.due, new Date("2026-08-12T05:00:00Z"), { obligation: ke.obligation })).toBe("DUE_SOON");

    // 72h window: warns with 18 hours left, not 6.
    expect(deadlineStatus(longDue, new Date("2026-08-13T20:00:00Z"), { obligation: long })).toBe("DUE_SOON");
    expect(deadlineStatus(longDue, new Date("2026-08-13T14:00:00Z"), { obligation: long })).toBe("PENDING");
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
    // Charter rule 5. A 36-month circular is current inside 36 months
    // OF ITS ISSUE — the Kenyan AC is dated January 2023.
    const ke = MOR_OBLIGATIONS.KE;
    expect(isStale(ke, new Date("2024-06-01T00:00:00Z"))).toBe(false);
    expect(isStale(ke, new Date("2026-08-12T00:00:00Z"))).toBe(true);
  });

  it("DOES NOT LET RE-READING AN OLD DOCUMENT MAKE IT CURRENT", () => {
    /* The clock this used to run on was `verifiedOn`, which resets
       every time somebody looks at the row. A figure taken from a
       January 2023 advisory circular and re-verified yesterday reported
       as fresh until 2029 — it measured our diligence and called the
       answer currency.

       Found while checking the Kenyan row against KCARs 2025: the
       authority published twenty-nine revised regulations that year and
       this row cites a 2023 AC. Whether it survived them is precisely
       what isStale() exists to raise, and it could not.

       So: a row verified TODAY against an instrument older than the
       cycle is still stale. */
    const justRead = { ...MOR_OBLIGATIONS.KE, verifiedOn: "2026-08-12" };
    expect(
      isStale(justRead, new Date("2026-08-12T00:00:00Z")),
      "re-reading a three-year-old circular reset its staleness",
    ).toBe(true);

    // And the converse: a recently ISSUED instrument is current even if
    // nobody has looked at it for a while.
    const freshInstrument = {
      ...MOR_OBLIGATIONS.KE,
      instrumentIssued: "2026-06-01",
      verifiedOn: "2026-06-01",
    };
    expect(isStale(freshInstrument, new Date("2026-08-12T00:00:00Z"))).toBe(false);
  });

  it("KEEPS THE FIGURE ATTRIBUTED TO WHERE IT CAME FROM, AND NAMES THE LAW ABOVE IT", () => {
    /* The Kenyan 24 hours comes from Advisory Circular CAA-AC-SMS004A,
       January 2023. KCAA has since gazetted the Civil Aviation (Safety
       Management) Regulations as L.N. 32/2026 — law, where an AC is
       guidance — and nobody here has read it.

       The tempting move is to update `instrument` to the regulation.
       That would attribute 24 hours to a document nobody has opened,
       which is precisely the misattribution this module's own header
       complains about: three rows once carried the EU's 72 hours as an
       "ICAO-common" figure. Doing it ourselves would be worse.

       So the two facts stay separate, and both must survive. */
    const ke = MOR_OBLIGATIONS.KE;
    expect(ke.instrument, "the figure was reattributed to an unread instrument").toMatch(
      /CAA-AC-SMS004A/,
    );
    expect(ke.governedByUnread, "the governing regulation is not named").toMatch(/L\.N\. 32\/2026/);
    expect(ke.note, "the note does not warn that the figure predates the regulation").toMatch(
      /L\.N\. 32\/2026/,
    );
  });

  it("does not claim a governing instrument where none is known", () => {
    // The field is optional on purpose. Asserting one for ICAO would
    // invent a Kenyan-style gazette record for a SARP.
    expect(MOR_OBLIGATIONS.ICAO.governedByUnread).toBeUndefined();
  });

  it("gives every obligation an instrument date, or staleness is unmeasurable", () => {
    for (const [id, o] of Object.entries(MOR_OBLIGATIONS)) {
      expect(o.instrumentIssued, `${id} has no instrument date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(
        new Date(`${o.instrumentIssued}T00:00:00Z`).getTime(),
        `${id} has an unparseable instrument date`,
      ).not.toBeNaN();
    }
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
