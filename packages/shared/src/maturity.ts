// =====================================================================
// SMS maturity — the framework, the scale, and the scoring.
//
// WHY THIS EXISTS. Annex 19 Amendment 2, applicable 26 November 2026,
// moves the question from "are the procedures written down" to "show
// the system is actually functioning". An operator cannot answer that
// from a folder. It needs a position it can state, defend, and show
// movement on — which is what a maturity assessment is for.
//
// WHAT IS AUTHORITATIVE HERE AND WHAT IS NOT, because the difference
// matters more than the tool:
//
//   · THE FOUR COMPONENTS are Annex 19's own and are not in dispute.
//   · THE TWELVE ELEMENTS are the ICAO SMS framework's, compiled here
//     from secondary sources and NOT yet read against Doc 9859 fourth
//     edition directly. They are therefore marked PROVISIONAL, exactly
//     as three of the five jurisdictions in regulations.ts are, and for
//     the same reason: a figure an operator relies on and cannot check
//     is worse than no figure.
//   · THE MATURITY DESCRIPTORS ARE OURS. ICAO does not publish a
//     five-point maturity scale for these elements. The levels below
//     are this product's articulation of what "implemented" looks like,
//     and they are labelled as such wherever they are shown. Presenting
//     them as ICAO's would be inventing an authority.
//
// NOTHING IS STORED. Charter rule 6: the score is computed from the
// answers on every read. There is no saved index to go stale when an
// element is re-answered, and no server ever sees the assessment.
// =====================================================================

export interface MaturityLevel {
  readonly value: 0 | 1 | 2 | 3 | 4;
  readonly label: string;
  readonly meaning: string;
}

/**
 * The scale, ours, five points.
 *
 * Zero is a real answer rather than the absence of one: an operator
 * that has not started on an element needs to be able to say so, and a
 * scale beginning at 1 quietly awards credit for nothing.
 */
export const MATURITY_LEVELS: ReadonlyArray<MaturityLevel> = Object.freeze([
  {
    value: 0,
    label: "Absent",
    meaning: "Nothing is in place for this element.",
  },
  {
    value: 1,
    label: "Documented",
    meaning: "It is written down, in a manual or a procedure. It is not yet routine.",
  },
  {
    value: 2,
    label: "Practised",
    meaning: "People do it, and would describe it the same way if asked separately.",
  },
  {
    value: 3,
    label: "Measured",
    meaning: "It produces evidence — dates, counts, records — that somebody reviews.",
  },
  {
    value: 4,
    label: "Improving",
    meaning: "The evidence changes decisions, and the change is visible in the record.",
  },
]);

export interface SmsElement {
  /** ICAO's own numbering, e.g. "1.1". */
  readonly id: string;
  readonly name: string;
  /** The one question this element is assessed by, in an operator's words. */
  readonly question: string;
  /** What "Improving" actually looks like here, so level 4 is not a mood. */
  readonly evidence: string;
}

export interface SmsComponent {
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly elements: ReadonlyArray<SmsElement>;
}

export const SMS_COMPONENTS: ReadonlyArray<SmsComponent> = Object.freeze([
  {
    id: "1",
    name: "Safety policy and objectives",
    purpose:
      "Who is accountable, what the organisation has committed to, and whether anyone can act on it.",
    elements: Object.freeze([
      {
        id: "1.1",
        name: "Management commitment",
        question:
          "Is there a signed safety policy, and does the accountable executive act on it when it costs something?",
        evidence:
          "A decision in the last year where safety cost schedule or money, and the record of who made it.",
      },
      {
        id: "1.2",
        name: "Safety accountability and responsibilities",
        question:
          "Can each person name what they are accountable for in the SMS, without reading it off a chart?",
        evidence:
          "Accountabilities in job descriptions, and people describing them consistently when asked separately.",
      },
      {
        id: "1.3",
        name: "Appointment of key safety personnel",
        question:
          "Is there a named safety manager with the time, standing and access to do the job?",
        evidence:
          "An appointment letter, protected time in a roster, and direct access to the accountable executive.",
      },
      {
        id: "1.4",
        name: "Coordination of emergency response planning",
        question:
          "Does the emergency response plan connect to the people and organisations it depends on, and has it been exercised?",
        evidence: "An exercise in the last 12 months, with findings that changed the plan.",
      },
      {
        id: "1.5",
        name: "SMS documentation",
        question:
          "Is the SMS documented, current, and findable by the people who need it rather than only by the auditor?",
        evidence: "A controlled document with a revision date inside the current review cycle.",
      },
    ]),
  },
  {
    id: "2",
    name: "Safety risk management",
    purpose: "Whether hazards are found before events, and whether the risk is actually assessed.",
    elements: Object.freeze([
      {
        id: "2.1",
        name: "Hazard identification",
        question:
          "Do hazards reach the safety office from the frontline, reactively and proactively, in useful numbers?",
        evidence:
          "A report rate per 1,000 hours or per departure that is trending, and hazards raised before an event.",
      },
      {
        id: "2.2",
        name: "Safety risk assessment and mitigation",
        question:
          "Is every identified hazard assessed on a consistent scale, with mitigations tracked to closure?",
        evidence:
          "A risk register where each entry has a severity, a likelihood, an owner and a closure date.",
      },
    ]),
  },
  {
    id: "3",
    name: "Safety assurance",
    purpose:
      "Whether the organisation checks that its own controls work, and notices when they stop working.",
    elements: Object.freeze([
      {
        id: "3.1",
        name: "Safety performance monitoring and measurement",
        question:
          "Are there safety performance indicators with targets and alert levels, reviewed on a cadence?",
        evidence:
          "Indicators with a defined trigger, and a record of what happened the last time one was crossed.",
      },
      {
        id: "3.2",
        name: "The management of change",
        question:
          "Is a safety assessment done before a change to fleet, route, structure or key personnel?",
        evidence: "A change assessment for the most recent significant change, dated before it happened.",
      },
      {
        id: "3.3",
        name: "Continuous improvement of the SMS",
        question:
          "Is the SMS itself audited, and do its findings change how the SMS is run?",
        evidence: "An internal SMS audit in the last cycle, with findings closed and verified.",
      },
    ]),
  },
  {
    id: "4",
    name: "Safety promotion",
    purpose: "Whether people are equipped to take part, and whether they believe it is safe to.",
    elements: Object.freeze([
      {
        id: "4.1",
        name: "Training and education",
        question:
          "Has everyone whose work affects safety had SMS training appropriate to their role, and is it current?",
        evidence: "A training matrix showing role, date and next due, with no expired rows.",
      },
      {
        id: "4.2",
        name: "Safety communication",
        question:
          "Do people who file reports find out what happened as a result?",
        evidence:
          "Feedback to reporters, and safety information published in a form the frontline actually reads.",
      },
    ]),
  },
]);

/** Every element, flat, in framework order. */
export const SMS_ELEMENTS: ReadonlyArray<SmsElement> = Object.freeze(
  SMS_COMPONENTS.flatMap((c) => [...c.elements]),
);

/** Provenance, on the same terms as every regulatory figure in this product. */
export const MATURITY_SOURCE = Object.freeze({
  framework: "ICAO SMS framework — Annex 19, four components and twelve elements",
  scale: "Five-point maturity scale articulated by UsalamaSMS, not published by ICAO",
  compiledOn: "2026-08-12",
  /** Not yet read against Doc 9859 fourth edition directly. */
  provisional: true,
  appliesFrom: "2026-11-26",
});

export interface ComponentScore {
  readonly component: SmsComponent;
  /** Mean level across the component's answered elements, 0–4. */
  readonly mean: number;
  readonly answered: number;
  readonly total: number;
}

export interface MaturityResult {
  readonly components: ReadonlyArray<ComponentScore>;
  /** Mean across every ANSWERED element. Undefined until something is answered. */
  readonly mean?: number;
  readonly answered: number;
  readonly total: number;
  /** Elements at or below `gapAtOrBelow`, weakest first — the work list. */
  readonly gaps: ReadonlyArray<{ element: SmsElement; level: number }>;
  readonly complete: boolean;
}

/**
 * Score an assessment.
 *
 * NO WEIGHTS, and that is a decision rather than an omission. Weighting
 * domains requires evidence about which ones predict failure, and this
 * product does not have it. JK's scorecard weights its domains from a
 * decade of engagement history; inventing a weighting here and calling
 * it a Health Index would be borrowing the shape of that authority
 * without the thing that earned it.
 *
 * So: the mean of what has been answered, per component and overall,
 * and — the part an operator can act on — the elements that are
 * lagging, weakest first.
 *
 * Unanswered elements are EXCLUDED rather than counted as zero. A
 * half-finished assessment that reports 1.4 out of 4 is telling the
 * user about their progress through the form, not about their SMS.
 */
export function scoreAssessment(
  answers: Readonly<Record<string, number | undefined>>,
  gapAtOrBelow = 1,
): MaturityResult {
  const components = SMS_COMPONENTS.map((component) => {
    const levels = component.elements
      .map((e) => answers[e.id])
      .filter((v): v is number => typeof v === "number");
    return {
      component,
      mean: levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0,
      answered: levels.length,
      total: component.elements.length,
    };
  });

  const all = SMS_ELEMENTS.map((e) => answers[e.id]).filter(
    (v): v is number => typeof v === "number",
  );

  const gaps = SMS_ELEMENTS.map((element) => ({ element, level: answers[element.id] }))
    .filter((g): g is { element: SmsElement; level: number } => typeof g.level === "number")
    .filter((g) => g.level <= gapAtOrBelow)
    .sort((a, b) => a.level - b.level || a.element.id.localeCompare(b.element.id));

  return {
    components,
    mean: all.length ? all.reduce((a, b) => a + b, 0) / all.length : undefined,
    answered: all.length,
    total: SMS_ELEMENTS.length,
    gaps,
    complete: all.length === SMS_ELEMENTS.length,
  };
}

/** The level a score sits at, for labelling. Floor, never rounded up. */
export function levelFor(mean: number): MaturityLevel {
  const floor = Math.max(0, Math.min(4, Math.floor(mean)));
  return MATURITY_LEVELS[floor]!;
}

// =====================================================================
// COVERAGE — what this product actually implements, per element.
//
// WHY THIS IS IN CODE. An independent audit found the product claiming
// to be a safety management system while covering one and a half of
// Annex 19's twelve elements. The claim is fixed; this is the mechanism
// that stops it coming back, and the answer to the audit's own
// recommendation: publish which elements are implemented, which are
// planned, and which are out of scope.
//
// It lives beside the framework it describes, so a page cannot state a
// coverage figure the module disagrees with — and the counts on that
// page are derived here rather than typed. Charter rule 10.
//
// The states are deliberately four rather than two, because "assessed"
// and "managed" are different products and conflating them is the
// overclaim in miniature.
// =====================================================================

export type CoverageState =
  /** A person can do this work in the product today. */
  | "BUILT"
  /** Part of the element is workable; the rest is named below. */
  | "PARTIAL"
  /** The product can tell you where you stand, and cannot do the work. */
  | "ASSESSED_ONLY"
  /** Not built. The operator needs it elsewhere. */
  | "NOT_BUILT";

export interface ElementCoverage {
  readonly id: string;
  readonly state: CoverageState;
  /** What exists, in the product, today. Empty when nothing does. */
  readonly has: string;
  /** What an operator still needs and will not find here. */
  readonly missing: string;
  /** Where to go, when there is somewhere. */
  readonly href?: string;
}

export const COVERAGE: ReadonlyArray<ElementCoverage> = Object.freeze([
  {
    id: "1.1",
    state: "ASSESSED_ONLY",
    has: "The maturity assessment scores it and names the evidence.",
    missing: "A signed safety policy, and any record of the accountable executive signing it.",
    href: "/toolkits/maturity",
  },
  {
    id: "1.2",
    state: "ASSESSED_ONLY",
    has: "Eight roles exist in the data model and are enforced per action on the API.",
    missing: "An accountability matrix an operator can author, publish and evidence.",
  },
  {
    id: "1.3",
    state: "ASSESSED_ONLY",
    has: "The maturity assessment scores it.",
    missing: "Appointment records, protected time, and the evidence of independence.",
    href: "/toolkits/maturity",
  },
  {
    id: "1.4",
    state: "NOT_BUILT",
    has: "",
    missing: "The emergency response plan, its exercises, and the contact directory behind it.",
  },
  {
    id: "1.5",
    state: "NOT_BUILT",
    has: "",
    missing: "Document control: versions, approval, distribution and read-acknowledgement.",
  },
  {
    id: "2.1",
    state: "BUILT",
    has:
      "Occurrence and hazard reporting, offline, anonymous by choice, on an append-only " +
      "hash-chained record, with the regulatory window computed per jurisdiction.",
    missing:
      "Proactive and predictive identification — surveys, flight data, and the analysis " +
      "Doc 10159 asks for.",
    href: "/report",
  },
  {
    id: "2.2",
    /* STILL PARTIAL, with a register now. The register covers hazard to
       consequence to control to residual risk, with owners, review
       dates and acceptance — and it lives in one browser. A register
       the safety office cannot see is not an organisation's register,
       so the element is not claimed. It moves from "a matrix with no
       register" to "a register with no distribution", which is
       progress and is not the same as done. */
    state: "PARTIAL",
    has:
      "The Doc 9859 5x5 matrix, a risk assessor, and a risk register with initial and " +
      "residual bands, owners, review dates and acceptance — all computed by the same " +
      "scale, never stored.",
    missing:
      "Distribution. The register is held in one browser: it does not sync, the safety " +
      "office cannot see it, and nobody else can contribute to it.",
    href: "/toolkits/register",
  },
  {
    id: "3.1",
    state: "ASSESSED_ONLY",
    has: "The data model carries indicators with targets and alert levels.",
    missing: "Any way to define, record or watch one. No dashboard, no trend, no alert.",
  },
  {
    /* PARTIAL, not BUILT, and the distinction is the same one the
       register makes. /toolkits/sra produces a real safety risk
       assessment — the five Doc 9859 steps in ICAO's order, with the
       loop back from control to hazard identification, and acceptance
       blocked while any residual risk is red. That is the assessment
       half of element 3.2.

       What it is not is management OF change: no categorisation of
       which changes need one, no approval routing, no review after the
       change, and the assessment lives in one browser rather than
       being held by the organisation. An operator can produce the
       document; it cannot yet run the process around it. */
    id: "3.2",
    state: "PARTIAL",
    has:
      "A safety risk assessment for a change, in ICAO Doc 9859's five steps, with " +
      "acceptance refused while any risk remains intolerable after controls.",
    missing:
      "The process around the document: which changes require one, approval routing, " +
      "review after the change, and an assessment the organisation holds rather than " +
      "one browser.",
    href: "/toolkits/sra",
  },
  {
    /* ASSESSED_ONLY, not PARTIAL, and the correction is worth recording.
       This was marked PARTIAL because the audit chain is verifiable end
       to end — and the `missing` field on the same entry said "an audit
       trail is not an audit". Crediting the product for the chain here
       claims the element on the strength of something that is not the
       element. That is the overclaim in miniature, committed inside the
       table written to prevent it, and it was caught by the test that
       compares this arithmetic with the sentence About states. */
    id: "3.3",
    state: "ASSESSED_ONLY",
    has:
      "The maturity assessment scores it. Separately, the audit chain makes the RECORD " +
      "verifiable, which is a different thing from auditing the system.",
    missing:
      "Audit management and corrective action — scheduling, findings, owners, and " +
      "validation that a fix worked. An audit trail is not an audit.",
    href: "/toolkits/maturity",
  },
  {
    id: "4.1",
    state: "NOT_BUILT",
    has: "",
    missing: "Training records, competency tracking and expiry alerting.",
  },
  {
    id: "4.2",
    state: "NOT_BUILT",
    has: "",
    missing:
      "The loop back to the reporter. The maturity assessment asks whether people who " +
      "file hear what happened; the product provides no way to tell them.",
  },
]);

export interface CoverageSummary {
  readonly built: number;
  readonly partial: number;
  readonly assessedOnly: number;
  readonly notBuilt: number;
  readonly total: number;
  /** BUILT counts one, PARTIAL counts a half. Nothing else counts. */
  readonly elementsCovered: number;
}

/**
 * Summarise coverage.
 *
 * PARTIAL counts as a half and ASSESSED_ONLY counts as nothing, which
 * is the whole point: being able to measure an element is not covering
 * it. That arithmetic is what produces the "one and a half of twelve"
 * the About page states, and it is computed here so the sentence and
 * the table cannot disagree.
 */
export function coverageSummary(): CoverageSummary {
  const count = (state: CoverageState) => COVERAGE.filter((c) => c.state === state).length;
  const built = count("BUILT");
  const partial = count("PARTIAL");
  return {
    built,
    partial,
    assessedOnly: count("ASSESSED_ONLY"),
    notBuilt: count("NOT_BUILT"),
    total: COVERAGE.length,
    elementsCovered: built + partial / 2,
  };
}

// =====================================================================
// THE RISK REGISTER'S SHAPE.
//
// An audit named this the highest-impact, lowest-complexity addition,
// and it is right: reporting produces hazards, and a hazard nobody has
// assessed is a hazard nobody has decided about. Element 2.2 asks for
// hazard -> consequence -> control -> residual risk, with an owner and
// a closure date.
//
// The shape lives here, beside the framework it satisfies, so the
// register and the coverage claim about it cannot drift.
// =====================================================================

import { tolerability, type Severity, type Likelihood } from "./risk";

export type RiskStatus =
  /** Assessed, mitigations not yet in place. */
  | "OPEN"
  /** Controls applied; residual risk assessed and being watched. */
  | "MITIGATED"
  /** Residual risk formally accepted by somebody who can accept it. */
  | "ACCEPTED"
  /** No longer applicable — the operation changed. */
  | "CLOSED";

export interface RiskEntry {
  readonly id: string;
  readonly hazard: string;
  readonly consequence: string;
  /** Initial, before controls. */
  readonly severity: string;
  readonly likelihood: string;
  /** What is being done about it. */
  readonly controls: string;
  /** After controls. Absent until controls exist. */
  readonly residualSeverity?: string;
  readonly residualLikelihood?: string;
  readonly owner: string;
  /** ISO date. */
  readonly reviewBy: string;
  readonly status: RiskStatus;
  /** Set only when status is ACCEPTED, and by whom. */
  readonly acceptedBy?: string;
  readonly createdAt: string;
}

/**
 * The register's own health, computed.
 *
 * OVERDUE IS THE NUMBER THAT MATTERS. A register whose entries are all
 * open is a register being kept; a register whose review dates have
 * passed is a register being ignored, and an auditor reads the second
 * as worse than having no register at all. So it is counted separately
 * and first.
 *
 * `today` is passed in rather than read from the clock, because a
 * function that reads the clock cannot be tested at a boundary — and
 * "overdue" is entirely a boundary.
 */
/* ---------------------------------------------------------------
   A REGISTER ENTRY THAT CAME BACK WRONG.

   Entries live in a browser's localStorage, which is a place other
   code, other tabs, a half-finished migration and a person with the
   dev tools open can all write to. A pre-flight probe put one entry
   with no `owner` into that store and the whole register went blank:
   `owner.trim()` threw, the repaint died, and the twelve good entries
   beside it disappeared with it. Nothing in the UI could bring them
   back, because the bad entry was persisted and crashed the page again
   on every load.

   That is the worst available failure for a register — silent, total,
   and permanent — and it was caused by trusting the shape of data that
   had left our hands. So every entry is normalised on the way in, and
   the fields the arithmetic touches are guaranteed to exist. An entry
   missing a field renders with that field blank and STILL COUNTS in
   the health figures, because an entry with no owner is exactly the
   entry the unowned count exists to surface.
   --------------------------------------------------------------- */
export function normaliseEntry(raw: unknown): RiskEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== "string" || !e.id) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const opt = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const status = STATUSES.includes(e.status as RiskStatus)
    ? (e.status as RiskStatus)
    : "OPEN";
  return {
    id: e.id,
    hazard: str(e.hazard),
    consequence: str(e.consequence),
    severity: str(e.severity),
    likelihood: str(e.likelihood),
    controls: str(e.controls),
    residualSeverity: opt(e.residualSeverity),
    residualLikelihood: opt(e.residualLikelihood),
    owner: str(e.owner),
    reviewBy: str(e.reviewBy),
    status,
    acceptedBy: opt(e.acceptedBy),
    createdAt: str(e.createdAt),
  };
}

const STATUSES: readonly RiskStatus[] = ["OPEN", "MITIGATED", "ACCEPTED", "CLOSED"];

/* A review date is a calendar date in the operator's own week, not an
   instant. Read as UTC it is wrong for three hours of every Nairobi
   morning — and wrong in the flattering direction, reporting an
   overdue review as still in hand. The stamp is therefore built from
   the local calendar parts of `today`. */
export function localDayStamp(today: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

export function registerHealth(
  entries: ReadonlyArray<RiskEntry>,
  today: Date,
): {
  total: number;
  open: number;
  accepted: number;
  overdue: number;
  unowned: number;
  intolerableOpen: number;
} {
  const stamp = localDayStamp(today);
  const live = entries.filter((e) => e.status !== "CLOSED");
  return {
    total: entries.length,
    open: live.filter((e) => e.status === "OPEN").length,
    accepted: entries.filter((e) => e.status === "ACCEPTED").length,
    overdue: live.filter((e) => e.reviewBy && e.reviewBy < stamp).length,
    // An entry nobody owns is an entry nobody will do anything about,
    // and it is the most common defect in a real operator's register.
    unowned: live.filter((e) => !(e.owner ?? "").trim()).length,
    /* Intolerable AFTER controls, still not accepted. This is the line
       an inspector goes to first, and it is computed from the same
       tolerability() the matrix and the assessor use — never stored,
       so it cannot disagree with the scale. Residual where there is
       one, initial where there is not: an entry with no controls yet
       is carrying its initial risk, and rounding that down would be
       the flattering direction. */
    intolerableOpen: live
      .filter((e) => e.status !== "ACCEPTED")
      .filter((e) => {
        const sev = e.residualSeverity ?? e.severity;
        const lik = e.residualLikelihood ?? e.likelihood;
        if (!sev || !lik) return false;
        try {
          return tolerability(sev as Severity, lik as Likelihood) === "INTOLERABLE";
        } catch {
          return false;
        }
      }).length,
  };
}
