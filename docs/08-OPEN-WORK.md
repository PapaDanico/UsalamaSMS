# Open work, as at 14 August 2026

**Revised the same day, twice.** Sections 2, 4 and 5 were rewritten
after element 1.4 closed and the coverage figure moved to 11 of 12.
The file's own rule is to delete an item when it is done rather than
ticking it — followed here, except where a struck-through line records
something that was the largest gap in the product and should not simply
vanish.

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

## 2. ICAO Annex 19 — 11 of 12

**Revised 14 August 2026.** Ten built, two partial. Element 1.4 closed
that day — the contact directory shipped, and it was scoped exactly as
this section said to scope it: who to call, in what order, with what
authority, and NOT a document editor. The remaining two:

### 2.1 Element 1.5 · SMS documentation

Distribution landed — `DocumentAcknowledgement`, keyed on the REVISION
rather than the document, so reading revision 3 does not mark anybody
as having read revision 4. What is still missing is the CONTENT: the
product controls the register and the distribution record, not the
manual itself.

Whether that is worth closing is now a real question rather than an
obvious yes. Document control is Web Manuals' entire business and a
Q-Pulse differentiator, so it is a competitive gap — but the same
argument that kept the ERP document out of 1.4 applies here, and it
applied well. A place to type a manual would be a worse version of the
file an operator already keeps.

### 2.2 Element 4.1 · Training — the infrastructure decision is made

The matrix anticipates: every row is current, lapsing soon or lapsed,
against a window proportional to its own validity. What it does not do
is **arrive**.

**DECIDED 14 August 2026: SMS delivery**, not email and not web push.
It is the only channel that reaches somebody without a smartphone,
which is the operator this product is for. Africa's Talking over Twilio
for a Kenyan operator, on cost and on sender-ID turnaround.

What is still needed is not a coding task and must not be done by an
agent: a sender ID registration and API credentials. **Credentials do
not travel through a chat log** — same rule as the database password,
see §1.1. Until a person does that, 4.1 stays partial and the coverage
figure caps at 11.5 of 12.

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

**Revised 14 August 2026.** Four of the eight rows moved in one day.

| Capability | Them | Here |
|---|---|---|
| Occurrence reporting | yes | yes — **offline-first, which none of them do** |
| Report disposition | yes | yes — triage → investigate → close/reopen, verified moves |
| Risk register, matrix | yes | yes |
| SPI / KPI | yes, with dashboards | **yes, with a dashboard** |
| **Alerting / notification** | core to all four | **absent — §2.2, now unblocked** |
| Audit & finding / CAPA | yes | **yes** — actions with owner, date, separate verification |
| Document control | yes | register + distribution; not content — §2.1 |
| ERP | yes | **exercise + contact directory** |
| Training records | yes | yes, anticipating, not arriving |
| **Owner seniority vs risk band** | **none of them** | **yes — RA 1210** |

That last row is the one to defend in a sale. Every incumbent shows a
register by band; none asks whether the name in the owner box is senior
enough to carry the row, because Doc 9859 does not ask it and RA 1210
does.

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
- ~~A report can never leave `SUBMITTED`.~~ **Closed 14 August 2026.**
  Five states, four unreachable, no route writing the column. The
  transition history now exists and time-to-closure is derived from it,
  from the FIRST closure.
- **Indicators are still typed, not fed** from the reporting queue, so
  an indicator can disagree with the reports behind it. Report rate is
  derivable today and is not yet wired to the indicator screen — the
  risk picture computes it, the SPI screen does not read it. That seam
  is the next cheap thing.
- **Nothing verifies a contact automatically.** The directory computes
  staleness but nobody is told about it unless they open /sms. Same
  shape as 4.1's training warning, and it is closed by the same SMS
  channel.

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

### 8.3 Correcting §8.2, the same day — half of it was wrong

Written above: report rate and time-to-closure are both computable from
"`SafetyReport.createdAt`, its state transitions". I went to implement
it and **there are no state transitions.** Checked, not assumed:

- `ReportState` has five values — `SUBMITTED`, `TRIAGED`,
  `UNDER_INVESTIGATION`, `ACTIONS_OPEN`, `CLOSED` — and the schema
  defaults to `SUBMITTED`;
- **no route anywhere writes that column.** `routes.sync.ts` maps
  `safetyReport:UPDATE` to a `report.triage` permission, and the branch
  that would use it falls through to `rejected` with the comment
  "field-level update handlers are added per entity. Until one exists
  for this entity, the honest answer is rejected";
- the /triage screen's `state` filter is `syncState` — queued or synced
  on the handset — not `ReportState`. Different column, same word;
- so **every report in the system is `SUBMITTED` and always will be.**
  Four of the five states are unreachable.

**Report rate survives** — it is a count of `createdAt` over a period
against the operator's own exposure, and that needs nothing new.
**Time-to-closure does not**, because nothing ever closes. Building an
indicator on `updatedAt` would be worse than not building it:
`updatedAt` also moves when a report is de-identified, so the number
would silently measure the safety office's redaction turnaround and
present it as investigation speed.

**And the larger finding is not the indicator.** A reporting system
where a report arrives and is never dispositioned is the filing cabinet
`spi.ts` already warns about, one layer down. Element 2.1's own
evidence line asks for "a report rate per 1,000 hours or per departure
that is trending"; you cannot trend a queue that only grows. The
coverage entry for 2.1 now says this in `missing` rather than leaving
it to be discovered.

**Ranked above the dashboard, and above the derived indicators**, since
both of those need a disposition to describe. What it needs: a
transition route that records who moved a report, from which state to
which, and when — the transition being the record, not a `closedAt`
column, because a column answers "when" and an inspector asks "by whom,
and what did you do".

### 8.4 A coverage-page defect found by looking for this one

Element 2.1 read "the answers are the operator's own to write down
elsewhere until this holds them" **one commit after
`/api/v1/sms/voluntary` shipped and held them.** The 2.2 defect again —
understating the product on the one surface whose job is honest
disclosure — and the route gate written to catch 2.2 could not see it,
because that gate starts from the routes an entry NAMES and 2.1 named
none for the capability.

Silence is the cheaper way to understate: 2.2 had to write three false
clauses, this one only had to leave a sentence alone. The gate now also
runs in reverse — **every route the API registers must be named by some
element, be a sub-path of one, or sit in an exemption list with a
stated reason** — and mutation-checked by putting the defect back.
