// =====================================================================
// The published artefacts an operator can build its SMS from.
//
// WHY THIS EXISTS. A small operator's real obstacle is rarely that it
// disagrees with Annex 19. It is that twelve elements is an enormous
// blank page, and the templates that would fill it are scattered across
// three authorities' websites in formats nobody links together. This
// registry is the index nobody publishes.
//
// WE LINK, WE DO NOT HOST — and the reason is not bandwidth.
//
//   · a template served from here is a template that goes stale here.
//     CASA revises these; a copy taken today is a copy that will be
//     wrong later, and the operator will not know which. The same
//     argument that makes this product compute deadlines instead of
//     storing them applies to somebody else's document;
//   · of the artefacts below, only the SMS Evaluation Tool guidance
//     carries an explicit CC BY 4.0 grant in the copy we read. The
//     rest state no licence we have verified. Redistributing them
//     would mean asserting a permission we have not established, which
//     is the same class of act as publishing a deadline no instrument
//     supports.
//
// THESE ARE NOT KENYAN LAW, and the page says so before it says
// anything else. CASA's templates are structure worth copying; they
// are made under Australian regulations. A Kenyan operator is governed
// by the Civil Aviation (Safety Management) Regulations and answers to
// KCAA. Using an Australian template is good practice. Citing one to
// an inspector as the requirement is the same mistake as the 72-hour
// deadline this product was built to correct.
// =====================================================================

export interface SmsTemplate {
  readonly id: string;
  readonly title: string;
  /** Who published it. Not "CASA" alone — the country matters here. */
  readonly publisher: string;
  /** Document number, version and date, so a reader can tell it apart. */
  readonly reference: string;
  /** Where the publisher keeps it. Never a copy held here. */
  readonly url: string;
  /** What it is for, in one sentence. */
  readonly purpose: string;
  /** Annex 19 element ids it serves. `ALL` means the whole framework. */
  readonly elements: ReadonlyArray<string> | "ALL";
  /** What this product already does against it. */
  readonly weHold: string;
  /**
   * What it does not do — the part the operator still has to go and
   * get. Never blank: a template listed with nothing missing is a
   * claim, and this registry makes none.
   */
  readonly youStillNeed: string;
}

export const TEMPLATES: ReadonlyArray<SmsTemplate> = Object.freeze([
  {
    id: "gap-analysis",
    title: "SMS gap analysis and implementation planning tool",
    publisher: "CASA (Australia)",
    reference: "CASA-04-6210, V1, March 2023",
    url: "https://www.casa.gov.au/sms-gap-analysis-and-implementation-planning-tool",
    purpose:
      "Assess each element against indicators of compliance and performance, then turn " +
      "everything found partially or not present into an action plan with owners, dates " +
      "and phases.",
    elements: "ALL",
    weHold:
      "The maturity assessment is this, computed. It grades every element, derives the " +
      "phasing from the prerequisite rule rather than asking you to invent one, and " +
      "carries the same action-plan columns: element, action, resources, responsible " +
      "person, target date, phase.",
    youStillNeed:
      "The indicator-level detail. CASA's tool asks up to nine questions per element " +
      "where this asks one, so the paper version is the finer instrument — use it when " +
      "an element comes back weak and you need to know which part of it.",
  },
  {
    id: "evaluation-tool",
    title: "SMS evaluation tool and guidance",
    publisher: "CASA (Australia), adopted from the Safety Management International Collaboration Group",
    reference: "Form 1591 V3.0, CASA-04-1388, October 2024 · CC BY 4.0",
    url: "https://www.casa.gov.au/safety-management-system-sms-evaluation-tool-and-guidance",
    purpose:
      "How an evaluator judges an SMS: Present, Suitable, Operating, Effective, and the " +
      "rule that nothing is Present until it is documented.",
    elements: "ALL",
    weHold:
      "The four levels and the prerequisite rule, quoted verbatim and attributed, on the " +
      "maturity assessment. The rule is what orders the implementation plan.",
    youStillNeed:
      "The evaluation itself. SM ICG advises that an SMS not be scored at all, and this " +
      "product does not run an evaluation against you — it helps you run one on yourself.",
  },
  {
    id: "smsm",
    title: "Safety management system sample manual (SMSM)",
    publisher: "CASA (Australia)",
    reference: "For Part 119 and Part 138 CASR",
    url: "https://www.casa.gov.au/resources-and-education/publications/industry-guides/safety-kits/resource-kit-develop-your-safety-management-system",
    purpose:
      "A worked manual structured on the four components and twelve elements, with the " +
      "front matter a controlled document needs: revision history, distribution list, " +
      "glossary.",
    elements: ["1.5"],
    weHold:
      "The document register: reference, version, approver, approval date and review " +
      "date, which is the part an audit checks.",
    youStillNeed:
      "The manual. This product is not a document store and does not pretend to be one — " +
      "it records the control, not the text.",
  },
  {
    id: "erp",
    title: "Emergency response plan (ERP) template",
    publisher: "CASA (Australia)",
    reference: "For Part 119 and Part 138 SMSM",
    url: "https://www.casa.gov.au/resources-and-education/publications/industry-guides/safety-kits/resource-kit-develop-your-safety-management-system",
    purpose:
      "Activation criteria, the emergency contact directory, roles from the accountable " +
      "executive down, response actions and post-crisis management.",
    elements: ["1.4"],
    weHold:
      "The exercise record: the scenario, who took part, what it found, and whether the " +
      "plan changed as a result.",
    youStillNeed:
      "The plan itself, and the contact directory behind it. A directory in a binder in " +
      "the office is not a directory at four in the morning at a strip.",
  },
  {
    id: "resource-kit",
    title: "Safety management systems for aviation: a practical guide",
    publisher: "CASA (Australia)",
    reference: "Nine booklets, one per component plus human factors and RPAS",
    url: "https://www.casa.gov.au/resources-and-education/publications/industry-guides/safety-kits/resource-kit-develop-your-safety-management-system",
    purpose:
      "The reading behind the templates. Booklet 1 opens on the distinction between " +
      "aviation safety and people safety, before the ICAO framework, because that is the " +
      "one small operators get wrong first.",
    elements: "ALL",
    weHold:
      "That distinction, in the questions page, built around the compound hazard rather " +
      "than left as a definition.",
    youStillNeed:
      "The rest of it. Nine booklets is a week of reading and it is the best free SMS " +
      "material published by any authority.",
  },
  {
    id: "doc-9859",
    title: "Safety Management Manual (Doc 9859)",
    publisher: "ICAO",
    reference: "Fourth edition",
    url: "https://www.icao.int/safety/SafetyManagement/Pages/GuidanceMaterial.aspx",
    purpose:
      "The source the rest of these are derived from: the risk matrix, the five-step " +
      "safety risk management cycle, and what each element means.",
    elements: "ALL",
    weHold:
      "The matrix and the five steps, computed rather than reproduced — the methodology " +
      "page renders them from the module the report form scores against, so the two " +
      "cannot drift.",
    youStillNeed:
      "The manual, for anything past the matrix. It is the document your inspector read.",
  },
]);

/**
 * Elements with at least one template listed against them.
 *
 * `ALL` counts for every element, which is why this is computed rather
 * than typed: four of the six entries are whole-framework documents,
 * and hand-counting that produces a number that is right once.
 */
export function elementsWithTemplate(allElementIds: ReadonlyArray<string>): string[] {
  const covered = new Set<string>();
  for (const template of TEMPLATES) {
    if (template.elements === "ALL") {
      for (const id of allElementIds) covered.add(id);
    } else {
      for (const id of template.elements) covered.add(id);
    }
  }
  return [...covered].sort();
}
