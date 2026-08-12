// =====================================================================
// The implementation plan, derived from the operator's own answers.
//
// WHY THIS EXISTS. CASA requires an operator to create and submit an
// SMS implementation plan, and publishes templates for it. It is the
// artefact a regulator actually asks a new operator for — and this
// product already holds the input, because the maturity assessment has
// just been told where the operator stands on all twelve elements.
// Making them retype that into a template would be asking the same
// question twice.
//
// THE PHASING IS THE LADDER, NOT AN INVENTED PROGRAMME. It would be
// easy to publish four named phases that look like ICAO's and are not;
// this module refuses to, for the same reason maturity.ts refuses to
// present its five-point scale as ICAO's. What is here instead is
// derived from two things that ARE external:
//
//   · SM ICG's prerequisite rule, read from CASA Form 1591 — "an item
//     cannot be considered Operating or Effective if it is not Present
//     and it cannot be considered as Present if it is not documented".
//     So writing it down is phase one, for everything that has nothing
//     written down. Not because we say so;
//   · the weakest-element rule already in maturity.ts — an SMS is where
//     its worst element is, so the plan works upward from the bottom
//     rather than polishing what is already good.
//
// Each phase is therefore "everything currently on rung N", and the
// work is moving it to rung N+1. That is a phasing an operator can
// defend, because every step in it is one they described themselves.
//
// ONE RUNG AT A TIME, deliberately. A plan that says "get element 1.4
// from Absent to Improving" is a wish. The next rung is a piece of work
// somebody can finish, and the assessment gets re-answered after it.
// =====================================================================
import { SMS_ELEMENTS, MATURITY_LEVELS, type SmsElement, type MaturityLevel } from "./maturity";
import type { Suitability, OperatorScale } from "./maturity";

/**
 * Who is doing a step, and by when.
 *
 * NOT derived — this is the one part of the plan the operator supplies
 * rather than the assessment producing. CASA's gap-analysis and
 * implementation-planning tool records, against every element found
 * partially or not present, "the responsible individuals for actioning
 * these by a set due date". A plan without those two fields is the
 * thing this module's own header calls a wish.
 *
 * Both are optional and stay optional. A half-filled plan is a real
 * position an operator can be in, and the plan reports it as such
 * rather than refusing to render.
 */
export interface Assignment {
  /** A name, as typed. Not a user id — the person may not have a login. */
  readonly owner?: string;
  /** ISO `YYYY-MM-DD`. A date, not a duration: durations never expire. */
  readonly due?: string;
  /**
   * What it will take — CASA's "Resources required" column.
   *
   * Not scored, not validated, and deliberately free text. The answer
   * is usually "four hours of the chief pilot" or "nothing we do not
   * already have", and the value of asking is that an operator who
   * cannot answer it has not planned the step, only named it.
   */
  readonly resources?: string;
}

export interface PlanStep {
  readonly element: SmsElement;
  /** Where the operator says this element is now. */
  readonly from: MaturityLevel;
  /** The next rung — never the top of the scale. */
  readonly to: MaturityLevel;
  /** What moving that one rung means, in this element's terms. */
  readonly action: string;
  /** What finishing it looks like, so "done" is not a matter of opinion. */
  readonly evidence: string;
  /** Whoever owns it, if anybody has been named. */
  readonly owner?: string;
  /** The date it is owed by, if one has been set. */
  readonly due?: string;
  /** What it will take, if the operator has said. */
  readonly resources?: string;
}

export interface PlanPhase {
  readonly order: number;
  readonly title: string;
  readonly purpose: string;
  readonly steps: ReadonlyArray<PlanStep>;
}

export interface ImplementationPlan {
  readonly phases: ReadonlyArray<PlanPhase>;
  /** Elements judged unsuitable — right-sizing, not advancement. */
  readonly rightSize: ReadonlyArray<SmsElement>;
  /** Elements already at the top of the scale. Named, not hidden. */
  readonly settled: ReadonlyArray<SmsElement>;
  /** True when every element has been answered. */
  readonly complete: boolean;
  /**
   * Steps carrying no owner, no date, or neither.
   *
   * Reported rather than left for the reader to notice. A plan is
   * submitted to a regulator; the questions asked of it are who and by
   * when, and an operator should meet those questions here rather than
   * across a table.
   */
  readonly unassigned: ReadonlyArray<PlanStep>;
  /**
   * Elements the operator says are documented, that name no document.
   *
   * CASA's gap analysis carries a "Document reference" column against
   * every indicator, and its instructions are explicit: if an element
   * is already present, "you should identify where this is already
   * documented within your current organisational documents."
   *
   * This is the finding that follows from a rule already stated twice
   * in this codebase and never enforced. SM ICG: nothing counts as
   * Present until it is documented. So an element placed at rung 1 or
   * above IS a claim that a document exists — and an operator who
   * cannot name it is not at rung 1, whatever the radio button says.
   * Naming it is also the cheapest audit preparation available: the
   * question an assessor asks next is "show me", and the answer is
   * either on this page already or it is being invented across a
   * table.
   *
   * A finding, deliberately, and not a correction. This tool does not
   * overrule an operator about its own operation; it says what an
   * assessor will ask and leaves the answering to them.
   */
  readonly undocumented: ReadonlyArray<SmsElement>;
  readonly scale?: OperatorScale;
}

/** The rung at and above which a document is being claimed to exist. */
export const DOCUMENTED_AT = 1;

/**
 * What moving from one rung to the next actually asks of an operator.
 *
 * Written once per TRANSITION rather than once per element-and-rung:
 * forty-eight bespoke sentences would drift from the scale they
 * describe, and the scale already says what each level means. The
 * element supplies the subject; the transition supplies the verb.
 */
const TRANSITIONS: ReadonlyArray<{ action: string; evidence: string }> = Object.freeze([
  {
    // 0 -> 1. The prerequisite rule, in the operator's words.
    action:
      "Write it down. Nothing counts as being in place before it is documented — that is " +
      "the rule an evaluator applies before any other, so this is where every element starts.",
    evidence: "A document somebody can be pointed to, naming who does what.",
  },
  {
    // 1 -> 2
    action:
      "Make it routine. It exists on paper; the work is getting it done the same way by " +
      "the people who do it, whether or not anyone is watching.",
    evidence: "Two people describing it the same way when asked separately.",
  },
  {
    // 2 -> 3
    action:
      "Make it produce evidence. It happens reliably; the work is leaving a trace — dates, " +
      "counts, records — that somebody reviews on a cadence.",
    evidence: "A record with dates, and a named person who reads it.",
  },
  {
    // 3 -> 4
    action:
      "Let the evidence change decisions. It is measured; the work is showing a decision " +
      "that went differently because of what the measurement said.",
    evidence: "A decision in the last year that the record can be shown to have changed.",
  },
]);

const PHASE_TITLES: ReadonlyArray<{ title: string; purpose: string }> = Object.freeze([
  {
    title: "Write down what is missing",
    purpose:
      "Elements with nothing in place. An evaluator cannot consider anything present " +
      "before it is documented, so nothing else in this plan can start ahead of these.",
  },
  {
    title: "Turn documents into practice",
    purpose: "Elements that exist on paper and are not yet how the work is actually done.",
  },
  {
    title: "Make practice leave evidence",
    purpose:
      "Elements people do consistently but that produce nothing an auditor — or you — " +
      "could review later.",
  },
  {
    title: "Let evidence change decisions",
    purpose:
      "Elements that are measured. The remaining step is the one that separates a " +
      "functioning SMS from a well-documented one.",
  },
]);

/**
 * Build the plan.
 *
 * Elements at the top of the scale produce no step and are reported as
 * settled rather than dropped — an operator reading a plan wants to see
 * that the thing they finished was noticed.
 *
 * Unanswered elements produce no step either. The plan describes work
 * on a position; there is no position until the question is answered,
 * and inventing one would put a task in front of somebody for an
 * element they never assessed.
 */
export function implementationPlan(
  answers: Readonly<Record<string, number | undefined>>,
  options: {
    readonly suitability?: Readonly<Record<string, Suitability>>;
    readonly scale?: OperatorScale;
    readonly assignments?: Readonly<Record<string, Assignment | undefined>>;
    /** Where each element is already written down, in the operator's words. */
    readonly references?: Readonly<Record<string, string | undefined>>;
  } = {},
): ImplementationPlan {
  const suitability = options.suitability ?? {};
  const assignments = options.assignments ?? {};
  const references = options.references ?? {};
  const settled: SmsElement[] = [];
  const buckets: PlanStep[][] = [[], [], [], []];

  for (const element of SMS_ELEMENTS) {
    const level = answers[element.id];
    if (typeof level !== "number") continue;
    if (level >= 4) {
      settled.push(element);
      continue;
    }
    const transition = TRANSITIONS[level];
    if (!transition) continue;
    /* An empty string is not an owner. It is what a text box holds
       after somebody clears it, and carrying it through would let a
       plan report itself assigned to nobody at all. */
    const assigned = assignments[element.id];
    const owner = assigned?.owner?.trim();
    const due = assigned?.due?.trim();
    const resources = assigned?.resources?.trim();
    buckets[level]!.push({
      element,
      from: MATURITY_LEVELS[level]!,
      to: MATURITY_LEVELS[level + 1]!,
      action: transition.action,
      ...(owner ? { owner } : {}),
      ...(due ? { due } : {}),
      ...(resources ? { resources } : {}),
      /* The element's OWN evidence descriptor wins where it has one —
         it is specific to this element and the generic line is not. The
         generic line covers the rungs below the top, where the element
         descriptor (which describes level 4) would overstate the step. */
      evidence: level === 3 ? element.evidence : transition.evidence,
    });
  }

  const phases = buckets
    .map((steps, order) => ({
      order: order + 1,
      title: PHASE_TITLES[order]!.title,
      purpose: PHASE_TITLES[order]!.purpose,
      /* Within a phase, ICAO's own numbering. Not by "impact" — this
         product has no evidence for an impact ordering, and inventing
         one would be the kind of authority the charter is written
         against. The phases already carry the priority. */
      steps: steps.sort((a, b) => a.element.id.localeCompare(b.element.id)),
    }))
    .filter((phase) => phase.steps.length > 0);

  const rightSize = SMS_ELEMENTS.filter((e) => suitability[e.id] === "NOT_SUITABLE");

  return {
    phases,
    rightSize,
    settled,
    complete: SMS_ELEMENTS.every((e) => typeof answers[e.id] === "number"),
    /* Read back off the phases rather than off the assignments map, so
       an assignment against an element that produced no step — one at
       the top of the scale, or never answered — cannot make the count
       disagree with what is on the page. */
    unassigned: phases.flatMap((p) => p.steps).filter((s) => !s.owner || !s.due),
    /* Over ALL elements, not only the ones with steps: an element at
       the top of the scale is making the strongest documentation claim
       on the page, and is exactly the one nobody thinks to check. */
    undocumented: SMS_ELEMENTS.filter((e) => {
      const level = answers[e.id];
      return typeof level === "number" && level >= DOCUMENTED_AT && !references[e.id]?.trim();
    }),
    ...(options.scale ? { scale: options.scale } : {}),
  };
}
