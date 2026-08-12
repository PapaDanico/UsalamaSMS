# UsalamaSMS

**Safety intelligence for African skies.**

Aviation safety management for the operators the incumbents priced out —
offline-first, multi-jurisdiction, and built against ICAO Annex 19
Amendment 2 rather than retrofitted to it.

---

## Status

**Phase 1 gate met.** `docs/02-STRATEGY.md` sets it as *"a frontline
user files a report offline **and it arrives**"*, and both halves are
now verified rather than asserted:

- **Files offline** — `npm run smoke` drives the built bundle in
  headless Chromium, cuts the network, submits a report, and reads the
  record back out of IndexedDB.
- **And arrives** — `npm run test:integration` posts a queued batch
  through the real Fastify instance, the real route, real JWT auth and a
  real Postgres, then asserts the row, the audit entry and the
  idempotency behaviour.
- **And the seam between them** — those two were verified for a while
  and the join was not, which is where the whole thing was broken: the
  app had no login screen, no token store and no `Authorization` header,
  while the sync route has always required one. Every real sync returned
  401, the client swallowed it, and the strip reported the report as
  merely *waiting to send* — permanently. `smoke` now signs in and
  asserts the batch leaves the browser carrying a bearer token, and that
  a queued report with no session **says so** instead.

Four routes ship: the report form, the triage queue, an account screen
that signs in (and deliberately does **not** gate the form — filing must
never require a password), and a design route where the brand system
renders itself against the real modules — its matrix calls
`tolerability()` and its deadline table reads `MOR_OBLIGATIONS`, so
neither can drift from the documents describing them.

**Nearly deployable.** The hosted database exists (Supabase, eu-north-1,
schema applied and baselined, RLS deny-by-default) and the API ships as
a Netlify Function on `/api/*`. It answers `503 not_configured`, naming
what is absent, until `DATABASE_URL` and two secrets are set by hand —
the one step that cannot be scripted, because Supabase does not expose
the database password through its API and a password that travels
through a chat log has already leaked. The Netlify Supabase extension
does **not** substitute for it: the `SUPABASE_DATABASE_URL` it injects
is the REST API base, not a connection string, so both `core.ts` and
the function check the scheme rather than trusting the name. See
[`docs/06-DEPLOYMENT.md`](docs/06-DEPLOYMENT.md), which also carries the
one-time Prisma baseline the hosted schema needs. The triage queue reads
this device rather than the organisation, and there is no investigation,
CAPA or SPI workflow. See `docs/02-STRATEGY.md`.

```bash
npm install
npm run check          # prisma generate, typecheck, brand gate, claims gate, tests
npm run check:brand    # 56 contrast assertions, incl. dichromacy simulation
npm run check:claims   # 49 assertions that the registries match the docs
npm test               # 104 unit tests
npm run typecheck      # tsc --noEmit, strict
npm run verify         # build, then drive the bundle in headless Chromium
npm run test:integration   # 52 checks against a real Postgres
npm run seed               # first org + users; prints passwords once
```

`npm run build` runs `check` first. A failing gate builds nothing.
`npm run smoke` drives the **built** bundle in a real browser at 390&times;844
— 35 checks, including filing a report with the network cut and
confirming it is in IndexedDB afterwards. A test that passes on source
and fails on the bundle has never protected anyone.

Bundle: **202 KB entry JS + 30 KB CSS**, which is **65 KB over the wire**
gzipped, against budgets the build enforces and refuses to raise
silently. Plus 96 KB of self-hosted Inter — four weights, latin subset,
precached by the service worker so the second load is offline too.

Two runtime dependencies earn their weight: Dexie holds the outbox, and
zod validates on the device with the *same schema the server uses* — a
report rejected server-side after three days offline is unfixable,
because the person who wrote it has forgotten the detail.

The risk matrix and the regulatory engine are still pure, zod-free
modules, so anything that needs only the matrix can import it without
the schema machinery.

---

## Why this exists

Africa has the world's highest aviation accident rate — 7.86 per million
sectors in 2025, improved from 12.13 and still the worst of any region —
and the thinnest safety tooling. The two are connected by price. SMS
software runs $1,000–$5,000 a month, with a floor around $300. A Kenyan
AOC with six turboprops and a part-time safety manager is not a
price-sensitive customer; it is a non-customer, and it runs its SMS on
paper.

On **26 November 2026**, Annex 19 Amendment 2 becomes applicable:
safety intelligence as a formal provision, Doc 10159 behind it,
strengthened SPI/SPT requirements, and SMS extended to RPAS operators,
their AMOs and certified heliports. Every incumbent product predates it.

See [`docs/01-RESEARCH.md`](docs/01-RESEARCH.md) for the evidence and
[`docs/02-STRATEGY.md`](docs/02-STRATEGY.md) for what was decided from it.

---

## Documents

| Doc | Contents |
|---|---|
| [`docs/DIAGNOSTIC-CHARTER.md`](docs/DIAGNOSTIC-CHARTER.md) | The eleven shared rules governing this product and its two siblings, plus this product's four documented deviations. An identical copy lives in every repository |
| [`docs/01-RESEARCH.md`](docs/01-RESEARCH.md) | The regulatory clock, the AFI safety case, competitor pricing, why SMS implementations fail, and the confidentiality findings |
| [`docs/02-STRATEGY.md`](docs/02-STRATEGY.md) | Positioning, the aggregate-data fork, module suite by tier, sequencing, commercial model, architecture verdicts, risks |
| [`docs/04-BRAND.md`](docs/04-BRAND.md) | How the six-colour identity is encoded, the two artwork combinations that are not reproduced and the measurements that condemned them, why the risk-scale green is almost black, and the one dropdown component every operational field goes through |
| [`docs/05-SWITCHES.md`](docs/05-SWITCHES.md) | Ten claims with an expiry date — which flag controls each, and the test that stops it rotting |
| [`docs/06-DEPLOYMENT.md`](docs/06-DEPLOYMENT.md) | The hosted database, the one-time Prisma baseline it needs, why RLS has no policies, and which environment variables go where. No secrets, by rule |

---

## The three findings worth arguing about

**1. Anonymous reporting was not anonymous.** The sync route wrote
`userId` and `deviceId` to a receipt keyed on the same `clientId` as the
report — including for anonymous submissions. One `JOIN ... USING
("clientId")` re-identified every anonymous reporter. The
de-identification pipeline went to real lengths to be irreversible; the
sync path handed the identity back through the side door. A confidential
reporting system that can be un-anonymised by a join is not a
confidential reporting system, it is a list. Fixed, and guarded in
[`tests/confidentiality.test.ts`](tests/confidentiality.test.ts).

**2. The MOR deadline was wrong twice.** `morDeadline()` added 72 hours
to the occurrence time and cited KCAA. 72 hours is the **EU** figure
(Reg. 376/2014); KCAA's CAA-AC-SMS004A requires the pertinent
information within **24**. And the EU's 72 hours run from **becoming
aware**, not from the occurrence — an engineer who finds a Friday defect
on Monday reports from Monday. A Kenyan operator would have seen a
comfortable green countdown for two full days after going non-compliant.
There is no worse failure available to a compliance tool than a
confident wrong deadline. Replaced by
[`packages/shared/src/regulations.ts`](packages/shared/src/regulations.ts).

**3. The audit chain did not verify the audit log.** `verifyAuditChain`
walked `prevHash` links and never recomputed a hash, so editing `action`
on any row — from `risk.accept.intolerable` to `risk.accept.tolerable`,
say — left every link intact and returned `ok: true`. It also forked
under concurrency: two appends for one org at Postgres' default Read
Committed both read the same predecessor. Both fixed; the material
definition now lives in one place that the writer, the verifier and the
tests all read — and `tests/integration/audit.integration.test.ts` now
edits a row in Postgres and requires the verifier to notice, plus a
counter-test that removes the advisory lock and requires the chain to
break. A guard nobody has watched fail is a guard nobody has tested.

---

## Layout

```
packages/shared/     Types, validation, risk matrix, RBAC, regulatory engine
apps/api/            Fastify: auth, RBAC, audit chain, de-identification, sync
apps/web/            Offline-first client: tokens, mark, Dexie outbox
prisma/              Schema. Note what is deliberately NOT a column
scripts/             The gates. Both fail the build; both were watched failing
tests/               Safety-critical and confidentiality guards
```

## Licence

See [LICENSE](LICENSE).
