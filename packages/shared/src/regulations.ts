// =====================================================================
// UsalamaSMS — Regulatory obligation engine
//
// CHARTER RULE 6: regulatory status is computed from today's date, never
// stored. CHARTER RULE 4: every figure carries its date.
//
// This module replaces a single exported constant:
//
//     export function morDeadline(occurredAt: Date): Date {
//       return new Date(occurredAt.getTime() + 72 * 3600 * 1000);
//     }
//     // "MOR regulatory deadline: occurrence time + 72 hours (KCAA MOR AC)"
//
// That line was wrong twice, and the unit test locked both errors in.
//
//   1. THE FIGURE. 72 hours is the EU number, from Regulation (EU) No
//      376/2014. KCAA's Advisory Circular CAA-AC-SMS004A requires the
//      pertinent information within TWENTY-FOUR hours. A Kenyan operator
//      trusting the old constant would have believed it had three days
//      to file something the regulator wanted in one, and the product
//      would have shown a comfortable green countdown for two days after
//      the operator went non-compliant. There is no worse failure mode
//      for a compliance tool than a confident wrong deadline.
//
//   2. THE CLOCK START. Even in the EU the 72 hours run from the moment
//      the reporter BECAME AWARE of the occurrence, not from the
//      occurrence itself. An engineer who finds a defect on Monday that
//      happened on Friday has 72 hours from Monday. Anchoring to
//      occurredAt silently consumed the operator's entire window
//      whenever discovery lagged the event — which is precisely the
//      case where a reporting deadline is hard to meet.
//
// Hence: obligations are DATA, keyed by jurisdiction, each carrying the
// instrument it comes from and the date that reading was last checked.
// Deadlines are computed on demand and never written to a row.
// =====================================================================

// ---------------------------------------------------------------------
// WHY THIS LIST SHRANK, AND WHAT REPLACED THE ROWS.
//
// It used to carry Uganda, Tanzania and Rwanda, all three at 72 hours,
// all three marked PROVISIONAL because nobody had read the instrument.
// The number was not from those instruments. It was the EU's figure,
// borrowed as an "ICAO-common" default — and there is no such thing.
// ICAO sets no universal number of hours for an operator's occurrence
// report to its authority. Annex 13 requires notification "with a
// minimum of delay"; Annex 19 requires the State to run a mandatory
// reporting system and leaves the period to the State.
//
// So three rows asserted, in a compliance tool, a deadline that no
// document anywhere states. Provisional marking made that visible
// without making it true, and the one failure this module was written
// to prevent is a confident wrong deadline.
//
// They are replaced by the baseline the operators they were guessing at
// actually share: ICAO's own SARPs, which say what is required
// everywhere and decline to invent the part that varies. An operator
// outside the two verified jurisdictions gets the honest answer —
// notify without delay, and your authority sets the number — instead of
// a countdown built on nothing.
// ---------------------------------------------------------------------

/** The jurisdictions whose reporting law this engine encodes. */
export const JURISDICTIONS = ["ICAO", "KE", "EU"] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

/** Which event starts the clock. The distinction the old constant lost. */
export type ClockStart = "AWARENESS" | "OCCURRENCE";

export interface ReportingObligation {
  readonly jurisdiction: Jurisdiction;
  readonly authority: string;
  /**
   * Hours from `clockStart` within which the report is due, or `null`
   * where the instrument sets NO fixed period.
   *
   * Nullable on purpose, and it is the point of this type. ICAO
   * requires notification with a minimum of delay and does not name an
   * hour figure; the previous shape had no way to say that, so the
   * only way to add ICAO would have been to type a number ICAO does
   * not publish. A type that cannot express "there is no deadline,
   * file now" forces a lie into the one field nobody should guess.
   */
  readonly hours: number | null;
  readonly clockStart: ClockStart;
  /** The instrument. A deadline without a citation is an opinion. */
  readonly instrument: string;
  /**
   * When a human last read the instrument and confirmed this row.
   * Charter rule 4 — a number without a date is a number nobody can
   * judge. Surfaced in the UI, not just kept here.
   */
  readonly verifiedOn: string;
  /**
   * The publisher's own revision cycle, in months. Staleness is measured
   * against this rather than a flat threshold — charter rule 5. An
   * advisory circular revised every three years at fourteen months is
   * current; a quarterly bulletin at fourteen months has missed four.
   */
  readonly reviewCycleMonths: number;
  readonly note?: string;
}

/**
 * Mandatory occurrence reporting deadlines.
 *
 * Every row is a claim about law that will eventually go stale, which is
 * what `verifiedOn` and docs/05-SWITCHES.md are for. Rows are not
 * "roughly right" — a row we cannot cite is not a row.
 */
export const MOR_OBLIGATIONS: Readonly<Record<Jurisdiction, ReportingObligation>> = {
  ICAO: {
    jurisdiction: "ICAO",
    authority: "ICAO Standards and Recommended Practices",
    hours: null,
    clockStart: "AWARENESS",
    instrument:
      "ICAO Annex 13, Chapter 4, 4.1 — notification with a minimum of delay and by " +
      "the most suitable and quickest means available; with Annex 19 (Safety " +
      "Management), which requires the State to operate mandatory and voluntary " +
      "safety reporting systems and leaves the reporting period to the State",
    verifiedOn: "2026-08-12",
    reviewCycleMonths: 36,
    note:
      "NO FIXED PERIOD, and that is the finding rather than a gap in this row. " +
      "The 72 hours widely quoted as an ICAO figure is the EU's, from Regulation " +
      "(EU) No 376/2014 — misattribution common enough that three rows of this " +
      "very table once carried it as an 'ICAO-common' default. Use this baseline " +
      "where the State's own instrument has not been read: notify without delay, " +
      "and obtain the period from the authority of the State of the operator.",
  },
  KE: {
    jurisdiction: "KE",
    authority: "Kenya Civil Aviation Authority",
    hours: 24,
    clockStart: "AWARENESS",
    instrument: "KCAA Advisory Circular CAA-AC-SMS004A (January 2023), Mandatory Occurrence Reporting",
    verifiedOn: "2026-08-11",
    reviewCycleMonths: 36,
    note:
      "24 hours for the pertinent information. Distinct from the 72-hour " +
      "window for undeclared or misdeclared dangerous goods, which runs " +
      "from discovery and is a separate obligation — do not merge them.",
  },
  EU: {
    jurisdiction: "EU",
    authority: "European Union Aviation Safety Agency",
    hours: 72,
    clockStart: "AWARENESS",
    instrument: "Regulation (EU) No 376/2014, Article 4(6)",
    verifiedOn: "2026-08-11",
    reviewCycleMonths: 60,
    note:
      "72 hours from becoming aware, save in exceptional circumstances. " +
      "This is the row the old hardcoded constant was actually quoting — " +
      "while labelled KCAA, and while anchored to the wrong event.",
  },
};

/**
 * A jurisdiction whose row we have not verified against the primary
 * instrument. The UI must render these differently: a provisional
 * deadline is guidance, not compliance.
 */
export function isProvisionalObligation(o: ReportingObligation): boolean {
  return o.note?.startsWith("PROVISIONAL") ?? false;
}

export function isProvisional(j: Jurisdiction): boolean {
  return isProvisionalObligation(MOR_OBLIGATIONS[j]);
}

/* No row is provisional today — the three that were have been removed
   rather than left flying a warning label. The machinery stays because
   the next row somebody adds from a secondary source needs it, and a
   guard deleted the day it has no instances is a guard that is not
   there the day it does. The predicate is exported separately so a test
   can exercise it against a synthetic row, which is the only way it can
   still fail now that nothing real trips it. */

// =====================================================================
// THE STANDARDS THIS PRODUCT IS BUILT TO.
//
// Named here, once, so a page can render them instead of a screen's
// prose asserting a lineage nobody can check. The reason to publish
// this at all is uniformity: an operator comparing tools, or an auditor
// asking why a number is what it is, should not have to take a
// marketing sentence on trust.
//
// `iataIsSectionLevel` is not a hedge for its own sake. IOSA's Standards
// Manual is a paid publication; what is verifiable without it is that
// the ORG section carries an Occurrence Handling group. Citing a
// specific ISARP number without the manual in hand would be the same
// mistake as the 72-hour rows — a precise-looking reference to a
// document nobody read.
// =====================================================================

export interface Standard {
  readonly body: "ICAO" | "IATA";
  readonly reference: string;
  readonly title: string;
  /** What this product actually takes from it. */
  readonly usedFor: string;
  readonly verifiedOn: string;
  /** True where the citation is to a section rather than a numbered provision. */
  readonly sectionLevel?: boolean;
}

export const STANDARDS: readonly Standard[] = [
  {
    body: "ICAO",
    reference: "Annex 19",
    title: "Safety Management",
    usedFor:
      "The four components and twelve elements every screen is measured against, " +
      "and the requirement for mandatory and voluntary safety reporting. Amendment 2 " +
      "becomes applicable on 26 November 2026.",
    verifiedOn: "2026-08-12",
  },
  {
    body: "ICAO",
    reference: "Annex 13, Chapter 4",
    title: "Aircraft Accident and Incident Investigation — Notification",
    usedFor:
      "The baseline obligation where a State's own period has not been read: " +
      "notification with a minimum of delay, by the quickest means available.",
    verifiedOn: "2026-08-12",
  },
  {
    body: "ICAO",
    reference: "Doc 9859, 4th edition",
    title: "Safety Management Manual",
    usedFor:
      "The 5×5 risk matrix, cell by cell, and the tolerability bands the register " +
      "and the assessor both compute from.",
    verifiedOn: "2026-08-11",
  },
  {
    body: "ICAO",
    reference: "Doc 10159",
    title: "Manual on Safety Information Protection",
    usedFor:
      "Why an anonymous report carries no identifier that a join could recover, " +
      "and why the de-identification pipeline is irreversible rather than masked.",
    verifiedOn: "2026-08-11",
  },
  {
    body: "IATA",
    reference: "IOSA Standards Manual, ORG — Occurrence Handling",
    title: "IOSA Standards Manual",
    usedFor:
      "The audit an operator is measured against in practice. Occurrence handling " +
      "is what the reporting queue and the audit trail are shaped to produce.",
    verifiedOn: "2026-08-12",
    sectionLevel: true,
  },
];

/**
 * The regulatory deadline for an occurrence report.
 *
 * `awareAt` is when the reporting obligation was triggered for this
 * organisation — normally when the report was filed or the occurrence
 * came to the operator's attention. It is a REQUIRED argument and there
 * is deliberately no default: defaulting it to `occurredAt` would
 * reintroduce the exact bug this module exists to remove, quietly.
 */
export function reportingDeadline(
  jurisdiction: Jurisdiction,
  times: { occurredAt: Date; awareAt: Date },
): { due: Date | null; obligation: ReportingObligation } {
  const obligation = MOR_OBLIGATIONS[jurisdiction];
  const anchor = obligation.clockStart === "AWARENESS" ? times.awareAt : times.occurredAt;

  if (Number.isNaN(anchor.getTime())) {
    throw new Error(
      `reportingDeadline: ${obligation.clockStart === "AWARENESS" ? "awareAt" : "occurredAt"} is not a valid date`,
    );
  }
  // Awareness cannot precede the occurrence. If it does, the caller has
  // swapped the arguments — a silent 48-hour error in the operator's
  // favour, which is the direction that gets someone in trouble.
  if (times.awareAt.getTime() < times.occurredAt.getTime()) {
    throw new Error("reportingDeadline: awareAt precedes occurredAt");
  }

  /* No fixed period means no due date, and the honest return is the
     absence rather than a very large number or the anchor itself. Both
     of those would flow into a countdown and put a figure on screen
     that no instrument supports — which is the whole failure this
     module exists to prevent, reintroduced by a convenience. */
  return {
    due: obligation.hours === null
      ? null
      : new Date(anchor.getTime() + obligation.hours * 3_600_000),
    obligation,
  };
}

/**
 * How a deadline stands right now. Computed, never stored.
 *
 * PENDING exists because the first version of this type did not have it,
 * and the omission recreated the bug this whole module was written to
 * remove. With three states, an unsubmitted report that was not yet due
 * fell through to `MET` — so a Kenyan MOR read "met" for eighteen of its
 * twenty-four hours, flipped to `DUE_SOON` for six, and only became
 * `OVERDUE` once the operator was already non-compliant.
 *
 * `MET` is a claim that the obligation has been DISCHARGED. Only a
 * submission can discharge it. Nothing else in this file is allowed to
 * return it.
 */
/* WITHOUT_DELAY is the ICAO baseline's status and it is deliberately
   not a synonym for PENDING. PENDING says there is time left. Under a
   minimum-of-delay obligation there is no window to be inside, so a
   surface that rendered it as PENDING would tell an operator it was
   comfortable when what the instrument asks is that it file now. */
export type DeadlineStatus =
  | "MET"
  | "PENDING"
  | "DUE_SOON"
  | "OVERDUE"
  | "WITHOUT_DELAY";

/**
 * Status of an outstanding obligation as of `now`.
 *
 * `now` is injected rather than read from the clock so the calculation
 * is deterministic and testable — the same discipline the risk matrix
 * gets. A safety-critical function that reads the wall clock internally
 * cannot be unit-tested at a boundary, and the boundary is the only
 * part anyone cares about.
 */
export function deadlineStatus(
  due: Date | null,
  now: Date,
  options: {
    submittedAt?: Date;
    /** The obligation this deadline came from, so DUE_SOON can scale to its window. */
    obligation?: ReportingObligation;
    /** Explicit override, in hours. Wins over `obligation`. */
    dueSoonHours?: number;
  } = {},
): DeadlineStatus {
  const { submittedAt, obligation, dueSoonHours } = options;

  /* Under a minimum-of-delay obligation, filing discharges it: there is
     no window to have missed. Not filing is never PENDING — see the
     note on the type. */
  if (due === null) return submittedAt ? "MET" : "WITHOUT_DELAY";

  // Discharged, and on time. The ONLY path to MET.
  if (submittedAt) {
    return submittedAt.getTime() <= due.getTime() ? "MET" : "OVERDUE";
  }

  // Not submitted, and the window has closed.
  if (now.getTime() > due.getTime()) return "OVERDUE";

  // Outstanding. The warning threshold is a QUARTER OF THE OBLIGATION'S
  // OWN WINDOW rather than a flat number of hours, because the windows
  // differ by jurisdiction: six hours of the EU's 72 is a gentle nudge,
  // and six hours of Kenya's 24 is a quarter of the total already gone
  // before anyone is told. Proportional means the warning lands at the
  // same point in the obligation wherever it was filed.
  //
  // The window length cannot be derived from `due` and `now` — that was
  // the first attempt and it silently reduced to nonsense — so the
  // obligation is passed in, and a caller who supplies neither gets a
  // documented flat default rather than a guess.
  const windowMs = dueSoonHours !== undefined
    ? dueSoonHours * 3_600_000
    : obligation?.hours != null
      ? obligation.hours * DUE_SOON_FRACTION * 3_600_000
      : DEFAULT_DUE_SOON_HOURS * 3_600_000;

  return due.getTime() - now.getTime() <= windowMs ? "DUE_SOON" : "PENDING";
}

/** Fraction of an obligation's window at which it starts warning. */
const DUE_SOON_FRACTION = 0.25;

/** Flat fallback when the caller supplies neither an obligation nor hours. */
const DEFAULT_DUE_SOON_HOURS = 6;

/**
 * Whether a row has outlived its publisher's own revision cycle.
 * Charter rule 5.
 */
export function isStale(obligation: ReportingObligation, now: Date): boolean {
  const verified = new Date(`${obligation.verifiedOn}T00:00:00Z`);
  const months = (now.getTime() - verified.getTime()) / (30.44 * 24 * 3_600_000);
  return months > obligation.reviewCycleMonths;
}
