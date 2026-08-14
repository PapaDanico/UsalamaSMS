# UsalamaSMS — Research

*Compiled 11 August 2026. Every figure carries its date and its source;
charter rule 4. Where a claim has an expiry, it also appears in
`docs/05-SWITCHES.md` with the flag that controls it.*

---

## 0. The one-paragraph version

Africa has the world's highest aviation accident rate and the lowest
density of safety tooling, and the two facts are connected by price. The
software that implements ICAO Annex 19 costs $1,000–$5,000 a month,
which is a rounding error for a flag carrier and impossible for the
six-aircraft AOC that makes up most of the continent's fleet. Those
operators run their SMS on paper and spreadsheets, so their hazard data
never becomes safety intelligence, so the regulator has nothing to
oversee with, so the accident rate stays where it is.

On **26 November 2026** — fifteen weeks from this document — Annex 19
Amendment 2 becomes applicable and raises the bar again: safety
intelligence, stronger SPI/SPT provisions, SMS extended to RPAS
operators, their maintenance organisations and certified heliports. Every
incumbent is retrofitting that into a product designed before it existed.
A platform started now is born on the far side of it.

That is the opening, and it closes.

---

## 1. The regulatory clock

### 1.1 Annex 19 Amendment 2 / third edition

| Milestone | Date |
|---|---|
| Adopted by Council | 23 June 2025 |
| Effective | 4 November 2025 |
| **Applicable** | **26 November 2026** |

What it changes, per ICAO and the implementation commentary:

- **Safety intelligence becomes a formal provision**, supported by the
  new **Doc 10159 Safety Intelligence Manual**. The requirement is the
  full pipeline — collect, store, aggregate, process, analyse, share,
  act — expressed as a Safety Data Collection and Processing System
  (SDCPS). This is the substantive change. It moves the compliance
  question from *do you have a hazard register* to *can you show what
  your data caused you to do*.
- **SMS applicability extends** to certified RPAS operators authorised
  for international operations, approved maintenance organisations
  serving them, and certified heliports.
- **Safety performance management strengthens** — SPIs, SPTs, continuous
  monitoring, and tighter SSP–SMS integration.
- **Safety data governance and just-culture protection are enhanced.**

The direction is a shift from compliance-based to performance-based and
intelligence-based safety management. A product whose data model is a
list of reports with a status column cannot express that. A product
whose model is *occurrence → hazard → risk → action → indicator →
decision*, with the audit trail linking them, can.

### 1.2 The MOR deadline, and the constant that was wrong

The scaffold shipped:

```ts
/** MOR regulatory deadline: occurrence time + 72 hours (KCAA MOR AC). */
export function morDeadline(occurredAt: Date): Date {
  return new Date(occurredAt.getTime() + 72 * 3600 * 1000);
}
```

Two independent errors, both locked in by a passing unit test.

**The figure is the wrong jurisdiction's.** 72 hours comes from
Regulation (EU) No 376/2014, Article 4(6). KCAA's Advisory Circular
**CAA-AC-SMS004A (January 2023)** requires the pertinent information
within **24 hours**. Kenya's 72-hour rule is a different obligation
entirely — undeclared or misdeclared dangerous goods, running from
discovery.

**The clock started in the wrong place.** Even under 376/2014 the 72
hours run from the reporter **becoming aware** of the occurrence, not
from the occurrence. An engineer who finds a Friday defect on Monday
reports from Monday. Anchoring to `occurredAt` silently consumed the
operator's whole window whenever discovery lagged the event — precisely
the case where a deadline is hardest to meet.

Combined, a Kenyan operator using the scaffold would have seen a
comfortable green countdown for **two full days after going
non-compliant**. There is no worse failure mode available to a
compliance product than a confident wrong deadline; an operator without
the tool at least knows it does not know.

The repair is `packages/shared/src/regulations.ts` — obligations as
dated, cited data keyed by jurisdiction, deadlines computed from
awareness and never stored.

### 1.3 Kenya

Twenty-nine revised Kenya Civil Aviation Regulations were published in
2025. Under Regulation 12 of the Safety Management Regulations a service
provider must notify and make mandatory reports of accidents, serious
incidents, incidents and other safety-related occurrences to KCAA. KCAA
operates an e-services MOR portal.

*Consequence for the product:* the destination for a Kenyan MOR already
exists and is a government portal. UsalamaSMS should prepare the
submission and track the deadline; it should not pretend to be the
submission channel until there is an integration agreement.

---

## 2. The safety case

IATA's 2025 Annual Safety Report, released 9 March 2026:

| Measure | AFI region |
|---|---|
| All-accident rate 2025 | **7.86 per million sectors** (from 12.13 in 2024) |
| Five-year average | 9.37 |
| Ranking | **Highest of any region**, despite the improvement |
| Fatality risk | **2.19 per million sectors** (from zero in 2024) |
| Dominant accident types | **Runway excursions**, and "other end state" |
| Turboprop involvement | **71%** of accidents involving AFI-based operators |
| Investigation completion, sub-Saharan Africa | **19%** |

Four things follow directly.

**Runway excursion is the headline risk, and it is in the enum.** `RE`,
`RI`, `LOC_I`, `CFIT`, `MAC`, `BWI` are the ICAO high-risk categories
and the scaffold already tags reports with them. That tagging is what
makes an operator-level SPI on runway excursion precursors possible, and
it is what makes cross-operator aggregation meaningful later.

**Turboprops at 71% means the target fleet is the target fleet.** The
operators most exposed are exactly the ones the incumbents' pricing
excludes. This is not a market chosen for sentiment.

**A 19% investigation completion rate is a market signal, not only a
tragedy.** Investigations stall because the evidence trail is
incomplete. A hash-chained, tamper-evident record of what was known and
when is worth something to an investigator that a shared drive is not.

**Fatality risk went from zero to 2.19 in one year.** Small numbers of
sectors make regional rates volatile, which is an argument for measuring
precursors rather than outcomes — the SPI case, and the Amendment 2
case.

---

## 3. Competition and price

| Platform | Position |
|---|---|
| SMS Pro (ASMS) | Long-established; ~$300/month entry for small operators; positions itself explicitly against competitors at $1,000–$5,000/month |
| Ideagen Coruson | Enterprise EHS/aviation; airline and airport scale |
| Vistair SafetyNet | Airline scale, strong on document control |
| ASQS iQSMS | European, mid-to-large operators |
| SafetyNET (Aviation InterTech) | Cloud SMS with analytics |
| FLIGHTdocs Pro\|Safe | Business aviation |
| ACSF SMS Tool | Free/low-cost, US Part 135, charter-focused |

Three observations.

**The floor is around $300/month and most of the market sits far above
it.** For a Kenyan operator running six turboprops, $300/month is
roughly a line-maintenance item, and $1,000+ is not a conversation.

**Regional pricing already varies** — SMS Pro notes its pricing may not
hold in territories served by partners, South Africa among them — which
indicates the incumbents know the affordability problem exists and have
addressed it through channel rather than product.

**Nobody is Annex-19-Amendment-2-native.** Every product above predates
Doc 10159. They will all add safety intelligence as a module. A product
whose data model assumes it from the first migration is a different
thing, and the window in which that is a visible difference is roughly
2026–2028.

### 3.1 Why implementations fail, which is the real competitor

The failure mode is documented and consistent, and it is not "the
software lacked a feature":

- Paper SMS is cheap to start and becomes labour-intensive to track and
  report from — so it survives exactly until the first audit.
- Staff resist systems they read as surveillance or as extra paperwork.
  One airport's hazard reporting stayed low purely on distrust.
- The safety manager is usually part-time. Without tooling they either
  leave or stop performing; with the wrong tooling they drown faster.
- And then the spiral: too few inputs → no visible progress → management
  disengages → risk management fades → *the failed SMS becomes a
  self-fulfilling prophecy*.

**The binding constraint is report volume, not report processing.** Every
incumbent optimises the safety manager's workflow. The thing that
actually kills an SMS is the frontline never filing. That is a design
target, and it is the one the offline-first architecture serves: a
thirty-second report from a ramp with no signal.

---

## 4. The connectivity constraint

Offline-first is not a feature here, it is the operating assumption. The
established pattern — and it is well established — is three layers: a
service worker with cache-first for the shell and network-first for
data, IndexedDB as the local source of truth, and Background Sync to
queue writes. Design the local experience first; do not build an online
app and bolt on an error message.

Two consequences the scaffold already reflects and one it did not:

- Validate with the **same schema the server uses**, on the device. A
  report rejected server-side after three days offline is unfixable,
  because the person who wrote it has forgotten the detail.
- Idempotency by client-generated key, so a retry is free.
- **Tell the user what has not synced.** The scaffold's outbox was
  silent. An unsynced occurrence report is an occurrence that has not
  been reported, and only the person holding the handset can carry it to
  signal.

---

## 5. Just culture and the confidentiality problem

Annex 19 Chapter 5 requires States to establish voluntary reporting to
capture what mandatory reporting misses. A voluntary confidential scheme
is an essential part of a mature system, and its defining property is
that reported data is protected and **never used against the reporting
person or anyone named in the report**. Amendment 2 strengthens safety
data governance and just-culture protection further.

Just culture, as IFATCA and ICAO frame it: frontline operators are not
punished for actions commensurate with their experience and training,
while wilful violations are not tolerated.

**This is where the scaffold had its most serious defect.** The sync
route wrote `userId` and `deviceId` to a receipt row keyed on the same
`clientId` as the report — including for anonymous reports. One join
re-identified every anonymous reporter in the system. The
de-identification pipeline went to real lengths to be irreversible: hard
`null` on `reporterId`, an explicit refusal of reversible encryption.
The sync path handed the identity back through the side door.

A confidential reporting system that can be un-anonymised by a join is
not a confidential reporting system. It is a list. Fixed in
`apps/api/src/routes.sync.ts`; guarded in `tests/confidentiality.test.ts`.

**The second confidentiality finding is subtler and cannot be fully
fixed.** Pattern-based de-identification removes what matches a pattern.
The original module carried six regexes, matched only Kenyan `5Y-`
registrations, and required a `Capt.`/`F/O` prefix to catch a name — so
"Otieno was on the headset" survived, on a platform whose market is the
East African corridor. Widening the patterns helps and does not solve
it: no regex will ever catch *"I was the only engineer on shift."* The
honest design is a scrubber that **reports what it could not remove**
and a mandatory human review before distribution. That is what
`apps/api/src/deident.ts` now does.

---

## 6. What this research decided

| Question | Answer | Because |
|---|---|---|
| Who is the user? | The part-time safety manager at a 3–15 aircraft AOC, and the frontline person who files | 71% turboprop involvement; the failure spiral starts at report volume |
| What is the wedge? | Annex 19 Amendment 2, applicable 26 Nov 2026 | Nobody's data model is native to it; the window is ~24 months |
| What is the price ceiling? | Well under the $300/month floor | Below that is empty market; above it the incumbents are better resourced |
| Which jurisdictions at launch? | KE authoritative; UG/TZ/RW provisional and marked | The corridor is flown from day one; pretending otherwise is a hardcode |
| What must never break? | Anonymity, and the audit chain's meaning | They are the two claims that, if false, make the product worse than paper |

---

## 3. The three big regulators, and what they converge on

**Added 14 August 2026.** This file cited one EASA regulation and
nothing else from the FAA, EASA or CASA, which left the largest
comparison in the industry sitting in a chat log — the failure mode
`docs/08-OPEN-WORK.md` opens by naming.

**READ FROM SECONDARY SOURCES, NOT THE PRIMARIES.** Network egress from
this environment blocks faa.gov, easa.europa.eu, casa.gov.au and
icao.int without exception. Everything below is corroborated across
independent secondary sources and is recorded as such — the same
standard as `CICTT_VERIFIED_AGAINST_PRIMARY` and
`accidentNotification.domesticInstrumentRead`. **No figure here should
enter a customer surface until somebody has opened the instrument.**

### 3.1 The convergence, which is the finding

All three have moved SMS DOWN-MARKET to small operators inside the last
two years, on staggered deadlines, and each has published scaling
guidance rather than an exemption. That is the market thesis arriving
independently from three regulators who did not coordinate it.

| | Instrument | Who it newly reaches | Clock |
|---|---|---|---|
| **FAA** | 14 CFR Part 5, final rule 26 Apr 2024, effective 28 May 2024 | Part 135 charter and commuter, 91.147 air tours, some Part 21 holders | Declaration of Compliance by **28 May 2027** |
| **EASA** | Part-ORO Subpart GEN Section II, plus Reg. (EU) 376/2014 | Already broad; AMC/GM Issue 2 Amd 29 (Dec 2025) keeps aligning to ICAO | Continuous |
| **CASA** | AC 119-01, Part 119/138 CASR | Australian air transport; a **micro-operator** sample manual exists | In force |
| **ICAO** | Annex 19 Amendment 2 → 3rd edition | RPAS operators, their AMOs, certified heliports | Applicable **26 Nov 2026** |

### 3.2 EASA — ECCAIRS is the interoperability substrate, and it is ADREP

The single most useful finding for this product. **ECCAIRS 2 is EASA's
platform, every Member State and the European Central Repository store
occurrence reports in it, and it uses the ADREP taxonomy — ICAO's.**

That is exactly the taxonomy this product started coding occurrences to
on 14 August 2026. The CICTT work was argued on ICAO grounds; EASA's
infrastructure is independent confirmation that occurrence categories
are the interoperability primitive rather than a nicety, and it names
the next step precisely: **an export shaped so a State can ingest it**,
rather than a JSON file an operator's consultant re-keys.

Reg. 376/2014 also asks operators to hold their occurrences in a
database, and pairs mandatory with voluntary reporting under Just
Culture — the same pairing L.N. 32's regulations 12 and 13 make, which
is why the voluntary-scheme screen generalises beyond Kenya.

### 3.3 FAA — a second clock, over this product's exact operator

Part 5 now reaches **Part 135 charter and commuter operators**, which is
the same profile as a Kenyan AOC with six turboprops: small, varied,
previously outside SMS, and now inside it with a hard date. The rule
carries **thirteen exceptions for single-pilot operators**, which is the
clearest statement any regulator has made that a proportionate SMS is a
legal category and not a concession.

**This is not a market this product serves** — it computes Kenya's
instrument and an ICAO baseline, and a US row would need somebody to
read Part 5. It is recorded because the *shape* of the demand is
identical and the deadline is public: an operator population that must
declare compliance by 28 May 2027 is a population buying tooling in
2026.

### 3.4 CASA — the scalability argument, already won

CASA publishes a resource kit of SMS basics for smaller organisations,
sample SMS manuals for Part 119 and Part 138, and **a separate
micro-operator sample manual**. Its framing is that SMS scope and
resources scale to the size and nature of the operation, and that
implementation strategies differ by size rather than the framework
doing.

That is the argument `maturity.ts` already implements — grading against
the operator's own scale, refusing to average twelve elements into a
percentage, and refusing to treat a small operator's SMS as a large
one's with pieces missing. A regulator publishing a micro-operator
manual is the strongest available evidence that this is the correct
reading of Annex 19 rather than a convenient one.

### 3.5 What this changes for the product

1. **An ECCAIRS/ADREP-shaped export** is now the highest-value
   interoperability step, and today's occurrence coding is its
   precondition. Not "export to ECCAIRS" — that needs the schema read
   from EASA — but the codes travelling in the operator's own copy,
   which they now do.
2. **Nothing else changes.** No FAA or EASA jurisdiction row goes into
   `MOR_OBLIGATIONS` on the strength of a secondary source. The rule
   that a figure not read against the primary does not enter the
   registry is what makes the Kenya row worth anything, and a second
   country's market size is not a reason to bend it.


## Sources

- [IATA — 2025 Annual Safety Report release, 9 March 2026](https://www.iata.org/en/pressroom/2026-releases/2026-03-09-01/)
- [Airspace Africa — IATA Releases 2025 Annual Safety Report](https://airspace-africa.com/2026/03/10/iata-releases-2025-annual-safety-report/)
- [Engineering News — Africa's air safety record improved last year, but still lags](https://www.engineeringnews.co.za/article/africas-air-safety-record-improved-last-year-but-still-lags-the-rest-of-the-world-2026-03-10)
- [ICAO — Safety Management (SARPs and guidance)](https://www.icao.int/safety-management)
- [ICAO — Safety Intelligence Manual (Doc 10159)](https://www.icao.int/safety-management/SMI/SI)
- [REDiFly — ICAO Annex 19 Edition 3: what it means before November 2026](https://redifly.com/icao-annex-19-edition-3-what-it-means-for-your-aviation-sms-before-november-2026/)
- [Aero Support Group — ICAO Annex 19 Amendment 2](https://aerosupport360.com/icao-annex-19-amendment-2-aviation-compliance-2026/)
- [Web Manuals — ICAO Amendment Transforms Safety Documentation in APAC](https://webmanuals.aero/resources/blog/icao-annex-19-amendment-2)
- [ICAO — Voluntary and confidential reporting (training material)](https://www.icao.int/sites/default/files/SMI/TrainingDocs/Chapter%205%20Safety%20Data%20Collection%20and%20Processing%20Systems/5.2-20.Voluntary%20and%20Confidential%20Reporting.pdf)
- [ICAO DGCA/60 — Occurrence reporting and just culture as key enablers](https://www.icao.int/sites/default/files/APAC/Meetings/2025/2025%20DGCA60/Agenda%20Item03-Aviation%20Safety/60-DP-03-06%20OCCURENCE%20REPORTING%20AND%20JUST%20CULTURE%20AS%20KEY%20ENABLERS%20TO%20SAFETY%20IMPROVEMENT.pdf)
- [KCAA — Advisory Circular CAA-AC-SMS004A, Mandatory Occurrence Reporting (January 2023)](https://www.kcaa.or.ke/sites/default/files/circulars/CAA-AC-SMS004A-MANDATORY-OCCURRENCE-REPORTING_January_2023.pdf)
- [KCAA — Published Regulations 2025](https://www.kcaa.or.ke/published-regs-2025)
- [KCAA — Safety Management Systems manuals](https://www.kcaa.or.ke/legislation-publications/manuals/safety-management-systems-manuals)
- [EASA — Regulation (EU) No 376/2014, Occurrence Reporting](https://www.easa.europa.eu/en/document-library/regulations/regulation-eu-no-3762014)
- [SKYbrary — Regulation 376/2014](https://skybrary.aero/articles/regulation-3762014-reporting-analysis-and-follow-occurrences-civil-aviation)
- [SMS Pro — pricing plans](https://www.asms-pro.com/pricing.aspx)
- [Aviation Safety Blog — Aviation SMS implementation challenges for small service providers](https://aviationsafetyblog.asms-pro.com/blog/challenges-managing-aviation-sms-programs-at-small-airlines-airports)
- [Aviation Safety Blog — 7 reasons why your aviation SMS implementation isn't working](https://aviationsafetyblog.asms-pro.com/blog/why-your-aviation-sms-implementation-isnt-working)
- [eAviora — Best aviation safety management software for airlines in 2026](https://eaviora.com/insights/best-aviation-safety-management-software-2026)
- [SKYbrary — ICAO Safety Management Manual Doc 9859](https://skybrary.aero/articles/icao-safety-management-manual-doc-9859)
- [Rohit Raj — Offline-first PWA patterns: service workers, IndexedDB, Background Sync](https://rohitraj.tech/en/notes/pwa-offline-sync)
- [techbuild.africa — Why building for low-bandwidth users is essential to Africa's digital economy](https://techbuild.africa/low-bandwidth-product-design-africa/)
- [FAA — Safety Management System, specifics by aviation industry type](https://www.faa.gov/about/initiatives/sms/specifics_by_aviation_industry_type/design_and_manufacturing_organizations)
- [FAA — Part 5 FAQ from industry](https://www.faa.gov/media/96306)
- [EASA — Occurrence reporting FAQs](https://www.easa.europa.eu/en/the-agency/faqs/occurrence-reporting)
- [EASA — ECCAIRS 2](https://www.easa.europa.eu/en/node/143347)
- [EASA — Part-ORO, AMC and GM](https://www.easa.europa.eu/en/acceptable-means-compliance-and-guidance-material-group/part-oro-organisation-requirements-air)
- [EASA — Easy Access Rules for Occurrence Reporting (Reg. (EU) 376/2014)](https://www.easa.europa.eu/en/downloads/119244/en)
- [EASA — Safety management toolkit for non-complex operators](https://www.easa.europa.eu/en/document-library/general-publications/ehest-safety-management-toolkit-non-complex-operators-2nd)
- [CASA — Advisory Circular AC 119-01, safety management systems](https://www.casa.gov.au/safety-management-systems-air-transport-operations)
- [CASA — Resource kit to develop your safety management system](https://www.casa.gov.au/resources-and-education/publications/industry-guides/safety-kits/resource-kit-develop-your-safety-management-system)
- [CASA — Guide to sample SMS manuals, Part 119 and Part 138](https://www.casa.gov.au/sites/default/files/2026-05/guide-safety-management-system-sample-manuals-smsm-part-119-part-138-casr.pdf)
- [SKYbrary — SMS and SSP reference library](https://skybrary.aero/articles/sms-and-ssp-reference-library)
