/* =====================================================================
   FATIGUE, AND THE OBLIGATION THAT APPLIES TO EVERY OPERATOR HERE.

   ---------------------------------------------------------------
   THE DEFECT THIS CLOSES WAS MEASURABLE IN THREE LINES.

   `FATIGUE` appeared in exactly three places in this repository: the
   `ReportType` enum in schema.prisma, a label in taxonomy.ts, and
   `ReportTypeEnum` in index.ts. Nothing read it. A crew member could
   file a fatigue report and it landed in the queue as an
   indistinguishable row — no fatigue-specific question asked, nothing
   aggregated, nothing that could ever become a finding.

   The literature names that exact failure. Reviews of fatigue
   management practice describe a policy-practice gap "in closing the
   loop from fatigue reports to corrective action". This product had
   the open half of that loop and none of the closing half.

   ---------------------------------------------------------------
   WHY THIS IS NOT AN FRMS, AND MUST NOT CLAIM TO BE.

   Annex 6 gives a State two routes, and an operator is on one of them:

     PRESCRIPTIVE  the operator stays inside flight time, flight duty
                   period, duty period and rest limits set by its
                   regulator, AND manages fatigue hazards using the SMS
                   processes already in place for other hazards;
     FRMS          the operator runs a fatigue risk management system
                   delivering an equivalent level of safety, which
                   requires the EXPLICIT APPROVAL of the State and whose
                   required elements are themselves prescribed.

   Every operator this product is built for — three to fifteen aircraft
   — is on the first route. An FRMS is a State-approved undertaking with
   its own data collection, scientific analysis and safety assurance;
   selling one to a fifteen-aircraft charter operator would be selling
   something they can neither hold nor need.

   So this module serves the SECOND HALF OF THE PRESCRIPTIVE ROUTE —
   "manages fatigue hazards using the SMS processes" — which is a
   standing obligation, applies to every one of our customers, and is
   precisely what an SMS product is for. Competitors ship a rostering
   compliance module and call it FRMS. This shows what the reports say.

   ---------------------------------------------------------------
   THE LIMITS ARE THE OPERATOR'S, AND THAT IS NOT A SHORTCUT.

   THIS MODULE SHIPS NO FLIGHT-TIME TABLE FOR ANY STATE, and the reason
   is the sentence cictt.ts already carries: a limit table nobody has
   read the instrument for is the one kind of wrong this product cannot
   ship. Kenya's flight and duty time limitations were searched for and
   the numbers did not come back; `kcaa.or.ke` is blocked at the egress
   proxy, so the instrument could not be opened either.

   Writing plausible numbers anyway would have produced a screen that
   tells an operator it is legal when it is not.

   So the operator DECLARES the limits that bind it, and names the
   instrument they come from. That is honest, it is the same shape as
   the tolerability-authority decision in tenant configuration, and it
   is strictly better than a table for three reasons: an operator whose
   AOC conditions are tighter than the regulation gets measured against
   what actually binds it; an operator whose operations manual commits
   to more than the law gets held to its own commitment; and an operator
   outside Kenya is served on the day it signs up.

   ---------------------------------------------------------------
   WHAT IS VERIFIED HERE AND WHAT IS NOT.

   The framework above was assembled from secondary sources — published
   summaries of Annex 6 4.10 and Appendix 7, guidance material citing
   Doc 9966, and industry fatigue management guides. The primary
   documents were NOT read: `icao.int` is blocked at the egress proxy,
   as recorded in CLAUDE.md.

   `FATIGUE_VERIFIED_AGAINST_PRIMARY` is therefore false, exactly as
   `CICTT_VERIFIED_AGAINST_PRIMARY` is false and for the same reason.
   Nothing in this module states a legal limit, which is what keeps that
   flag from being load-bearing: the operator supplies every number.
   ===================================================================== */

import type { RegulatorySourceLevel } from "./regulatory-source";

/** The instruments this module reasons about, named so a reader can check. */
export const FATIGUE_SOURCES = [
  "ICAO Annex 6, Part I, 4.10 and Appendix 7 — fatigue management",
  "ICAO Doc 9966, Manual for the Oversight of Fatigue Management Approaches",
] as const;

/**
 * Whether this product has read those primary documents. FALSE.
 *
 * Flip it only when somebody has them open beside this file. Note that
 * nothing here asserts a legal limit — the operator declares those — so
 * this flag governs the FRAMEWORK description, not any number a crew
 * member is measured against.
 */
export const FATIGUE_VERIFIED_AGAINST_PRIMARY = false;
export const FATIGUE_LIMIT_SOURCE_LEVEL: RegulatorySourceLevel = "OPERATOR_DECLARED";

/* ------------------------------------------------------------------
   THE SCALE, QUOTED.

   Samn-Perelli is the seven-point subjective fatigue scale most
   commonly used in aviation, which matters here for one reason: a crew
   member's own rating is comparable across reports only if everybody
   rated on the same scale. A free-text "how tired were you" produces
   prose nobody can trend.

   THE THRESHOLD IS THE AUTHORS', NOT OURS. Samn and Perelli classified
   5 and 6 as moderate-to-severe fatigue with some performance
   impairment possibly occurring, and considered flying duties at that
   level permissible but not recommended. That is where the alert sits,
   and it is cited rather than chosen so nobody has to defend a number
   this product invented.
   ------------------------------------------------------------------ */
export const SAMN_PERELLI = [
  { level: 1, label: "Fully alert, wide awake" },
  { level: 2, label: "Very lively, responsive, but not at peak" },
  { level: 3, label: "Okay, somewhat fresh" },
  { level: 4, label: "A little tired, less than fresh" },
  { level: 5, label: "Moderately tired, let down" },
  { level: 6, label: "Extremely tired, very difficult to concentrate" },
  { level: 7, label: "Completely exhausted, unable to function effectively" },
] as const;

/** From this level up, the authors describe possible performance impairment. */
export const SAMN_PERELLI_IMPAIRMENT_FROM = 5;

export const SAMN_PERELLI_SOURCE =
  "Samn and Perelli, seven-point subjective fatigue checklist, as used " +
  "throughout aviation fatigue research. Levels 5 and 6 are described by " +
  "the authors as moderate to severe fatigue with some performance " +
  "impairment possibly occurring — flying duties permissible but not " +
  "recommended.";

/* ------------------------------------------------------------------
   THE WINDOW OF CIRCADIAN LOW.

   Roughly 02:00 to 06:00 in the body clock's own time, the daily low
   point in core body temperature, when sleepiness is greatest. It is
   reported as a CONTRIBUTING FACTOR and never as a verdict: a duty
   touching the WOCL is not a breach of anything, it is a reason a
   report from that duty deserves more weight than its raw count.

   LOCAL TIME, NOT UTC, and this is the trap. The window is a property
   of the person's body clock, and a crew member acclimatised to
   Nairobi carries Nairobi's window into a duty logged in UTC. The
   caller passes the local hour; this module does not guess it.
   ------------------------------------------------------------------ */
export const WOCL_START_HOUR = 2;
export const WOCL_END_HOUR = 6;

/** Did a duty spanning these local hours touch the window of circadian low? */
export function touchesWocl(startHour: number, endHour: number): boolean {
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return false;
  const hours: number[] = [];
  let h = Math.trunc(startHour) % 24;
  const end = Math.trunc(endHour) % 24;
  /* Walks the duty hour by hour so a duty crossing midnight is handled
     by the same code as one that does not — the alternative is two
     range comparisons and a sign error nobody notices until a night
     sector reports clean. 24 iterations is the cap: a duty longer than
     a day touches every hour there is. */
  for (let i = 0; i < 24; i++) {
    hours.push(h);
    if (h === end) break;
    h = (h + 1) % 24;
  }
  return hours.some((x) => x >= WOCL_START_HOUR && x < WOCL_END_HOUR);
}

/* ------------------------------------------------------------------
   WHAT THE OPERATOR DECLARES.

   Four numbers and the instrument they come from. Every one is
   OPTIONAL, because an operator part-way through writing its
   operations manual should be able to declare what it knows and leave
   the rest blank rather than invent a figure to satisfy a form — and
   because a blank is reported as "not declared" rather than silently
   treated as unlimited.
   ------------------------------------------------------------------ */
export interface DeclaredLimits {
  /** Maximum flight time in one duty, hours. */
  readonly maxFlightTimeHours?: number | null;
  /** Maximum flight duty period, hours. */
  readonly maxDutyHours?: number | null;
  /** Minimum rest before a duty, hours. */
  readonly minRestHours?: number | null;
  /** Maximum flight time in any 7 consecutive days, hours. */
  readonly maxFlightTime7DaysHours?: number | null;
  /**
   * The instrument these come from, in the operator's own words —
   * "KCAR 2025 Operation of Aircraft, Eighth Schedule", "OM-A 7.1",
   * "AOC condition 4". REQUIRED when any number is set, because a limit
   * with no source is a number somebody typed.
   */
  readonly instrument?: string | null;
}

/** Has the operator declared anything at all? */
export function hasDeclaredLimits(limits: DeclaredLimits | null | undefined): boolean {
  if (!limits) return false;
  return [
    limits.maxFlightTimeHours,
    limits.maxDutyHours,
    limits.minRestHours,
    limits.maxFlightTime7DaysHours,
  ].some((n) => typeof n === "number" && Number.isFinite(n) && n > 0);
}

/** What a crew member reported about the duty they were tired on. */
export interface DutyFacts {
  readonly flightTimeHours?: number | null;
  readonly dutyHours?: number | null;
  readonly restBeforeHours?: number | null;
  readonly sectors?: number | null;
  /** Sleep in the 24 hours before the duty started, hours. */
  readonly sleepPrior24Hours?: number | null;
  readonly startLocalHour?: number | null;
  readonly endLocalHour?: number | null;
  /** Samn-Perelli, 1..7. */
  readonly samnPerelli?: number | null;
}

export type FatigueVerdict =
  /** The operator has not said what binds it, so nothing can be compared. */
  | "NO_LIMITS_DECLARED"
  /** The report did not carry enough about the duty to compare. */
  | "INCOMPLETE"
  /** The duty broke a limit the operator declared for itself. */
  | "EXCEEDED_DECLARED"
  /** The duty was inside every declared limit, and somebody was still too tired. */
  | "WITHIN_DECLARED";

export interface FatigueAssessment {
  readonly verdict: FatigueVerdict;
  /** Which declared limits the duty went past, named. */
  readonly exceeded: readonly string[];
  /** Circumstances that raise the weight of this report, never a verdict. */
  readonly factors: readonly string[];
  /** True when the crew member rated at or above the impairment threshold. */
  readonly impairmentReported: boolean;
  /** The sentence the screen shows. */
  readonly headline: string;
}

/**
 * WHAT THIS FUNCTION IS ACTUALLY FOR, and it is not compliance.
 *
 * The valuable answer is `WITHIN_DECLARED`: a duty that stayed inside
 * every limit the operator set for itself, flown by somebody who then
 * filed a fatigue report. That is the finding the whole prescriptive
 * approach cannot produce on its own — limits are a blunt instrument,
 * and a report from inside them is the evidence that this operator's
 * limits are not protecting this operation.
 *
 * `EXCEEDED_DECLARED` matters too and is the lesser finding, because a
 * broken limit already has an owner and a process. The one that gets
 * missed is the compliant duty that still hurt somebody.
 */
export function assess(
  duty: DutyFacts,
  limits: DeclaredLimits | null | undefined,
): FatigueAssessment {
  const num = (n: unknown): number | null =>
    typeof n === "number" && Number.isFinite(n) ? n : null;

  const sp = num(duty.samnPerelli);
  const impairmentReported = sp !== null && sp >= SAMN_PERELLI_IMPAIRMENT_FROM;

  /* Factors are computed whatever the verdict — a report with no duty
     figures at all still tells you somebody rated themselves a 6. */
  const factors: string[] = [];
  const startH = num(duty.startLocalHour);
  const endH = num(duty.endLocalHour);
  if (startH !== null && endH !== null && touchesWocl(startH, endH)) {
    factors.push("Duty ran through the window of circadian low (02:00–06:00 local)");
  }
  const sleep = num(duty.sleepPrior24Hours);
  if (sleep !== null && sleep < 6) {
    factors.push(`Under six hours of sleep in the 24 hours before duty (${sleep})`);
  }
  const sectors = num(duty.sectors);
  if (sectors !== null && sectors >= 6) {
    factors.push(`${sectors} sectors in one duty`);
  }
  if (impairmentReported) {
    factors.push(
      `Rated ${sp} of 7 on Samn-Perelli, at or above the level its authors ` +
      "describe as possible performance impairment",
    );
  }

  if (!hasDeclaredLimits(limits)) {
    return {
      verdict: "NO_LIMITS_DECLARED",
      exceeded: [],
      factors,
      impairmentReported,
      headline:
        "No duty limits are recorded for this operator, so this report cannot be " +
        "read against them. Declare the limits that bind you and the instrument " +
        "they come from.",
    };
  }

  const l = limits!;
  const exceeded: string[] = [];
  const compare = (
    actual: number | null,
    limit: number | null | undefined,
    over: boolean,
    name: string,
    unit: string,
  ) => {
    const lim = num(limit);
    if (actual === null || lim === null || lim <= 0) return false;
    const breached = over ? actual > lim : actual < lim;
    if (breached) exceeded.push(`${name}: ${actual}${unit} against a declared ${lim}${unit}`);
    return true;
  };

  /* COMPARABLE, not merely present. A duty carrying only a sector count
     against limits expressed in hours is INCOMPLETE rather than
     "within" — the second is a claim, and this has none of the facts
     that claim rests on. */
  const comparisons = [
    compare(num(duty.flightTimeHours), l.maxFlightTimeHours, true, "Flight time", "h"),
    compare(num(duty.dutyHours), l.maxDutyHours, true, "Duty period", "h"),
    compare(num(duty.restBeforeHours), l.minRestHours, false, "Rest before duty", "h"),
  ];

  if (!comparisons.some(Boolean)) {
    return {
      verdict: "INCOMPLETE",
      exceeded: [],
      factors,
      impairmentReported,
      headline:
        "This report does not carry enough about the duty to read it against " +
        "the declared limits. The safety office can add the figures when it " +
        "speaks to the reporter.",
    };
  }

  if (exceeded.length) {
    return {
      verdict: "EXCEEDED_DECLARED",
      exceeded,
      factors,
      impairmentReported,
      headline:
        "This duty went past a limit this operator declared for itself. That is " +
        "a finding with an owner as well as a hazard.",
    };
  }

  return {
    verdict: "WITHIN_DECLARED",
    exceeded: [],
    factors,
    impairmentReported,
    headline:
      "This duty was inside every declared limit and somebody was still too " +
      "tired to fly it safely. Staying within the limits is what makes this " +
      "report worth reading, not what settles it.",
  };
}

/**
 * THE CAVEAT THAT TRAVELS WITH EVERY FATIGUE SCREEN.
 *
 * The same discipline as the SSP roll-up and the maturity ladder: say
 * what this is not, on the screen, rather than in a footnote nobody
 * opens. An operator must not read a green fatigue page as evidence
 * that it holds an FRMS, because it does not and cannot without its
 * State's approval.
 */
export const FATIGUE_CAVEAT =
  "This is fatigue hazard management inside your safety management system, " +
  "which is what the prescriptive route asks of you alongside staying inside " +
  "your duty limits. It is not a Fatigue Risk Management System: an FRMS is " +
  "a separate undertaking that your authority has to approve. Nothing here " +
  "checks your limits against the law — the limits compared are the ones you " +
  "declared, from the instrument you named.";
