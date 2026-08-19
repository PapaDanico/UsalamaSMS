/* =====================================================================
   SUGGESTED STARTING-POINT SPIS, BY OPERATOR KIND.

   WHY THIS EXISTS. An operator defining its first indicator faces the
   same blank page the twelve elements presented — and the answer there
   was the templates registry. This module is that move for SPIs.

   THESE ARE OFFERED, NOT IMPOSED. Doc 9859 §9.1 is explicit: each
   organisation develops its own SPIs, and there is no prescriptive
   list. What the Authority's form (CAA-AC-SMS009 Appendix II) asks
   for — description, rationale, formula, limitations — is an
   operator's answer, not this product's. The starters pre-populate
   the form field by field, so the operator edits rather than invents,
   and can still clear every field and start fresh.

   THE DISTINCTION BETWEEN `kind` AND `indicatorType` IS PRESERVED.
   Doc 9859's HIGH_CONSEQUENCE / LOWER_CONSEQUENCE describes HOW RARE
   events are (and therefore how to alert). ACTIVITY vs OUTCOME is the
   Authority's field 3, a different axis: it asks whether the indicator
   measures a precursor (leading) or an occurrence (lagging). One does
   NOT imply the other for LOWER_CONSEQUENCE indicators — both leading
   and lagging examples appear below, and both are labelled explicitly
   rather than derived.

   SOURCES, READ NOT PARAPHRASED:
     · ICAO Doc 9859 4th ed., §9.1–9.3 and Appendix 4
     · Flight Safety Foundation, "Unleashing the Power of Safety
       Performance Indicators", 2016
     · EASA, ALoSP Guidance Material, 2019
   ===================================================================== */

import type { IndicatorKind, Direction, IndicatorType } from "./spi";
import type { OperatorKind } from "./pricing";

/**
 * A curated starting point for one indicator.
 *
 * Every field maps directly onto the operator's form, so the screen
 * can pre-fill and let the operator edit rather than requiring it to
 * compose from scratch. Fields that the operator must supply from their
 * own context — their data custodian, their exact area of operations
 * — are absent, and `youStillDecide` names them explicitly.
 */
export interface SpiStarter {
  /** Unique slug, never reused. */
  readonly id: string;
  /** Suggested name. The operator should rename it to match their manual. */
  readonly name: string;
  /** Doc 9859's rarity axis: how rare the events are. */
  readonly kind: IndicatorKind;
  /** Whether a lower or higher rate is the safer direction. */
  readonly direction: Direction;
  /** Authority field 3 — activity-related or outcome-related. Cannot be derived from `kind`. */
  readonly indicatorType: IndicatorType;
  /** What the denominator counts. The operator states this in their own words. */
  readonly exposureUnit: string;
  /** Rate basis: events per this many units. */
  readonly per: number;
  /** One-paragraph rationale, suitable for the form field. */
  readonly rationale: string;
  /** Formula in plain language, for Appendix II B.7. */
  readonly formula: string;
  /** Limitations the operator should state, for Appendix II B.8. */
  readonly limitations: string;
  /**
   * Which operator kinds this starter applies to.
   *
   * `"ALL"` means it is offered to every kind. An array restricts it.
   * Only applies to the operator's own configuration — the screen
   * filters, not this module.
   */
  readonly forKinds: ReadonlyArray<OperatorKind> | "ALL";
  /**
   * What the operator must still decide before this indicator means anything.
   * Never left blank — every starter has something the operator supplies.
   */
  readonly youStillDecide: string;
  /** The source the rationale and formula are drawn from. */
  readonly source: string;
}

/**
 * THE STARTER LIST.
 *
 * Ordered: leading indicators before lagging ones within each group,
 * because a new operator building a programme should begin with what
 * it can see before it happens, not only with what it can count
 * after.
 *
 * HIGH_CONSEQUENCE is listed last within each group: it needs the most
 * baseline before alerting is meaningful, and LOWER_CONSEQUENCE
 * indicators reach the minimum-six-period floor sooner.
 */
export const SPI_STARTERS: ReadonlyArray<SpiStarter> = Object.freeze([
  // ------------------------------------------------------------------
  // VOLUNTARY REPORTING RATE — the one every new programme should start
  // ------------------------------------------------------------------
  Object.freeze({
    id: "voluntary-reports-per-pilot-quarter",
    name: "Voluntary reports per pilot per quarter",
    kind: "LOWER_CONSEQUENCE",
    direction: "HIGHER_IS_BETTER",
    indicatorType: "ACTIVITY",
    exposureUnit: "pilot-quarters",
    per: 1,
    rationale:
      "Reporting culture is a leading indicator of safety margin. FSF research finds " +
      "that report rates drop in the quarters before a major occurrence sequence; a " +
      "sustained high rate is evidence that people are filing and not hiding. Doc 9859 " +
      "§9.1.2 places reporting rate among the first indicators a programme should " +
      "establish. It requires no special data source — the report count is already held.",
    formula:
      "Voluntary reports filed in the quarter ÷ pilot-quarters in the same period. " +
      "Pilot-quarters = (sum of each pilot's months employed in the quarter) ÷ 3. " +
      "Count only voluntary reports, not MOR: a mandatory report is a legal act, " +
      "not an indicator of proactive culture.",
    limitations:
      "A drop in rate may mean improved safety or reduced trust in the system — the " +
      "two cannot be separated from the number alone. Investigate a decline before " +
      "acting on it. Exclude probationary periods from the denominator if staff " +
      "turnover is high.",
    forKinds: ["AOC", "RPAS"] as ReadonlyArray<OperatorKind>,
    youStillDecide:
      "Who counts as a pilot for this indicator (line pilots only, or trainees and " +
      "check-and-training pilots too), and how you will compute pilot-quarters when " +
      "someone leaves mid-quarter.",
    source:
      "FSF, \"Unleashing the Power of Safety Performance Indicators\", 2016; " +
      "ICAO Doc 9859 4th ed., §9.1.2.",
  }),

  // ------------------------------------------------------------------
  // TIME TO CLOSURE — the indicator the transition record was built for
  // ------------------------------------------------------------------
  Object.freeze({
    id: "days-to-first-closure",
    name: "Median days from receipt to first closure",
    kind: "LOWER_CONSEQUENCE",
    direction: "LOWER_IS_BETTER",
    indicatorType: "OUTCOME",
    exposureUnit: "reports closed",
    per: 1,
    rationale:
      "An occurrence report that has not been dispositioned is an unfulfilled " +
      "investigation obligation. Doc 9859 §8.3 requires that every report is reviewed " +
      "and findings recorded; a growing queue with no closures is the filing-cabinet " +
      "failure those words were written about. Median rather than mean because a " +
      "single complex investigation extending over months should not pull the average " +
      "away from the typical experience.",
    formula:
      "For each report closed this quarter: days from createdAt to the FIRST closure " +
      "transition, rounded to the nearest day. Report the median of that distribution. " +
      "Use first closure only — a report closed on day 3, reopened, and reclosed on " +
      "day 45 took three days to close; the reopening is a separate event.",
    limitations:
      "Counts only reports that reached closure. A persistently low median alongside " +
      "a large untriaged backlog is a misleading positive: the queue may be moving " +
      "fast on simple cases while complex ones age. Track alongside the untriaged count " +
      "in the daily digest.",
    forKinds: "ALL",
    youStillDecide:
      "What your target is. Industry guidance is 30–90 days for a voluntary report " +
      "with no investigation; an occurrence requiring investigation has no universal " +
      "standard and your AOC conditions may specify one.",
    source:
      "ICAO Doc 9859 4th ed., §8.3; EASA ALoSP Guidance Material, 2019, §3.4.",
  }),

  // ------------------------------------------------------------------
  // MRO — maintenance quality
  // ------------------------------------------------------------------
  Object.freeze({
    id: "first-attempt-check-pass-rate",
    name: "First-attempt check pass rate",
    kind: "LOWER_CONSEQUENCE",
    direction: "HIGHER_IS_BETTER",
    indicatorType: "ACTIVITY",
    exposureUnit: "checks completed",
    per: 100,
    rationale:
      "Rework is maintenance safety's most direct leading indicator: a task that " +
      "has to be done twice was done wrong once. A declining pass rate surfaces a " +
      "competence gap, a tooling problem or a workload issue before an unsafe release. " +
      "First-attempt is the measure because a check that passes on the second attempt " +
      "after a hint is not a pass.",
    formula:
      "Checks that passed on the first attempt ÷ total checks completed × 100. " +
      "Define 'check' consistently: an inspection card sign-off, an RTS check — " +
      "whichever your quality system already counts. Count by work order, not by line.",
    limitations:
      "The denominator is the checks your quality system records, not every maintenance " +
      "act. A shop that records fewer checks will appear better. Define the scope in the " +
      "indicator definition before the first period, and hold it.",
    forKinds: ["MRO"] as ReadonlyArray<OperatorKind>,
    youStillDecide:
      "Which check types enter the denominator, who signs the pass or fail, and " +
      "whether training checks are included (they should not be — a trainee under " +
      "supervision failing a first attempt is not a quality system defect).",
    source:
      "EASA ALoSP Guidance Material, 2019, §3.4; FSF, \"Unleashing the Power of " +
      "Safety Performance Indicators\", 2016.",
  }),

  // ------------------------------------------------------------------
  // MEL — operational risk in maintenance
  // ------------------------------------------------------------------
  Object.freeze({
    id: "mel-deferral-age-days",
    name: "Average MEL deferral open days",
    kind: "LOWER_CONSEQUENCE",
    direction: "LOWER_IS_BETTER",
    indicatorType: "OUTCOME",
    exposureUnit: "deferrals closed",
    per: 1,
    rationale:
      "How long an MEL item stays open is a proxy for whether the deferral process " +
      "is functioning as a safety valve or as a delay mechanism. An MEL exists to " +
      "allow dispatch with an inoperative item within approved limits; a deferral " +
      "that exceeds those limits on average is an indicator that the limits are not " +
      "being treated as limits.",
    formula:
      "For each MEL deferral closed this quarter: the number of days from the " +
      "deferral date to the rectification date. Average across all deferrals closed " +
      "in the period. Exclude items deferred under a fleet relief extension if those " +
      "are tracked separately.",
    limitations:
      "Depends on your MEL deferred-defect log being up to date. An average below " +
      "the limit does not mean no item exceeded it — check the distribution alongside " +
      "the mean. Does not distinguish Category A, B, C, D deferrals; stratify if one " +
      "category is driving the average.",
    forKinds: ["AOC"] as ReadonlyArray<OperatorKind>,
    youStillDecide:
      "Whether to compute per-category or overall, and how to handle fleet-wide " +
      "relief items that are managed at operator level rather than aircraft level.",
    source:
      "ICAO Doc 9859 4th ed., Appendix 4; FSF, \"Unleashing the Power of Safety " +
      "Performance Indicators\", 2016.",
  }),

  // ------------------------------------------------------------------
  // HIGH-CONSEQUENCE RATE — for AOC operators with enough movements
  // ------------------------------------------------------------------
  Object.freeze({
    id: "high-risk-occurrence-rate-per-1000-movements",
    name: "High-risk category occurrence rate per 1,000 movements",
    kind: "HIGH_CONSEQUENCE",
    direction: "LOWER_IS_BETTER",
    indicatorType: "OUTCOME",
    exposureUnit: "movements",
    per: 1000,
    rationale:
      "An operator whose SPIs include only LOWER_CONSEQUENCE indicators cannot " +
      "demonstrate to the Authority that it is measuring the events with the highest " +
      "consequence potential. Doc 9859 §9.2 requires SPIs to span the safety " +
      "performance spectrum. The numerator is an ADREP occurrence category count — " +
      "RE, RI, LOC-I, MAC, CFIT or ARC — already tagged at disposition and not typed " +
      "separately.",
    formula:
      "Occurrences in this period coded to one of the six ICAO high-risk categories " +
      "(RE, RI, LOC-I, MAC, CFIT, ARC) ÷ movements in the same period × 1,000. " +
      "Movements = departures + arrivals. Count an occurrence once even if it meets " +
      "multiple categories.",
    limitations:
      "A low rate at small fleet sizes is statistically unreliable: an operator with " +
      "500 movements per quarter needs six or more periods before alert levels are " +
      "meaningful. Show the raw event count alongside the rate. Note that CICTT " +
      "coding in this product carries the caveat that definitions have not been " +
      "verified against the primary instrument.",
    forKinds: ["AOC", "HELIPORT"] as ReadonlyArray<OperatorKind>,
    youStillDecide:
      "Whether to include all six ICAO high-risk categories or only those relevant " +
      "to your operations (a VFR-only operator may have no CFIT exposure), and how " +
      "you count movements if your ops log records cycles rather than movements.",
    source:
      "ICAO Doc 9859 4th ed., §9.2 and Appendix 4; Kenya National Aviation Safety " +
      "Plan 2023–2025, §5.",
  }),

  // ------------------------------------------------------------------
  // RPAS / HELIPORT — operations-based rate
  // ------------------------------------------------------------------
  Object.freeze({
    id: "occurrence-rate-per-100-operations",
    name: "Reportable occurrence rate per 100 operations",
    kind: "HIGH_CONSEQUENCE",
    direction: "LOWER_IS_BETTER",
    indicatorType: "OUTCOME",
    exposureUnit: "operations",
    per: 100,
    rationale:
      "Movements are the natural denominator for fixed-wing operations, but RPAS " +
      "and helipad operations are better measured per flight operation or sortie. " +
      "A reportable occurrence — one that would trigger an MOR — is the threshold " +
      "KCAA's own form uses, which aligns this indicator with the legal definition " +
      "rather than with an internal severity scale.",
    formula:
      "Occurrences that meet the MOR threshold this period ÷ operations in the " +
      "same period × 100. An operation is one sortie or flight. Count occurrences " +
      "on the same event-count basis as voluntary reports — a single event is one " +
      "occurrence even if it generates multiple reports.",
    limitations:
      "Requires a consistent definition of 'operation' that is logged and retrievable. " +
      "A small number of operations per period makes any non-zero rate appear alarming; " +
      "the raw count is more informative until the denominator exceeds 200.",
    forKinds: ["RPAS", "HELIPORT"] as ReadonlyArray<OperatorKind>,
    youStillDecide:
      "Whether to count ground operations (taxi and pre-flight) as part of the " +
      "operation or whether an operation begins at power-on for take-off.",
    source:
      "ICAO Doc 9859 4th ed., §9.1; EASA ALoSP Guidance Material, 2019, §3.4.",
  }),
]);

/**
 * Starters applicable to a given operator kind.
 *
 * Returns all starters when `kind` is not provided, so the route can
 * decide how to filter rather than this module encoding a routing rule.
 * The array returned is stable-sorted by `id`.
 */
export function startersFor(kind?: OperatorKind | null): ReadonlyArray<SpiStarter> {
  if (!kind) return SPI_STARTERS;
  return SPI_STARTERS.filter(
    (s) => s.forKinds === "ALL" || (s.forKinds as ReadonlyArray<OperatorKind>).includes(kind),
  );
}
