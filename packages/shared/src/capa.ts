/* =====================================================================
   CORRECTIVE ACTIONS — the loop the product could describe and not
   track.

   WHAT WAS MISSING. The product could record that something was DONE:
   a note on a report's closure, a `correctiveAction` string on an audit
   finding, `controls` on a register entry. What it could not do was
   treat the action itself as a thing with an owner, a date and a
   verification — so "we will fit a guard to the fuel bowser by the end
   of the month" lived as prose inside whichever record happened to
   mention it, invisible to every other screen and to any question of
   the form "what is outstanding".

   That is the CAPA loop, and it is on every incumbent's feature list.
   It is also the second half of two elements this product already
   claims: 2.2's evidence is "mitigations tracked to closure", and
   3.3's is "findings closed AND VERIFIED".

   ONE TABLE FOR FOUR SOURCES, and that is the design decision worth
   defending. An action arising from a report, from an audit finding,
   from a register entry and from a change assessment is the same kind
   of object — somebody has undertaken to do something by a date — and
   splitting it four ways would give an operator four lists and no
   answer to "what is outstanding across the SMS". The source is
   recorded; exactly one of the four, enforced by a CHECK constraint in
   the migration rather than by hope.

   THE STATUS IS DERIVED, NEVER STORED. Charter rule 6, and here it is
   not a nicety: a stored "OPEN" is still OPEN the day after the due
   date passes, so the one state an operator needs to see — overdue —
   is the one a stored status cannot produce without a nightly job that
   this product does not have and should not need.

   VERIFICATION IS BY SOMEBODY ELSE. See `verificationRefusal`. This is
   the rule that makes the loop worth anything, and it is the same one
   the audit findings already carry: a safety manager verifying their
   own action closed is the action, not the evidence.
   ===================================================================== */

/** Where an action came from. Exactly one, always. */
export const ACTION_SOURCES = ["report", "finding", "risk", "change"] as const;
export type ActionSource = (typeof ACTION_SOURCES)[number];

export type ActionStatus =
  | "OPEN"
  | "OVERDUE"
  | "DUE_SOON"
  | "DONE"
  | "VERIFIED"
  | "CANCELLED";

/**
 * How close to its due date an action starts being called out.
 *
 * SEVEN DAYS, OURS, and flat rather than proportional — unlike the
 * training-currency window, which scales with each record's own
 * validity. The difference is real: a training certificate's validity
 * is a property of the certificate, so a proportion has something to be
 * proportional TO. An action's due date is a date somebody chose, and
 * "25% of the time between when we agreed this and when it is due" is
 * a window that shortens for the actions agreed most urgently, which is
 * exactly backwards.
 */
export const DUE_SOON_DAYS = 7;

export interface ActionRecord {
  readonly dueOn?: Date | string | null;
  readonly completedOn?: Date | string | null;
  readonly verifiedOn?: Date | string | null;
  readonly cancelledOn?: Date | string | null;
}

const at = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const DAY = 86_400_000;

/** Whole days from `from` to `to`, negative when `to` is in the past. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY);
}

/**
 * What state this action is in, today.
 *
 * ORDER MATTERS AND IS NOT ARBITRARY:
 *
 *   · CANCELLED first, because a cancelled action is not overdue. An
 *     operator that decided against a control and recorded why should
 *     not be shown a red row about it forever — that is how a list of
 *     outstanding work becomes a list nobody opens.
 *   · VERIFIED before DONE, because verified is done and checked.
 *   · DONE before OVERDUE, because an action completed after its due
 *     date is LATE, not OUTSTANDING, and the thing an operator needs
 *     from this list is what still needs doing. Lateness is visible in
 *     the dates and is not hidden — it just does not keep a finished
 *     action in the outstanding column.
 */
export function statusOf(a: ActionRecord, today: Date): ActionStatus {
  if (at(a.cancelledOn)) return "CANCELLED";
  if (at(a.verifiedOn)) return "VERIFIED";
  if (at(a.completedOn)) return "DONE";

  const due = at(a.dueOn);
  // No due date is OPEN, not overdue. An action with no date is a
  // different failure — see `undated` — and calling it overdue would
  // report a date that does not exist.
  if (!due) return "OPEN";

  const days = daysBetween(today, due);
  if (days < 0) return "OVERDUE";
  if (days <= DUE_SOON_DAYS) return "DUE_SOON";
  return "OPEN";
}

/** Whether this status still requires somebody to do something. */
export function isOutstanding(s: ActionStatus): boolean {
  return s === "OPEN" || s === "OVERDUE" || s === "DUE_SOON" || s === "DONE";
}

export interface ActionSummary {
  readonly total: number;
  readonly outstanding: number;
  readonly overdue: number;
  readonly dueSoon: number;
  readonly awaitingVerification: number;
  /**
   * Actions with an owner but no due date.
   *
   * REPORTED SEPARATELY rather than folded into "open", because an
   * action with no date is not late and never will be. It is the row an
   * auditor asks about — "by when?" — and a list that shows it as
   * merely open answers that question with silence.
   */
  readonly undated: number;
}

export function summarise(
  actions: ReadonlyArray<ActionRecord>,
  today: Date,
): ActionSummary {
  let outstanding = 0, overdue = 0, dueSoon = 0, awaiting = 0, undated = 0;
  for (const a of actions) {
    const s = statusOf(a, today);
    if (isOutstanding(s)) outstanding++;
    if (s === "OVERDUE") overdue++;
    if (s === "DUE_SOON") dueSoon++;
    if (s === "DONE") awaiting++;
    if (!at(a.dueOn) && isOutstanding(s)) undated++;
  }
  return {
    total: actions.length,
    outstanding, overdue, dueSoon,
    awaitingVerification: awaiting,
    undated,
  };
}

/**
 * Why this verification must be refused, or null if it may proceed.
 *
 * THE RULE THAT MAKES THE LOOP WORTH ANYTHING. An action verified by
 * the person who completed it has not been verified; it has been
 * asserted twice by the same person. The audit findings already carry
 * this rule — 3.3's coverage entry says "verification by key management
 * rather than by whoever raised and closed it" — and an action is the
 * same shape.
 *
 * RETURNS THE SENTENCE, not a boolean. The caller needs to tell
 * somebody why, and a boolean makes every refusal read the same.
 *
 * NOT ENFORCED AS A DATABASE CONSTRAINT, deliberately. A constraint
 * would compare two columns and produce a Postgres error; this produces
 * an explanation, and the difference matters on a screen where the
 * person being refused is a safety manager in a two-person operation
 * who needs to understand what to do instead.
 */
export function verificationRefusal(
  action: { readonly completedOn?: Date | string | null; readonly completedById?: string | null },
  verifierId: string,
): string | null {
  if (!at(action.completedOn)) {
    return (
      "This action has not been marked complete yet, so there is nothing to verify. " +
      "Verifying first would record a check of work that has not been reported as done."
    );
  }
  if (action.completedById && action.completedById === verifierId) {
    return (
      "You marked this action complete, so you cannot also verify it. An action " +
      "verified by the person who did it has not been verified — it has been asserted " +
      "twice by the same person. Ask somebody else in the organisation to confirm it."
    );
  }
  return null;
}
