# Working in this repository

Short, and only the things that are counter-intuitive enough to get
wrong. Everything else lives in `docs/` — start with
`docs/DIAGNOSTIC-CHARTER.md`.

---

## RLS is enabled with NO policies, and that is correct

Every table in `public` has `rowsecurity = true` and **zero policies**.
That is not an unfinished migration. It is deny-by-default, and it is
the security posture:

- nothing in this product uses `supabase-js`, `createClient()` or
  PostgREST. The Supabase **anon/publishable key is deliberately absent
  from the codebase** — there is nothing to hold it;
- every read and write goes through the Fastify API in `apps/api`,
  which connects as the database owner and enforces tenancy in SQL
  (`orgId` on every tenant-owned table, indexed first);
- with no policies and no Data API grants, the `anon` and
  `authenticated` roles can reach nothing at all.

**The Supabase agent skill in `.agents/skills/supabase` will tell you
otherwise.** Its Core Principle 5 says *"After enabling RLS, create
policies that match the actual access model."* That is correct advice
for an application that talks to PostgREST from a browser. Applied
here it would **open access that is currently closed**, because the
access model this product needs from the `anon` role is *none*.

So: do not add RLS policies. Do not add `FORCE ROW LEVEL SECURITY`
either — the API connects as the table owner, and forcing RLS on an
owner with no policies locks the application out of its own database.

**Supabase's own security advisor also says otherwise**, and will keep
saying it. `mcp__Supabase__get_advisors` reports
`rls_enabled_no_policy` at level INFO against all ten tables, with a
remediation link to a page about writing policies. Checked on 12 August
2026: those ten notices are the *entire* security finding list — there
are no errors and no warnings. Ten INFO notices describing the intended
state is a clean bill of health for this architecture, not a to-do
list.

If this ever changes — if something genuinely starts using the Data
API — that is a deliberate architectural decision, and it needs the
grants, the policies and a test that a second tenant cannot read the
first one's reports, in the same change.

## Two different connection strings, for two different jobs

| Job | Endpoint | Why |
|---|---|---|
| Netlify Function (`DATABASE_URL` in the deploy) | **Transaction pooler**, port 6543, `?pgbouncer=true&connection_limit=1` | Serverless. Direct connections are IPv6-only by default and Lambda egresses IPv4 — it never connects at all |
| `prisma migrate`, `npm run seed`, `npm run seed:demo` | **Direct or session**, port 5432 | DDL and advisory locks need a real session |

The pooler is a different **host and username**, not just a different
port: `aws-<n>-<region>.pooler.supabase.com` and
`postgres.<project-ref>`. Editing `5432` to `6543` in a direct string
produces something that looks right and resolves to nothing.
`npm run setup:env` warns on both.

`pg_advisory_xact_lock` is transaction-scoped, which is why the audit
chain is safe under transaction pooling. A session-scoped lock would
not be.

## Counts are computed, never typed

Charter rule 10. `npm run check:claims` fails the build when a number
in the README or the docs disagrees with the code it describes — test
counts, assertion counts, jurisdiction counts, the coverage figure.

When a gate fails on a count, the fix is to read the real number and
write that. It is not to adjust the assertion.

## A check that cannot fail is worse than no check

This has bitten four times in this repository, and each one is
recorded where it happened:

- a CSS gate that read stdout while esbuild wrote to stderr;
- a smoke check that reported "nothing was sent" about a send it had
  itself prevented, by deleting the database it was measuring;
- a timezone test that passed with the defect restored, because the
  suite runs in UTC where both implementations agree — now pinned to
  `Africa/Nairobi`;
- a `DUE_SOON` proportionality test that lost its second window when
  the EU jurisdiction was removed, leaving a rule about proportion
  with nothing to be proportional to.

**When you write a check, put the defect back and confirm it goes
red.** Every fix in this repo that claims to be verified was
mutation-checked that way.

## Secrets

No secret appears in this repository, ever. `.env.example` carries
names only. The database password does not travel through a chat log,
a commit message, or a file the repository tracks — use
`npm run setup:env`, which reads it with terminal echo off and never
prints or stores it.

## Before you say something is done

`npm run check` (typecheck, brand, claims, css, unit) and
`npm run verify` (build, smoke against the built bundle, the two-version
PWA update gate). `npm run test:integration` needs a real Postgres —
`bash scripts/local-db.sh` starts one.

The bundle budget is two numbers on purpose. The total says something
grew; the **entry** says it grew in a place a reporter at a remote
strip has to pay for. Raising either needs a receipt in
`scripts/stamp-sw.mjs` saying what was bought.
