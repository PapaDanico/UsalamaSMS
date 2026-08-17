# Working in this repository

Short, and only the things that are counter-intuitive enough to get
wrong. Everything else lives in `docs/` — start with
`docs/DIAGNOSTIC-CHARTER.md`.

---

## RLS carries ONE restrictive deny-all per table, and that is the posture

Every table in `public` has `rowsecurity = true` and exactly one policy:
`deny_all_not_owner`, **RESTRICTIVE**, `USING (false)`. That is the
security posture:

- nothing in this product uses `supabase-js`, `createClient()` or
  PostgREST. The Supabase **anon/publishable key is deliberately absent
  from the codebase** — there is nothing to hold it;
- every read and write goes through the Fastify API in `apps/api`,
  which connects as the database owner and enforces tenancy in SQL
  (`orgId` on every tenant-owned table, indexed first);
- **RLS does not apply to a table's owner**, so the API is unaffected.

### What the deny-all does and does not restrain

This section used to say "nothing is granted to anybody", and that was
never true. Measured against production on 16 August 2026:

| role | `rolbypassrls` | grant rows in `public` |
|---|---|---|
| `anon` | false | 196 |
| `authenticated` | false | 196 |
| `service_role` | **true** | 196 |
| `postgres` | true | 196 |

196 is **every table times every privilege** — 28 tables × 7 of
`SELECT INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER` — not 196
tables. Each of those roles holds the full set on the whole schema.

Supabase issues them when a project is created; nobody here removed
them. So the deny-all is not a second lock behind an empty grant table
— **it is the only lock**, and it is load-bearing.

Against `anon` and `authenticated` it holds completely: neither can
bypass RLS, so a RESTRICTIVE `USING (false)` denies them every row no
matter what they hold. That part of the posture is real.

**`service_role` bypasses RLS, so the policy cannot touch it.** A token
signed with the project's JWT secret and carrying `"role":
"service_role"` reads and writes every table in `public`, and no policy
in this database will stop it. The only control on that path is the
secrecy of the JWT secret.

That control had failed. `SUPABASE_JWT_SECRET` sat in the Netlify
environment with `is_secret: false` — readable in cleartext by anything
with read access to the project, scoped to builds and post-processing,
from 11 August. Nothing in this codebase ever read it; the Netlify
Supabase extension created it. It has been deleted, along with
`SUPABASE_ANON_KEY`, which was exposed the same way and equally unused.

**Deleting it is not rotating it**, and no MCP tool can rotate it — that
is a Supabase dashboard action. Until it happened, anyone who had read
the value held a token they could sign at will.

**It was rotated on 16 August 2026**, by the owner, in the dashboard.
Every token signed with the old secret is now worthless, which closes
the exposure rather than merely hiding it.

Nothing in this product broke, and that was checked rather than hoped:
`SUPABASE_JWT_SECRET` appears in no source file, the API signs its own
access tokens with an unrelated `JWT_SECRET` (`apps/api/src/core.ts`),
and the one Supabase credential any code reads —
`SUPABASE_SERVICE_ROLE_KEY`, in `routes.attachments.ts` — was unset, so
there was no live key to invalidate.

That last one is a trap for whoever sets it. A **legacy** `service_role`
key IS a JWT signed with that secret, so pasting one and then rotating
again would silently kill evidence upload. This project is already on
the new API key system — the legacy anon key reports `disabled: true` —
so use an `sb_secret_…` key, which is issued independently of the JWT
secret and survives its rotation.

### So the grants were revoked, which closes it without the rotation

`BYPASSRLS` bypasses **policies, not grants**. A role with no privilege
on a table cannot read it however much RLS it ignores. So:

```sql
revoke all privileges on all tables    in schema public from anon, authenticated, service_role;
revoke all privileges on all sequences in schema public from anon, authenticated, service_role;
revoke all privileges on all functions in schema public from anon, authenticated, service_role;
-- without these three the NEXT migration silently re-grants everything
alter default privileges in schema public revoke all on tables    from anon, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges in schema public revoke all on functions from anon, authenticated, service_role;
```

Applied 16 August 2026. `postgres` keeps its 196 — the API connects as
the owner. The `storage` schema is untouched, so evidence upload is
unaffected.

**IT WAS MUTATION-CHECKED AGAINST PRODUCTION, and the result is the
strongest evidence in this file.** With `SELECT` granted back on
`SafetyReport` alone, `service_role` read **all seven real reports**
straight through the RESTRICTIVE deny-all. The grant was revoked again
immediately and the denial re-proved.

That is not a theory about `BYPASSRLS`. It is this database, these
reports, one grant apart. The policy never restrained `service_role`
and never could; the revoke is the control.

The cost is that the Supabase dashboard's table editor no longer reads
these tables — it goes through PostgREST as `service_role`. The SQL
editor still works, and so does everything this product does. To undo
it, grant the privileges back; do that only as part of genuinely
adopting the Data API, with the policies and the two-tenant test in the
same change.

### It used to be "zero policies", and that is why it changed

Zero policies also denies — but only for as long as nobody adds one,
and the pressure to add one never stops. `mcp__Supabase__get_advisors`
reports `rls_enabled_no_policy` against every table, and the Supabase
agent skill in `.agents/skills/supabase` says in its Core Principle 5
to "create policies that match the actual access model".

On 15 August 2026 that pressure produced exactly what it was always
going to. **Twenty-seven policies had appeared on the production
database, twelve of them GRANTING** the `authenticated` role every
operation on rows matching a JWT claim — correct for a browser talking
to PostgREST, and this product has no such client.

Twelve `USING (false)` policies sat alongside them and **denied
nothing**, because they were PERMISSIVE and permissive policies are
OR'd. No table carried both, so it was latent rather than live; adding
one org policy to a deny-all table would have opened it silently.

So the absence became a statement. A RESTRICTIVE policy is AND'd with
every other policy on the table, so a later `CREATE POLICY ... USING
(true)` has **no effect** while it exists. The old posture survived
nobody acting; this one survives somebody acting.

It also answers the advisor honestly rather than by argument — the
notice said "no policies", and now there is one.

### Do not FORCE row level security

`FORCE ROW LEVEL SECURITY` applies RLS to the owner too, and the API IS
the owner. Forcing it denies everything to the one role that has to
read and write. `tests/integration/rls.integration.test.ts` asserts
that it is off, that every table has the restrictive deny-all, and that
no PERMISSIVE policy exists anywhere — each mutation-checked.

### If the Data API is ever genuinely adopted

That is a deliberate architectural decision and it needs the grants,
the policies, the removal of this backstop, and a test that a second
tenant cannot read the first one's reports — in the same change.

## Migrations do not apply themselves on deploy

`netlify.toml` runs `npm run build`. It does **not** run
`prisma migrate deploy`, and nothing else does either. A merged,
green, published deploy can therefore be running against a database
that is missing the columns its own Prisma client SELECTs.

That is not hypothetical. On 15 August 2026 production was found five
migrations behind: `Org` was missing `fleetSize`, `SafetyReport` was
missing `cicttCodes`, the authority-notification and retraction
columns, and `OrgConfig` did not exist at all. Every read of `Org` or
`SafetyReport` raised *column does not exist*, on a database holding
seven real reports — while four separate deploys had been confirmed
`state: ready` from Netlify and reported as live.

**Confirming a deploy is not confirming the system.** After a merge
that carries a migration, apply it and then run `npm run check:db`
against a direct (not pooler) connection, which compares the live
schema and Prisma's ledger against the repository and names which of
three states you are in.

### The two ways of applying are NOT interchangeable, and mixing them bites

This section used to offer `mcp__Supabase__apply_migration` and
`prisma migrate deploy` as alternatives. They write **different
ledgers**, and choosing the first makes the second fail.

Measured against production on 17 August 2026: the schema was
**perfect** — 315 columns expected from `schema.prisma`, 315 present,
none missing, none extra — while `_prisma_migrations` held **17 rows
against 30 migrations on disk**. The thirteen had been applied with the
Supabase tool, which records them in
`supabase_migrations.schema_migrations`, where Prisma cannot see them.

Production's exact state was rebuilt locally to find out what that
costs, rather than reasoned about:

| attempt | result |
|---|---|
| first `prisma migrate deploy` | **P3018 / 42701** — `column "cicttCodes" of relation "SafetyReport" already exists` |
| every `deploy` after it | **P3009** — blocked entirely, "migrate found failed migrations" |

So one attempt at the documented recovery path leaves the database
unable to accept **any** migration until somebody runs
`prisma migrate resolve` by hand. A repair that breaks the repair.

**Pick one and stay on it.** `prisma migrate deploy` is the one this
repository is built around — the migrations are Prisma's, the ledger it
checks is Prisma's, and CI runs it. Use `apply_migration` only when
Prisma genuinely cannot reach the database, and then immediately record
it with `prisma migrate resolve --applied <name>`, which writes the
ledger without touching the schema.

`npm run check:db` distinguishes the three states, because reporting
"drift" without saying which is how the wrong command gets run:

- **BEHIND** — ledger behind *and* schema behind. Genuinely unapplied.
  Remedy: `prisma migrate deploy`.
- **UNRECORDED** — ledger behind, schema current. Applied out of band.
  Remedy: `prisma migrate resolve --applied`. Running `deploy` here is
  the trap above.

### Production was in the UNRECORDED state, and it has been repaired

On 17 August 2026 production held **17 ledger rows against 30
migrations** while the schema was complete. The thirteen were recorded
by inserting the rows `prisma migrate resolve --applied` writes.

**The checksum is the sha256 of `migration.sql`**, confirmed by running
`resolve` against a local copy of production's exact state and
comparing what Prisma wrote to `sha256sum` of the file. A row with a
wrong checksum makes Prisma report the migration as MODIFIED, which is
the same dead end one step later.

The repair was rehearsed on a local database rebuilt to production's
state, and `prisma migrate deploy` answered *"No pending migrations to
apply"* rather than P3018 before anything touched production.

**The one migration NOT recorded was the one production has not
applied.** `20260817120000_platform_admin` adds an enum value that is
genuinely absent — checked with `pg_enum` rather than assumed — so it
stays pending and applies on merge, which is the correct end state.
Marking it would have been the more dangerous mistake: a schema change
recorded as done and never run.

After: **30 rows, 0 failed, 7 reports and 2 orgs untouched.** The
ledger is a record of what ran; nothing about the data or the schema
changed.
- **BLOCKED** — a failed or rolled-back row is present. Nothing applies
  until it is resolved.

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

## An HTML comment inside a template literal is not a comment

Every screen in `apps/web/src` renders through a tagged template
literal. Text between `<!--` and `-->` inside one of those is **string
content**: no minifier removes it, and a reporter at a remote strip
downloads it with the code. It looks like a comment in the editor and
behaves like a paragraph on the wire.

Two consequences, and the repository has met both:

- **A backtick in one of them breaks the build at runtime.** The
  literal ends at the backtick and the rest parses as JavaScript, so
  quoting a class name the way prose normally would shipped
  `scheme is not defined` — a message about the page, not about the
  comment, so the search starts in the wrong place. That was the
  *third* time `tools/pricing/index.js` broke that way.
- **It is weight charged to the wrong person.** Five notes explaining
  the pricing page to a developer cost 2 KB and pushed the total
  bundle over budget, which is the only reason anybody noticed.

So: **put the explanation above the import**, as a real JavaScript
comment. It reads better collected at the top of the file than
interleaved with the markup, the minifier strips it, and it can hold a
backtick safely. `npm run check:prose` fails on a backtick inside an
HTML comment and holds the remaining prose under a ceiling that
ratchets down.

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

## An aggregate route must check the permission of every record it reads

`/api/v1/picture` gates once, on `report.read.org`, and its own comment
explains why: everything it reads is an aggregate of records that
permission already opens one at a time, so a second permission would
let an operator grant the summary while withholding the detail.

**That reasoning is true of the records it was written for and false the
moment somebody adds one.** Barrier health added two — audit findings
(`audit.read`) and training records (`training.manage`, or you get only
your own rows) — and for one commit a `SAFETY_OFFICER` got, from
`/picture`, the full text of a finding that `/api/v1/sms/findings`
answers **403** for, plus a colleague's name and lapsed course. A third,
change-assessment titles behind `moc.create`/`moc.approve`, survived two
readings of the diff and was found only by the gate.

So the permission is checked **per collection**, not once at the door,
and what a caller may not see is **named** rather than silently dropped
— a barrier count taken over four of six records and presented as the
operator's position is the understating twin of overstating.

`npm run check:authz` compares, for every model, the roles each route
discloses it to against the roles admitted by the route file that
**writes** it. A model read outside its own file may not widen the
audience. Ownership is the axis rather than width, because `/api/v1/export`
reads nearly everything behind `org.export` and comparing peers made
every primary endpoint look guilty — sixteen findings, fifteen of them
noise. `org.export` is exempt by construction: it *is* the whole record.

**A dashboard is the easiest place in a product to lose an authorisation
rule**, because it does not read like a read of the underlying table —
it reads like arithmetic.
