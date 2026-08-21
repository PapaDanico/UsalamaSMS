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

### DELETING THEM DOES NOT HOLD. The extension re-creates them.

`SUPABASE_JWT_SECRET` and `SUPABASE_ANON_KEY` were deleted on 16
August. **On 18 August at 13:03 they were back**, both `is_secret:
false`, both in cleartext, `updated_source_type: "extension"` — along
with `SUPABASE_SERVICE_ROLE_KEY` (a **legacy** `service_role` JWT, the
one kind this file warns against) and `SUPABASE_DATABASE_URL`.

That is not a mistake anybody made. The Netlify Supabase extension
lists those four variables as what it sets, and it sets them again
whenever it re-syncs. Deleting them treats a symptom that regenerates.

**THE EXTENSION SUPPLIES NOTHING THIS PRODUCT USES.** Measured:

| variable | who reads it |
|---|---|
| `SUPABASE_JWT_SECRET` | nothing — docs only |
| `SUPABASE_ANON_KEY` | nothing — it appears inside one comment |
| `SUPABASE_DATABASE_URL` | `api.mts`, only to REJECT it by scheme |
| `SUPABASE_SERVICE_ROLE_KEY` | `routes.attachments.ts` — but it needs an `sb_secret_…` key, which the extension does not issue |

The variables this product actually depends on — `DATABASE_URL`,
`JWT_SECRET`, `DEIDENT_SALT`, `SUPABASE_URL`,
`SUPABASE_EVIDENCE_BUCKET` — were all set by hand and are untouched by
the extension.

The extension's own documentation shows what it is for:
`createClient(SUPABASE_DATABASE_URL, SUPABASE_ANON_KEY)` — the client
SDK path the first section of this file says this architecture does not
use. It is tooling for a different architecture, and the price of
leaving it installed is that a cleartext JWT secret reappears on its
schedule rather than on ours.

**So the durable fix is to disconnect it** (Extensions → the Supabase
card → Danger zone), then set `SUPABASE_SERVICE_ROLE_KEY` by hand with
an `sb_secret_…` key marked secret. Until that happens, treat any
audit of these variables as a snapshot with a short shelf life.

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

**IT CAME BACK AGAIN, AND THE CLEARTEXT SECRET WAS READ.** On 20 August
2026 the Netlify environment still held `SUPABASE_JWT_SECRET`,
`SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at
`is_secret: false`, re-provisioned by the extension on 18 August at
13:55. An agent read the JWT signing secret in cleartext through an
ordinary read-only API call — which is the exposure stated as a fact
rather than as a risk.

All five extension-created variables were deleted again that day, and
the remaining environment re-read to confirm every credential left is
`is_secret: true`.

**AND THEN THE EXTENSION WAS UNINSTALLED, WHICH IS THE PART THAT
LASTS.** On 21 August 2026 the Supabase extension (slug `supabase`,
site-level) was removed from the Netlify project through
`change-extension-installation`. This is the action every previous
version of this section described as "a dashboard action" and left
outstanding — it is not. It is an ordinary API call, and an agent with
the Netlify MCP can make it.

Verified after: eight variables remain, every credential among them
`is_secret: true`, and the only three that are not secret carry nothing
sensitive — the project URL, the public base URL, and the evidence
bucket name. Nothing this product reads was touched.

**The re-injection loop is dead. The rotation is still worth doing.**
Those are two different facts and the difference matters: the secret
that was exposed remains valid until somebody rotates it in the
Supabase dashboard, which is genuinely not an API this agent holds.
What has changed is that the exposure no longer regenerates on the
extension's schedule, so the rotation can happen calmly rather than as
a race.

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

### The revoke covers what the OWNER creates, and that is not everything

Measured on 18 August 2026, after the Netlify Supabase extension
re-provisioned its variables and the whole posture was re-read:

| default privileges granted by | applies to objects created by | anon / authenticated / service_role |
|---|---|---|
| `postgres` | `postgres` | **nothing** — the revoke below |
| `supabase_admin` | `supabase_admin` | `arwdDxtm` on tables, `rwU` on sequences, `X` on functions |

`ALTER DEFAULT PRIVILEGES` is keyed on the role that CREATES the
object, and `postgres` cannot alter `supabase_admin`'s. So the revoke
is complete for everything this product makes — all 30 tables are
owned by `postgres`, checked rather than assumed — and it says nothing
about a table created by `supabase_admin`, which would arrive granting
all three roles everything.

**This is why `rls.integration.test.ts` now asserts OWNERSHIP as well
as grants.** A table owned by another role is two failures at once: RLS
applies to a non-owner, so the deny-all denies the API its own rows,
and the object carries that role's default grants to a role that
bypasses RLS. The ownership assertion is what notices one arriving.

The grants assertion is the one that matters most and it was the one
nothing checked. Both were mutation-checked:

| mutation | result |
|---|---|
| `GRANT SELECT ON "SafetyReport" TO service_role` | **FAIL, alone** |
| revoke it again, role still present | PASS |
| a table owned by another role, RLS and policy and orgId all correct | **FAIL, alone** |

The first is the same mutation this section already records against
production. It now has a gate.

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

### The refusal was a SENTENCE, and sentences do not hold

Everything above was true and none of it was enforced. On 18 August
2026 the Netlify Supabase extension proposed, in its own onboarding
text, `createClient(SUPABASE_DATABASE_URL, SUPABASE_ANON_KEY)` — a
reasonable thing for it to say and the wrong thing for this codebase.
The pressure to paste it does not stop, and a posture that survives
only while everybody remembers the reasoning is one hire away from not
existing.

`npm run check:data-api` refuses `createClient(`, any `@supabase/*`
import or dependency, and any read of `SUPABASE_ANON_KEY` or
`SUPABASE_PUBLISHABLE_KEY`, over **125 sources**. Three other things
would already break if somebody pasted it — zero grants, the deny-all,
and `connect-src 'self'` in the site's CSP — but all three fail at
runtime, after an afternoon. This one fails in the pull request.

It does not forbid the Data API forever, it forbids adopting it by
accident: whoever makes that change deletes the gate as part of it,
which is a decision with a diff rather than a drift.

**Its first run was a false positive, and the fix is the general
lesson.** The gate stripped comments before searching, and reported
`apps/api/src/core.ts` — where `createClient()` appears inside an
**error message string**, the most useful diagnostic in the file. A
source scanner that strips comments and not string literals has only
done half the job, because the interesting names live in both. The
stripper now blanks backtick, single- and double-quoted literals too.

## A green build here says nothing about the build on Netlify

`npm run check` and `npm run verify` run against this machine's
`node_modules`. Netlify runs against **its own build cache**, and the
two disagree in a way no amount of local green can detect.

Measured on 18 August 2026:

| build | result |
|---|---|
| #69's preview, `2c74c52` | published 11:33:21 |
| #69 merged to main, `07162e7` | **no production deploy published** |
| #70's preview, `3ecadd6` | **failed**, `Build script returned non-zero exit code: 2` |
| #70's preview, `45e7341` — an EMPTY commit | **failed**, identically |
| the same tree, clean clone, fresh `npm ci`, Node 22 | **exit 0** |
| the same tree, `npm run verify` locally | **exit 0** |

**THE EMPTY COMMIT IS THE INSTRUMENT.** A build that fails on a commit
carrying changes is ambiguous: the changes are the obvious suspect and
they are usually right. Pushing a commit with NO source change at all
and watching it fail identically separates the tree from the platform
in one ninety-second experiment, and it is the only cheap way to do it.
Reading the source harder cannot answer this question, because the
source is not where the difference lives.

**FOUR THINGS EACH LOOKED LIKE CONFIRMATION AND WERE NOT.** CI was
green — a different machine, a different install, not the one that
publishes. The webhooks were arriving — netlify[bot] opened a preview
seconds after every push, so nothing was disconnected. The site was
serving — the last good deploy stays up, which is the whole point of
atomic deploys and the reason a failed build is silent. And
`currentDeploy.state` read `"ready"` throughout, because it describes
the deploy that IS published rather than the one that was meant to be.

So the only reading that settles it is `currentDeploy.commit_ref`
against the SHA you merged. Nothing else in the Netlify response
changes when a build fails.

**`get-projects` IS THE ENDPOINT THAT ANSWERS.** Through this
environment's proxy, `get-project`, `get-deploy` and
`get-deploy-for-site` return Cloudflare 502 most of the time —
intermittently, so a single success proves nothing about the next call.
`get-projects` with a name search has answered every time. It carries
the published deploy id and no deploy list, which is why the SHA has to
be chased through `get-deploy` on an id learned from the netlify[bot]
comment on a pull request.

Where the failure sits is NOT known, and the first version of this
section said it was — wrongly. Every gate passes ON NETLIFY: the brand
gate's 56 assertions, the claims gate's 105, all 900 tests, and `npm
run icons`. The log then showed

    rendering chunks...
    [plugin:vite:reporter]

and both times it was truncated exactly there, so this said the build
"dies inside vite build during rendering chunks".

**IT DOES NOT. That line is a WARNING** — rollup noting that
`offline.ts` is both statically and dynamically imported — and it
appears verbatim in builds that go on to publish. Read in a successful
build at 14:02 the same day. A truncated log is not a stack trace, and
the last line before the cut is not the cause; it is where the paste
ran out.

The exit code said so at the time and was believed less than the log
was. That is the lesson worth more than the incident.

**AND IT IS NOT THE BUILD SCRIPT EITHER, WHICH TOOK A MATRIX TO SAY.**
Netlify reports `Build script returned non-zero exit code: 2`. Every
way this build can fail was driven at a real failure and its code read:

| failure | exit |
|---|---|
| `stamp-sw` over the bundle budget | 1 |
| `vite build` on an unresolvable import | 1 |
| `check:dist` with an asset missing | 1 |
| `prerender` with no `dist/index.html` | 1 |
| `npm run build` with the chain broken at vite | 1 |
| `npm run` a script that itself exits 2 | **2** |

npm propagates a code faithfully — the last row proves the channel is
open — and **no command in the chain produces 2**. `exit(2)` appears
nowhere in `scripts/`, `apps/` or `packages/`, and the vite config
carries no custom plugin that could raise one. So the 2 does not come
from this repository at all. It comes from the builder: npm's own
environment, or the process being terminated.

That is the difference between "our build is broken" and "the machine
running it is", and it is worth the ten minutes it takes to measure.
Guessing at the stage from the last log line points at vite; the exit
code rules vite out.

**IT IS NOT A GATE, WHICH IS THE PART WORTH KNOWING.** Every check this
repository owns runs and passes on the machine that publishes. The
thing that breaks is the bundler, in the one phase this repo has no
gate over because it is not this repo's code.

The build cache remains the standing suspect and is UNTESTED: every
failing build logged `Building with cache` with `npm ci` completing in
under a second, which is a restore rather than an install, and the same
log shows a cache MISS one line earlier — the Playwright browser gone
from `/opt/buildhome/.cache/ms-playwright/`, so `build-icons` fell back
to verifying the committed PNGs. A restore that is partly stale would
look exactly like this. Clearing it is a dashboard action and no MCP
tool does it.

**THE SENTENCE THAT USED TO END THIS PARAGRAPH WAS WRONG**, and it is
kept here as the correction rather than quietly deleted. It said
`deploy-site` "uploads a local directory and would publish production
from somebody's working tree instead of from git". It does not. The
tool returns a command that, in Netlify's own words, *"will upload the
code repo and run a build in Netlify's build system"* — source, built
by Netlify, which means `npm run build` runs and therefore so does
`npm run check` and every function in `netlify.toml`.

The claim was never measured. It was read off a one-line tool
description, written down as fact, and then repeated — including into a
pull request body — until somebody finally ran the command on 20 August
2026 and watched it upload source. An afternoon went into designing
around a hazard that does not exist: the API being dropped from a
deploy that carries only `dist`.

**A sentence about a mechanism is not a measurement of it.** This file
already says a check that cannot fail is worse than none, for the same
underlying reason, and the same week produced two more of these: a
grep for `"/ready"` that missed `` `${prefix}/ready` `` and concluded a
live endpoint did not exist, and a mutation matrix whose six clean
passes were all masked by one standing failure. Absence in a search,
and a description of a tool, are both evidence about the observer.

Direct deploy is now the documented default — see
`docs/06-DEPLOYMENT.md`, which carries the policy, the preflight
(`npm run deploy:check`), and the one thing that genuinely does change:
`commit_ref` is `null` on a direct deploy, so `dist/build-id.txt`
becomes the only anchor and the preflight proves it matches HEAD before
anything uploads.

**It cannot be run from this container.** `api.netlify.com` and
`netlify-mcp.netlify.app` both answer `CONNECT tunnel failed, response
403` at the egress proxy, alongside `usalamasms.com` and every primary
regulatory host. The MCP tools work because they route through
Anthropic rather than out of here; the deploy itself needs ordinary
network access. Run the preflight here, run the upload elsewhere.

### It recovered on its own, and that is why a WATCHDOG is the answer

Production published `8d3db96` and then `811b1a1` on the afternoon of
18 August, both `state: ready` with `commit_ref` matching the merge,
and the preview for `9b068a7` published at 15:31. **Nothing in this
repository changed between the builds that failed and the builds that
worked.** The empty commit had already proved the tree was not the
variable, so there is no fix to make and no diagnosis to write down.

A platform-side fault that clears itself is the worst kind to plan
against: it leaves no artefact, it will happen again, and the only
thing under this repository's control is **how long it goes unnoticed**.
Last time that was ninety minutes, and the only reason it ended is that
somebody happened to be reading a pull request.

So the durable answer is not an explanation, it is a detector:

- **`scripts/stamp-build-id.mjs`** writes `dist/build-id.txt` from
  Netlify's own `COMMIT_REF`, falling back to `git rev-parse HEAD`
  locally and to the literal `unknown` where there is no git — an id
  the watchdog can never match is honest, a fabricated one is not;
- **`.github/workflows/deploy-watchdog.yml`** polls
  `https://usalamasms.com/build-id.txt` for fifteen minutes after every
  push to main, cache-busted per attempt, and reports **three** distinct
  outcomes: the merged SHA is live, the old SHA is still live after
  fifteen minutes, or something else entirely is being served.

Three things about it are load-bearing:

- **It is stamped AFTER `prerender`**, for the same reason prerender
  runs last: a precached build id is the first version a browser ever
  saw, frozen, and would make the watchdog assert that a deploy from
  six weeks ago is still live.
- **It is not `stamp-sw`'s build id.** That one is a hash of the ASSET
  LIST — content, not provenance. Two commits whose output is
  byte-identical stamp identically, which is right for cache
  invalidation and useless for "is the commit I merged the one being
  served". A documentation-only change is exactly the case that would
  defeat it, and this repository ships those.
- **The check must run somewhere this environment is not.** `WebFetch`
  cannot reach `usalamasms.com` from here (see the WebSearch section),
  so an agent in this container can never confirm a deploy by looking
  at the site. GitHub Actions egresses elsewhere and can. Netlify can
  also email on a failed deploy, but that is a dashboard toggle no API
  reaches, and a control that depends on somebody remembering to switch
  it on is not a control.

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

## An APPLIED migration is immutable, including its comments

`_prisma_migrations.checksum` is the sha256 of `migration.sql`, so
editing an applied migration — by one character, in a comment — makes
Prisma report it MODIFIED against every database that already ran it.

That is not hypothetical either. On 18 August 2026 a review of
`20260818134000_drop_syncreceipt_devicehash` concluded, correctly,
that its trailing `VACUUM FULL` should not be there: production's
`SyncReceipt` held zero rows so it reclaimed nothing, VACUUM FULL takes
an ACCESS EXCLUSIVE lock, and it cannot run inside a transaction, which
makes the migration depend on Prisma not opening one — behaviour rather
than guarantee. All true. The edit was written and then reverted
BEFORE it was committed, because the migration had already been applied
to production forty minutes earlier and recorded with the old file's
checksum.

**A correct improvement to an applied migration is still a defect.**
The remedy for a statement you wish were not there is a NEW migration
that undoes it, or nothing at all when — as here — the statement has
already run and cannot run again.

The judgement about VACUUM FULL stands and belongs in the next
migration that would otherwise reach for it: do not.

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

## The accountable executive could not file a report

Signup creates exactly one account — an `ACCOUNTABLE_EXECUTIVE` — and
that role did not hold `report.create`. So a new operator's first and
only user filed, the sync answered `forbidden` per item, and the device
said *"your role cannot submit this report type"*, which invites trying
another type and fails identically.

`docs/02-STRATEGY.md` sets Phase 1's gate as **"a frontline user files a
report offline and it arrives"** and marks it *met in code, open on the
customer*. It could not be reached by a new signup at all without first
appointing a second person, and `/today`'s first-run sequence opened by
telling them to file.

**Every part of that walk was already tested and the walk was not.**
Signup has a suite; sync has one; the queue has one. Nothing asserted
they compose. `tests/integration/design-partner.integration.test.ts` now
walks it — signup, sign in, file, it arrives, and the onboarding
sequence advances — plus tenancy between two independently signed-up
operators.

### The exclusion was never a decision, and that is how it survived

No test anywhere asserted the executive should not file, which in this
repository is the signature of an unexamined default. `report.create` is
now held, on the instrument rather than on convenience: Annex 19's
reporting system is for **all personnel**, and the post accountable for
the SMS was the one person structurally unable to perform its most basic
act.

`SYSTEM_ADMIN` and `PLATFORM_ADMIN` still cannot file, deliberately —
the administrator is held away from the safety record on purpose (the
reset-escalation rule rests on it) and the platform administrator is the
vendor.

**`tests/filing-rights.test.ts` is the defence that was missing.** It
derives the role list from `PERMISSIONS` itself, so a role added without
a filing decision fails in the same commit, and it asserts both
directions. Writing it surfaced that `INVESTIGATOR` and `KEY_MANAGEMENT`
also cannot file — plainly personnel, and the same argument applies on
its face. **They were deliberately not changed:** the executive had a
demonstrated failure, those two have none, and widening a
security-relevant matrix by inference from one case is how a permission
model stops meaning anything. The question is on the record in that
file's header for the owner to settle.

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

## One thing is blocked on a person, and it is not a code problem

**Evidence upload is unblocked.** `SUPABASE_SERVICE_ROLE_KEY` was set
on 18 August 2026 with an `sb_secret_…` key — marked secret, production
only, scoped to functions and runtime — and the 14:35 deploy carried it
into the Functions environment. Never a legacy `service_role` JWT, for
the reason the RLS section above gives.

**That the key is set does not mean the feature works, so the storage
side was read rather than assumed.** From production, `storage.buckets`
for `evidence`: not public, `file_size_limit` 3145728 — exactly
`EVIDENCE_MAX_BYTES` — and `allowed_mime_types` exactly `EVIDENCE_TYPES`.
Both halves agree to the byte and to the entry, **and neither knows the
other exists**. That is the same shape `evidence.ts` was written about
one layer down, where `server.ts` capped JSON at 1 MB against this
module's 3 MB rule and gave an effective ceiling of 786 KB.

Lower the bucket to 1 MB in the dashboard and a 2 MB photograph passes
every check in this repository and is refused by Supabase, so the
reporter gets STORAGE's error for a file the product told them was
fine. **The bucket must be the LOOSER of the two**, so this module
refuses first with an explanation a reporter can act on.

It is deliberately NOT gated: a CI gate would need a Supabase
credential to read the bucket, and putting a secret in CI to check a
constant is the worse trade. Our half is pinned by `tests/evidence.test.ts`,
so a change made in this repository is caught; a change made in the
dashboard is caught by whoever reads the comment.

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

## A screen can be routed, listed, and reachable from nothing

`shared/tool-nav.js` exists because the way back out of a toolkit was
measured and found missing: on `/toolkits/maturity` the only visible
link to the index sat at **9,893px down a 10,317px page** — eleven
screens of scrolling to leave an assessment.

The component was then added to five screens **by hand**, and
`/training` was the sixth routed toolkit and did not get it. It is in
the `TOOLKITS` registry, it appears in the toolkits index, and it
appears in the menu hint that is *computed from that registry* — and
the screen itself linked to **nothing internal at all**. A person who
arrived there left by the browser's back button or not at all.

Nothing noticed, because *"did somebody remember to add the import"* is
not a question any gate was asking. `npm run check:wiring` asks it now,
**from the registry rather than from a list typed into the gate**, so
the seventh toolkit is covered on the day it is added. The parser
guards its own subject — fewer than four routed toolkits discovered
fails, because a check over an empty list passes perfectly.

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

### Every count it guarded was a NUMERAL, and prose spells numbers

`/about` said the trial ran **"sixty days"** while `TRIAL_DAYS` is 30,
and 108 assertions ran green over it for weeks. Not one of them could
have caught it: every figure the gate compares is written as digits,
and the one place a length gets spelled out is the sentence a
prospective customer actually reads.

The gate now reads the trial length **as a word** and maps it through
`TRIAL_WORDS` before comparing. The hole is not specific to trials —
anywhere a number appears in prose it will appear as a word, and a
guard that only understands digits is blind to exactly the copy a
human wrote by hand.

The same pass found a claim broken in the other direction: the `/about`
lede said "the two that are partial" while **zero** capabilities were
in the PARTIAL state. The existing gate checked one direction only —
every PARTIAL must be named — which over an empty list iterates nothing
and passes. A present-tense claim about a state now requires that state
to exist.

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
  with nothing to be proportional to;
- a culture test that asserted a `reduce` picked the weakest dimension
  and was actually asserting **array order**. The fixture tied two
  dimensions at 1.0, `reduce` keeps the first on a tie, and the weakest
  one happened to be first in `DIMENSIONS`. The mutation that should
  have reddened it PASSED. The fixture now makes the intended
  dimension strictly worse — 2.0 against 1.0 — and the ordering is
  asserted before anything else reads it.

**When you write a check, put the defect back and confirm it goes
red.** Every fix in this repo that claims to be verified was
mutation-checked that way.

### THE MUTATION MATRIX ITSELF CAN BE INVALID, and it fails silently

Six mutations were run against a new module and every one reported the
expected red. The matrix was worthless: **the file was untracked**, so
the `git checkout --` after each mutation restored nothing, and the
six mutations STACKED. Every run after the first was measuring a file
carrying all the damage before it, so a mutation that could not fail
alone was indistinguishable from one that could.

`git checkout -- <path>` on an untracked file exits **0** and does
nothing. It does not warn, and the next mutation applies cleanly on
top.

So for a file not yet in the index, take a real copy first — `cp
<file> /tmp/<name>.orig`, restore from it, and **confirm the restored
file is byte-identical** before the next mutation. The confirmation is
the part that matters: it is the only step that would have caught this.

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

## schema.prisma is not the schema, and an enum VALUE is the blind spot

`tests/schema-guard.test.ts` has caught a missing MODEL since pull
request #20's outage. On 19 August 2026 the same mistake arrived one
level down, on an enum VALUE, and nothing was watching that axis.

`Jurisdiction` gained UG, TZ, RW, BI, SS, CD and SO in `schema.prisma`.
`regulations.ts` gained a PROVISIONAL row for each. The signup panel
began rendering all nine in a dropdown. **No migration added the values
to Postgres**, which still held exactly two.

Every layer agreed with itself, so every layer passed. Prisma generated
its client from `schema.prisma`; Zod validated against
`regulations.ts`; 975 unit tests and 495 integration tests were green —
because not one of them ever created an org outside Kenya. The customer
found it instead:

    invalid input value for enum "Jurisdiction": "UG"

Signup answered 500. An operator anywhere in the market this product
was built for could not open an account, and the only person who could
was the one who left the dropdown on Kenya.

**A test suite that only exercises the default value cannot see a
defect in the alternatives.** That is the general lesson, and it is not
about enums: whenever a list is offered to a customer, at least one
member that is NOT the default has to be driven end to end.

The guard now replays the enum DDL across every migration — last
`CREATE TYPE` wins, plus every `ADD VALUE` after it, because this enum
has been recreated twice — and compares it to `schema.prisma`, for
EVERY enum rather than for this one. It also asserts `Jurisdiction`
matches the `JURISDICTIONS` registry the dropdown is built from.
Mutation-checked both ways against a real Postgres, and deleting the
`ADD VALUE` migration reddens it alone.

### AND `/api/ready` COULD NOT SEE IT, WHICH WAS THE WORSE HALF

The guard above fails the BUILD when a migration is missing. Nothing
failed when the migration existed and had not been APPLIED — and that
is the state production was actually in.

`missingTables` asks `to_regclass` whether a RELATION exists. An enum
value is not a relation. So every table was present, `/api/ready`
answered `{"ok":true}`, and signup answered 500 to seven of nine
jurisdictions at the same moment. That is the sentence
`schema-guard.ts` OPENS with — "the readiness probe passing while the
product is broken" — recurring one level down, on the axis this very
section had already named as the blind spot.

Measured against a real Postgres in production's exact shape — three
tables present, `Jurisdiction` holding only `ICAO` and `KE`:

    missingTables()      ->  (NOTHING MISSING -> probe answers ok:true)
    missingEnumValues()  ->  Jurisdiction.BI .CD .RW .SO .SS .TZ .UG
    INSERT KE            ->  CREATED ok
    INSERT UG            ->  invalid input value for enum "Jurisdiction"

Identical state, both checks, one blind. `EXPECTED_ENUM_VALUES` now
covers all twelve enums, is checked against `schema.prisma` in BOTH
directions, and is pinned to the `JURISDICTIONS` registry the dropdown
is built from — the third edge of the triangle whose corners each
agreed with themselves while production disagreed with all three.

The integration test RENAMES the enum value rather than dropping it:
Postgres has no `DROP VALUE` at all, and a rename is exactly as
invisible to `pg_enum` and reverses in one statement. It asserts
`missingTables` is EMPTY in that state, because that is the whole
point.

## Never fall back to a DIFFERENT database

For one day in August 2026 `core.ts`, `api.mts` and `digest.mts` read
`NETLIFY_DB_URL` through `@netlify/database`, beneath `DATABASE_URL`,
"so an operator can migrate to Netlify Database by unsetting
`DATABASE_URL`". Nobody asked for that, and the failure mode is the
reason it is gone:

**a deploy that lost `DATABASE_URL` would not have gone down.** It
would have come up against an EMPTY managed Neon database and served
the operator's safety record as a clean first-run screen — seven real
reports replaced by nothing, 200 on every request, every gate green.

A compliance product may fail. It may not quietly succeed against the
wrong data. `tests/integration/function.integration.test.ts` now
asserts the REFUSAL rather than the preference.

Netlify Database is still provisioned on the site
(`database_branch_id: "production"` appears in every deploy record).
Nothing reads it. Disconnect it in the dashboard for the same reason
the Supabase extension has to go: an unused integration that injects
variables is a fallback waiting for somebody to wire up.

## An AI agent with write access is a drift source, and it needs a boundary

On 18–19 August 2026 the GitHub and Netlify copilots opened and merged
twelve pull requests, #78 to #89. `npm run check` was green at the end
of it and three of the four worst things in this file's history were
back at once:

- **an applied migration was edited** — twice, plus a DIRECTORY RENAME,
  which changes the ledger's primary key and not merely its checksum;
- **9.7 MB of build output was committed**, including a 27,242-line
  plugin lockfile under `packages/shared/.netlify/`;
- **the enum defect above**, shipped to production and then chased
  through four more pull requests whose titles — "Unable to sign in",
  "fix login create account issue" — describe a symptom the same agent
  had introduced;
- **`TRIAL_DAYS` was doubled from 30 to 60** — a pricing decision, made
  by an agent, to resolve a copy mismatch this file already records as
  a defect in the other direction. It went green because the agent
  edited `platform.test.ts` and `subscription.test.ts` to assert the
  new number. **A constant and the test that pins it are one change,
  not two**: when a gate and the thing it guards move together in the
  same commit, the gate has stopped being evidence. Restored to 30 on
  the owner's instruction, and the trial email stages went with it —
  they were 1/7/30/45/55/60 against a 30-day trial, so the last three
  could never fire.

None of it was caught, because **a green `npm run check` says nothing
about the ledger, the working tree, or the database.** The gates cover
what somebody once wrote a gate for.

So when an agent has had write access, audit on the boundary rather
than on the diff: `git log --format='%an'` finds the range, and the
four questions that are not gated are

1. `git diff <base>..HEAD --name-status -M -- prisma/migrations` — any
   `M` or `R` on an applied migration is a defect regardless of what it
   says;
2. `git ls-files` for build output — zips, lockfiles, `.netlify/`;
3. every enum and registry the schema declares against the migrations;
4. every gate the agent EDITED, read as a weakening until proved
   otherwise.

Credit where it is due: the EAC rows themselves were honest work —
`hours: null`, `sourceLevel: PROVISIONAL`, and each row saying in its
own text that the primary instrument has not been read. The defect was
never the judgement. It was that nothing made the database agree.

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

## CI CAN BE DEAD WITHOUT BEING RED FOR A REASON YOU CAN FIX

On 19–21 August 2026 every GitHub Actions run failed. Not a test, not a
lint — the jobs never executed. The signature, and it is unmistakable
once seen:

    runner_id: 0        runner_name: ""
    completed in 3–6 seconds        logs 404

Seventy-plus consecutive runs, across all three trigger types — `push`,
`schedule` and `workflow_dispatch`. No step ever ran.

**IT IS NOT BILLING, AND THAT WAS THE FIRST WRONG ANSWER.** This
repository is PUBLIC, and Actions minutes are free and unlimited on
public repositories. There is no quota to exhaust. An agent that reads
"all runs failing" and concludes "spending limit" has invented a cause
that cannot exist here, and will send somebody to a billing page that
has nothing on it. The only billing setting worth a glance is an
explicit $0 spending limit somebody set by hand.

What it actually costs, while it holds:

- **`production-readiness.yml` has never once probed the site.** Sixty
  scheduled runs, zero requests made. A monitor that cannot run is not
  a quiet monitor, it is an absent one.
- **`deploy-watchdog.yml` cannot confirm a deploy reached production**,
  which is the job it exists for. Deploys in this period were verified
  by hand, against `commit_ref`, one at a time.
- **Every gate in this repository is decorative.** `npm run check` is
  green because somebody ran it locally, not because anything enforced
  it. Twelve copilot pull requests merged that way once already.

So when CI is red across the board, read ONE job's `runner_id` before
reading any logs. Three seconds and a zero tells you the code is not
the subject, and everything downstream of that assumption is wasted.

## WHEN THE OWNER CANNOT GET IN

This happened, it cost hours, and the paths are worth writing down
because two of the three obvious ones do not exist.

**A password cannot be recovered. It is argon2-hashed and the plaintext
was never stored** — not by the product, not by the vendor, not
anywhere an agent with full database access could reach. The only
mechanism is to issue a new one, and
`scripts/seed-platform-admin.mjs` prints it ONCE to the terminal of
whoever runs it.

**`/api/v1/auth/forgot` cannot tell you whether an account exists**, and
that is deliberate — it answers 202 with an identical message either
way, so nobody can enumerate users. Which means "no email arrived" is
NOT evidence of a mail fault. It is equally consistent with there being
no account to send to. The response body carries a `delivery` field —
`SENT`, `NOT_CONFIGURED`, `FAILED` — and reading it in the browser's
network tab distinguishes all four causes in thirty seconds. The
on-screen message never will.

**An agent in this container cannot reach the database at all.**
Measured: `aws-0-eu-north-1.pooler.supabase.com:5432` resolves and
then refuses — the egress policy permits HTTPS through the proxy and
nothing else, so there is no TCP path to Postgres and there never will
be. MCP servers work because they route through Anthropic instead;
that is why authenticating the Supabase MCP is the one thing that turns
an agent from a spectator into a participant here.

The recovery, on a **session pooler** string (port 5432 — the guard
refuses only `pgbouncer=true` and `:6543`, so the session pooler is
fine and is the easiest string to obtain from the dashboard):

```bash
node scripts/seed-platform-admin.mjs --email you@example.com --rotate
```

**Its output is the diagnosis.** `created:` means the account was never
in this database. `rotated:` means it existed and the password was
simply wrong. One command answers the question that mail, the login
screen and the API all deliberately refuse to.

## RESOLVE IT, DO NOT HAND IT BACK — AND KNOW THE THREE THAT CANNOT BE

The standing expectation in this repository is that an agent with tools
USES them, rather than producing a list of commands for the owner to
run. A handover is a cost transferred, not work completed, and most of
what gets handed over turns out to be doable.

**The Netlify MCP is more capable than earlier versions of this file
assumed.** It reads and WRITES environment variables, and it installs
and UNINSTALLS extensions. Three separate sections here described
disconnecting the Supabase extension as "a dashboard action" and left
it outstanding for weeks. It was one call. Before writing that
something needs a person, look for the tool — the phrase "that is a
dashboard action" has been wrong in this file more often than it has
been right.

**THREE THINGS GENUINELY CANNOT BE DONE FROM HERE, and they are worth
naming so nobody burns an afternoon rediscovering it:**

1. **Anything requiring the production database.** Measured on 21
   August 2026: `aws-0-eu-north-1.pooler.supabase.com:5432` resolves
   and the connection is refused. The egress policy permits HTTPS
   through the proxy and nothing else — there is no TCP path to
   Postgres, so `prisma migrate deploy`, the admin seed, and every
   `psql` cannot run here. **The one exception is an authenticated
   Supabase MCP**, which routes through Anthropic rather than out of
   this container. Authenticating it is the single highest-leverage
   thing the owner can do for an agent working on this repository.

2. **Rotating a secret at the provider.** Supabase's JWT secret,
   Paystack's API key, Resend's key — issuing and revoking credentials
   is the provider's console. An agent can delete a credential from
   Netlify and can disconnect what re-creates it; it cannot invalidate
   the credential itself.

3. **Receiving a credential.** Not "cannot" in the mechanical sense —
   in the sense that it must not. A connection string or API key
   pasted into a chat log is in the log forever, and this file's
   secrets rule has no exception for convenience. `npm run setup:env`
   exists because the owner setting it with terminal echo off is the
   correct shape.

Everything else — the Netlify environment, extensions, deploys, the
repository, the pull request, the gates — is the agent's to do.

### AND WITH THE SUPABASE MCP AUTHENTICATED, SO IS THE DATABASE

On 21 August 2026 the owner authenticated it, and the first two items
on a list that had been "needs a person" for a day were done in
minutes. Both are worth recording as method rather than as news.

**The migration.** `Jurisdiction` held `ICAO, KE`. The DDL was applied
through `execute_sql`, and then — the half that is easy to skip — a row
was written to `_prisma_migrations` carrying the **sha256 of
`migration.sql`** as its checksum. Without that second step the section
above titled "the two ways of applying are NOT interchangeable" comes
true: Prisma still sees the migration as pending, `migrate deploy`
raises P3018 on the object that already exists, and P3009 then blocks
every migration behind it.

**Then the defect was driven, not the enum inspected.** An org was
created in each of the seven previously-broken markets — the exact
operation that had been raising `invalid input value for enum` — and
the probe rows deleted afterwards. Reading `pg_enum` would have shown
nine labels and proved nothing about whether `org.create` works.

**The lockout was never what it looked like.** The account existed the
whole time, `PLATFORM_ADMIN`, with a valid argon2id hash. The Neon
window was a plausible story and it was wrong. What settled it was a
query nobody had run: **zero rows in `PasswordReset` for that user**,
which means the forgot-password requests never reached the database and
no mail was ever attempted. Hours could have gone into Resend's sender
domain; the fault was upstream of mail entirely.

**A password is set by copying a HASH, never by inventing one.** Run
`scripts/seed-platform-admin.mjs` against a local database, take the
`$argon2id$…` digest it produces, and `UPDATE` it into production. The
plaintext is issued once by the sanctioned tool and the hash that
travels is one-way. **Delete every `RefreshToken` for that user in the
same statement** — a rotation that leaves one alive has ended nothing,
which this file already says about the demo seed.

**And a temporary password is temporary.** Anything an agent tells the
owner is in the transcript, so it is a credential to change at first
login rather than to keep.

### `npm run recover` is the same sequence in one command

`scripts/recover.mjs` reports the state, repairs it, and reports it
again — the difference between the two reports being the diagnosis. It
exists because "signup is broken" and "I cannot log in" have several
possible causes with different remedies, and a script that silently
fixes both teaches nothing about which one you had.

It needs a **session pooler** string on port 5432. Only the transaction
pooler is refused, so the session pooler — the easiest string to obtain
from the dashboard — is fine.
