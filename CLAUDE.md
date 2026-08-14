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
`rls_enabled_no_policy` at level INFO against **every** table, with a
remediation link to a page about writing policies. Re-checked on 14
August 2026, after the report transitions, the corrective actions and
the emergency contact directory landed: **twenty-six** notices, all of
them that one, and they are the *entire* security finding list — no
errors and no warnings. Twenty-six INFO notices describing the intended
state is a clean bill of health for this architecture, not a to-do
list.

(It read nineteen on 12 August. The number moves every time a table is
added, which is the point made below: the count is not the check.)

The number is written here as a count and will go stale again. What
does not go stale is the shape: EVERY table carries this notice and
NOTHING carries anything else. If a table ever appears without it, RLS
was not enabled on it — that is the real finding, and it is the one
`tests/integration/rls.integration.test.ts` asserts over `pg_tables`
rather than over a list, precisely because the ten-table version of
that list is how eight tables once arrived outside the posture.

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

## Rotating a demo password

`npm run seed:demo -- --rotate`. It re-issues a password for accounts
that already exist, revokes every live refresh token they hold, and
prints the new one once into the terminal of whoever ran it.

The flag exists because the instruction had no mechanism. `seed:demo`
is idempotent by email and skips accounts that already exist, so a
plain re-run answers "Every demo account already exists. No passwords
to show." — and the only remaining routes were deleting the users,
which orphans `reporterId` on every report they filed, or writing an
argon2 hash into production by hand. Neither gets done, so the
credential stays live.

**Revoking the sessions is not optional.** A refresh token minted
before a rotation still mints access tokens after it, so a rotation
that leaves one alive has ended nothing.

## Regulatory research: WebSearch, not WebFetch

**Use `WebSearch`. `WebFetch` cannot reach the sources this product is
built from.** Every primary regulatory host tried from this environment
returns 403 at the egress proxy — not a 404, not a redirect, a denial
before the request leaves. Confirmed against:

`icao.int` · `faa.gov` · `easa.europa.eu` · `casa.gov.au` ·
`intlaviationstandards.org` · `ntsb.gov` · `enac.gov.it` ·
`cast-safety.org` · `ncaa.gov.ng` · `redifly.com` · `mycs.swiss` ·
`aerosupport360.com`

— and against **`usalamasms.com` itself**, so a deploy cannot be
confirmed by fetching the live site either; read the Netlify deploy
state instead.

That is an organisation egress policy, not a broken tool and not a
transient failure. **Do not retry it and do not route around it** —
no alternate mirror, no text-extraction proxy, no `curl` through a
third party. Report the blocked host and move on.

`WebSearch` works and returns enough of these documents to quote and
cite. What it returns is a search index's rendering of a source, not
the source, which matters for exactly one thing in this repository:
`CICTT_VERIFIED_AGAINST_PRIMARY` in `packages/shared/src/cictt.ts` is
`false` for this reason, and it stays false until somebody reads the
primary instrument. A second jurisdiction is blocked on the same
sentence — a deadline table nobody has read the instrument for is the
one kind of wrong this product cannot ship.

## Secrets

No secret appears in this repository, ever. `.env.example` carries
names only. The database password does not travel through a chat log,
a commit message, or a file the repository tracks — use
`npm run setup:env`, which reads it with terminal echo off and never
prints or stores it.

## Before you say something is done

`npm run check` (typecheck, brand, claims, css, glyphs, unit) and
`npm run verify` (build, smoke against the built bundle, the two-version
PWA update gate). `npm run test:integration` needs a real Postgres —
`bash scripts/local-db.sh` starts one.

The bundle budget is two numbers on purpose. The total says something
grew; the **entry** says it grew in a place a reporter at a remote
strip has to pay for. Raising either needs a receipt in
`scripts/stamp-sw.mjs` saying what was bought.
