// =====================================================================
// UsalamaSMS — Shared Types, Validation & Safety-Critical Calculations
// All calculations deterministic and unit-tested. Strict TS, no `any`.
// =====================================================================
import { z } from "zod";

export * from "./regulations";
export * from "./regulatory-source";
export * from "./taxonomy";
export * from "./glossary";
import { isValidLocation, isValidAircraftType } from "./taxonomy";
import { JURISDICTIONS, type Jurisdiction } from "./regulations";

// ------------------------- Enums (mirror Prisma) ---------------------
export const RoleEnum = z.enum([
  "FRONTLINE", "SAFETY_OFFICER", "SAFETY_MANAGER", "INVESTIGATOR",
  "KEY_MANAGEMENT", "ACCOUNTABLE_EXECUTIVE", "REGULATOR_INSPECTOR", "SYSTEM_ADMIN",
  /* The vendor, not the operator — see permissions.ts. It is in this
     enum because it is a value the Role column holds, and NOT in any
     screen's role picker: an operator cannot create one, because a
     tenant that could mint a platform administrator would be a tenant
     that could read the others. */
  "PLATFORM_ADMIN",
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
import { tolerability } from "./risk";

/* `acceptanceAuthority()` USED TO LIVE HERE, and its deletion is the
   point rather than a tidy-up.

   It mapped a band to the permission that could accept it, had no
   caller outside its own test, and returned `risk.accept.intolerable`
   for the red band — a permission the product has now removed, because
   there is no act to grant. Three modules therefore held an opinion
   about who may accept a risk: this one, the permission matrix, and
   holder.ts, and the first two disagreed with the third.

   Two are enough, and they answer different questions:

     permissions.ts — MAY THIS ROLE DO THIS KIND OF THING AT ALL;
     holder.ts      — IS IT SENIOR ENOUGH FOR THIS BAND.

   Both are checked, in that order, at each of the two places a risk can
   be signed for. A function that answered a third version of the
   question was how they were allowed to drift. */

// --------------------------- RBAC matrix -----------------------------
export * from "./permissions";


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
  // Validated against the taxonomy, not merely length-checked. The
  // dropdown constrains the form; this constrains the REQUEST, which is
  // what a future integration or a replayed payload actually sends.
  location: z.string().max(120).refine(isValidLocation, {
    message: "location must be an aerodrome code from the taxonomy, or a description",
  }).optional(),
  aircraftType: z.string().max(120).refine(isValidAircraftType, {
    message: "aircraftType must be a type code from the taxonomy, or a description",
  }).optional(),
  phase: FlightPhaseEnum.optional(),
  hrcTags: z.array(HrcEnum).max(6).default([]),
  /**
   * WHAT THE REPORTER THINKS SHOULD BE DONE.
   *
   * Taken from the operator hazard report form the design partner uses:
   * "Reporter's Recommendations" is a first-class section there, above
   * the safety office's own analysis, and this product did not have it.
   *
   * It is the cheapest safety intelligence in the system. The person who
   * saw the hazard is usually the person who knows the fix, and asking
   * costs one optional field. Leaving it out means the fix arrives, if
   * at all, from someone who was not there.
   *
   * Optional and always will be: making it required would put a second
   * writing task between a ramp agent and filing, which is how report
   * volume dies.
   */
  reporterRecommendation: z.string().max(2000).optional(),
  /**
   * WHAT A FATIGUE REPORT CARRIES THAT NO OTHER REPORT DOES.
   *
   * NESTED RATHER THAN FLAT, unlike location and aircraftType above,
   * and the nesting is the point: every one of these is meaningless
   * unless the type is FATIGUE, and an optional object says that in the
   * shape rather than in a comment. The refinement below then makes it
   * impossible to attach a duty to a bird strike.
   *
   * EVERY FIELD IS OPTIONAL INSIDE IT. A crew member who cannot
   * remember their rest to the half hour must still be able to file —
   * a form that refuses an incomplete fatigue report converts a report
   * into silence, which is the one outcome this product cannot afford.
   * fatigue.ts reports the shortfall as INCOMPLETE rather than guessing.
   */
  fatigue: z.object({
    flightTimeHours: z.number().min(0).max(24).optional(),
    dutyHours: z.number().min(0).max(48).optional(),
    restBeforeHours: z.number().min(0).max(168).optional(),
    sectors: z.number().int().min(0).max(40).optional(),
    sleepPrior24Hours: z.number().min(0).max(24).optional(),
    /* LOCAL hours, 0..23. The window of circadian low belongs to the
       reporter's body clock, so a UTC timestamp would need an
       acclimatisation model this product does not have. */
    startLocalHour: z.number().int().min(0).max(23).optional(),
    endLocalHour: z.number().int().min(0).max(23).optional(),
    /* Samn-Perelli. Bounded to the scale so a client cannot invent an
       eighth level that every threshold comparison then mis-reads. */
    samnPerelli: z.number().int().min(1).max(7).optional(),
  }).optional(),
  isAnonymous: z.boolean().default(false),
}).refine(
  (r) => r.type !== "MOR" || r.occurredAt !== undefined,
  { message: "MOR requires occurredAt to compute the regulatory deadline", path: ["occurredAt"] },
).refine(
  (r) => !r.awareAt || !r.occurredAt || r.awareAt.getTime() >= r.occurredAt.getTime(),
  { message: "awareAt cannot precede occurredAt", path: ["awareAt"] },
).refine(
  /* A DUTY CANNOT BE ATTACHED TO A BIRD STRIKE. The fatigue block is
     read by the fatigue picture and by nothing else, so a block riding
     on a HAZARD would be data that no screen displays and no query
     counts — invisible rather than wrong, which is worse. Rejected at
     the door with a message naming the field, rather than silently
     dropped on the way to the database. */
  (r) => !r.fatigue || r.type === "FATIGUE",
  { message: "duty details belong to a FATIGUE report", path: ["fatigue"] },
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

/* `SignupSchema` LIVES IN ./signup, not here, and the reason is the
   one permissions.ts records: this barrel is imported by the report
   form for CreateReportSchema, so anything exported from it rides in
   the ENTRY chunk a ramp agent downloads before they can file. A zod
   object describing a form an operator fills in ONCE IN ITS LIFE is the
   clearest possible example of weight charged to the wrong person — it
   put entry 0.8 KB over on the build that introduced it. */

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
