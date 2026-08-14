/* =====================================================================
   WHETHER AN OPERATOR IS A CUSTOMER, AND WHAT CHANGES WHEN THEY ARE NOT.

   The pricing page has said "nothing on this page takes payment yet"
   since it shipped, and that sentence names a rail. Underneath the rail
   there was nothing at all: an Org had a name, a jurisdiction and an
   AOC number, and no idea whether it was in trial, paying or lapsed. A
   payment provider wired in tomorrow would have had nothing to bill
   against and nowhere to put the answer.

   THIS MODULE IS PROVIDER-AGNOSTIC ON PURPOSE. M-Pesa, a card
   processor and an invoice settled by bank transfer are three different
   integrations and one question: what date is this operator paid
   through. Every rail can answer that. Nothing here imports a vendor,
   and the state machine does not know which one paid.

   -------------------------------------------------------------
   NOTHING IS STORED THAT CAN BE COMPUTED. Charter rule 6, twice.

   THE BAND IS NOT STORED. pricing.ts already derives a band from a
   fleet size; an Org carries `fleetSize` and the band follows. Storing
   it would create the familiar failure — an operator buys a fourth
   aircraft, the stored band says otherwise, and the invoice and the
   product disagree about what they are on. The fleet is the fact; the
   band is arithmetic.

   THE STATE IS NOT STORED either. TRIAL, ACTIVE, GRACE and LAPSED are
   computed from two dates on every read, which is why an operator
   cannot be left ACTIVE by a webhook that failed to arrive, and why
   there is no nightly job whose failure silently keeps somebody paying
   or silently cuts them off.

   -------------------------------------------------------------
   THE REFUSAL THIS FILE EXISTS FOR.

   A LAPSED SUBSCRIPTION NEVER STOPS SOMEBODY FILING A SAFETY REPORT,
   AND NEVER WITHHOLDS AN OPERATOR'S OWN RECORD.

   That is not generosity and it is not a growth tactic. Three separate
   reasons, each sufficient on its own:

     · THE DEADLINE IS OWED TO THE AUTHORITY, NOT TO US. An occurrence
       under Kenyan L.N. 32 has a reporting window that runs whatever
       this product's invoice is doing. Software that blocked a filing
       over an unpaid subscription would be placing itself between an
       operator and a legal obligation, and the operator would still be
       the one in breach.
     · A HAZARD IS NOT A FEATURE. The person filing is a ramp agent who
       saw something. They did not buy anything, they cannot pay
       anything, and pricing decisions made three levels above them must
       not arrive as a locked door at the moment they try to report.
     · THE RECORD IS THEIRS. Export is the anti-lock-in promise the
       product sells on. A record held hostage until an invoice clears
       is exactly the behaviour operators are escaping, and it would be
       worse here than elsewhere because the record is what they show a
       regulator.

   SO WHAT IS ACTUALLY PAID FOR is the safety office's working surfaces
   — triage, the register, indicator periods, generating documents. The
   reporter and the record are never the leverage. That line is encoded
   below as data rather than prose, and asserted, because a line this
   easy to cross later needs to fail a build rather than a review.
   ===================================================================== */
import { bandForFleet, type Band } from "./pricing";

export type SubscriptionState = "TRIAL" | "ACTIVE" | "GRACE" | "LAPSED";

/**
 * The two dates an Org carries, and nothing else.
 *
 * `paidThrough` is null until a rail reports a payment. It is the only
 * field a payment provider ever writes, which is what keeps four
 * possible integrations from becoming four state machines.
 */
export interface SubscriptionDates {
  readonly trialEndsOn: Date;
  readonly paidThrough: Date | null;
}

/**
 * How long after `paidThrough` an operator keeps working surfaces.
 *
 * FOURTEEN DAYS, and the number is arguable where the shape is not. A
 * failed card and a decision to stop paying look identical on the day
 * they happen, and the cost of the two mistakes is wildly asymmetric:
 * cutting off a paying operator whose bank declined a renewal is worse
 * for them and for us than carrying a leaver for a fortnight.
 *
 * It is exported so a test asserts against this constant rather than
 * against a number retyped in the test — the mistake check:claims
 * exists to catch in prose, made in code.
 */
export const GRACE_DAYS = 14;

const DAY_MS = 86_400_000;

/**
 * Which state, on a given day.
 *
 * `asOf` is a parameter and never defaulted inside the computation,
 * for the reason regulations.ts gives: a function that reads the clock
 * itself cannot be tested against a boundary, and every interesting
 * case here IS a boundary.
 *
 * INCLUSIVE AT BOTH ENDS. An operator paid through the 31st is ACTIVE
 * on the 31st. Off-by-one here is somebody locked out of triage on a
 * day they paid for.
 */
export function stateOn(dates: SubscriptionDates, asOf: Date): SubscriptionState {
  const now = asOf.getTime();
  const paid = dates.paidThrough?.getTime() ?? null;

  /* PAID FIRST, TRIAL SECOND. An operator who pays during a trial is
     ACTIVE, not TRIAL — otherwise taking their money would leave the
     product still calling them a prospect, and the trial's end date
     would later demote a paying customer. */
  if (paid !== null) {
    if (now <= paid) return "ACTIVE";
    return now <= paid + GRACE_DAYS * DAY_MS ? "GRACE" : "LAPSED";
  }

  return now <= dates.trialEndsOn.getTime() ? "TRIAL" : "LAPSED";
}

/**
 * The capabilities this module knows how to gate.
 *
 * DELIBERATELY NOT AN OPEN SET. A string parameter would let any future
 * call site invent a capability and gate it, which is precisely how
 * "filing a report" would eventually end up behind a paywall — not by
 * decision, but by somebody adding a guard that looked like the ones
 * around it.
 */
export const ALL_CAPABILITIES = Object.freeze([
  /** A reporter filing. */
  "FILE_REPORT",
  /** An operator reading or exporting its own record. */
  "READ_OWN_RECORD",
  "EXPORT_OWN_RECORD",
  /** The safety office's working surfaces. This is the product. */
  "TRIAGE",
  "EDIT_REGISTER",
  "RECORD_INDICATOR_PERIOD",
  "GENERATE_DOCUMENT",
] as const);

/**
 * THE TYPE IS DERIVED FROM THE LIST, not declared beside it.
 *
 * Written the other way round first — a union type, and a separate
 * array said to mirror it. Two places, kept in step by intention, which
 * is the arrangement this repository keeps finding at the bottom of a
 * defect.
 */
export type Capability = (typeof ALL_CAPABILITIES)[number];

/**
 * THE LINE, and the compiler is what holds it.
 *
 * A `Record<Capability, boolean>` requires EVERY capability to appear.
 * Add one to the list above and this object stops type-checking until
 * somebody writes true or false beside it — so the decision about which
 * side of the line a new capability sits on cannot be skipped, deferred
 * or defaulted.
 *
 * THE FIRST VERSION WAS AN ALLOWLIST ARRAY, with a comment explaining
 * that an allowlist beats a blocklist because a forgotten capability
 * fails closed. True, and not enough: a capability added to the union
 * and forgotten here silently became unavailable on lapse, and the test
 * written to catch that PASSED under mutation, because a new entry just
 * joined the "stops" side and the assertion only pinned the other one.
 * Fail-closed is the right default and it is still a decision nobody
 * made. A type error is a decision somebody has to make.
 */
const SURVIVES_LAPSE: Readonly<Record<Capability, boolean>> = Object.freeze({
  FILE_REPORT: true,
  READ_OWN_RECORD: true,
  EXPORT_OWN_RECORD: true,
  TRIAGE: false,
  EDIT_REGISTER: false,
  RECORD_INDICATOR_PERIOD: false,
  GENERATE_DOCUMENT: false,
});

/**
 * Whether a capability is available in a given state.
 *
 * GRACE BEHAVES EXACTLY LIKE ACTIVE. That is the point of it — a grace
 * period that degrades the product is a grace period that has already
 * done the damage it exists to prevent.
 */
export function allows(state: SubscriptionState, capability: Capability): boolean {
  if (state !== "LAPSED") return true;
  return SURVIVES_LAPSE[capability];
}

/**
 * The band an operator may be INVOICED for — derived, never stored.
 *
 * WHY THIS IS NOT JUST `bandForFleet`. That function is written for the
 * pricing page, where somebody drags a slider and always deserves an
 * answer, so it clamps: a fleet of 0, -3 or NaN returns the cheapest
 * band. That is right for a shopper and wrong for an invoice. A fleet
 * size of zero means nobody has told us the fleet — an org row created
 * before this field existed, or a form that did not ask — and billing
 * the $49 band off a missing value produces a real charge from an
 * absent fact.
 *
 * So this returns null there, and a caller has to decide what to do
 * about not knowing rather than being handed a plausible number. The
 * first version of this function wrapped `bandForFleet` and declared a
 * null return it could never produce; that was dead code wearing a
 * safeguard's clothes, which this repository has now removed twice.
 */
export function billableBand(fleetSize: number): Band | null {
  if (!Number.isInteger(fleetSize) || fleetSize < 1) return null;
  return bandForFleet(fleetSize);
}

/**
 * Days remaining before the current state ends, for the screen that
 * tells somebody to renew.
 *
 * NEGATIVE IS NOT CLAMPED TO ZERO. "0 days left" and "11 days overdue"
 * are different sentences and the caller needs to be able to tell them
 * apart; clamping here would push that distinction into every caller,
 * and one of them would get it wrong.
 */
export function daysUntilChange(dates: SubscriptionDates, asOf: Date): number {
  const paid = dates.paidThrough?.getTime() ?? null;
  const edge =
    paid !== null ? paid + (asOf.getTime() > paid ? GRACE_DAYS * DAY_MS : 0) : dates.trialEndsOn.getTime();
  return Math.ceil((edge - asOf.getTime()) / DAY_MS);
}
