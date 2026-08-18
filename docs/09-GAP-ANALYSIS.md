# Gap analysis — every angle, 14 August 2026

`docs/08-OPEN-WORK.md` is a snapshot of what is open. This file is a
different instrument: a **systematic sweep across every dimension the
product can be wrong in**, whether or not anybody has raised it.

The distinction matters because the two find different things. An
open-work list finds what somebody noticed. A dimensional sweep finds
what nobody looked at — and in this repository the most expensive
defects have all been in that second category: a capability with no
reachable surface, a check that could not fail, a notice rendered
behind a collapsed disclosure triangle.

**Every figure here is computed or cited, never typed from memory.**
The load-bearing ones are asserted in `scripts/check-claims.mjs`, so
this file goes stale loudly rather than quietly. Where a number is
descriptive rather than load-bearing it is marked *(as at this date)*.

---

## How a gap is graded

Two axes, and they are deliberately not combined into one score — the
same reason `maturity.ts` refuses to average the twelve elements into
a percentage.

| Grade | Means |
|---|---|
| **BLOCKING** | An operator cannot rely on the product for something it claims. Ship-stopping. |
| **MATERIAL** | Real, costs a sale or an evidence trail, does not make the product wrong. |
| **BOUNDED** | Known, deliberate, documented, with the reason recorded. Not debt. |
| **WATCH** | Not a gap today. Named because the conditions that would make it one are foreseeable. |

A **BOUNDED** row is not a to-do item. It is a decision with its
reasoning attached, recorded so nobody re-opens it as an oversight —
the same discipline as the twenty-six RLS advisor notices in
`CLAUDE.md`.

---

## 1. ICAO Annex 19 — the twelve elements

**12 built, 0 partial. Coverage 12 of 12**, computed as
`built + partial/2` in `coverageSummary()`, never typed.

1.5 and 4.1 were the last two. 1.5 gained the document itself — the
register held the control and not the file, so "show me revision 3"
went to a shared drive. 4.1 gained the warning BEFORE expiry, delivered
by the daily digest rather than shown to whoever opens the screen.

| # | Element | State | The gap |
|---|---|---|---|
| 1.1 | Safety policy and objectives | BUILT | — |
| 1.2 | Safety accountability and responsibilities | BUILT | — |
| 1.3 | Appointment of key safety personnel | BUILT | — |
| 1.4 | Coordination of emergency response planning | BUILT | — |
| 1.5 | SMS documentation | **PARTIAL** | Register and distribution held; **content is not** |
| 2.1 | Hazard identification | BUILT | — |
| 2.2 | Safety risk assessment and mitigation | BUILT | — |
| 3.1 | Safety performance monitoring and measurement | BUILT | — |
| 3.2 | The management of change | BUILT | — |
| 3.3 | Continuous improvement of the SMS | BUILT | — |
| 4.1 | Training and education | **PARTIAL** | The matrix anticipates; **nothing arrives** |
| 4.2 | Safety communication | BUILT | — |

### 1.5 · SMS documentation — BOUNDED, and the reasoning is contested

The product holds the controlled document register (reference,
revision, approver, review date) and the distribution record
(`DocumentAcknowledgement`, keyed on the **revision** so reading
revision 3 does not mark somebody as having read revision 4). What it
does not hold is the manual itself.

The case for leaving it: a place to type a manual would be a worse
version of the file the operator already keeps, and the same argument
correctly kept the ERP document out of element 1.4.

The case against: document control is Web Manuals' entire business and
a Q-Pulse differentiator. This is the one **BOUNDED** row that a
competitor can attack directly.

The resolution is neither — it is that *control* and *authoring* are
different products, and this one does control. Closing 1.5 to BUILT
means holding the content, and the honest reading is that doing it
badly would be worse than the partial.

### 4.1 · Training — BLOCKED ON A HUMAN, not on code

The matrix computes current / lapsing / lapsed against a window
proportional to each record's own validity. The decision is made — **SMS
delivery** via Africa's Talking, chosen because it reaches an operator
without a smartphone, which is the operator this product is for.

What is missing is a sender-ID registration and API credentials. **These
must not travel through a chat log** — same rule as the database
password. Until a person does that, 4.1 stays partial and coverage caps
at 11.5 of 12.

**This is the single highest-leverage unblocked item in the product**,
because it is not one gap. Alerting is the row every incumbent has and
this one does not, and it closes four things at once: training expiry,
stale emergency contacts, MOR deadline approaching, and CAPA overdue.

---

## 2. Regulatory

### 2.1 · One jurisdiction, and that is the largest strategic gap · MATERIAL

`MOR_OBLIGATIONS` carries **two rows: an ICAO baseline and Kenya.**
Kenya's is read against the primary instrument — L.N. 32 of 2026, with
regulation 12(1)'s three class-dependent periods (24 / 48 / 72 hours)
computed rather than typed, and gazettement recorded separately from
the date it was last verified.

Three provisional rows were **removed** rather than left showing
guidance as compliance, and that was the right call.

But the strategy is African operators, and one country is one country.
Tanzania, Uganda, Rwanda, Ethiopia, Nigeria, Ghana and South Africa are
each a row plus the reading of a primary instrument. The engine is
built and date-aware; what it lacks is rows.

**The constraint is not engineering, it is that somebody has to read
each instrument** — and the repository's own rule is that a figure
which has not been read against the primary source does not enter the
registry. That rule should not bend for market coverage.

---

**UPDATE, 18 AUGUST 2026 — THE GAP HAS A SECOND SHAPE, AND IT SHIPS.**

Everything above stands for the reporting deadline, which is a figure
the product ASSERTS and must therefore have read. It does not follow
that every regulated figure has to be asserted.

Fatigue was built on the opposite footing and it is now charter rule 12:
where the instrument has not been read, **the operator declares the
figure and names its source**. Kenya's flight and duty time limits could
not be read — `kcaa.or.ke` is blocked at the egress proxy and the
numbers did not come back from search — so no limit table ships for any
State, and the operator states what binds it.

That answers this gap for a whole class of figure without reading
anything, and it is better than a table rather than a substitute for
one. An operator whose AOC conditions are tighter than the regulation is
measured against what actually binds it; one whose operations manual
promises more than the law is held to its own promise; and an operator
in Tanzania or Nigeria is served on the day it signs up.

**It does NOT dissolve the gap, and the distinction is the whole
point.** A reporting deadline runs a countdown and drives a
notification — the product is telling the operator what the law
requires, so the product has to have read the law. A duty limit is a
comparison the operator asked for against a figure the operator
supplied. The first cannot be delegated; the second never should have
been asserted.

So the grading stands at MATERIAL for `MOR_OBLIGATIONS`, and the
question for each new capability is now which of the two shapes it has
before any instrument is opened.

### 2.2 · Annex 13 notification — CLOSED, 14 August 2026

The report form now tells a reporter that an accident or serious
incident is notified to the accident **investigation** authority
immediately, and that this is not the deadline shown beside it. No
telephone number is in the bundle, asserted twice and both
mutation-checked.

### 2.3 · The domestic instrument implementing Annex 13 is unread · BOUNDED

`accidentNotification.domesticInstrumentRead` is `false` for Kenya, and
says so in the type. The duty is certain because Annex 13 is; the
domestic regulation that gives it effect has not been read here. Stated
rather than assumed — the same discipline as `governedByUnread`.

### 2.4 · Occurrence coding — CLOSED, 14 August 2026

The product classifies a report with its own six types. That is not what
a State files. ICAO's ADREP taxonomy, maintained by EASA as ECCAIRS,
with occurrence categories from the CAST/ICAO Common Taxonomy Team, is
how every State classifies an occurrence when reporting to ICAO — and
`cictt.ts` carried those codes while being imported by nothing at all.

It is now a column on the report, written by the safety office at
disposition and correctable afterwards through a verb of its own.
**Coding is not a state change**: a report closed last month and coded
wrongly has to be fixable without reopening and re-closing it, which
would leave two transitions in the history describing an investigation
that never happened.

**On the triage screen and not on the report form**, which is both the
right product decision and the right engineering one. Coding to ADREP is
a trained judgement made after reading a narrative; a reporter at a
strip has not made it, for the same reason the form does not ask whether
an event meets Annex 13's definition of an accident. It also keeps a
seven-kilobyte taxonomy out of the one chunk that reporter downloads —
entry held flat at 214.8 KB across the change. When the product answer
and the budget answer agree, the reasoning is usually right.

**More than one code, because that is the taxonomy's own rule.** CICTT's
usage notes are explicit that a runway excursion which became a loss of
control is coded as BOTH. A smoke check ticks a second category on a
report that already carries one and asserts both reach the wire —
mutation-checked by making the picker replace rather than add, which is
exactly the defect a naive "the new code was sent" assertion would miss.

**What is still partial, and says so on screen.** The module carries
codes and published names but *not* definitions, and declares
`CICTT_VERIFIED_AGAINST_PRIMARY = false`. A definition decides the
borderline case; paraphrasing one from a secondary source would look
authoritative and classify a marginal occurrence wrongly. The caveat is
rendered in the picker itself, where somebody is choosing — asserted,
and mutation-checked by deleting it.

An unknown code is **recorded and reported, never refused**. The list is
incomplete by admission, so a legitimate CICTT code this build lacks is
a gap in the software, not an error in the report.

### 2.5 · Voluntary reporting — CLOSED

Regulation 13(3)'s six required definitions are held and the screen
says which are undefined rather than leaving a blank read as "none".

---

## 3. Evidence and assurance

This is the dimension the product is strongest in, and it is worth
naming why: it is the one an auditor tests.

| Mechanism | State |
|---|---|
| Append-only audit chain, transaction-scoped advisory lock | Built, safe under transaction pooling |
| De-identification, with a corpus test for false positives | Built |
| Report disposition with recorded transitions | Built; time-to-first-closure derived |
| Deny-by-default RLS, no policies, no Data API grants | Built, and correct — see `CLAUDE.md` |
| Print attribution, or no header at all | Built and asserted |

### 3.1 · The C-01 re-identification check passed vacuously · MATERIAL

The join that would surface a re-identifiable reporter returned nothing
against production — but `SyncReceipt` is empty, so it had nothing to
join against. **A vacuous pass is not a pass.** It needs re-running
against real receipt data, or a seeded fixture proving the join *can*
fail.

This is the repository's own rule turned on itself: a check that cannot
fail is worse than no check.

### 3.2 · Nobody has used it · BLOCKING for the claim, not for the code

No real operator has filed a report. Every mechanism is tested; none is
*proven in service*. That is a different kind of confidence, and no
amount of test coverage substitutes for it.

---

## 4. Commercial and competitive

Benchmarked against SMS Pro, Ideagen Q-Pulse, Vistair Centrik and ASQS
iQSMS.

| Capability | Them | Here |
|---|---|---|
| Occurrence reporting | yes | yes — **offline-first, which none of them do** |
| Report disposition | yes | yes |
| Risk register and matrix | yes | yes |
| SPI / KPI with dashboards | yes | yes |
| Audit finding / CAPA | yes | yes |
| ERP | yes | exercise + contact directory |
| Training records | yes | yes, anticipating |
| **Alerting / notification** | core to all four | **absent** — §1, 4.1 |
| **Document content control** | yes | register + distribution only — §1, 1.5 |
| **Occurrence coding to ADREP/CICTT** | yes | **absent** — §2.4 |
| **Owner seniority vs risk band** | **none of them** | **yes** — RA 1210, `holder.ts` |

### 4.1 · The defensible row

Every incumbent shows a register by band. **None asks whether the name
in the owner box is senior enough to carry the row**, because Doc 9859
does not ask it and the UK MAA's RA 1210 does. `holder.ts` implements
it and the mapping is labelled as ours rather than passed off as ICAO's.

That is the row to defend in a sale, and it is substance rather than
positioning.

### 4.2 · There is no commercial layer at all · MATERIAL

No pricing, no billing, no plan tiers, no self-serve onboarding, no
trial provisioning. An operator cannot become a customer without a
human doing it.

For a design-partner phase that is correct and should not be built
early. It becomes **BLOCKING** the moment more than a handful of
operators are wanted, and it is named here so that transition is a
decision rather than a surprise.

### 4.3 · Per-tenant configuration — CLOSED, 14 August 2026

An operator now sets what it calls its posts, what its manual calls each
point on the severity and likelihood scales, which strips and aircraft
it actually operates, and its own default review cycle. Benchmarking
confirmed this is table stakes: incumbents let an operator tailor the
risk matrix and hazard categories without a vendor change order, and an
effective matrix is organisation-specific by definition.

**The question that mattered was not how much to configure. It was what
must never be configurable**, and it is answered structurally.

A label map is **keyed by the framework's own keys, and unknown keys are
dropped**. That single decision makes the scales relabellable and not
redefinable: an operator can call `A_CATASTROPHIC` whatever its manual
calls it, and cannot add a sixth severity, reorder the five, or change
what A × 5 scores. There is no representation in the configuration for
anything else.

The shape that would have been easy and wrong is storing the scale
itself as rows. A tenant with four severities makes `tolerability()`
index past the end of the matrix, and "what band is this" becomes a
question about whose database is being read. The arithmetic is this
product's central claim and it only holds if it is the same arithmetic
everywhere.

**Three gates hold the line rather than stating it.** No tenant field
may be *named* after a reporting deadline, a tolerability band,
de-identification, the audit chain or an element definition — checked
over the interface and the Prisma model, because the line is crossed by
a settings screen growing one more harmless field, not by anybody
deciding to cross it. `risk.ts` may not read the configuration at all.
And the allowed label keys must stay derived from the scales rather than
retyped, since a second key list goes stale the day a scale changes.

All three mutation-checked: a `morDeadlineHours` column, an import of
the tenant type into `risk.ts`, and a normaliser that trusts submitted
keys instead of the framework's.

The operator's own lists are **added to the shipped ones, never
replacing them** — an operator who adds one strip must not lose every
other aerodrome from a reporter's dropdown, and the first symptom of
that would be somebody unable to say where an occurrence happened.

## 5. Product and platform

| Gap | Grade | Note |
|---|---|---|
| ~~No delete synchronisation~~ | **CLOSED 15 Aug 2026** | A retraction is a tombstone: the row stays and stops counting, and the reporter who filed it is the only person who can withdraw it. An anonymous report cannot be retracted at all — there is no reporterId to match, which is the anonymity working rather than a gap. The export still carries a retracted report, deliberately: hiding one would make this a way to remove an inconvenient occurrence from what a regulator reads. `scripts/check-retraction.mjs` makes every read of the table say which side it is on. |
| Nothing notifies anybody of anything | **MATERIAL** | Stale contacts, lapsing training, approaching deadlines and overdue actions are all computed and none is delivered. One channel closes all four — §1, 4.1. |
| Which changes require an assessment is undefined | **BOUNDED** | The product assesses the change an operator brings it. Guessing an operator's significance threshold would either flood the register or miss the change that mattered. |
| The ERP document itself is not held | **BOUNDED** | A decision, recorded so it is not re-opened as an oversight. |
| No offline support beyond filing | **WATCH** | Filing works with no signal, which is the promise. The safety-office screens need a session and do not pretend otherwise. |

---

## 6. Quality, and the gates

| Gate | State *(as at this date)* |
|---|---|
| Unit tests | 423 passing |
| Smoke checks against the built bundle | 67 passing |
| Claims assertions | 73 |
| Brand assertions | 56, no dark scheme to double them |
| CSS classes emitted, all resolving to a rule | 255 |
| Dependency vulnerabilities, production | 0 |
| Entry bundle | 214.8 KB of a 215 KB budget |
| Total JS | 456.7 KB of 458 KB |

### 6.1 · Accessibility — SWEPT AND CLEAN, 14 August 2026

`npm run check:a11y` runs axe over every rendered screen at WCAG 2.2 AA,
in `verify`, against the built bundle. **20 screens, zero violations.**

The first run found **65**, and what it found is the argument for the
sweep existing. This product already asserted a great many
accessibility properties — a word beside every status colour, contrast
gated at 4.5:1, 24px targets, no sideways scroll at 320px, focus kept
when a row is removed. Every one of those is real, and none of them is
a sweep.

Two of the sixty-five were not low contrast but **invisible**:

- the safety risk assessment's "Not ready" reason — the sentence saying
  *why* an assessment cannot be accepted — at **1.02:1**, near-white on
  near-white;
- the risk calculator's caveat at **1.97:1**, a light-ground token
  rendering on the dark band.

Neither could have been found by adding assertions, because neither was
a declared pairing. Both were classes written for one surface and reused
on another months later. The brand gate checks the token pairs it is
given; it cannot check a pairing that only exists once a page renders.

The third finding was systemic and contradicted the product's own
stated rule. **Inline links were distinguished by colour alone** — teal
on body grey, 1.4:1 against each other, on 22 nodes across 11 screens —
in a product whose design principle is that colour is never the only
channel. The footer's legal strip had worked this out and fixed itself
in isolation, with the reasoning written down; nobody applied it to the
body copy, and no check knew the rule existed.

Routes are discovered from the architecture rather than listed, and the
gate refuses to pass on a crawl that finds almost nothing or a sweep
that reached no screen. The accepted-rules map is **empty**: all 65 were
fixed, none excused.

### 6.2 · The bundle is the thing to watch · WATCH

Entry held flat across a full session and came *down* when the notice
it was raised for was trimmed. The rule that made that happen is worth
restating: **a ceiling that stays where a raise left it, after the
thing it bought has shrunk, is a watermark and not a budget.**

Entry is the number that matters. A reporter at a remote strip pays for
it; a safety manager's screen does not.

---

## 7. Operational readiness

| Item | Grade |
|---|---|
| Demo passwords `samuel@` and `amina@` travelled through a chat log and are **still live** | **BLOCKING** |
| Nobody has loaded the live site | **MATERIAL** |
| No real operator has ever used it | **MATERIAL** |

The credentials item is first because it is the oldest open finding in
the product and the only one that is a live security exposure. Refresh
tokens were revoked; the password hashes were deliberately not
invalidated, because that locks the account holder out and it is their
call.

`npm run seed:demo -- --rotate` exists for exactly this. **It must be
run by a person, not an agent** — the new password must not travel the
way the old one did, which is why it prints to a terminal and stores
nothing.

The live-site item is an environment limit, not a deploy failure: an
organisation egress policy returns 403 for the host. Every deploy has
been confirmed against Netlify's own record naming the commit, which is
the strongest evidence available from here — but that is not the same
as somebody looking at it.

---

## 8. What this analysis says to do next

Ordered by leverage, not by size.

1. ~~**A person rotates the demo passwords.**~~ **Closed 15 August
   2026** on the owner's call — the demo credentials are not treated as
   sensitive. The mechanism was verified against a throwaway database
   and is ready if that ever changes; see `seed:demo -- --rotate`.
2. ~~**A person registers the sender ID.**~~ **Superseded 15 August
   2026.** The channel is email, `mail.ts` is configured, and the
   scheduled function sends at 05:00 UTC. What remains is a coding
   task — teaching the digest to carry the warnings that are computed
   and not yet delivered — rather than a registration blocked on a
   person. See §2.2 of docs/08-OPEN-WORK.md.
3. ~~**Delete synchronisation**~~ **Closed 15 August 2026** — a
   retraction is a tombstone with an audit entry, never a hard delete,
   and the export still carries a retracted report so it cannot be used
   to hide an occurrence from a regulator.
4. **A second jurisdiction**, when somebody can read the instrument.

Items 1 and 2 are not engineering and are the two that unblock the
most. That is the finding this analysis exists to surface: **the
binding constraint on this product is not code.**

---

## Keeping this file honest

Same rule as `08-OPEN-WORK.md`: delete a row when it closes rather than
ticking it, and date anything learned that changes an entry. The
computed figures are gated; the judgements are not, and they should be
re-argued rather than inherited.
