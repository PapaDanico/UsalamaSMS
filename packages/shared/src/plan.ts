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
  readonly scale?: OperatorScale;
}

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
  } = {},
): ImplementationPlan {
  const suitability = options.suitability ?? {};
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
    buckets[level]!.push({
      element,
      from: MATURITY_LEVELS[level]!,
      to: MATURITY_LEVELS[level + 1]!,
      action: transition.action,
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
    ...(options.scale ? { scale: options.scale } : {}),
  };
}
