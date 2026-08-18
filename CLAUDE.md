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

## `migrate dev` proposes drift that is not drift, and it breaks inserts

Running `prisma migrate dev` for a feature will very likely also propose
statements you did not ask for. On 18 August 2026 a fatigue migration
came back carrying six:

```
DROP INDEX "VoluntaryScheme_orgId_idx";
ALTER TABLE "Org"       ALTER COLUMN "fleetTypes" DROP DEFAULT, ...
ALTER TABLE "OrgConfig" ALTER COLUMN "aerodromes" DROP DEFAULT, ...
ALTER TABLE "SafetyReport" ALTER COLUMN "cicttCodes" DROP DEFAULT;
```

**Five of those six are breaking, and the reasoning that they were safe
is the trap.** The argument was that Prisma supplies the value on every
insert it makes, so the database-side DEFAULT is unreachable. That is
false: Prisma OMITS a scalar list it was not given and relies on the
column default. Drop the default and the column is NOT NULL with nothing
to fall back on. Driven straight at Postgres:

```
insert into "Org" (id,name,jurisdiction,"trialEndsOn") values (...)
ERROR: null value in column "fleetTypes" violates not-null constraint
```

Twenty-nine auth integration tests went red at once, every one on
`org.create` in a `beforeEach`. In production it would have made
creating an operator impossible.

The empty-array default is Prisma's own convention for a scalar list —
created at the database, never declared in the schema — so `migrate
diff` proposing to drop it is an artefact of that asymmetry rather than
real drift. **It will be proposed again. Do not accept it.**

**SPLIT ANYTHING A FEATURE MIGRATION PROPOSES THAT IS NOT THE FEATURE**,
into a migration named for what it does. That is the only reason the
above was caught: a migration named `fatigue_limits_and_report_detail`
that also reshapes three unrelated tables gets read as "fatigue" and
merged. The one statement that survived — the redundant
`VoluntaryScheme` index, measured against production where a UNIQUE
index on the same column serves every lookup — is in a migration that
says so.

## A new table needs the deny-all posture in the same migration

`rls.integration.test.ts` asserts the RLS posture over every table
"including ones added later", and that wording is load-bearing: a new
model ships without it every time unless the migration carries it.
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, the RESTRICTIVE
`deny_all_not_owner` policy, and the guarded REVOKE — copy the block
from `20260818033214_fatigue_limits_and_report_detail`. The REVOKE is
wrapped in a `pg_roles` existence check because `anon`, `authenticated`
and `service_role` are Supabase's and the same migration runs against a
bare Postgres in the integration suite.

## Two values cannot evidence a combination of three methods

Annex 19 does not ask a service provider to identify hazards. It asks
for a formal process **"based on a combination of reactive, proactive
and predictive methods of safety data collection"** — and the word doing
the work is *combination*.

`Hazard.source` was set in one expression:

```ts
source: e.fromReportId ? "REPORT" : "REGISTER"
```

That answers a real question — what proportion of the register came from
the operator's own people — and it is **not the instrument's question**.
`REGISTER` means "somebody typed it", which is equally true of a
workshop finding, an audit finding, an indicator trend and a change
assessment: four methods, two proactive and one predictive, in one
bucket meaning "not a report". An operator asked at an audit to evidence
its combination could show reported against typed and nothing else.

`Hazard.discovery` now records which of ICAO's three, and
`packages/shared/src/discovery.ts` holds the six routes this product
offers to them. Three things are worth keeping:

- **ICAO names methods, not features.** Mapping a surface to a method is
  this product's judgement, so the argument for every row is written in
  the module header and `tests/discovery.test.ts` reads the file and
  fails when a route has no line in it.
- **The backfill left everything but reports NULL.** A hazard carrying a
  `reportId` is reactive by definition and the fact is in the row.
  Mapping `REGISTER` to PROACTIVE would have manufactured exactly the
  evidence the operator is being asked to produce.
- **The missing methods are named, not left to be counted.** A set of
  bars where one is absent reads as a small number rather than as an
  absence — the same objection `/picture` makes about withheld barrier
  records.

### A guard that could not fire, caught by its own mutation

`evidencesCombination` read `b.total > 0 && b.missing.length === 0`. The
mutation written to prove an empty register does not vacuously satisfy
the requirement **left the suite green**: an empty register has every
count at zero, so `missing` already lists all three and the first clause
never decides anything. It was removed rather than kept as
belt-and-braces — a condition that looks load-bearing and cannot execute
is a gate that cannot fail, one layer down. Emptying `missing` reddens
three tests, which is where the property actually lives.

## An empty record is not a clear one

`/today` answers "is everything all right?", and to a brand-new operator
it answered **"Nothing needs you today"** over a lede saying no deadline
was open, no currency lapsing, nothing awaiting triage and no action
overdue. Every clause was true. Together they told somebody who had done
nothing at all that everything was fine.

The digest is computed over an empty record, correctly finds nothing,
and the screen rendered that absence as a clean bill of health.

**`today.ts` already contained the right argument, unextended.**
`reporterIsClear` refuses to call an UNKNOWN clear and says why — *"a
screen whose job is to answer 'is everything all right' saying the most
reassuring possible thing at the moment it knows least is the failure
this product exists to refuse."* EMPTY deserved the same and never got
it.

So `/api/v1/digest` now returns a `scale` — three counts, not a flag,
because the screen has to know WHICH step is next — and `establishment()`
grades it EMPTY / STARTED / ESTABLISHED. `npm run check:first-run`
renders `/today` in **three** states and asserts all of them, because
two of the four mutations that matter are about not over-correcting:

- an empty operator must not read the all-clear, and must get the
  sequence with a link to `/report`;
- an operator already running must **not** be offered the first step —
  a sequence that never stops is a nag;
- and a settled operator with genuinely nothing outstanding must **still
  get the all-clear**, or the fix has replaced one wrong answer with
  another.

The three renders must also differ from each other. A fixture that
quietly stopped taking would otherwise make every assertion above pass
over one screen measured three times.

### The retraction gate made the decision explicit, which was right

`computeRecordScale` counts reports **without** `retractedAt: null`, on
the reasoning that filing something and correcting it is a working
reporting culture rather than an empty one. `npm run check:retraction`
refused that until it carried a `RETRACTION-INCLUDES-DELIBERATELY`
marker saying so. Nothing downstream of that number acts on a report —
it decides only whether `/today` greets somebody with a sequence or with
their record — and every query that DOES act on reports still excludes
retracted rows.

## A document is measured on the page, not in the DOM

`npm run check:deliverables` renders the six handover documents — the
risk assessment, the register, the indicators, the maturity assessment,
the twelve-element record and the risk picture — at **A4 with the media
emulated to print**, and asserts each names the operator, carries its
mark, and fits the width.

The first version counted `querySelectorAll('.print-id').length`, and
its own mutation matrix caught it: adding
`.print-id { display: none }` inside the print block left the gate
**green**. The element was in the DOM, the pack printed anonymous, and a
check on existence cannot tell those apart. Both are now measured by
bounding box, which is zero for `display:none`, `visibility:hidden` and
a zero-height container alike — and the zero-size variant is its own
mutation, because it is the one somebody reaches for when a logo looks
too big.

**`attachPrintId` defaults to `allowFetch: false` and that is a
decision, not an oversight.** The register, the risk assessment and the
maturity assessment work with NO SESSION AT ALL, so an operator can use
them while deciding whether to trust this product; a screen that phones
home during that has answered the question being asked of it, in the
wrong direction. Attribution there is opportunistic — cached name, or no
header at all — and `smoke.mjs` already refuses the half-attributed
middle. The gate therefore seeds the org cache and asserts the
*reachable* property. A first attempt seeded only the session, reported
all six as unattributed, and was the probe being wrong rather than the
product.

## Two things are blocked on a person, and neither is a code problem

**Evidence upload needs one secret pasted.** The bucket exists,
`SUPABASE_URL` and `SUPABASE_EVIDENCE_BUCKET` are set in the Netlify
production environment, and `routes.attachments.ts` answers without
storage rather than failing. `SUPABASE_SERVICE_ROLE_KEY` is **absent** —
checked against the live environment, not assumed. Use an `sb_secret_…`
key, never a legacy `service_role` JWT, for the reason the RLS section
above gives, and redeploy after setting it.

**The KCAA submission shape is behind a login.** The portal is
`https://ecitizen.kcaa.or.ke` — not the path the task originally named.
WebSearch reaches the governing circular and not the form: `spi.ts`
already cites CAA-AC-SMS009 §8.4 and §8.5 paragraph by paragraph, so the
COMPUTATION is grounded, including the STDEVP alert-level method. What
nobody has seen is which fields the portal asks an operator to fill.
That is one person, one login, one screenshot — and until then the
export shape is unverified rather than wrong.

## A sweep that renders signed out has not seen the product

`check:a11y` reported "32 screens, no WCAG 2.2 AA violations" for weeks
and every word of it was true. It had also never rendered a screen with
a session. Measured on 18 August 2026, elements under `main`:

| route | signed out | signed in |
|---|---|---|
| /sms | 39 | **522** |
| /account | 44 | 98 |
| /admin | 5 | 40 |
| /account/profile | 6 | 32 |
| /account/team | 5 | 21 |

Nearly six hundred nodes of the record a safety manager works in every
day, never swept. The sweep now runs **both states**, and the first
signed-in run found four violations — including `.stat__label` at
**1.09:1 on white**, which is not low contrast but INVISIBLE: four
labels on /fatigue where the figures showed and the words saying what
each figure counted did not.

That one is the shape worth remembering. `.stat-strip` is a dark-ground
component whose ink came with it; `[data-surface='tool']` reused it on
white and overrode the value's colour but not the label's. The print
block forces `#000`, so it printed correctly, and the only reader who
would ever have met it was one looking at the screen.

### The growth guard is the load-bearing half

A stub whose shape is wrong renders an error state, axe finds no
violation in the emptiness, and the sweep prints `ok` twice — a gate
reporting 64 screens while checking 32. **That is worse than not adding
the pass, because it retires the suspicion.**

So `MUST_GROW` in `scripts/lib/a11y-fixtures.mjs` names every route
whose signed-in render must be strictly larger, and the gate fails
naming the route. It is not theoretical: /today, /fatigue and /picture
all SHRANK under a bare `{}` body, and that is how the real shapes were
found rather than guessed. Remove the session seeding and seven of nine
routes render identically — mutation-checked.

**Write a fixture from the component, not from the API route.** Three of
the four fixture bugs were fields the screen reads and the route names
differently — `createdAt` not `occurredAt`, `c.withinDeclared` not the
enum key, `d.hrcs` not `d.hrc`. And `withheld` is a list of objects with
a `source`: a list of strings renders "undefined or undefined" rather
than throwing, which is the quieter half of the same lesson.

## A validator tested at the unit level says nothing about the route

55 routes are declared in `apps/api/src/routes*.ts`. On 18 August 2026
54 appeared somewhere under `tests/` and one did not —
`PUT /api/v1/config/logo`. `tests/logo.test.ts` exists, which is exactly
what hid it: it imports `checkLogo` from `packages/shared` and asserts
the VALIDATOR.

A validator is perfect in a route that never calls it. That sentence is
already in this repository — `reset-escalation.integration.test.ts`
opens with it — so the rule is general: **a shared checker earns a unit
test, and the route that must apply it earns one over HTTP.** Deleting
the `checkLogo` call reddens four tests; deleting the `config.manage`
guard reddens two.

## A zero-state is measured by where it sends you, not by its class

`class="empty-state"` says nothing about whether a zero-state works.
Measured across `apps/web/src` on 18 August 2026:

- **/picture and /today carry the best zero-states in the product** —
  each names what the emptiness *means* and links to where the first
  record is made — and **neither uses the class**;
- **/triage and /fatigue both used it, and both were dead ends.** The
  reporting queue is the first screen a new operator opens, it said
  "Nothing on this device yet", and `href="/report"` appeared **nowhere
  in the file**. The one path the whole product exists to start had no
  way forward on the screen that is empty of it.

So `npm run check:empty-states` holds a different property: the first
record is made somewhere, and the screen empty of it either IS that
somewhere or SAYS where. `WAY_FORWARD` in the gate is the declaration —
a route, or `null` with a note saying creation is on this screen.

**The gate cannot tell that a form on the screen creates the thing the
list is empty of, and its header says so.** /triage renders forms and
POSTs from them, so any "does this file have a form" test would have
passed it while it *was* the defect. What the gate does instead is force
the decision to be written down and stop it rotting: an undeclared
zero-state fails, a declared route the router does not register fails, a
declared route the file does not link to fails, and an entry for a file
that no longer has a zero-state fails.

### A link inside a zero-state fails contrast, and check:a11y found it

`.empty-state` body text is `--us-text-tertiary` on purpose, so a link
in it lands at **4.44 on Warm Sand at 14px** — under AA. `--us-teal-text`
already exists for exactly this and is 6.38 there. The rule also
underlines, because WCAG 1.4.1: inside a paragraph that quiet, colour
alone does not say the words are a link.

That was caught by `npm run check:a11y` on /triage rather than reasoned
about — and /fatigue's identical link is **not** covered, because its
zero-state needs a session and the a11y sweep renders signed out. One
CSS rule fixes both; only one of them is gated.

## Where the instrument has not been read, the operator declares it

Charter rule 12. A figure with legal force is either read from the
primary instrument and dated, or supplied by the operator together with
the instrument it comes from — and the source is REQUIRED, because a
declared figure with no instrument named is a number somebody typed.

**No flight-time table for any State ships**, and `packages/shared/src/
fatigue.ts` carries the argument. This is not the same as the reporting
deadline: a deadline runs a countdown, so the product is telling the
operator what the law requires and must have read it; a duty limit is a
comparison against a figure the operator supplied. Decide which shape a
new capability has before opening any instrument.

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

## Creating the vendor's own account

`npm run seed:platform-admin -- --email you@example.com`, with a
**direct** connection string on port 5432. It refuses a pooler URL
before it builds a client, and prints the password once into the
terminal of whoever ran it.

**The console shipped live and reachable by nobody.** `PLATFORM_ADMIN`
was in the Role enum, the migration was applied to production, `/admin`
rendered, and `routes.admin.ts` answered — and no user in the database
held the role, so all of it answered 403 to everybody alive. That is
the defect `check:claims` catches one layer down (a module nothing
imports) arriving one layer up: **a role nothing can hold**.

It cannot be created from inside the product, and that is deliberate.
`/api/v1/admin/operators` mints operators and never platform
administrators, because a tenant that could mint a platform
administrator would be a tenant that could read the others.

**The vendor org it creates holds no safety record** — no reports, no
hazards, no indicators. It exists to satisfy the non-nullable `orgId`
on `User`. That emptiness is load-bearing:
`/api/v1/admin/upgrade-requests` is the one route in this API that
reads across tenancy, so "the vendor sees every operator" is only safe
to reason about while there is no operator the vendor is *also* inside.

`--rotate` re-issues and **revokes every live refresh token**, for the
reason the demo seed records below: a refresh token minted before a
rotation still mints access tokens after it.

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
