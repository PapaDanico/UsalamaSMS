// =====================================================================
// UsalamaSMS — Shared Types, Validation & Safety-Critical Calculations
// All calculations deterministic and unit-tested. Strict TS, no `any`.
// =====================================================================
import { z } from "zod";

export * from "./regulations";
import { JURISDICTIONS, type Jurisdiction } from "./regulations";

// ------------------------- Enums (mirror Prisma) ---------------------
export const RoleEnum = z.enum([
  "FRONTLINE", "SAFETY_OFFICER", "SAFETY_MANAGER", "INVESTIGATOR",
  "KEY_MANAGEMENT", "ACCOUNTABLE_EXECUTIVE", "REGULATOR_INSPECTOR", "SYSTEM_ADMIN",
]);
export type Role = z.infer<typeof RoleEnum>;

export const ReportTypeEnum = z.enum(["MOR", "VCR", "HAZARD", "SUGGESTION", "NEAR_MISS", "FATIGUE"]);
export type ReportType = z.infer<typeof ReportTypeEnum>;

export const HrcEnum = z.enum(["RE", "RI", "LOC_I", "CFIT", "MAC", "BWI"]);

/**
 * Phase of flight or operation — ICAO/CAST taxonomy, trimmed.
 *
 * Added when the UI started collecting it. Zod strips unknown keys by
 * default, so a field captured on screen and absent from the schema is
 * a field the reporter fills in and the database never sees — silent
 * data loss that looks exactly like a working form.
 *
 * Worth capturing because it is the most useful dimension for precursor
 * analysis: "runway excursion" says what happened, "landing roll" says
 * where to look.
 */
export const FlightPhaseEnum = z.enum([
  "STANDING", "PUSHBACK", "TAXI", "TAKEOFF", "INITIAL_CLIMB", "CLIMB",
  "CRUISE", "DESCENT", "APPROACH", "LANDING", "LANDING_ROLL", "GO_AROUND",
  "GROUND_HANDLING", "MAINTENANCE",
]);
export type FlightPhase = z.infer<typeof FlightPhaseEnum>;
export type Hrc = z.infer<typeof HrcEnum>;

export const SeverityEnum = z.enum([
  "A_CATASTROPHIC", "B_HAZARDOUS", "C_MAJOR", "D_MINOR", "E_NEGLIGIBLE",
]);

export const LikelihoodEnum = z.enum([
  "FREQUENT", "OCCASIONAL", "REMOTE", "IMPROBABLE", "EXTREMELY_IMPROBABLE",
]);

export const TolerabilityEnum = z.enum(["INTOLERABLE", "TOLERABLE", "ACCEPTABLE"]);

// ------------------- Safety-critical risk calculation ----------------
// Lives in ./risk — pure and zod-free so a client can import the matrix
// without the validation library. Re-exported here so existing call
// sites are unaffected.
export * from "./risk";
import { tolerability, type Tolerability } from "./risk";

/**
 * Who may accept a given risk. Derived from tolerability rather than
 * stored per-assessment, so a matrix change cannot leave a stale
 * approval authority behind on an old row.
 */
export function acceptanceAuthority(t: Tolerability): Permission | null {
  if (t === "INTOLERABLE") return "risk.accept.intolerable";
  if (t === "TOLERABLE") return "risk.accept.tolerable";
  return null; // ACCEPTABLE needs no acceptance decision
}

// --------------------------- RBAC matrix -----------------------------
export type Permission =
  | "report.create" | "report.read.own" | "report.read.org" | "report.triage"
  | "report.investigate" | "report.close" | "report.deidentify.review"
  | "hazard.manage" | "risk.assess" | "risk.accept.tolerable" | "risk.accept.intolerable"
  | "spi.configure" | "spi.read" | "moc.create" | "moc.approve"
  | "document.read" | "document.manage" | "training.read.own" | "training.manage"
  | "org.manage" | "user.manage" | "audit.read" | "regulator.oversight";

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
  ]),
  INVESTIGATOR: new Set<Permission>([
    "report.read.org", "report.investigate", "hazard.manage", "risk.assess",
    "spi.read", "document.read", "training.read.own",
  ]),
  KEY_MANAGEMENT: new Set<Permission>([
    "report.read.org", "risk.accept.tolerable", "spi.read", "moc.create",
    "moc.approve", "document.read", "training.read.own", "audit.read",
  ]),
  ACCOUNTABLE_EXECUTIVE: new Set<Permission>([
    "report.read.org", "risk.accept.tolerable", "risk.accept.intolerable",
    "spi.read", "moc.approve", "document.read", "audit.read", "training.read.own",
  ]),
  REGULATOR_INSPECTOR: new Set<Permission>([
    "regulator.oversight", "audit.read", "spi.read", "document.read",
  ]),
  SYSTEM_ADMIN: new Set<Permission>([
    "org.manage", "user.manage", "audit.read",
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
export const NARRATIVE_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  "report.read.own", "report.read.org", "report.triage",
  "report.investigate", "report.deidentify.review",
]);

/**
 * SYSTEM_ADMIN deliberately holds no narrative permission.
 *
 * This looks like an oversight and is the opposite. An administrator
 * manages accounts, roles and org configuration; giving that role the
 * ability to read safety narratives would mean the person with the
 * broadest technical access is also the person a reporter has the most
 * reason to fear. Under Annex 19's protection provisions, the technical
 * administrator is exactly who confidentiality must hold against.
 * Guarded in tests/safetycritical.test.ts.
 */

// ------------------------ Request validation -------------------------
export const CreateReportSchema = z.object({
  clientId: z.string().uuid(), // offline idempotency key
  type: ReportTypeEnum,
  title: z.string().min(3).max(200),
  narrative: z.string().min(10).max(20000),
  occurredAt: z.coerce.date().optional(),
  /**
   * When the reporter became aware. Optional on the wire — the server
   * defaults it to receipt time, which is the earliest moment it can
   * prove — but NEVER defaulted to occurredAt. See regulations.ts.
   */
  awareAt: z.coerce.date().optional(),
  jurisdiction: z.enum(JURISDICTIONS).default("KE"),
  location: z.string().max(200).optional(),
  aircraftType: z.string().max(50).optional(),
  phase: FlightPhaseEnum.optional(),
  hrcTags: z.array(HrcEnum).max(6).default([]),
  isAnonymous: z.boolean().default(false),
}).refine(
  (r) => r.type !== "MOR" || r.occurredAt !== undefined,
  { message: "MOR requires occurredAt to compute the regulatory deadline", path: ["occurredAt"] },
).refine(
  (r) => !r.awareAt || !r.occurredAt || r.awareAt.getTime() >= r.occurredAt.getTime(),
  { message: "awareAt cannot precede occurredAt", path: ["awareAt"] },
);
export type CreateReportInput = z.infer<typeof CreateReportSchema>;

export const RiskAssessInputSchema = z.object({
  // uuid, not cuid. The old schema mixed both, so an id that satisfied
  // one endpoint was rejected by the next for no reason a caller could see.
  hazardId: z.string().uuid(),
  consequence: z.string().min(5).max(1000),
  severity: SeverityEnum,
  likelihood: LikelihoodEnum,
  alarpJustification: z.string().max(4000).optional(),
}).refine(
  // ALARP is the whole point of the amber band: a tolerable risk is
  // tolerable only if it has been driven as low as reasonably
  // practicable, and the justification is the evidence of that. An
  // unjustified TOLERABLE is an unaccepted risk wearing a green badge.
  (r) => tolerability(r.severity, r.likelihood) !== "TOLERABLE" || !!r.alarpJustification,
  { message: "A TOLERABLE (ALARP) risk requires an alarpJustification", path: ["alarpJustification"] },
);
export type RiskAssessInput = z.infer<typeof RiskAssessInputSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  mfaCode: z.string().length(6).optional(),
});

// --------------------------- Sync envelope ---------------------------
export const SyncItemSchema = z.object({
  clientId: z.string().uuid(),
  entityType: z.enum(["safetyReport", "hazard", "riskAssessment"]),
  op: z.enum(["CREATE", "UPDATE", "DELETE"]),
  payload: z.unknown(),
  clientUpdatedAt: z.coerce.date(),
  baseVersion: z.string().optional(), // server updatedAt seen when the client last read
});
export const SyncBatchSchema = z.object({
  deviceId: z.string().min(8).max(64),
  items: z.array(SyncItemSchema).max(100),
});
export type SyncBatch = z.infer<typeof SyncBatchSchema>;

export type { Jurisdiction };
