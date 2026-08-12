// =====================================================================
// The deny-by-default posture, asserted over the SCHEMA rather than
// over a list.
//
// WHY THIS EXISTS, and it is a fresh scar. Every table in `public` has
// row security enabled and zero policies. That is not an unfinished
// migration — it is the security model, documented in CLAUDE.md:
// nothing in this product uses PostgREST, the anon key is deliberately
// absent from the codebase, and with no policies and no Data API grants
// the `anon` and `authenticated` roles can reach nothing at all.
//
// The migration that established it named its ten tables one by one.
// Postgres creates a new table with row security OFF. So when eight
// tables arrived for the rest of Annex 19 — holding an operator's
// signed safety policy, its appointment records and its people's
// training — they arrived outside the posture, silently, and nothing
// in the repository would have said so. Caught by counting tables
// after the migration ran; it should not have needed catching.
//
// This asserts the property over `pg_tables`, so the ninth table is
// covered by the same assertion as the first. A list is a guard that
// stops covering the moment somebody adds to the thing it guards.
//
// AND ZERO POLICIES IS ASSERTED TOO, in the same breath and for a
// reason that runs the other way: the Supabase agent skill and
// Supabase's own advisor both recommend adding policies here, and both
// are wrong for this architecture. A policy added on their advice would
// OPEN access that is currently closed. If policies are ever genuinely
// wanted, this test is where that decision gets made deliberately.
// =====================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, migrate, disconnect, hasDatabase } from "./db.setup";

/** Prisma's own bookkeeping. Not application data, and not tenant-scoped. */
const NOT_APPLICATION_DATA = new Set(["_prisma_migrations"]);

describe.skipIf(!hasDatabase)("row-level security posture", () => {
  beforeAll(() => migrate());
  afterAll(() => disconnect());

  it("ENABLES ROW SECURITY ON EVERY APPLICATION TABLE, including ones added later", async () => {
    const rows = await prisma().$queryRawUnsafe<Array<{ tablename: string; rowsecurity: boolean }>>(
      `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const application = rows.filter((r) => !NOT_APPLICATION_DATA.has(r.tablename));

    expect(
      application.length,
      "no application tables were found, so this assertion has lost its subject",
    ).toBeGreaterThanOrEqual(10);

    const unprotected = application.filter((r) => !r.rowsecurity).map((r) => r.tablename);
    expect(
      unprotected,
      `these tables were created without row security: ${unprotected.join(", ")}. ` +
        "Postgres does not enable it by default, so a table added in a later migration " +
        "sits outside the posture unless the migration says so.",
    ).toEqual([]);
  });

  it("carries NO policies, which is the posture and not an omission", async () => {
    const policies = await prisma().$queryRawUnsafe<Array<{ tablename: string; policyname: string }>>(
      `SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'`,
    );
    expect(
      policies.map((p) => `${p.tablename}.${p.policyname}`),
      "a policy exists on a schema whose access model from the anon role is NONE. " +
        "Supabase's advisor and its agent skill both recommend adding these; both are " +
        "correct for a product that talks to PostgREST from a browser and wrong for this " +
        "one. If the Data API is genuinely being adopted, that needs the grants, the " +
        "policies and a test that a second tenant cannot read the first one's reports, " +
        "in the same change — and this assertion updated deliberately.",
    ).toEqual([]);
  });

  it("does not FORCE row security, which would lock the API out of its own tables", async () => {
    // The API connects as the table owner. Owners bypass RLS by design;
    // forcing it on an owner with no policies denies everything to the
    // one role that has to read and write.
    const forced = await prisma().$queryRawUnsafe<Array<{ relname: string }>>(
      `SELECT c.relname FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity`,
    );
    expect(
      forced.map((f) => f.relname),
      "FORCE ROW LEVEL SECURITY is set on a table the API owns, with no policies to " +
        "let it back in. Every read and write against that table now fails.",
    ).toEqual([]);
  });

  it("keeps every tenant-owned table scoped by an orgId column", async () => {
    // The posture only means anything because tenancy is enforced in
    // SQL. A tenant-owned table with no orgId cannot be.
    const withoutOrg = await prisma().$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT t.table_name
         FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND t.table_name NOT IN ('_prisma_migrations', 'Org', 'RefreshToken')
          AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns c
                 WHERE c.table_schema = 'public'
                   AND c.table_name = t.table_name
                   AND c.column_name = 'orgId')`,
    );
    expect(
      withoutOrg.map((t) => t.table_name),
      "a tenant-owned table has no orgId, so nothing can scope a query against it",
    ).toEqual([]);
  });
});
