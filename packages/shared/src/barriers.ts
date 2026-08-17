/* ============================================================
   BARRIER HEALTH — THE PREDICTIVE LAYER, ASSEMBLED FROM WHAT IS
   ALREADY HELD.

   WHY THIS EXISTS. Doc 9859 splits hazard identification into reactive,
   proactive and predictive. This product had reactive (occurrence,
   triage, risk assessment) and part of proactive (hazard register,
   indicators, change assessment). Predictive, as the incumbents do it,
   means flight data — and an operator flying sub-27t aircraft has no
   recorders to read.

   But prediction does not require flight data. It requires knowing
   which BARRIERS are degraded, and this product already records every
   degradation as a separate object:

     a corrective action past its due date   a mitigation not in place
     a risk assessment past its reviewBy     a control nobody re-checked
     a training currency expired             a competence barrier decayed
     a change assessment never reviewed      a change nobody closed out
     an audit finding still open past due    a defect still admitted
     an indicator drifting across periods    the trend before the event

   None of that is new collection. It is the same record read as a
   question about barriers rather than a list of overdue work.

   ------------------------------------------------------------
   WHY IT IS NOT "PER HRC", WHICH IS WHAT THE TASK ASKED FOR.

   `hrcTags` exists on exactly one model — SafetyReport. Tracing every
   precursor to a high-risk category:

     overdue action        reportId -> report.hrcTags   only when the
                           action was raised from a REPORT, and it has
                           four possible sources
     assessment overdue    hazard -> reportId -> report  only when the
                           hazard came from a report
     indicator drift       no hrc, no report link        unreachable
     unclosed change       no link at all                unreachable
     training lapse        userId, course                unreachable
     open audit finding    elementId                     unreachable

   Four of the six cannot be attributed at all. A view that grouped by
   HRC anyway would print "Bird strike: 2 degraded barriers" when the
   real number is unknowable — a confident figure computed from a
   fraction of the evidence, which is the exact failure the coverage
   page exists to prevent.

   So the health is OPERATOR-WIDE, attribution is carried where it
   genuinely exists, and `unattributed` is returned rather than hidden.
   A caller that wants a per-HRC breakdown gets one for the findings
   that can carry it and a named remainder for the ones that cannot.

   Making it complete would mean hrcTags on four more models, a
   migration, and tagging UI on four screens. That is a real change with
   a real cost, and it is not something to assume by writing a grouping
   that quietly drops what it cannot place.
   ============================================================ */

/** The kinds of barrier this can speak about, and what a degradation means. */
export const BARRIER_KINDS = Object.freeze({
  MITIGATION: "A mitigation that was agreed and is not in place",
  CONTROL_REVIEW: "A control nobody has re-checked since it was accepted",
  COMPETENCE: "A competence the operation relies on, expired",
  CHANGE: "A change assessed and never closed out",
  AUDIT: "A finding the operation admitted and has not closed",
  PERFORMANCE: "An indicator that has crossed its own alert level",
} as const);

export type BarrierKind = keyof typeof BARRIER_KINDS;

/**
 * How long something has been degraded before it is worth saying so.
 *
 * ZERO IS DELIBERATE for everything except performance. A corrective
 * action is either past its date or it is not; softening that with a
 * grace period would be this product deciding on an operator's behalf
 * that a missed commitment does not count yet. The operator sets the
 * date; we report against it.
 *
 * Performance is the exception because a single period is noise —
 * spi.ts already holds that reasoning and the three crossing criteria
 * that follow from it.
 */
export const OVERDUE_FROM_DAYS = 0;

const DAY_MS = 86_400_000;

export interface BarrierInput {
  /** Actions with a due date. `hrcs` is empty when the action was not raised from a report. */
  readonly actions?: readonly {
    readonly id: string;
    readonly action: string;
    readonly ownerPost?: string | null;
    readonly dueOn?: Date | string | null;
    readonly completedOn?: Date | string | null;
    readonly cancelledOn?: Date | string | null;
    readonly hrcs?: readonly string[];
  }[];
  /** Risk assessments carrying a review date. */
  readonly assessments?: readonly {
    readonly id: string;
    readonly hazardTitle: string;
    readonly reviewBy?: Date | string | null;
    readonly hrcs?: readonly string[];
  }[];
  /** Training records with an expiry. */
  readonly training?: readonly {
    readonly id: string;
    readonly who: string;
    readonly course: string;
    readonly expiresOn?: Date | string | null;
  }[];
  /** Change assessments with a review due date. */
  readonly changes?: readonly {
    readonly id: string;
    readonly title: string;
    readonly reviewDueOn?: Date | string | null;
    readonly reviewedOn?: Date | string | null;
  }[];
  /** Audit findings with a due date. */
  readonly findings?: readonly {
    readonly id: string;
    readonly auditRef: string;
    readonly finding: string;
    readonly dueBy?: Date | string | null;
    readonly closedOn?: Date | string | null;
  }[];
  /**
   * Indicators spi.ts has already judged to be over an alert level.
   * This module does not re-derive that, and it does not summarise it
   * either: `headline` is spi.ts's own sentence, carried through
   * verbatim, because WHICH criterion tripped is the whole meaning. One
   * period beyond 3 SD and three consecutive beyond 1 SD are different
   * findings — the first is a spike, the second is the drift that turns
   * into one — and a screen that renders both as "drifting" has thrown
   * away the distinction the three criteria exist to draw.
   */
  readonly crossing?: readonly {
    readonly id: string;
    readonly name: string;
    /** spi.ts's `verdict.headline`. */
    readonly headline: string;
    readonly owner?: string | null;
  }[];
}

export interface Degraded {
  readonly kind: BarrierKind;
  readonly id: string;
  /** One sentence naming the barrier, not the record. */
  readonly what: string;
  /** Whole days past the date the operator itself set. Null when there is no date to be past. */
  readonly daysLate: number | null;
  readonly ownerPost: string | null;
  /** Every HRC this can honestly be attributed to. Empty means unattributable, not "none apply". */
  readonly hrcs: readonly string[];
}

export interface BarrierHealth {
  readonly degraded: readonly Degraded[];
  /** Findings that carry at least one HRC, grouped. A caller may show this per category. */
  readonly byHrc: Readonly<Record<string, readonly Degraded[]>>;
  /** Findings with no path to an HRC. Named rather than dropped — see the header. */
  readonly unattributed: readonly Degraded[];
  /**
   * The share of findings that could be attributed at all, 0 to 1.
   *
   * Returned so a screen can state it. A per-HRC picture built from 30%
   * of the evidence is not wrong because the arithmetic is wrong; it is
   * wrong because nothing on the screen says it is 30%.
   */
  readonly attribution: number;
}

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const lateDays = (due: Date | null, now: Date): number | null =>
  due === null ? null : Math.floor((now.getTime() - due.getTime()) / DAY_MS);

/**
 * Assemble every degraded barrier the record can show, at `now`.
 *
 * Pure, and takes plain arrays rather than Prisma rows so the reasoning
 * is testable without a database and so the API decides what to load.
 */
export function barrierHealth(input: BarrierInput, now: Date = new Date()): BarrierHealth {
  const degraded: Degraded[] = [];

  for (const a of input.actions ?? []) {
    /* Cancelled is not degraded. Somebody decided it was not the right
       action, which is a decision the record holds; treating it as an
       open failure would punish the operator for closing it honestly. */
    if (a.completedOn || a.cancelledOn) continue;
    const due = asDate(a.dueOn);
    const late = lateDays(due, now);
    if (late === null || late < OVERDUE_FROM_DAYS) continue;
    degraded.push({
      kind: "MITIGATION",
      id: a.id,
      what: a.action,
      daysLate: late,
      ownerPost: a.ownerPost ?? null,
      hrcs: [...(a.hrcs ?? [])],
    });
  }

  for (const r of input.assessments ?? []) {
    const due = asDate(r.reviewBy);
    const late = lateDays(due, now);
    if (late === null || late < OVERDUE_FROM_DAYS) continue;
    degraded.push({
      kind: "CONTROL_REVIEW",
      id: r.id,
      what: `Controls for "${r.hazardTitle}" have not been re-checked`,
      daysLate: late,
      ownerPost: null,
      hrcs: [...(r.hrcs ?? [])],
    });
  }

  for (const t of input.training ?? []) {
    const due = asDate(t.expiresOn);
    const late = lateDays(due, now);
    if (late === null || late < OVERDUE_FROM_DAYS) continue;
    degraded.push({
      kind: "COMPETENCE",
      id: t.id,
      what: `${t.course} has expired for ${t.who}`,
      daysLate: late,
      ownerPost: null,
      hrcs: [],
    });
  }

  for (const c of input.changes ?? []) {
    if (c.reviewedOn) continue;
    const due = asDate(c.reviewDueOn);
    const late = lateDays(due, now);
    if (late === null || late < OVERDUE_FROM_DAYS) continue;
    degraded.push({
      kind: "CHANGE",
      id: c.id,
      what: `"${c.title}" was assessed and never reviewed after it took effect`,
      daysLate: late,
      ownerPost: null,
      hrcs: [],
    });
  }

  for (const f of input.findings ?? []) {
    if (f.closedOn) continue;
    const due = asDate(f.dueBy);
    const late = lateDays(due, now);
    if (late === null || late < OVERDUE_FROM_DAYS) continue;
    degraded.push({
      kind: "AUDIT",
      id: f.id,
      what: `${f.auditRef}: ${f.finding}`,
      daysLate: late,
      ownerPost: null,
      hrcs: [],
    });
  }

  for (const s of input.crossing ?? []) {
    /* No daysLate: an indicator is not past a date, it is moving. A
       number here would be inventing a deadline the operator never set. */
    degraded.push({
      kind: "PERFORMANCE",
      id: s.id,
      what: `${s.name} — ${s.headline}`,
      daysLate: null,
      ownerPost: s.owner ?? null,
      hrcs: [],
    });
  }

  /* Worst first, and "worst" is days late rather than kind. A ranking by
     kind would be this module asserting that a competence lapse outranks
     a missed mitigation, which is the operator's judgement and not
     ours. Drifting indicators have no date, so they sort last among
     equals rather than first by accident of null. */
  degraded.sort((x, y) => (y.daysLate ?? -1) - (x.daysLate ?? -1));

  const byHrc: Record<string, Degraded[]> = {};
  const unattributed: Degraded[] = [];
  for (const d of degraded) {
    if (d.hrcs.length === 0) {
      unattributed.push(d);
      continue;
    }
    for (const h of d.hrcs) (byHrc[h] ??= []).push(d);
  }

  const attributed = degraded.length - unattributed.length;
  return {
    degraded,
    byHrc,
    unattributed,
    attribution: degraded.length === 0 ? 1 : attributed / degraded.length,
  };
}
