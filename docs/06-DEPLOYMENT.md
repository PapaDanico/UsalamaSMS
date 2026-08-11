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
| Schema | Applied — 9 tables, 3 migrations |
| RLS | Enabled, deny-by-default, on all 9 tables |
| API | **Not deployed anywhere.** The database exists; nothing serves it |
| Web | Netlify, preview per PR |

---

## The Prisma migration history is NOT recorded on Supabase

Read this before running any Prisma command against the hosted database.

The three migrations were applied through the Supabase management API
(the MCP `apply_migration` tool), because this environment has the
project's API credentials and does **not** have its database password.
That applied the DDL correctly and did **not** write Prisma's
`_prisma_migrations` bookkeeping table.

So the hosted schema is correct and Prisma does not know it. The next
`prisma migrate deploy` will find a non-empty database with no migration
history and refuse — or, worse, if someone reaches for
`migrate dev`, offer to reset it.

**Baseline it once, before the first deploy**, with the connection
string to hand:

```bash
export DATABASE_URL='postgresql://postgres:<password>@db.wbixxhpaswstaphfsowz.supabase.co:5432/postgres'

prisma migrate resolve --applied 20260811173454_initial_schema
prisma migrate resolve --applied 20260811174611_flight_phase_and_taxonomy
prisma migrate resolve --applied 20260811180500_enable_rls_deny_by_default

prisma migrate status   # should report the database is up to date
```

`resolve --applied` records a migration as done without running it,
which is exactly right here: the SQL has already executed.

After that, every later change goes through `prisma migrate` normally
and this section stops mattering.

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

## Deploying the API — not done yet

Nothing serves the database. When it happens, the checklist is:

1. Baseline the migration history (above).
2. Set the four environment variables on the host.
3. Confirm `/health` (liveness, no dependencies) and `/ready` (which
   actually queries Postgres) both answer.
4. Point the web app's `connect-src` at the API origin — the CSP in
   `netlify.toml` currently allows `'self'` only, so a cross-origin API
   will be blocked until that line is updated. This is intentional: it
   fails loudly rather than letting an unnoticed third-party endpoint in.
5. Seed one org and one user. There is no seed script yet.

---

## Rotation

- **`JWT_SECRET`** — logs everyone out and changes every
  `reporterDupToken`. The duplicate-detection tokens on existing VCRs
  become unmatchable, which is a data-quality loss rather than a breach.
  Plan it, do not do it casually.
- **Database password** — rotate in the Supabase dashboard, then update
  `DATABASE_URL` on the host. Nothing in the repo changes.
- **Anon key** — not used; rotating it affects nothing here.
