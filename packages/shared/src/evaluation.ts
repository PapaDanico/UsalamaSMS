/* =====================================================================
   THE SMS EVALUATION SELF-ASSESSMENT, AND WHAT IT IS NOT.

   A regulator that runs an SMS evaluation arrives with a list of
   criteria and asks, for each one, to be shown something. This module
   is the index of those criteria, so that an operator can walk the same
   list BEFORE the visit and find out which ones they cannot answer.

   -------------------------------------------------------------
   IT USED TO BE CALLED "SET-I", AND THAT NAME COULD NOT BE SOURCED.

   The instrument this is built from is the UK CAA's **SMS Evaluation
   Tool**, published as form **SRG1776** (V7, November 2023) alongside
   CAP 795. That is the name the CAA's own publication list uses.

   "SET-I" was the name this feature shipped under, written by an agent
   rather than read off the instrument, and a search of the CAA's
   publications does not return a tool by that name. It is most likely a
   contraction of "SMS Evaluation Tool, phase I" — the CAA does run a
   phased evaluation, phase 1 for present-and-suitable and phase 2 for
   operating-and-effective — but "most likely" is not a citation, and
   this repository already has a rule about the difference.

   So the operator-facing name is now the one that can be sourced. The
   acronym survives nowhere a customer reads.

   -------------------------------------------------------------
   THE PROVENANCE IS DECLARED RATHER THAN IMPLIED, which is the same
   answer `cictt.ts` gives to the same question.

   The four levels below ARE corroborated: the CAA's own material
   describes elements assessed as present, suitable, operating and
   effective. The 48 criteria and their numbering are NOT — they came
   with the feature, no primary instrument has been read against them,
   and `caa.co.uk` cannot be reached from the environment this product
   is developed in.

   `VERIFIED_AGAINST_PRIMARY` is therefore false, and the screen says so
   to the assessor rather than letting a list of official-looking
   reference numbers imply an authority nobody checked. It stays false
   until somebody opens SRG1776 and reads it.

   -------------------------------------------------------------
   THE DATABASE STILL SAYS `Seti`, DELIBERATELY.

   `SetiAssessment`, `SetiAssessmentItem`, the `SetiLevel` enum and the
   `/api/v1/seti` route keep their names. Renaming them means a
   migration that rewrites two tables and an enum on a live database,
   and an applied migration in this repository is immutable — the cost
   is real and the benefit is zero, because no operator ever sees a
   table name. The rename covers what a person reads.

   That divergence is written down here so the next person to open the
   schema is not left wondering which of the two names is current.
   Both are: one is the product's, one is the storage's.
   ===================================================================== */

/**
 * Whether the criterion list below has been read against SRG1776
 * itself.
 *
 * FALSE, and the screen tells the assessor so. WebSearch returns a
 * search index's rendering of the CAA's material, not the form, and
 * every primary regulatory host is refused at this environment's egress
 * proxy. A criterion list carrying official-looking reference numbers
 * is exactly the kind of thing that gets believed on sight, so the one
 * honest move is to say which parts were checked.
 *
 * To flip it: open SRG1776 V7, reconcile every id, title and section
 * below, and change this in the same commit as whatever it corrects.
 */
export const EVALUATION_VERIFIED_AGAINST_PRIMARY = false;

/** The instrument, named the way it can be cited. */
export const EVALUATION_INSTRUMENT = Object.freeze({
  authority: "UK Civil Aviation Authority",
  title: "SMS Evaluation Tool",
  reference: "SRG1776",
  version: "V7",
  /* The publication date of V7, not the date this module was written. */
  published: "2023-11",
  guidance: "CAP 795",
});

/**
 * The four levels, in the order a regulator works up them.
 *
 * This IS corroborated against the CAA's published description of how
 * elements are assessed, which is why it is separated from the
 * criterion list above rather than sharing its caveat.
 */
export const EVALUATION_LEVELS = ["PRESENT", "SUITABLE", "OPERATING", "EFFECTIVE"] as const;
export type EvaluationLevel = (typeof EVALUATION_LEVELS)[number];

/**
 * What each level means, in the assessor's own decision terms.
 *
 * The screen used to offer four bare words in a dropdown. "Suitable"
 * and "Operating" are not self-explanatory — the difference is whether
 * the thing exists and fits, or whether people are actually doing it —
 * and an assessor guessing between them produces a rating nobody can
 * defend. Written down once, rendered beside the control.
 */
export const EVALUATION_LEVEL_MEANING: Readonly<Record<EvaluationLevel, string>> = Object.freeze({
  PRESENT: "The element exists and can be pointed at — a document, a post, a process.",
  SUITABLE: "It fits this operation's size, nature, complexity and risk, rather than somebody else's.",
  OPERATING: "People are actually doing it, and the record shows them doing it.",
  EFFECTIVE: "It is achieving what it exists to achieve, and that is being checked.",
});

/**
 * The phase of a CAA evaluation each level belongs to.
 *
 * Phase 1 asks whether the SMS is present and suitable; phase 2, within
 * about a year of operating, asks whether it is operating and
 * effective. An operator preparing for a first evaluation is being
 * asked two of these four questions and not the other two, and a screen
 * that does not say so invites them to worry about the wrong half.
 */
export const EVALUATION_PHASE: Readonly<Record<EvaluationLevel, 1 | 2>> = Object.freeze({
  PRESENT: 1,
  SUITABLE: 1,
  OPERATING: 2,
  EFFECTIVE: 2,
});

export type EvaluationCriterion = {
  id: string;
  section: string;
  title: string;
};

const criteria = (
  section: string,
  entries: readonly [string, string][]
): EvaluationCriterion[] => entries.map(([id, title]) => ({ id, section, title }));

export const EVALUATION_CRITERIA: readonly EvaluationCriterion[] = Object.freeze([
  ...criteria("0 Foundations of SMS", [
    ["0.1.1", "Leadership commitment and culture"],
    ["0.1.2", "Just Culture"],
    ["0.1.3", "Reporting culture"],
    ["0.1.4", "Learning culture"],
    ["0.1.5", "Assessing the safety culture"],
    ["0.2.1", "Organisational and human factors in risk management"],
    ["0.2.2", "Human factors in change"],
    ["0.2.3", "Wellbeing and support available to staff"],
    ["0.2.4", "Human and organisational factors training"],
  ]),
  ...criteria("1 Safety Policy", [
    ["1.1.1", "Endorsed safety policy"],
    ["1.1.2", "Safety policy and resource"],
    ["1.1.3", "Supporting policies"],
    ["1.2.1", "Accountable Manager"],
    ["1.2.2", "Accountable Manager suitability"],
    ["1.2.3", "Documented authority for SMS"],
    ["1.3.1", "Safety Manager"],
    ["1.3.2", "SMS resourcing"],
    ["1.3.3", "Safety committee(s)"],
    ["1.4.1", "Emergency response plan"],
    ["1.4.2", "Emergency response plan testing"],
    ["1.5.1", "Scope and availability of documentation and records"],
    ["1.5.2", "Documentation and records control"],
  ]),
  ...criteria("2 Risk Management", [
    ["2.1.1", "Reporting system(s)"],
    ["2.1.2", "Reporting management"],
    ["2.2.1", "Safety investigations"],
    ["2.3.1", "Hazard identification and safety data sourcing"],
    ["2.3.2", "Safety data analysis"],
    ["2.4.1", "Management of risk"],
    ["2.4.2", "Acceptable levels of safety"],
    ["2.4.3", "Effective risk controls"],
    ["2.4.4", "NASP alignment"],
  ]),
  ...criteria("3 Assurance", [
    ["3.1.1", "Safety objectives"],
    ["3.1.2", "Safety performance indicators"],
    ["3.1.3", "Risk control assurance"],
    ["3.2.1", "Management of change"],
    ["3.3.1", "SMS continuous improvement"],
  ]),
  ...criteria("4 Promotion", [
    ["4.1.1", "Initial and recurrent training"],
    ["4.1.2", "Training effectiveness"],
    ["4.1.3", "Competence evaluation"],
    ["4.2.1", "Safety policy promotion"],
    ["4.2.2", "Safety-critical information"],
    ["4.2.3", "Promoting feedback"],
  ]),
  ...criteria("5 Interface Management", [
    ["5.1.1", "Critical internal and external interfaces"],
    ["5.1.2", "Interface collaboration"],
  ]),
  ...criteria("6 Compliance", [
    ["6.1.1", "Compliance responsibilities and accountabilities"],
    ["6.1.2", "Compliance focal point(s)"],
    ["6.1.3", "Monitoring programme"],
    ["6.1.4", "Compliance monitoring performance and outcomes"],
  ]),
]);

export const EVALUATION_BY_ID = new Map(
  EVALUATION_CRITERIA.map((criterion) => [criterion.id, criterion])
);

/**
 * The criteria grouped into the sections they are numbered under, in
 * the order they appear.
 *
 * COMPUTED, NOT TYPED. The screen renders 48 criteria and needs them in
 * seven groups; a second hand-written list of section names is a second
 * thing to keep in step, and this repository has a section on what that
 * costs. Derived here so a criterion added above appears in its group
 * without anybody remembering to say so.
 */
export const EVALUATION_SECTIONS: ReadonlyArray<{
  readonly section: string;
  readonly criteria: readonly EvaluationCriterion[];
}> = Object.freeze(
  [...new Set(EVALUATION_CRITERIA.map((c) => c.section))].map((section) =>
    Object.freeze({
      section,
      criteria: Object.freeze(EVALUATION_CRITERIA.filter((c) => c.section === section)),
    })
  )
);

/** An item as the ledger stores it: a rating only counts with its evidence. */
export type EvaluationItemLike = {
  readonly level?: string | null;
  readonly evidence?: string | null;
  readonly sourceRefs?: string | null;
  readonly ownerPost?: string | null;
  readonly reviewDueOn?: unknown;
};

/**
 * How far through the list an assessment is.
 *
 * ANSWERED IN THE MODULE RATHER THAN IN THE SCREEN, because the number
 * of criteria is here and a progress figure computed against a
 * hand-typed 48 is a figure that lies the day a criterion is added.
 *
 * `rated` counts only items carrying a level AND the evidence the route
 * requires with it. A half-filled form that was never saved is not
 * progress, and counting it would tell an assessor they were further
 * along than the record is — on the screen whose whole job is to find
 * out what they cannot yet answer.
 */
export function evaluationProgress(
  items: ReadonlyArray<EvaluationItemLike & { criterionId?: string }>
): { total: number; rated: number; remaining: number } {
  const total = EVALUATION_CRITERIA.length;
  const rated = items.filter(
    (item) =>
      typeof item.level === "string" &&
      (EVALUATION_LEVELS as readonly string[]).includes(item.level) &&
      Boolean(item.evidence) &&
      Boolean(item.sourceRefs) &&
      Boolean(item.ownerPost) &&
      Boolean(item.reviewDueOn)
  ).length;
  return { total, rated, remaining: total - rated };
}
