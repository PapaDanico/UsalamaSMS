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

/** The jurisdictions whose reporting law this engine encodes. */
export const JURISDICTIONS = ["KE", "UG", "TZ", "RW", "EU"] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

/** Which event starts the clock. The distinction the old constant lost. */
export type ClockStart = "AWARENESS" | "OCCURRENCE";

export interface ReportingObligation {
  readonly jurisdiction: Jurisdiction;
  readonly authority: string;
  /** Hours from `clockStart` within which the report is due. */
  readonly hours: number;
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
  UG: {
    jurisdiction: "UG",
    authority: "Uganda Civil Aviation Authority",
    hours: 72,
    clockStart: "AWARENESS",
    instrument: "UCAA Civil Aviation (Safety Management) Regulations",
    verifiedOn: "2026-08-11",
    reviewCycleMonths: 36,
    note:
      "PROVISIONAL — carried at the ICAO-common 72 hours pending a read of " +
      "the current UCAA instrument. Flagged in docs/05-SWITCHES.md and " +
      "surfaced to the user as unverified rather than shown as fact.",
  },
  TZ: {
    jurisdiction: "TZ",
    authority: "Tanzania Civil Aviation Authority",
    hours: 72,
    clockStart: "AWARENESS",
    instrument: "TCAA Civil Aviation (Safety Management) Regulations",
    verifiedOn: "2026-08-11",
    reviewCycleMonths: 36,
    note: "PROVISIONAL — see UG.",
  },
  RW: {
    jurisdiction: "RW",
    authority: "Rwanda Civil Aviation Authority",
    hours: 72,
    clockStart: "AWARENESS",
    instrument: "RCAA Civil Aviation (Safety Management) Regulations",
    verifiedOn: "2026-08-11",
    reviewCycleMonths: 36,
    note: "PROVISIONAL — see UG.",
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
export function isProvisional(j: Jurisdiction): boolean {
  return MOR_OBLIGATIONS[j].note?.startsWith("PROVISIONAL") ?? false;
}

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
): { due: Date; obligation: ReportingObligation } {
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

  return {
    due: new Date(anchor.getTime() + obligation.hours * 3_600_000),
    obligation,
  };
}

/** How a deadline stands right now. Computed, never stored. */
export type DeadlineStatus = "MET" | "DUE_SOON" | "OVERDUE";

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
  due: Date,
  now: Date,
  options: { submittedAt?: Date; dueSoonHours?: number } = {},
): DeadlineStatus {
  const { submittedAt, dueSoonHours = 6 } = options;
  if (submittedAt && submittedAt.getTime() <= due.getTime()) return "MET";
  if (now.getTime() > due.getTime()) return "OVERDUE";
  if (due.getTime() - now.getTime() <= dueSoonHours * 3_600_000) return "DUE_SOON";
  return "MET";
}

/**
 * Whether a row has outlived its publisher's own revision cycle.
 * Charter rule 5.
 */
export function isStale(obligation: ReportingObligation, now: Date): boolean {
  const verified = new Date(`${obligation.verifiedOn}T00:00:00Z`);
  const months = (now.getTime() - verified.getTime()) / (30.44 * 24 * 3_600_000);
  return months > obligation.reviewCycleMonths;
}
