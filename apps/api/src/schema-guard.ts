// =====================================================================
// Does the database actually hold what this build expects?
//
// WHY THIS EXISTS, and it is a fresh scar rather than a precaution.
// Pull request #20 merged, Netlify deployed the code, and the migration
// that creates its nine tables was never run — because merging ships
// code and nothing ships schema, and nothing said so. `/api/ready`
// answered `{"ok":true}` throughout, because all it asked the database
// was `SELECT 1`.
//
// That is the readiness probe passing while the product is broken. A
// safety manager opening /sms got "This part of the record could not be
// read", element after element — a message written for a lost
// connection, doing duty for a schema that was never applied. The
// export answered 500. It was found by querying production by hand,
// which is not a repeatable process.
//
// So `ready` now means what the word means: the connection is up AND
// every table this build queries exists. A missing one is named in the
// response, because "not ready" without the reason is a second thing to
// go and find out.
//
// THE LIST IS NOT MAINTAINED BY HAND. tests/schema-guard.test.ts reads
// the models out of prisma/schema.prisma and fails if this disagrees,
// so a new model cannot be added without this learning about it —
// charter rule 10 applied to a table list instead of a count. Adding a
// model and forgetting this file is exactly the mistake that caused the
// outage; it now fails the build instead of production.
// =====================================================================
import type { PrismaClient } from "@prisma/client";

/**
 * Every table this build reads or writes, as Postgres names them.
 *
 * Prisma maps a model to a quoted table of the same name, so these are
 * the model names verbatim. Kept sorted so a diff on this file reads as
 * one line rather than a reshuffle.
 */
export const EXPECTED_TABLES: ReadonlyArray<string> = Object.freeze([
  "Accountability",
  "Appointment",
  "AuditFinding",
  "AuditLog",
  "ChangeAssessment",
  "ControlledDocument",
  "CorrectiveAction",
  "DocumentAcknowledgement",
  "EmergencyContact",
  "EmergencyExercise",
  "FatigueLimit",
  "Hazard",
  "Org",
  "OrgConfig",
  "PasswordReset",
  "PolicyAcknowledgement",
  "RefreshToken",
  "ReportAttachment",
  "ReportTransition",
  "RiskAssessment",
  "SafetyCommunication",
  "SafetyPolicy",
  "SafetyReport",
  "Spi",
  "SpiPeriod",
  "SyncReceipt",
  "TrainingRecord",
  "User",
  "VoluntaryScheme",
]);

/**
 * Which expected tables the database does not have.
 *
 * One round trip regardless of how many tables there are, and it asks
 * Postgres rather than trusting `_prisma_migrations` — a migration row
 * says a migration ran, which is not the same as the table being there
 * now. `to_regclass` returns null for an absent relation instead of
 * raising, so a missing table is data rather than an exception.
 */
export async function missingTables(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string; present: boolean }>>(
    `SELECT t.name, to_regclass('public.' || quote_ident(t.name)) IS NOT NULL AS present
       FROM unnest($1::text[]) AS t(name)`,
    EXPECTED_TABLES as string[],
  );
  return rows.filter((r) => !r.present).map((r) => r.name).sort();
}

/**
 * Every enum value this build expects Postgres to hold, by enum name.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE TABLE LIST, and it is the second
 * scar on the same bone. The table check above was written after #20,
 * where a migration never ran and `/api/ready` said `{"ok":true}`
 * throughout. On 19 August 2026 the identical failure arrived one level
 * down: `Jurisdiction` gained seven values in schema.prisma and in the
 * signup dropdown, no migration added them to Postgres, and the enum
 * held exactly two.
 *
 * `missingTables` could not see it. `to_regclass` asks whether a
 * RELATION exists; an enum value is not a relation, so every table was
 * present, the probe answered ready, and signup answered 500 to anyone
 * outside Kenya. The readiness probe passing while the product is
 * broken — the exact sentence this file opens with, one axis over.
 *
 * Kept sorted for the same reason as the table list, and checked
 * against prisma/schema.prisma by tests/schema-guard.test.ts so a value
 * added to the schema cannot be forgotten here.
 */
export const EXPECTED_ENUM_VALUES: Readonly<Record<string, ReadonlyArray<string>>> =
  Object.freeze({
    ChangeStatus: Object.freeze([
      "APPROVED",
      "ASSESSED",
      "DRAFT",
      "IN_EFFECT",
      "REVIEWED",
    ]),
    ChangeTrigger: Object.freeze([
      "EQUIPMENT_OR_SYSTEM",
      "FLEET",
      "KEY_PERSONNEL",
      "ORGANISATION",
      "OTHER",
      "PROCEDURE",
      "ROUTE_OR_NETWORK",
    ]),
    FindingSeverity: Object.freeze([
      "IMPROVEMENT",
      "NONCONFORMITY",
      "OBSERVATION",
    ]),
    FlightPhase: Object.freeze([
      "APPROACH",
      "CLIMB",
      "CRUISE",
      "DESCENT",
      "GO_AROUND",
      "GROUND_HANDLING",
      "INITIAL_CLIMB",
      "LANDING",
      "LANDING_ROLL",
      "MAINTENANCE",
      "PUSHBACK",
      "STANDING",
      "TAKEOFF",
      "TAXI",
    ]),
    Jurisdiction: Object.freeze([
      "BI",
      "CD",
      "ICAO",
      "KE",
      "RW",
      "SO",
      "SS",
      "TZ",
      "UG",
    ]),
    Likelihood: Object.freeze([
      "EXTREMELY_IMPROBABLE",
      "FREQUENT",
      "IMPROBABLE",
      "OCCASIONAL",
      "REMOTE",
    ]),
    ReportState: Object.freeze([
      "ACTIONS_OPEN",
      "CLOSED",
      "SUBMITTED",
      "TRIAGED",
      "UNDER_INVESTIGATION",
    ]),
    ReportType: Object.freeze([
      "FATIGUE",
      "HAZARD",
      "MOR",
      "NEAR_MISS",
      "SUGGESTION",
      "VCR",
    ]),
    RiskStatus: Object.freeze([
      "ACCEPTED",
      "CLOSED",
      "MITIGATED",
      "OPEN",
    ]),
    Role: Object.freeze([
      "ACCOUNTABLE_EXECUTIVE",
      "FRONTLINE",
      "INVESTIGATOR",
      "KEY_MANAGEMENT",
      "PLATFORM_ADMIN",
      "REGULATOR_INSPECTOR",
      "SAFETY_MANAGER",
      "SAFETY_OFFICER",
      "SYSTEM_ADMIN",
    ]),
    Severity: Object.freeze([
      "A_CATASTROPHIC",
      "B_HAZARDOUS",
      "C_MAJOR",
      "D_MINOR",
      "E_NEGLIGIBLE",
    ]),
    Tolerability: Object.freeze([
      "ACCEPTABLE",
      "INTOLERABLE",
      "TOLERABLE",
    ]),
  });

/**
 * Which expected enum values the database does not have, as
 * `"EnumName.VALUE"` so the response names the thing to fix.
 *
 * One round trip, and it asks pg_enum rather than trusting the
 * migration ledger — a recorded migration says a statement ran, which
 * is not the same as the value being there now. An enum the database
 * does not have at all reports every one of its values as missing,
 * which is the honest answer rather than an exception.
 */
export async function missingEnumValues(prisma: PrismaClient): Promise<string[]> {
  const pairs: Array<{ enumName: string; value: string }> = [];
  for (const [enumName, values] of Object.entries(EXPECTED_ENUM_VALUES))
    for (const value of values) pairs.push({ enumName, value });
  if (pairs.length === 0) return [];

  const rows = await prisma.$queryRawUnsafe<Array<{ enum_name: string; value: string; present: boolean }>>(
    `SELECT w.enum_name, w.value,
            EXISTS (
              SELECT 1 FROM pg_type t
                JOIN pg_enum e ON e.enumtypid = t.oid
               WHERE t.typname = w.enum_name AND e.enumlabel = w.value
            ) AS present
       FROM unnest($1::text[], $2::text[]) AS w(enum_name, value)`,
    pairs.map((p) => p.enumName),
    pairs.map((p) => p.value),
  );
  return rows.filter((r) => !r.present).map((r) => `${r.enum_name}.${r.value}`).sort();
}
