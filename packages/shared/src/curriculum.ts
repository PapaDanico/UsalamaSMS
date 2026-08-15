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

   THERE IS NO PRESCRIBED RECURRENT INTERVAL. Doc 9859 does not set one.
   "Annual refresher" is widespread practice and appears in a great deal
   of secondary material, and it is not a standard — the interval is set
   by the operator and its State, proportionate to the operation.

   Writing `recurrentMonths: 12` here would have been the single easiest
   line in this file and it would have been this product asserting a
   regulatory requirement that does not exist. An operator would then
   have shown an auditor a matrix computed from OUR invented number.
   So the interval lives where it belongs: on the operator's own record,
   as expiresOn, which the operator sets. `REQUIRED` below says WHAT,
   never HOW OFTEN.
   ===================================================================== */
import type { Role } from "./index";

/**
 * What this list is derived from, printed wherever the curriculum is
 * shown, so an operator can see the provenance rather than assume one.
 */
export const CURRICULUM_SOURCE =
  "ICAO Doc 9859, Safety Management Manual, 4th edition (2018) — the " +
  "minimum content of initial safety training, and the requirement that " +
  "the programme be tailored to each role.";

/**
 * Whether this product has read the primary document.
 *
 * FALSE, for the reason cictt.ts records: the source was reached
 * through a search index rather than opened. Flip it when somebody has
 * Doc 9859 open beside this file and has checked every row — and expect
 * the rows to change when they do.
 */
export const CURRICULUM_VERIFIED_AGAINST_PRIMARY = false;

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
