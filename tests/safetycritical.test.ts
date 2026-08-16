// Safety-critical unit tests — risk matrix, reporting deadlines, RBAC.
import { describe, it, expect } from "vitest";
import {
  riskScore, tolerability, can,
  reportingDeadline, deadlineStatus, isStale, isProvisional, isProvisionalObligation,
  MOR_OBLIGATIONS, JURISDICTIONS, PERMISSIONS, NARRATIVE_PERMISSIONS,
  RiskAssessInputSchema, CreateReportSchema,
  type Severity, type Likelihood, type Role,
} from "../packages/shared/src/index";
import { SMS_ELEMENTS } from "../packages/shared/src/maturity";
import { refuseSignature, bandsSignableBy } from "../packages/shared/src/signature";

const SEVS: Severity[] = ["A_CATASTROPHIC","B_HAZARDOUS","C_MAJOR","D_MINOR","E_NEGLIGIBLE"];
const LIKS: Likelihood[] = ["FREQUENT","OCCASIONAL","REMOTE","IMPROBABLE","EXTREMELY_IMPROBABLE"];

/* Read from the matrix rather than typed out. A list of roles somebody
   remembered is how a role added later escapes every assertion below —
   the same shape as the ten-table list that let eight tables arrive
   outside the RLS posture. */
const ROLE_NAMES = Object.keys(PERMISSIONS) as Role[];

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
    /* THIS TEST USED TO ASSERT THE OPPOSITE OF THE RULE, which is why
       it is worth keeping rather than deleting with the function it
       covered. It read:

         acceptanceAuthority("INTOLERABLE") === "risk.accept.intolerable"

       — a permission for accepting a risk the manual says is not
       acceptable at any level of benefit. It passed for years because
       it tested that a function returned a string, and the string it
       returned was the wrong idea.

       The authority now comes from holder.ts, is checked at both places
       a risk can be signed for, and refuses the red band to everybody. */
    expect(refuseSignature("INTOLERABLE", "ACCOUNTABLE_EXECUTIVE")?.error).toBe("not_ownable");
    expect(refuseSignature("TOLERABLE", "ACCOUNTABLE_EXECUTIVE")).toBeNull();
    expect(refuseSignature("TOLERABLE", "SAFETY_MANAGER")?.error).toBe("below_authority");
    expect(refuseSignature("ACCEPTABLE", "SAFETY_MANAGER")).toBeNull();
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
    /* Charter rule 5. Built on a CONSTRUCTED row rather than on
       whichever real one happens to be old — this test used the Kenyan
       AC as its stale example and went red the day that row was
       replaced with a regulation gazetted in 2026. A guard about a
       mechanism should not depend on the current contents of the data
       it guards, or maintaining the data quietly disarms it. */
    const base = MOR_OBLIGATIONS.KE;
    const cycle36 = { ...base, instrumentIssued: "2023-01-01", reviewCycleMonths: 36 };
    expect(isStale(cycle36, new Date("2024-06-01T00:00:00Z"))).toBe(false);
    expect(isStale(cycle36, new Date("2026-08-12T00:00:00Z"))).toBe(true);

    // The cycle is what makes the difference, not the elapsed time: the
    // same age against a 60-month cycle is current.
    const cycle60 = { ...cycle36, reviewCycleMonths: 60 };
    expect(isStale(cycle60, new Date("2026-08-12T00:00:00Z"))).toBe(false);
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
    const justRead = {
      ...MOR_OBLIGATIONS.KE,
      instrumentIssued: "2023-01-01",
      reviewCycleMonths: 36,
      verifiedOn: "2026-08-12",
    };
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

  it("NEVER ATTRIBUTES A FIGURE TO AN INSTRUMENT NOBODY HAS READ", () => {
    /* The principle, kept as a mechanism rather than as a fact about
       one row. It used to assert that Kenya cited an advisory circular
       while naming L.N. 32/2026 as the unread law above it. That row
       has since been replaced — the regulation was obtained and read,
       so it is now the citation and the flag is gone — and a test
       written against the state rather than the rule would simply have
       been deleted at that point, taking the guard with it.

       The rule outlives the row: wherever a governing instrument is
       named as UNREAD, the figure must still be attributed to whatever
       was actually read. Attributing it to the unread document is the
       misattribution this module's header complains about — three rows
       once carried the EU's 72 hours as an "ICAO-common" figure, and
       doing it to ourselves would be worse. */
    for (const code of JURISDICTIONS) {
      const o = MOR_OBLIGATIONS[code];
      if (!o.governedByUnread) continue;
      expect(
        o.instrument,
        `${code} attributes its figure to an instrument it also calls unread`,
      ).not.toContain(o.governedByUnread);
      expect(o.note, `${code} names an unread instrument without warning in the note`).toMatch(
        /L\.N\.|regulation|Regulations/i,
      );
    }
  });

  it("cites a real instrument for every jurisdiction, unread or not", () => {
    // The check above is vacuous once no row carries the flag, which is
    // the state today. This one cannot be: every row must cite
    // something specific enough to look up.
    for (const code of JURISDICTIONS) {
      const o = MOR_OBLIGATIONS[code];
      expect(o.instrument.length, `${code} has no instrument`).toBeGreaterThan(30);
      expect(o.instrument, `${code} cites no identifiable document`).toMatch(
        /Annex|Regulation|Circular|L\.N\./,
      );
    }
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

  it("nobody can accept an INTOLERABLE risk, the accountable executive included", () => {
    /* The old version of this asserted that the accountable executive
       COULD, on the strength of a permission no route ever read. Doc
       9859's red band is not a seniority question — it is not
       acceptable at any level of benefit — so the refusal is the same
       for every role in the matrix, and this asserts it over all of
       them rather than over the three somebody thought of. */
    for (const role of ROLE_NAMES) {
      expect(refuseSignature("INTOLERABLE", role)?.error, role).toBe("not_ownable");
    }
  });

  it("every role granted risk acceptance can exercise it on some band", () => {
    /* BOTH DIRECTIONS OF THE SAME DRIFT. A permission the authority
       rule refuses on every band is a grant that cannot be used — the
       matrix promising an operator something the product will always
       refuse, which is the "capability with no reachable surface"
       defect pointing the other way.

       It is a live risk here rather than a theoretical one: the amber
       band requires the accountable executive, and three roles hold
       `risk.accept.tolerable`. The other two keep the grant because
       they can still accept a green risk — if that ever stops being
       true, this fails rather than leaving a dead promise in the
       matrix. */
    for (const role of ROLE_NAMES) {
      if (!can(role, "risk.accept.tolerable")) continue;
      expect(
        bandsSignableBy(role),
        `${role} is granted risk.accept.tolerable and can sign for no band at all`,
      ).not.toHaveLength(0);
    }
  });

  it("every band a risk can be in has somebody who may sign for it", () => {
    // The other half: a band no role in the matrix can accept is a
    // register entry that can never leave OPEN.
    for (const band of ["ACCEPTABLE", "TOLERABLE"] as const) {
      const signatories = ROLE_NAMES.filter(
        (r) => can(r, "risk.accept.tolerable") && refuseSignature(band, r) === null,
      );
      expect(signatories, `no role can accept a ${band} risk`).not.toHaveLength(0);
    }
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

/* ============================================================
   KENYA HAS THREE DEADLINES, NOT ONE.

   The primary instrument was finally read: the Civil Aviation (Safety
   Management) Regulations, 2025, gazetted as L.N. 32 of 2026 on 3
   March 2026. Regulation 12(1), verbatim:

     "A service provider shall notify and make mandatory occurrence
      reports on accidents, serious incidents, incidents and other
      safety related occurrences to the Authority within 24 hours, in
      the case of accident, 48 hours in the case of serious incidents
      and 72 hours in the case of incidents and other safety related
      occurrences."

   The product showed 24 hours for all of them, sourced from an
   advisory circular — guidance, and superseded. That is the same
   defect as the original 72-hour bug wearing the opposite sign: a
   figure the instrument does not support, on a compliance surface.

   The direction of the old error matters and is asserted below. It
   was STRICT, not lax, so nobody was told they had longer than the law
   allows. The replacement must keep that property wherever the class
   is unknown.
   ============================================================ */
describe("Kenya's three reporting periods", () => {
  const at = (iso: string) => new Date(iso);
  const times = { occurredAt: at("2026-08-01T06:00:00Z"), awareAt: at("2026-08-01T06:00:00Z") };
  const hoursBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;

  it("gives an accident 24 hours", () => {
    const r = reportingDeadline("KE", times, "ACCIDENT");
    expect(r.hours).toBe(24);
    expect(hoursBetween(times.awareAt, r.due!)).toBe(24);
  });

  it("gives a serious incident 48 hours", () => {
    const r = reportingDeadline("KE", times, "SERIOUS_INCIDENT");
    expect(r.hours).toBe(48);
    expect(hoursBetween(times.awareAt, r.due!)).toBe(48);
  });

  it("gives an incident 72 hours", () => {
    const r = reportingDeadline("KE", times, "INCIDENT");
    expect(r.hours).toBe(72);
    expect(hoursBetween(times.awareAt, r.due!)).toBe(72);
  });

  it("FALLS BACK TO THE STRICTEST PERIOD WHEN THE CLASS IS UNKNOWN", () => {
    /* The safety property of this whole change. A reporter filing from
       a strip has not classified the occurrence under Annex 13, and the
       countdown must not hand them the 72-hour window for something
       that turns out to be an accident. Early is an inconvenience;
       late is a breach. */
    const r = reportingDeadline("KE", times);
    expect(r.hours).toBe(24);
    const perClass = Object.values(MOR_OBLIGATIONS.KE.hoursByClass!);
    expect(r.hours).toBe(Math.min(...perClass));
  });

  it("KEEPS THE ROW'S OWN FIGURE EQUAL TO THE STRICTEST CLASS", () => {
    // Guards the next person who edits the row. A default that drifts
    // above the strictest class is a silent extension of a deadline.
    const ke = MOR_OBLIGATIONS.KE;
    expect(ke.hours).toBe(Math.min(...Object.values(ke.hoursByClass!)));
  });

  it("cites the regulation rather than the advisory circular it replaced", () => {
    const ke = MOR_OBLIGATIONS.KE;
    expect(ke.instrument).toMatch(/L\.N\. 32 of 2026/);
    expect(ke.instrument).toMatch(/regulation 12\(1\)/);
    expect(ke.instrument).not.toMatch(/CAA-AC-SMS004A/);
  });

  it("NO LONGER CLAIMS AN UNREAD INSTRUMENT SITS ABOVE IT", () => {
    // It has been read. Leaving the flag set would tell every reader to
    // go and check something that is now the cited source.
    expect(MOR_OBLIGATIONS.KE.governedByUnread).toBeUndefined();
  });

  it("cites where the clock start is stated, now that somebody has read it", () => {
    /* THIS TEST USED TO ASSERT THE OPPOSITE, and the change is the
       point. Regulation 12(1) says "within 24 hours" and never says
       from what, so awareness was the product's own reading and every
       screen said so.

       CAA-AC-SMS004A paragraph 3.3.6.1, Note 1 states it: the period
       runs from when the incident took place "or from the time when the
       reporter determined that there was, or could have been, a
       potentially hazardous or unsafe condition". The Authority's
       words, not ours.

       So the row names the source instead of confessing an inference —
       and the deadline's citation is untouched, because the deadline
       still comes from the regulation and only the anchor comes from
       the circular. */
    expect(MOR_OBLIGATIONS.KE.clockStart).toBe("AWARENESS");
    expect(MOR_OBLIGATIONS.KE.clockStartInstrument).toMatch(/CAA-AC-SMS004A/);
    expect(MOR_OBLIGATIONS.KE.clockStartInstrument).toMatch(/3\.3\.6\.1/);
    /* The deadline is still L.N. 32's. If this ever starts naming the
       circular, a period has been attributed to the wrong instrument. */
    expect(MOR_OBLIGATIONS.KE.instrument).toMatch(/L\.N\. 32/);
    expect(MOR_OBLIGATIONS.KE.instrument).not.toMatch(/SMS004A/);
  });

  it("never claims a clock start is both unstated and cited", () => {
    /* The two fields answer the same question and contradict each
       other. A row carrying both would render "not stated by the
       instrument" directly beside the instrument that states it. */
    for (const [code, o] of Object.entries(MOR_OBLIGATIONS)) {
      expect(
        Boolean(o.clockStartUnstated && o.clockStartInstrument),
        `${code} says the clock start is unstated AND names where it is stated`,
      ).toBe(false);
    }
  });

  it("leaves ICAO with no fixed period and no per-class table", () => {
    const r = reportingDeadline("ICAO", times, "ACCIDENT");
    expect(r.due).toBeNull();
    expect(r.hours).toBeNull();
    expect(MOR_OBLIGATIONS.ICAO.hoursByClass).toBeUndefined();
  });
});

/* ============================================================
   THE TWELVE ELEMENTS ARE KENYAN LAW, NOT ONLY AN ICAO STANDARD.

   L.N. 32/2026's Second Schedule — "Framework for a Safety Management
   System", made under regulations 6(2)(d) and 9(2)(c) — says: "The
   framework comprises four components and twelve elements as the
   minimum requirements for SMS implementation", and then lists them.

   Every id and every NAME in this product matches that list verbatim,
   including "The management of change" with its definite article. That
   is worth holding still. /coverage reports "9 of 12" against these
   elements, and if a name here drifted into a paraphrase the page
   would be quietly measuring against our wording of the law rather
   than the law's.

   Transcribed from the instrument rather than imported from
   maturity.ts, on purpose: importing the thing under test and
   comparing it with itself is the check that cannot fail.
   ============================================================ */
describe("the Second Schedule to L.N. 32/2026", () => {
  const SECOND_SCHEDULE: ReadonlyArray<readonly [string, string]> = [
    ["1.1", "Management commitment"],
    ["1.2", "Safety accountability and responsibilities"],
    ["1.3", "Appointment of key safety personnel"],
    ["1.4", "Coordination of emergency response planning"],
    ["1.5", "SMS documentation"],
    ["2.1", "Hazard identification"],
    ["2.2", "Safety risk assessment and mitigation"],
    ["3.1", "Safety performance monitoring and measurement"],
    ["3.2", "The management of change"],
    ["3.3", "Continuous improvement of the SMS"],
    ["4.1", "Training and education"],
    ["4.2", "Safety communication"],
  ];

  it("prescribes twelve elements", () => {
    expect(SECOND_SCHEDULE).toHaveLength(12);
  });

  it("IS WHAT THIS PRODUCT MEASURES AGAINST, ID FOR ID AND WORD FOR WORD", () => {
    expect(SMS_ELEMENTS.map((e) => [e.id, e.name])).toEqual(
      SECOND_SCHEDULE.map(([id, name]) => [id, name]),
    );
  });

  it("keeps the four components the Schedule groups them under", () => {
    const components = new Set(SMS_ELEMENTS.map((e) => e.id.split(".")[0]));
    expect([...components].sort()).toEqual(["1", "2", "3", "4"]);
  });
});

/* ============================================================
   THE ANNEX 13 NOTIFICATION IS NOT THE OCCURRENCE REPORT.

   The most consequential thing this module could get wrong, and it was
   getting it wrong by omission. Regulation 12(1) gives an accident 24
   hours to reach KCAA. Annex 13 gives the accident INVESTIGATION
   authority no such window — the duty is immediate, it is owed to a
   different organisation, and a reporter who reads "24 hours" off the
   form after an accident could reasonably conclude they had a day.
   ============================================================ */
describe("who else has to be told, and when", () => {
  it("KENYA CARRIES AN INVESTIGATION AUTHORITY SEPARATE FROM THE REGULATOR", () => {
    const ke = MOR_OBLIGATIONS.KE;
    expect(ke.authority).toMatch(/Civil Aviation Authority/);
    expect(ke.accidentNotification).toBeDefined();
    expect(
      ke.accidentNotification!.authority,
      "the investigation authority must not be the same body as the regulator",
    ).not.toBe(ke.authority);
    expect(ke.accidentNotification!.authority).toMatch(/Accident Investigation/i);
  });

  it("applies to accidents and serious incidents, not to every occurrence", () => {
    /* An incident under regulation 12(1) is reported to KCAA within 72
       hours and is not an Annex 13 notification. Showing the urgent
       block on everything would make it furniture. */
    const applies = MOR_OBLIGATIONS.KE.accidentNotification!.appliesTo;
    expect(applies).toContain("ACCIDENT");
    expect(applies).toContain("SERIOUS_INCIDENT");
    expect(applies).not.toContain("INCIDENT");
  });

  it("CARRIES NO TELEPHONE NUMBER, and that is the check", () => {
    /* An accident notification line copied into a source file by
       somebody who never dialled it is the one number in this product
       where being wrong is not measured in inconvenience. The
       authority publishes its own; this carries the link and the
       operator's own directory carries the confirmed number.

       Asserted over the WHOLE row rather than one field, so a number
       cannot arrive in `note` or `basis` either. */
    const serialised = JSON.stringify(MOR_OBLIGATIONS.KE.accidentNotification);
    expect(
      serialised,
      "a telephone number reached the regulatory registry — it must live in the " +
        "operator's own verified contact directory, not in this file",
    ).not.toMatch(/\+?\d[\d\s().-]{7,}/);
  });

  it("points at the authority's own published contacts over https", () => {
    const url = MOR_OBLIGATIONS.KE.accidentNotification!.url;
    expect(url).toMatch(/^https:\/\//);
    expect(url).toContain("aaid");
  });

  it("SAYS WHETHER THE DOMESTIC INSTRUMENT WAS READ, rather than implying it", () => {
    /* Annex 13 and the authority's own published role are certain; the
       Kenyan regulation number imposing the duty is not, and this
       product does not invent citations. Same discipline as
       clockStartUnstated. */
    const n = MOR_OBLIGATIONS.KE.accidentNotification!;
    expect(typeof n.domesticInstrumentRead).toBe("boolean");
    if (!n.domesticInstrumentRead) {
      expect(n.basis, "an unread domestic instrument must still name what the duty rests on")
        .toMatch(/Annex 13/);
    }
  });

  it("says the duty is immediate rather than restating the report window", () => {
    expect(MOR_OBLIGATIONS.KE.accidentNotification!.note).toMatch(/immediate/i);
  });
});
