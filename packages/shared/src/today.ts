/* =====================================================================
   WHAT "TODAY" MEANS, SEPARATED FROM HOW IT LOOKS.

   /today is the screen a safety manager opens first, and until this
   module existed every judgement it makes lived inside a render
   function: which of two questions a role gets asked, whether the day
   is clear, how many days reads to a person. None of it was executed by
   anything. The accessibility sweep and the smoke suite both meet that
   screen SIGNED OUT, so the two failure branches, the reporter view and
   the digest view shipped with no test touching them.

   That is the same shape as the scheduled function that could not run:
   code a deploy executes and a suite does not. The fix there was to
   invoke the module; the fix here is to move the judgement somewhere a
   test can reach without a browser, which is the split this repository
   already uses between digest.ts and mail.ts — the module holds what to
   say, the adapter holds how it reads.

   NOTHING HERE TOUCHES THE DOM, fetches anything or reads a clock. Every
   function takes what it needs and returns a decision, so the screen
   becomes markup around answers rather than the place answers are
   worked out.
   ===================================================================== */
import type { DigestUrgency } from "./digest";

/**
 * WHICH QUESTION THIS ROLE IS ASKED.
 *
 * A digest is the safety office's work — counts of other people's
 * reports, other people's lapsing currencies. A reporter gets their own
 * two facts instead. This is not a permission check and must not be
 * mistaken for one: the server refuses regardless, and this only
 * decides which question is worth asking so that a reporter never meets
 * a refusal on a screen titled what needs YOU today.
 */
export type TodayView = "OFFICE" | "REPORTER";

export function viewFor(canReadOrg: boolean): TodayView {
  return canReadOrg ? "OFFICE" : "REPORTER";
}

/**
 * The verdict a digest's urgency carries, in the words somebody uses.
 *
 * NOW AND TODAY MUST NOT READ THE SAME, and the first version of the
 * screen gave them one sentence. digest.ts is careful about exactly this
 * distinction: an OVERDUE regulatory obligation and a LAPSED currency
 * are both late, and only one is a breach owed to an authority whose
 * clock has already run out. A screen that grades them identically has
 * undone the grading it is rendering.
 */
export interface Verdict {
  readonly line: string;
  readonly badge: "ALERT" | "CAUTION" | "SAFE";
  readonly word: string;
}

export const VERDICT: Readonly<Record<DigestUrgency, Verdict>> = Object.freeze({
  NOW: { line: "Something is past a regulatory deadline", badge: "ALERT", word: "act now" },
  TODAY: { line: "Something needs you today", badge: "CAUTION", word: "today" },
  SOON: { line: "Nothing urgent, some things are coming", badge: "SAFE", word: "soon" },
});

/**
 * Days rendered as something read without arithmetic.
 *
 * The same shape mail.ts uses deliberately — the same fact should not
 * read differently depending on whether it arrived by email or on a
 * screen. Empty string for "no clock", which is the honest rendering of
 * a kind that has none rather than a zero somebody would act on.
 */
export function whenText(days: number | null | undefined): string {
  if (days === null || days === undefined) return "";
  if (days < 0) return `soonest overdue by ${Math.abs(days)} days`;
  if (days === 0) return "soonest is today";
  if (days === 1) return "soonest is tomorrow";
  return `soonest in ${days} days`;
}

/**
 * What a reporter's own screen has to answer with.
 *
 * `null` for either source means IT COULD NOT BE READ, which is a
 * different fact from zero and the whole reason this takes nullables
 * rather than numbers.
 */
export interface ReporterInput {
  /** Unsent plus errored, or null when the local store could not be opened. */
  readonly unsent: number | null;
  /** Certificates lapsed or lapsing, or null when the record could not be read. */
  readonly lapsing: number | null;
  /** Courses the role requires with no record, or null when unreadable. */
  readonly gaps: number | null;
}

/**
 * WHETHER A REPORTER'S DAY IS CLEAR, AND IT REQUIRES HAVING LOOKED.
 *
 * The first version of this screen reported an unreadable OUTBOX and
 * silently swallowed an unreachable TRAINING route — which rendered as
 * no lapsing certificates and no gaps, and read as "your training is
 * fine" to somebody whose training the screen could not see.
 *
 * So an unknown is never clear. A screen whose job is to answer "is
 * everything all right" saying the most reassuring possible thing at the
 * moment it knows least is the failure this product exists to refuse,
 * and it is worse here than on the office view because the reporter is
 * the only person who can act on an unsent report.
 */
export function reporterIsClear(input: ReporterInput): boolean {
  if (input.unsent === null || input.lapsing === null || input.gaps === null) return false;
  return input.unsent === 0 && input.lapsing === 0 && input.gaps === 0;
}

/* =====================================================================
   AN EMPTY RECORD IS NOT A CLEAR ONE.

   `reporterIsClear` above already refuses to call an UNKNOWN clear, and
   the reasoning it gives is the right one: "a screen whose job is to
   answer 'is everything all right' saying the most reassuring possible
   thing at the moment it knows least is the failure this product exists
   to refuse."

   THE SAME ARGUMENT WAS NEVER EXTENDED TO EMPTY, and measured on
   18 August 2026 a brand-new operator — signed in, nothing filed, no
   indicator, nothing on the register — opened /today and read:

     Nothing needs you today
     No reporting deadline is open, no currency is lapsing, nothing is
     waiting to be triaged and no corrective action is overdue.

   Every clause of that is TRUE, and together they tell somebody who has
   done nothing at all that everything is fine. The digest is computed
   over an empty record and correctly finds nothing; the screen then
   renders the absence of findings as a clean bill of health.

   That is the understating failure this repository keeps meeting — the
   same shape as a barrier count taken over four of six records and
   presented as the operator's position. The honest reading of zero
   reports is not "no occurrences happened". It is "this operator is not
   reporting yet", which is the single most important thing a safety
   manager could be told on the day they start.
   ===================================================================== */

/**
 * What the operator has actually put into the record.
 *
 * THREE NUMBERS AND NOT A BOOLEAN, because the sequence below has to
 * know WHICH step is next, not merely that some step is. A boolean
 * `isEmpty` would collapse "has filed nothing" and "has filed reports
 * but defined no indicator" into one state, and those need different
 * screens.
 */
export interface RecordScale {
  readonly reports: number;
  readonly indicators: number;
  readonly registerEntries: number;
}

/** Where an operator is in getting started. */
export type Establishment = "EMPTY" | "STARTED" | "ESTABLISHED";

/**
 * EMPTY means nothing at all, not "few". An operator with one report is
 * reporting, and telling them how to begin would be wrong in the other
 * direction — a product that keeps offering the first step to somebody
 * who took it reads as not having noticed.
 */
export function establishment(s: RecordScale): Establishment {
  if (s.reports === 0 && s.indicators === 0 && s.registerEntries === 0) return "EMPTY";
  if (s.reports > 0 && s.indicators > 0) return "ESTABLISHED";
  return "STARTED";
}

/**
 * One step of the first fifteen minutes.
 *
 * `why` is not decoration and it is not marketing. A safety manager
 * asked to do something by a product is entitled to know which
 * obligation it answers, and this product's whole claim is that it
 * names the instrument rather than asserting authority of its own.
 */
export interface FirstRunStep {
  readonly key: "REPORT" | "INDICATOR" | "REGISTER";
  readonly does: string;
  readonly why: string;
  readonly where: string;
  readonly action: string;
}

/**
 * THE ORDER IS THE ARGUMENT, and it is not the order of the menu.
 *
 * A report first, because every other artefact in an SMS is downstream
 * of somebody telling you something. An indicator second, because
 * regulation 9(5) asks for one and because an indicator with no reports
 * behind it has nothing to count. The register third, because the first
 * hazard worth writing down is usually the one behind the first report
 * — which is only true once the report exists.
 *
 * Three steps and not eight. The instruments this product ships could
 * each claim a place here, and a list of eight is a list nobody
 * finishes; what is being sequenced is the shortest path to an SMS that
 * is genuinely running, not a tour.
 */
export const FIRST_RUN: readonly FirstRunStep[] = Object.freeze([
  Object.freeze({
    key: "REPORT" as const,
    does: "File the first report",
    why: "Everything else in a safety management system is downstream of somebody telling you something.",
    where: "/report",
    action: "Open the report form",
  }),
  Object.freeze({
    key: "INDICATOR" as const,
    does: "Define the first indicator",
    why: "Regulation 9(5) of L.N. 32 asks a service provider for indicators and targets acceptable to the Authority.",
    where: "/toolkits/spi",
    action: "Define an indicator",
  }),
  Object.freeze({
    key: "REGISTER" as const,
    does: "Put the first hazard on the register",
    why: "The hazard worth writing down first is usually the one behind the first report you filed.",
    where: "/toolkits/register",
    action: "Open the register",
  }),
]);

/**
 * The step this operator has not taken yet, or null once running.
 *
 * RETURNS THE FIRST UNMET STEP RATHER THAN A LIST OF ALL OF THEM. The
 * screen shows the whole sequence so somebody can see how short it is;
 * this names the one to do next, so the call to action is singular. A
 * screen with three equally-weighted buttons has not decided anything
 * on the reader's behalf, which is the job.
 */
export function nextStep(s: RecordScale): FirstRunStep | null {
  if (s.reports === 0) return FIRST_RUN[0]!;
  if (s.indicators === 0) return FIRST_RUN[1]!;
  if (s.registerEntries === 0) return FIRST_RUN[2]!;
  return null;
}
