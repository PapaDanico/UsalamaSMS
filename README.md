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

Twenty routes ship. The operational four are the report form, the
triage queue, an account screen that signs in — and deliberately
does **not** gate the form, because filing must never require a
password — and `/sms`, which holds the organisation's own record
against eight of Annex 19's twelve elements: the signed policy, the
accountability matrix, the appointments, the emergency exercises, the
controlled documents, the internal audit findings, the training matrix
and what reporters were told. Six are instruments: the occurrence classifier and risk
assessor on `/toolkits`, a risk register, a safety risk assessment in
ICAO Doc 9859's five steps, safety performance indicators whose alert
levels are computed from the operator's own history, and the SMS
maturity assessment. The rest carry the reasoning: `/methodology` renders the Doc
9859 matrix and the deadline table from the modules that compute them —
its matrix calls `tolerability()` and its deadline table reads
`MOR_OBLIGATIONS`, so neither can drift from the documents describing
them — alongside a glossary, tutorials, FAQ, about, privacy and terms.

**`/coverage` is the one to read before adopting anything.** It states,
element by element against Annex 19's twelve, what is built here and
what is only partial — and the figure it reports, **11 of 12**, is
computed from the same declaration the table renders rather than typed
beside it. Ten elements are built and two are partial; a partial
element counts a half, which is where the figure comes from.

That figure moved from 2.5 when `/sms` gave eight elements a
server-held record, again when the register joined the indicators on
the server, and again when an indicator gained the record of what was
done the last time one crossed, and again when the change assessment
moved off the handset, and again when the emergency contact directory
gave element 1.4 the half it was missing. The two that stay partial say
plainly what they still lack: the documents behind the document
register, and a warning that reaches somebody who does not open the
training screen. An operator adopting this as its sole SMS would still
have gaps to answer for, and `/coverage` names every one of them —
including the one thing 1.4 deliberately does **not** hold, the ERP
document itself, because a place to type call-out trees and diagrams
would be a worse version of the file an operator already keeps.

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
one-time Prisma baseline the hosted schema needs.

**The triage queue is the operator's now, not one handset's** — a
standing disclosure in this file since the first release, and it turned
out to be the same gap as the disposition: the sync response returns
`serverUpdatedAt` and never the server's id, so the device could not
name a report to any route. One endpoint closes both. The device's own
store still renders first and without waiting, the organisation's queue
is layered over it keyed on `clientId` — a union, never an assignment —
and when the safety office cannot be reached the screen **says so**
rather than showing one phone's reports as though they were the
operator's. A smoke check asserts exactly that, in both the signed-out
and the refused states.

**A report can now be dispositioned**, which it could not before: the
five `ReportState` values had been in the schema since the first
migration with four of them unreachable, because no route wrote the
column. Every report ever filed was `SUBMITTED`, permanently. It is now
triaged, investigated, closed with a statement of what was done, or
reopened with a reason — each move recorded against the person who made
it, at the authority the permission matrix already granted. Time from
report to closure is computed from that history, and from the **first**
closure, so reopening a report does not make an operator's own numbers
look worse.

**And the CAPA loop is reachable.** An action is raised from the report
that prompted it, carries its own owner and due date, and is completed
and then verified **by somebody other than whoever did the work**. It
shipped one release earlier as an API with no interface at all — four
verbs, two coverage entries claiming it, and no screen that could
create a row, so the risk picture's three action figures read zero
permanently. A claims assertion now fails the build when the API
accepts a write no screen can send, and it was mutation-checked by
restoring that defect exactly as it shipped.

**Element 3.2 was the same fault, larger.** The management of change
was marked BUILT, `/api/v1/changes` was named in its coverage entry,
and `/sms` pointed an operator at `/toolkits/sra` — the safety risk
assessment, a different instrument answering a different question. A
change assessment could not be recorded, approved or reviewed from
anywhere in the product. It is now an element surface on `/sms` like
the other nine.

`/toolkits/spi` computes indicators and alert levels, and will now
count the reports that arrived in a period and put the figure beside
the field — it does **not** fill it in, because an indicator counts a
particular thing and a quarter's report count is not that thing unless
the operator says so. The series is held for the operator rather than
on one device, which is what regulation 9(5) of L.N. 32/2026 asks for.

**What is still absent is delivery.** Nothing in this product tells
anybody anything: no alert when an indicator crosses, when training
lapses, when an emergency contact goes stale or when an action falls
overdue. Every incumbent has that and it is the largest functional gap
here. It is unblocked but not started — the channel is decided (SMS,
because it is the only one that reaches somebody without a smartphone)
and what it needs next is a sender-ID registration and API credentials,
which are a person's job and not a coding task. See
`docs/02-STRATEGY.md`.

```bash
npm install
npm run check          # prisma generate, typecheck, brand, assets, claims, css, glyphs, tests
npm run check:brand    # 56 contrast assertions, incl. dichromacy simulation
npm run check:assets   # every file served from public/ is declared, with a ceiling
npm run check:claims   # 103 assertions that the registries match the docs
npm run check:glyphs   # every character on a screen is one the face can draw
npm test               # 729 unit tests
npm run typecheck      # tsc --noEmit, strict
npm run verify         # build, then drive the bundle in headless Chromium
npm run check:update   # 7 checks across TWO versions — the PWA update path
npm run test:integration   # 363 checks against a real Postgres
npm run seed               # first org + users; prints passwords once
npm run seed:demo -- --rotate   # re-issue demo passwords, revoking live sessions
npm run setup:env          # set DATABASE_URL + the two secrets on Netlify
```

`npm run build` runs `check` first. A failing gate builds nothing.
`npm run smoke` drives the **built** bundle in a real browser at 390&times;844
— 78 checks, including filing a report with the network cut and
confirming it is in IndexedDB afterwards. A test that passes on source
and fails on the bundle has never protected anyone.

`npm run check:update` is the only check that needs **two** versions, and
it exists because the failure it catches needs two. The worker used to
call `skipWaiting()` on install: it took over without asking, its
activate handler deleted the previous version's cache while a page was
still running that version's JavaScript, and the next route that page
opened fetched a chunk whose hash had moved. The reader — on full
signal — was told *"This page needs a connection"*. The update prompt
appeared after the fact, and its Reload button posted to
`registration.waiting`, which is null once a worker has skipped, so it
did nothing at all. The worker waits now, the person decides, and four
checks across two builds keep it that way.

Bundle: **213.5 KB entry JS + 53.6 KB CSS**, which is **75 KB over the wire**
gzipped, against budgets the build enforces and refuses to raise
silently. Every route past the first paint is lazily loaded, so the
entry figure is what a person filing a report at a strip actually pays.

Plus **67 KB of self-hosted type**, latin subset, precached by the
service worker so the second load is offline too: DM Sans at 61 KB for
the whole interface — one variable file covering 400 to 700 — and a
6 KB subset of JetBrains Mono for identifiers, where the difference
between `1` and `l` is the difference between two people agreeing on a
hash. A further 30 KB of latin-ext is fetched only if a character needs
it.

**One family, not two.** The headings were set in Cormorant Garamond
until it was removed: a serif display over a sans body is what a
prospectus is set in, and the hierarchy is carried perfectly well by
weight and tracking. That deleted 71 KB nobody was choosing to pay,
including the reporter at a remote strip who never reads a heading in a
serif they waited for. Type is loaded on the same terms as everything
else here rather than from a CDN that would cost a DNS lookup, a TLS
handshake and a third-party dependency on the first paint.

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
| [`docs/05-SWITCHES.md`](docs/05-SWITCHES.md) | Eleven claims with an expiry date — which flag controls each, and the test that stops it rotting |
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

**2. The MOR deadline was wrong three times.** `morDeadline()` added 72
hours to the occurrence time and cited KCAA. 72 hours is the **EU**
figure (Reg. 376/2014). And the EU's 72 hours run from **becoming
aware**, not from the occurrence — an engineer who finds a Friday defect
on Monday reports from Monday. A Kenyan operator would have seen a
comfortable green countdown for two full days after going non-compliant.

The third correction came from finally reading the primary instrument.
The product then showed a flat **24 hours**, taken from KCAA Advisory
Circular CAA-AC-SMS004A — guidance, and superseded. The **Civil Aviation
(Safety Management) Regulations, 2025**, gazetted as **L.N. 32 of 2026**
on 3 March 2026, sets three periods in regulation 12(1): **24 hours for
an accident, 48 for a serious incident, 72 for an incident or other
safety related occurrence.** It also names incidents as mandatorily
reportable, where the classifier had been calling them not automatically
reportable — so the screen built to answer "must I report this, and by
when" was answering both halves wrong for two of the three classes.

Both errs strict rather than lax, which is why nobody noticed. A
compliance tool that overstates urgency costs an operator time; one that
understates it costs them a finding. Neither is the instrument. Where the
class is unknown the strictest period still applies, and a test asserts
that the row's default can never drift above it. Replaced by
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
