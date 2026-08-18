// =====================================================================
// The authorisation matrix.
//
// A separate module for a reason this repository has now learned three
// times: `PERMISSIONS` is built with `new Set([...])` at module scope,
// which is a side-effectful expression, so Rollup CANNOT tree-shake it.
// Anything that imports the shared barrel therefore carries the whole
// matrix — and the report form imports the barrel for CreateReportSchema.
//
// So every role's permission set was riding in the ENTRY bundle: the
// chunk a ramp agent at a remote strip downloads before they can file
// anything, carrying authorisation data that only the screens behind a
// sign-in have any use for. Adding the eight Annex 19 permissions made
// it 1.8 KB worse and pushed entry over its ceiling, which is how it
// was noticed.
//
// Same shape as posts.ts, split out of taxonomy.ts for the same reason:
// the fix is not a bigger budget, it is not shipping the thing.
//
// Import from "@usalamasms/shared/permissions" — or from the barrel,
// which re-exports it — anywhere that is already behind a session.
// =====================================================================

import type { Role } from "./index";

export type Permission =
  | "report.create" | "report.read.own" | "report.read.org" | "report.triage"
  | "report.investigate" | "report.close" | "report.deidentify.review"
  /* THERE IS NO `risk.accept.intolerable`, AND THERE WAS.

     It sat in this union and in the accountable executive's set from the
     first draft, and no route ever read it — because there is no act to
     read it for. Doc 9859's red band is not "acceptable with a
     sufficiently senior signature"; it is not acceptable at any level
     of benefit. Both places a risk can now be signed for — the register
     and the change route — refuse INTOLERABLE to everybody, including
     the accountable executive, and say that the controls have to change
     rather than the signature.

     A permission for an act the product refuses is a claim the matrix
     cannot honour. Worse, it is the flattering kind: an operator
     reading the matrix would conclude their accountable executive can
     sign off a red risk, which is the belief this band exists to
     prevent. Deleted rather than left unused, and a test asserts that
     every permission still here is reachable from a route. */
  | "hazard.manage" | "risk.assess" | "risk.accept.tolerable"
  | "spi.configure" | "spi.read" | "moc.create" | "moc.approve"
  | "document.read" | "document.manage" | "training.read.own" | "training.manage"
  | "org.manage" | "user.manage" | "audit.read" | "regulator.oversight"
  // ---- the other eight Annex 19 elements -----------------------------
  // Added when those elements stopped being things the product could
  // only score. The first draft of those routes gated on `org.manage`,
  // and the integration tests refused every one of them: `org.manage` is
  // TENANT ADMINISTRATION — creating the organisation, not authoring its
  // safety documentation — and a safety manager rightly does not hold
  // it. Reusing it would have made the accountable executive's own
  // safety policy editable only by whoever administers the account.
  | "policy.draft" | "policy.sign"
  | "accountability.manage" | "appointment.manage"
  | "erp.manage" | "sms.audit.conduct" | "sms.audit.verify"
  | "communication.publish"
  /* The operator's own copy of its own record. Deliberately NOT
     org.manage: taking a full copy of every safety narrative the
     organisation holds is a different act from administering accounts,
     and the roles that may do it are different ones. */
  | "org.export"
  /* ---- THE VENDOR'S TWO POWERS, AND THERE ARE ONLY TWO ------------

     Everything else in this union is something somebody in an aviation
     organisation does. These two are things the company selling the
     product does, and they are named separately so that the matrix
     shows at a glance how small the vendor's reach is.

     `platform.operator.provision` creates an operator and its first
     user. `platform.entitlement.manage` writes the two dates a
     subscription is computed from. Neither touches a safety record,
     and no third one should be added without answering why the vendor
     needs it — the honest answer is usually "to help with a support
     request", and the honest response is that the operator's own
     SYSTEM_ADMIN can do it. */
  | "platform.operator.provision" | "platform.entitlement.manage"
  /* THE OPERATOR'S OWN VOCABULARY — what it calls its posts, what its
     manual calls each point on the risk scales, which strips it flies
     to. Its own permission for the same reason org.export got one and
     did not reuse org.manage: the meanings differ. Renaming a severity
     point changes what every register in the operator reads as, which
     is a safety-documentation act; it is not tenant administration, and
     the roles that may do it are not the roles that create accounts.

     WHAT THIS PERMISSION CANNOT DO IS THE POINT. It reaches labels and
     lists and nothing else — no deadline, no tolerability band, no
     de-identification rule, no element definition. That boundary is
     structural rather than granted: there is no representation for
     those things in the tenant configuration at all. See
     packages/shared/src/tenant.ts. */
  | "config.manage";

export const PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  FRONTLINE: new Set<Permission>([
    "report.create", "report.read.own", "document.read", "training.read.own",
  ]),
  SAFETY_OFFICER: new Set<Permission>([
    "report.create", "report.read.own", "report.read.org", "report.triage",
    "hazard.manage", "risk.assess", "spi.read", "document.read", "training.read.own",
  ]),
  SAFETY_MANAGER: new Set<Permission>([
    "report.create", "report.read.own", "report.read.org", "report.triage",
    "report.investigate", "report.close", "report.deidentify.review",
    "hazard.manage", "risk.assess", "risk.accept.tolerable",
    "spi.configure", "spi.read", "moc.create", "document.read", "document.manage",
    "training.read.own", "training.manage", "audit.read",
    // The post that actually runs the SMS: it drafts the policy, keeps
    // the accountability matrix, exercises the plan, conducts the
    // internal audit and publishes the bulletins. It does NOT sign the
    // policy and does NOT verify its own findings.
    "policy.draft", "accountability.manage", "appointment.manage",
    "erp.manage", "sms.audit.conduct", "communication.publish",
    // The post that would be asked for the record in an audit is the
    // post that can take a copy of it.
    "org.export",
    // And the post that maintains the manual maintains the words in it.
    "config.manage",
  ]),
  INVESTIGATOR: new Set<Permission>([
    "report.read.org", "report.investigate", "hazard.manage", "risk.assess",
    "spi.read", "document.read", "training.read.own",
  ]),
  KEY_MANAGEMENT: new Set<Permission>([
    "report.read.org", "risk.accept.tolerable", "spi.read", "moc.create",
    "moc.approve", "document.read", "training.read.own", "audit.read",
    /* VERIFICATION, not conduct. Whoever ran the audit saying their own
       corrective action worked is the weakest evidence in an assurance
       programme, so closing a finding and verifying it are held by
       different posts by construction rather than by convention. */
    "sms.audit.verify",
  ]),
  ACCOUNTABLE_EXECUTIVE: new Set<Permission>([
    /* `risk.accept.tolerable` and NOT an intolerable counterpart — see
       the note in the union above. The amber band is this post's to
       carry precisely because accepting it is a judgement about cost
       against safety; the red band is nobody's, at any level. */
    "report.read.org", "risk.accept.tolerable",
    /* FILING, AND ITS ABSENCE WAS NEVER A DECISION.
       ==========================================================
       This role could not file a report. No test asserted that it
       should not — which in this repository is the signature of an
       unexamined default rather than a judgement — and it was found by
       walking the sequence a design partner walks, not by reading the
       matrix.

       IT MADE THE PRODUCT'S OWN GATE UNREACHABLE. Signup creates
       exactly one account and it is this one, so a new operator's first
       and only user filed a report, watched the sync answer `forbidden`
       per item, and read "your role cannot submit this report type" on
       a device with nowhere else to go. docs/02-STRATEGY.md sets
       Phase 1's gate as "a frontline user files a report offline and it
       arrives"; nobody could reach it without first appointing a second
       person. /today's first-run sequence then made it worse by opening
       with "File the first report".

       AND IT IS WRONG ON THE INSTRUMENT, which is the reason rather
       than the convenience. Annex 19's reporting system is for ALL
       personnel. The accountable executive is personnel, is the post
       ACCOUNTABLE for the safety management system, and was the one
       person in the organisation structurally unable to perform its
       most basic act.

       SYSTEM_ADMIN and PLATFORM_ADMIN still cannot file, and that stays
       deliberate: the administrator is a technical post held away from
       the safety record on purpose — the escalation rule in
       routes.auth.ts rests on exactly that — and the platform
       administrator is the vendor, who must never write into a tenant's
       safety record. */
    "report.create",
    "spi.read", "moc.approve", "document.read", "audit.read", "training.read.own",
    "config.manage",
    /* APPOINTING THE PEOPLE, because signup creates exactly one of these
       and nothing else could create a second user at all. Every operator
       that ever signed up had one account, in an organisation containing
       nobody able to add a safety officer — so the reporting system had
       no reporters. Under Annex 19 this post is the one answerable for
       the SMS; deciding who staffs it is squarely its function. */
    "user.manage",
    /* SIGNING THE POLICY IS THIS ROLE'S ALONE, and it is the only
       permission in this file held by exactly one role. Element 1.1 is
       not "there is a policy" — it is that the person who can move money
       and schedule has put their name to it. A safety manager signing on
       their behalf is the finding, not the evidence. */
    "policy.sign",
    // And appointing the key personnel, which is the same authority.
    "appointment.manage",
    /* And holding the operator's own copy. Data ownership that depends
       on the safety manager still being employed is not ownership. */
    "org.export",
  ]),
  REGULATOR_INSPECTOR: new Set<Permission>([
    "regulator.oversight", "audit.read", "spi.read", "document.read",
  ]),
  /* THE SHORTEST SET IN THIS MATRIX, ON PURPOSE.

     A vendor account that could read one narrative could read every
     narrative in every tenant, which is a worse position than any
     single operator can put itself in. So it holds the two powers it
     needs to run a business and nothing else: no report permission, no
     hazard, no audit, no export, not even `org.manage` — creating an
     operator is `platform.operator.provision` and administering one
     afterwards belongs to that operator.

     tests/platform.test.ts asserts this set is disjoint from
     NARRATIVE_PERMISSIONS, and that it holds no permission any other
     role uses to reach a safety record. */
  PLATFORM_ADMIN: new Set<Permission>([
    "platform.operator.provision", "platform.entitlement.manage",
  ]),

  SYSTEM_ADMIN: new Set<Permission>([
    "org.manage", "user.manage", "audit.read",
    // Account administration extends to who holds which post; it stops
    // short of authoring or signing any of the safety documentation.
    "appointment.manage",
  ]),
};

export function can(role: Role, p: Permission): boolean {
  return PERMISSIONS[role].has(p);
}

/**
 * Permissions that read the content of safety reports.
 *
 * Named as a set rather than checked ad hoc because the confidentiality
 * rules attach to this category, not to individual routes: anything
 * that can reach a narrative is subject to the de-identification and
 * anonymity guarantees. A new route gets the guarantee by joining the
 * set, not by remembering to reimplement it.
 */

/* Also a module-scope Set, and also authorisation data. It travelled
   with the matrix into the entry bundle for the same reason. */
export const NARRATIVE_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  "report.read.own", "report.read.org", "report.triage",
  "report.investigate", "report.deidentify.review",
]);

/**
 * MAY THIS ROLE CREATE AN ACCOUNT HOLDING THAT ONE?
 *
 * ---------------------------------------------------------------
 * THE ESCALATION USER MANAGEMENT OPENS, WHICH IS NOT OBVIOUS FROM
 * EITHER SIDE OF IT.
 *
 * `SYSTEM_ADMIN` deliberately holds NO narrative permission — the note
 * beside the matrix says why, and `/api/v1/auth/admin/reset-password`
 * repeats it: being able to restore somebody's access is not being able
 * to read what they filed in confidence. Under Annex 19's protection
 * provisions the technical administrator is exactly who confidentiality
 * has to hold against.
 *
 * Give that role `user.manage` and the guarantee evaporates through the
 * side door: create a `SAFETY_MANAGER`, set its password — the creator
 * chooses it — sign in, read every narrative. No permission check is
 * violated anywhere along that path. Each step is authorised; the
 * SEQUENCE is the breach.
 *
 * ---------------------------------------------------------------
 * THE RULE IS ABOUT NARRATIVE ACCESS, NOT ABOUT SUBSETS.
 *
 * The obvious rule — a creator may only confer permissions it already
 * holds — is wrong here, and wrong in the direction that breaks the
 * product. An `ACCOUNTABLE_EXECUTIVE` holds `report.read.org` and not
 * `report.triage`, so a subset rule would stop the person answerable
 * for the safety management system from appointing a safety manager.
 * That is the single most normal act of setting one up.
 *
 * What actually matters is whether the creator can already reach a
 * narrative at all. An accountable executive reads org narratives
 * today, so appointing somebody who also reads them grants that
 * creator nothing new. An administrator who can read none is a
 * different case entirely: any narrative-holding account it mints is a
 * key to a room it was deliberately locked out of.
 *
 * So: A CREATOR WITH NO NARRATIVE PERMISSION MAY NOT CREATE A ROLE
 * THAT HAS ONE. `SYSTEM_ADMIN` can still add another administrator or
 * a regulator inspector — neither reaches a narrative — and cannot mint
 * itself an eye.
 *
 * `PLATFORM_ADMIN` is refused as a target unconditionally, by anybody.
 * A tenant that could mint a platform administrator would be a tenant
 * that could read the other tenants.
 */
export function readsNarrative(role: Role): boolean {
  return [...NARRATIVE_PERMISSIONS].some((p) => can(role, p));
}

export function mayCreateRole(creator: Role, target: Role): boolean {
  /* Never, from inside an operator. The vendor's own account is made
     out of band by `npm run seed:platform-admin`. */
  if (target === "PLATFORM_ADMIN") return false;

  if (!can(creator, "user.manage")) return false;

  if (!readsNarrative(creator) && readsNarrative(target)) return false;

  return true;
}

/**
 * MAY THIS ROLE RESET THE CREDENTIAL OF AN ACCOUNT HOLDING THAT ONE?
 *
 * ---------------------------------------------------------------
 * THE SAME ESCALATION, THROUGH A DOOR THAT PREDATES THE RULE ABOVE.
 *
 * `mayCreateRole` closes the mint-yourself-an-eye path, and the comment
 * above it cites `/api/v1/auth/admin/reset-password` as the place the
 * distinction is already respected — "being able to restore somebody's
 * access is not being able to read what they filed in confidence".
 *
 * That sentence was false about the route it pointed at. The reset
 * RETURNS the new password, because there is no mail path to send it
 * down and an administrator has to be able to hand it over. So the
 * administrator ends up holding a working credential for the account it
 * just reset, and the sequence is the create-path breach with one step
 * removed — no account even has to be created. It was measured over
 * HTTP rather than argued:
 *
 *   SYSTEM_ADMIN, own token,   GET /api/v1/export -> 403
 *   POST /api/v1/auth/admin/reset-password        -> 200, password returned
 *   POST /api/v1/auth/login as the safety manager -> 200, role SAFETY_MANAGER
 *   SAFETY_MANAGER token,      GET /api/v1/export -> 200, narratives in the body
 *
 * `/api/v1/export` is the whole safety record, and `org.export` is a
 * permission `SYSTEM_ADMIN` does not hold under any reading of the
 * matrix. It held it four requests later.
 *
 * ---------------------------------------------------------------
 * WHY THIS IS NOT `mayCreateRole` WITH THE ARGUMENTS RENAMED.
 *
 * It very nearly is, and the narrative half is shared deliberately —
 * `readsNarrative` is one function so the two paths cannot drift into
 * disagreeing about what a narrative role is. Two differences are real:
 *
 *   · RESETTING YOUR OWN ACCOUNT IS ALWAYS ALLOWED. A safety manager
 *     is a narrative role and holds no `user.manage`, so the shared
 *     rule would refuse them their own credential. The route handles
 *     that case before it asks this question;
 *   · PLATFORM_ADMIN is refused here as a target for defence in depth
 *     rather than as the primary control. The vendor account lives in
 *     the vendor's own org and the route's lookup is tenant-scoped, so
 *     an operator cannot name it in the first place. If that scoping is
 *     ever loosened this line is what is left.
 *
 * ---------------------------------------------------------------
 * IT IS NOT A LOCKOUT, AND THAT WAS CHECKED RATHER THAN ASSUMED.
 *
 * A safety manager who forgets their password keeps two routes back in:
 * `/api/v1/auth/forgot`, which is self-service and needs mail
 * configured, and an `ACCOUNTABLE_EXECUTIVE`, who holds `user.manage`
 * and reads org narratives and is therefore permitted here. What is
 * removed is the technical administrator's ability to do it — which is
 * exactly the person Annex 19's protection provisions name.
 */
export function mayResetCredential(actor: Role, target: Role): boolean {
  if (target === "PLATFORM_ADMIN") return false;

  if (!can(actor, "user.manage")) return false;

  if (!readsNarrative(actor) && readsNarrative(target)) return false;

  return true;
}
