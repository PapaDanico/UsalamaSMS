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
  | "hazard.manage" | "risk.assess" | "risk.accept.tolerable" | "risk.accept.intolerable"
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
  | "communication.publish";

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
    "report.read.org", "risk.accept.tolerable", "risk.accept.intolerable",
    "spi.read", "moc.approve", "document.read", "audit.read", "training.read.own",
    /* SIGNING THE POLICY IS THIS ROLE'S ALONE, and it is the only
       permission in this file held by exactly one role. Element 1.1 is
       not "there is a policy" — it is that the person who can move money
       and schedule has put their name to it. A safety manager signing on
       their behalf is the finding, not the evidence. */
    "policy.sign",
    // And appointing the key personnel, which is the same authority.
    "appointment.manage",
  ]),
  REGULATOR_INSPECTOR: new Set<Permission>([
    "regulator.oversight", "audit.read", "spi.read", "document.read",
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
