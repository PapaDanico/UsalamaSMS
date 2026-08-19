# Claims with an expiry date

*Companion to `docs/DIAGNOSTIC-CHARTER.md`. Ported from the sibling product's
`05-SWITCHES.md`, which exists because a product's most dangerous
statements are the true ones that quietly stop being true.*

Every claim below is accurate on **14 August 2026** and will not stay
accurate on its own. Each has a flag that controls it, an owner, and a
test that fails when the claim rots. A claim without all three is a
comment.

**A resolved switch is DELETED, not ticked.** One was, on 14 August
2026: *"Icons are SVG only, so iOS gets no home-screen icon"*, which
had stopped being true. The PNG suite shipped, `index.html` carries the
`apple-touch-icon`, and a smoke check asserts the manifest advertises
raster icons that exist — while this file still said the suite was SVG
only and that the test was *"none yet"*.

That is worth recording rather than quietly correcting. This document
exists because *"a product's most dangerous statements are the true ones
that quietly stop being true"*, and one of them was in here. A file that
catalogues rot is not exempt from it.

`scripts/check-switches.mjs` now runs in `npm run check`. It derives the
count on the README's front page rather than trusting it, refuses a
switch that declares no flag or no test, and fails the build when a
calendar expiry below has passed.

---

## 1. The jurisdictions that are NOT covered

**The claim:** UsalamaSMS computes the mandatory occurrence reporting
deadline for Kenya and the EU, and offers ICAO's baseline everywhere
else.

**What this entry used to say, and why it was wrong.** It used to claim
five jurisdictions: Kenya, Uganda, Tanzania, Rwanda and the EU — with
the middle three "carried at the ICAO-common 72 hours as a placeholder".
There is no ICAO-common 72 hours. ICAO Annex 13 requires notification
with a minimum of delay and names no period; Annex 19 requires the State
to run a mandatory reporting system and leaves the period to the State.
The 72 hours is the EU's own figure, from Regulation (EU) No 376/2014,
misattributed. So three rows of a compliance tool stated a deadline that
no instrument anywhere publishes, and the PROVISIONAL label made that
visible without making it any less false.

The three rows were removed and have now been re-added as properly
provisional entries: `hours: null`, no fixed period, ICAO Annex 13
baseline applies. Seven EAC member states (Uganda, Tanzania, Rwanda,
Burundi, South Sudan, DRC, Somalia) are now in the registry. Each
carries the operator's regulator — an operator knows which authority it
answers to — without asserting a period nobody has read from the
instrument.

**Why it still expires:** an operator in Uganda, Tanzania or Rwanda has
a real deadline set by its own authority, and this product does not know
it. The baseline is honest, not sufficient.

**The flag:** `MOR_OBLIGATIONS[j].note` beginning `PROVISIONAL` in
`packages/shared/src/regulations.ts`, surfaced by `isProvisional(j)` and
by `isProvisionalObligation(o)`.

**Provisional rows today: **7**.** `scripts/check-claims.mjs` compares
that figure against the rows the code actually marks, and fails in both
directions — an unverified row added without documenting it here, and a
row documented here that the code does not mark.

**What must happen** to add a jurisdiction: obtain that authority's
safety management regulations; set `hours`, `clockStart`, `instrument`
and `verifiedOn` from the text, not from a summary of it. A row that
cannot cite a numbered provision does not get a number — it gets `null`
and the ICAO baseline, which is what ICAO itself does.

**The test that stops it rotting:** `tests/safetycritical.test.ts` —
*"still MARKS a provisional row, now that no real one trips it"* runs
`isProvisionalObligation` against a synthetic row, because a guard with
no instances is a guard that can silently stop working, and five
assertions of `false` would pass just as happily against a function that
always returned it. Alongside it, *"gives ICAO NO deadline, because ICAO
publishes none"* fails the build if anyone gives the baseline an hour
figure.

**Owner:** whoever ships the first customer outside Kenya and the EU.
Before, not after.

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

<!-- EXPIRES: 2026-11-26 -->

**What must happen:** by Q1 2027 the strategy's headline claim moves
from *"native to the new standard"* to whatever is then true — most
likely accumulated operator-years of safety intelligence, which is a
data-moat claim rather than a compliance one.

**The test:** `scripts/check-switches.mjs` reads the `EXPIRES` marker
above and fails the build on 26 November 2026.

This entry used to read *"none, and that is a gap this file records
rather than hides"*, on the reasoning that a doc-level claim about
market timing cannot be asserted without inventing a fact for the test
to read. **That reasoning was wrong, and it was wrong in the way this
whole file is about.** No fact needs inventing: the expiry is a date,
today is a date, and the comparison is the entire test. What could not
be asserted was whether the *positioning* is still persuasive — a
judgement — and the impossibility of testing the judgement was allowed
to excuse not testing the date.

Re-verified on 14 August 2026 against ICAO's published adoption record
as reported by several States and vendors: adopted 23 June 2025,
effective 4 November 2025, applicable 26 November 2026, producing the
third edition. **The State Letter itself has not been read here** —
network egress from the build environment blocks icao.int and every
mirror tried — so these dates are corroborated across independent
secondary sources rather than taken from the primary. Same standard as
`CICTT_VERIFIED_AGAINST_PRIMARY` and `governedByUnread`: say where the
figure came from, and say what sits above it unread.

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

## 6. The stand-in typeface

**The claim:** `docs/04-BRAND.md` states the licensed geometric sans is
not in this repository and DM Sans — the face the JK & Associates platform
is set in — is a documented stand-in.

**Why it expires:** when the licensed family arrives.

**The flag:** the two `@font-face` sources in `apps/web/src/fonts.css`.

**What must happen:** replace the sources. Nothing else — no call site
names a family directly; every rule reads `--us-font`. If the licensed
family ships as statics rather than a variable face, the `font-weight:
400 700` range must become one rule per weight in the same change, or the
browser will synthesise the ones it cannot find. `npm run smoke` measures
that and fails, which is the point.

**The test:** `scripts/check-brand.mjs` asserts tokens, not faces, so
this one is guarded by the token indirection rather than by an
assertion. Named here so the swap is known to be a one-file change
rather than discovered to be a forty-file one.

---

## 7. The database exists; nothing serves it

**The claim:** UsalamaSMS has a hosted Postgres — Supabase project
`UsalamaSMS` (`wbixxhpaswstaphfsowz`, eu-north-1, Postgres 17), schema
applied, RLS deny-by-default on all nine tables.

**What that does NOT mean:** there is no deployed API. The database is
real and empty and nothing talks to it. A design partner still cannot
reach anything. The integration suite proves the code is correct against
Postgres; it says nothing about a running system.

**Why it expires:** two ways, and the first is live now.

*The API is deployed but not configured.* It ships as a Netlify
Function and answers `503 not_configured` until a connection string and
two secrets exist. That step cannot be scripted: Supabase does not
expose the database password through its management API, deliberately,
and a password routed through an agent, a chat log or a ticket has
already leaked.

This document previously said the Netlify Supabase extension avoided
that step, because it injects a variable called `SUPABASE_DATABASE_URL`.
It does not. On this project that variable holds
`https://wbixxhpaswstaphfsowz.supabase.co` — the REST API base — and
Prisma cannot connect to it. Both `core.ts` and the function now decide
on the **scheme**, not the name, and say so in the 503. Somebody sets
`DATABASE_URL` by hand, once.

*RLS has no policies, on purpose.* The linter reports
`rls_enabled_no_policy` at INFO on every table forever. That is the
intended state and not a finding to clear. Someone will eventually
"fix" it by adding permissive policies, which would re-open exactly the
hole this closed — PostgREST reaching safety narratives with a key
designed to be public.

*A credential that bypasses RLS is sitting unmasked.* The Netlify
Supabase extension set `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_JWT_SECRET` with `is_secret: false`, so both are readable
through the management API — and both were in fact read that way during
setup. The service-role key bypasses RLS entirely, which is to say it
bypasses the whole confidentiality posture the previous point
established. Nothing in this codebase uses either.

**The flag:** the `not_configured` branch in
`netlify/functions/api.mts`. While `DATABASE_URL` is absent the function
answers **503 `not_configured`**, naming what is missing rather than
failing obscurely — so the claim "nothing serves it" is true exactly
while that response is what the deployed API returns. The day a real
request gets a real answer, this entry is resolved and gets deleted.

**What must happen:** set `DATABASE_URL` to Supabase's transaction
pooler URI, set `JWT_SECRET` and `DEIDENT_SALT`, all three as secret
environment variables on the Netlify project, rotate Supabase's JWT
secret and drop the extension's four unused variables, and leave the RLS
advisory alone.

**The test:** none that runs in CI, and that is stated rather than
hidden — the repository cannot reach the hosted project, and it should
not hold credentials that would let it. `docs/06-DEPLOYMENT.md` carries
the checklist instead, and switch 3's honesty applies here too: a
doc-level claim about infrastructure cannot be asserted in a unit test
without inventing a fact for the test to read.

---

## 8. The unwritten counts

**The claim:** charter rule 10 — counts about the product are computed,
not typed.

**Why it expires:** it has not been earned yet. This repository currently
has no marketing surface making numeric claims, so there is nothing to
compute and `scripts/check-claims.mjs` has little to do. The first
landing page that says "eleven registration prefixes" or "five
jurisdictions" is where the rule starts to bite.

**The flag:** the assertion list `scripts/check-claims.mjs` prints on
every run. Each derived count appears there by name; a number that
reaches a customer surface without one is the claim expiring. The gate
cannot see a count nobody told it about, which is why this entry exists
at all — the flag is a discipline with a mechanism behind it, not a
mechanism on its own.

**What must happen:** before any such page ships, the number must derive
from `MOR_OBLIGATIONS` / `REGISTRATION_PREFIXES` and the build must fail
if it is written by hand.

**The test:** `scripts/check-claims.mjs`, which today asserts the
registries are non-empty and internally consistent, and which must grow
an assertion per public claim as claims appear.

---

## 9. The refresh token is in localStorage

**The claim:** a signed-in device can send what it has queued, and the
session survives a reload.

**How it is done today:** the access token is held in memory only; the
refresh token is in `localStorage`. `apps/web/src/shared/session.js`
says so in its header rather than in a comment nobody reads.

**Why it expires:** `localStorage` is readable by any script that runs
on this origin. That is an XSS-exposed credential, and on this product
the thing it unlocks is other people's confidential safety narratives.
Nothing is holding it back except that no third-party script runs here:
the CSP names no external script origin, `html.js` escapes every
interpolation by default, and the two runtime dependencies are Dexie and
zod. Those are real defences and none of them is the right one.

The right one is an **httpOnly cookie**, and it is available: the API is
same-origin (`/api/*` on the same host as the app), which is exactly the
condition that makes cookie auth work without CORS gymnastics. It was
not done because it needs a cookie-parsing path and CSRF protection the
API does not have, and shipping a half-built version of that would be
worse than shipping the honest simple one.

**The flag:** `REFRESH_KEY` in `apps/web/src/shared/session.js`, and the
`localStorage` calls that read and write it. The claim holds precisely
while that key is stored by the browser rather than set as an httpOnly
cookie by the server; when the write disappears, the entry is resolved.

**What bounds the damage meanwhile:** the access token expires in
fifteen minutes and never touches disk. The refresh token rotates on
every use, and a replayed one revokes every session that user has — so a
stolen token that is used alongside the real client's takes the
attacker's session down with it and tells the audit log it happened
(`auth.refresh.reuse_detected`).

**What must happen:** move to an httpOnly, `SameSite=Strict`, `Secure`
cookie for the refresh token, with CSRF protection on the state-changing
routes, before this carries a real operator's reports.

**The test:** `tests/integration/auth.route.integration.test.ts` already
proves the rotation and the reuse revocation — the properties that make
the current arrangement survivable rather than reckless. There is no
test asserting the storage medium, deliberately: a test that asserted
`localStorage` would have to be deleted to make the fix, which is a
guard that argues against its own resolution.

---

## 10. Registration redaction is scoped to Kenya

**The claim:** de-identification removes aircraft registrations from a
narrative before it leaves the safety office.

**Where it stops being true.** On 12 August 2026 the prefixes for Uganda
(`5X`), Tanzania (`5H`) and Rwanda (`9XR`) were removed from
`REGISTRATION_PREFIXES` in `apps/api/src/deident.ts`, on instruction,
alongside the same narrowing applied to the jurisdictions and the
aerodrome list.

**Why this one is different from the other two narrowings.** Removing a
jurisdiction removes a claim, and removing an aerodrome sends one field
to free text. Removing a prefix here means a narrative naming `5X-DEF`
keeps that registration **in a record labelled de-identified**. Whose
law applies to an operator has nothing to do with which aircraft its
crews write about: a Kenyan operator flying a sector into Entebbe writes
about Ugandan aircraft, and that sector is a routine one.

This is a defect the module already had once. It originally matched
`5Y-[A-Z]{3}` alone and every Ugandan, Tanzanian, Rwandan and Ethiopian
registration went through in clear; the prefix list was added to close
it. Three are now open again **by decision rather than by accident**,
which is the only improvement available over the original state.

**Note the remaining list is not symmetrical.** Ethiopia, Burundi, DR
Congo, Sudan, Libya and Somalia are still redacted. A Kenyan operator
encounters Ugandan aircraft at least as often as Ethiopian ones, so the
list as it stands is scoped by instruction rather than by a rule that
can be derived. Either widen it back or narrow it to Kenya alone; the
middle is the state that is hardest to explain to an auditor.

**The flag:** `REGISTRATION_PREFIXES` in `apps/api/src/deident.ts`.

**What must happen** before a customer relies on the de-identified view
across a border: decide whether the redaction scope follows the State of
Registry or follows the narratives operators actually write, and make
the list match the answer.

**The test that stops it rotting:** `tests/deident-corpus.test.ts` —
*"registrations outside the State of Registry"* asserts `5X`, `5H` and
`9XR` pass through in clear, and *"STILL redacts the State of Registry's
own aircraft"* asserts Kenya does not. The cases were inverted rather
than deleted: a deleted case is a gap nobody can see, and the next
reader could not tell a decision from an oversight.

**Owner:** whoever ships the first customer operating across a border.

---

## 11. The FAA's Part 135 deadline is described as forthcoming

**The claim:** `docs/01-RESEARCH.md` §3.3 records that 14 CFR Part 5 now
reaches Part 135 charter and commuter operators, and that they must
submit a Declaration of Compliance by **28 May 2027** — and reads that
as an operator population buying tooling in 2026.

**Why it expires:** on 28 May 2027. After it, "a population that must
declare compliance by 2027" describes something that has already
happened, and the sentence about demand shape either becomes a
statement about who actually bought or it becomes nothing.

**The flag:** the date itself, and the marker below.

<!-- EXPIRES: 2027-05-28 -->

**What must happen:** replace the forecast with what was observed. If a
US row was never added — the current and correct position, because no
FAA instrument has been read against the primary here — say so plainly
rather than leaving a market note that reads as a plan.

**The test:** `scripts/check-switches.mjs` reads the `EXPIRES` marker
and fails the build on 28 May 2027.

**What is NOT claimed, and must not start being:** that this product
computes any FAA obligation. §3.3 is explicit that the dates come from
secondary sources and that no jurisdiction row enters
`MOR_OBLIGATIONS` on that basis. The claims gate already refuses a
deadline for a jurisdiction with no instrument to cite; this entry
exists so the market note does not quietly become a product claim in
the meantime.
