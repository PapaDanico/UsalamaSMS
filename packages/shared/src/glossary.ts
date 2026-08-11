// =====================================================================
// The safety-management vocabulary, from the source.
//
// Transcribed from the KCAA course glossary (ICAO Annex 19 / Doc 9859
// definitions as adopted into Kenyan practice), not paraphrased. Two
// things in this product depend on getting these exactly right and they
// pull in opposite directions:
//
//   · THE DE-IDENTIFIER must not scrub them. "AOC", "SMS", "FDA" and
//     "SPI" look exactly like the two- and three-letter prefixes of a
//     flight number, and a redactor that turns "the AOC holder" into
//     "the [FLT] holder" has destroyed the sentence it was protecting.
//   · THE REPORT FORM must use them as the operator's own words. A
//     frontline reporter classifying an occurrence is applying a legal
//     test whether they know it or not, and the difference between an
//     accident and a serious incident is, in the glossary's own words,
//     "only in the result".
//
// This is the single source for both. A term that exists here and
// nowhere else is a term the product knows; a term used elsewhere and
// absent here is a term somebody invented at a call site.
// =====================================================================

/**
 * Abbreviations a safety narrative legitimately contains.
 *
 * Kept as a plain list of the ACRONYM ONLY. The expansions are below;
 * the de-identifier needs the tokens and nothing else, and a Map would
 * make it iterate an object to answer a set question.
 */
export const SMS_ACRONYMS: Readonly<Record<string, string>> = Object.freeze({
  AAID: "Aircraft Accident Investigation Department",
  ADREP: "Accident/incident data reporting",
  AIA: "Accident investigation authority",
  ALARP: "As low as reasonably practicable",
  ALOSP: "Acceptable level of safety performance",
  AMO: "Approved maintenance organisation",
  ANS: "Air navigation services",
  AOC: "Air operator certificate",
  ATO: "Approved training organisation",
  ATS: "Air traffic service(s)",
  CAA: "Civil aviation authority",
  CAST: "Commercial Aviation Safety Team",
  CICTT: "CAST/ICAO Common Taxonomy Team",
  CVR: "Cockpit voice recorder",
  D3M: "Data-driven decision-making",
  ERP: "Emergency response plan",
  FDA: "Flight data analysis",
  FDR: "Flight data recorder",
  FRMS: "Fatigue risk management system",
  GASP: "Global aviation safety plan",
  ICAO: "International Civil Aviation Organization",
  ISTARS: "Integrated safety trend analysis and reporting system",
  KCAA: "Kenya Civil Aviation Authority",
  LOSA: "Line operations safety audit",
  MOT: "Ministry of Transport",
  OHSMS: "Occupational health and safety management system",
  OSHE: "Occupational safety, health and environment",
  PIRG: "Planning and implementation regional group",
  QMS: "Quality management system",
  RASG: "Regional aviation safety group",
  RSOO: "Regional safety oversight organization",
  SAG: "Safety action group",
  SARPS: "Standards and Recommended Practices",
  SDCPS: "Safety data collection and processing system",
  SEMS: "Security management system",
  SMM: "Safety management manual",
  SMP: "Safety Management Panel",
  SMS: "Safety management system",
  SPI: "Safety performance indicator",
  SPT: "Safety performance target",
  SRB: "Safety review board",
  SRC: "Safety review committee",
  SRBS: "Safety risk-based surveillance",
  SRM: "Safety risk management",
  SSO: "State safety oversight",
  SSP: "State safety programme",
  TNA: "Training needs analysis",
  USOAP: "Universal Safety Oversight Audit Programme",
});

/**
 * THE OCCURRENCE CLASSIFICATION TEST.
 *
 * Quoted rather than summarised. A frontline reporter deciding between
 * these is applying a legal test, and a paraphrase that drifts is a
 * paraphrase that misclassifies — which for an accident means a State
 * investigation that does not start.
 *
 * `reportable` marks the classes that carry a mandatory occurrence
 * report. It is deliberately NOT derived from the type dropdown: the
 * dropdown records what the reporter chose to call it, and this records
 * what the instrument says it is.
 */
export interface OccurrenceClass {
  readonly key: "ACCIDENT" | "SERIOUS_INCIDENT" | "INCIDENT";
  readonly label: string;
  /** The short form a reporter can act on, in their own language. */
  readonly test: string;
  readonly reportable: boolean;
  /** The distinguishing note from the glossary, where there is one. */
  readonly note?: string;
}

export const OCCURRENCE_CLASSES: ReadonlyArray<OccurrenceClass> = Object.freeze([
  {
    key: "ACCIDENT",
    label: "Accident",
    test:
      "Someone was killed or seriously injured, the aircraft was damaged in a way " +
      "that affects its strength or performance and needs major repair, or the " +
      "aircraft is missing or completely inaccessible.",
    reportable: true,
    note:
      "Damage limited to one engine, propellers, wing tips, antennas, tyres, brakes, " +
      "wheels, fairings, panels, landing gear doors, windscreens or small dents in " +
      "the skin does NOT make it an accident on its own.",
  },
  {
    key: "SERIOUS_INCIDENT",
    label: "Serious incident",
    test:
      "Nobody was hurt and the aircraft was not damaged like that, but the " +
      "circumstances say an accident very nearly happened.",
    reportable: true,
    // The glossary's own sentence. It is the clearest thing in the
    // document and it is what most reporters get wrong.
    note: "The difference between an accident and a serious incident lies only in the result.",
  },
  {
    key: "INCIDENT",
    label: "Incident",
    test:
      "Something happened in the operation of an aircraft that affected safety, or " +
      "could have.",
    reportable: false,
    note:
      "Not reportable to the regulator as an occurrence in every case, and still " +
      "worth filing: the incidents are where the accidents are visible first.",
  },
]);

/**
 * "Serious injury", quoted, because "serious" is the word a reporter is
 * most likely to apply by feel — and the definition is a list of
 * thresholds rather than a judgement.
 */
export const SERIOUS_INJURY_TESTS: ReadonlyArray<string> = Object.freeze([
  "hospital for more than 48 hours, starting within seven days of the injury",
  "a broken bone — except a simple break of a finger, toe or the nose",
  "cuts causing severe bleeding, or nerve, muscle or tendon damage",
]);

/**
 * Terms the product uses in its own interface, defined once.
 *
 * Used by the design route so the vocabulary can be checked by looking,
 * and available to any screen that needs to explain itself.
 */
export const DEFINITIONS: Readonly<Record<string, string>> = Object.freeze({
  Hazard: "A condition or an object with the potential to cause or contribute to an aircraft incident or accident.",
  "Safety risk": "The predicted probability and severity of the consequences or outcomes of a hazard.",
  Defences:
    "Specific mitigating actions, preventive controls or recovery measures put in place to prevent the realization of a hazard or its escalation into an undesirable consequence.",
  "Safety data":
    "A defined set of facts or set of safety values collected from various aviation-related sources, which is used to maintain or improve safety.",
  "Safety information":
    "Safety data processed, organized or analysed in a given context so as to make it useful for safety management purposes.",
  "Safety performance indicator": "A data-based parameter used for monitoring and assessing safety performance.",
  "Safety performance target":
    "The State or service provider's planned or intended target for a safety performance indicator over a given period that aligns with the safety objectives.",
  Trigger:
    "An established level or criteria value for a particular safety performance indicator that serves to initiate an action required.",
  "Accountable executive":
    "A single, identifiable person having responsibility for the effective and efficient performance of the service provider's SMS.",
  "Change management":
    "A formal process to manage changes within an organization in a systematic manner, so that changes which may impact identified hazards and risk mitigation strategies are accounted for before the implementation of such changes.",
});

/** Provenance, so the next person knows what to re-read and when. */
export const GLOSSARY_SOURCE = Object.freeze({
  instrument: "KCAA SMS course glossary (ICAO Annex 19 / Doc 9859 definitions)",
  transcribedOn: "2026-08-11",
  /** Definitions move with Annex amendments; Amendment 2 applies 26 Nov 2026. */
  reviewCycleMonths: 24,
});
