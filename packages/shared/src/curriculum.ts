/* =====================================================================
   ELEMENT 4.1 — WHAT TRAINING A ROLE ACTUALLY NEEDS.

   The question Annex 19's element 4.1 asks is: "has everyone whose work
   affects safety had SMS training APPROPRIATE TO THEIR ROLE, and is it
   current?" The product could answer the second half and not the first.

   WHY A FREE-TEXT COURSE NAME CANNOT ANSWER IT. TrainingRecord.course
   is a string. An operator types "SMS", or "SMS refresher", or "Safety
   Management Systems (initial)", and every one of those is a different
   value to a database. So the matrix could compute expiry — currency.ts
   does that carefully — and could not compute the thing an auditor
   actually opens it for, which is not "what has expired" but WHO IS
   MISSING SOMETHING THEY SHOULD HAVE. A gap is a row that does not
   exist, and you cannot detect a missing row by matching free text.

   So the courses become keyed, the keys map to roles, and a gap is
   computable: required(role) minus what the person holds a record of.

   ---------------------------------------------------------------
   WHERE THIS CAME FROM, AND HOW FAR IT SHOULD BE TRUSTED.

   ICAO Doc 9859 (Safety Management Manual, 4th edition, 2018) sets out
   the minimum content of initial safety training and says the programme
   must be tailored per role — "identify safety training requirements
   for each level of management and each employee group."

   IT WAS READ THROUGH A SEARCH INDEX, NOT AS THE PRIMARY DOCUMENT.
   Every regulatory host this environment can reach returns 403 at the
   egress proxy, which is why CICTT_VERIFIED_AGAINST_PRIMARY is false in
   cictt.ts and why the flag below is false for exactly the same reason.
   The same rule applies: this is good enough to structure a programme
   and to prompt an operator, and it is NOT good enough to tell somebody
   they are compliant.

   ---------------------------------------------------------------
   THE ONE THING THIS MODULE REFUSES TO SAY, and it is the finding that
   most wanted to be a number:

   NO REGULATION PRESCRIBES A RECURRENT INTERVAL, AND THE STATE'S
   GUIDANCE RECOMMENDS TWENTY-FOUR MONTHS.

   This paragraph used to stop at the first half. It said "annual
   refresher" is widespread practice rather than a standard, and that
   writing `recurrentMonths: 12` would have been the single easiest line
   in this file and would have had the product assert a requirement that
   does not exist.

   That was right, and reading CAA-AC-SMS011 showed it was right for a
   second reason nobody had guessed: Appendix I recommends a refresher
   EVERY TWO YEARS. The easy line would not merely have invented a rule
   — it would have invented one twice as demanding as the operator's own
   regulator asks for, and every matrix computed from it would have sent
   people on training they did not owe.

   So the number is now recorded, in RECOMMENDED_TIMING, as what it is:
   a recommendation in an advisory circular, not a period in the
   Regulations. The interval still lives on the operator's own record as
   expiresOn, which the operator sets. `REQUIRED` below says WHAT, never
   HOW OFTEN.
   ===================================================================== */
import type { Role } from "./index";

/**
 * What this list is derived from, printed wherever the curriculum is
 * shown, so an operator can see the provenance rather than assume one.
 */
export const CURRICULUM_SOURCE =
  "KCAA Advisory Circular CAA-AC-SMS011, Safety Management Systems (SMS) " +
  "Training (April 2025) — section 8.1 for the minimum course content, " +
  "section 9.1 for accountable executives and senior managers, section 10.2 " +
  "for specialised safety functions, Appendix I for role bands and duration, " +
  "and Appendix II for the module syllabus. ICAO Doc 9859 4th edition sits " +
  "behind it and agrees on the six.";

/**
 * Whether this product has read the primary document.
 *
 * TRUE since 17 August 2026. CAA-AC-SMS011 was read in full — thirteen
 * pages, both appendices — and every row below carries its section
 * number. It replaces a list derived from Doc 9859 through a search
 * index, which is the provenance cictt.ts still refuses to claim.
 *
 * THE SIX SURVIVED THE CHECK UNCHANGED, which is worth recording
 * because it was not the expected outcome: section 8.1 lists exactly
 * the six topics this file already held, in the same order.
 *
 * WHAT DID NOT SURVIVE was the silence about interval. The old note
 * here said no recurrent interval is prescribed and that writing
 * `recurrentMonths: 12` "would have been the single easiest line in
 * this file". Appendix I recommends a refresher EVERY TWO YEARS, so the
 * easy line would have been wrong by a factor of two against the
 * operator's own regulator. See RECOMMENDED_TIMING.
 */
export const CURRICULUM_VERIFIED_AGAINST_PRIMARY = true;

/** The document, cited once so a screen can print it. */
export const CURRICULUM_INSTRUMENT = Object.freeze({
  reference: "CAA-AC-SMS011",
  title: "Safety Management Systems (SMS) Training",
  issued: "2025-04-01",
  readOn: "2026-08-17",
  /* The same discrepancy circulars.ts records: the cover says April
     2025 and the running header on all thirteen pages says March 2025.
     Written down rather than resolved silently. */
  issuedDateDisputed: "Cover states April 2025; the running header states March 2025.",
});

export interface Course {
  /** Stable key. Stored on a record; never shown to a person. */
  readonly key: string;
  /** What an operator calls it on a certificate. */
  readonly label: string;
  /** Why the standard asks for it — shown beside the row. */
  readonly why: string;
}

/**
 * THE SIX TOPICS Doc 9859 lists as the minimum content of INITIAL
 * safety training, for everybody. Not six courses an operator must buy
 * — six subjects a programme has to cover, however it is delivered.
 */
export const INITIAL_TOPICS: readonly Course[] = Object.freeze([
  Object.freeze({
    key: "POLICY_OBJECTIVES",
    label: "Safety policy and safety objectives",
    why: "What the organisation has committed to, signed by the person accountable for it.",
  }),
  Object.freeze({
    key: "ROLES",
    label: "Safety roles and responsibilities",
    why: "Which safety duties attach to this person's own job, rather than to the safety office.",
  }),
  Object.freeze({
    key: "SRM_PRINCIPLES",
    label: "Basic safety risk management principles",
    why: "Hazard, consequence, severity, likelihood — enough to read a risk assessment.",
  }),
  Object.freeze({
    key: "REPORTING",
    label: "The safety reporting system",
    why: "How to file, what protection the reporter has, and what happens next.",
  }),
  Object.freeze({
    key: "SMS_PROCEDURES",
    label: "The organisation's own SMS processes and procedures",
    why: "The operator's actual procedures, not a generic course.",
  }),
  Object.freeze({
    key: "HUMAN_FACTORS",
    label: "Human factors",
    why: "Why capable people make predictable errors, and what the system does about it.",
  }),
]);

/**
 * Role-tailored additions, on top of the six.
 *
 * DELIBERATELY SHORT. Doc 9859 says the programme is tailored per role
 * and gives examples — hazard reporting for frontline staff, audit
 * technique for those running the SMS, accountability briefing for the
 * accountable executive and post holders. It does not publish a course
 * catalogue, and inventing one here would dress guesswork as a
 * requirement. Each entry below traces to something the manual actually
 * says about that role.
 */
export const ROLE_ADDITIONS: readonly Course[] = Object.freeze([
  Object.freeze({
    key: "ACCOUNTABILITIES",
    label: "SMS accountabilities briefing",
    why:
      "Doc 9859 lists awareness training for a NEW accountable executive and post holders " +
      "on their own SMS accountabilities, and on the importance of complying with national " +
      "and organisational safety requirements. It is the one course tied to a person's " +
      "appointment rather than to their trade.",
  }),
  Object.freeze({
    key: "HAZARD_REPORTING",
    label: "Hazard identification and reporting in practice",
    why:
      "The manual's own example of role-specific training for frontline staff: recognising " +
      "a hazard and reporting it, which is the behaviour element 2.1 depends on entirely.",
  }),
  Object.freeze({
    key: "RISK_ASSESSMENT",
    label: "Conducting a safety risk assessment",
    why:
      "Running the matrix rather than reading it — severity and likelihood assignment, and " +
      "what ALARP requires of a tolerable risk.",
  }),
  Object.freeze({
    key: "AUDIT_TECHNIQUE",
    label: "Safety assurance and audit technique",
    why: "The manual's example of role-specific training for those who run the SMS.",
  }),
  Object.freeze({
    key: "INVESTIGATION",
    label: "Occurrence investigation",
    why:
      "Distinct from assurance: establishing what happened and why, without the search for " +
      "cause becoming a search for a person to blame.",
  }),
]);

/* =====================================================================
   WHAT APPENDIX I SETS, AND WHY IT IS RECORDED AS A RECOMMENDATION

   Appendix I is headed "GUIDANCE FOR DEVELOPMENT OF THE INITIAL
   TRAINING PLAN" and its timings sit under "***RECOMMENDATIONS". An
   Advisory Circular is guidance; the Civil Aviation (Safety Management)
   Regulations are law. This repository already keeps that line — the
   deadline table cites L.N. 32/2026 for the period and refuses to
   attribute AC sentences to it — so the same line is kept here.

   The consequence for an operator is real and not pedantic: a KCAA
   auditor can hold you to the Regulations, and will read Appendix I as
   what good looks like. So the product states the recommendation, names
   it as a recommendation, and still lets the operator set expiresOn.
   ===================================================================== */

/** Appendix I, the four bands, with the duration and assessment set against each. */
export interface TrainingBand {
  readonly key: string;
  /** Appendix I's own wording for who is in this band. */
  readonly who: string;
  /** Examples the AC itself gives. Empty where it gives none. */
  readonly examples: readonly string[];
  readonly days: number;
  /** True where Appendix I requires skills and practical application, not knowledge alone. */
  readonly practicalRequired: boolean;
}

export const TRAINING_BANDS: readonly TrainingBand[] = Object.freeze([
  Object.freeze({
    key: "NON_OPERATIONAL",
    who: "Non-operational safety critical personnel, with indirect, minimal or no contact with operational personnel",
    examples: Object.freeze([]),
    days: 2,
    practicalRequired: false,
  }),
  Object.freeze({
    key: "OPERATIONAL",
    who: "Operational safety-critical personnel, with modules tailored to the specific role",
    examples: Object.freeze([
      "Flight crew", "Cabin crew", "Maintenance", "Aerodrome safety officers",
      "Engineering", "Ground handler",
    ]),
    days: 2,
    practicalRequired: true,
  }),
  Object.freeze({
    key: "MANAGEMENT",
    who: "Management personnel",
    examples: Object.freeze([
      "Accountable Manager", "Human Resources", "Finance", "Procurement", "Legal",
    ]),
    days: 1,
    practicalRequired: false,
  }),
  Object.freeze({
    key: "SAFETY_POSTHOLDER",
    who: "Head of Safety, Safety Officers, and safety-critical post holders",
    examples: Object.freeze([
      "Chief pilot", "CFI", "Head of operations", "Head of quality",
      "Head of base maintenance", "Head of workshop", "Head of line maintenance",
      "Head of maintenance", "Head of training", "Head of engineering",
      "Head of ground flight safety", "Head of RFFS", "Maintenance liaison",
      "Dangerous Goods coordinator",
    ]),
    days: 5,
    practicalRequired: true,
  }),
]);

/**
 * Appendix I's two timings, and the one number this file used to refuse
 * to write.
 *
 * `refresherMonths: 24` — NOT the twelve that "annual refresher"
 * would have produced. The old comment here was right that Doc 9859
 * prescribes nothing and that inventing a number would have been this
 * product asserting a requirement; it turns out the invented number
 * would also have been double the rate KCAA actually recommends, and an
 * operator shown a matrix demanding yearly refreshers would have been
 * buying twice the training its regulator asks for.
 */
export const RECOMMENDED_TIMING = Object.freeze({
  initialWithinMonths: 2,
  refresherMonths: 24,
  basis: "CAA-AC-SMS011 Appendix I, under \u201cRECOMMENDATIONS\u201d",
  /* Said out loud wherever the numbers are shown. */
  status: "Recommended by advisory circular, not prescribed by regulation. " +
    "The operator sets its own expiry against its operation, and the record " +
    "carries that date rather than one computed here.",
});

/**
 * Section 9.1 — what the service provider shall facilitate for the
 * accountable executive and senior managers.
 *
 * ELEVEN, where this file previously carried one. ACCOUNTABILITIES
 * below covers 9.1.1 and 9.1.2 and is kept as the course key an
 * operator records against a person; these are the topics that course
 * has to contain.
 */
export const EXECUTIVE_TOPICS: readonly string[] = Object.freeze([
  "Specific awareness training for new accountable executives and post holders on their SMS accountabilities and responsibilities",
  "Importance of compliance with national and organizational safety requirements",
  "Management commitment",
  "Allocation of resources, promotion and enhancement of skills and knowledge",
  "Promotion of the safety policy and the SMS",
  "Promotion of a positive safety culture",
  "Disciplinary policy",
  "Effective interdepartmental and external safety communication, cooperation and collaboration",
  "Determination and assessment of safety objectives, Safety Performance Indicators, targets and alert levels",
  "Safety data collection, processing and analysis for data-driven decision-making",
  "Protection of safety data principles",
]);

/**
 * Section 10.2 — functions the AC says are beyond the basics of an SMS
 * training programme, and "may require your specialist safety personnel
 * to undertake externally provided training qualifications".
 *
 * NOT COURSES THIS PRODUCT OFFERS, and the distinction is the point: an
 * operator reading this list should be able to see which of its people
 * need something the in-house programme does not deliver.
 */
export const SPECIALISED_FUNCTIONS: readonly string[] = Object.freeze([
  "Investigating safety events or incidents",
  "Monitoring and analysis of safety performance",
  "Conducting risk assessments",
  "Managing and maintaining safety databases",
  "Conducting safety audits",
  "Developing safety training programs",
  "Emergency response planning and crisis management",
  "Root-cause analysis",
]);

/** Section 11.1 — the four outcome levels, in the AC's own order. */
export const OUTCOME_LEVELS = Object.freeze([
  Object.freeze({ key: "AWARENESS", label: "Awareness", forEveryone: true }),
  Object.freeze({ key: "KNOWLEDGE", label: "Knowledge", forEveryone: true }),
  Object.freeze({ key: "SKILLS", label: "Skills", forEveryone: false }),
  Object.freeze({ key: "ATTITUDES", label: "Attitudes", forEveryone: false }),
]);

/** Section 12.5 — how the AC says effectiveness may be evaluated. */
export const ASSESSMENT_METHODS: readonly string[] = Object.freeze([
  "Knowledge based questions",
  "Problem based questions",
  "Practical exercises",
  "Case studies",
]);

/**
 * Appendix II — the six modules, with the sections each must contain.
 *
 * THE APPENDIX'S OWN NOTE IS CARRIED WITH IT: the criteria "should not
 * limit further expansion of the training course beyond these minimum
 * recommended modules". A syllabus screen that presented this as a
 * ceiling would invert the document.
 */
export interface SyllabusModule {
  readonly number: number;
  readonly title: string;
  readonly purpose: string;
  readonly sections: readonly string[];
}

export const SYLLABUS_MODULES: readonly SyllabusModule[] = Object.freeze([
  Object.freeze({
    number: 1,
    title: "Safety Management Fundamentals",
    purpose:
      "Fundamental safety management principles and concepts, including the influence " +
      "of human as well as organizational factors.",
    sections: Object.freeze([
      "Concept of safety and its evolution",
      "Safety risk management",
      "Safety culture",
    ]),
  }),
  Object.freeze({
    number: 2,
    title: "Safety Policy, Objectives and Resources",
    purpose: "The knowledge and competency to implement and administer an SMS.",
    sections: Object.freeze([
      "SMS organization and accountabilities",
      "SMS gap analysis",
      "SMS implementation",
      "SMS integration",
      "SMS manual and records management",
      "SMS committee and administration",
      "Safety policy and objectives",
      "Emergency response planning",
    ]),
  }),
  Object.freeze({
    number: 3,
    title: "Safety Risk Management and Assurance",
    purpose: "The knowledge and competency to implement safety risk and assurance principles.",
    sections: Object.freeze([
      "Hazard identification and voluntary reporting system",
      "Safety risk assessment and mitigation",
      "Occurrence reporting and investigation",
      "Management of change",
      "Internal and external SMS audit",
      "SMS disciplinary policy and procedures",
    ]),
  }),
  Object.freeze({
    number: 4,
    title: "SMS Training and Safety Promotion",
    purpose:
      "The knowledge and competency to develop internal SMS training and an SMS audit programme.",
    sections: Object.freeze([
      "SMS training programme",
      "Safety information sharing, exchange and safety promotions",
    ]),
  }),
  Object.freeze({
    number: 5,
    title: "Safety Performance Management",
    purpose:
      "Development of SPIs, target setting, safety performance monitoring, and the actions " +
      "required to achieve an acceptable level of safety performance.",
    sections: Object.freeze([
      "Development of safety objectives",
      "Safety performance indicators and safety performance targets",
      "Monitoring safety performance",
    ]),
  }),
  Object.freeze({
    number: 6,
    title: "Safety Data Collection and Processing",
    purpose:
      "Safety data collection, analysis, exchange and safety data protection provisions.",
    sections: Object.freeze([
      "Safety data collection, analysis and exchange",
      "Safety data analysis",
    ]),
  }),
]);

/** Appendix II's own note, carried so a screen cannot present the six as a ceiling. */
export const SYLLABUS_NOTE =
  "These are minimum recommended modules. The circular says expressly that they " +
  "should not limit further expansion of the training course.";

/** Every course this product knows, initial topics first. */
export const ALL_COURSES: readonly Course[] = Object.freeze([
  ...INITIAL_TOPICS,
  ...ROLE_ADDITIONS,
]);

const INITIAL_KEYS = INITIAL_TOPICS.map((c) => c.key);

/**
 * Role → the additional course keys that role needs.
 *
 * EVERY ROLE GETS THE SIX. That is not a default worth overriding: the
 * manual sets them as the minimum for safety training generally, and a
 * product that let an operator switch them off per role would be
 * offering to make the matrix look complete rather than be complete.
 *
 * SYSTEM_ADMIN IS ABSENT, and it is the same reasoning that gives that
 * role no narrative permission. An administrator manages accounts and
 * configuration; they are not personnel whose work affects safety in
 * the sense element 4.1 means, and listing them would put a permanent
 * false gap on every operator's matrix. If an administrator also flies
 * or fixes aircraft, they hold that role too.
 */
const ADDITIONS_BY_ROLE: Readonly<Record<Role, readonly string[]>> = Object.freeze({
  FRONTLINE: Object.freeze(["HAZARD_REPORTING"]),
  SAFETY_OFFICER: Object.freeze(["HAZARD_REPORTING", "RISK_ASSESSMENT"]),
  SAFETY_MANAGER: Object.freeze([
    "HAZARD_REPORTING",
    "RISK_ASSESSMENT",
    "AUDIT_TECHNIQUE",
    "ACCOUNTABILITIES",
  ]),
  INVESTIGATOR: Object.freeze(["HAZARD_REPORTING", "RISK_ASSESSMENT", "INVESTIGATION"]),
  KEY_MANAGEMENT: Object.freeze(["ACCOUNTABILITIES", "RISK_ASSESSMENT"]),
  ACCOUNTABLE_EXECUTIVE: Object.freeze(["ACCOUNTABILITIES"]),
  /* An inspector reads the operator's record; they are not the
     operator's personnel and the operator does not train them. */
  REGULATOR_INSPECTOR: Object.freeze([]),
  SYSTEM_ADMIN: Object.freeze([]),
});

/** Roles this product does not consider the operator's safety personnel. */
const NOT_SAFETY_PERSONNEL: readonly Role[] = Object.freeze([
  "SYSTEM_ADMIN",
  "REGULATOR_INSPECTOR",
]);

/**
 * Every course key this role is expected to hold — the six, plus its
 * own additions. Empty for a role that is not the operator's personnel,
 * which is what stops an inspector's account showing as a training gap
 * on the operator's matrix.
 */
export function requiredFor(role: Role): readonly string[] {
  if (NOT_SAFETY_PERSONNEL.includes(role)) return Object.freeze([]);
  return Object.freeze([...INITIAL_KEYS, ...(ADDITIONS_BY_ROLE[role] ?? [])]);
}

/** Look a course up by key. Returns undefined for a key this build does not know. */
export function courseFor(key: string): Course | undefined {
  return ALL_COURSES.find((c) => c.key === key);
}

/**
 * The course keys this person is expected to hold and has NO RECORD OF
 * AT ALL.
 *
 * A GAP IS NOT AN EXPIRY, and keeping them apart is the whole point of
 * this function existing beside currency.ts. An expired record is a
 * person who was trained and is now out of date — visible, dated, and
 * fixed by booking a refresher. A gap is a person who was never trained
 * in something their role requires, and it is invisible: there is no
 * row to be amber. The two need different words in front of a safety
 * manager, so they are computed by different modules and never summed
 * into one number.
 *
 * Held keys are matched exactly, and NOTHING IS FILTERED HERE. The
 * first version of this function filtered unrecognised keys out of the
 * held set and carried a comment explaining that an unknown key must
 * not satisfy a requirement. That comment was right and the filter was
 * dead code: an unrecognised key cannot equal a required key, so
 * removing the filter changed no result. It was found by putting the
 * defect back and watching the test STAY GREEN — a check that cannot
 * fail, guarding a line that does nothing, which is worse than neither.
 *
 * The property is structural instead: gaps are computed by asking what
 * the ROLE requires, so nothing a record carries can add to the answer.
 * What an unrecognised key genuinely deserves is to be reported, and
 * that is `unrecognisedIn` below rather than a silent drop here.
 */
export function gapsFor(role: Role, heldCourseKeys: readonly string[]): readonly string[] {
  const held = new Set(heldCourseKeys);
  return Object.freeze(requiredFor(role).filter((k) => !held.has(k)));
}

/**
 * Course keys on a person's record that this build does not recognise.
 *
 * WHY THIS IS NOT NOTHING. Records predate this module: every existing
 * TrainingRecord carries free text in `course`, so on the day the
 * curriculum ships, an operator's whole matrix is unrecognised keys.
 * Silently ignoring them would show that operator a screen saying every
 * person has six gaps, while their certificates sit in the record
 * unread — the product telling somebody their training does not exist
 * because the product changed its mind about how to name it.
 *
 * So they are surfaced and left alone. The operator maps them; the
 * product does not guess, because a fuzzy match from "SMS refresher" to
 * a curriculum key is exactly the invented compliance this module was
 * written to remove.
 */
export function unrecognisedIn(heldCourseKeys: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(heldCourseKeys.filter((k) => courseFor(k) === undefined))]);
}
