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

  /* WHERE THE SCORING RULE COMES FROM, since it is not ours.

     The scale above is this product's articulation and is labelled as
     such wherever it appears. The rule that an assessment is positioned
     at its WEAKEST element rather than its average is not — it follows
     the SM ICG SMS Evaluation Tool, whose stated expectation is that
     all individual indicators reach at least "operating" and that
     effectiveness is achieved in all of the elements.

     Named here so the screen can cite it. Deliberately NOT claimed as a
     mapping between our five levels and SM ICG's four: a correspondence
     between "Practised" and "Operating" would be our reading, and
     presenting our reading as SM ICG's is the same invented authority
     this module already refuses to claim for the scale itself. */
  scoringBasis:
    "SM ICG SMS Evaluation Tool — adopted by CASA as Form 1591 V3. It expects every " +
    "element to be at least operating, which is why this assessment reports the weakest " +
    "element rather than an average.",
  scoringBasisUrl: "https://www.casa.gov.au/safety-management-system-sms-evaluation-tool-and-guidance",
});

/**
 * SM ICG's four levels, quoted rather than paraphrased.
 *
 * Read from the primary document — CASA Safety Management System (SMS)
 * Evaluation Tool and Guidance, V 3.0, CASA-04-1388, October 2024,
 * published under Creative Commons Attribution 4.0 International, which
 * is why it can be quoted here with the attribution below.
 *
 * NOT YET THIS PRODUCT'S SCALE, and the gap is deliberate. Ours has
 * five levels and this has four, and they do not correspond one to one
 * — see SUITABLE below, which is not a rung on a maturity ladder at
 * all. Adopting PSOE is a decision about what the assessment IS, not a
 * relabelling, and it changes a customer-facing figure. Held here as
 * the authority the scoring rule already cites, so that decision is
 * made against the real text and not against a summary of it.
 */
export const SM_ICG_LEVELS = Object.freeze([
  {
    code: "P",
    label: "Present",
    definition:
      "There is evidence that the relevant indicator is documented within the " +
      "organisation's SMS documentation.",
  },
  {
    code: "S",
    label: "Suitable",
    /* THE ONE THAT IS NOT A MATURITY RUNG.
       Suitability is graded against the operator — its size, nature,
       complexity and inherent risk — not against a fixed bar. A
       six-turboprop AOC and a widebody carrier can both be Suitable
       while holding visibly different things, which is this product's
       entire market thesis written into a regulator's grading scheme
       rather than into our marketing. It pairs with the scaling
       guidance in CASA's SMS Book 7, and it is why PSOE cannot simply
       be mapped onto a five-point ladder. */
    definition:
      "The relevant indicator is suitable based on the size, nature, and complexity of " +
      "the organisation and the inherent risk in its activity.",
  },
  {
    code: "O",
    label: "Operating",
    definition:
      "There is evidence that the relevant indicator is in use and an output is being produced.",
  },
  {
    code: "E",
    label: "Effective",
    definition:
      "There is evidence that the relevant indicator is achieving the desired outcome and " +
      "has a positive safety impact.",
  },
]);

/**
 * The prerequisite rule, and the reason the assessment reports its
 * weakest element rather than an average. Quoted for the same reason
 * the levels are: this is the sentence the scoring rule rests on.
 */
export const SM_ICG_PREREQUISITE =
  "An item cannot be considered Operating or Effective if it is not Present and it cannot " +
  "be considered as Present if it is not documented — documentation ensures consistent " +
  "repeatable and systematic outcomes.";

/** When each half of the scale applies, per the same guidance. */
export const SM_ICG_STAGES =
  "Present and Suitable are generally used for initial approval or certification. " +
  "Operating and Effective are expected to be found in a functioning SMS.";

export const SM_ICG_ATTRIBUTION = Object.freeze({
  title: "CASA Safety Management System (SMS) Evaluation Tool and Guidance",
  version: "V 3.0",
  reference: "CASA-04-1388",
  issued: "2024-10",
  licence: "CC BY 4.0",
  readOn: "2026-08-12",
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

  /**
   * THE POSITION AN OPERATOR CAN ACTUALLY DEFEND, which is the level of
   * its WEAKEST answered element — not the average of all twelve.
   *
   * The mean above is compensatory: eleven elements at Improving and
   * one at Absent averages 3.67, labels as "Measured", and reads as a
   * healthy SMS while a twelfth of it does not exist. An auditor does
   * not average. They find the element that is missing and write it up.
   *
   * This follows the SM ICG SMS Evaluation Tool — the instrument CASA
   * has adopted wholesale as Form 1591 — whose stated expectation is
   * that ALL individual indicators reach at least "operating" and that
   * effectiveness is achieved in ALL of the elements. A framework whose
   * pass condition is universal cannot be reported by an average.
   *
   * Undefined until every element is answered: the weakest of four
   * answers is not the weakest of twelve, and reporting it as though it
   * were would be the same overclaim in the opposite direction.
   */
  readonly position?: number;

  /**
   * The elements sitting AT that position — what is holding the whole
   * assessment where it is, and therefore the only work that can move
   * it. Improving anything else changes the mean and not the position.
   */
  readonly limitedBy: ReadonlyArray<SmsElement>;

  /**
   * Elements the operator judged NOT SUITABLE for its operation,
   * whatever level they sit at. Never scored and never counted as gaps
   * — suitability is a different question from maturity, and merging
   * them would lose the only case a maturity ladder cannot express: an
   * element taken a long way and still wrong for this operator.
   */
  readonly unsuitable: ReadonlyArray<SuitabilityFinding>;
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
/**
 * How big and how complicated the operator is.
 *
 * SM ICG grades SUITABLE against "the size, nature, and complexity of
 * the organisation and the inherent risk in its activity" — so a
 * product that asks whether an SMS is suitable and never asks who it
 * belongs to is asking half a question. CASA's SMS Book 7 (Scaling for
 * size and complexity) puts the small, non-complex band at ten or fewer
 * people, which is not a rounding of the market this product is for; it
 * IS the market.
 *
 * Bands rather than a headcount box, because the judgement this feeds
 * is qualitative and a number invites false precision — an operator
 * with eleven staff is not categorically different from one with nine.
 */
export const OPERATOR_SCALES = Object.freeze([
  {
    id: "SMALL_NON_COMPLEX",
    label: "Small and non-complex",
    meaning:
      "Around ten people or fewer, one operating model, and a safety manager who holds " +
      "the post alongside another job.",
  },
  {
    id: "SMALL",
    label: "Small",
    meaning: "Under about fifty people, a single certificate, and a settled route or task mix.",
  },
  {
    id: "MEDIUM",
    label: "Medium",
    meaning:
      "Several operating models or certificates, or a fleet mixed enough that one procedure " +
      "does not cover it.",
  },
  {
    id: "COMPLEX",
    label: "Large or complex",
    meaning:
      "Multiple bases or certificates, contracted operations, or an activity whose inherent " +
      "risk is high regardless of headcount.",
  },
]);
export type OperatorScale = (typeof OPERATOR_SCALES)[number]["id"];

/**
 * Whether what the operator holds is SUITABLE for the operator.
 *
 * Deliberately separate from the level. A level says how far an element
 * has been taken; suitability says whether that is the right amount for
 * this operation — and the two genuinely come apart in both directions.
 * A six-aircraft charter running an airline's procedure set is at a
 * high level and unsuitable, because nobody follows it. A one-page
 * emergency plan at a small strip can be entirely suitable.
 *
 * Recorded per element, and unanswered is a real third state: it is the
 * question most operators have never been asked, and defaulting it
 * either way would invent an answer.
 */
export type Suitability = "SUITABLE" | "NOT_SUITABLE" | undefined;

export interface SuitabilityFinding {
  readonly element: SmsElement;
  readonly level: number;
  /** True when the element is well developed AND judged unsuitable. */
  readonly overBuilt: boolean;
}

export function scoreAssessment(
  answers: Readonly<Record<string, number | undefined>>,
  gapAtOrBelow = 1,
  suitability: Readonly<Record<string, Suitability>> = {},
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

  /* Only once every element has been answered — see `position` on
     MaturityResult. The weakest of four answers says nothing about an
     SMS of twelve elements. */
  const complete = all.length === SMS_ELEMENTS.length;
  const position = complete ? Math.min(...all) : undefined;
  const limitedBy = complete
    ? SMS_ELEMENTS.filter((e) => answers[e.id] === position)
    : [];

  /* Suitability findings, which are NOT gaps and are not scored.
     Scoring them would collapse the distinction the split exists to
     make — and SM ICG's own guidance is that this evaluation should not
     be scored at all. They are reported as findings an operator can act
     on, which is what the guidance uses them for.

     `overBuilt` marks the case worth naming: an element taken to
     Practised or beyond and judged unsuitable. That is not an operator
     behind on its SMS; it is one carrying a system built for somebody
     else, which is the failure mode this product exists to argue
     against and the one a maturity ladder alone cannot see. */
  const unsuitable: SuitabilityFinding[] = SMS_ELEMENTS
    .filter((e) => suitability[e.id] === "NOT_SUITABLE")
    .map((element) => {
      const level = answers[element.id];
      return {
        element,
        level: typeof level === "number" ? level : 0,
        overBuilt: typeof level === "number" && level >= 2,
      };
    });

  return {
    components,
    mean: all.length ? all.reduce((a, b) => a + b, 0) / all.length : undefined,
    answered: all.length,
    total: SMS_ELEMENTS.length,
    gaps,
    complete,
    position,
    limitedBy,
    unsuitable,
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
// Annex 19's twelve elements. It now covers nine, and the same
// arithmetic reports both — which is the point of computing it. The claim is fixed; this is the mechanism
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
  /**
   * The API routes that hold this element's records for the operator,
   * when any do.
   *
   * WHY A FIELD AND NOT A SENTENCE. This table separates BUILT from
   * PARTIAL on one distinction — whether the records are held on the
   * server or on a handset — and for half a day element 2.2 said the
   * register "lives in one browser… the safety office cannot see it"
   * while /api/v1/register was live in production. Three false clauses
   * on the one surface whose job is honest disclosure, understating
   * the product to a regulator, with nothing able to notice because
   * `state` and `missing` are prose.
   *
   * Naming the routes turns the distinction into something checkable:
   * scripts/check-claims.mjs asserts every route here is registered by
   * the API, that a BUILT element which is not purely a calculator
   * names at least one, and — the half that would have caught this —
   * that an element naming routes does not simultaneously claim in
   * `missing` that nothing is held for the operator.
   */
  readonly serverRoutes?: ReadonlyArray<string>;
}

export const COVERAGE: ReadonlyArray<ElementCoverage> = Object.freeze([
  /* The eight entries that follow moved on the strength of /sms, which
     holds them ON THE SERVER rather than on the handset. That is the
     distinction this table has used throughout to separate BUILT from
     PARTIAL, and it is the reason these move and the browser-held
     toolkits below do not. Each still states what it does not do. */
  {
    id: "1.1",
    state: "BUILT",
    serverRoutes: ["/api/v1/sms/policy"],
    has:
      "A safety policy the operator authors, signed by the accountable executive and by " +
      "nobody else, superseded rather than edited so an auditor can read what it said " +
      "when a decision was taken, with acknowledgements counted per person.",
    missing:
      "Reaching a person who never signs in. The product records who has read the " +
      "policy; it does not deliver it to somebody who only ever files reports.",
    href: "/sms",
  },
  {
    id: "1.2",
    state: "BUILT",
    serverRoutes: ["/api/v1/sms/accountabilities"],
    has:
      "An accountability matrix the operator authors — each post, what it answers for, " +
      "and the Annex 19 element it discharges — held by the organisation and readable " +
      "by an inspector it invites.",
    missing:
      "The half the matrix cannot evidence. This element is met when each person can " +
      "say what they are accountable for WITHOUT reading it off a chart, and a chart " +
      "is the one thing software can produce. Nothing here reaches the job " +
      "descriptions, and nothing here can ask four people separately.",
    href: "/sms",
  },
  {
    id: "1.3",
    state: "BUILT",
    serverRoutes: ["/api/v1/sms/appointments"],
    has:
      "Appointment records against each post, with the appointment letter's reference, " +
      "and a successor's appointment ending the incumbent's rather than sitting " +
      "alongside it.",
    missing:
      "Independence, which the product records an assertion of and cannot evidence: " +
      "protected time and direct access to the accountable executive are facts about " +
      "an operator's week, not rows in a database.",
    href: "/sms",
  },
  {
    id: "1.4",
    /* PARTIAL, and the half that is missing is the larger one. What the
       product holds is the EXERCISE record — that one was held, what it
       found, and whether the plan changed as a result, which is the
       question an inspector actually asks. What it does not hold is the
       plan being exercised, or the contact directory whose eleven
       months out of date is the finding this record exists to capture. */
    state: "PARTIAL",
    serverRoutes: ["/api/v1/sms/exercises"],
    has:
      "Emergency response exercises: the scenario, who took part, what it found, and " +
      "whether the plan was changed as a result.",
    missing:
      "The plan itself and the contact directory behind it. The product records that " +
      "an operator exercised a plan; it does not hold the plan.",
    href: "/sms",
  },
  {
    id: "1.5",
    /* PARTIAL for the same reason: the CONTROL is here and the
       documents are not. Reference, version, approver and review date
       are what document control means as a discipline, and they are the
       part an audit checks. The product is not a document store, and
       claiming the element outright would say it was. */
    state: "PARTIAL",
    serverRoutes: ["/api/v1/sms/documents"],
    has:
      "A controlled document register — reference, revision, approver, review date \u2014 " +
      "with a supersession that retires the previous revision, and a record of who has " +
      "read the revision NOW IN FORCE. Reading one revision does not mark anybody as " +
      "having read the next.",
    missing:
      "The documents themselves. The product controls the register and the distribution " +
      "record; it does not store the content, so the manual still lives wherever the " +
      "operator keeps it and this points at which revision that should be.",
    href: "/sms",
  },
  {
    id: "2.1",
    state: "BUILT",
    serverRoutes: ["/api/v1/sync/batch"],
    has:
      "Occurrence and hazard reporting, offline, anonymous by choice, on an append-only " +
      "hash-chained record, with the regulatory window computed per jurisdiction.",
    missing:
      "Proactive and predictive identification — surveys, flight data, and the analysis " +
      "Doc 10159 asks for. And somewhere to record the six things regulation 13(3) of " +
      "L.N. 32/2026 requires a voluntary reporting system to define: /methodology now " +
      "quotes all six with their sub-paragraphs, and the answers are the operator's own " +
      "to write down elsewhere until this holds them.",
    href: "/report",
  },
  {
    id: "2.2",
    /* MOVED TO BUILT, and the reason is the one this table has used
       throughout rather than a fresh judgement: the register is held
       ON THE SERVER now, not on the handset.

       THIS ENTRY WAS WRONG FOR HALF A DAY AND NOTHING NOTICED. It read
       "it lives in one browser… it does not sync, the safety office
       cannot see it, and nobody else can contribute to it" — three
       clauses, all of them false from the moment /api/v1/register
       shipped. The surface whose entire job is honest disclosure was
       understating the product to the one reader who most needs it
       accurate, and no gate had an opinion because `state` and
       `missing` are prose.

       That is what `serverRoutes` below now exists to stop, and the
       reason it is a field rather than a promise. */
    state: "BUILT",
    serverRoutes: ["/api/v1/register"],
    has:
      "The Doc 9859 5x5 matrix, a risk assessor, and a risk register with initial and " +
      "residual bands, owners, review dates and acceptance — held for the operator so " +
      "the safety office can read it and an inspector can be shown it, with the bands " +
      "computed by the same scale the matrix renders.",
    missing:
      "Hazards reaching it from the reporting queue rather than being typed again — a " +
      "register entry still records where it came from so that difference stays " +
      "visible. Deletion does not synchronise either: an entry removed on one device " +
      "reappears from the server on another, which is the safe direction and not the " +
      "finished one.",
    href: "/toolkits/register",
  },
  {
    /* PARTIAL, on the same test the register and the SRA are held to.
       /toolkits/spi does the measurement half of the element properly:
       indicators with a consequence class, a rate on a stated basis, a
       target, and alert levels computed from the operator's own history
       rather than picked — with every period judged against the periods
       that preceded it and never against a baseline containing itself.

       What it is not is monitoring BY THE ORGANISATION. The indicators
       live in one browser, they are not fed from the reporting queue
       that sits in the same product, and element 3.1's second half —
       "a record of what happened the last time an alert level was
       crossed" — has nowhere to live. An operator can watch an
       indicator; the organisation cannot yet be shown to have. */
    id: "3.1",
    /* MOVED TO BUILT, against the element's OWN evidence definition
       rather than against a feeling that it looks finished. 3.1 asks
       for "indicators with a defined trigger, and a record of what
       happened the last time one was crossed". The trigger has been
       here since alertLevels() landed; the record arrived with
       /api/v1/spi/:id/periods/:periodId/action, attached to the period
       rather than to a level so that charter rule 6 still holds — the
       level is derived on every read and never stored.

       WHAT IS DELIBERATELY NOT TREATED AS BLOCKING. "Indicators fed
       from the reporting queue rather than typed in" was named in the
       old missing text and is genuinely absent, but it is not in this
       element's evidence definition and never was. Holding an element
       PARTIAL against a requirement the framework does not make is the
       mirror of overclaiming, and it is what had 2.2 understating the
       product for half a day. It stays named below as work, not as a
       gap in the element. */
    state: "BUILT",

    serverRoutes: ["/api/v1/spi"],
    has:
      "Safety performance indicators with targets, and alert levels computed from " +
      "the operator's own baseline at one, two and three standard deviations, with " +
      "the three crossing criteria evaluated per period.",
    missing:
      "Indicators fed from the reporting queue rather than typed in \u2014 the counts " +
      "are the operator's own, entered by hand, so an indicator can disagree with the " +
      "reports behind it until somebody reconciles them. Not part of this element's " +
      "evidence, and real work all the same.",
    href: "/toolkits/spi",
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
    /* MOVED TO BUILT against the element's own evidence: "a change
       assessment for the most recent significant change, DATED BEFORE
       IT HAPPENED". The assessment is now held by the organisation
       rather than one browser, and the route REFUSES one dated after
       its own change took effect — accepting that would let the product
       manufacture the evidence this element exists to test for.

       Approval is a separate act from assessment, separately
       permissioned, and refused outright while the residual position
       is intolerable. The review after the change is recorded, which
       is the half operators most often skip and the reason 3.2 is not
       discharged by assessing. */
    state: "BUILT",
    serverRoutes: ["/api/v1/changes"],
    has:
      "A change assessment the organisation holds — trigger, description, the Doc 9859 " +
      "position before and after controls, an approval by a different post from the one " +
      "that wrote it, and the review after the change. Refused if dated after the change " +
      "took effect, and refused approval while the residual risk is intolerable.",
    missing:
      "Which changes require one. The product assesses the change an operator brings " +
      "it; it does not know an operator's own threshold for significance, and a tool " +
      "that guessed would either flood the register or miss the change that mattered.",
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
    /* BUILT, and the correction above still stands: the audit CHAIN is
       not the audit, and none of this claim rests on it. What moved the
       element is findings with owners and due dates, a corrective
       action, a closure, and a verification that a different role
       performs — because a safety manager verifying their own finding
       closed is the finding, not the evidence. */
    state: "BUILT",
    serverRoutes: ["/api/v1/sms/findings"],
    has:
      "Internal audit findings with a severity, an owning post and a due date; the " +
      "corrective action taken; closure; and verification by key management rather than " +
      "by whoever raised and closed it.",
    missing:
      "The audit programme's schedule. The product holds what an audit found and what " +
      "was done about it, not when the next one falls due.",
    href: "/sms",
  },
  {
    id: "4.1",
    /* PARTIAL. The RECORD is here — who was trained, in what, when, and
       when it lapses, with a frontline reporter seeing their own row
       and nobody else's. What is not here is the part that makes a
       training matrix useful, which is being told before the expiry
       rather than after it. */
    state: "PARTIAL",
    serverRoutes: ["/api/v1/sms/training"],
    has:
      "A training matrix: person, course, completion and expiry, with each person's own " +
      "record visible to them and the whole matrix to those who manage it.",
    missing:
      "Reaching somebody who does not open the screen. The matrix now anticipates \u2014 " +
      "each row is current, lapsing soon or lapsed, against a window proportional to " +
      "its own validity, with the count and the next lapse stated above the list. What " +
      "it does not do is arrive: there is no digest, no email and no push, so a currency " +
      "still lapses quietly for an operator who does not look.",
    href: "/sms",
  },
  {
    id: "4.2",
    state: "BUILT",
    serverRoutes: ["/api/v1/sms/communications"],
    has:
      "Safety communication the operator publishes, and feedback attached to the report " +
      "that prompted it — refused against an anonymous report, because a row joining " +
      "feedback to an anonymous filing is the re-identification the product exists to " +
      "prevent.",
    missing:
      "Whether any of it landed. A bulletin is published and nobody has to acknowledge " +
      "it — the policy counts its readers and this does not. And a reporter who filed " +
      "anonymously is unreachable by design, so the loop closes for everyone except " +
      "the people most likely to have needed the protection.",
    href: "/sms",
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
 * it. That arithmetic is what produced the "one and a half of twelve"
 * the About page once stated and the "nine of twelve" it states now,
 * and it is computed here so the sentence and the table cannot
 * disagree — in either direction.
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
