// UK CAA SET-I criterion registry.
//
// This is a product-owned index of the supplied SET-I, not a substitute
// for the CAA tool or an assertion of regulatory compliance. It makes
// every assessment item addressable and ensures a score is always tied to
// evidence, an owner, and a review date.
export const SETI_LEVELS = ["PRESENT", "SUITABLE", "OPERATING", "EFFECTIVE"] as const;
export type SetiLevel = (typeof SETI_LEVELS)[number];

export type SetiCriterion = {
  id: string;
  section: string;
  title: string;
};

const criteria = (section: string, entries: readonly [string, string][]): SetiCriterion[] =>
  entries.map(([id, title]) => ({ id, section, title }));

export const SETI_CRITERIA: readonly SetiCriterion[] = Object.freeze([
  ...criteria("0 Foundations of SMS", [
    ["0.1.1", "Leadership commitment and culture"],
    ["0.1.2", "Just Culture"],
    ["0.1.3", "Reporting culture"],
    ["0.1.4", "Learning culture"],
    ["0.1.5", "Assessing the safety culture"],
    ["0.2.1", "Organisational and human factors in risk management"],
    ["0.2.2", "Human factors in change"],
    ["0.2.3", "Wellbeing and support available to staff"],
    ["0.2.4", "Human and organisational factors training"],
  ]),
  ...criteria("1 Safety Policy", [
    ["1.1.1", "Endorsed safety policy"],
    ["1.1.2", "Safety policy and resource"],
    ["1.1.3", "Supporting policies"],
    ["1.2.1", "Accountable Manager"],
    ["1.2.2", "Accountable Manager suitability"],
    ["1.2.3", "Documented authority for SMS"],
    ["1.3.1", "Safety Manager"],
    ["1.3.2", "SMS resourcing"],
    ["1.3.3", "Safety committee(s)"],
    ["1.4.1", "Emergency response plan"],
    ["1.4.2", "Emergency response plan testing"],
    ["1.5.1", "Scope and availability of documentation and records"],
    ["1.5.2", "Documentation and records control"],
  ]),
  ...criteria("2 Risk Management", [
    ["2.1.1", "Reporting system(s)"],
    ["2.1.2", "Reporting management"],
    ["2.2.1", "Safety investigations"],
    ["2.3.1", "Hazard identification and safety data sourcing"],
    ["2.3.2", "Safety data analysis"],
    ["2.4.1", "Management of risk"],
    ["2.4.2", "Acceptable levels of safety"],
    ["2.4.3", "Effective risk controls"],
    ["2.4.4", "NASP alignment"],
  ]),
  ...criteria("3 Assurance", [
    ["3.1.1", "Safety objectives"],
    ["3.1.2", "Safety performance indicators"],
    ["3.1.3", "Risk control assurance"],
    ["3.2.1", "Management of change"],
    ["3.3.1", "SMS continuous improvement"],
  ]),
  ...criteria("4 Promotion", [
    ["4.1.1", "Initial and recurrent training"],
    ["4.1.2", "Training effectiveness"],
    ["4.1.3", "Competence evaluation"],
    ["4.2.1", "Safety policy promotion"],
    ["4.2.2", "Safety-critical information"],
    ["4.2.3", "Promoting feedback"],
  ]),
  ...criteria("5 Interface Management", [
    ["5.1.1", "Critical internal and external interfaces"],
    ["5.1.2", "Interface collaboration"],
  ]),
  ...criteria("6 Compliance", [
    ["6.1.1", "Compliance responsibilities and accountabilities"],
    ["6.1.2", "Compliance focal point(s)"],
    ["6.1.3", "Monitoring programme"],
    ["6.1.4", "Compliance monitoring performance and outcomes"],
  ]),
]);

export const SETI_BY_ID = new Map(SETI_CRITERIA.map((criterion) => [criterion.id, criterion]));
