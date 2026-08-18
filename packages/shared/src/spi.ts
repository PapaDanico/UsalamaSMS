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
//            method that State and industry guidance builds on.
//
//            THIS PARAGRAPH USED TO SAY THE PRIMARY INSTRUMENT'S
//            WORDING HAD NOT BEEN READ, and to mark the method as
//            uncited for that reason — the same discipline as the
//            jurisdictions whose deadline was not read, because a
//            precise-looking citation to a document nobody opened is
//            worse than an honest "this is the standard method, and
//            here is the arithmetic".
//
//            IT HAS NOW BEEN READ. KCAA Advisory Circular
//            CAA-AC-SMS009 (January 2023), paragraph 8.5:
//
//              "One method for setting out-of-limits trigger criteria
//               for SPTs is the use of the population standard
//               deviation (STDEVP) principle. This method derives the
//               standard deviation (SD) value based on the preceding
//               historical data points of a given safety indicator.
//               The SD value plus the average (mean) value of the
//               historical data set forms the basic trigger value for
//               the next monitoring period."
//
//            That is this implementation, in the Authority's words,
//            including the detail the code below already argued for on
//            statistical grounds and could not previously attribute:
//            POPULATION standard deviation, not sample. See stdDev.
//
//            §8.7 is the sentence a screen showing a breach must not
//            contradict: "An SPI being triggered is not necessarily
//            catastrophic or an indication of failure. It is merely a
//            sign that the activity has moved beyond the predetermined
//            limit."
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
/* =====================================================================
   WHERE AN OPERATOR ACTUALLY SUBMITS THESE, and the premise that was
   wrong.

   THE TASK THIS ANSWERS ASKED US TO CHECK THE EXPORT AGAINST "KCAA'S
   eSERVICES SUBMISSION SHAPE", and that is not where SPIs go. The
   portal carries six services — `ESERVICES_SERVICES` in circulars.ts
   enumerates them — and NONE is an indicator submission. The two this
   product already cites, mandatory occurrence reporting and voluntary
   reporting, are both about individual OCCURRENCES. The indicator submission is a
   FORM IN A CIRCULAR THIS FILE ALREADY QUOTES: Appendix II of
   CAA-AC-SMS009, the same document §8.4 and §8.5 above come from.

   Months of work could have gone into matching a portal that was never
   the destination. That is worth more than the finding itself: the
   destination for a regulatory artefact is named in the instrument,
   and looking for it in a portal is looking in the wrong kind of
   place.

   TWO THINGS ABOUT THE PROCESS THAT CHANGE WHAT THIS PRODUCT SHOULD
   MODEL, both corroborated from search-level renderings of the
   circular and NEITHER read from the document itself:

     · SPIs ARE AGREED IN ADVANCE, NOT MERELY REPORTED. The service
       provider submits its indicators on the Appendix II form — State
       and organisation-specific alike — the Authority reviews them,
       and issues an ACCEPTANCE LETTER once agreed. So an indicator has
       a standing with the regulator that this product does not model
       at all: proposed, accepted, or neither.

     · THERE IS AN ANNUAL REPORTING CYCLE whose submission dates the
       Authority publishes. A deadline this product could run a
       countdown against — and must not, until somebody has read the
       dates from the instrument rather than from a search result.
       That is the same line fatigue.ts draws and for the same reason.

   WHAT IS STILL UNREAD IS THE FORM ITSELF — which columns Appendix II
   asks for, in what order, with what units. Nothing here guesses at
   them, because a submission shape assembled from a plausible guess is
   the one kind of wrong that costs an operator its acceptance letter.
   The document is public at kcaa.or.ke and this environment's egress
   proxy refuses that host; the route is the one the ICAAS manual took.
   ===================================================================== */

/** Where indicators are submitted, corrected from the eServices assumption. */
export const SPI_SUBMISSION_INSTRUMENT =
  "KCAA Advisory Circular CAA-AC-SMS009 (January 2023), Appendix II — the indicator " +
  "form a service provider submits for both State and organisation-specific SPIs.";

/** The regulator's side of the loop, which this product does not yet model. */
export const SPI_SUBMISSION_LOOP: readonly string[] = Object.freeze([
  "The service provider completes the Appendix II form for its SPIs and SPTs.",
  "The Authority reviews them and agrees them with the service provider.",
  "The Authority issues an acceptance letter, after which the indicator set is the agreed one.",
  "Performance is then reported on the Authority's annual cycle, on dates it publishes.",
]);

/**
 * FALSE, and it governs what any screen may say. The columns of
 * Appendix II have not been read, so this product prepares the
 * arithmetic and does not claim to produce the Authority's form.
 */
export const SPI_SUBMISSION_SHAPE_VERIFIED = false;

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

/**
 * A comparable position for a period label, or null when it has none.
 *
 * WHY THIS EXISTS. The whole method rests on judging each period against
 * the periods BEFORE it, and the screen defined "before" as the order
 * somebody typed things in. Back-fill last year's quarters after this
 * year's, or enter one twice, and every alert level, every band and the
 * alerting count are computed from the wrong baseline — presented with
 * exactly the same confidence as a correct one.
 *
 * WHY IT RETURNS NULL RATHER THAN GUESSING. A label is whatever the
 * operator's cadence is called. "2026-Q3" has an unambiguous position;
 * "March" does not — sorted alphabetically it precedes "May", which is
 * wrong, and a guard that rejects legitimate input is worse than the
 * defect it replaces. So only the shapes that are genuinely ordered are
 * ordered, and everything else is left to the caller to handle honestly
 * rather than confidently.
 *
 * Recognised: YYYY, YYYY-Qn, YYYYQn, YYYY-MM, YYYY-MM-DD, with an
 * optional space instead of the hyphen.
 */
export function periodOrder(label: string): number | null {
  const t = label.trim().toUpperCase().replace(/\s+/g, "-");

  const quarter = /^(\d{4})-?Q([1-4])$/.exec(t);
  if (quarter) return Number(quarter[1]) * 10000 + Number(quarter[2]) * 250;

  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (day) {
    const m = Number(day[2]);
    const d = Number(day[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return Number(day[1]) * 10000 + m * 100 + d;
  }

  const month = /^(\d{4})-(\d{2})$/.exec(t);
  if (month) {
    const m = Number(month[2]);
    if (m < 1 || m > 12) return null;
    return Number(month[1]) * 10000 + m * 100;
  }

  const year = /^(\d{4})$/.exec(t);
  if (year) return Number(year[1]) * 10000;

  return null;
}

/**
 * The calendar window a period label covers, or null.
 *
 * WHY THIS EXISTS. The indicator screen asks an operator to type an
 * EVENT COUNT, and the reports those events came from are already in
 * the database. That is the "indicators are typed, not fed" debt, and
 * it has been recorded as one since the register was server-backed.
 *
 * WHAT IT DOES NOT DO, and this is the whole design. It does not make
 * the count authoritative. An indicator counts a PARTICULAR thing —
 * unstable approaches, MEL deferrals, ground damage — and the number of
 * reports filed in a quarter is not that thing unless the operator says
 * it is. So this resolves a label to a window, the API counts reports
 * in it, and the screen OFFERS the figure beside the field with the
 * caveat attached. Filling it in silently would replace a transcription
 * error with a category error, which is worse because it looks right.
 *
 * ONLY THE LABELS periodOrder() ALREADY UNDERSTANDS. A free-form
 * cadence — "Winter ops", "Rotation 4" — returns null and the screen
 * says it cannot count for that label rather than guessing at one.
 *
 * INCLUSIVE OF `from`, EXCLUSIVE OF `to`, which is how a half-open
 * range avoids double-counting the boundary between two consecutive
 * periods. A report filed at midnight on 1 April belongs to Q2 and to
 * Q2 only.
 */
export function periodWindow(label: string): { from: Date; to: Date } | null {
  const t = label.trim().toUpperCase().replace(/\s+/g, "-");
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

  const quarter = /^(\d{4})-?Q([1-4])$/.exec(t);
  if (quarter) {
    const y = Number(quarter[1]);
    const q = Number(quarter[2]);
    return { from: utc(y, (q - 1) * 3, 1), to: utc(y, q * 3, 1) };
  }

  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (day) {
    const y = Number(day[1]), m = Number(day[2]), d = Number(day[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return { from: utc(y, m - 1, d), to: utc(y, m - 1, d + 1) };
  }

  const month = /^(\d{4})-(\d{2})$/.exec(t);
  if (month) {
    const y = Number(month[1]), m = Number(month[2]);
    if (m < 1 || m > 12) return null;
    return { from: utc(y, m - 1, 1), to: utc(y, m, 1) };
  }

  const year = /^(\d{4})$/.exec(t);
  if (year) {
    const y = Number(year[1]);
    return { from: utc(y, 0, 1), to: utc(y + 1, 0, 1) };
  }

  return null;
}

export type PeriodRefusal =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * Whether a period may be appended to the ones already recorded.
 *
 * Two refusals, and they are deliberately different in kind.
 *
 * A DUPLICATE LABEL is always wrong — the same quarter entered twice
 * double-counts it into the baseline and shifts every level. That test
 * needs no understanding of the label at all, so it always applies.
 *
 * OUT OF SEQUENCE is refused only where both labels have a position
 * periodOrder() can see. Where they do not, this returns ok and the
 * screen says plainly that the order shown is the order used — an honest
 * "we cannot check this" beats a confident rejection of a cadence the
 * operator actually uses.
 */
export function canAppendPeriod(
  existing: readonly Period[],
  label: string,
): PeriodRefusal {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, reason: "A period needs a label." };

  const clash = existing.find((p) => p.label.trim().toLowerCase() === trimmed.toLowerCase());
  if (clash) {
    return {
      ok: false,
      reason:
        `${clash.label} is already recorded. Entering it twice counts it twice into the ` +
        "baseline and moves every alert level with it.",
    };
  }

  const here = periodOrder(trimmed);
  const last = existing[existing.length - 1];
  const there = last ? periodOrder(last.label) : null;
  if (here !== null && there !== null && here <= there) {
    return {
      ok: false,
      reason:
        `${trimmed} comes before ${last!.label}, which is already the latest period. ` +
        "Alert levels are set from the periods before each one, so a period entered out " +
        "of sequence is judged against a baseline it should have been part of.",
    };
  }

  return { ok: true };
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
 *
 * THAT REASONING WAS OURS AND IT TURNS OUT TO BE THE AUTHORITY'S RULE.
 * CAA-AC-SMS009 §8.5 names the method as "the population standard
 * deviation (STDEVP) principle" — the same choice, stated rather than
 * argued. The argument above is kept because it explains WHY the rule
 * is the right one, which a citation alone does not.
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
    label: "One period beyond 3 SD",
    consecutive: 1,
    sigma: 3,
    meaning: "A single period this far out is unlikely to be ordinary variation.",
  },
  {
    id: "two-2sd",
    label: "Two consecutive beyond 2 SD",
    consecutive: 2,
    sigma: 2,
    meaning: "Twice in a row, well out. One period out is noise; two is a signal.",
  },
  {
    id: "three-1sd",
    label: "Three consecutive beyond 1 SD",
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

/* =====================================================================
   WHEN AN INDICATOR HAS STOPPED EARNING ITS PLACE.

   CAA-AC-SMS009 §8.4 requires that "the set of SPIs and SPTs selected by
   an organization should be periodically reviewed to ensure their
   continued meaningfulness", and lists the reasons to continue,
   discontinue or change one. Two of those reasons are arithmetic, so
   the product can raise them instead of waiting for somebody to notice:

     §8.4.1  "SPIs continually report the same value (such as zero per
              cent or 100 per cent); these SPIs are unlikely to provide
              meaningful input to senior management decision-making"

     §8.4.2  "SPIs that have similar behaviour and as such are
              considered a duplication"

   THE REST OF §8.4 IS NOT COMPUTABLE AND IS NOT ATTEMPTED. Whether a
   target has been met and the programme it measured is finished
   (§8.4.3), whether another concern now matters more (§8.4.4), whether
   an indicator should be narrowed to sharpen a signal (§8.4.5), or
   whether the objectives themselves have moved (§8.4.6) are judgements
   about the operation. A tool that guessed at them would be inventing
   safety priorities and attributing them to the Authority.

   THIS IS ADVICE AND NEVER AN ACTION. Nothing here retires anything.
   §8.7's framing applies with equal force: an indicator that trips a
   rule is not thereby wrong, it is merely worth a look — and an
   indicator reading zero every quarter may be the most reassuring line
   in the pack rather than a dead one, which is exactly the judgement
   the safety manager is there to make and the software is not.
   ===================================================================== */

export type RetirementReasonId = "FLAT" | "DUPLICATE";

export interface RetirementAdvice {
  readonly id: RetirementReasonId;
  /** The paragraph of CAA-AC-SMS009 this comes from. */
  readonly provision: string;
  /** What was measured, so the reader can disagree with it. */
  readonly because: string;
  /** What the circular suggests considering. Never an instruction. */
  readonly consider: string;
}

/**
 * How many periods must read identically before §8.4.1 is raised.
 *
 * OURS, NOT THE CIRCULAR'S — §8.4.1 says "continually" and names no
 * number, and this is labelled as our reading wherever it is shown, the
 * same way MIN_BASELINE is. Six matches the baseline floor: below that
 * there is not enough history to call anything a pattern, and a rule
 * that fires on three identical quarters would fire on every new
 * indicator in its first year.
 */
export const FLAT_PERIODS = MIN_BASELINE;

/**
 * How closely two indicators must track before §8.4.2 is raised.
 *
 * OURS. The circular says "similar behaviour" and leaves it there. A
 * correlation of 0.95 across a shared baseline is tight enough that the
 * two lines are telling one story; below that they can diverge in the
 * period that matters, which is the period you would lose by retiring
 * one of them.
 */
export const DUPLICATE_CORRELATION = 0.95;

/** Pearson correlation over paired series. Null when it is undefined. */
export function correlation(a: readonly number[], b: readonly number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < MIN_BASELINE) return null;
  const xs = a.slice(-n);
  const ys = b.slice(-n);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const px = xs[i]! - mx;
    const py = ys[i]! - my;
    num += px * py;
    dx += px * px;
    dy += py * py;
  }
  /* A FLAT SERIES HAS NO CORRELATION, rather than a correlation of
     zero or one. Both denominators go to zero when a line never moves,
     and every definition of "how alike are these" is meaningless there
     — which is why §8.4.1 is a separate rule that catches it first. */
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/**
 * §8.4.1 — has this indicator reported the same value throughout?
 *
 * Compared exactly rather than within a tolerance. The circular's
 * examples are zero per cent and one hundred per cent, which are exact
 * values; an indicator wobbling by a rounding error is still moving,
 * and calling that flat would retire a line that is doing its job.
 */
export function isFlat(series: readonly number[]): boolean {
  const usable = series.filter((x) => Number.isFinite(x));
  if (usable.length < FLAT_PERIODS) return false;
  return usable.every((x) => x === usable[0]);
}

/**
 * The §8.4 advice that applies to one indicator, given its siblings.
 *
 * `siblings` is every OTHER indicator on the same register — duplication
 * is a property of a pair, so it cannot be judged from one series. An
 * empty array is a legitimate answer and means the register holds one
 * indicator, not that nothing was checked.
 */
export function retirementAdvice(
  indicator: Indicator,
  siblings: readonly Indicator[] = [],
): readonly RetirementAdvice[] {
  const out: RetirementAdvice[] = [];
  const mine = rates(indicator).filter((x) => Number.isFinite(x));

  if (isFlat(mine)) {
    out.push({
      id: "FLAT",
      provision: "CAA-AC-SMS009 §8.4.1",
      because:
        `Every one of the last ${mine.length} periods reported ${mine[0]}. An indicator ` +
        "that never moves cannot show senior management anything changing.",
      consider:
        "Whether this is measuring something that has genuinely held steady — which is " +
        "worth saying out loud — or whether the measure is too coarse to move. " +
        "Narrowing it is §8.4.5's suggestion; retiring it is §8.4.1's.",
    });
  }

  for (const other of siblings) {
    if (other.id === indicator.id) continue;
    const r = correlation(mine, rates(other).filter((x) => Number.isFinite(x)));
    if (r !== null && r >= DUPLICATE_CORRELATION) {
      out.push({
        id: "DUPLICATE",
        provision: "CAA-AC-SMS009 §8.4.2",
        because:
          `This tracks "${other.name}" at ${r.toFixed(2)} across the periods they share. ` +
          "Two lines with the same shape are one line drawn twice.",
        consider:
          "Which of the two the safety office would actually act on, and whether the " +
          "other is measuring a cause the first only reflects. Keeping both is a " +
          "decision; keeping both without noticing is not.",
      });
    }
  }
  return out;
}
