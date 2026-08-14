/* =====================================================================
   WHAT AN OPERATOR NEEDS TOLD TODAY.

   Everything this product knows is currently visible only to somebody
   who opens the screen and looks. A currency lapsing next month, a
   reporting window closing in six hours, a report sitting untriaged for
   a week — all computed correctly, all announced to nobody. Element
   4.1's coverage entry says it in its own words: "there is no digest,
   no email and no push, so a currency still lapses quietly for an
   operator who does not look."

   THIS MODULE IS THE ANSWER TO "WHAT WOULD YOU SAY", AND NOTHING ELSE.
   It does not send. It has no provider, no API key, no network and no
   template. It takes what the product already computed and returns the
   items that are worth somebody's attention today, which means the
   whole of the interesting logic can be unit-tested without a mail
   server existing — and the eventual adapter is one function that takes
   this output.

   -------------------------------------------------------------
   THE REFUSAL THAT MATTERS MOST HERE, AND IT IS NOT ABOUT EMAIL.

   A DIGEST IS THE FIRST THING THIS PRODUCT HAS EVER SENT OUTSIDE ITS
   OWN ACCESS CONTROL.

   Every screen in the product is behind a session, a role and an
   orgId. A notification is not: it lands in an inbox, sits in a mail
   provider's storage, gets forwarded, gets read on a shared handset,
   and is searchable by whoever holds that mailbox afterwards. The
   entire confidentiality posture — a SYSTEM_ADMIN with no narrative
   permission, a de-identification pass before anything circulates, an
   anonymous report that stores no identifier to hide — is enforced at
   the API boundary and STOPS AT THIS ONE.

   So no item in a digest may carry a narrative, a reporter's name, or
   anything a report said. Items carry a COUNT, a KIND and a LINK. The
   sentence is "three reports are waiting triage", never what any of
   them says. Somebody who wants to know opens the product, where the
   access control still applies.

   That is asserted rather than described: the item type has no field
   for free text, so the mistake is unavailable rather than defended —
   the same discipline that gives `Band` no `perUser` and the signup
   schema no `orgId`.

   -------------------------------------------------------------
   AN EMPTY DIGEST IS NOT SENT, and that is a rule rather than an
   optimisation.

   A daily message that usually says "nothing to report" is a message
   people stop opening, and the day it matters it is skimmed with the
   rest. It is the same argument currency.ts makes about a fixed 30-day
   window turning every row permanently amber: a signal that is always
   on is one people learn to ignore, and then the real one arrives and
   is ignored too. `isWorthSending` exists so the caller cannot forget.
   ===================================================================== */
import type { CurrencyState } from "./currency";
import type { DeadlineStatus } from "./regulations";

/** What a digest line is about. Closed set — see the note on free text. */
export type DigestKind =
  /** A reporting obligation whose window is closing or has closed. */
  | "DEADLINE"
  /** A training currency lapsing soon or already lapsed. */
  | "CURRENCY"
  /** Reports that have arrived and nobody has looked at. */
  | "UNTRIAGED"
  /** A corrective action past its due date. */
  | "ACTION_OVERDUE";

/**
 * How much of somebody's attention this deserves.
 *
 * Three levels, not five. A digest that grades its own contents finely
 * is a digest whose reader has to learn the grading, and the only
 * decision a reader actually makes is "now, today, or when I next sit
 * down".
 */
export type DigestUrgency = "NOW" | "TODAY" | "SOON";

/**
 * One line of a digest.
 *
 * THERE IS NO `text`, `title`, `narrative` OR `detail` FIELD, and that
 * absence is the confidentiality boundary rather than an oversight. A
 * line is a count of a kind, with a link into the product where the
 * access control still applies. Adding a free-text field here would let
 * a report's contents reach an inbox, which no part of the API allows
 * and no part of this module should quietly permit.
 */
export interface DigestItem {
  readonly kind: DigestKind;
  readonly urgency: DigestUrgency;
  /** How many things of this kind. Never zero — see `digestFor`. */
  readonly count: number;
  /**
   * Whole days until the soonest of them matters; negative if the
   * soonest has already passed. Null where the kind has no clock, which
   * today is only UNTRIAGED.
   */
  readonly soonestDays: number | null;
  /** Where in the product to go. A path, never a deep link with data in it. */
  readonly href: string;
}

export interface Digest {
  readonly items: readonly DigestItem[];
  /** The highest urgency present, or null when there is nothing to say. */
  readonly urgency: DigestUrgency | null;
}

/** What the caller has already computed, per kind. */
export interface DigestInput {
  /** Deadline statuses of outstanding obligations, with days remaining. */
  readonly deadlines: readonly { status: DeadlineStatus; daysLeft: number }[];
  /** Currency verdicts across the training matrix. */
  readonly currencies: readonly { state: CurrencyState; daysLeft: number | null }[];
  /** How many reports have arrived and not been triaged. */
  readonly untriaged: number;
  /** Corrective actions past due, with days overdue as a negative. */
  readonly overdueActions: readonly { daysLeft: number }[];
}

const RANK: Readonly<Record<DigestUrgency, number>> = Object.freeze({
  NOW: 3,
  TODAY: 2,
  SOON: 1,
});

/**
 * WHICH DEADLINE STATES ARE WORTH SAYING ANYTHING ABOUT.
 *
 * A Record rather than an array, for the reason subscription.ts records
 * after getting this wrong: a status added to DeadlineStatus later must
 * fail TYPECHECK until somebody decides whether it belongs in a digest,
 * rather than defaulting to silence. Silence is the dangerous default
 * here — the whole point of the module is that things were going
 * unsaid.
 */
const DEADLINE_URGENCY: Readonly<Record<DeadlineStatus, DigestUrgency | null>> = Object.freeze({
  /* Already late. There is no softer word for this. */
  OVERDUE: "NOW",
  /* An obligation the instrument words as "without delay" — it has no
     computed window to be due soon within, so it is always NOW. */
  WITHOUT_DELAY: "NOW",
  DUE_SOON: "TODAY",
  /* Outstanding with time in hand. Deliberately silent: a digest that
     lists every open obligation every day is a list, not a warning. */
  PENDING: null,
  /* Done. */
  MET: null,
});

const CURRENCY_URGENCY: Readonly<Record<CurrencyState, DigestUrgency | null>> = Object.freeze({
  LAPSED: "TODAY",
  DUE_SOON: "SOON",
  CURRENT: null,
  NO_EXPIRY: null,
});

/**
 * A LAPSED CURRENCY IS "TODAY" AND AN OVERDUE DEADLINE IS "NOW", and
 * the gap between them is deliberate.
 *
 * Both are already late. Only one of them is a breach of a legal
 * obligation owed to an authority with a clock that has already run
 * out; the other is a person who needs a course booked. Grading them
 * the same way would either cry wolf about training or understate a
 * regulatory miss, and the second is the one that ends an AOC.
 */
function worst(levels: readonly DigestUrgency[]): DigestUrgency | null {
  let best: DigestUrgency | null = null;
  for (const level of levels) {
    if (best === null || RANK[level] > RANK[best]) best = level;
  }
  return best;
}

function highest(items: readonly DigestItem[]): DigestUrgency | null {
  return worst(items.map((i) => i.urgency));
}

/** The soonest (smallest) value, or null when there is nothing to measure. */
function soonest(days: readonly (number | null)[]): number | null {
  const known = days.filter((d): d is number => d !== null);
  return known.length ? Math.min(...known) : null;
}

/**
 * What this operator needs told, today.
 *
 * ITEMS ARE GROUPED BY KIND, NEVER LISTED INDIVIDUALLY. Eleven lapsing
 * currencies are one line saying eleven, not eleven lines — a digest
 * long enough to scroll is one nobody finishes, and the per-row detail
 * is what the screen is for.
 *
 * A KIND WITH NOTHING TO SAY PRODUCES NO ITEM AT ALL, rather than an
 * item with a count of zero. "0 deadlines overdue" is reassurance, and
 * reassurance in a channel meant for warnings is how the channel stops
 * being read.
 */
export function digestFor(input: DigestInput): Digest {
  const items: DigestItem[] = [];

  /* THE TABLES ABOVE ARE THE SOURCE OF URGENCY, not merely a filter,
     and the first version got that wrong in a way worth recording.

     It used DEADLINE_URGENCY and CURRENCY_URGENCY only to decide what
     to leave out, then assigned the urgency from a hardcoded ternary
     sitting next to them. Two statements of the same rule, and the
     table was the one that looked authoritative while the ternary was
     the one that ran. Changing LAPSED to "NOW" in the table under
     mutation left every test GREEN, because nothing read the value.

     Now the group's urgency is the worst of its members' mapped
     urgencies. One OVERDUE among four DUE_SOON is an overdue line — the
     reader acts on the worst thing in it — and that behaviour comes
     from the table rather than from a second opinion about it. */
  const deadlines = input.deadlines.filter((d) => DEADLINE_URGENCY[d.status] !== null);
  if (deadlines.length) {
    items.push({
      kind: "DEADLINE",
      urgency: worst(deadlines.map((d) => DEADLINE_URGENCY[d.status]!))!,
      count: deadlines.length,
      soonestDays: soonest(deadlines.map((d) => d.daysLeft)),
      href: "/triage",
    });
  }

  const currencies = input.currencies.filter((c) => CURRENCY_URGENCY[c.state] !== null);
  if (currencies.length) {
    items.push({
      kind: "CURRENCY",
      urgency: worst(currencies.map((c) => CURRENCY_URGENCY[c.state]!))!,
      count: currencies.length,
      soonestDays: soonest(currencies.map((c) => c.daysLeft)),
      href: "/sms",
    });
  }

  if (input.untriaged > 0) {
    items.push({
      kind: "UNTRIAGED",
      urgency: "SOON",
      count: input.untriaged,
      soonestDays: null,
      href: "/triage",
    });
  }

  if (input.overdueActions.length) {
    items.push({
      kind: "ACTION_OVERDUE",
      urgency: "TODAY",
      count: input.overdueActions.length,
      soonestDays: soonest(input.overdueActions.map((a) => a.daysLeft)),
      href: "/toolkits/register",
    });
  }

  return Object.freeze({ items: Object.freeze(items), urgency: highest(items) });
}

/**
 * Whether this digest should be sent at all.
 *
 * Exists so the decision lives here rather than in whichever caller
 * eventually holds an API key. A caller that forgets to ask sends
 * "nothing to report" every morning until people filter the address,
 * and the failure is invisible: everything looks like it is working
 * right up until the message that mattered is the one nobody opened.
 */
export function isWorthSending(digest: Digest): boolean {
  return digest.items.length > 0;
}
