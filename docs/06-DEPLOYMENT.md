# Deployment

*Written 11 August 2026, when the project got its first hosted database.*

**No secret appears in this file, and none may.** Everything below names
a variable or a project reference; the values live in the host's
environment and in a password manager. `.env` is gitignored and
`.env.example` carries names only.

---

## What exists

| Thing | Value |
|---|---|
| Supabase project | `UsalamaSMS` — ref `wbixxhpaswstaphfsowz` |
| Region | `eu-north-1` |
| Postgres | 17 |
| Schema | Applied — 9 tables, 3 migrations, history baselined |
| RLS | Enabled, deny-by-default, on all 9 tables |
| API | Ships as a Netlify Function on `/api/*`. Answers `503 not_configured` until the environment is set |
| Web | Netlify, preview per PR |

---

## The migration history was applied out-of-band, and has been baselined

Recorded because it explains an oddity someone will otherwise trip over,
not because anything is outstanding.

The three migrations were applied through the Supabase **management
API**, since the environment that applied them holds this project's API
credentials and not its database password. That ran the DDL correctly
and did not write Prisma's `_prisma_migrations` bookkeeping — so the
hosted schema was right and Prisma did not know it. `migrate deploy`
would have refused on a non-empty database with no history, and
`migrate dev` would have offered to **reset** it.

**This has been fixed.** The `_prisma_migrations` table was created and
the three rows inserted with Prisma's own checksums, read from a local
database where `migrate deploy` ran normally rather than recomputed from
an assumption. `prisma migrate status` now reports the database up to
date, and every later change goes through `prisma migrate` as usual.

If the same situation recurs — schema applied by some route Prisma did
not drive — the supported repair is:

```bash
prisma migrate resolve --applied <migration_name>
```

which records a migration as done without running it.

---

## Row Level Security

Enabled on all nine tables, with **no policies**, deliberately. The
reasoning is in the migration file itself; the short version:

Supabase exposes the `public` schema through PostgREST. With RLS off,
the anon key — which is designed to be shipped in client code and
therefore is effectively public — was a full read/write credential over
`SafetyReport.narrative`, `reporterId` and the `AuditLog`. The linter
flagged it CRITICAL on the first schema push, and on a product whose
central promise is that a confidential report cannot be traced to its
author, it was the whole premise gone.

RLS with no policies denies PostgREST entirely and leaves the
application untouched, because Prisma connects as the table-owning role
and owner bypass applies. One access path, one authorisation model, one
place to audit.

**Do not add `FORCE ROW LEVEL SECURITY`** without writing policies
first. FORCE removes owner bypass and the API loses access to its own
tables.

The linter will now report `rls_enabled_no_policy` at INFO level on
every table. That is the intended state, not a finding to clear.

---

## Environment

| Variable | Where it goes | Notes |
|---|---|---|
| `DATABASE_URL` | API host | Postgres URI, includes the password. Never in the repo. Must begin `postgres://` or `postgresql://` — the scheme is checked, not the name |
| `JWT_SECRET` | API host | Signs access tokens and keys the HMACs. Rotating it invalidates every session and every `reporterDupToken` |
| `DEIDENT_SALT` | API host | Read at boot; a missing value must fail the deploy, not the first VCR |
| `LOG_LEVEL` | API host | Optional, defaults to `info` |
| `PORT` | API host | Optional, defaults to 8080 |

`core.ts` validates all three required variables at import time and
exits — deliberately, so a misconfigured deploy dies at boot rather than
on the first request that happens to need one.

### What is NOT needed

The Supabase **anon / publishable key** is not used anywhere in this
codebase, and should not be added to it. This architecture does not use
the Supabase client SDK or PostgREST: the API talks to Postgres directly
through Prisma, and the browser talks only to the API. Adding the key
would create a second, unaudited path to the same rows.

The Netlify Supabase extension injects four variables — `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_JWT_SECRET` (plus the misnamed `SUPABASE_DATABASE_URL` above).
**This codebase reads none of them.** A grep for those names finds one
hit, in a comment in `core.ts` explaining why they are not used.

Two of them are credentials of real consequence and are stored
**unmasked** — `is_secret: false` — which means anyone with read access
to the Netlify project, or to a token scoped to it, can retrieve their
values:

- `SUPABASE_SERVICE_ROLE_KEY` **bypasses RLS entirely.** The deny-by-
  default posture described above stops the anon key and does nothing
  to this one.
- `SUPABASE_JWT_SECRET` is worse, because it signs the other two: with
  it you mint your own `service_role` token and rotating the keys does
  not help.

Neither is needed here. See **Rotation** below.

### Connection pooling

The API is a long-lived process, so the **direct connection** is right.
If it is ever deployed to a serverless platform, switch to Supabase's
transaction pooler — a function that opens a direct connection per
invocation exhausts the pool quickly, and the failure looks like random
timeouts rather than like a configuration mistake.

---

## Deploying the API

The API ships as a Netlify Function at `netlify/functions/api.mts`,
serving `/api/*` on the same origin as the web app — which is why the
CSP's `connect-src 'self'` needs no exception.

**Read the header comment in that file before relying on it.** Fastify
expects a long-lived process; Lambda is neither long-lived nor single.
The mismatch is manageable and is not free, and the file says exactly
where it bites.

### The one step that cannot be automated

The function needs a database connection string, and Supabase does not
expose the database password through its management API — deliberately.
So this cannot be scripted from a CI job or an agent, and it should not
be: a password that travels through a chat log, a ticket or a shell
history has already leaked.

**The Netlify Supabase extension does not remove this step.** It is
worth being blunt, because the variable it injects is called
`SUPABASE_DATABASE_URL` and an earlier version of this document — and of
`core.ts` — assumed that name meant what it says. It does not. On this
project the extension sets it to:

```
https://wbixxhpaswstaphfsowz.supabase.co
```

which is the project's **REST API base**, the value `createClient()`
wants. It is not a Postgres URI, and Prisma cannot open a connection to
it. Accepting it on the strength of its name produced a protocol error
on a deploy that had just been told it was correctly connected.

So the **scheme** decides and not the name: both `core.ts` and the
function reject anything that does not begin `postgres://` or
`postgresql://`, and say why.
`tests/integration/function.integration.test.ts` holds that behaviour in
place from both directions — the extension's HTTPS value must be
refused, and a `SUPABASE_DATABASE_URL` that genuinely holds a connection
string must be accepted.

**Set `DATABASE_URL` by hand.** Supabase → Connect → Direct connection
(or the transaction pooler, per the next section), replace
`[YOUR-PASSWORD]`, and paste it into Netlify → Project configuration →
Environment variables as a **secret** value. Someone has to handle the
password once. Nothing available to an agent avoids that.

The extension may stay connected; it supplies `SUPABASE_URL` and the
anon key, neither of which this codebase uses.

Then set the two secrets that are ours rather than Supabase's:

```
JWT_SECRET     # openssl rand -base64 48
DEIDENT_SALT   # openssl rand -base64 48
```

Set them as **secret** environment variables so they are write-only in
the Netlify UI afterwards.

Until all three exist the function answers `503 not_configured` and
names what is missing — deliberately, because a Lambda that crashes on
a missing variable produces a platform error that says nothing about
which one.

### Direct connection versus the pooler

Supabase → Connect offers both. The **direct** connection (port 5432) is
correct for a long-lived process and wrong for a serverless one: each
warm Lambda holds its own pool, and enough concurrency exhausts
Supabase's connection limit. The symptom is random timeouts that look
like a network fault.

This ships as a Netlify Function, so use the **transaction pooler**
(port 6543) with `?pgbouncer=true&connection_limit=1`. Take the direct
connection only if the API is later moved to a container host.

`DATABASE_URL` takes precedence over `SUPABASE_DATABASE_URL` in both
`core.ts` and the function, so setting it explicitly overrides whatever
the extension has injected.

`pg_advisory_xact_lock` is transaction-scoped and therefore safe under
transaction pooling. A session-scoped lock would not be; that is why
`appendAudit` uses the xact variant.

### Then

1. Baseline the migration history — **already done** for this project;
   see above.
2. Confirm `/api/health` (liveness) and `/api/ready` (which queries
   Postgres) both answer.

   Both are registered at `/health` and `/api/health` — the first is
   what an orchestrator probes on a container host, the second is what
   is reachable behind a function mounted at `/api/*`. Until
   `tests/integration/function.integration.test.ts` existed, only the
   first was registered, so **both health endpoints were unreachable in
   the deployment shape this repository ships**, and this document
   confidently told you to curl one of them.
3. Seed the first accounts:

   ```bash
   DATABASE_URL='...' npm run seed
   ```

   It creates one org and three users, prints their passwords **once**,
   and stores only argon2id hashes. Idempotent by email — running it
   twice creates nothing and resets nobody's password. Change those
   passwords before anyone real uses the deployment.

---

## The Supabase MCP server

`.mcp.json` at the repository root points an agent at this project:

```
https://mcp.supabase.com/mcp?project_ref=wbixxhpaswstaphfsowz&features=…
```

**It carries no credential.** The project reference is already in this
document, and access is OAuth — `claude /mcp`, then *Authenticate*, in a
real terminal rather than an IDE extension. A contributor without
Supabase access gets nothing from the file.

Committed rather than left to each person's own config, because the work
it enables is not optional: the schema was applied through this server,
and the `_prisma_migrations` baseline above was written through it. A
future session that cannot reach the project cannot repeat either.

**It is nonetheless a second path to the same rows**, and this document
argues against exactly that a few sections up. Two things keep the
argument consistent:

- The objection to the anon key is that it is *shipped to browsers* and
  is therefore held by everyone. This is held by whoever passes an OAuth
  flow as a Supabase member of the project.
- It is an operator's tool and not an application path. Nothing the API
  serves goes through it, and no code imports it.

**Schema changes still go through `prisma migrate`.** Applying DDL
through the MCP server is what left the hosted schema correct and
Prisma's history empty, and required the baseline repair recorded above.
Use it to inspect, to read logs and advisors, and to repair — not to
migrate.

---

## Rotation

- **`JWT_SECRET`** — logs everyone out and changes every
  `reporterDupToken`. The duplicate-detection tokens on existing VCRs
  become unmatchable, which is a data-quality loss rather than a breach.
  Plan it, do not do it casually.
- **Database password** — rotate in the Supabase dashboard, then update
  `DATABASE_URL` on the host. Nothing in the repo changes.
- **Anon key** — not used; rotating it affects nothing here.

### Outstanding: the service-role key should be rotated

Not a hypothetical. `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_JWT_SECRET` are on the Netlify project with `is_secret:
false`, they are readable through the management API, and during this
project's setup **their values were returned into an agent transcript**
by exactly that route. A credential that has been read by anything other
than the process that needs it should be treated as disclosed, and these
are not read by any process here at all.

The service-role key bypasses RLS. On this database that is read and
write over `SafetyReport.narrative`, `reporterId` and the `AuditLog` —
the three things the confidentiality promise rests on.

Recommended, in order:

1. **Supabase → Settings → API → JWT Settings → generate a new secret.**
   This rotates the JWT secret and, with it, both the anon and
   service-role keys. It invalidates anything holding the old ones —
   nothing in this codebase does.
2. **Disconnect the Netlify Supabase extension**, or delete the four
   variables it set. They are unused, and an unused credential is
   liability without benefit. `DATABASE_URL` is set by hand regardless.
3. Keep `DATABASE_URL`, `JWT_SECRET` and `DEIDENT_SALT` as **secret**
   variables so they are write-only in the UI and are not returned by
   the management API.

This is recorded rather than done: rotating a live project's JWT secret
is the operator's call, and an agent should not make it.
