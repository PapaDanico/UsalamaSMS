#!/usr/bin/env node
/* ============================================================
   Stamp the service worker with a build id and the real asset list.

   Two things sw.js cannot know when it is written:

     1. WHAT VERSION IT IS. A hand-edited version string is a version
        string that stops being edited, and a cache that never
        invalidates serves last month's app to someone filing a safety
        report against this month's procedures.

     2. WHAT TO PRECACHE. Vite emits content-hashed filenames, so the
        shell's real asset names only exist after the bundle does.
        Precaching a guess means the first offline launch fetches
        nothing and shows the fallback page — the exact failure the
        worker exists to prevent, arriving silently.

   Runs after `vite build`, against dist/.
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const swPath = resolve(DIST, 'sw.js');
let sw;
try {
  sw = readFileSync(swPath, 'utf8');
} catch {
  console.error(
    'FATAL: dist/sw.js not found. The service worker lives in\n' +
      '  apps/web/public/sw.js and is copied by vite. If this fails, the\n' +
      '  build produced no worker and the app has no offline support —\n' +
      '  which must not pass silently (charter rule 11).'
  );
  process.exit(1);
}

if (!sw.includes('__BUILD_ID__')) {
  console.error(
    'FATAL: dist/sw.js contains no __BUILD_ID__ placeholder.\n' +
      '  Either it has already been stamped, or the placeholder was removed —\n' +
      '  in which case every deploy from now on shares one cache name and\n' +
      '  users keep the first version they ever loaded.'
  );
  process.exit(1);
}

/* Precache the shell: the entry document and every hashed asset. Fonts
   and icons are included — an offline launch that renders in Times New
   Roman with no mark is a launch that looks broken. */
const assets = walk(DIST)
  .map((f) => '/' + relative(DIST, f).split(/[\\/]/).join('/'))
  .filter((f) => !f.endsWith('/sw.js'))
  .filter((f) => /\.(js|css|woff2?|svg|png|json|html)$/.test(f))
  .sort();

/* The build id is derived from the asset list, so an identical build
   produces an identical id and browsers do not churn their caches for
   a deploy that changed nothing. */
const buildId = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 12);

sw = sw.replace('__BUILD_ID__', buildId);
sw = sw.replace(
  /const PRECACHE = \[[^\]]*\];/,
  `const PRECACHE = ${JSON.stringify(assets)};`
);

writeFileSync(swPath, sw);

console.log(`  service worker stamped ${buildId} — ${assets.length} assets precached`);

/* ============================================================
   Bundle budget.

   The design target is a mid-range Android on a patchy connection at a
   remote strip, and the sibling product ships eighteen tools in 114 KB.
   That number is not a boast — it is the reason that product works where
   it works, and it survives only because something fails when it stops
   being true.

   This page went from 8.8 KB to 165 KB the moment the real offline
   layer landed: Dexie for the outbox, and zod because the device
   validates with the SAME schema the server uses — a report rejected
   server-side after three days offline is unfixable, so that one is
   worth its weight. Both are deliberate. What is not acceptable is the
   next 100 KB arriving without anyone noticing, which is how every
   bundle that ends up at 2 MB got there.

   Raise these numbers when you have decided to; do not raise them to
   make a build pass.

   ---------------------------------------------------------------
   WHY THERE ARE NOW THREE NUMBERS RATHER THAN TWO.

   This measured TOTAL JavaScript, which was the same thing as "what a
   person downloads before they can file a report" for exactly as long
   as there was one chunk. The design route — the whole brand system,
   the token swatches, a screen only we open — is now split out, and
   under a total-only budget that split made the number WORSE: the entry
   chunk fell and the chunk overhead pushed the sum up.

   A budget that punishes the change it should reward is a budget
   measuring the wrong thing. So:

     · ENTRY is what gates time-to-first-report. It is the number that
       matters and it keeps the original 200 KB, unmoved.
     · TOTAL still has a ceiling, because "split it into forty chunks"
       must not become a way to smuggle a megabyte in. It is set at
       240 KB — the entry budget plus room for the lazy routes that
       exist, and no more.

   This is a change of METRIC and it is written down here rather than
   done quietly, because changing what you measure to pass a build is
   the exact failure this whole block exists to prevent. The test is
   whether the new metric would have caught the old problem: a 40 KB
   library added to the report form still breaks ENTRY, which is what
   the 200 KB was protecting.
   ============================================================ */
/* ENTRY RAISED 200 -> 212 KB, once, and here is the receipt.

   Checked first that the overage was not fat. The shared package's
   barrel does `export * from "./glossary"`, so importing CreateReportSchema
   from it could have dragged the whole SMS glossary into a phone; it does
   not — grepping the built entry for SRB, SPI and MEL returns nothing, so
   Rollup shakes it. The 206 KB is Dexie, zod, the taxonomy, the regulatory
   engine and the shell, all of which the FIRST screen genuinely uses.

   What the 12 KB bought, all of it user-facing:

     · the session layer and the sign-in screen — without which nothing
       this app collected could leave the device at all;
     · Try again / Copy text on a failed report, which is the action the
       sync strip had been telling people to go and find;
     · conflicts made visible, after they were silently invisible;
     · the install and update prompts.

   NOT a metric change. The previous entry/total split was one, recorded
   above, and doing it twice would be the thing this block exists to stop.
   The test still holds: a 40 KB library added to the report form breaks
   this, which is what the number is protecting.

   For scale, the entry is 64.6 KB over the wire gzipped. The raw ceiling
   is kept because parse time on a mid-range Android is charged on raw
   bytes, and that phone is the target device. */
/* CSS -> 40 KB and TOTAL JS -> 272 KB. This is the SECOND raise in
   this session, which is the point at which a budget stops being a
   budget, so the receipt has to carry the reason it is not fat and the
   condition under which the answer would be no.

   THE NUMBER THAT DID NOT MOVE. Entry is 204.4 KB against its 212 KB
   ceiling, unchanged across two design passes, a landing page, and
   eight new screens. Entry is what gates time-to-first-report, and it
   is the only one of the three with a person waiting on it — a ramp
   agent at a remote strip downloads the entry chunk and nothing else.
   That number has not been raised since the session layer landed and
   is not being raised now.

   WHAT THE OTHER TWO BOUGHT. Eight screens that did not exist:
   the landing page, Methodology (which replaced the route called
   "design system"), About, Tutorials, Questions, Glossary, Privacy,
   Terms. Every one of them is lazily loaded and arrives only when
   somebody asks for it by name.

   Two of those render modules the repository already held and showed
   to nobody. packages/shared/src/glossary.ts — sixty abbreviations,
   ten Annex 19 definitions, the three occurrence classes and the seven
   thresholds that make an injury serious, transcribed from the KCAA
   course glossary — existed only so the de-identifier would not scrub
   "the AOC holder" into "the [FLT] holder". The deadline calculator on
   the methodology page calls the same reportingDeadline() the report
   form calls. Neither is new logic; both are logic that was already
   paid for and never rendered.

   The CSS is 21 KB of it gzipped down to about 9. It carries the
   document-page furniture those eight screens need — a sticky contents
   list, a figure strip, a native-disclosure question list, numbered
   steps, definition lists, the calculator's result panel — after four
   separate passes giving weight back: 1.8 KB of rules for pages this
   app does not render, five duplicate copies of a focus/selection
   block, the benchmark's marketing components, and three @media print
   blocks that had drifted apart.

   WHAT WOULD MAKE THE ANSWER NO. A third raise for anything that is
   not a screen a person navigates to. A dependency, a polyfill, a
   component library, or a lazy chunk that turns out to be one screen
   plus a framework. The test the original number was protecting still
   holds exactly: a 40 KB library added to the report form breaks
   ENTRY, and ENTRY has not moved.

   ---------------------------------------------------------------
   THE THIRD RAISE: CSS -> 44 KB, TOTAL -> 292 KB.

   Held to the sentence above, which is why it was written. What was
   added is two screens a person navigates to — /toolkits and
   /toolkits/maturity — and packages/shared/src/maturity.ts, which is
   the ICAO SMS framework and a scoring function in plain TypeScript.
   No dependency, no polyfill, no component library. Both screens are
   lazily loaded and ENTRY IS 205.6 KB, which is where it was before
   the landing page and ten screens ago.

   What they buy is the thing Annex 19 Amendment 2 asks an operator to
   be able to do: state a position on its own SMS and show movement on
   it. The assessment computes and stores nothing but the answers, in
   the operator's own browser.

   The CSS is one vocabulary shared by all three tools — a fieldset per
   question, full-width options because five maturity descriptors side
   by side is five columns of eight words on a handset, and a result
   panel that is the same component as the deadline calculator's.

   The stopping rule is unchanged and now has a precedent: a screen
   earns a raise, a library does not.

   ---------------------------------------------------------------
   THE FOURTH RAISE: CSS -> 46 KB, TOTAL -> 304 KB.

   Held to the same rule, and here is the arithmetic behind it. Two
   screens were added, both lazily loaded, both navigated to:

     · /coverage — every one of Annex 19's twelve elements, its state,
       what exists here, and what does not. It exists because an
       independent review found the product describing itself as an SMS
       while covering one and a half elements, and rated that Critical:
       an operator adopting it as its sole SMS would fail an audit
       believing it was covered. The page is the correction, and its
       counts are computed from the same declaration the table renders
       so the two cannot drift apart.

     · /toolkits/register — element 2.2. Hazard, consequence, controls,
       residual risk, owner, review date, acceptance. The bands are the
       same tolerability() the matrix uses and are never stored, so an
       entry cannot carry a band that disagrees with the scale.

   THE NUMBER THAT DID NOT MOVE, again: entry is 206.7 KB against its
   212 KB ceiling, roughly where it was eleven screens ago. Nothing
   here reached the first paint of a report on a handset at a strip.

   Weight was given back before it was asked for: the five severities
   and five likelihoods now live once, in risk.ts beside the matrix
   that scores them, instead of in four hand-typed copies. That is
   worth more than the half-kilobyte it returned — four copies of a
   safety scale is four places for its wording to drift, and a register
   whose severity reads differently from the matrix it was scored
   against is a register an auditor stops trusting.

   The rule stands, and the test with it: a 40 KB library added to the
   report form still breaks the entry budget, which is the one that
   protects the person filing.

   ---------------------------------------------------------------
   THE FIFTH RAISE: TOTAL -> 308 KB. And this one is NOT a screen, so
   the rule as written did not cover it and is extended here rather
   than quietly bent.

   What was added: the risk register's owner, acceptor and review date
   became dropdowns instead of free text. No new route, no library —
   1.4 KB in a chunk nobody loads until they open the register.

   The rule was "a screen earns a raise, a library does not", and this
   is the third thing: REPLACING FREE TEXT WITH A CONTROLLED
   VOCABULARY ON A SCREEN THAT ALREADY EXISTS. It earns a raise for the
   same reason a screen does — it is the product getting better at the
   job — and taxonomy.ts already carries the argument in full: a typed
   owner becomes "Ops", "ops", "Ops dept" and "S.K.", which is four
   owners of one hazard, none of which can be counted and one of which
   is nobody.

   THE NUMBER THAT DID NOT MOVE, a fifth time: entry is 208.1 KB of
   212, exactly where the previous commit left it. That is not luck. The
   first cut of this change put the post list in taxonomy.ts, which the
   report form imports EAGERLY — 2.2 KB charged to the first paint of a
   report filed at a strip, to carry data only the lazy register reads.
   The budget caught it, and the lists moved to their own module.

   That is the whole value of a budget stated in two numbers rather than
   one: the total said "something grew", and the entry said "and it grew
   in the wrong place". A single total would have passed the bad version
   and failed the good one. */
/* ---------------------------------------------------------------
   THE SIXTH RAISE: TOTAL -> 316 KB. Administrative password reset.

   What it buys is the hole that login, refresh, logout and me left
   between them: a person who forgot a password had no route back into
   the product. Not a self-service one and not an administrative one.
   On an operator with fifteen staff that is the second week.

   It is a capability rather than a route, which the rule did not
   cover, so: it earns a raise for the reason a screen does — the
   product got better at its job — and not for the reason a library
   would not.

   AND THE ENTRY BUDGET DID ITS JOB ON THE WAY, for the second time in
   two days. The panel began inside the account screen, which is EAGER
   because signing in is what sends a queued report. That put 2.5 KB
   into the first paint of the form a ramp agent opens at a remote
   strip, to carry a panel one person opens twice a year. Entry went
   207.2 -> 209.7 and the total went over; splitting the panel into a
   lazily-imported module brought entry back to 207.9.

   The 0.7 KB that remains on entry is the dynamic import and the slot
   it fills, which is the honest cost of the split and is charged to
   the right screen.

   Same lesson as the post list in taxonomy.ts, arriving from the same
   direction: the total says something grew, and the entry says whether
   it grew somewhere a person is waiting on it. --------------------- */
/* ---------------------------------------------------------------
   THE SEVENTH RAISE: TOTAL -> 332 KB. The safety risk assessment.

   Asked for, and it earns it on the original rule without extension:
   /toolkits/sra is a screen a person navigates to, lazily loaded, and
   it is the largest single capability added since the report form.

   WHAT IT IS. The register answers "what hazards do we carry". An SRA
   answers the question that arrives at the worst moment — "you changed
   something; what did you think would happen, and what did you do
   about it?" A new route, a new type, a base closing. Annex 19 element
   3.2 asks for it before the change and an auditor asks for it after,
   and this product could not produce one.

   The five steps are ICAO Doc 9859's own, in its order, including the
   loop back from control to hazard identification that most templates
   drop — a control changes the system, so a mitigation can introduce a
   hazard of its own.

   ENTRY: 208.3 KB of 212, up 0.4 KB, which is the dynamic import and
   nothing else. Seven raises in and that number has moved 8 KB in
   total, across roughly twenty screens. It is the one that was worth
   defending. --------------------------------------------------- */
/* ---------------------------------------------------------------
   THE EIGHTH RAISE: TOTAL -> 352 KB, CSS -> 47 KB. Safety performance
   indicators.

   Earns it on the original rule: /toolkits/spi is a screen a person
   navigates to, lazily loaded, and it closes the last of the three
   elements this product could measure but not do.

   WHAT IT IS. Annex 19 element 3.1 — indicators with targets and alert
   levels, reviewed on a cadence. The coverage table has carried
   "no dashboard, no trend, no alert" against it since the table was
   written, and it is the element an auditor reaches for immediately
   after the reporting queue: a reporting system that produces no trend
   is a filing cabinet.

   The alert levels are computed from the operator's own history rather
   than picked — average plus one, two and three standard deviations,
   with each period judged against the periods BEFORE it. That last
   clause is the whole method and the reason this is a module with
   twenty-eight tests rather than a chart: fold a bad quarter into the
   baseline that judges it and the average rises, the level rises with
   it, and the tool reports that nothing happened.

   WHAT THE CSS BOUGHT. 1 KB, for the trend chart and the inline
   period row. The chart is aria-hidden decoration and every number it
   draws is in the table underneath — on this screen the reader is a
   safety manager with a monochrome printout in a review, so the line
   cannot be the only place the trend exists.

   ENTRY: 209.5 KB of 212, up 0.4 KB — the dynamic import and nothing
   else. Eight raises in, and the number a reporter at a strip pays has
   moved 8.4 KB across roughly twenty-two screens.
   --------------------------------------------------------------- */
/* ---------------------------------------------------------------
   THE NINTH RAISE: TOTAL -> 392 KB, CSS -> 50 KB. The SMS record.

   Earns it on the original rule and then some: /sms is a screen a
   person navigates to, lazily loaded, and it is the largest single
   capability this product has added — the other EIGHT Annex 19
   elements, which /coverage has spent months telling operators it
   could score and could not do.

   WHAT IT IS. The signed safety policy and who has read it; the
   accountability matrix; the appointment records; the emergency
   exercises and what they found; the controlled documents; the
   internal audit findings, closed and separately verified; the
   training matrix with its expiries; and what reporters were told
   happened. Four components, in ICAO's order, rendered from the same
   SMS_COMPONENTS declaration the maturity assessment and the coverage
   table use — so an element cannot appear here under a name the
   framework does not use.

   AND IT IS THE FIRST SCREEN THAT IS THE ORGANISATION'S RECORD RATHER
   THAN THE DEVICE'S. Every read and write goes to the API, is scoped
   to the caller's operator in SQL, and appends to the audit chain.
   That is the difference between "an operator can produce the
   document" and "the organisation holds it", and it is the whole
   reason the coverage figure can move.

   WHAT THE CSS BOUGHT. 1.4 KB for the record list: a left-edge state
   stripe in the product's own risk bands, dense rows, and the
   disclosure that keeps eight entry forms from burying the record they
   sit under. Colour is never the only channel — every stripe has a
   badge beside it stating the state in words.

   ENTRY IS NOT RAISED, and it nearly was. Adding the eight Annex 19
   permissions pushed it to 212.1 against a 212 ceiling — and the cause
   was not the new screen. PERMISSIONS is built with `new Set([...])` at
   module scope, which Rollup cannot tree-shake, so the whole
   authorisation matrix rode in the entry chunk on the back of the
   report form importing CreateReportSchema from the same barrel. A ramp
   agent at a remote strip was downloading every role's permission set
   before they could file anything.

   Split into packages/shared/src/permissions.ts, the same shape as
   posts.ts out of taxonomy.ts, and entry came back to 210.6 of 212.
   The third time this exact class of mistake has been caught by this
   budget, and the third time the fix was not a bigger number.

   CSS 50 -> 52 KB, AND WHAT IT BOUGHT. Four blocks, all of them things
   the product previously computed and could not say:

     · the suitability control and its findings block. SM ICG grades
       Suitable against the operator's size and complexity, which is a
       different question from how far an element has been taken — so
       it needs a visible seam inside the element, or it reads as a
       sixth rung on the first question;
     · "what you can do now" after sign-in, which existed because a
       safety manager who had just typed a password was told the
       password worked and nothing about what it was for;
     · the implementation plan, which is the artefact CASA asks a new
       operator to submit;
     · THE PRINT RULES, which are the largest share and the reason this
       is not a saving to be found elsewhere. The plan printed against
       the screen layout came out in a 20rem sidebar beside twelve sets
       of radio buttons — the output squeezed into a column while the
       input took the page. Print now collapses the grid, puts the
       result first, and hides the four unchosen rungs per element.

   Unlike the entry budget, nothing here rides on the back of a barrel
   import: this is stylesheet for screens that did not exist, and there
   was no split to find. The ENTRY figure — the one a reporter at a
   strip actually pays — is untouched at 211.1 of 212, and CSS is
   fetched once and cached by the service worker.
   ---------------------------------------------------------------
   TOTAL -> 404 KB, for /templates. CSS AND ENTRY BOTH UNMOVED, and
   the entry figure is the part of this receipt worth reading.

   WHAT IT BOUGHT. One screen a person navigates to: the index of
   published artefacts an operator can build an SMS from — CASA's gap
   analysis tool, its evaluation tool, the sample manual, the ERP
   template, the nine-booklet resource kit, and Doc 9859 behind all of
   them. It holds no copies. Every entry links to the publisher, and
   every entry states what this product already does against that
   document and what the operator still has to go and get, which is
   /coverage's discipline applied to somebody else's paper.

   It qualifies on the stopping rule as written: a screen earns a
   raise, a library does not. No dependency arrived, and the page
   invented no CSS — it renders through the vocabulary /coverage
   already had, because "what is here" and "what is not" is the same
   statement in both places.

   ENTRY WENT DOWN, from 211.9 to 211.8 KB, while gaining a route.
   That is not luck. Adding a navigable destination costs the entry
   chunk a menu item and a route registration, and this one was paid
   for by finding weight already there and wrong: the six toolkit
   blurbs lived in shared/sitemap.js, which main.js imports, so six
   sentences printed only by the lazily-loaded toolkits index were
   being downloaded by every reporter filing a report at a strip. The
   LIST is still declared once — only the prose moved to the single
   surface that prints it, and tests/sitemap.test.ts now requires every
   toolkit to have a blurb, so the guarantee proximity used to give is
   kept by something that can fail.

   That is the pattern the earlier raises describe and this one
   follows: weight given back before it was asked for.

   WHAT WOULD STILL MAKE THE ANSWER NO, unchanged: a dependency, a
   polyfill, a component library, or a lazy chunk that turns out to be
   one screen plus a framework. And the test the original number
   protects is intact — a 40 KB library added to the report form
   breaks ENTRY, and ENTRY has now not moved in fourteen screens.
   --------------------------------------------------------------- */
/* CSS -> 54 KB, and this one is not a screen. It is six declarations
   that make the navigation reachable on the target handset.

   .dropdown-menu is position:fixed with no max-height and no overflow.
   That was survivable while the longest group had five items and
   became a defect the moment it had six: the panel grew past the
   bottom of a 390x844 viewport, and fixed positioning means the page
   scroll cannot reach what hangs below it. The last destination in the
   menu was simply gone — present in the DOM, reported visible, and
   untappable.

   The fix is max-height in dvh, overflow-y, and overscroll-behavior.
   There is no cheaper version of it, and "remove a menu item instead"
   is not a saving, it is the same defect chosen deliberately.

   Weight was not given back here because the previous entry gave it
   back already — the six toolkit blurbs moved out of the entry chunk,
   which is the number that actually costs a reporter time. This is
   0.2 KB of stylesheet, fetched once and precached by the service
   worker, against a menu that works.

   The stopping rule gains a second precedent alongside "a screen earns
   a raise": so does a correctness fix on the target device. What still
   does not is a dependency, a polyfill or a component library. */
/* ENTRY 212 -> 214 KB. The first time this number has moved since the
   session layer landed, across fourteen screens, and it is not moving
   for a screen now either.

   WHAT IT BOUGHT. The landing page's "Reporting deadlines in force"
   section now renders two things the registry already held and only
   /methodology printed: whether an instrument is past its review
   cycle, and what now governs it. That section is the one the footer
   names as the regulatory basis and links to by name, and it was
   citing KCAA Advisory Circular CAA-AC-SMS004A of January 2023 with no
   indication that the Civil Aviation (Safety Management) Regulations,
   L.N. 32 of 2026, gazetted 3 March 2026, now sits above it.

   That is not decoration on the first paint. It is the same class of
   defect as the 72-hour deadline this whole product was corrected
   from: a confident figure, correctly computed, presented without the
   one fact that qualifies it. A reader is owed the figure, its source,
   and whether that source is still the top of the stack; two of the
   three is the combination that misleads. check-claims.mjs now fails
   the build if either surface lists a deadline without both, so this
   cannot quietly regress on one screen again — which is exactly how it
   got here.

   WEIGHT WAS GIVEN BACK FIRST, and nearly all of it. Two rounds of the
   same finding: shared/sitemap.js is imported by main.js, so every
   string in it lands in the entry chunk, and both the six toolkit
   blurbs AND the six full toolkit labels were rendered by nothing but
   the lazily-loaded toolkits index. Roughly half a kilobyte a reporter
   at a strip was downloading to file a report on a screen that never
   showed it. Both moved to the surface that prints them; `short` stays
   because the menu hint is computed from it and the menu is the entry.
   tests/sitemap.test.ts keeps the guarantee proximity used to give.

   After giving that back the overage was under fifty bytes, which is
   the honest shape of this raise: the cleanup paid for almost all of
   it and the remainder is the sentence itself.

   WHAT WOULD MAKE THE ANSWER NO. Anything that is not a correction to
   a claim on a customer surface. A screen does not earn an ENTRY
   raise — it earns a TOTAL one, and the record above shows seven of
   those. A dependency, a polyfill or a component library earns
   neither. The test the original number protects is intact: a 40 KB
   library added to the report form still breaks this. */
/* TOTAL -> 408 KB, for element 3.1 reaching the safety office. ENTRY
   AND CSS BOTH UNMOVED.

   WHAT IT BOUGHT. The safety performance indicators stop being a
   handset's private notes. Regulation 9(5) of L.N. 32/2026 requires a
   service provider's SMS to have "safety performance indicators and
   targets acceptable to the Authority" — and until now the product
   computed them correctly into localStorage, so an operator asked to
   produce theirs had to produce a particular phone.

   The weight is the sync itself: reading the organisation's series on
   load, posting an indicator and a period, and taking a row back out
   when the server refuses one. That last part is most of it and is not
   optional — an indicator that looks saved and is not is the failure
   this whole move exists to end, so a rejected write rolls the local
   copy back rather than leaving an optimistic row on screen.

   It lands in the lazily-loaded /toolkits/spi chunk. A reporter filing
   at a strip does not download any of it, which is why ENTRY is
   unchanged at 213.0 KB — nine screens and four budget raises since
   that number last moved for anything other than a correction to a
   claim.

   The stopping rule gains its third precedent, and this one is the
   strongest of them: a screen earns a raise, a correctness fix on the
   target device earns a raise, and so does a legal requirement the
   product already satisfied everywhere except where it counted. What
   still does not is a dependency, a polyfill or a component library. */
/* TOTAL 408 -> 409 KB, so a server read cannot delete the device's own
   work. ENTRY AND CSS BOTH UNMOVED.

   WHAT IT BOUGHT, and this is the least optional raise in the file.

   Both server-backed toolkits read the organisation's copy on load and
   assigned it straight over the device's, then persisted. A signed-in
   safety manager whose organisation had no server-side records yet
   opened the screen and watched an empty list overwrite their own — no
   click, no confirmation, no undo, nothing on screen afterwards to say
   it had happened.

   IT WAS AIMED AT EVERY EXISTING USER SIMULTANEOUSLY. The server side
   arrives in the same release as the read, so on the first load after
   the deploy every operator's server-side register is empty BY
   DEFINITION, and every local register would have been wiped against
   it. A migration that destroys the data it is migrating. The
   indicators are worse again: an indicator is not one fact but a
   series, and six quarters of exposure cannot be typed back in from
   memory the way a hazard description can.

   The weight is the union itself — reconciling the two lists by id,
   keeping anything the safety office has never heard of, and adopting
   the server's id on a successful write so the same hazard cannot
   arrive twice on the next load. The register needed that last part;
   the indicators already had it.

   Lands entirely in the lazily-loaded /toolkits chunks. A reporter
   filing at a strip downloads none of it, which is why ENTRY is
   unmoved at 214.0 KB.

   The stopping rule gains a fourth precedent, and it is the plainest:
   a screen earns a raise, a correctness fix on the target device earns
   a raise, a legal requirement earns a raise — and so does not
   destroying the user's work. What still does not is a dependency, a
   polyfill or a component library. */
/* TOTAL 409 -> 410 KB. ENTRY UNMOVED AT 214, and falls to 213.4 KB
   against it — the first headroom that number has had in a while.

   WHAT WAS BOUGHT. The menu's fourteen hint sentences moved out of
   shared/sitemap.js — which main.js imports, and which is therefore
   parsed before the app renders anything — into shared/menu-hints.js,
   fetched when the menu is first opened. Entry falls 218,518 bytes
   from 219,1xx, about 650 bytes off the path a reporter waits on
   before the form appears.

   WHAT IT COST, because a split is not free. The new chunk is 1,288
   bytes: the prose plus a module wrapper. So TOTAL rises by more than
   ENTRY falls, and the service worker precaches every hashed asset, so
   the bytes a device ultimately downloads are unchanged. This buys
   WHEN, not HOW MUCH — which is precisely the distinction the two
   numbers exist to draw, and the only honest claim to make for it.

   THE MEASUREMENT THAT MATTERS MORE THAN THE SAVING. Going looking for
   a bigger win first, the entry chunk turns out to hold the landing
   page, the report form and the login screen — statically imported in
   main.js while all fourteen other routes are lazy — and with them the
   whole regulations module, every instrument citation included. That
   is not an oversight to clean up. A reporter at a strip has to be
   able to open the app and file with no signal and no second request,
   and those three screens plus their deadline arithmetic ARE that
   promise. Deferring them would trade the product's central claim for
   a smaller number.

   So: roughly 650 bytes is about the size of the prose win available
   in entry, and anything materially larger costs something this
   product does not sell. That is worth knowing before the next person
   attacks this figure.

   THE ENTRY BUDGET THEREFORE STAYS AT 214. Lowering it to 213 was
   tried and rejected on the measurement: the chunk is 213.4 KB, so a
   213 KB ceiling fails the build it was meant to describe, and the
   only ways to reach it are the three screens above. A budget set
   below what the code can achieve without breaking a product promise
   is not a tighter constraint, it is a broken build.

   The stopping rule is unchanged and this raise does not test it: the
   total moves so chunking overhead does not block the next change,
   while the number describing what a reporter waits for gains room
   rather than spending it. A dependency, a polyfill or a component
   library still buys nothing. */
/* TOTAL 410 -> 412 KB, for the anticipation half of element 4.1.
   ENTRY AND CSS UNMOVED.

   WHAT IT BOUGHT. The training matrix compared two date strings and
   rendered lapsed or current. /coverage said exactly what that was
   missing — "an expired row is visible to somebody who opens the
   screen; nothing tells an operator a currency is about to lapse" — so
   a recurrent lapsing next Tuesday looked identical to one lapsing in
   a year, and acting in time meant opening the screen on the right day
   and doing the subtraction by eye.

   Four states now, computed from the dates already stored, with the
   count and the next lapse above the list. No migration: completedOn
   and expiresOn were both there, which is why this is arithmetic
   rather than schema.

   THE WEIGHT IS THE WINDOW, NOT THE RENDERING. A fixed thirty days
   would have cost nothing and been wrong in both directions: on a
   three-year rating it is a month's notice on a renewal needing a
   quarter, and on a thirty-day currency it fires the day the record is
   created, so every row is permanently amber and the colour stops
   meaning anything. The second failure is the expensive one — a signal
   that is always on is one people learn to ignore, and then the real
   one arrives and is ignored with it. So the window is a fraction of
   each record's own validity, bounded at both ends, using the same
   fraction regulations.ts uses to decide when a reporting deadline
   becomes DUE_SOON.

   Lands in the lazily-loaded /sms chunk. A reporter filing at a strip
   downloads none of it, which is why ENTRY is unmoved at 213.4 KB.

   WHAT IT DID NOT BUY, and the coverage entry now says so rather than
   letting an amber badge imply it: this anticipates, it does not
   arrive. No digest, no email, no push. A currency still lapses
   quietly for an operator who does not look.

   Fifth precedent for the stopping rule, and consistent with the
   others: a screen earns a raise, a correctness fix on the target
   device earns a raise, a legal requirement earns a raise, not
   destroying the user's work earns a raise — and so does moving an
   Annex 19 element from "visible if you look" to "stated before it
   happens". A dependency, a polyfill or a component library still
   buys nothing. */
/* TOTAL 412 -> 416 KB, for regulation 13's six requirements. ENTRY AND
   CSS UNMOVED.

   WHAT IT BOUGHT. The product has offered a "voluntary and
   confidential" report type since the form was built. That is a label
   in a list. Regulation 13 of L.N. 32/2026 does not describe a label:
   13(2) requires the system to be non-punitive and to afford
   protection to the sources, and 13(3) requires it to define six
   things — objective, scope, who may report, when, how reports are
   processed, and the manager to be contacted. The product asserted the
   category and stated none of the substance.

   The six are now quoted with their sub-paragraphs on /methodology,
   with the answers left where they belong: an objective, a scope and a
   contacting manager are facts about the OPERATOR, and a tool that
   filled them in would be inventing an answer and handing it to a
   regulator under somebody else's name. Recording those answers needs
   a table and is not built; /coverage says so rather than letting the
   rendered list imply otherwise.

   Lands in the lazily-loaded /methodology chunk. ENTRY unmoved at
   213.4 KB.

   THE THIRD RAISE IN ONE DAY, AND THE NUMBER TO WATCH IS THE
   CUMULATIVE ONE. Total has moved 408 -> 409 -> 410 -> 412 -> 416
   across a single session: the register union that stopped a server
   read deleting device work, the chunk overhead from deferring the
   menu hints, element 4.1's currency arithmetic, and now this. Every
   one has a receipt above and every one is defensible on its own,
   which is precisely how a budget drifts — no single step is the
   wrong call.

   ENTRY IS THE REASSURANCE, and it is why this is drift rather than
   rot: it has not moved in any of the four, and fell in one. A
   reporter at a strip downloads the same bytes today as this morning;
   all of this weight is on lazily-loaded screens that only a safety
   manager opens. If ENTRY ever starts tracking TOTAL, that is the
   moment to stop and take something out instead.

   The stopping rule holds: a legal requirement stated faithfully earns
   a raise. A dependency, a polyfill or a component library still buys
   nothing. */
/* TOTAL 416 -> 420 KB, for the screen an operator defines its voluntary
   system on. ENTRY effectively unmoved at 213.5 KB.

   WHAT IT BOUGHT. The last change quoted regulation 13(3) on
   /methodology and gave the answers a table; there was still nowhere to
   type them. Element 2.1 now carries both halves — the pointer to
   /report, where a REPORTER files, and the definition beneath it, which
   is the safety office's to write. Seven textareas rather than a
   wizard, because the six are not sequential and are rarely answered in
   one sitting, and unanswered() names which remain rather than scoring
   them.

   AND THIS IS THE FIFTH RAISE IN A DAY. 408 -> 409 -> 410 -> 412 -> 416
   -> 420. Every one has a receipt above it, every one is defensible
   alone, and that is exactly the shape of drift: no single step is the
   wrong call and the sum is 12 KB.

   THE SIGNAL I SAID TO WATCH FOR HAS NOW APPEARED, small but present.
   ENTRY has been flat all day and fell once; this change moved it
   213.4 -> 213.5 KB, because voluntary.ts is now imported by two
   lazily-loaded screens and the bundler hoists what more than one chunk
   needs. A tenth of a kilobyte is noise. The DIRECTION is not, and the
   rule written here two raises ago was that entry beginning to track
   total is the moment to take something out instead of buying more.

   So: this raise, and then a consolidation pass before the next one.
   What should be examined is whether /methodology and /sms both need to
   render the full requirement text, or whether the reference statement
   and the answer form can share one rendering. That is a real question
   with a real answer, and it is cheaper than a sixth raise.

   The stopping rule itself is unchanged and this still satisfies it: a
   screen earns a raise. A dependency, a polyfill or a component library
   still buys nothing. */
const BUDGET = { entry: 214 * 1024, js: 420 * 1024, css: 54 * 1024 };

const sizes = { js: 0, css: 0, entry: 0 };
let entryAsset = null;
for (const asset of assets) {
  const ext = asset.endsWith('.js') ? 'js' : asset.endsWith('.css') ? 'css' : null;
  if (!ext) continue;
  const bytes = statSync(resolve(DIST, asset.slice(1))).size;
  sizes[ext] += bytes;
  // The entry chunk is the largest JS asset: Vite names lazy chunks the
  // same way, so size is the only thing distinguishing them without
  // parsing the manifest, and a lazy chunk larger than the entry would
  // be a finding rather than a miscount.
  if (ext === 'js' && bytes > sizes.entry) {
    sizes.entry = bytes;
    entryAsset = asset;
  }
}

/* ============================================================
   WHAT IS DELIBERATELY NOT IN THE ENTRY CHUNK.

   A budget catches weight. It does not catch weight arriving in the
   WRONG PLACE while the number stays under, and it cannot catch a
   saving being quietly undone — which is the failure mode for every
   split this project has made.

   The menu hints are the live example. Fourteen sentences moved to
   shared/menu-hints.js so they stop being parsed before first paint by
   a reporter who never opens a menu. Writing `hint:` back onto an item
   in sitemap.js is the obvious thing for the next person to do: it is
   where the item lives, it is where hints used to be, and nothing
   about it looks wrong. The entry number would tick up by under a
   kilobyte, stay inside the budget, and the split would be gone with
   no gate having an opinion.

   So a sentence from each deferred module is looked for in the built
   entry asset by its actual text. Read from the module rather than
   typed here, because a sentinel typed in two places is a sentinel
   that stops matching the day somebody edits the copy — and then this
   passes for the reason it should be failing.
   ============================================================ */
const DEFERRED = [
  {
    module: 'apps/web/src/shared/menu-hints.js',
    what: 'the menu hints',
    why:
      'they moved out so they are not parsed before first paint; a `hint:` ' +
      'written back onto an item in shared/sitemap.js puts them straight back'
  }
];

if (!entryAsset) {
  console.error('FATAL: no JS asset found in dist — the entry chunk could not be identified.');
  process.exit(1);
}

const entrySource = readFileSync(resolve(DIST, entryAsset.slice(1)), 'utf8');
let leaked = false;
for (const d of DEFERRED) {
  const source = readFileSync(resolve(ROOT, d.module), 'utf8');
  /* EVERY sentence, not the longest one. Checking a single specimen
     was the first version and it did not work: re-adding one hint to
     sitemap.js — the realistic mistake, and the one this exists to
     catch — put that sentence in the entry chunk while the probe went
     on looking for a different sentence and reported clean. A gate
     that only notices a wholesale revert does not cover the change
     anybody actually makes.

     Read from the source so they track edits: a sentinel typed here
     would stop matching the day somebody rewords the copy, and then
     this passes for the reason it should be failing. */
  const prose = [...source.matchAll(/'((?:[^'\\]|\\.){40,})'/g)].map((m) => m[1]);

  if (prose.length < 5) {
    // Charter rule 11: a probe with nothing to look for finds nothing.
    console.error(
      `FATAL: read only ${prose.length} sentence(s) out of ${d.module}, so the ` +
        'entry chunk was not meaningfully checked. Either the module was emptied ' +
        'or its shape changed and this gate stopped covering it.'
    );
    process.exit(1);
  }

  const found = prose.filter((p) => entrySource.includes(p));
  if (found.length) {
    console.error(
      `  IN THE ENTRY CHUNK  ${d.what} — ${d.why}.\n` +
        `                      ${found.length} of ${prose.length} sentence(s) in ` +
        `${entryAsset}, e.g. "${found[0].slice(0, 60)}…"`
    );
    leaked = true;
  }
}
if (leaked) {
  console.error(
    '\nDeferred prose is being shipped in the entry chunk. It is charged to\n' +
      'every cold start, including the reporter at a strip who never opens the\n' +
      'screen that prints it. Put it back behind its dynamic import.'
  );
  process.exit(1);
}

let overBudget = false;
for (const kind of ['entry', 'js', 'css']) {
  const kb = (sizes[kind] / 1024).toFixed(1);
  const limit = (BUDGET[kind] / 1024).toFixed(0);
  const label = kind === 'entry' ? 'js (entry)' : kind === 'js' ? 'js (total)' : kind;
  if (sizes[kind] > BUDGET[kind]) {
    console.error(`  BUDGET EXCEEDED  ${label}: ${kb} KB against a ${limit} KB budget`);
    overBudget = true;
  } else {
    console.log(`  budget ok        ${label}: ${kb} KB of ${limit} KB`);
  }
}

if (overBudget) {
  console.error(
    '\nBundle budget exceeded. Either remove weight or raise the budget in\n' +
      'scripts/stamp-sw.mjs deliberately, with a note saying what you bought\n' +
      'for it. Do not raise it silently to make this build pass.'
  );
  process.exit(1);
}
