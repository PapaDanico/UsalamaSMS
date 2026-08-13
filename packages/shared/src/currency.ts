/* =====================================================================
   ELEMENT 4.1 — telling somebody BEFORE a currency lapses.

   WHAT THE COVERAGE TABLE SAID WAS MISSING, in its own words: "An
   expired row is visible to somebody who opens the screen; nothing
   tells an operator a currency is about to lapse." Two gaps in one
   sentence, and they are not the same size:

     (a) NO ANTICIPATION. The matrix knew "expired" and "not expired".
         A recurrent that lapses next Tuesday looked identical to one
         that lapses in a year, so the only way to act in time was to
         open the screen on the right day and do the arithmetic.
     (b) NO PUSH. Nothing reaches a person who does not open the
         screen at all.

   THIS MODULE CLOSES (a). It does not close (b), and the coverage
   entry says so rather than letting a warning label imply a mechanism
   that does not exist. Anticipation without push is a real
   improvement — a safety manager who opens the record once a week now
   sees what is coming instead of what has already gone — and it is
   not the whole element.

   NOTHING IS STORED. Charter rule 6. The state is computed from
   completedOn and expiresOn on every read, which is why a record does
   not need a migration to gain this and cannot carry a state that
   disagrees with its own dates.

   THE WINDOW IS PROPORTIONAL, AND THAT IS THE ONE DESIGN DECISION
   HERE WORTH ARGUING WITH.

   A fixed "warn 30 days out" is wrong in both directions at once. On a
   three-year type rating it is a month's notice on a renewal that
   needs a course booked a quarter ahead — useless. On a 30-day
   dangerous-goods currency it fires the day the record is created, so
   every row is permanently amber and the warning stops meaning
   anything. The failure mode of the second is worse: a signal that is
   always on is a signal people learn to ignore, and then the real one
   arrives and is ignored too.

   So the window is a FRACTION of each record's own validity period,
   which is the same reasoning — and deliberately the same fraction —
   that regulations.ts uses to decide when a reporting deadline
   becomes DUE_SOON. One idea, applied twice, rather than two numbers
   that can drift apart.

   Bounded at both ends, because proportion alone misbehaves at the
   extremes: a ten-year certificate would otherwise go amber two and a
   half years out, and a seven-day currency would give under two days'
   notice. The bounds are stated as constants and exported, so a test
   can assert against them rather than against a number retyped in
   the test.

   WHERE THE PROPORTION ACTUALLY EARNS ITS KEEP, stated plainly
   because the cap hides it: anything valid for roughly a year or more
   clamps to the 90-day maximum, so an annual recurrent and a
   three-year type rating both get a quarter's notice. The proportion
   therefore does its work BELOW a year — which is exactly where the
   damage was, because that is the range a fixed thirty-day rule leaves
   permanently amber. Above a quarter's notice nobody acts differently
   for having more.
   ===================================================================== */

/** What a training record's expiry is doing, relative to a given day. */
export type CurrencyState =
  /** Expired. The person is not current and the record says so. */
  | "LAPSED"
  /** Still valid, and close enough that acting now is the point. */
  | "DUE_SOON"
  /** Valid, with time in hand. */
  | "CURRENT"
  /** No expiry recorded. Not a problem, and not a currency either. */
  | "NO_EXPIRY";

export interface CurrencyVerdict {
  readonly state: CurrencyState;
  /**
   * Whole days until expiry; negative once lapsed, null with no expiry.
   * Whole days rather than a duration because a currency lapses at the
   * end of a calendar day, not at an instant.
   */
  readonly daysLeft: number | null;
  /** The window used, in days, so a screen can say why it is warning. */
  readonly windowDays: number | null;
}

/**
 * The share of a record's own validity that counts as "due soon".
 *
 * Deliberately the same 0.25 as DUE_SOON_FRACTION in regulations.ts.
 * If one moves, the other should be considered, and a reader comparing
 * the two should find the same number rather than wonder which is
 * authoritative.
 */
export const DUE_SOON_FRACTION = 0.25;

/** Never warn less than this, however short the validity period. */
export const MIN_WINDOW_DAYS = 7;

/** Never warn more than this, however long it. */
export const MAX_WINDOW_DAYS = 90;

const DAY_MS = 86_400_000;

/**
 * Whole days between two dates, by calendar day rather than by
 * elapsed milliseconds.
 *
 * A currency is valid until the END of the day it expires on, so a
 * record expiring today has zero days left and is not yet lapsed.
 * Comparing instants would make it lapse at midnight UTC — which in
 * Nairobi is three in the morning, and would report a licence as
 * expired for the three hours before the day it expires even begins.
 * The same boundary registerHealth() gets right, for the same reason.
 */
function wholeDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
}

export interface CurrencyInput {
  /** When the training was completed. */
  readonly completedOn: Date;
  /** When it expires, if it does. */
  readonly expiresOn?: Date | null;
}

/**
 * The due-soon window for a record, in whole days.
 *
 * Exported so a screen can explain itself — "within 30 days of expiry"
 * is a sentence an operator can check, and "soon" is not.
 */
export function windowFor(record: CurrencyInput): number | null {
  if (!record.expiresOn) return null;
  const validity = wholeDaysBetween(record.completedOn, record.expiresOn);
  /* A record whose expiry precedes its completion is bad data rather
     than a short validity. Treated as the minimum window: the row is
     lapsed anyway, and inventing a negative window would make the
     arithmetic below meaningless. */
  if (validity <= 0) return MIN_WINDOW_DAYS;
  const proportional = Math.round(validity * DUE_SOON_FRACTION);
  return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, proportional));
}

/** Where a single record stands, on a given day. */
export function currencyOf(record: CurrencyInput, today: Date): CurrencyVerdict {
  if (!record.expiresOn) return { state: "NO_EXPIRY", daysLeft: null, windowDays: null };

  const daysLeft = wholeDaysBetween(today, record.expiresOn);
  const windowDays = windowFor(record);

  if (daysLeft < 0) return { state: "LAPSED", daysLeft, windowDays };
  if (windowDays !== null && daysLeft <= windowDays) {
    return { state: "DUE_SOON", daysLeft, windowDays };
  }
  return { state: "CURRENT", daysLeft, windowDays };
}

export interface CurrencySummary {
  readonly lapsed: number;
  readonly dueSoon: number;
  readonly current: number;
  readonly noExpiry: number;
  readonly total: number;
  /**
   * What an operator is asked to act on: lapsed plus due-soon. One
   * number, because the question a safety manager asks the screen is
   * "is there anything I have to do about training", and two numbers
   * make that a subtraction.
   */
  readonly needsAttention: number;
  /** The soonest lapse still ahead, in days; null if there is none. */
  readonly soonestDays: number | null;
}

/** The whole matrix, counted. Computed on every read, never stored. */
export function currencySummary(
  records: ReadonlyArray<CurrencyInput>,
  today: Date,
): CurrencySummary {
  let lapsed = 0, dueSoon = 0, current = 0, noExpiry = 0;
  let soonestDays: number | null = null;

  for (const r of records) {
    const v = currencyOf(r, today);
    if (v.state === "LAPSED") lapsed++;
    else if (v.state === "DUE_SOON") dueSoon++;
    else if (v.state === "CURRENT") current++;
    else noExpiry++;

    /* The soonest lapse STILL AHEAD. A lapsed row is not "soonest" —
       it has already happened, it is counted, and mixing it in would
       report a negative number as the next thing to plan for. */
    if (v.daysLeft !== null && v.daysLeft >= 0) {
      soonestDays = soonestDays === null ? v.daysLeft : Math.min(soonestDays, v.daysLeft);
    }
  }

  return {
    lapsed,
    dueSoon,
    current,
    noExpiry,
    total: records.length,
    needsAttention: lapsed + dueSoon,
    soonestDays,
  };
}
