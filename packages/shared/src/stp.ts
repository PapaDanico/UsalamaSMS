/* =====================================================================
   THE STANDARDIZED TRAINING PACKAGE SHAPE, APPLIED TO KCAA'S SYLLABUS.

   WHAT THIS IS AND IS NOT. ICAO's TRAINAIR PLUS Standardized Training
   Packages are ICAO's own products, developed and validated by ICAO and
   its member training centres. THIS PRODUCT DOES NOT SHIP AN ICAO STP
   AND MUST NOT SAY IT DOES. What it ships is a training programme built
   to the STP METHOD — the same artefact set, the same objective
   grammar, the same assessment discipline — carrying KCAA's syllabus
   from CAA-AC-SMS011.

   The distinction is commercial as well as legal. An operator handed a
   document claiming to be an ICAO STP has been told something an
   auditor can check and disprove; an operator handed a programme that
   demonstrably follows ICAO's methodology and its own regulator's
   circular has been given something that survives the check.

   ---------------------------------------------------------------
   THE ARTEFACTS, from the forms themselves:

     Form 9  · Course Description    aim, target population, entry and
                                     delivery requirements
     Form 10 · Course Content        modules, duration, training
                                     technique per module
     Form 11 · Instructor's Timetable day, session, module, trainee
                                     material, audio-visual aids
     Form 6  · Module Plan           timed steps, exercises, response
                                     samples, tests, debrief

   THE OBJECTIVE GRAMMAR IS THE LOAD-BEARING PART. An STP objective is
   never a topic. It is three things together:

     Conditions   what the trainee is given
     Performance  what they must do with it
     Standard     the document or criterion it is judged against

   "Understand hazard identification" is a topic and cannot be assessed.
   "Given the operator's hazard register and a completed report, raise a
   hazard and assign an initial risk index, in accordance with the 5x5
   matrix in the SMS manual" is an objective, and two assessors marking
   it independently will agree.

   THIS IS ALSO WHAT CAA-AC-SMS011 SECTION 12 ASKS FOR — competency
   based and not compliance based, assessed per individual, with
   remedial action where competence is not demonstrated. The STP method
   is how that sentence becomes a document somebody can teach from.
   ===================================================================== */
import {
  SYLLABUS_MODULES, TRAINING_BANDS, RECOMMENDED_TIMING,
  type SyllabusModule, type TrainingBand,
} from "./curriculum";

/** The methodology this shape follows, cited rather than implied. */
export const STP_METHOD_SOURCE =
  "ICAO TRAINAIR PLUS Standardized Training Package methodology — the course " +
  "description, course content, instructor timetable and module plan forms, and " +
  "the Conditions/Performance/Standard objective. The syllabus carried in that " +
  "shape is KCAA CAA-AC-SMS011.";

/**
 * WHETHER THIS PRODUCT CLAIMS TO ISSUE AN ICAO STP. It does not, and
 * this constant exists so no screen can drift into saying otherwise
 * without deleting a line somebody has to justify deleting.
 */
export const IS_AN_ICAO_STP = false;

/** The three parts of an assessable objective. Never a topic. */
export interface Objective {
  /** What the trainee is given. */
  readonly conditions: string;
  /** What they must do. An observable verb, never "understand" or "know". */
  readonly performance: string;
  /** The document or criterion the performance is judged against. */
  readonly standard: string;
}

/** Verbs that cannot be observed, and therefore cannot close an objective. */
export const UNASSESSABLE_VERBS: readonly string[] = Object.freeze([
  "understand", "know", "be aware", "appreciate", "be familiar", "learn",
]);

/**
 * Whether a performance clause can actually be assessed.
 *
 * Used by a test rather than at runtime: the point is to stop an
 * unassessable objective being written into this file, not to validate
 * an operator's typing.
 */
export function isAssessable(performance: string): boolean {
  const p = performance.trim().toLowerCase();
  return p.length > 0 && !UNASSESSABLE_VERBS.some((v) => p.startsWith(v));
}

/** Form 10 — one row per module. */
export interface CourseContentRow {
  readonly moduleNumber: number;
  readonly title: string;
  /** Minutes, so a timetable can add them without parsing prose. */
  readonly minutes: number;
  /** The AC's own encouragement: problem-based (case study) learning. */
  readonly techniques: readonly string[];
}

/** Form 9 — the course as an administrator describes it. */
export interface CourseDescription {
  readonly bandKey: string;
  readonly title: string;
  readonly days: number;
  readonly aim: string;
  readonly targetPopulation: string;
  readonly entryRequirements: readonly string[];
  readonly deliveryRequirements: readonly string[];
  /** Every module in this course, with its share of the time. */
  readonly content: readonly CourseContentRow[];
  /** What the trainee must demonstrate by the end. */
  readonly objectives: readonly Objective[];
  readonly assessment: readonly string[];
  readonly recurrence: string;
}

/* ---------------------------------------------------------------
   THE ONE PIECE OF ARITHMETIC, AND WHY IT IS SPREAD RATHER THAN
   INVENTED.

   Appendix I gives a DURATION PER BAND. Appendix II gives MODULES AND
   SECTIONS and no durations at all. Nothing in the circular says how a
   five-day course divides across six modules.

   So the split is by SECTION COUNT — a module with eight sections gets
   more of the week than one with two — rather than by a per-module
   figure this file would have had to make up. It is stated as derived,
   and a training manager who knows their operation should overrule it.
   Dividing equally would have been the other easy lie: it would have
   given Module 4's two sections the same time as Module 2's eight.
   --------------------------------------------------------------- */
const TRAINING_DAY_MINUTES = 6 * 60;

/** Minutes per module for a course of `days`, weighted by section count. */
export function minutesPerModule(
  days: number,
  modules: readonly SyllabusModule[] = SYLLABUS_MODULES,
): readonly number[] {
  const total = days * TRAINING_DAY_MINUTES;
  const sections = modules.map((m) => m.sections.length);
  const all = sections.reduce((a, b) => a + b, 0);
  if (all === 0) return modules.map(() => 0);
  /* Rounded to five minutes, because a timetable printed to the minute
     implies a precision the source does not have. */
  return sections.map((n) => Math.round((total * n) / all / 5) * 5);
}

/** The techniques the circular names, applied where each fits. */
function techniquesFor(m: SyllabusModule, practical: boolean): readonly string[] {
  const base = ["Lesson", "Case study"];
  /* Section 8.2: "Problem based (Case Study) learning is encouraged."
     Section 12.5 adds practical exercises where skills are assessed. */
  return practical ? Object.freeze([...base, "Supervised practice", "Practical exercise"])
    : Object.freeze([...base, "Knowledge check"]);
}

/**
 * The course outline for one Appendix I band.
 *
 * EVERY BAND GETS EVERY MODULE, at different depth, which is what
 * section 8.5 describes — "the training curricula can be tailored to
 * specific group to meet specific learning objectives" — and NOT a
 * shorter list of modules for the shorter courses. Dropping Module 6
 * from the one-day management course would tell a finance director that
 * safety data protection is not their concern, and section 9.1.11 puts
 * it directly on their list.
 */
export function outlineFor(band: TrainingBand): CourseDescription {
  const minutes = minutesPerModule(band.days);
  return Object.freeze({
    bandKey: band.key,
    title: `SMS training — ${band.who}`,
    days: band.days,
    aim:
      "On completion, personnel are competent to perform their SMS duties, to the " +
      "depth their involvement in the SMS requires.",
    targetPopulation: band.who,
    entryRequirements: Object.freeze(
      band.examples.length
        ? [`Appointed to one of: ${band.examples.join(", ")}.`, "No prior SMS training assumed."]
        : ["No prior SMS training assumed."],
    ),
    deliveryRequirements: Object.freeze([
      "An instructor competent in safety management and in instruction — the circular " +
        "puts competent trainers as the single most important consideration.",
      "The operator's own SMS manual and operations manual, as reference material.",
      "The Civil Aviation (Safety Management) Regulations.",
    ]),
    content: Object.freeze(
      SYLLABUS_MODULES.map((m, i) => Object.freeze({
        moduleNumber: m.number,
        title: m.title,
        minutes: minutes[i] ?? 0,
        techniques: techniquesFor(m, band.practicalRequired),
      })),
    ),
    objectives: Object.freeze(
      band.practicalRequired
        ? [
            Object.freeze({
              conditions: "Given the operator's SMS manual and a completed occurrence report",
              performance: "Raise a hazard and assign an initial risk index",
              standard: "The risk matrix and tolerability criteria in the operator's SMS manual",
            }),
            Object.freeze({
              conditions: "Given a safety concern arising in their own duties",
              performance: "File a safety report through the operator's reporting system",
              standard: "The reporting procedure in the operator's SMS manual",
            }),
          ]
        : [
            Object.freeze({
              conditions: "Given a safety concern arising in their own duties",
              performance: "File a safety report through the operator's reporting system",
              standard: "The reporting procedure in the operator's SMS manual",
            }),
            Object.freeze({
              conditions: "Given the operator's safety policy",
              performance: "State their own safety accountabilities and to whom they report",
              standard: "The accountability matrix in the operator's SMS manual",
            }),
          ],
    ),
    assessment: Object.freeze(
      band.practicalRequired
        ? ["Knowledge and awareness assessment", "Skills and practical application assessment"]
        : ["Knowledge and awareness assessment"],
    ),
    recurrence:
      `Initial within ${RECOMMENDED_TIMING.initialWithinMonths} months of starting; ` +
      `refresher every ${RECOMMENDED_TIMING.refresherMonths} months. ` +
      RECOMMENDED_TIMING.status,
  });
}

/** Every band's outline, in Appendix I's order. */
export function allOutlines(): readonly CourseDescription[] {
  return Object.freeze(TRAINING_BANDS.map(outlineFor));
}
