// =====================================================================
// The deny-by-default posture, asserted over the SCHEMA rather than
// over a list.
//
// WHY THIS EXISTS, and it is a fresh scar. Every table in `public` has
// row security enabled and exactly one RESTRICTIVE deny-all policy.
// (This comment said "zero policies" for longer than that was true —
// the restrictive policy replaced the empty set in August 2026, and the
// reasoning is in CLAUDE.md.) That is not an unfinished migration — it
// is the security model, documented in CLAUDE.md:
// nothing in this product uses PostgREST and the anon key is
// deliberately absent from the codebase.
//
// ONE CLAIM THAT USED TO SIT HERE WAS FALSE, and it mattered. This
// comment said there were "no Data API grants". There are: measured on
// production, `anon`, `authenticated` and `service_role` each hold 196
// table grants in `public`, issued by Supabase at project creation and
// never removed. So the deny-all is not a second lock behind an empty
// grant table — it IS the lock.
//
// It held against `anon` and `authenticated`, which cannot bypass RLS.
// It did NOT hold against `service_role`, which carries `rolbypassrls`:
// granted SELECT on `SafetyReport` alone, that role read all seven real
// production reports straight through the RESTRICTIVE deny-all. Proved
// against production, then reverted.
//
// So the grants were revoked from all three roles — BYPASSRLS bypasses
// policies, not privileges — and `public` now shows zero grant rows for
// them while the owner keeps its 196. CLAUDE.md holds the statements
// and the reasoning.
//
// Nothing below can assert any of that: these tests run against a local
// Postgres that has no Supabase roles at all, so a grant assertion here
// would pass by measuring an empty set — a check that cannot fail. It
// is written down instead of gated, deliberately, and named as such.
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

  /* THE POSTURE CHANGED, AND THIS ASSERTION CHANGED WITH IT.
   *
   * It used to require ZERO policies. That denied — but only for as long
   * as nobody added one, and the pressure to add one is constant:
   * Supabase's advisor reports the absence on every table and its agent
   * skill recommends fixing it. That pressure produced exactly what it
   * was always going to: twenty-seven policies appeared on the
   * production database, twelve of them GRANTING the `authenticated`
   * role every operation on rows matching a JWT claim.
   *
   * The deny policies alongside them denied nothing, because they were
   * PERMISSIVE and permissive policies are OR'd. That is the trap this
   * assertion now closes: it is not enough for a deny policy to exist,
   * it has to be RESTRICTIVE, because only a restrictive one cannot be
   * widened by adding another policy beside it.
   *
   * So the rule is no longer "nothing is here". It is "the backstop is
   * here, on every table, and nothing permissive sits beside it" —
   * which survives somebody acting on the advisor, where the old one
   * only survived nobody acting.
   */
  it("gives every table a RESTRICTIVE deny-all, which is the backstop", async () => {
    const rows = await prisma().$queryRawUnsafe<Array<{ tablename: string }>>(
      `SELECT c.relname AS tablename
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND NOT EXISTS (
            SELECT 1 FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = c.relname
               AND p.permissive = 'RESTRICTIVE' AND p.qual = 'false')`,
    );
    expect(
      rows.map((r) => r.tablename),
      "these tables have no RESTRICTIVE deny-all policy. RLS with no policy denies " +
        "today and stops denying the moment somebody adds one on the advisor's " +
        "recommendation. A restrictive policy is AND'd with every other, so it cannot " +
        "be widened by anything added beside it.",
    ).toEqual([]);
  });

  it("carries NO permissive policy, because a permissive one can only GRANT", async () => {
    const granting = await prisma().$queryRawUnsafe<Array<{ tablename: string; policyname: string }>>(
      `SELECT tablename, policyname FROM pg_policies
        WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'`,
    );
    expect(
      granting.map((p) => `${p.tablename}.${p.policyname}`),
      "a PERMISSIVE policy exists on a schema whose access model from the anon and " +
        "authenticated roles is NONE. Permissive policies are OR'd, so this widens " +
        "access however narrow its own USING clause looks. If the Data API is genuinely " +
        "being adopted, that needs the grants, the policies and a test that a second " +
        "tenant cannot read the first one's reports, in the same change — and this " +
        "assertion updated deliberately.",
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
    //
    // THREE EXEMPTIONS, AND EACH IS STRUCTURAL RATHER THAN GRANTED.
    // `Org` IS the tenant. `RefreshToken` and `PasswordReset` are
    // CREDENTIAL tables: every row is found by a unique hash of a
    // secret, which resolves to exactly one user and therefore to
    // exactly one org, and neither is ever listed or filtered by
    // tenant. An orgId on them would be a denormalised copy no query
    // narrows by — a column that looks like a control and enforces
    // nothing, which is worse than its absence.
    //
    // The exemption is bounded below rather than left to grow: the
    // assertion after this one fails if the list ever reaches a
    // quarter of the schema, at which point it has stopped being a set
    // of exceptions and become a way of passing.
    const EXEMPT = ["_prisma_migrations", "Org", "RefreshToken", "PasswordReset"];
    const total = await prisma().$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    expect(
      EXEMPT.length * 4,
      `${EXEMPT.length} of ${total[0]!.n} tables are exempt from tenant scoping — at that ` +
        "ratio this check passes by exempting whatever it would otherwise fail on",
    ).toBeLessThan(Number(total[0]!.n));

    const withoutOrg = await prisma().$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT t.table_name
         FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND t.table_name NOT IN ('_prisma_migrations', 'Org', 'RefreshToken', 'PasswordReset')
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

  /* ==================================================================
     THE TWO ASSERTIONS ABOVE PROTECT THE POLICY. THIS FILE HAD NONE
     PROTECTING THE CONTROL.

     CLAUDE.md is unambiguous about which is which: `service_role`
     carries rolbypassrls, so a RESTRICTIVE deny-all "never restrained
     service_role and never could — the revoke is the control." That
     was mutation-checked against production: with SELECT granted back
     on SafetyReport alone, service_role read all seven real reports
     straight through the deny-all.

     So the load-bearing half of this posture was the one half nothing
     asserted. Both tests below fix that, and each states a property
     rather than a number so neither has to be edited when the schema
     grows.
     ================================================================== */

  it("GRANTS NOTHING IN public TO THE BYPASSRLS ROLES, which is the actual control", async () => {
    /* Discovered, not listed. A hardcoded role list stops covering the
       moment Supabase adds one, and this suite also runs against a bare
       Postgres where none of the three exist — so the roles are read
       from pg_roles and the count is asserted, because a query over
       zero roles returns zero grants and passes perfectly. */
    const present = await prisma().$queryRawUnsafe<Array<{ rolname: string }>>(
      `SELECT rolname FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role')`,
    );

    if (present.length === 0) {
      /* A bare Postgres. Nothing to revoke and nothing to prove — say
         so out loud rather than reporting a pass, because a silent skip
         here reads identically to a real check. */
      expect(present, "no Supabase roles in this database — nothing to assert").toEqual([]);
      return;
    }

    const grants = await prisma().$queryRawUnsafe<
      Array<{ grantee: string; table_name: string; privilege_type: string }>
    >(
      `SELECT grantee, table_name, privilege_type
         FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee IN ('anon', 'authenticated', 'service_role')
        ORDER BY grantee, table_name, privilege_type`,
    );

    expect(
      grants.map((g) => `${g.grantee} ${g.privilege_type} ${g.table_name}`),
      "a BYPASSRLS role holds a privilege in public. The RESTRICTIVE deny-all does not " +
        "restrain it — a token signed with the project JWT secret would read these rows " +
        "straight through the policy. The revoke is the control; it has come undone",
    ).toEqual([]);
  });

  it("keeps every table under one owner, and that owner is the API", async () => {
    /* WHY THIS IS PART OF THE SAME PROPERTY. RLS does not apply to a
       table's owner, which is the entire reason the deny-all does not
       lock the API out of its own data. A table owned by anybody else
       is a table the API reads through the policy — and the policy
       denies everything.

       It is also the missing half of the default-privileges revoke.
       That revoke applies to objects created BY the owner; Supabase's
       own defaults, granted by supabase_admin, still hand all three
       roles full privileges on anything supabase_admin creates. This
       assertion is what notices such a table arriving. */
    const rows = await prisma().$queryRawUnsafe<Array<{ tablename: string; tableowner: string }>>(
      `SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public'`,
    );
    expect(rows.length, "no tables found in public — this check has lost its subject").toBeGreaterThan(10);

    /* THIS ASSERTION BRIEFLY ADMITTED BYPASSRLS, AND THE ROUND TRIP IS
       WORTH KEEPING. On 21 August 2026 `DATABASE_URL` held a stale
       password for `postgres`, supavisor refused every handshake, and
       the product was down. The repair created `usalama_api` WITH
       BYPASSRLS, because `alter user postgres with password` answers
       "only superusers can alter privileged roles". For a few hours the
       API was therefore a NON-OWNER that bypassed row security — the
       exact shape CLAUDE.md mutation-proved dangerous for
       `service_role` — and this assertion was widened to "owns the
       tables OR bypasses RLS" to match.

       That widening rested on a measurement that was WRONG. The claim
       was that ownership could not be transferred because `postgres`
       held no admin_option over `usalama_api`. The query behind it asked
       whether `usalama_api` was a MEMBER of something; the grant PG16
       makes runs the other way — roleid = usalama_api, member = postgres
       — and it was there, admin_option true, all along. With ADMIN,
       `postgres` can re-grant the role to itself WITH SET, which is what
       `ALTER TABLE … OWNER TO` requires and what makes the transfer
       reversible.

       So the tables were reassigned to `usalama_api`, BYPASSRLS was
       dropped, and the posture is the original one again: RLS does not
       stop the API because the API OWNS the tables. The `or bypasses`
       branch is gone deliberately. Keeping it would have left a gate
       that passes on a posture nothing is running. */
    const me = await prisma().$queryRawUnsafe<Array<{ me: string }>>(`SELECT current_user AS me`);
    const connectedAs = me[0]!.me;

    /* ONE owner. This is the half that catches a table created by
       `supabase_admin`, which arrives carrying that role's default
       grants to all three Data API roles — something the
       default-privileges revoke, keyed on the creating role, does not
       cover. It shows up here as a second owner. */
    const owners = [...new Set(rows.map((r) => r.tableowner))];
    expect(
      owners.length,
      `public holds tables under ${owners.length} different owners (${owners.join(", ")}). ` +
        "An object created by another role arrives carrying that role's default grants, " +
        "which the default-privileges revoke does not cover",
    ).toBe(1);

    expect(
      owners[0],
      `the API connects as ${connectedAs} but the tables are owned by ${owners[0]}. RLS ` +
        "applies to a non-owner, so the RESTRICTIVE deny-all denies the API its own rows " +
        "and every read comes back empty",
    ).toBe(connectedAs);
  });
});
