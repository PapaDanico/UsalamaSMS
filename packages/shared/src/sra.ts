// =====================================================================
// The Safety Risk Assessment — ICAO Doc 9859 safety risk management.
//
// WHY THIS IS NOT THE RISK REGISTER. The register answers "what hazards
// do we carry, who owns them, when are they next looked at". An SRA
// answers a different question, and it is the one an operator is asked
// at the worst moment: "you changed something — what did you think
// would happen, and what did you do about it?"
//
// A register is a standing list. An SRA is a DOCUMENT ABOUT ONE
// DECISION: a new route, a new type on the AOC, a base closing, a
// roster change, an aerodrome losing a service. It is what Annex 19
// element 3.2 (management of change) asks a service provider to produce
// before the change, and what an auditor asks for after it.
//
// THE FIVE STEPS ARE ICAO'S, NOT OURS. Doc 9859 fourth edition sets
// out safety risk management as: system analysis, identify hazards,
// analyse safety risk, assess safety risk, control safety risk — with
// the loop back from control to analysis to evaluate the controls
// proposed. They are encoded here in that order, with that loop, so
// the screen renders the process rather than a form somebody invented
// that resembles it.
//
// The arithmetic is the same tolerability() the matrix, the assessor
// and the register use. Never stored — an assessment cannot carry a
// band that disagrees with the scale it claims to be built on.
// =====================================================================

import { tolerability, riskScore, type Severity, type Likelihood } from "./risk";

export interface SraStep {
  readonly id: string;
  readonly ordinal: number;
  readonly name: string;
  /** What this step is for, in the words an operator would use. */
  readonly purpose: string;
  /** What an auditor looks for. Absent this, the step is decoration. */
  readonly evidence: string;
}

/**
 * Doc 9859 fourth edition, safety risk management.
 *
 * Step 5 loops back to step 1 — "evaluate proposed controls" — which is
 * the part most templates drop. A control is a change to the system,
 * so it has to be run back through the analysis: a mitigation that
 * introduces a new hazard is the commonest way an SRA makes an
 * operation less safe while documenting the opposite.
 */
export const SRA_STEPS: readonly SraStep[] = [
  {
    id: "system",
    ordinal: 1,
    name: "System analysis",
    purpose:
      "Describe what is changing and the operation it sits in — the aircraft, " +
      "the aerodromes, the people, the procedures and the interfaces with " +
      "anybody else's system.",
    evidence:
      "A description specific enough that somebody who was not in the room can " +
      "tell what was being decided, and dated before the change took effect.",
  },
  {
    id: "hazards",
    ordinal: 2,
    name: "Identify hazards",
    purpose:
      "List the conditions the change could introduce or worsen. A hazard is a " +
      "condition, not an event and not a consequence.",
    evidence:
      "More than one hazard, from more than one person. A single-hazard SRA is " +
      "usually one person's first thought written down.",
  },
  {
    id: "analyse",
    ordinal: 3,
    name: "Analyse safety risk",
    purpose:
      "For each hazard, the credible consequence, and how bad and how likely it " +
      "is in THIS operation rather than in aviation generally.",
    evidence:
      "A severity and a likelihood for every hazard, and a reason for each that " +
      "refers to this operator's own experience or data.",
  },
  {
    id: "assess",
    ordinal: 4,
    name: "Assess safety risk",
    purpose:
      "Place each risk on the matrix and decide whether it is acceptable as it " +
      "stands, acceptable with mitigation, or not acceptable at all.",
    evidence:
      "The tolerability band, computed from the scale rather than asserted, and " +
      "a statement of what the band obliges.",
  },
  {
    id: "control",
    ordinal: 5,
    name: "Control safety risk",
    purpose:
      "For anything not acceptable as it stands, the mitigation, its owner, and " +
      "the residual risk once it is in place.",
    evidence:
      "A residual assessment for every mitigated hazard, and — the step most " +
      "templates drop — the proposed controls run back through steps 2 and 3, " +
      "because a control changes the system and can introduce a hazard of its own.",
  },
] as const;

export type SraStatus = "DRAFT" | "ASSESSED" | "ACCEPTED" | "WITHDRAWN";

export interface SraHazard {
  readonly id: string;
  readonly hazard: string;
  readonly consequence: string;
  readonly severity?: string;
  readonly likelihood?: string;
  readonly controls: string;
  readonly residualSeverity?: string;
  readonly residualLikelihood?: string;
  readonly owner: string;
  /** Whether the proposed control was run back through the hazard step. */
  readonly controlReviewed: boolean;
}

export interface Sra {
  readonly id: string;
  readonly title: string;
  /** Step 1: what is changing. */
  readonly system: string;
  readonly hazards: readonly SraHazard[];
  readonly status: SraStatus;
  readonly acceptedBy: string;
  readonly acceptedOn: string;
  readonly createdAt: string;
}

function band(severity?: string, likelihood?: string) {
  if (!severity || !likelihood) return null;
  try {
    return {
      tolerability: tolerability(severity as Severity, likelihood as Likelihood),
      score: riskScore(severity as Severity, likelihood as Likelihood),
    };
  } catch {
    return null;
  }
}

/** The risk that stands after controls, or before them if there are none. */
export function effectiveRisk(h: SraHazard) {
  return band(h.residualSeverity, h.residualLikelihood) ?? band(h.severity, h.likelihood);
}

export interface StepState {
  readonly step: SraStep;
  readonly complete: boolean;
  /** What is missing, in the words the screen shows. Empty when complete. */
  readonly missing: string;
}

/**
 * How far an assessment has actually got, per step.
 *
 * COMPLETENESS IS COMPUTED, NEVER TICKED. A checklist somebody ticks is
 * a checklist that gets ticked; the value of the five steps is that a
 * step is done when its evidence exists, which is a question about the
 * content and not about the person. Charter rule 10 applied to a
 * process rather than to a count.
 */
export function sraProgress(sra: Sra): readonly StepState[] {
  const hazards = sra.hazards ?? [];
  const analysed = hazards.filter((h) => band(h.severity, h.likelihood));
  const needingControl = hazards.filter((h) => {
    const initial = band(h.severity, h.likelihood);
    return initial !== null && initial.tolerability !== "ACCEPTABLE";
  });
  const controlled = needingControl.filter(
    (h) => h.controls.trim() && band(h.residualSeverity, h.residualLikelihood),
  );
  const reviewed = needingControl.filter((h) => h.controlReviewed);

  return [
    {
      step: SRA_STEPS[0]!,
      complete: sra.system.trim().length >= 40,
      missing:
        "Describe the change and the operation it sits in — at least a couple " +
        "of sentences somebody outside the room could act on.",
    },
    {
      step: SRA_STEPS[1]!,
      complete: hazards.length >= 2,
      missing:
        hazards.length === 0
          ? "No hazards identified yet."
          : "Only one hazard. A single-hazard assessment is usually one person's first thought.",
    },
    {
      step: SRA_STEPS[2]!,
      complete: hazards.length > 0 && analysed.length === hazards.length,
      missing: `${hazards.length - analysed.length} hazard(s) have no severity and likelihood.`,
    },
    {
      /* Assessment is not a thing somebody does; it is what the matrix
         returns once step 3 is answered. So it completes with step 3
         and its evidence is the band, which is why this step has no
         input of its own on the screen. */
      step: SRA_STEPS[3]!,
      complete: hazards.length > 0 && analysed.length === hazards.length,
      missing: "Every hazard needs a severity and a likelihood before it can be placed.",
    },
    {
      step: SRA_STEPS[4]!,
      complete:
        needingControl.length === controlled.length && needingControl.length === reviewed.length,
      missing:
        controlled.length < needingControl.length
          ? `${needingControl.length - controlled.length} risk(s) above acceptable have no control and residual assessment.`
          : `${needingControl.length - reviewed.length} proposed control(s) have not been run back through hazard identification.`,
    },
  ];
}

export interface SraVerdict {
  readonly stepsComplete: number;
  readonly stepsTotal: number;
  readonly hazards: number;
  /** Residual risks still intolerable. The number that blocks acceptance. */
  readonly intolerableRemaining: number;
  /** True only when every step is complete AND nothing is left intolerable. */
  readonly readyToAccept: boolean;
  readonly blocker: string;
}

/**
 * Whether this assessment can be signed.
 *
 * INTOLERABLE RESIDUAL RISK BLOCKS ACCEPTANCE, and that is the whole
 * point of the type. Doc 9859's red band is not "acceptable with
 * sign-off from somebody sufficiently senior" — it is not acceptable at
 * any level of benefit. A tool that let an accountable executive click
 * through it would be helping produce the document that proves they
 * knew.
 */
export function sraVerdict(sra: Sra): SraVerdict {
  const steps = sraProgress(sra);
  const stepsComplete = steps.filter((s) => s.complete).length;
  const intolerableRemaining = (sra.hazards ?? []).filter(
    (h) => effectiveRisk(h)?.tolerability === "INTOLERABLE",
  ).length;

  const firstIncomplete = steps.find((s) => !s.complete);
  const blocker = intolerableRemaining
    ? `${intolerableRemaining} risk(s) remain intolerable after controls. This band is not acceptable at any level of benefit — the change cannot proceed on this assessment.`
    : (firstIncomplete?.missing ?? "");

  return {
    stepsComplete,
    stepsTotal: steps.length,
    hazards: (sra.hazards ?? []).length,
    intolerableRemaining,
    readyToAccept: stepsComplete === steps.length && intolerableRemaining === 0,
    blocker,
  };
}
