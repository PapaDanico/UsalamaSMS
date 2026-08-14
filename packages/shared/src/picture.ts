/* =====================================================================
   THE RISK PICTURE.

   WHERE THIS COMES FROM. The UK Military Aviation Authority does not
   only require that risks are owned and that occurrences are reported.
   It aggregates what comes in into a RISK PICTURE, and uses that
   picture to decide where to look next — risk-based assurance rather
   than calendar-based inspection. RA 1210 requires risk decisions to be
   "recorded and communicated across all relevant stakeholders", and a
   decision communicated one row at a time has not been communicated.

   Doc 9859 asks for the same thing in different words: element 2.1's
   evidence is "a report rate per 1,000 hours or per departure THAT IS
   TRENDING", and element 3.1's is indicators with alert levels reviewed
   on a cadence. Neither can be read off a list.

   EVERYTHING HERE IS COMPUTED. Charter rule 6, and it matters more on
   this screen than anywhere else in the product: a dashboard whose
   numbers are typed is a dashboard nobody trusts twice, and one that
   caches a figure is one that will eventually disagree with the rows
   underneath it in front of an inspector.

   WHAT IT REFUSES TO INVENT, and this is the part that separates an
   honest picture from a reassuring one:

     · A REPORT RATE WITH NO EXPOSURE. Doc 9859's rate is per 1,000
       hours or per departure. This product does not hold flight hours.
       So the picture reports a COUNT, says a count is not a rate, and
       names the number it would need — rather than dividing by days and
       presenting "reports per day" as though it meant something.
     · A TREND FROM TOO FEW PERIODS. Two points are a line through any
       two points. See MIN_TREND_POINTS.
     · A MEDIAN OF ALMOST NOTHING. A median closure time over three
       reports is an anecdote with a decimal place.

   In each case the answer is the reason, not a blank and not a zero. A
   zero on a dashboard reads as a measurement.
   ===================================================================== */

import type { Tolerability } from "./risk";
import { meetsRequirement, requiredHolder } from "./holder";

/**
 * Below this, a series is reported as too short to trend.
 *
 * OURS, and labelled as such wherever it is shown — the same discipline
 * spi.ts applies to its six-point baseline floor. Three is the smallest
 * number of points at which a direction is a direction rather than the
 * segment between two of them.
 */
export const MIN_TREND_POINTS = 3;

/**
 * Below this, a median is reported as too small a sample.
 *
 * Also ours. Five closures is still few, and the picture says so; the
 * point of the floor is that four is not silently rendered as though it
 * were forty.
 */
export const MIN_SAMPLE = 5;

export type Trend = "RISING" | "FALLING" | "FLAT" | "TOO_SHORT";

export interface Counted<T extends string> {
  readonly total: number;
  readonly by: Readonly<Record<T, number>>;
}

/** Counts by key, with every declared key present at zero. */
export function tally<T extends string>(
  keys: ReadonlyArray<T>,
  rows: ReadonlyArray<{ readonly key: T; readonly count: number }>,
): Counted<T> {
  /* EVERY KEY PRESENT, INCLUDING THE EMPTY ONES. A GROUP BY returns no
     row for a band with nothing in it, and a picture that simply omits
     "intolerable" when there are none is a picture that looks identical
     to one where the query broke. Zero is an answer; absence is not. */
  const by = Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
  for (const r of rows) if (r.key in by) by[r.key] = r.count;
  return { total: Object.values<number>(by).reduce((a, b) => a + b, 0), by };
}

export interface Sample {
  readonly n: number;
  /** Null when n is below MIN_SAMPLE — see why in the module header. */
  readonly median: number | null;
  readonly p90: number | null;
  /** Why there is no median, in words a screen can print. */
  readonly note: string | null;
}

/**
 * The middle and the tail of a set of durations.
 *
 * MEDIAN, NOT MEAN, and that is not a stylistic preference. One report
 * that sat for four hundred days — the ordinary case, because something
 * is always waiting on a part or a regulator — moves a mean past every
 * other number in the set. A safety manager reading "average time to
 * closure: 96 days" against a set where most closed inside a fortnight
 * has been told something false about their own operation.
 *
 * The p90 is reported BESIDE it rather than instead of it, because the
 * tail is the part worth acting on and a median alone hides it.
 */
export function sampleOf(values: ReadonlyArray<number>): Sample {
  const n = values.length;
  if (n < MIN_SAMPLE) {
    return {
      n,
      median: null,
      p90: null,
      note:
        n === 0
          ? "Nothing has been closed yet, so there is no time to closure to report."
          : `Only ${n} report${n === 1 ? "" : "s"} closed so far. A median over fewer ` +
            `than ${MIN_SAMPLE} is an anecdote with a decimal place, so none is shown.`,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return { n, median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9), note: null };
}

/** Nearest-rank, on an already-sorted array. */
function quantile(sorted: ReadonlyArray<number>, q: number): number {
  const rank = Math.ceil(q * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
}

/**
 * Which way a series is going, or that it is too short to say.
 *
 * COMPARES THE LAST POINT TO THE MEDIAN OF THE ONES BEFORE IT — not to
 * the previous point, and NOT to their mean.
 *
 * Not the previous point, because last-two is what a spreadsheet arrow
 * does and it inverts on ordinary noise: a quiet month after a busy one
 * reads as "falling" when the year is flat.
 *
 * NOT THE MEAN, AND THAT WAS THIS FUNCTION'S FIRST VERSION. A test of
 * [10, 10, 20, 10] — flat around ten with one busy month — expected
 * FLAT and got FALLING, because the spike lifted the baseline mean to
 * 13.3 and a return to normal then reads as a 25% drop. So the busy
 * month gets counted twice: once when it rises, and again as a fall
 * when it ends.
 *
 * That is the SAME failure sampleOf() rejects two functions up, for the
 * same reason, and the same fix applies. A median baseline is not moved
 * by one spike, so a month like every other month reads as flat.
 *
 * FLAT IS A REAL ANSWER and gets its own band rather than being
 * whichever of rising or falling the arithmetic lands on. A picture
 * where every indicator always points somewhere is a picture where the
 * arrows stop being read.
 */
export function trendOf(series: ReadonlyArray<number>): Trend {
  if (series.length < MIN_TREND_POINTS) return "TOO_SHORT";
  const last = series[series.length - 1]!;
  const baseline = quantile([...series.slice(0, -1)].sort((a, b) => a - b), 0.5);
  if (baseline === 0) return last === 0 ? "FLAT" : "RISING";
  const change = (last - baseline) / baseline;
  // Ten per cent, ours: below it, the movement is smaller than the
  // month-to-month noise of a three-aircraft operator's report count.
  if (Math.abs(change) < 0.1) return "FLAT";
  return change > 0 ? "RISING" : "FALLING";
}

export interface HolderGap {
  readonly id: string;
  readonly hazard: string;
  readonly band: Tolerability;
  readonly owner: string | null;
  /** The post RA 1210's principle says must carry a risk in this band. */
  readonly needs: string;
  readonly verdict: "below" | "unknown";
}

/**
 * Risks owned below the authority their band requires.
 *
 * THE ONE THING ON THIS SCREEN THE INCUMBENTS DO NOT HAVE. SMS Pro,
 * Q-Pulse, Centrik and iQSMS all show a register by band. None of them
 * asks whether the person named in the owner box is senior enough to
 * carry what is in the row — because Doc 9859 does not ask it either.
 * RA 1210 does, and holder.ts is where that rule lives.
 *
 * "BELOW" AND "UNKNOWN" ARE BOTH REPORTED AND ARE KEPT APART. Below is
 * a finding: a red risk owned by a safety officer is a governance gap.
 * Unknown is a question: the owner field has a free-text escape because
 * a small operator's real titles are not this product's enum, so "the
 * Director" may genuinely be the accountable executive. Collapsing the
 * two would either accuse an operator of a gap it does not have, or
 * bury a real one in a list of naming differences.
 */
export function holderGaps(
  rows: ReadonlyArray<{
    readonly id: string;
    readonly hazard: string;
    readonly tolerability: Tolerability;
    readonly residualTolerability?: Tolerability | null;
    readonly owner?: string | null;
  }>,
): ReadonlyArray<HolderGap> {
  const gaps: HolderGap[] = [];
  for (const r of rows) {
    /* THE GOVERNING BAND IS THE RESIDUAL ONE WHERE THERE IS ONE, which
       is the same rule the register and the change route already use: a
       risk with controls in place is carried at the position it is
       actually being carried at, not at the one it started from. */
    const band = r.residualTolerability ?? r.tolerability;
    const verdict = meetsRequirement(band, r.owner);
    if (verdict === "meets") continue;
    gaps.push({
      id: r.id,
      hazard: r.hazard,
      band,
      owner: r.owner ?? null,
      needs: requiredHolder(band).minimum,
      verdict,
    });
  }
  /* Worst first, then the answerable ones. A list that opens with
     twenty naming questions buries the one red risk owned too low. */
  const rank = (g: HolderGap) =>
    (g.verdict === "below" ? 0 : 10) +
    (g.band === "INTOLERABLE" ? 0 : g.band === "TOLERABLE" ? 1 : 2);
  return gaps.sort((a, b) => rank(a) - rank(b));
}

export interface RateNote {
  readonly count: number;
  readonly days: number;
  /** Always null. See the module header, and the note below. */
  readonly rate: null;
  readonly note: string;
}

/**
 * The report count, and an explicit refusal to call it a rate.
 *
 * Doc 9859's indicator is a rate per 1,000 flight hours or per
 * departure. This product does not hold flight hours or departures — an
 * operator's exposure lives in its own records, and the SPI screen asks
 * for it per period precisely because the product cannot know it.
 *
 * Dividing by elapsed days would produce "reports per day", which looks
 * like a rate, is not the rate the element asks for, and gets worse the
 * moment an operator's flying is seasonal. A picture that answers a
 * question it was not asked is how a number ends up in a submission to
 * an authority that then asks where it came from.
 */
export function reportCount(count: number, days: number): RateNote {
  return {
    count,
    days,
    rate: null,
    note:
      `${count} report${count === 1 ? "" : "s"} in ${days} days. This is a count, not ` +
      "a rate — Doc 9859's indicator is per 1,000 flight hours or per departure, and " +
      "this product does not hold your flying hours. Enter them as exposure against an " +
      "indicator and the rate is computed there.",
  };
}
