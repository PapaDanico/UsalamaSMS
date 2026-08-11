# UsalamaSMS

**Safety born of African soil.**

Aviation safety management for the operators the incumbents priced out —
offline-first, multi-jurisdiction, and built against ICAO Annex 19
Amendment 2 rather than retrofitted to it.

---

## Status

**Phase 0.** Foundations, not features. What exists is the brand system,
the shared safety-critical core, the regulatory engine, the corrected
API layer, and the gates that keep every claim above checkable. No user
interface yet beyond the design tokens and the mark.

```bash
npm install
npm run check          # brand gate, claims gate, then the test suite
npm run check:brand    # 49 contrast assertions, incl. dichromacy simulation
npm run check:claims   # 40 assertions that the registries match the docs
npm test               # 40 unit tests
```

`npm run build` runs `check` first. A failing gate builds nothing.

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
| [`docs/04-BRAND.md`](docs/04-BRAND.md) | How the six-colour identity is encoded, the two artwork combinations that are not reproduced and the measurements that condemned them, and why the risk-scale green is almost black |
| [`docs/05-SWITCHES.md`](docs/05-SWITCHES.md) | Six claims with an expiry date — which flag controls each, and the test that stops it rotting |

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
tests all read.

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
