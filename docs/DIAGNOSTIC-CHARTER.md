# Diagnostic charter

**Version 2 · applies to Kanda Logistics Advisory, JK & Associates and UsalamaSMS**

Three platforms, three regulators, three audiences, one practice. They
share a set of promises about the instruments they run and about the
claims they print. They also differ in places, and the differences are
decisions rather than drift.

This document exists because the second sentence is unprovable by
inspection. Someone comparing the scorecards finds that one refuses to
score a half-finished questionnaire and another renormalises and prints
a confidence figure, and has no way to tell whether that is considered or
accidental. Written down, it is considered.

An identical copy of this file lives in every repository.

---

## What changed in version 2

Version 1 governed two products that computed on the device and
transmitted nothing. Rule 7 said so in those words: *nothing the user
types is transmitted.*

UsalamaSMS cannot honour that rule and cannot be built without breaking
it. A safety management system holds a hash-chained audit log a regulator
inspects, a triage queue several people work in turn, and records the
operator is legally required to retain. Every one of those is a server.

There were two honest ways to handle that. Declare UsalamaSMS outside the
charter — which would have made the charter a document about two
products that happen to share a stack, rather than about a practice. Or
notice that rule 7 was never really the principle: it was Kanda's
*mechanism* for a principle both products share, written down as though
it were the principle itself, because for two products it made no
difference.

The second reading is the true one, so rule 7 is restated below in terms
of what it was always protecting, and each product names the mechanism
that enforces it. Kanda's mechanism has not changed and its behaviour has
not changed. What changed is that the rule now says what it means.

That is the only amendment. Rules 1–6 and 8–11 are untouched.

---

## The shared rules

All three follow these. A change to any of them is a change to all
three.

**1. Answers score 0–4.** Every question, every domain, every platform.
An option carries an explicit score; nothing is inferred from position
in the list.

**2. Domain weights sum to exactly 100.** Checked in the build, not by
eye. Where weights are adjusted for the respondent, the adjusted set
sums to 100 too, and the apportionment is largest-remainder so no single
domain silently absorbs the rounding.

**3. Never report precision the instrument does not have.** This is the
rule the products implement differently, and the deviations section
below says how. What is common is the prohibition: none may present a
partial assessment as though it were complete.

**4. Every figure carries its date.** Benchmarks, market evidence,
regulatory status. A number without a date is a number nobody can judge.

**5. Staleness is measured against the publisher's own cycle.** An
annual survey at thirteen months has missed one edition; a quarterly
observatory at thirteen months has missed four. A flat threshold calls
those the same thing and they are not.

**6. Regulatory status is computed from today's date, never stored.** A
hardcoded status is how a product asks whether you are ready for an
obligation that lapsed eight months ago.

**7. The data promise is kept by a mechanism, not by a notice.**

Every one of these products asks someone to enter information they have
a reason to withhold — a haulier's true cost base, a carrier's load
factors, a first officer's account of what went wrong on the approach.
Each product makes a promise about what happens to it, and the promise
is worth exactly what enforces it. A privacy policy is not a mechanism.
A settings toggle is not a mechanism. A mechanism is something that
makes the bad outcome impossible or that fails loudly when it stops
working, and it is named per product below.

The honest corollary must be stated on the surface where the promise is
made, not two clicks away in a legal page — including when the corollary
is unwelcome. Kanda's is *nothing can be recovered for you either*.
UsalamaSMS's is *pattern-based de-identification is a strong first pass
and not a guarantee, so a person reviews every narrative before it is
distributed*.

| Product | Promise | Mechanism |
|---|---|---|
| Kanda | Nothing you type leaves the device | A content security policy that blocks every off-origin request, asserted in the build |
| JK & Associates | Nothing you type leaves the device | The same CSP, asserted the same way |
| UsalamaSMS | Your report reaches the safety office and nobody else; if you file anonymously, nobody can work out it was you | Tenant scoping in every query; hash-chained audit verified by content; no identifier column written for an anonymous report; de-identification that reports what it could not remove — all guarded in `tests/confidentiality.test.ts` |

**8. A refused storage write is reported to the user.** Reads that fail
return the empty default silently — that is a supported first-visit
experience. Writes that fail lose work, and the person must be told
while they can still act on it.

**9. Exports are stamped at the moment they are produced**, with the
register state that produced them. A PDF handed to a lender in November
states November.

**10. Counts about the product are computed, not typed.** Tool counts,
instrument counts, corridor counts, question counts. Anything a
marketing page asserts about the platform is derived from the same
registry the platform runs on, and the build fails if it is written by
hand.

**11. A check that stops checking must fail.** Every guard carries an
explicit branch for "the thing I examine is no longer here". Silence
from a guard whose subject has been deleted is indistinguishable from
success, which is worse than having no guard.

---

## Deviations, and why

Each product states its own. These are the checkable claims — each repo
guards its own entries against its own code, so a deviation cannot be
quietly abandoned or quietly adopted.

### Kanda: partial answers renormalise, and confidence falls

A corridor diagnostic is run at a border post, on a phone, by someone
who may not have all 32 answers and still needs a usable read. So the
index renormalises across the domains actually scored, and a confidence
figure falls instead of the score. An unanswered domain scored 0 at full
weight would be a made-up number.

*Guarded by:* `scripts/smoke.mjs` — a partial answer set produces an
index with confidence below 100.

### Kanda: questions can be marked not applicable

An operator with no bonded warehouse is not handed a middling mark for
something they do not do; the option removes the question from the base
entirely.

*Guarded by:* `scripts/smoke.mjs` — an N/A answer reduces the domain's
denominator rather than scoring zero.

### Kanda: weights calibrate to operator type

Four types — integrated, shipper, transporter, clearing agent. A shipper
who owns no trucks should not carry 14% on Fleet & transport. Deltas are
small by design so two operators' indices stay comparable.

*Guarded by:* `scripts/smoke.mjs` — every calibrated set sums to 100,
and calibration must NOT move the index when every domain scores the
same.

### JK: partial answers are refused outright

An airline health scorecard is read in a boardroom by a lender. A
part-answered scorecard flatters whoever filled the easy domains first,
so no index is shown until all 40 questions are in — the diagnostic page
and the venture dashboard both refuse, in the same terms.

This is the opposite remedy to Kanda's for the same problem, and it is
right for the same reason Kanda's is right: the use context differs. A
lender's boardroom will not tolerate a caveated number; a border post
cannot wait for a complete one.

*Guarded by:* `tests/e2e.mjs` — a partial answer set renders the empty
state, not a report.

### JK: weights calibrate to fleet type and operating model

Two axes rather than Kanda's one, because both are properties of the
carrier that no single calculation reveals. Kanda deliberately has no
mode axis: mode is already a per-run input there, and folding it into
the weights would let one variable move the answer twice.

*Guarded by:* `tests/audit.mjs` — the adjusted set sums to 100.

### UsalamaSMS: raw safety data is transmitted, and the promise moves

The sibling products keep everything on the device. This one cannot: an
occurrence report that stays on a phone has not been reported, and the
audit log a regulator inspects has to be somewhere the operator cannot
edit. So the boundary shifts from *the device* to *the tenancy*, and the
strongest available promise shifts with it — not "nobody sees this" but
"the safety office sees this, nobody else does, and if you filed
anonymously nobody can work out it was you."

That is a weaker promise honestly stated, which is worth more than the
strong one stated where it is not true.

*Guarded by:* `tests/confidentiality.test.ts` — an anonymous report
writes no `userId` and no `deviceId` to its sync receipt, the receipt's
uniqueness is scoped to the org rather than global, and the audit entry
records the action without the actor.

### UsalamaSMS: the risk scale is not a brand palette

Kanda's rule is that categorical colours carry no meaning and must never
signal good or bad. This product needs the inverse rule, because here
the colours *do* mean something and the brand palette cannot express it:
Deep Terracotta and Ochre Red are 1.40:1 against each other, so two
adjacent cells of a Doc 9859 matrix painted in them are, to a reader,
the same cell. The tolerability scale therefore uses two brand colours
and one colour that is deliberately not in the brand system at all,
separated in lightness rather than hue so it survives greyscale and
dichromacy.

*Guarded by:* `scripts/check-brand.mjs` — the three risk fills are
asserted against each other and again through protanopia, deuteranopia
and tritanopia simulation; Deep Terracotta appearing anywhere on the
scale is a build failure by name.

### UsalamaSMS: no dark scheme

Both siblings resolve every brand colour through a light/dark pair.
Kanda is read on a phone at a border post at night and needs it. This
product is read in a cockpit, a hangar office and a regulator's meeting
room, and a safety report that renders differently depending on an OS
setting is a safety report two people can describe differently. One
scheme, one rendering, one printed output — and, usefully, half the
contrast surface to keep correct.

*Guarded by:* `scripts/check-brand.mjs` — the gate asserts its own
assertion count, so a scheme quietly reintroduced without doubling the
sweep fails.

### UsalamaSMS: regulatory rows may be provisional, and must say so

Kanda's decision was Kenya deep first, with only Kenyan regulation
authoritative. This product serves an East African corridor from the
first release, because a Nairobi operator flies to Entebbe and Dar and
needs all three deadlines. Rows for jurisdictions not yet read against
the primary instrument ship marked `PROVISIONAL`, render differently,
and are never presented in the same typeface as a citation.

This is a deviation from rule 4's spirit rather than its letter — every
row still carries its date — and it is the deviation most likely to rot,
which is why it also appears in `docs/05-SWITCHES.md` with an owner.

*Guarded by:* `tests/safetycritical.test.ts` — every jurisdiction has an
instrument string and a verification date, and `isProvisional()` is
asserted true for exactly the unverified set.

---

## What is deliberately not shared

**The scoring engines themselves.** They are about forty lines each.
Merging them would couple products serving different regulators for
almost no saving, and the coupling is the expensive part: a change
correct for one becomes a regression in the other.

**Question counts.** 40 across 8 domains for an airline; 32 across 8 for
a corridor operator. They measure different things and the counts follow
the subject matter, not a house style.

**The storage stacks.** IndexedDB with a localStorage config layer on
one, localStorage alone on another, IndexedDB plus a server of record on
the third. That follows what each stores, not a preference. Rule 8 above
is the shared part — the policy, not the implementation.

**The safe-HTML templating.** `html.js` is copied between repositories
rather than packaged. It is ninety lines with no dependencies, and a
shared package would mean a version bump in one product could change
escaping behaviour in another without anyone reading the diff. Copies
that are read are safer here than a dependency that is not.

---

## Changing this document

A deviation added here without a guard is a comment, not a commitment.
Add the check in the same change, and watch it fail before trusting it —
see `docs/VERIFICATION.md` for the seven ways a guard in these
repositories has passed while the thing it guarded was broken.
