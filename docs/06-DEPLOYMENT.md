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
| `DATABASE_URL` | API host | Direct connection string, includes the password. Never in the repo |
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

**Connect the extension instead.** Netlify → the `usalamasms` project →
Project configuration → Supabase → Connect, then pick the `UsalamaSMS`
project. That injects `SUPABASE_DATABASE_URL`, which `core.ts` accepts,
and nobody ever handles the password.

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

The extension supplies the **direct** connection (port 5432), which is
correct for a long-lived process and wrong for a serverless one: each
warm Lambda holds its own pool, and enough concurrency exhausts
Supabase's connection limit. The symptom is random timeouts that look
like a network fault.

`DATABASE_URL` takes precedence over `SUPABASE_DATABASE_URL`, so the fix
is to set `DATABASE_URL` explicitly to the transaction pooler (port
6543) with `?pgbouncer=true&connection_limit=1`, leaving the extension
connected. Do this before any real traffic.

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

## Rotation

- **`JWT_SECRET`** — logs everyone out and changes every
  `reporterDupToken`. The duplicate-detection tokens on existing VCRs
  become unmatchable, which is a data-quality loss rather than a breach.
  Plan it, do not do it casually.
- **Database password** — rotate in the Supabase dashboard, then update
  `DATABASE_URL` on the host. Nothing in the repo changes.
- **Anon key** — not used; rotating it affects nothing here.
