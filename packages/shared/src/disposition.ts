/* =====================================================================
   WHAT HAPPENED TO THE REPORT.

   THE GAP THIS CLOSES, stated plainly because it was the largest one in
   the product. `ReportState` has five values. Four of them were
   unreachable: the schema defaults to SUBMITTED and no route anywhere
   wrote the column. `routes.sync.ts` mapped `safetyReport:UPDATE` to a
   `report.triage` permission and then fell through to `rejected`, and
   the /triage screen's `state` filter is `syncState` — queued or synced
   on the handset — which is a different column that happens to share
   the word. So every report ever filed was SUBMITTED, permanently.

   That is a filing cabinet, which is the phrase spi.ts already uses for
   a reporting system that produces no trend, one layer up. Element
   2.1's own evidence line asks for "a report rate per 1,000 hours or
   per departure THAT IS TRENDING", and a queue that only ever grows
   cannot trend. The disposition is upstream of the indicator, the
   indicator is upstream of the dashboard, and none of the three could
   be built first.

   THE TRANSITION IS THE RECORD, not a `closedAt` column. A column
   answers "when"; an inspector asks "by whom, from what, and what did
   you do about it". Storing the history also makes time-to-closure
   derivable — charter rule 6's shape — where a stored duration would
   go stale the moment a report was reopened.

   AND REOPENING IS LEGAL, deliberately. A report closed too early and
   then found to matter is an ordinary SMS event, and the two ways out
   of refusing it are both worse: people stop closing anything, or they
   edit the record. The failure mode worth designing against is a report
   closed and forgotten, not one reopened too eagerly — so reopening
   sits at `report.investigate` rather than at `report.close`. It adds
   scrutiny; it does not remove any.

   WHAT IS ICAO'S AND WHAT IS OURS. Annex 19 and Doc 9859 require that
   reports are analysed and that the resulting actions are tracked to
   closure; they do not publish this five-state machine. The states are
   the product's own, and the graph below is ours. Labelled here for the
   same reason the maturity descriptors are.
   ===================================================================== */

import type { Permission } from "./permissions";

export const REPORT_STATES = [
  "SUBMITTED",
  "TRIAGED",
  "UNDER_INVESTIGATION",
  "ACTIONS_OPEN",
  "CLOSED",
] as const;

export type ReportState = (typeof REPORT_STATES)[number];

export interface Transition {
  readonly from: ReportState;
  readonly to: ReportState;
  /** The permission this move requires. */
  readonly needs: Permission;
  /** What the operator is being asked to confirm, in their own words. */
  readonly label: string;
  /**
   * Whether a note is required to make this move.
   *
   * Required exactly where the move ENDS somebody's attention — a
   * closure with no statement of what was done is the thing that makes
   * a queue worthless to the next reader, and a reopening with no
   * reason is a decision reversed with no record of why.
   */
  readonly requiresNote: boolean;
  /** Why this move exists, for the screen and for the manual. */
  readonly because: string;
}

/**
 * The graph, stated once.
 *
 * SUBMITTED HAS EXACTLY ONE EXIT, and closing straight from it is not
 * among them. Triage is where the type, the location and the phase are
 * confirmed against the taxonomy; a report closed before that step is a
 * report that never entered the data the aggregation exists to make
 * possible. Even a duplicate is worth one triage touch — it costs a
 * click and it keeps the queue's own numbers honest.
 */
export const TRANSITIONS: ReadonlyArray<Transition> = Object.freeze([
  {
    from: "SUBMITTED",
    to: "TRIAGED",
    needs: "report.triage",
    label: "Triage this report",
    requiresNote: false,
    because:
      "Somebody in the safety office has read it and confirmed what it is. This is where " +
      "the type, location and phase are settled against the taxonomy, which is what makes " +
      "the report countable later.",
  },
  {
    from: "TRIAGED",
    to: "UNDER_INVESTIGATION",
    needs: "report.investigate",
    label: "Open an investigation",
    requiresNote: false,
    because: "The report raises a question the safety office cannot answer from the narrative alone.",
  },
  {
    from: "TRIAGED",
    to: "CLOSED",
    needs: "report.close",
    label: "Close without investigating",
    requiresNote: true,
    because:
      "Not every report needs an investigation — a duplicate, or a hazard already on the " +
      "register, is closed by saying so. The note is what says so.",
  },
  {
    from: "UNDER_INVESTIGATION",
    to: "ACTIONS_OPEN",
    needs: "report.investigate",
    label: "Investigation complete, actions outstanding",
    requiresNote: false,
    because:
      "The investigation has finished and produced something to do. Kept separate from " +
      "closure because an action agreed is not an action taken, and collapsing the two is " +
      "how a register comes to read as managed while nothing has changed.",
  },
  {
    from: "UNDER_INVESTIGATION",
    to: "CLOSED",
    needs: "report.close",
    label: "Close — investigation found no action needed",
    requiresNote: true,
    because: "A finding of no action is a finding. It is recorded, not left as an unanswered report.",
  },
  {
    from: "ACTIONS_OPEN",
    to: "CLOSED",
    needs: "report.close",
    label: "Close — actions complete",
    requiresNote: true,
    because: "The actions are done. The note is the evidence that they are.",
  },
  {
    from: "CLOSED",
    to: "ACTIONS_OPEN",
    needs: "report.investigate",
    label: "Reopen",
    requiresNote: true,
    because:
      "A report closed too early and then found to matter is an ordinary event. Refusing " +
      "to reopen it makes people either close nothing or edit the record, and both are " +
      "worse than a reopening with a reason attached.",
  },
]);

/** The moves available from a state, before permissions are considered. */
export function transitionsFrom(state: ReportState): ReadonlyArray<Transition> {
  return TRANSITIONS.filter((t) => t.from === state);
}

/** The single legal move between two states, or null if there is none. */
export function transitionBetween(
  from: ReportState,
  to: ReportState,
): Transition | null {
  return TRANSITIONS.find((t) => t.from === from && t.to === to) ?? null;
}

export type Refusal =
  | { readonly ok: true; readonly transition: Transition }
  | { readonly ok: false; readonly reason: "illegal" | "forbidden" | "note_required"; readonly message: string };

/**
 * Whether this move may be made, by this role, with this note.
 *
 * REFUSES RATHER THAN REPORTS, unlike holder.ts, and the difference is
 * that here the product owns the vocabulary on both sides. A state is
 * not a job title an operator might legitimately call something else;
 * it is one of five values this product defined. There is no free-text
 * escape to be generous about.
 *
 * The three refusals are kept apart because they need different
 * answers on screen: an illegal move is a bug in the caller, a
 * forbidden one is a person who needs to ask somebody else, and a
 * missing note is a form the same person can finish.
 */
export function mayTransition(
  from: ReportState,
  to: ReportState,
  can: (p: Permission) => boolean,
  note: string | null | undefined,
): Refusal {
  const t = transitionBetween(from, to);
  if (!t) {
    return {
      ok: false,
      reason: "illegal",
      message:
        `A report cannot move from ${from} to ${to}. ` +
        (transitionsFrom(from).length === 0
          ? `${from} is a terminal state.`
          : `From ${from} the available moves are: ` +
            transitionsFrom(from).map((x) => x.to).join(", ") + "."),
    };
  }
  if (!can(t.needs)) {
    return {
      ok: false,
      reason: "forbidden",
      message: `Moving a report to ${to} requires ${t.needs}.`,
    };
  }
  if (t.requiresNote && !(note ?? "").trim()) {
    return {
      ok: false,
      reason: "note_required",
      message:
        `"${t.label}" needs a note saying what was done. ` +
        "A closure with no statement of what was done is the thing that makes a queue " +
        "worthless to whoever reads it next.",
    };
  }
  return { ok: true, transition: t };
}

/**
 * Days from filing to the FIRST closure, or null if never closed.
 *
 * FIRST, not latest, and that is the whole reason this takes a history
 * rather than a column. A report closed on day 3, reopened on day 40
 * and closed again on day 45 took three days to close the first time;
 * reporting 45 would describe the reopening as slowness. Both facts are
 * in the record and this function answers the one the indicator asks.
 *
 * Computed, never stored — a stored duration is wrong the moment the
 * report it describes moves again.
 */
export function daysToFirstClosure(
  filedAt: Date,
  transitions: ReadonlyArray<{ readonly to: ReportState; readonly at: Date }>,
): number | null {
  const closures = transitions
    .filter((t) => t.to === "CLOSED")
    .map((t) => t.at.getTime())
    .sort((a, b) => a - b);
  if (closures.length === 0) return null;
  const ms = closures[0]! - filedAt.getTime();
  // Same-day closure is 0 days, not a fraction and never negative: a
  // clock skew between the handset and the server must not produce an
  // indicator that says a report was closed before it was filed.
  return Math.max(0, Math.round(ms / 86_400_000));
}
