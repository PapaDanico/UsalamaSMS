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

/* TYPE-ONLY, and deliberately. This module is dependency-free at
   runtime — the risk matrix and the regulatory engine are the two pure
   modules a caller can import without dragging the schema machinery in.
   `import type` is erased at compile time, so keying a deadline on the
   occurrence class costs nothing at runtime and still stops the two
   files disagreeing about what the three classes are called. */
import type { OccurrenceClass } from "./glossary";

/** The three classes Kenya's regulation 12(1) sets separate periods for. */
export type OccurrenceClassKey = OccurrenceClass["key"];

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
// everywhere and decline to invent the part that varies.
//
// THE SHAPE THIS SETTLED INTO. A reporting obligation follows the STATE
// OF REGISTRY, so the product maintains one State's standard properly
// — Kenya, for now — and offers ICAO's baseline for everything else.
// Two rows, not five, and the second one deliberately carries no number.
//
// The EU row was removed under the same rule. It was correct and
// cited, and it implied a coverage that does not exist: nothing here
// is built for an EU-registered operator, and a jurisdiction in the
// dropdown is a claim to know that jurisdiction's obligations. Its
// 72-hour figure survives in the notes below, because that figure is
// the EVIDENCE for why the ICAO baseline carries none — three rows of
// this table once quoted it as ICAO's own.
// ---------------------------------------------------------------------

/** The jurisdictions whose reporting law this engine encodes. */
export const JURISDICTIONS = ["ICAO", "KE"] as const;
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
  /**
   * Where the instrument sets a DIFFERENT period per occurrence class.
   *
   * Kenya does. Regulation 12(1) of L.N. 32/2026 gives an accident 24
   * hours, a serious incident 48, and an incident or other safety
   * related occurrence 72 — one instrument, three deadlines, keyed on
   * exactly the classification this product already helps a reporter
   * make.
   *
   * `hours` above remains the figure used when the class is not known,
   * and it must be the STRICTEST of these. Telling an operator it has
   * less time than it does is a cost; telling it more is a breach. The
   * relationship is asserted in tests rather than left to whoever edits
   * the row next.
   */
  readonly hoursByClass?: Readonly<Record<OccurrenceClassKey, number>>;
  readonly clockStart: ClockStart;
  /**
   * True where the instrument names a period but not what starts it.
   *
   * L.N. 32/2026 says "within 24 hours" and never says from what. The
   * Advisory Circular it replaced said from becoming aware, and
   * awareness is the only anchor a person can act on — an
   * occurrence-anchored clock can be past its deadline before anybody
   * knows the event happened. So awareness is kept and this flag makes
   * the product say, on the surface, that it is our reading rather than
   * the instrument's words. A silent assumption in a compliance tool is
   * the same failure as a silent figure.
   */
  readonly clockStartUnstated?: boolean;
  /**
   * WHERE THE CLOCK START IS STATED, when it is not the row's own
   * instrument.
   *
   * A deadline and the moment it runs from are two facts and they do
   * not have to come from the same document. Kenya is the case: L.N. 32
   * regulation 12(1) sets 24/48/72 and is silent on the anchor, while
   * Advisory Circular CAA-AC-SMS004A states the anchor and repeats the
   * same table.
   *
   * Held separately rather than folded into `instrument` because a
   * combined citation would put words in L.N. 32's mouth. Mutually
   * exclusive with `clockStartUnstated` — if the source is named, it is
   * by definition no longer unstated, and the test suite asserts that
   * no row sets both.
   */
  readonly clockStartInstrument?: string;
  /** The instrument. A deadline without a citation is an opinion. */
  readonly instrument: string;
  /**
   * When a human last read the instrument and confirmed this row.
   * Charter rule 4 — a number without a date is a number nobody can
   * judge. Surfaced in the UI, not just kept here.
   */
  readonly verifiedOn: string;
  /**
   * When the INSTRUMENT was issued, not when we last read it.
   *
   * These are different clocks and only one of them says anything about
   * whether the figure is current. `verifiedOn` records our diligence
   * and resets every time somebody looks; the instrument's age does
   * not reset, and it is the instrument that goes out of date.
   *
   * ISO date. Where an instrument states only a month, the first of it
   * — the precision claimed matches the precision published.
   */
  readonly instrumentIssued: string;

  /**
   * An instrument that GOVERNS this row and has not been read against
   * it. Present only when one is known to exist.
   *
   * Distinct from `instrument`, which is where the figure in this row
   * actually came from. Moving the citation to a document nobody has
   * read would attribute a number to it — the exact misattribution the
   * header of this file exists to complain about, committed by us
   * rather than by somebody else.
   *
   * So both are stated: where the hours came from, and what law now
   * sits above them unchecked.
   */
  readonly governedByUnread?: string;
  /**
   * The publisher's own revision cycle, in months. Staleness is measured
   * against this rather than a flat threshold — charter rule 5. An
   * advisory circular revised every three years at fourteen months is
   * current; a quarterly bulletin at fourteen months has missed four.
   */
  readonly reviewCycleMonths: number;
  readonly note?: string;

  /**
   * The OTHER notification, owed to a different body on a different
   * clock. Present only where the State's investigation authority is
   * known; absent is "we have not established one", never "there is
   * none".
   */
  readonly accidentNotification?: AccidentNotification;
}

/**
 * Notification to the State's accident INVESTIGATION authority.
 *
 * NOT THE SAME DUTY AS THE ROW IT HANGS OFF. Everything else in
 * `ReportingObligation` describes the mandatory occurrence report owed
 * to the civil aviation AUTHORITY — the regulator. Annex 13 to the
 * Chicago Convention puts a second, independent duty on the operator
 * for accidents and serious incidents: tell the body that investigates
 * them, and tell it immediately.
 *
 * They are separate organisations, and conflating them is the error
 * this type exists to prevent. Kenya's KCAA regulates; the Aircraft
 * Accident Investigation Department, under the Ministry of Roads and
 * Transport, investigates. An operator who reads "24 hours" off the
 * regulation 12(1) row and concludes it has a day before anybody needs
 * telling has been misled by an omission in this file.
 *
 * NO TELEPHONE NUMBER APPEARS HERE, and there is a test that says so.
 * The authority publishes its own contacts and they change; a number
 * copied into software by somebody who never dialled it is the one
 * number in this product where being wrong is not measured in
 * inconvenience. `url` points at where the authority publishes them.
 * A number an operator has actually confirmed belongs in that
 * operator's own emergency contact directory (element 1.4), which
 * tracks how long it has been since anybody checked.
 */
export interface AccidentNotification {
  /** The body that investigates, named as it names itself. */
  readonly authority: string;
  /** Where that body publishes its own contact details. */
  readonly url: string;
  /** The occurrence classes this duty attaches to. */
  readonly appliesTo: ReadonlyArray<string>;
  /** What imposes it. */
  readonly basis: string;
  /**
   * Whether the DOMESTIC instrument giving effect to Annex 13 has been
   * read against this row.
   *
   * FALSE is the honest state for Kenya: the duty is certain because
   * Annex 13 is, and the domestic regulation that implements it has not
   * been read here. Same discipline as `governedByUnread` above — say
   * where the claim came from, and say what sits above it unchecked.
   */
  readonly domesticInstrumentRead: boolean;
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
    instrumentIssued: "2016-07-01",
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
    /* The strictest of the three below, used when the class is not yet
       known. Never a middle value: an unknown occurrence is treated as
       the one with the least time, because the cost of being early is
       an inconvenience and the cost of being late is a breach. */
    hours: 24,
    /* Regulation 12(1), verbatim: a service provider shall notify and
       make mandatory occurrence reports "to the Authority within 24
       hours, in the case of accident, 48 hours in the case of serious
       incidents and 72 hours in the case of incidents and other safety
       related occurrences." */
    hoursByClass: { ACCIDENT: 24, SERIOUS_INCIDENT: 48, INCIDENT: 72 },
    clockStart: "AWARENESS",
    /* ================================================================
       IT USED TO BE OUR READING. IT IS NOW THE AUTHORITY'S WORDS.

       This carried `clockStartUnstated: true` and a note saying that
       L.N. 32 states a period and never says what starts it, so
       awareness was the product's own inference and the screens said
       so. That was honest and it was the best available answer until
       somebody read the governing Advisory Circular.

       CAA-AC-SMS004A (January 2023), paragraph 3.3.6.1, Note 1:

         "The reporting period is normally understood to start from
          when the incident took place or from the time when the
          reporter determined that there was, or could have been, a
          potentially hazardous or unsafe condition."

       So the Authority does state it, in the instrument sitting above
       this row rather than in the row's own. Awareness is not our
       inference; it is the second limb of the Authority's sentence,
       and the first limb collapses into it — for an occurrence
       somebody knew about as it happened, "when it took place" and
       "when the reporter determined" are the same moment. There is no
       case where the awareness anchor is later than the AC allows.

       THE AC PREDATES L.N. 32 AND IS STILL THE REFERENCE. Its own
       deadline table — incident 72 hours, serious incident 48,
       accident 24 — is the same table regulation 12(1) later enacted,
       so it is confirmatory rather than superseded, and the owner's
       instruction was to use it on that basis.

       The two facts now come from two instruments, which is why the
       clock start carries its own citation rather than borrowing the
       deadline's. Conflating them would attribute a sentence to L.N. 32
       that L.N. 32 does not contain — the exact misattribution the
       header of this file exists to complain about. */
    clockStartInstrument:
      "KCAA Advisory Circular CAA-AC-SMS004A (January 2023), paragraph 3.3.6.1, Note 1",
    instrument:
      "Civil Aviation (Safety Management) Regulations, 2025 (L.N. 32 of 2026, " +
      "Kenya Gazette Supplement No. 43, 3 March 2026), regulation 12(1)",
    verifiedOn: "2026-08-12",
    /* The date of gazettement, which is the date the instrument bears.
       Note the citation year and the notice year differ — the
       Regulations are cited as of 2025 and were gazetted in 2026, and
       both appear above because an operator searching either will find
       it. */
    instrumentIssued: "2026-03-03",
    reviewCycleMonths: 60,
    note:
      "THREE PERIODS, NOT ONE, and which applies depends on how the occurrence " +
      "classifies: 24 hours for an accident, 48 for a serious incident, 72 for an " +
      "incident or other safety related occurrence. This product previously showed " +
      "24 hours for all of them, from KCAA Advisory Circular CAA-AC-SMS004A " +
      "(January 2023) — guidance, and now superseded. Regulation 18 of these " +
      "Regulations revokes L.N. 91/2018.",

    /* THE SECOND CALL, and the reason this field exists at all.
       Regulation 12(1) above is owed to KCAA. Annex 13 puts an
       independent duty on the operator to notify the investigators,
       and the AAID is a different organisation under a different
       ministry. Immediately, and not within any of the three periods
       above — the periods are about the paperwork to the regulator.

       THE PROSE STAYS SHORT because this module is in the entry chunk
       that a reporter at a remote strip downloads before filing
       anything. The reasoning belongs in comments, which minify away;
       string values do not. Raising the entry budget to carry an
       argument is a cost paid by the person this product exists for. */
    accidentNotification: {
      authority: "Aircraft Accident Investigation Department (AAID), Kenya",
      url: "https://aaid.transport.go.ke/",
      appliesTo: ["ACCIDENT", "SERIOUS_INCIDENT"],
      basis: "Annex 13 to the Convention on International Civil Aviation.",
      domesticInstrumentRead: false,
      note:
        "Immediate, and separate from the report to the Authority. Confirm their " +
        "numbers from the AAID and record them in your emergency contact directory.",
    },
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
      "and the assessor both compute from. Also the safety risk management process " +
      "the change assessment follows, and the vocabulary the indicators use — a " +
      "safety performance indicator, a target, and the split between high- and " +
      "lower-consequence indicators.",
    verifiedOn: "2026-08-11",
  },
  {
    /* SECTION-LEVEL, and for the same reason as the IOSA row rather
       than a different one. The standard-deviation method behind the
       alert levels — average plus one, two and three σ of the preceding
       periods, with the three crossing criteria — is the basic
       statistical trending method State and industry guidance builds
       on, and the toolkit computes it. What this product has NOT done
       is read the primary instrument's own wording of it, and the
       document is not freely available to do so from here.

       Citing a numbered provision on that basis would be the 72-hour
       mistake again: a precise-looking reference to a page nobody
       opened. So the reference is to the guidance area, the toolkit
       says on its own face which half is ICAO's and which is method,
       and this row is the record of what remains to be verified. */
    body: "ICAO",
    reference: "Doc 9859, 4th edition — safety performance monitoring",
    title: "Safety Management Manual — indicators, targets and alert levels",
    usedFor:
      "The shape of element 3.1: indicators with targets and alert levels reviewed " +
      "on a cadence. The standard-deviation method the toolkit computes is the " +
      "general statistical trending method rather than a quoted provision — the " +
      "primary wording has not been read, and the toolkit says so where it is used.",
    verifiedOn: "2026-08-12",
    sectionLevel: true,
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
/**
 * The period that applies, in hours, or null where none is fixed.
 *
 * Exported because two surfaces need the figure without needing a date:
 * the occurrence classifier, which has just worked out the class and
 * must show the period that goes with it, and the deadline computation
 * below. One function so the two cannot disagree — the classifier used
 * to read `obligation.hours` directly and would have gone on showing
 * 24 hours for an incident the instrument gives 72.
 */
export function reportingHours(
  jurisdiction: Jurisdiction,
  occurrenceClass?: OccurrenceClassKey,
): number | null {
  const obligation = MOR_OBLIGATIONS[jurisdiction];
  return (occurrenceClass && obligation.hoursByClass?.[occurrenceClass]) ?? obligation.hours;
}

/**
 * Whether an occurrence of this class must be reported to THIS
 * authority — which is not the same question as whether the class is
 * generally reportable.
 *
 * OccurrenceClass.reportable in the glossary carries the general
 * reading: Annex 13's notification duty covers accidents and serious
 * incidents, and an incident is "not reportable as an occurrence in
 * every case". That is true as a generality and false in Kenya.
 * Regulation 12(1) of L.N. 32/2026 requires mandatory occurrence
 * reports on "accidents, serious incidents, incidents and other safety
 * related occurrences" — incidents named explicitly, with 72 hours
 * against them.
 *
 * So the classifier was telling a Kenyan operator that an incident is
 * not automatically reportable while the law required it inside three
 * days. Derived from the instrument rather than from a second
 * hand-typed flag: if a State's own table sets a period for the class,
 * the State expects the report.
 */
export function isReportableUnder(
  jurisdiction: Jurisdiction,
  occurrenceClass: OccurrenceClassKey,
  generallyReportable: boolean,
): boolean {
  const byClass = MOR_OBLIGATIONS[jurisdiction].hoursByClass;
  if (byClass && occurrenceClass in byClass) return true;
  return generallyReportable;
}

export function reportingDeadline(
  jurisdiction: Jurisdiction,
  times: { occurredAt: Date; awareAt: Date },
  /**
   * How the occurrence classifies, where that is known.
   *
   * Optional because it usually is not known yet: a reporter filing
   * from a strip has answered "what kind of report is this", not "is
   * this an accident under Annex 13". Omit it and the strictest period
   * applies, which is the safe direction to be wrong in.
   */
  occurrenceClass?: OccurrenceClassKey,
): { due: Date | null; obligation: ReportingObligation; hours: number | null } {
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
  /* The class-specific period where the instrument sets one AND the
     class is known; otherwise the row's own figure, which is the
     strictest. Falling back to the strictest rather than to the widest
     is the whole point — an unclassified occurrence must not be given
     the incident window and then turn out to be an accident. */
  const hours = reportingHours(jurisdiction, occurrenceClass);

  /* No fixed period means no due date, and the honest return is the
     absence rather than a very large number or the anchor itself. Both
     of those would flow into a countdown and put a figure on screen
     that no instrument supports — which is the whole failure this
     module exists to prevent, reintroduced by a convenience. */
  return {
    due: hours === null ? null : new Date(anchor.getTime() + hours * 3_600_000),
    obligation,
    hours,
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
  /* MEASURED FROM THE INSTRUMENT, NOT FROM OUR LAST LOOK, and the
     difference is the whole point.

     This used to measure months since `verifiedOn`. That is a clock
     which RESETS every time somebody re-reads the row — so a figure
     taken from a January 2023 advisory circular, re-verified yesterday,
     reported as fresh until 2029. It measured our diligence and called
     the answer currency.

     Found while checking the Kenyan row against KCARs 2025: the
     authority published twenty-nine revised regulations that year, and
     this row cites a 2023 AC. Whether that AC survived them is exactly
     the question `isStale` is supposed to raise, and it could not,
     because re-reading the old document counted as being up to date.

     Both clocks are kept — `verifiedOn` still records when a human last
     looked, which is worth showing — but the one that decides staleness
     is the age of the thing being cited. */
  const issued = new Date(`${obligation.instrumentIssued}T00:00:00Z`);
  const months = (now.getTime() - issued.getTime()) / (30.44 * 24 * 3_600_000);
  return months > obligation.reviewCycleMonths;
}
