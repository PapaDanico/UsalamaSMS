# UsalamaSMS — Strategy

*Companion to `01-RESEARCH.md`. Read that first.*

---

## 0. Decisions taken (11 August 2026)

| Fork | Decision |
|---|---|
| **Architecture** | **Charter, not stack.** The Kanda discipline — dated figures, computed counts, guards that fail loudly, offline-first, honest empty states — on a real Fastify + Prisma + Postgres backend. Kanda's zero-backend doctrine is a mechanism, not the principle; see the charter's version-2 note. |
| **Front end** | **Vanilla JS at Kanda parity.** Same component, router and token patterns. Dexie is the only runtime dependency. |
| **Regulatory model** | **Date-aware, multi-jurisdiction, computed never stored.** KE authoritative; UG/TZ/RW provisional and marked as such. |
| **Colour scheme** | **Light only.** No dark mode, deliberately. |
| **Primary user** | The part-time safety manager at a 3–15 aircraft AOC — and, as the design target that actually decides things, the frontline person filing from a ramp with no signal. |

---

## 1. Positioning

> **Aviation safety management for the operators the incumbents priced
> out — built for the standard that starts in November.**

Two claims, both checkable, both with an expiry date recorded in
`docs/05-SWITCHES.md`.

**"Priced out"** is a factual observation about a market floor. SMS Pro
positions at roughly $300/month for small operators against competitors
at $1,000–$5,000. Below $300 there is essentially nothing. A Kenyan
operator with six turboprops and a part-time safety manager is not a
price-sensitive customer — they are a non-customer, and they run their
SMS on paper.

**"Built for the standard that starts in November"** is true until it is
not. Annex 19 Amendment 2 becomes applicable 26 November 2026 and
introduces safety intelligence as a formal provision with Doc 10159
behind it. Every product on the market predates it and will bolt it on.
The differentiator is real and it decays; the strategy assumes roughly
24 months of it.

### 1.1 What this is not

Not a flight data monitoring product. Not an MRO system. Not an EHS
platform with an aviation skin — the research is clear that general EHS
tools fail here because the artefacts are specific: a hazard register, a
5×5 matrix with named acceptance authorities, SPIs with alert levels, a
CAPA pipeline with effectiveness verification, and a confidential
reporting channel with legal protections attached.

And not a consultancy in a trench coat. The product has to be usable by
an operator who never speaks to us.

---

## 2. The one strategic fork

Kanda's fork was *should there ever be a backend*. This product's is
different and sharper:

**Does the platform ever aggregate safety data across operators?**

### What single-tenant-only buys you

- The simplest possible confidentiality story: your data is yours, the
  tenancy is the boundary, nothing crosses it.
- No governance problem, no consent architecture, no k-anonymity
  threshold to defend to a regulator or a competitor.
- Ships sooner.

### What it costs you

- The 1,000th operator makes the product no better than the 10th. This
  is exactly the ceiling Kanda's research identified and resolved.
- **It forfeits the Amendment 2 opportunity.** Safety intelligence, as
  Doc 10159 frames it, is the pipeline from data to decision. A single
  operator with 40 reports a year does not have enough data for
  intelligence. A hundred operators on the same corridors, tagged with
  the same ICAO high-risk categories, do.
- The regional safety problem is a *shared* problem. Runway excursions
  at a specific up-country strip in the wet season are not one
  operator's hazard.

### The resolution: tenant-isolated by default, contribution opt-in and k-anonymised

The same shape as Kanda's, arrived at independently and for stronger
reasons:

```
Tenancy (always)                    Aggregate (opt-in only)
──────────────────────────────      ────────────────────────────────
Raw narratives                 ─┐
Reporter identity               │
Investigations, actions         │
Audit chain                     │
SPIs, board pack, exports       │
                                └──▶ if and only if the operator opts in:
                                     { aerodrome, phase_of_flight,
                                       hrc_tag, month, severity_band,
                                       aircraft_category }
                                     — no narrative, no registration,
                                       no operator identity, no crew
                                     — k-anonymity: a cell is published
                                       only at n >= 7 reports from
                                       >= 3 distinct operators
                                     — contributor sees their own
                                       position against the band;
                                       nobody sees anyone else's row
                                     — an audit page shows byte-for-byte
                                       what was sent
```

The promise: **"Your reports stay in your tenancy. Your risk picture
gets better because other operators' patterns are visible without their
reports being."**

**The two-dimensional k-threshold matters and is not pedantry.** Seven
reports from one operator is not anonymous — it is one operator's data
with a count on it. Requiring three distinct contributors is what makes
the cell a market observation rather than a competitor's file.

**This is Phase 3 work and must not be built earlier.** The governance
is the hard part, not the pipeline, and the trust required to ask an
operator to contribute safety data does not exist until they have used
the single-tenant product for a year.

---

## 3. Module suite

Structured the way Kanda structures its tracks — a registry, so nothing
can appear on a marketing page without a route behind it (charter rule
10).

### Tier 1 — the SMS of record (must exist to be called an SMS)

| Module | Why |
|---|---|
| Occurrence reporting (MOR / VCR / hazard / near-miss / fatigue) | The intake. Offline-first, thirty seconds, anonymous option |
| Regulatory deadline tracking | Computed per jurisdiction from awareness — the thing the scaffold got wrong |
| Triage and investigation workflow | Report → hazard → risk → action |
| Hazard register and 5×5 risk assessment | Doc 9859, with named acceptance authorities per tolerability |
| CAPA with effectiveness verification | Annex 19 requires the loop closes, not that an action was raised |
| Immutable audit trail | Hash-chained, verified by content, exposed to the regulator |
| Document control | The SMS manual, and which revision was current when |

### Tier 2 — safety performance (the Amendment 2 layer)

| Module | Why |
|---|---|
| SPI / SPT configuration and monitoring | Amendment 2 strengthens this from good practice to substance |
| Safety intelligence dashboard | Doc 10159's collect → analyse → act, made visible |
| Precursor analytics on HRC tags | Runway excursion precursors, given the AFI accident profile |
| Board pack export | The Accountable Executive's quarterly evidence, date-stamped (charter rule 9) |
| Regulator oversight view | Read-only, audit-verified — a differentiator, because the 19% investigation completion rate is a regulator problem too |

### Tier 3 — the network (Phase 3, gated on trust)

| Module | Why |
|---|---|
| Opt-in anonymised benchmarking | The moat. Governance-first |
| Cross-operator hazard bulletins | De-identified, human-reviewed |
| Aerodrome risk picture | Shared infrastructure, shared hazards |

### Frozen

Training records and competency tracking. Adjacent, genuinely wanted,
and a different product. Kanda froze its Build track for the same
reason; the discipline is what kept it at 114 KB.

---

## 4. Sequencing

| Phase | Content | Gate to the next |
|---|---|---|
| **0 — now** | Brand system, charter, regulatory engine, corrected core, guards | The gates pass and the claims are checkable |
| **1 — to Nov 2026** | Tier 1 complete. One design partner AOC in Kenya, live | A frontline user files a report offline and it arrives |
| **2 — to mid 2027** | Tier 2. SPIs, board pack, regulator view | An operator passes a KCAA audit using it |
| **3 — 2027+** | Tier 3, governance first | Ten operators, one year of use, and a consent architecture that survives a hostile read |

**Phase 1's gate is deliberately behavioural rather than featural.** The
documented failure mode is report volume collapsing, not features
missing. If frontline staff will not file, nothing in Tier 2 matters.

---

## 5. Commercial model

Priced against the constraint the research found, not against the
incumbents' list prices.

| Line | Shape |
|---|---|
| **Per-aircraft subscription** | The unit that scales with the operator's actual size and with regulatory burden. A six-aircraft AOC pays six units, not an enterprise seat count |
| **Regulator / authority** | The oversight view, licensed to the CAA. Aligned with the AFI Plan and with the investigation-completion problem |
| **Association / group** | Operator associations as the distribution channel, exactly as Kanda reaches SMEs through KIFWA |
| **DFI / donor** | Aviation safety in Africa is a public good with existing funding instruments. Long procurement — start early, land it against Tier 3 |

**Deliberately excluded: consultancy bundled into the licence.** It
makes the first ten customers easy and the next hundred impossible, and
it turns every product gap into billable hours, which is a structural
incentive to leave gaps.

---

## 6. Architecture verdicts

| Question | Verdict | Reason |
|---|---|---|
| Backend? | Yes, and the charter's rule 7 is restated to say what it always meant | An audit chain the operator can edit is not an audit chain |
| Front-end framework? | None. Vanilla JS at Kanda parity | The design target is a mid-range Android at a remote strip. Kanda ships 18 tools in 114 KB |
| Offline? | Device-first, IndexedDB as local truth, Background Sync, shared validation schema | A report rejected server-side after three days offline is unfixable |
| Dark mode? | No | A safety report that renders differently by OS setting is one two people can describe differently |
| Multi-jurisdiction at launch? | Yes, with provisional rows marked | The corridor is flown from day one |
| Store the regulatory deadline? | Never | Charter rule 6. It was stored, and it was wrong twice |

---

## 7. Risks

**The provisional jurisdictions are the biggest one.** Three of five
reporting rows are unverified placeholders. A wrong deadline shown
confidently is worse than no deadline. Mitigated by the `PROVISIONAL`
flag, a test that asserts exactly which rows are unverified, and an
entry in `05-SWITCHES.md` with an owner — but the real mitigation is
reading the instruments before the first non-Kenyan customer.

**De-identification cannot be made complete.** No regex catches "I was
the only engineer on shift." Mitigated by reporting residual risk and
requiring human review, and by never letting the product claim more than
that. The failure mode is a sales sentence, not a code path.

**The Amendment 2 window closes.** By 2028 the incumbents will have
shipped safety intelligence. The strategy has to convert the head start
into something durable — which is Tier 3, which is why Tier 3 is on the
roadmap and not on the "nice to have" list.

**Regulatory relationship risk.** KCAA already operates an MOR e-services
portal. UsalamaSMS should prepare submissions and track deadlines, not
claim to be the submission channel, until there is an integration
agreement. Claiming otherwise would be the exact category of confident
wrong statement this whole document is organised against.
