# Open work, as at 14 August 2026

Written because a session's worth of findings that live only in a chat
log are findings that get lost. Everything here came out of one working
day; the task list holds most of it, and the items in §1 are the ones
that were **only** ever spoken about and have no other home.

Ordered by what should be done first, with the reasoning, not by size.

---

## 1. Things with no other record — do these before anything new

### 1.1 The demo passwords are still live · SECURITY · oldest open item

Two demo credentials (`samuel@`, `amina@`) travelled through a chat log
during development. What was done at the time: every live refresh token
they held was revoked. What was **deliberately not** done: invalidating
the password hashes, because that locks the account holder out and it
was their call to make.

So the passwords are still valid. `npm run seed:demo -- --rotate`
exists precisely for this — it re-issues, revokes live sessions, and
prints the new password once into the terminal of whoever runs it.

**It must be run by a person, not by an agent**, because the new
password must not travel through a chat log the way the old one did.
That is the whole reason it prints to a terminal and stores nothing.

### 1.2 The privacy notice understates its own safeguard

Kenya's L.N. 32/2026, Third Schedule, paragraph 3.1 Note 2 names
**de-identification** as an authoritative safeguard for protecting
safety data. The privacy notice says the weaker "we de-identify".
Naming the instrument is both more accurate and stronger. Cheap.

### 1.3 The C-01 re-identification check passed vacuously

The join that would surface a re-identifiable reporter returned nothing
against production — but `SyncReceipt` is empty, so it had nothing to
join against. That is a **vacuous pass** and was never reported as
confirmation. It needs re-running once there is real receipt data, or a
seeded fixture that proves the join can fail.

### 1.4 usalamasms.com cannot be fetched from this environment

An organisation egress policy returns 403 for the live host. Every
deploy this session was confirmed against Netlify's own deploy record
naming the commit, which is the strongest evidence available here — but
nobody has loaded the live site and looked at it. Worth one human pass.

---

## 2. ICAO Annex 19 — 10.5 of 12

Nine built, three partial. What each partial actually lacks, in the
order I would take them:

### 2.1 Element 1.5 · SMS documentation — the biggest single gap

The product controls the REGISTER of documents; it does not store their
content, distribute them, or record who has read each one. This is also
the largest competitive gap: document control is Web Manuals' entire
business and one of Q-Pulse's differentiators.

The mechanism already exists — `PolicyAcknowledgement` records who has
read a safety policy. Extending that pattern to controlled documents is
the cheapest route to both the element and the benchmark.

### 2.2 Element 1.4 · Emergency response planning

The product records that an operator EXERCISED a plan; it does not hold
the plan, or the contact directory behind it. Scope carefully: the
valuable half is the **contact directory** (who to call, in what order,
with what authority), not a document editor.

### 2.3 Element 4.1 · Training — needs an infrastructure decision first

The matrix now anticipates: every row is current, lapsing soon or
lapsed, against a window proportional to its own validity. What it does
not do is **arrive**. Closing this needs email or web-push — a
provider, a sender domain, deliverability — which is a decision about
infrastructure and cost, not a coding task. Do not start it until that
decision is made.

---

## 3. Extracted from the UK Military Aviation Authority

Researched this session. ALARP is already implemented and enforced — a
TOLERABLE risk is refused without an `alarpJustification` — so that
part is already aligned.

### 3.1 The Duty Holder escalation · the strongest single idea available

The MAA does not merely require a risk to have an owner. It requires
that **who is permitted to hold a risk is a function of how bad the
risk is**: a Delivery Duty Holder may carry some, worse escalates to
Operating, then Senior. You cannot accept a red risk at a junior level,
structurally.

UsalamaSMS has `owner` on the register and on change assessments, as
free text against a post. There is no rule saying *this band requires
that level of authority*. That rule is implementable today from
`SAFETY_ROLES` × `tolerability()` and would be a genuine
differentiator — it is the kind of substance the incumbents do not
have in the small-operator segment.

### 3.2 Risk-based assurance / the risk picture

The oversight body builds an aggregate risk picture from reports. For
this product that is a dashboard, and it also closes the
"real-time dashboards" gap against SMS Pro and Q-Pulse.

Sources: RA 1410 (Occurrence Reporting and Management), MAA Manual of
Air Safety, gov.uk "reporting air safety concerns".

---

## 4. Benchmark against the incumbents

Established this session against SMS Pro, Ideagen Q-Pulse, Vistair
Centrik and ASQS iQSMS.

| Capability | Them | Here |
|---|---|---|
| Occurrence reporting | yes | yes — **offline-first, which none of them do** |
| Risk register, matrix | yes | yes |
| SPI / KPI | yes, with dashboards | series yes, dashboard no |
| **Alerting / notification** | core to all four | **absent — §2.3** |
| Audit & finding / CAPA | yes | findings yes, no CAPA loop |
| Document control | yes | register only — §2.1 |
| ERP | yes | exercise only — §2.2 |
| Training records | yes | yes, anticipating, not arriving |

**The strategic read, unchanged: do not chase suite parity.** The
defensible position is the one none of them hold — the small African
operator, offline, with the regulator's actual instrument computed
rather than typed. Close the gaps that block *evidence*, not the ones
that block a feature comparison.

---

## 5. Product debt

- **No delete synchronisation.** An entry removed on one device
  reappears from the server on another. Deliberate and documented — the
  safe direction — but it needs a tombstone or a delete endpoint before
  more than one device per operator is realistic.
- **Which changes require an assessment** is not defined. The product
  assesses the change an operator brings it; it does not know that
  operator's threshold for significance, and guessing would either
  flood the register or miss the change that mattered.
- **Indicators are typed, not fed** from the reporting queue, so an
  indicator can disagree with the reports behind it.

---

## 6. The bundle, and the thing to watch

Total moved **408 → 420 KB in one session**, across five raises, each
with a receipt in `scripts/stamp-sw.mjs` and each defensible alone.
That is the shape of drift: no single step is the wrong call.

**ENTRY is the number that matters** and it held: 213.5 KB of 214, flat
all day and down once. A reporter at a strip downloads what they did
this morning; every kilobyte of growth is on screens only a safety
manager opens.

The rule, already written into the receipts: **entry beginning to track
total is the moment to take something out rather than buy more.** One
receipt this session misdiagnosed an 82-byte entry move as hoisting
when it was chunk-registry overhead — measure the built chunks before
believing any story about them, including one written in that file.

---

## 7. The design question that needs answering before design work starts

"Premium feel and look, in substance, ergonomics and aesthetics" can
mean two very different jobs:

- **Elevate the existing identity** — typography, density, motion,
  chart craft, within Warm Sand, no dark mode, colour never the only
  channel. Contained, and compatible with everything above.
- **Replace the identity.** Touches every screen, and would need the
  brand gate, the contrast assertions and the glyph checks revisited
  with it.

They are not the same size and the second should not be started by
inference. §3.1 and §5 are where "premium substance" actually lives;
the aesthetic pass is worth doing after, not instead.

---

## Keeping this file honest

It is a snapshot, not a standard. Delete an item when it is done rather
than ticking it, and add the date when something is learned that
changes an entry. A list that only grows is a list nobody reads — which
is the same failure mode as a gate that never goes red.

---

## 8. Research, 14 August 2026 — added as it was done

### 8.1 The MAA, second pass

The first pass surfaced only ASIMS and the DASOR. Pushed for more, and
**RA 1210 "Ownership and Management of Operating Risk (Risk to Life)"**
is where the transferable mechanism actually is:

> High and Medium risks are managed by the Operating Duty Holder; Low
> risks by the Delivery Duty Holder. Duty Holders assure themselves the
> risk is ALARP **and** the exposure is Tolerable.

Doc 9859 tells an operator what a risk IS and is close to silent on who
may carry it. **Shipped** as `packages/shared/src/holder.ts` — a floor
rather than a slot, stated rather than enforced, with the mapping
labelled as ours because RA 1210 governs UK military aviation and its
Duty Holder construct has no Kenyan civil equivalent.

**Still on the table from the MAA:** RA 1210 requires risk decisions to
be "recorded and communicated across all relevant stakeholders", and the
MAA aggregates DASORs into a **risk picture** for oversight. That is a
dashboard, and it is simultaneously the SMS Pro / Q-Pulse benchmark gap.
Next thing to take from them.

Sources: RA 1210 Issue 10; RA 1230; MAA01 Regulatory Principles.

### 8.2 Safety performance indicators — and a gap that is cheaper than recorded

ICAO's SMM gives only **generic** SPI examples; each organisation must
develop its own. Two consequences, and the second is a correction to
this document.

**A blank page problem this product already knows how to solve.** An
operator told to "define an indicator" faces the same blank page that
twelve elements presented, and the answer there was the templates
registry. Suggested starter SPIs, by operator type, would be the same
move. Published examples worth borrowing for a small operator: voluntary
reports per pilot per quarter, **time from report to closure**, squawk
rate per flight hour, MEL deferral rate, first-attempt check pass rate.

**AND THE §5 ENTRY ABOUT INDICATORS BEING TYPED RATHER THAN FED IS TOO
PESSIMISTIC.** Two of the most valuable SPIs in that list —
**report rate** and **time from report to closure** — are computable
from data the product ALREADY HOLDS: `SafetyReport.createdAt`, its
state transitions, and the org's own headcount. No new schema, no
typing, no reconciliation gap.

That reframes the work. "Feed indicators from the reporting queue"
sounded like a sync problem and was recorded as one. It is really a
**derived-indicator** problem, and the product's own charter rule 6 —
compute, never store — is exactly the shape of the answer. It should be
taken before any dashboard work, because a dashboard whose numbers are
typed is a dashboard nobody trusts twice.

Sources: ICAO Doc 9859 4th ed.; Flight Safety Foundation "Unleashing
SPIs"; EASA AloSP guidance.
