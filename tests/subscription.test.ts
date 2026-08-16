/* =====================================================================
   THE STATE MACHINE, AND THE LINE IT MUST NOT CROSS.

   Most of this file is boundary arithmetic, and boundaries are the only
   interesting part of a date-driven state machine: every off-by-one
   here is somebody locked out of triage on a day they paid for, or
   carried free for a fortnight they did not.

   The last block is the one worth reading. It asserts that a lapsed
   subscription cannot stop a reporter filing and cannot withhold an
   operator's own record.

   IT DOES NOT TRY TO PROVE EXHAUSTIVENESS, and the comment there
   explains why: the first version did, by partitioning the capability
   list and asserting the halves rejoined to the whole, which a
   partition always does. Adding an unclassified capability under
   mutation left it green. That job belongs to the compiler now — the
   line is a Record keyed by the capability type, so a new capability
   fails TYPECHECK until somebody decides which side it is on. What a
   test can still say is which side each one ended up on.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  stateOn,
  allows,
  billableBand,
  daysUntilChange,
  ALL_CAPABILITIES,
  GRACE_DAYS,

  type SubscriptionDates,
} from "../packages/shared/src/subscription";

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
const DAY_MS = 86_400_000;

/** A trial that ends on the 20th, nobody has paid. */
const trialing: SubscriptionDates = {
  trialEndsOn: day("2026-08-20"),
  paidThrough: null,
};

/** Paid through the 31st. */
const paying: SubscriptionDates = {
  trialEndsOn: day("2026-08-20"),
  paidThrough: day("2026-08-31"),
};

describe("which state, on which day", () => {
  it("is TRIAL before the trial ends", () => {
    expect(stateOn(trialing, day("2026-08-14"))).toBe("TRIAL");
  });

  /* Inclusive. An operator whose trial "ends on the 20th" has the
     20th — the other reading takes a day off somebody without telling
     them, and it is the reading a naive `<` produces. */
  it("is still TRIAL on the last day of the trial", () => {
    expect(stateOn(trialing, day("2026-08-20"))).toBe("TRIAL");
  });

  it("is LAPSED the day after a trial nobody paid for", () => {
    expect(stateOn(trialing, day("2026-08-21"))).toBe("LAPSED");
  });

  it("is ACTIVE while paid", () => {
    expect(stateOn(paying, day("2026-08-25"))).toBe("ACTIVE");
  });

  it("is still ACTIVE on the last day paid for", () => {
    expect(stateOn(paying, day("2026-08-31"))).toBe("ACTIVE");
  });

  it("enters GRACE the day after the paid period", () => {
    expect(stateOn(paying, day("2026-09-01"))).toBe("GRACE");
  });

  it("is still in GRACE on the last grace day", () => {
    const last = new Date(paying.paidThrough!.getTime() + GRACE_DAYS * DAY_MS);
    expect(stateOn(paying, last)).toBe("GRACE");
  });

  it("is LAPSED once grace runs out", () => {
    const after = new Date(paying.paidThrough!.getTime() + (GRACE_DAYS + 1) * DAY_MS);
    expect(stateOn(paying, after)).toBe("LAPSED");
  });

  /* PAID BEATS TRIAL. An operator who pays during their trial is a
     customer immediately — otherwise taking their money leaves the
     product still calling them a prospect, and worse, the trial's end
     date later demotes somebody who is paying. */
  it("calls an operator who paid during the trial ACTIVE, not TRIAL", () => {
    const early: SubscriptionDates = {
      trialEndsOn: day("2026-08-20"),
      paidThrough: day("2026-09-30"),
    };
    expect(stateOn(early, day("2026-08-14"))).toBe("ACTIVE");
  });

  it("does not resurrect a trial after the paid period lapses", () => {
    const odd: SubscriptionDates = {
      trialEndsOn: day("2027-01-01"),
      paidThrough: day("2026-08-01"),
    };
    expect(stateOn(odd, day("2026-10-01"))).toBe("LAPSED");
  });
});

describe("what a lapse actually stops", () => {
  it("leaves every capability available in TRIAL, ACTIVE and GRACE", () => {
    for (const state of ["TRIAL", "ACTIVE", "GRACE"] as const) {
      for (const cap of ALL_CAPABILITIES) {
        expect(allows(state, cap), `${state} blocked ${cap}`).toBe(true);
      }
    }
  });

  /* A grace period that degrades the product has already done the
     damage it exists to prevent — a failed card and a decision to
     leave look identical on the day they happen. */
  it("makes GRACE behave exactly like ACTIVE", () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(allows("GRACE", cap)).toBe(allows("ACTIVE", cap));
    }
  });

  it("stops the safety office's working surfaces when LAPSED", () => {
    expect(allows("LAPSED", "TRIAGE")).toBe(false);
    expect(allows("LAPSED", "EDIT_REGISTER")).toBe(false);
    expect(allows("LAPSED", "RECORD_INDICATOR_PERIOD")).toBe(false);
    expect(allows("LAPSED", "GENERATE_DOCUMENT")).toBe(false);
  });
});

describe("the line a lapse must never cross", () => {
  /* THE DEADLINE IS OWED TO THE AUTHORITY, NOT TO US. An occurrence
     under L.N. 32 has a window that runs whatever our invoice is
     doing. Blocking a filing over an unpaid subscription puts this
     product between an operator and a legal obligation, and the
     operator is still the one in breach. */
  it("never stops a reporter filing, however lapsed", () => {
    expect(allows("LAPSED", "FILE_REPORT")).toBe(true);
  });

  /* THE RECORD IS THEIRS. Export is the anti-lock-in promise the
     product is sold on, and a record held hostage until an invoice
     clears is the exact behaviour operators are escaping. */
  it("never withholds an operator's own record", () => {
    expect(allows("LAPSED", "READ_OWN_RECORD")).toBe(true);
    expect(allows("LAPSED", "EXPORT_OWN_RECORD")).toBe(true);
  });

  /* THE EXHAUSTIVENESS IS THE COMPILER'S JOB, NOT THIS TEST'S, and
     that division of labour was learned the hard way here.

     The first version of this test partitioned ALL_CAPABILITIES into
     survives/stops and asserted the two halves rejoined to the whole —
     which is a tautology, a partition always does — plus pinned the
     survives list. Adding an unclassified capability under mutation
     left it GREEN: the new entry simply joined the stops side.

     SURVIVES_LAPSE is a Record<Capability, boolean> now, so a
     capability added to the list fails TYPECHECK until somebody writes
     true or false beside it. That is a build failure rather than a test
     failure, and it happens at the moment of the mistake.

     What is left for a test is the thing types cannot express: WHICH
     side each one is on. This pins that, exactly. */
  it("lets exactly three capabilities survive a lapse, and no others", () => {
    const survives = ALL_CAPABILITIES.filter((cap) => allows("LAPSED", cap));
    expect([...survives].sort()).toEqual(
      ["EXPORT_OWN_RECORD", "FILE_REPORT", "READ_OWN_RECORD"].sort()
    );
  });
});

describe("what an operator may be invoiced for", () => {
  it("derives the band from the fleet rather than storing one", () => {
    expect(billableBand(1)?.usdMonthly).toBe(79);
    expect(billableBand(5)?.usdMonthly).toBe(239);
    expect(billableBand(20)?.usdMonthly).toBe(549);
  });

  /* THE CLAIM THE PRICING PAGE MAKES ABOUT THE INCUMBENTS, asserted
     rather than left in prose. The page says the top band undercuts the
     cheapest incumbent's ten-seat price; Baldwin was quoted at about
     $640 a month for ten users in August 2026, and every band here is
     the whole operator with unlimited reporters. If a future raise
     crosses that line the sentence has to change with it, and this is
     what makes somebody notice. */
  it("keeps the top band under the cheapest incumbent's ten-seat price", () => {
    expect(billableBand(20)!.usdMonthly).toBeLessThan(640);
  });

  /* Complexity is priced where it actually lives. A second AOC is a
     second set of deadlines and a second audit chain, and it used to be
     handed over free in the fleet band's `adds` line — so the most
     complex customer in the segment paid what the simplest one at the
     same fleet size paid. */
  it("prices a second AOC on the only band that admits one", () => {
    expect(billableBand(20)!.perExtraAocUsdMonthly).toBeGreaterThan(0);
    expect(billableBand(5)!.perExtraAocUsdMonthly).toBeUndefined();
    expect(billableBand(1)!.perExtraAocUsdMonthly).toBeUndefined();
  });

  /* THE BILLING DEFECT THIS GUARDS. bandForFleet clamps, because the
     pricing page drags a slider and always deserves an answer. A fleet
     of 0 there is a shopper; a fleet of 0 on an Org row means nobody
     has told us the fleet — and billing the cheapest band off a missing
     value produces a real charge from an absent fact. */
  it("refuses to invoice a fleet size that was never supplied", () => {
    expect(billableBand(0)).toBeNull();
    expect(billableBand(-3)).toBeNull();
    expect(billableBand(Number.NaN)).toBeNull();
    expect(billableBand(2.5)).toBeNull();
  });
});

describe("telling somebody how long they have", () => {
  it("counts down the trial", () => {
    expect(daysUntilChange(trialing, day("2026-08-14"))).toBe(6);
  });

  it("counts down the paid period", () => {
    expect(daysUntilChange(paying, day("2026-08-25"))).toBe(6);
  });

  /* NOT CLAMPED. "0 days left" and "11 days overdue" are different
     sentences; clamping here pushes that distinction into every caller
     and one of them gets it wrong. */
  it("goes negative rather than clamping once the paid period passes", () => {
    const overdue = daysUntilChange(paying, day("2026-09-20"));
    expect(overdue).toBeLessThan(0);
  });
});
