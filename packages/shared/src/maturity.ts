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
