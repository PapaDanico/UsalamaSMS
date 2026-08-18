/* =====================================================================
   WILL YOUR PEOPLE ACTUALLY FILE? — the question this product's value
   rests on, and could not answer.

   Everything else here assumes reports arrive. The deadline engine
   computes from an occurrence somebody reported. The register fills
   from hazards somebody raised. Barrier health reads degradations
   somebody recorded. An operator with a perfect installation of this
   product and a workforce that will not report has an empty system
   that passes every check in this repository.

   Annex 19 asks for a reporting system for ALL personnel. It does not
   ask whether they use it. The evidence says many do not: a
   peer-reviewed study of small commercial airlines found 58% of
   personnel engaged in regular hazard reporting, with FEAR OF PUNITIVE
   ACTION the primary barrier — ahead of lack of training and ahead of
   system access (Barrameda, Florencondia & Villar, IRE Journals,
   2024). That is the population this product is built for.

   So this module measures the conditions under which somebody files.

   ---------------------------------------------------------------
   THESE DIMENSIONS ARE THIS PRODUCT'S JUDGEMENT, NOT ICAO's.

   Charter rule 12: where the instrument has not been read, say so.
   Doc 9859 discusses safety culture and this environment cannot reach
   icao.int — every primary regulatory host is refused at the egress
   proxy. So NOTHING HERE IS PRESENTED AS ICAO's QUESTIONNAIRE. There
   is no ICAO questionnaire in this file, no citation dressed up as
   one, and no claim that a score means conformance.

   What the dimensions ARE is derived from this product's own
   mechanics — each one names a condition that, if absent, makes a
   specific part of the system stop working. That is a weaker claim
   than the instrument's and it is one this repository can actually
   support. The argument for each is below, and tests/culture.test.ts
   reads THIS HEADER and fails when a dimension has no line in it.

     WILL_REPORT     the precondition for everything downstream. If
                     this is low nothing else in the product matters,
                     and no configuration fixes it.
     CONSEQUENCE     the measured barrier above. Distinct from
                     WILL_REPORT because somebody can intend to report
                     and still expect to pay for it — that gap is the
                     actionable finding, not either number alone.
     CONFIDENTIALITY whether people BELIEVE the anonymous path is
                     anonymous. The architecture being sound is not
                     the same as being trusted, and only the belief
                     changes behaviour.
     FEEDBACK        Annex 19's reporting system is a loop. A reporter
                     who never learns what happened files once. This
                     is the dimension the product can most directly
                     improve — the digest exists for it.
     ACTION          whether anything visibly changes. Feedback
                     without action teaches people that reporting is
                     a formality, which is worse than silence because
                     it costs them effort to learn it.

   ---------------------------------------------------------------
   THREE REFUSALS, and they are the reason to trust the rest.

   1. NO SINGLE CULTURE SCORE. Five dimension means, never one number.
      The maturity module already refuses to collapse a ladder into a
      grade because SM ICG says maturity is never linear and never
      pass/fail; a culture index is the same error with more at stake,
      because a single number is what reaches a board paper and it
      cannot say WHICH condition is missing. An operator scoring 3.4
      learns nothing. An operator whose people will report but expect
      consequences learns exactly what to fix.

   2. RESULTS ARE SUPPRESSED BELOW A MINIMUM. At a nine-person
      operator, a dimension mean computed from four responses is false
      precision — and a breakdown of four responses by role identifies
      people. This product spent an afternoon removing a keyed hash
      that could re-identify an anonymous reporter; shipping a survey
      that does it by arithmetic instead would be the same failure
      wearing a different hat.

   3. NOTHING LEAVES THE DEVICE. The survey is scored in the browser
      and never posted. That is not a promise about our servers, it is
      the absence of a request — the only version of this claim that
      cannot be quietly broken later.
   ===================================================================== */

/** A condition under which somebody does or does not file. */
export type CultureDimension =
  | "WILL_REPORT"
  | "CONSEQUENCE"
  | "CONFIDENTIALITY"
  | "FEEDBACK"
  | "ACTION";

export interface CultureItem {
  readonly id: string;
  readonly dimension: CultureDimension;
  /** Shown to the respondent, in their words rather than the system's. */
  readonly text: string;
  /**
   * TRUE WHEN AGREEING IS THE BAD ANSWER.
   *
   * A survey whose every item rewards agreement measures agreeableness.
   * Reversed items break the pattern so a respondent has to read, and
   * `score()` flips them back before averaging — which is the step
   * that gets forgotten, so `tests/culture.test.ts` drives a
   * respondent who agrees with everything and requires the reversed
   * dimensions to come out LOW.
   */
  readonly reversed?: true;
}

/**
 * FIVE POINTS, LABELLED, NO NEUTRAL MIDPOINT BY ACCIDENT.
 *
 * The midpoint is "neither" and it means it — on a question about
 * whether you would report, "neither" is a real answer and forcing a
 * side would manufacture data. What is NOT offered is "prefer not to
 * say", because a survey this short with an opt-out on every item
 * produces a sample that is not the workforce.
 */
export const CULTURE_SCALE: ReadonlyArray<{ readonly value: number; readonly label: string }> =
  Object.freeze([
    Object.freeze({ value: 1, label: "Strongly disagree" }),
    Object.freeze({ value: 2, label: "Disagree" }),
    Object.freeze({ value: 3, label: "Neither" }),
    Object.freeze({ value: 4, label: "Agree" }),
    Object.freeze({ value: 5, label: "Strongly agree" }),
  ]);

export const CULTURE_MIN = 1;
export const CULTURE_MAX = 5;

/**
 * THE MINIMUM NUMBER OF RESPONSES BEFORE ANYTHING IS SHOWN.
 *
 * Five, and the number is a privacy decision rather than a statistical
 * one. Four responses at a nine-person operator is a quarter of the
 * workforce and a safety manager who knows who was on shift can often
 * name them. Five is not anonymity — nothing is, at this scale — but
 * it is the point below which the arithmetic itself starts pointing at
 * individuals.
 *
 * It is deliberately NOT configurable. An operator who could lower it
 * would lower it on the day the answers were interesting.
 */
export const CULTURE_MIN_RESPONSES = 5;

export const CULTURE_ITEMS: ReadonlyArray<CultureItem> = Object.freeze([
  Object.freeze({
    id: "wr1", dimension: "WILL_REPORT" as const,
    text: "If I saw something unsafe at work today, I would file a report about it.",
  }),
  Object.freeze({
    id: "wr2", dimension: "WILL_REPORT" as const,
    text: "I know how to file a report without asking anyone for help.",
  }),
  Object.freeze({
    id: "wr3", dimension: "WILL_REPORT" as const,
    text: "Reporting something small feels like a waste of everyone's time.",
    reversed: true as const,
  }),
  Object.freeze({
    id: "cq1", dimension: "CONSEQUENCE" as const,
    text: "Someone who reports their own mistake here is treated fairly.",
  }),
  Object.freeze({
    id: "cq2", dimension: "CONSEQUENCE" as const,
    text: "Filing a report could be held against me later.",
    reversed: true as const,
  }),
  Object.freeze({
    id: "cq3", dimension: "CONSEQUENCE" as const,
    text: "I have seen someone treated badly after raising a safety concern.",
    reversed: true as const,
  }),
  Object.freeze({
    id: "cf1", dimension: "CONFIDENTIALITY" as const,
    text: "If I filed anonymously, I believe my name would stay out of it.",
  }),
  Object.freeze({
    id: "cf2", dimension: "CONFIDENTIALITY" as const,
    text: "People here can usually work out who filed a report.",
    reversed: true as const,
  }),
  Object.freeze({
    id: "fb1", dimension: "FEEDBACK" as const,
    text: "I hear what happened to reports that were filed.",
  }),
  Object.freeze({
    id: "fb2", dimension: "FEEDBACK" as const,
    text: "When I report something, I find out whether anyone looked at it.",
  }),
  Object.freeze({
    id: "fb3", dimension: "FEEDBACK" as const,
    text: "Reports seem to disappear once they are filed.",
    reversed: true as const,
  }),
  Object.freeze({
    id: "ac1", dimension: "ACTION" as const,
    text: "Things have actually changed here because someone reported them.",
  }),
  Object.freeze({
    id: "ac2", dimension: "ACTION" as const,
    text: "Management takes safety concerns seriously enough to spend money on them.",
  }),
  Object.freeze({
    id: "ac3", dimension: "ACTION" as const,
    text: "The same problems keep coming back no matter how often they are raised.",
    reversed: true as const,
  }),
]);

/** One person's answers: item id to a point on the scale. */
export type CultureResponse = Readonly<Record<string, number>>;

export interface DimensionResult {
  readonly dimension: CultureDimension;
  readonly mean: number;
  readonly answered: number;
}

export type CultureVerdict =
  | { readonly kind: "SUPPRESSED"; readonly responses: number; readonly needed: number }
  | { readonly kind: "SCORED"; readonly responses: number; readonly dimensions: ReadonlyArray<DimensionResult> };

const DIMENSIONS: ReadonlyArray<CultureDimension> = Object.freeze([
  "WILL_REPORT", "CONSEQUENCE", "CONFIDENTIALITY", "FEEDBACK", "ACTION",
]);

export function dimensionsOf(): ReadonlyArray<CultureDimension> {
  return DIMENSIONS;
}

/** A reversed item's 5 is a 1. Applied once, here, and nowhere else. */
export function pointsFor(item: CultureItem, answer: number): number {
  return item.reversed ? CULTURE_MAX + CULTURE_MIN - answer : answer;
}

const valid = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= CULTURE_MIN && n <= CULTURE_MAX;

/**
 * Score a set of responses, or refuse to.
 *
 * THE SUPPRESSION IS THE FIRST THING IT DOES, before any arithmetic —
 * so there is no code path on which a mean over four people exists in
 * memory to be logged, rendered or accidentally returned.
 */
export function score(responses: ReadonlyArray<CultureResponse>): CultureVerdict {
  if (responses.length < CULTURE_MIN_RESPONSES) {
    return { kind: "SUPPRESSED", responses: responses.length, needed: CULTURE_MIN_RESPONSES };
  }

  const dimensions = DIMENSIONS.map((dimension) => {
    const items = CULTURE_ITEMS.filter((i) => i.dimension === dimension);
    let total = 0;
    let answered = 0;
    for (const r of responses) {
      for (const item of items) {
        const a = r[item.id];
        if (!valid(a)) continue;
        total += pointsFor(item, a);
        answered += 1;
      }
    }
    /* An unanswered dimension is 0 answered and a mean of 0 would read
       as the worst possible result rather than as no result. NaN would
       propagate silently. So the mean is only defined where something
       was answered, and the screen reads `answered` before `mean`. */
    return { dimension, mean: answered === 0 ? 0 : total / answered, answered };
  });

  return { kind: "SCORED", responses: responses.length, dimensions };
}

/**
 * WHAT A DIMENSION MEAN MEANS, in words an operator can act on.
 *
 * Three bands, not five, because the action is the same across a wide
 * middle: below 3 something is wrong and nameable, 3 to 4 is a
 * condition that holds but is not relied upon, above 4 is working.
 * Finer bands would imply a precision fourteen items over five people
 * does not have.
 */
export function bandFor(mean: number): "WEAK" | "MIXED" | "STRONG" {
  if (mean < 3) return "WEAK";
  if (mean < 4) return "MIXED";
  return "STRONG";
}

/**
 * The one thing worth saying first, chosen rather than listed.
 *
 * WILL_REPORT IS CHECKED BEFORE ANY OTHER DIMENSION, because it is the
 * only one whose absence makes the rest moot: an operator whose people
 * will not file does not have a feedback problem, it has no reports to
 * feed back on. After that the WEAKEST dimension leads, because a
 * ranked list read top-down is how a safety manager decides what to do
 * on Monday.
 */
export function leadFinding(v: CultureVerdict): string | null {
  if (v.kind !== "SCORED") return null;
  const byName = new Map(v.dimensions.map((d) => [d.dimension, d]));
  const will = byName.get("WILL_REPORT");
  if (will && will.answered > 0 && bandFor(will.mean) === "WEAK") {
    return "WILL_REPORT";
  }
  const scored = v.dimensions.filter((d) => d.answered > 0);
  if (scored.length === 0) return null;
  return scored.reduce((a, b) => (b.mean < a.mean ? b : a)).dimension;
}
