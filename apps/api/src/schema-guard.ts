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
