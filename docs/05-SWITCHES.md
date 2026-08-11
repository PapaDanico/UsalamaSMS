# Claims with an expiry date

*Companion to `docs/DIAGNOSTIC-CHARTER.md`. Ported from Kanda's
`05-SWITCHES.md`, which exists because a product's most dangerous
statements are the true ones that quietly stop being true.*

Every claim below is accurate on **11 August 2026** and will not stay
accurate on its own. Each has a flag that controls it, an owner, and a
test that fails when the claim rots. A claim without all three is a
comment.

---

## 1. The provisional jurisdictions

**The claim:** UsalamaSMS computes the mandatory occurrence reporting
deadline for Kenya, Uganda, Tanzania, Rwanda and the EU.

**Why it expires:** only two of those five have been read against the
primary instrument. Kenya's row comes from KCAA Advisory Circular
CAA-AC-SMS004A (January 2023) — 24 hours, from awareness. The EU row
comes from Regulation (EU) No 376/2014 Article 4(6) — 72 hours, from
awareness. **Uganda, Tanzania and Rwanda are carried at the ICAO-common
72 hours as a placeholder and have not been verified.**

This is the most dangerous entry in this file, because a wrong reporting
deadline is worse than no deadline: an operator without the tool knows
it does not know.

**The flag:** `MOR_OBLIGATIONS[j].note` beginning `PROVISIONAL` in
`packages/shared/src/regulations.ts`, surfaced by `isProvisional(j)`.

**What must happen:** obtain the current UCAA, TCAA and RCAA safety
management regulations; set `hours`, `clockStart`, `instrument` and
`verifiedOn` from the text; delete the `PROVISIONAL` prefix.

**The test that stops it rotting:** `tests/safetycritical.test.ts` —
*"marks unverified jurisdictions as provisional rather than as fact"*
asserts `isProvisional` is **true for exactly UG, TZ and RW** and false
for KE and EU. Verifying a row without deleting the prefix fails the
build; deleting the prefix without verifying fails it too, until the
test's expectation is updated deliberately.

**Owner:** whoever ships the first non-Kenyan customer. Before, not
after.

---

## 2. The staleness of every regulatory row

**The claim:** each obligation carries `verifiedOn` and a
`reviewCycleMonths`, and `isStale()` reports when a row has outlived its
publisher's own revision cycle.

**Why it expires:** it is designed to. That is the point — this is the
one switch that is supposed to trip.

**The flag:** `isStale(obligation, new Date())`.

**What must happen when it trips:** re-read the instrument, update
`verifiedOn` whether or not anything changed. A row re-confirmed
unchanged is still newly verified, and recording that is the difference
between "checked last month" and "written three years ago and never
looked at".

**The test:** `tests/safetycritical.test.ts` — *"measures staleness
against the publisher's own cycle"*. Charter rule 5.

---

## 3. Annex 19 Amendment 2 is described in the future tense

**The claim:** `docs/01-RESEARCH.md` and `docs/02-STRATEGY.md` both
describe Amendment 2 as forthcoming, with applicability on **26 November
2026**, and treat "born after the amendment" as a differentiator.

**Why it expires:** on 26 November 2026. After that date the positioning
sentence *"every incumbent is retrofitting this"* weakens every quarter,
and by roughly 2028 it is false — the incumbents will have shipped it.

**The flag:** the date itself. There is nothing to compute; the calendar
does it.

**What must happen:** by Q1 2027 the strategy's headline claim moves
from *"native to the new standard"* to whatever is then true — most
likely accumulated operator-years of safety intelligence, which is a
data-moat claim rather than a compliance one.

**The test:** none, and that is a gap this file records rather than
hides. A doc-level claim about market timing cannot be asserted in a
unit test without inventing a fact for the test to read. The mitigation
is that it is written down here with its expiry date on the face of it.

---

## 4. The de-identification promise

**The claim:** `deIdentify()` removes registrations, flight numbers,
dates, times, phone numbers, emails, URLs, coordinates, licence and
staff numbers, and titled names across eleven East African and adjacent
registration prefixes.

**Why it expires:** two ways. New prefixes and formats appear. And more
importantly, the claim is routinely *over-read* — "the system
de-identifies reports" is how it will be described in a sales meeting,
and that sentence is false in a way that can identify a reporter.

**The flag:** `DeIdentResult.cleanByPattern`, and the
`ResidualIdentifiersError` that `deIdentifyVcr()` throws when the
scrubber found something it could not confidently remove.

**What must not happen:** the mandatory-review step must never become
skippable, and `reviewerAcceptedResidual` must never default to `true`.
It is friction on purpose. The alternative is distributing whatever the
regexes happened to leave.

**THE CORPUS IS SYNTHETIC, and this is the part with an expiry date.**
`tests/deident-corpus.test.ts` holds twenty clean narratives written to
the phrasing of real occurrence reports. They are invented. The suite
therefore proves the module handles aviation *vocabulary*; it does not
prove the module handles how any particular operator's staff actually
write — and staff write in dialect, in Swahili-English code-switch, with
local aerodrome nicknames and abbreviations no glossary contains.

**What must happen:** replace the clean corpus with 15–20 anonymised
fragments from the design partner before the first VCR is distributed to
anyone outside the originating operator. Until then the residual review
is doing more of the work than the patterns are, and that is the correct
balance to be at — but it should be a known one.

**The test:** `tests/confidentiality.test.ts` — *"REPORTS the surname it
cannot remove instead of pretending it did"* and *"flags
self-identification by uniqueness of role"*. Both assert the module
declares failure on inputs it genuinely cannot handle. If someone
"improves" the scrubber until those tests pass by actually removing the
text, the tests should be re-examined rather than deleted: the second
one asserts a limit no regex removes.

---

## 5. Anonymous reporters authenticate, and the server discards it

**The claim:** a report filed anonymously cannot be traced to the person
who filed it.

**How it actually works, stated plainly because the difference matters:**
the reporter authenticates normally. The server verifies they belong to
the organisation, and then *deliberately does not write* their identity —
`reporterId` is null, the sync receipt stores neither `userId` nor
`deviceId`, and the audit entry records the action without the actor.

**Why it expires:** the anonymity rests on **server code continuing to
behave**, not on the identity being absent. Every new write path that
touches a report is a new opportunity to persist the token holder by
accident, exactly as the sync receipt did. The guarantee is one
`prisma.create` away from being false, forever.

The considered alternative was an unauthenticated endpoint with a
per-org submission secret, where the identity genuinely never reaches
the server. It was not chosen: it forfeits rate limiting and abuse
control on the one endpoint that must stay open, and a shared secret
distributed to every employee leaks. The trade is real and it was made
with open eyes.

**The flag:** `isAnonymous` on the report, and the ternaries that read it
in `apps/api/src/routes.sync.ts`.

**What must happen:** every new write path that touches a `SafetyReport`
gets a test in `tests/confidentiality.test.ts` asserting it writes no
identifier when `isAnonymous` is true — added in the same change, not
afterwards. And when a design partner is live, revisit whether the
operator trusts server behaviour enough for this to remain the answer.

**The test:** `tests/confidentiality.test.ts` — the source-level guards
under *"anonymous reporting cannot be reversed by a join"*. They are
narrow by construction and they only cover the paths that exist today.

---

## 6. Icons are SVG only, so iOS gets no home-screen icon

**The claim:** `docs/04-BRAND.md` describes an icon suite generated from
one geometry source, and `scripts/build-icons.mjs` generates it.

**Why it expires:** the suite is **SVG only**. Chrome and Android accept
SVG icons in a web app manifest; iOS does not, and an iPhone user who
adds UsalamaSMS to their home screen gets a screenshot tile rather than
the mark. Rasterising needs a browser or an image library — Kanda gets
PNGs nearly free because it already carries Playwright for
pre-rendering, and this project carries neither and did not add a
200-package dependency to produce six files.

**The flag:** the absence of `*.png` under `apps/web/public/icons/`, and
the absence of an `apple-touch-icon` link in `index.html`.

**What must happen:** before any iOS user is asked to install this,
either add Playwright as a build dependency and rasterise (Kanda's
`scripts/build-icons.mjs` is the reference) or commit hand-produced PNGs
and accept that they are generated artefacts nobody can regenerate —
which the brand document explicitly forbids, so the first option is the
real one.

**The test:** none yet, and it is named here rather than hidden. The
honest guard would assert that the manifest's icon list matches the
files on disk; worth adding to `scripts/check-claims.mjs` when the PNGs
land.

---

## 7. The stand-in typeface

**The claim:** `docs/04-BRAND.md` states the licensed geometric sans is
not in this repository and Inter is a documented stand-in.

**Why it expires:** when the licensed family arrives.

**The flag:** the `@font-face` sources in `apps/web/src/fonts.css`.

**What must happen:** replace the sources. Nothing else — no call site
names a family directly; every rule reads `--us-font`.

**The test:** `scripts/check-brand.mjs` asserts tokens, not faces, so
this one is guarded by the token indirection rather than by an
assertion. Named here so the swap is known to be a one-file change
rather than discovered to be a forty-file one.

---

## 8. The unwritten counts

**The claim:** charter rule 10 — counts about the product are computed,
not typed.

**Why it expires:** it has not been earned yet. This repository currently
has no marketing surface making numeric claims, so there is nothing to
compute and `scripts/check-claims.mjs` has little to do. The first
landing page that says "eleven registration prefixes" or "five
jurisdictions" is where the rule starts to bite.

**What must happen:** before any such page ships, the number must derive
from `MOR_OBLIGATIONS` / `REGISTRATION_PREFIXES` and the build must fail
if it is written by hand.

**The test:** `scripts/check-claims.mjs`, which today asserts the
registries are non-empty and internally consistent, and which must grow
an assertion per public claim as claims appear.
