// =====================================================================
// Safety performance indicators — Annex 19 element 3.1.
//
// THE ELEMENT THIS ANSWERS. "Safety performance monitoring and
// measurement": indicators with targets and alert levels, reviewed on a
// cadence, and a record of what happened the last time one was crossed.
// It is the element the coverage table has always marked as scored but
// not built, and it is the one an auditor reaches for immediately after
// the reporting queue — because a reporting system that produces no
// trend is a filing cabinet.
//
// WHAT IS ICAO'S AND WHAT IS OURS, kept apart on purpose.
//
//   ICAO's:  the vocabulary and the shape. Doc 9859 fourth edition
//            defines a safety performance indicator as a data-based
//            parameter used for monitoring and assessing safety
//            performance, a safety performance target as the planned
//            level for that indicator, and separates HIGH-CONSEQUENCE
//            indicators (accidents, serious incidents) from
//            LOWER-CONSEQUENCE ones (incidents, findings, deviations),
//            because the two need different treatment: high-consequence
//            events are too rare for a trend to mean anything month to
//            month.
//
//   THE METHOD: the alert level set from the average and the standard
//            deviation of a preceding baseline, with the three
//            crossing criteria below, is the basic statistical trending
//            method that State and industry guidance builds on. THIS
//            PRODUCT HAS NOT READ THE PRIMARY INSTRUMENT'S WORDING OF
//            IT. So it is marked `basis: "METHOD"` rather than cited to
//            a numbered provision, in the same discipline as the
//            section-level IOSA reference and the jurisdictions whose
//            deadline was not read: a precise-looking citation to a
//            document nobody opened is worse than an honest "this is
//            the standard method, and here is the arithmetic".
//
//   OURS:    the six-point baseline floor, and it is labelled as ours
//            wherever it is shown. See MIN_BASELINE.
//
// EVERYTHING IS COMPUTED. Nothing here stores a rate, an average or a
// band — charter rule 6. An indicator that carried a stored alert level
// would eventually carry one that disagreed with its own data, which is
// the failure the risk register was built to avoid and the same failure
// costs more here: an alert level nobody trusts is an alert level
// nobody acts on.
// =====================================================================

export type IndicatorKind = "HIGH_CONSEQUENCE" | "LOWER_CONSEQUENCE";

export interface IndicatorKindSpec {
  readonly key: IndicatorKind;
  readonly label: string;
  readonly definition: string;
  /** Why the two are treated differently rather than counted together. */
  readonly note: string;
  readonly examples: readonly string[];
}

export const INDICATOR_KINDS: readonly IndicatorKindSpec[] = [
  {
    key: "HIGH_CONSEQUENCE",
    label: "High consequence",
    definition:
      "Monitoring of high-consequence occurrences — accidents and serious incidents.",
    note:
      "Rare, by design. A month with none is not evidence of anything, and a month " +
      "with one is not a trend. Watched as a count against a period, not as a curve.",
    examples: [
      "Accidents per 10,000 sectors",
      "Serious incidents per 10,000 sectors",
      "Runway excursions",
    ],
  },
  {
    key: "LOWER_CONSEQUENCE",
    label: "Lower consequence",
    definition:
      "Monitoring of lower-consequence occurrences, events or activities — incidents, " +
      "non-conformance findings, deviations.",
    note:
      "Frequent enough to trend. This is where an alert level earns its keep: the " +
      "point of it is to notice the drift before the high-consequence indicator moves.",
    examples: [
      "Unstable approaches per 1,000 approaches",
      "Ground damage events per 1,000 turnarounds",
      "Technical delays per 1,000 departures",
      "Reports filed per 1,000 flight hours",
    ],
  },
];

/**
 * Which way is good.
 *
 * Most safety indicators are adverse — fewer is better — and the alert
 * level sits above the average. But some are not: reports filed per
 * 1,000 hours is a reporting-culture indicator, and a COLLAPSE in it is
 * the thing worth an alert. A tool that only ever alerted upwards would
 * stay silent through exactly the failure that matters there.
 */
export type Direction = "LOWER_IS_BETTER" | "HIGHER_IS_BETTER";

export interface Period {
  /** "2026-Q1", "March", whatever the operator's cadence is called. */
  readonly label: string;
  /** Occurrences counted in the period. */
  readonly events: number;
  /** Exposure in the period — sectors, hours, movements, turnarounds. */
  readonly exposure: number;
}

export interface Indicator {
  readonly id: string;
  readonly name: string;
  readonly kind: IndicatorKind;
  /** What the exposure counts, in the operator's words. */
  readonly exposureUnit: string;
  /** Rate basis: events per this many units of exposure. */
  readonly per: number;
  readonly direction: Direction;
  /** The safety performance target, as a rate on the same basis. */
  readonly target?: number;
  readonly owner: string;
  readonly periods: readonly Period[];
}

/**
 * THIS PRODUCT'S FLOOR, not ICAO's.
 *
 * A standard deviation computed from two points is the distance between
 * them; from three, it is whichever one was unusual. Set alert levels on
 * that and the next ordinary period trips all three criteria, the safety
 * office investigates nothing, and the alert level is dead within a
 * quarter — which is worse than not having one, because it was believed
 * once.
 *
 * Six is a judgement, stated as a judgement everywhere it is shown.
 */
export const MIN_BASELINE = 6;

/**
 * The rate for a period, on the indicator's own basis.
 *
 * Returns null on zero exposure rather than Infinity or NaN. A quarter
 * in which the fleet did not fly has no rate — it is not a rate of zero,
 * and it is certainly not the arbitrarily large number the division
 * produces. Averaging an Infinity into a baseline poisons every alert
 * level computed from it, silently.
 */
export function rate(period: Period, per: number): number | null {
  if (!Number.isFinite(period.events) || !Number.isFinite(period.exposure)) return null;
  if (period.events < 0 || period.exposure < 0) return null;
  if (period.exposure === 0) return null;
  if (!Number.isFinite(per) || per <= 0) return null;
  return (period.events / period.exposure) * per;
}

/** The rates a series yields, with the periods that have none dropped. */
export function rates(indicator: Indicator): readonly number[] {
  return (indicator.periods ?? [])
    .map((p) => rate(p, indicator.per))
    .filter((r): r is number => r !== null);
}

export function mean(xs: readonly number[]): number {
  if (!xs.length) throw new RangeError("mean of an empty series");
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Population standard deviation.
 *
 * Population rather than sample, because the baseline IS the period
 * being described — it is not a sample drawn from a larger set of
 * quarters that also happened. The choice matters at these sizes: with
 * six points the sample formula is about 10% wider, which moves every
 * alert level outward and makes the tool quieter than it should be.
 */
export function stdDev(xs: readonly number[]): number {
  if (!xs.length) throw new RangeError("standard deviation of an empty series");
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

export interface AlertLevels {
  readonly average: number;
  readonly sd: number;
  /** average ± 1σ, ± 2σ, ± 3σ — sign follows the indicator's direction. */
  readonly one: number;
  readonly two: number;
  readonly three: number;
  readonly points: number;
}

/**
 * The alert levels a baseline supports, or null and the reason why not.
 *
 * The reason is returned rather than thrown because "you do not have
 * enough history yet" is an ordinary state for a new indicator, not an
 * error — and a screen that says so is more use than one that shows a
 * confident line drawn through four points.
 */
export function alertLevels(
  baseline: readonly number[],
  direction: Direction = "LOWER_IS_BETTER",
): { levels: AlertLevels; reason: null } | { levels: null; reason: string } {
  const usable = baseline.filter((x) => Number.isFinite(x));
  if (usable.length < MIN_BASELINE) {
    return {
      levels: null,
      reason:
        `${usable.length} of ${MIN_BASELINE} periods. An alert level set from fewer is ` +
        "set by whichever period was unusual, and it will fire on the next ordinary one.",
    };
  }
  const average = mean(usable);
  const sd = stdDev(usable);
  const sign = direction === "LOWER_IS_BETTER" ? 1 : -1;
  return {
    levels: {
      average,
      sd,
      one: average + sign * sd,
      two: average + sign * 2 * sd,
      three: average + sign * 3 * sd,
      points: usable.length,
    },
    reason: null,
  };
}

export interface AlertCriterion {
  readonly id: string;
  readonly label: string;
  /** How many consecutive periods must sit beyond the level. */
  readonly consecutive: number;
  /** Which level: 1, 2 or 3 standard deviations. */
  readonly sigma: 1 | 2 | 3;
  readonly meaning: string;
}

/**
 * The three crossing criteria, in the order they are usually stated.
 *
 * They are deliberately redundant: one extreme period, a shorter run
 * further out, and a longer run closer in. A single criterion catches
 * either the spike or the drift, never both, and the drift is the one
 * that turns into the spike.
 */
export const ALERT_CRITERIA: readonly AlertCriterion[] = [
  {
    id: "single-3sd",
    label: "One period beyond 3σ",
    consecutive: 1,
    sigma: 3,
    meaning: "A single period this far out is unlikely to be ordinary variation.",
  },
  {
    id: "two-2sd",
    label: "Two consecutive beyond 2σ",
    consecutive: 2,
    sigma: 2,
    meaning: "Twice in a row, well out. One period out is noise; two is a signal.",
  },
  {
    id: "three-1sd",
    label: "Three consecutive beyond 1σ",
    consecutive: 3,
    sigma: 1,
    meaning:
      "The drift. No single period looks alarming, which is exactly why this one " +
      "goes unnoticed without a rule.",
  },
];

/** True when `value` is on the wrong side of `level` for this direction. */
function beyond(value: number, level: number, direction: Direction): boolean {
  return direction === "LOWER_IS_BETTER" ? value > level : value < level;
}

export interface WatchedPoint {
  /** Index in the full series of rates. */
  readonly index: number;
  readonly value: number;
  /** Levels computed from every period BEFORE this one. */
  readonly levels: AlertLevels;
  /** The furthest level this point sits beyond. 0 when it sits inside. */
  readonly sigma: 0 | 1 | 2 | 3;
}

/**
 * Each period judged against the history that preceded it.
 *
 * THIS IS THE WHOLE METHOD, and getting it wrong is the commonest way an
 * indicator lies. A period must be judged against levels set BEFORE it,
 * not against levels its own value helped compute. Include the watched
 * period in its own baseline and a bad quarter raises the average, the
 * alert level rises with it, and the tool reports that nothing happened
 * — an indicator that moves its own goalposts, in the direction of
 * silence, exactly when it should speak.
 *
 * The levels are recomputed for every period rather than fixed once,
 * because that is what "the alert level is set from the preceding
 * period" means when the periods keep arriving. A consequence worth
 * stating: the first MIN_BASELINE periods are never judged. There is
 * nothing yet for them to be unusual with respect to, and inventing a
 * verdict for them would be inventing the history they lack.
 */
export function watch(
  series: readonly number[],
  direction: Direction = "LOWER_IS_BETTER",
): readonly WatchedPoint[] {
  const out: WatchedPoint[] = [];
  for (let i = MIN_BASELINE; i < series.length; i += 1) {
    const { levels } = alertLevels(series.slice(0, i), direction);
    if (!levels) continue;
    const value = series[i]!;
    const sigma: 0 | 1 | 2 | 3 = beyond(value, levels.three, direction)
      ? 3
      : beyond(value, levels.two, direction)
        ? 2
        : beyond(value, levels.one, direction)
          ? 1
          : 0;
    out.push({ index: i, value, levels, sigma });
  }
  return out;
}

export interface Breach {
  readonly criterion: AlertCriterion;
  /** Index in the full series of the LAST period in the run. */
  readonly at: number;
  /** The periods involved, most recent last. */
  readonly values: readonly number[];
}

/**
 * Which criteria the watched periods trip.
 *
 * A run counts when every period in it sits beyond the criterion's
 * level — where "beyond 2σ" includes anything beyond 3σ, which is why
 * WatchedPoint carries the furthest level rather than a flag per level.
 * Without that, a period at 3.5σ followed by one at 2.5σ would not count
 * as two consecutive beyond 2σ, and the worse pair of periods would
 * report less than the milder one.
 */
export function breaches(watched: readonly WatchedPoint[]): readonly Breach[] {
  const found: Breach[] = [];
  for (const criterion of ALERT_CRITERIA) {
    for (let i = criterion.consecutive - 1; i < watched.length; i += 1) {
      const window = watched.slice(i - criterion.consecutive + 1, i + 1);
      const contiguous = window.every((p, n) => n === 0 || p.index === window[n - 1]!.index + 1);
      if (contiguous && window.every((p) => p.sigma >= criterion.sigma)) {
        found.push({
          criterion,
          at: window[window.length - 1]!.index,
          values: window.map((p) => p.value),
        });
      }
    }
  }
  return found;
}

export type TargetStatus = "MET" | "MISSED" | "NO_TARGET";

/**
 * Whether the latest period met the target.
 *
 * A target is a separate question from an alert level and the two get
 * conflated constantly. The alert level asks "has this changed?"; the
 * target asks "is this where we said it should be?". An indicator can
 * be comfortably inside its alert levels and nowhere near its target —
 * that is a stable operation performing consistently below what the
 * organisation committed to, and it is a finding, not a quiet month.
 */
export function targetStatus(
  latest: number | null,
  target: number | undefined,
  direction: Direction,
): TargetStatus {
  if (latest === null || target === undefined || !Number.isFinite(target)) return "NO_TARGET";
  const met = direction === "LOWER_IS_BETTER" ? latest <= target : latest >= target;
  return met ? "MET" : "MISSED";
}

export interface SpiVerdict {
  readonly rates: readonly number[];
  readonly latest: number | null;
  /** Levels for the LATEST period — computed from everything before it. */
  readonly levels: AlertLevels | null;
  /** Why there are no levels, when there are none. */
  readonly reason: string;
  readonly watched: readonly WatchedPoint[];
  readonly breaches: readonly Breach[];
  readonly target: TargetStatus;
  /** The single sentence the screen leads with. */
  readonly headline: string;
}

/** Everything the screen needs about one indicator, computed. */
export function spiVerdict(indicator: Indicator): SpiVerdict {
  const series = rates(indicator);
  const latest = series.length ? series[series.length - 1]! : null;
  const { levels, reason } = alertLevels(series.slice(0, -1), indicator.direction);
  const target = targetStatus(latest ?? null, indicator.target, indicator.direction);
  const watched = watch(series, indicator.direction);
  const found = breaches(watched);

  if (!levels) {
    return {
      rates: series,
      latest,
      levels: null,
      reason: reason ?? "",
      watched,
      breaches: found,
      target,
      headline:
        series.length === 0
          ? "No periods recorded yet"
          : "Recording, with no alert levels yet",
    };
  }

  /* The worst criterion tripped, and only among runs that INCLUDE the
     latest period. A breach from four quarters ago that was dealt with
     is history, not a live alert, and a screen that keeps shouting about
     it is a screen the safety office learns to scroll past. The history
     is still returned — it belongs on the chart — it just does not set
     the headline. */
  const live = found.filter((b) => b.at === series.length - 1);
  const worst = live.reduce<Breach | null>(
    (a, b) => (a === null || b.criterion.sigma > a.criterion.sigma ? b : a),
    null,
  );

  const headline = worst
    ? `Alert — ${worst.criterion.label.toLowerCase()}`
    : target === "MISSED"
      ? "Inside its alert levels, and short of its target"
      : "Inside its alert levels";

  return {
    rates: series,
    latest,
    levels,
    reason: "",
    watched,
    breaches: found,
    target,
    headline,
  };
}
