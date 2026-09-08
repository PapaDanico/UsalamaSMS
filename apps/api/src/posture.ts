/* ============================================================
   THE SECURITY POSTURE, ASSERTED AGAINST THE DATABASE THAT HOLDS THE
   REPORTS — because the suite that was supposed to do it cannot run,
   and could never have asserted the half that matters most.

   `tests/integration/rls.integration.test.ts` holds seven assertions
   over the deny-by-default posture. It needs a real Postgres, so it is
   not in `npm run check`, so it does not run in the Netlify build, so
   its only home was GitHub Actions — where every run since 19 August
   2026 completes in three to six seconds with `runner_id: 0`. On 7
   September that cost something real: the SET-I migration reached
   `main` claiming the posture in its own header and delivering a third
   of it, and nothing failed.

   AND RUNNING IT HERE IS STRICTLY STRONGER THAN RUNNING IT THERE. That
   file says so itself, at line 32: the integration suite runs against a
   bare Postgres with no Supabase roles at all, so its grant assertion
   asserts nothing. `anon`, `authenticated` and `service_role` exist
   only in production. The control this repository calls "the actual
   control" — that those three hold ZERO privileges in schema public —
   has never once been checked where it is true.

   WHAT IT CHECKS, and each is a fact this file has been wrong about
   before:

     · row security enabled on every table, including ones added later;
     · exactly one RESTRICTIVE deny-all per table, `USING (false)`;
     · NO permissive policy — a permissive one can only ever grant, and
       twenty-seven of them appeared on this database once;
     · row security not FORCED, which would lock the API out of its own
       tables (the API is the owner and owners are exempt);
     · zero grants to anon/authenticated/service_role, mutation-proved
       against production as the thing that actually restrains a
       BYPASSRLS role;
     · every table owned by the connecting role, because a table owned
       by somebody else is denied to the API by its own policy AND
       carries that owner's default grants.

   ASSERTED OVER pg_catalog RATHER THAN OVER A LIST OF TABLES. A list is
   how eight tables once arrived outside the posture; the ninth table is
   covered by the same query as the first.

   THE DECISION IS HERE AND THE WIRING IS IN THE FUNCTION, for the
   reason `watchdog.ts` states: Netlify functions are not covered by the
   unit suite, so logic living there is logic nothing tests.
   ============================================================ */

/** One row per property, shaped so a failure names what is wrong. */
export interface PostureFacts {
  readonly tables: number;
  readonly rlsDisabled: readonly string[];
  readonly withoutDenyAll: readonly string[];
  readonly permissivePolicies: readonly string[];
  readonly forced: readonly string[];
  readonly notOwnedByApi: readonly string[];
  /** Rows in information_schema for the three browser-reachable roles. */
  readonly dataApiGrants: number;
  /** Which of those three roles exist here at all. */
  readonly supabaseRolesPresent: readonly string[];
  /** Who the API connected as, for the ownership comparison. */
  readonly connectedAs: string;
}

export type PostureVerdict =
  | { readonly kind: "HOLDS"; readonly tables: number }
  | { readonly kind: "BROKEN"; readonly failures: readonly string[]; readonly tables: number }
  /** The query itself could not run. Never an alarm about the posture. */
  | { readonly kind: "UNKNOWN"; readonly detail: string };

/**
 * The SQL. One round trip, all six properties.
 *
 * `string_agg` rather than a row per table so the result is one row and
 * a failure message can name the offenders without a second query.
 */
export const POSTURE_SQL = `
  select
    (select count(*)::int from pg_tables where schemaname = 'public') as tables,
    coalesce((select array_agg(tablename order by tablename) from pg_tables
               where schemaname = 'public' and not rowsecurity), '{}') as rls_disabled,
    coalesce((select array_agg(c.relname order by c.relname) from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r'
                and not exists (select 1 from pg_policies p
                                 where p.schemaname = 'public' and p.tablename = c.relname
                                   and p.permissive = 'RESTRICTIVE' and p.qual = 'false')), '{}')
      as without_deny_all,
    coalesce((select array_agg(distinct tablename order by tablename) from pg_policies
               where schemaname = 'public' and permissive = 'PERMISSIVE'), '{}') as permissive,
    coalesce((select array_agg(c.relname order by c.relname) from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r' and c.relforcerowsecurity), '{}')
      as forced,
    coalesce((select array_agg(tablename || ' -> ' || tableowner order by tablename)
               from pg_tables
              where schemaname = 'public' and tableowner <> current_user), '{}') as not_owned,
    (select count(*)::int from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee in ('anon', 'authenticated', 'service_role')) as data_api_grants,
    coalesce((select array_agg(rolname order by rolname) from pg_roles
               where rolname in ('anon', 'authenticated', 'service_role')), '{}') as roles_present,
    current_user as connected_as
`;

/**
 * Decide. Every clause names the table or the count, because "the
 * posture is broken" sends somebody to a dashboard and "SetiAssessment
 * has no RESTRICTIVE deny-all" sends them to a migration.
 */
export function postureFrom(facts: PostureFacts | null): PostureVerdict {
  if (!facts) return { kind: "UNKNOWN", detail: "the posture query did not return a row" };

  /* GUARDS ITS OWN SUBJECT. A query that found no tables reports a
     perfect posture over nothing, which is the failure mode this
     repository names "a check that cannot fail is worse than no
     check" — met four times, most recently in a mutation matrix whose
     six clean passes were all masked. */
  if (facts.tables < 10) {
    return { kind: "UNKNOWN", detail: `only ${facts.tables} tables in public — this check has lost its subject` };
  }

  const failures: string[] = [];
  if (facts.rlsDisabled.length)
    failures.push(`row security is OFF on: ${facts.rlsDisabled.join(', ')}`);
  if (facts.withoutDenyAll.length)
    failures.push(`no RESTRICTIVE deny-all on: ${facts.withoutDenyAll.join(', ')}`);
  if (facts.permissivePolicies.length)
    failures.push(
      `PERMISSIVE policies exist on: ${facts.permissivePolicies.join(', ')} — a permissive ` +
        'policy can only ever grant, and is OR\'d with the deny-all rather than AND\'d',
    );
  if (facts.forced.length)
    failures.push(
      `row security is FORCED on: ${facts.forced.join(', ')} — forcing it applies the deny-all ` +
        'to the owner, which is the API, so every read and write fails',
    );
  if (facts.notOwnedByApi.length)
    failures.push(
      `not owned by ${facts.connectedAs}: ${facts.notOwnedByApi.join(', ')} — RLS applies to a ` +
        "non-owner, so the deny-all denies the API its own rows, and the object carries that " +
        "owner's default grants",
    );

  /* THE ONE THE INTEGRATION SUITE COULD NEVER MAKE. Only meaningful
     where the roles exist; a bare Postgres has none, and reporting
     "zero grants" there would be reporting the absence of the roles. */
  if (facts.supabaseRolesPresent.length > 0 && facts.dataApiGrants > 0) {
    failures.push(
      `${facts.dataApiGrants} grant row(s) in public to ${facts.supabaseRolesPresent.join('/')} — ` +
        'service_role BYPASSES RLS, so a grant to it is read and write over every table no ' +
        'policy in this database can restrain',
    );
  }

  return failures.length
    ? { kind: "BROKEN", failures, tables: facts.tables }
    : { kind: "HOLDS", tables: facts.tables };
}

export function isBroken(v: PostureVerdict): v is Extract<PostureVerdict, { kind: "BROKEN" }> {
  return v.kind === "BROKEN";
}

export function postureSubject(): string {
  return "UsalamaSMS: the database security posture has changed";
}

export function postureBody(v: Extract<PostureVerdict, { kind: "BROKEN" }>): string {
  return [
    "The deny-by-default posture on the production database no longer holds.",
    "",
    ...v.failures.map((f) => `  · ${f}`),
    "",
    `Checked over ${v.tables} tables in schema public.`,
    "",
    "WHY THIS IS ITS OWN ALARM. The site can be perfectly healthy while",
    "this is wrong: every screen answers, every deploy is green, and the",
    "only thing that changed is who can read the reports. On 16 August",
    "2026 one grant on one table let service_role read every report in",
    "the database straight through the RESTRICTIVE policy.",
    "",
    "WHERE IT USUALLY COMES FROM:",
    "",
    "  · a migration that created a table without the posture block —",
    "    copy it from 20260818033214_fatigue_limits_and_report_detail;",
    "  · the Supabase dashboard's table editor, which goes through",
    "    PostgREST as service_role and needs grants to work;",
    "  · a policy added on the advisor's recommendation, which reports",
    "    rls_enabled_no_policy against every table and is answered by",
    "    the RESTRICTIVE deny-all rather than by a permissive one.",
    "",
    "CLAUDE.md carries the full posture and the SQL that restores it.",
  ].join("\n");
}
