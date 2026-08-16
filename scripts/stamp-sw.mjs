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
  /* THE SHARE CARD IS NOT PRECACHED. og-card.jpg is fetched by
     link scrapers and never by the app, so precaching it would
     charge every reporter 62 KB on install for a file they will
     never see. It still ships — it just is not part of what the
     worker installs. */
  .filter((f) => !f.endsWith('/og-card.jpg'))
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

   ENTRY MOVED 82 BYTES, AND THE FIRST EXPLANATION WRITTEN HERE WAS
   WRONG. It said voluntary.ts had been hoisted into the entry chunk
   because two lazily-loaded screens now import it. Measuring the built
   output says otherwise: the module is in voluntary-*.js, a shared
   chunk of its own at 1,946 bytes, and NONE of the regulation prose
   appears in the entry chunk at all. The split did exactly what it
   should.

   What actually grew is the CHUNK REGISTRY — the entry carries a map of
   every lazy chunk it can load, and there is now one more. That is the
   price of the split working, not evidence of weight leaking inward,
   and it argues AGAINST splitting further rather than for consolidating
   what is already shared.

   The correction matters more than the 82 bytes. A receipt that
   misdiagnoses a number sends the next person hunting a saving that is
   not there — here, rewriting two renderers to share one, when the DATA
   they render is already shared and the duplication was never the cost.
   Measure the built chunks before believing any story about them,
   including this one.

   THE RULE STILL STANDS, unchanged: entry beginning to genuinely track
   total is the moment to take something out instead of buying more.
   This was not that. Five raises in a day still is a pattern worth
   naming, and the next one should be argued for rather than assumed.

   The stopping rule itself is unchanged and this still satisfies it: a
   screen earns a raise. A dependency, a polyfill or a component library
   still buys nothing. */
/* TOTAL 420 -> 422 KB, for the Duty Holder escalation. ENTRY UNMOVED
   at 213.5 KB.

   THE SIXTH RAISE, AND THE LAST RECEIPT SAID IT HAD TO BE ARGUED FOR
   RATHER THAN ASSUMED. So, the argument.

   WHAT IT BUYS. Doc 9859 tells an operator what a risk IS and is close
   to silent on who may carry it. The UK Military Aviation Authority's
   RA 1210 is not silent: high and medium risks are managed by the
   Operating Duty Holder, low risks by the Delivery Duty Holder, and the
   ownership and referral protocol is written into the safety management
   system rather than left to custom.

   In a three-aircraft operator that silence resolves the wrong way by
   default. Whoever assessed the hazard writes their own name in the
   owner box, an amber risk ends up owned by the person least able to
   spend money on it, and the register reads as managed while nothing
   about it is. An ALARP judgement is a judgement about cost against
   safety; leaving it with a post that cannot authorise the spending is
   asking somebody to certify that further reduction is not reasonably
   practicable when they could not have tried.

   WHY IT IS WORTH A KILOBYTE WHEN THE LAST FIVE RAISES WERE ALSO WORTH
   IT. Because this one is not a screen or a table — it is a rule the
   incumbents do not apply to this segment, taken from a regulator that
   does, and it costs 0.9 KB on a lazily-loaded toolkit. If a raise has
   to be argued rather than assumed, "borrowed from a live regulatory
   article, mutation-checked, and invisible to the reporter at a strip"
   is the argument.

   THE STOPPING CONDITION IS STILL NOT MET, and it is worth restating
   precisely because six raises invites the assumption that it is:
   ENTRY has not moved. It is 213.5 KB, where it was five raises ago. A
   reporter downloads what they downloaded this morning; every kilobyte
   since has landed on screens only a safety manager opens.

   The rule remains: entry beginning to track total is the moment to
   take something out rather than buy more. A dependency, a polyfill or
   a component library still buys nothing. */
/* TOTAL 422 -> 426 KB, for the report disposition. ENTRY UNMOVED at
   213.5 KB, for the seventh raise running.

   MEASURED FIRST THIS TIME, because the receipt two raises ago
   misdiagnosed an 82-byte entry move as hoisting when it was
   chunk-registry overhead, and the lesson recorded then was to measure
   the built chunks before believing any story about them — including
   one written in this file. Built at the merge base, built again, and
   differenced:

     triage chunk   8,686 -> 12,655   +3,969 bytes
     total js     431,594 -> 435,449  +3,855 bytes

   The total grew LESS than the one chunk did, so the rest of the
   bundle came down slightly. All of the weight is in the lazy route
   that gained the feature, and none of it is anywhere else. That is
   the shape a raise should have, and it is the reason to measure
   rather than to reason about it.

   WHAT IT BUYS. ReportState has had five values since the first
   migration and four were unreachable, because no route wrote the
   column. Every report ever filed was SUBMITTED, permanently. The
   queue could only grow, and element 2.1's own evidence line asks for
   a report rate "that is trending". This is the screen that moves a
   report: triaged, investigated, closed with a statement of what was
   done, reopened with a reason.

   It also closes the gap the README has disclosed since the first
   release — the queue read this handset rather than the operator. It
   now reads both, unioned on clientId, and says so when the safety
   office cannot be reached rather than showing one device's reports as
   though they were the organisation's.

   WHAT IT DELIBERATELY DOES NOT BUY. The state machine itself is NOT
   in this bundle. The browser renders the moves the SERVER says this
   person may make, so the permission matrix exists once; shipping
   disposition.ts to the client would have cost another ~4 KB and
   bought a second copy of the matrix that could disagree with the
   first. Checked in the built output: the module is in no chunk.

   THE STOPPING CONDITION IS STILL NOT MET, and seven raises is exactly
   when to check rather than assume. ENTRY is 213.5 KB, where it was
   six raises ago. A reporter at a strip files a report; they do not
   open the triage queue, and everything bought since has landed on
   screens only a safety manager opens.

   The rule is unchanged: entry beginning to track total is the moment
   to take something out rather than buy more. */
/* TOTAL 426 -> 436 KB and CSS 54 -> 56 KB, for the risk picture.
   ENTRY MOVED, 213.5 -> 213.7, FOR THE FIRST TIME IN SEVEN RAISES —
   and that is the part of this receipt worth reading.

   MEASURED, as the last one was:

     picture chunk        0 ->  8,384   a new lazily-loaded route
     entry          218,600 -> 218,801  +201 bytes
     css             53.6KB ->  55.4KB  +1.8 KB

   WHAT THE 201 BYTES ACTUALLY ARE. Checked in the built entry chunk
   rather than assumed: the string "The risk picture" twice — once as
   the sitemap label the header and footer render from, once as the
   route title. Neither picture.ts nor the screen is in entry; grepped
   for, and absent. So the entry cost of a new destination is its NAME,
   which is the floor and cannot be optimised away short of not having
   the destination.

   WHAT IT BUYS. The MAA aggregates what its reporting system brings in
   into a risk picture and uses that to decide where to look next; RA
   1210 requires risk decisions to be "recorded and communicated across
   all relevant stakeholders", and a decision communicated one row at a
   time has not been communicated. It is also the largest single gap
   against SMS Pro, Q-Pulse, Centrik and iQSMS, all four of which lead
   with a dashboard.

   And it carries the one thing none of those four has: which risks are
   owned BELOW the authority their band requires. Every incumbent shows
   a register by band. None asks whether the name in the owner box is
   senior enough to carry the row, because Doc 9859 does not ask it.

   THE STOPPING CONDITION IS NOW IN SIGHT, and this is the receipt that
   has to say so plainly rather than the one after it. Entry is 213.7 of
   214: THREE HUNDRED BYTES. Six receipts have said "entry has not
   moved" and used that to justify the raise; this one cannot, and the
   rule those receipts wrote was that entry beginning to track total is
   the moment to take something out rather than buy more.

   So the next destination does not get added on these terms. Either
   something comes out of entry first — the sitemap's labels are the
   obvious candidate, since they are strings rendered into a menu that
   is already lazily hinted — or the entry budget gets argued up on its
   own merits, in its own receipt, with the reporter at the strip named
   in the argument. Not folded into a raise for something else.

   A dependency, a polyfill or a component library still buys nothing. */
/* TOTAL 436 -> 438 KB, for the CAPA loop. ENTRY UNMOVED at 213.7, AND
   THAT IS THE POINT OF THIS ENTRY IN THE LEDGER.

   The receipt above said the next DESTINATION does not get added on
   these terms, because entry had 300 bytes left. This is not a
   destination. The corrective actions were going to be /actions with
   its own nav item — which would have cost another ~200 bytes of entry
   for the label, on the rule I had just written — so they went onto the
   risk picture instead, under an in-page anchor.

   That is a better answer on its own merits and not only on the budget:
   "what is outstanding" is an assurance question, and the risk picture
   is the assurance screen. Two screens would have split one question.

     picture chunk   8,384 -> 10,096   +1,712 bytes
     entry         218,801 -> 218,801  UNMOVED
     capa.ts                            in NO browser chunk

   capa.ts is server-only, deliberately and checked in the built output:
   the screen renders a summary the API computed, so the status
   arithmetic exists once. The same choice as disposition.ts, for the
   same reason — a second copy in the browser is the copy that
   disagrees.

   WHAT IT BUYS. The product could record that something was DONE — a
   note on a closure, a string on a finding, controls on a register
   entry — and could not treat the action as an object with an owner, a
   date and a verification. So an undertaking lived as prose inside
   whichever record mentioned it, and no screen could answer "what is
   outstanding". It is the second half of two elements already claimed:
   2.2's evidence is "mitigations tracked to closure" and 3.3's is
   "findings closed AND VERIFIED".

   And the rule that makes the loop worth anything: an action cannot be
   verified by the person who completed it. Mutation-checked in both the
   unit suite and the integration suite.

   THE ENTRY RULE STANDS AND HAS NOW BEEN APPLIED ONCE. 300 bytes of
   headroom. The next thing that wants a nav item takes something out
   first, or argues the entry budget up in its own receipt. */
/* TOTAL 438 -> 442 KB, for the emergency contact directory. ENTRY
   UNMOVED at 213.7 for the second raise running, and for the same
   reason: this is not a destination either.

     sms chunk   21,690 -> 25,509   +3,819 bytes
     total js   446,992 -> 451,350  +4,358 bytes
     css         56,734 ->  57,041    +307 bytes
     entry      218,801 -> 218,801  UNMOVED
     erp.ts                          in NO browser chunk

   AND THE FIRST ATTEMPT TO MEASURE THIS WAS WRONG, which is worth
   recording because it produced a plausible answer. `git stash`
   reported every delta as ZERO — sms chunk +0, total +0, css +0 — and
   zero is exactly what a well-split change is supposed to look like at
   entry, so it read as a good result. It was not: stash leaves
   UNTRACKED files in place, every new file here was untracked, and so
   both "builds" were the same tree. `git stash -u` gave the real
   numbers above.

   That is the third time a receipt in this file has been measured
   rather than reasoned about, and the second time measuring caught
   something reasoning would have shipped. The rule stands: build both
   sides, difference them, and check the tool did what you think.

   WHAT IT BUYS. Element 1.4 to BUILT, and the coverage figure to 11 of
   12. The product held the EXERCISE record — what an inspector asks —
   and not the contact directory, which is what an operator needs at
   three in the morning. Annex 19's element is "COORDINATION of
   emergency response planning", and coordination is a list of people
   outside the organisation who have agreed to answer.

   The feature is not the list; it is `verifiedOn`. A contact directory
   is not wrong when it is written, it goes wrong quietly, and the
   operator finds out which numbers still work during the emergency. So
   staleness is computed against each contact's own last verification
   on every read, a new contact is never recorded as confirmed, and a
   confirmation cannot be backdated. No status column exists to go stale
   beside the numbers.

   IT DID NOT BECOME A SCREEN, for the second time running. /erp with a
   nav item would have cost ~200 bytes of entry against 300 remaining.
   It went onto /sms under element 1.4, which is where it belongs
   anyway — the exercise and the directory are two halves of one
   element, and splitting them would put half of 1.4's evidence where
   nobody looking at 1.4 would find it.

   ENTRY IS STILL 213.7 OF 214. The rule has now shaped two consecutive
   features and both are better for it. */
/* TOTAL 442 -> 446 KB, for the de-identification notice and the
   indicator feed. ENTRY UNMOVED at 213.7 for the THIRD raise running,
   and CSS unmoved — neither of these is a new screen.

     pages chunk  27,965 -> 29,510  +1,545   the privacy section
     spi chunk    22,069 -> 23,993  +1,924   the observed-count control
     total       451,350 -> 454,996 +3,646
     entry       218,801 -> 218,801  UNMOVED
     css          57,041 -> 57,041   UNMOVED

   THE FIRST TWO ATTEMPTS TO MEASURE THIS BOTH REPORTED ZERO, for two
   different reasons, and both looked like a clean result:

     · `git stash` without -u leaves untracked files in place, so both
       builds were the same tree. That one is recorded in the receipt
       above; it happened again here before it was remembered.
     · reverting only pages.js to measure its chunk in isolation made
       the CLAIMS GATE FAIL — the assertion added in the same change
       requires the privacy notice to cite L.N. 32 — so `npm run build`
       refused and dist was left holding the previous build. The gate
       working correctly presented as a zero delta.

   The numbers above are measured against a5a9d84, the commit that set
   the 442 budget, with everything since applied. They add up:
   1,545 + 1,924 = 3,469 of 3,646, the remaining 177 being chunk
   registry across 23 chunks. A receipt whose parts do not sum to its
   total is a receipt that has not been checked.

   WHAT IT BUYS. The privacy notice did not mention de-identification at
   all — the strongest protection this product offers, absent from the
   document an operator's lawyer reads. It now names L.N. 32 of 2026's
   Third Schedule, paragraph 3.1 Note 2, which makes the safeguard the
   instrument's answer rather than a courtesy we chose, and states the
   limit as well as the mechanism.

   And the indicator screen will now count the reports that arrived in a
   period. That is the "indicators are typed, not fed" debt, paid down
   as far as it honestly can be: the figure is OFFERED beside the field
   and never filled in, because an indicator counts a particular thing
   and a quarter's report count is not that thing unless the operator
   says so. A label the product cannot date is refused rather than
   guessed at.

   ENTRY HAS NOT MOVED IN THREE RAISES. It is 213.7 of 214, where it
   was before the risk picture. Everything bought since sits on screens
   a reporter at a strip never opens. */
/* CSS 56 -> 57 KB, for the printed pack. AND ENTRY BROKE ITS BUDGET ON
   THE WAY HERE, which is the part of this receipt that matters.

   WHAT HAPPENED. The printed record needs the operator's NAME, so a
   loader for it went into session.js — and session.js is in the entry
   chunk, because the shell needs authentication on every screen. Entry
   came out at 214.2 KB against 214. The first time it has broken its
   budget, and precisely the moment the two receipts above said would
   come: entry beginning to track total is when to take something out
   rather than buy more.

   IT WAS TAKEN OUT, NOT ARGUED UP. The operator's name is needed by two
   lazily-loaded documents and nowhere else; it had no business in the
   shell. It moved to print-id.js, which both of those documents already
   import, and entry returned to 213.8. Only the storage key stays in
   session.js, because signing out has to clear it.

   That is the rule doing its job for the third time, and the first time
   it has REFUSED something rather than shaped it. The budget was not
   raised to accommodate a mistake; the mistake was corrected.

   WHAT THE CSS BUYS, AND WHO PAYS FOR IT. About 500 bytes of print
   rules — and unlike a lazy chunk, the stylesheet is loaded on EVERY
   page. The reporter at the strip pays for rules only a safety manager
   uses. Stated plainly, because that is the trade:

     · a record no longer splits across a page break, so half a finding
       on one page with its owner and due date on the next stops
       happening;
     · orphans and widows at three, so paragraphs read as typeset
       rather than as flowed;
     · a heading never sits at the foot of a page with its content
       overleaf;
     · and an identity block printing the operator name and AOC number
       at the top of the document.

   The last is the reason for the rest. /sms and /picture are the two
   screens an operator prints, hands over, and lets somebody read as
   loose paper, and a pack with no operator name on it is a pack an
   auditor cannot attribute. Half a kilobyte on every load buys the
   artefact that reaches a regulator looking like it was meant for them.

   A reporter filing offline never sees it and does pay for it. That is
   the honest shape of the trade, and it is worth making once. */
/* TOTAL 446 -> 456 KB, for two capabilities that had no interface at
   all. ENTRY UNMOVED at 213.8 for the fourth raise running.

   THIS IS NOT A FEATURE RAISE. It is the cost of making two things
   REACHABLE that the coverage page already claimed were built:

     · /api/v1/actions shipped with create, complete, verify and cancel,
       fully tested, named in element 2.2 and 3.3 — and no screen posted
       to any of them. The risk picture rendered "Outstanding / Overdue
       / Awaiting verification" over a table nothing could put a row in,
       so all three read zero permanently.
     · /api/v1/changes was worse. Element 3.2 was marked BUILT, the
       route was named in its coverage entry, and /sms pointed an
       operator at /toolkits/sra — the safety risk assessment, which is
       a different instrument answering a different question. A change
       assessment could not be recorded, approved or reviewed from
       anywhere in the product.

     sms chunk      25,680 -> 30,023  +4,343   element 3.2 as a surface
     picture chunk  10,237 -> 13,838  +3,601   the actions list and its work
     triage chunk                     + ~900   raise an action from a report
     entry         218,801 -> 218,801  UNMOVED
     css             57.0K -> 56.9K    within budget

   Both were found by a new claims assertion rather than by looking:
   NO WRITE ROUTE EXISTS THAT NO SCREEN CAN REACH. Ten kilobytes to
   stop the coverage page describing a product an operator cannot
   operate is not weight, it is the difference between a claim and a
   capability.

   AND THE FIRST VERSION OF THAT GATE COULD NOT FAIL. It matched the
   path prefix, and the risk picture READS /api/v1/actions with a GET,
   so every write route sharing the prefix looked reachable — including
   the four that were the reason for the check. Mutation-checking it by
   renaming one call site left it green. The second version required
   the method and the path to sit near each other and failed on
   fourteen correct routes, because the SMS screen posts through a
   descriptor and the path lives in a map far from the verb. The
   version that shipped asserts the narrow thing that actually
   happened twice — a route the browser has never heard of — and says
   in its own comment what it does not catch.

   ENTRY IS 213.8 OF 214 AND HAS NOT MOVED IN FOUR RAISES. */
/* ENTRY 214 -> 215 KB. The first entry raise since the session layer,
   and the receipt three previous ones said it would have to be: argued
   on its own merits, with the reporter at the strip named.

   WHAT IT BUYS, in one sentence: the reporter is told that an accident
   is notified to the accident INVESTIGATION authority immediately, and
   that this is not the 24 hours shown beside it.

   WHY THAT IS WORTH ENTRY BYTES WHEN NOTHING ELSE HAS BEEN. Every
   previous raise was refused or diverted because what it bought sat on
   a screen only a safety manager opens, and the person paying was
   somebody filing a report at a remote strip who would never see it.
   This is the opposite. The deadline hint on the report form says
   Kenya expects an accident within 24 hours — true, and about the
   MANDATORY OCCURRENCE REPORT to KCAA. Annex 13 obliges the operator
   to notify the AAID immediately, and to preserve the wreckage. A
   reporter reading "24 hours" after an accident and concluding they
   have a day has been misled by an omission on the one screen they
   use, about the one duty where lateness is not measured in
   inconvenience.

   The person paying the two kilobytes and the person the two kilobytes
   protect are the same person. That is the test this rule has been
   applying all along, and it is the first time something has passed
   it.

   TRIMMED FIRST, AND THE TRIM IS RECORDED. The row went in at 215.8 KB
   carrying four paragraphs of justification as STRING VALUES on the
   registry object — regulations.ts is in entry, so a reporter was
   downloading an explanation, addressed to a developer, of why a phone
   number is absent. Comments are stripped by the bundler; string
   values are not. Moving that prose into a comment recovered 0.7 KB
   and left 1.1 KB.

   THEN TRIMMED AGAIN, AND THE CEILING CAME DOWN WITH IT. This first
   went in at 216 because the notice also told the reader to record the
   number in their emergency contact directory and linked there. That
   link was wrong twice over — the directory is behind a session and
   this form deliberately is not, so the anchor did not exist for the
   reader being sent to it; and the sentence was addressed to the
   safety office while sitting on the reporter's screen. Cutting it
   left 214.8 KB, so the budget is 215 rather than the 216 that was
   argued for. A ceiling that stays where a raise left it after the
   thing it was raised for has shrunk is not a budget, it is a
   watermark — and the next change would have spent the difference
   without ever making a case for it.

   NO TELEPHONE NUMBER IS IN THE BUNDLE, asserted twice — over the
   registry in the unit suite and over the rendered form in smoke, both
   mutation-checked by putting a number back and watching each go red.
   An accident notification line typed into software by somebody who
   never dialled it is worse than no number, and the operator's own
   contact directory is where a confirmed one belongs.

   THE RULE IS UNCHANGED FOR EVERYTHING ELSE. Entry is 214.8 of 215 and
   the next thing that wants space still takes something out first. */

/* TOTAL 458 -> 466 KB and CSS 57 -> 59 KB, for the codes a State files.
   ENTRY IS UNCHANGED AT 214.8, and that is the whole argument.

   WHAT IT BUYS. This product classifies a report with its own six
   types, which describe what kind of REPORT arrived. That is not what
   an authority files. ICAO's ADREP taxonomy — maintained in detail by
   EASA as ECCAIRS, with occurrence categories from the CAST/ICAO Common
   Taxonomy Team — is, and an operator whose reports carry no code hands
   its State data somebody has to re-code by hand. Hand-coding drifts.

   WHERE THE WEIGHT WENT, MEASURED RATHER THAN ASSUMED. The triage chunk
   went 14.5 -> 21.3 KB and every other JS chunk was untouched; the
   taxonomy appears in exactly one chunk, checked by grepping the built
   output for a code rather than by trusting the import graph. That is
   the module, twenty grouped choices of markup, the caveat and the
   handler.

   AND IT IS IN THE TRIAGE CHUNK BY DESIGN, NOT BY LUCK. Coding an
   occurrence to ADREP is a trained judgement made after reading a
   narrative — the safety office's job, not the reporter's, which is the
   same reason the report form does not ask whether an event meets Annex
   13's definition of an accident. Putting the picker on the form would
   have been both the wrong product decision and seven kilobytes onto
   the one chunk a reporter at a remote strip downloads. The two
   answers agreed, which is usually the sign the reasoning is right.

   THE CSS RAISE IS THE PART TO BE UNCOMFORTABLE ABOUT, and it is
   recorded rather than waved through. There is ONE stylesheet, so the
   1.6 KB of classification-panel rules is paid by every reporter on
   first load for a panel only the safety office ever opens. That is
   the known cost of a single stylesheet and it was accepted once
   before, for the printed pack. It should not be accepted a third
   time: if the next screen wants CSS a reporter cannot see, the answer
   is to split the stylesheet, not to raise this number again. */
/* TOTAL 466 -> 471 KB and CSS 59 -> 60 KB, for the operator's own
   words. ENTRY IS UNCHANGED AT 214.8 for the third change running, and
   that is the number this rule is about.

   WHAT IT BUYS. Every operator has been reading the same shipped
   vocabulary: the same aerodromes, the same aircraft, the same post
   titles, the same five words on the severity scale. A six-aircraft
   Kenyan AOC does not fly to most of the shipped strips and its
   accountable executive is called whatever its own manual calls them.
   Every incumbent lets an operator set this without a vendor change
   order; the benchmark is right that it is table stakes.

   WHERE THE WEIGHT WENT, MEASURED. The /sms chunk went 29.3 -> 34.9 KB
   and nothing else moved — checked by grepping the built output for a
   string only the new form carries, rather than by trusting the import
   graph. That is the form itself: three groups of renames, two lists,
   and the paragraph saying what the screen cannot change.

   THE SCREEN IS THE SAFETY OFFICE'S, WHICH IS WHY THIS PASSES. /sms
   needs a session and holds the organisation's record; a reporter at a
   remote strip never opens it and never downloads it. The same test the
   occurrence taxonomy passed: the person paying the bytes and the
   person the bytes serve are the same person.

   THE CSS RAISE IS THE THIRD, AND THE PREVIOUS RECEIPT SAID NOT TO MAKE
   IT. It said: "if the next screen wants CSS a reporter cannot see, the
   answer is to split the stylesheet, not to raise this number again."
   That was the right rule and this is 0.9 KB against it — five rules
   for a two-column rename form. Raised rather than split because
   splitting the stylesheet is a change to how every screen loads and
   should not be done incidentally, inside a change about tenant
   configuration, at the end of a long session. IT IS THE LAST ONE. The
   next CSS raise splits the sheet first; this receipt is the record
   that the debt was taken knowingly rather than forgotten. */
/* TOTAL 471 -> 472 KB. 0.9 KB, for thirteen occurrence categories the
   taxonomy has and this product did not — and one of them makes this
   the least arguable raise in the file.

   RI, RUNWAY INCURSION, WAS MISSING. It is among the most consequential
   occurrence types in aviation. An operator classifying one found
   nothing that fitted: the conscientious answer was OTHR and the likely
   answer was something adjacent and wrong. A taxonomy missing its
   highest-frequency serious category does not fail loudly — it produces
   confidently mis-coded data, and mis-coded data is worse than absent
   data because somebody trusts it.

   The other twelve are ADRM, AMAN, ATM, EVAC, FUEL, GTOW, LOC-G, LOLI,
   NAV, UIMC, USOS and WSTRW. Twenty categories became thirty-three.

   ENTRY UNCHANGED AT 214.8 for the fourth change running, and the
   weight is in the triage chunk where the taxonomy already lives —
   classification is the safety office's act and a reporter at a strip
   downloads none of it.

   NOT A CSS RAISE. The previous receipt's rule stands: the next CSS
   raise splits the stylesheet first. This is JS, and it is nine
   hundred bytes to stop a runway incursion being filed as "other". */
/* TOTAL 472 -> 475 KB for the handoff. CSS NOT RAISED, AND THAT IS THE
   part of this receipt worth reading.

   The previous CSS receipt said: "if the next screen wants CSS a
   reporter cannot see, the answer is to split the stylesheet, not to
   raise this number again." This feature came in 0.2 KB over. The
   choice was to split the sheet — a change to how every screen loads,
   made incidentally, at the end of a long session — or to build the
   strip on `.notice`, which already exists and already looks right.
   Reusing it cost three declarations instead of fifteen and left CSS at
   59.9 of 60. The rule was met rather than argued with, which is what a
   rule written down two commits earlier is for.

   WHAT THE JS BUYS. Four things in this product are computed and
   delivered to nobody: lapsing training, an unverified emergency
   contact, an approaching reporting deadline, an overdue corrective
   action. Real delivery is SMS and it is blocked on credentials that
   must not travel through a chat log. This is the part that needs
   none — the Web Share API and a mailto: link are both client-side, so
   the product writes the sentence and the safety manager sends it from
   whatever they already have open, which in this market is WhatsApp.

   IT IS NOT ALERTING AND THE BUDGET SHOULD NOT PRETEND IT IS. It
   reaches somebody who has already opened the screen. Element 4.1 stays
   PARTIAL, the coverage figure does not move, and two claims assertions
   hold both of those — because the way this feature does harm is by
   being mistaken for the thing it stands in for.

   WHERE THE WEIGHT WENT, MEASURED. The triage chunk went 21.3 -> 25.4
   KB and the composer appears in exactly one chunk, checked by grepping
   the built output. ENTRY UNCHANGED AT 214.8 for the sixth change
   running: a reporter at a strip does not open the triage queue. */
/* TOTAL 475 -> 478 KB for risk acceptance as an act. CSS NOT RAISED
   AGAIN, and the JS was cut in half before the number was touched.

   WHAT THE PRODUCT COULD NOT DO. Nothing in it could accept a risk.
   `acceptedById` and `acceptedAt` had been on the schema since the
   first migration and no code had ever written either; the acceptance
   permissions were in the matrix and no route read them; and the
   register took `status` from the request body, so any holder of
   `hazard.manage` — the Safety Officer included — could file the
   reddest cell on the Doc 9859 matrix already marked ACCEPTED, signed
   by nobody. The screen offered a dropdown headed "Accepted by" that
   wrote a post somebody chose from a list.

   A name typed into a box is not a signature. What the 3 KB buys is
   the act: a route that checks the permission, refuses the red band to
   everybody including the accountable executive, enforces RA 1210's
   escalation so an amber risk needs the post that can spend the money,
   requires the ALARP statement the SRA has always required and the
   register never inherited, records who signed and when, and names the
   band in the audit trail. Ten integration checks against a real
   Postgres cover it.

   TWO THINGS WERE REMOVED FROM THE WIRE ON THE WAY, which is why this
   is 3 KB and not 5.

   The CSS went 0.3 KB over first. The signature line now reuses
   `.verified`, `.reg-entry__nores` and `.reg-entry__flag` — the green
   "somebody signed this", the small tertiary aside and the ochre
   warning sentence that this exact card already used — so CSS is back
   at 59.9 of 60 and the standing rule that the next raise splits the
   stylesheet is still unspent.

   The authority ladder itself never reaches a browser. It went into
   packages/shared/src/signature.ts, imported only by the two routes
   that enforce it, because holder.ts is imported by two web chunks and
   freezes a record at module scope that Rollup cannot shake. The
   bundle argument and the design argument agreed: the client must not
   decide who may sign, it must send the act and show the server's
   answer — which names the post that has to sign instead.

   ENTRY UNCHANGED AT 214.8 KB for the seventh change running. A
   reporter at a remote strip does not open the risk register. */
/* TOTAL 478 -> 481 KB for the join between the two halves of this
   product. AND ENTRY MOVED, 214.8 -> 214.9, for the first time in eight
   changes — which is the number in this block worth reading.

   WHAT WAS NOT CONNECTED. `Hazard.reportId` has been in the schema
   since the first migration and nothing had ever written it. Reports
   arrived, were triaged, coded to ICAO's categories and dispositioned;
   the register held whatever somebody remembered to type again. So an
   operator's register was a list of hazards it imagined rather than the
   ones its own people found, which is the finding element 2.1 exists to
   prevent — and /coverage had been saying so in 2.2's own words for
   three releases.

   A hazard can now be raised from the report that revealed it, every
   entry records whether it came from the queue or was entered directly,
   and the register can answer the question an auditor actually asks:
   how much of this did your people find.

   WHAT DOES NOT TRAVEL IS THE NARRATIVE, and the weight reflects that.
   The link is an ID. The hazard's words are the safety officer's own,
   because a register is printed and shown to an inspector while a
   report is protected and may be anonymous. An integration check
   mutation-tested that: restoring the obvious implementation — copy the
   report's narrative into the hazard — takes it red on a colleague's
   name appearing in a register.

   THE ENTRY 0.1 KB IS THE ROUTER, AND IT BOUGHT A DEFECT FIX. The
   navigator stripped every query string: `normalise()` correctly
   removes ? and # to match a route, and the stripped result was then
   pushed to history as the whole URL. So a link pasted into the address
   bar kept its query and the same link clicked inside the product lost
   it. Nothing had used one until this change, which is why it had never
   been seen. Entry now has 0.1 KB of headroom and the next change to
   the shell has to find savings rather than assume room.

   The rest is the register and triage chunks, both lazily loaded: a
   reporter at a remote strip opens neither. */
/* ENTRY 215 -> 217 KB AND TOTAL 481 -> 492, for the two things that
   turned this from a product that can be demonstrated into one that can
   be bought.

   THE ENTRY RAISE IS THE ONE TO ARGUE WITH, so here is the whole of it.

   WHAT WAS MISSING. Nineteen screens, fifty-four routes, eleven of
   Annex 19's twelve elements — and no route that creates an
   organisation. The only way an operator could come into existence was
   `npm run seed`, run against the database by somebody holding the
   credentials. A product that has to be installed by its author for
   every customer is a consultancy deliverable wearing a product's
   feature list, and no amount of further engineering was going to
   change that.

   So: `POST /api/v1/auth/signup`, a /signup screen, and a /pricing
   screen that renders from one declaration of the price rather than
   repeating it.

   WHERE THE ENTRY KILOBYTE ACTUALLY WENT, measured rather than assumed.
   Not the forms — those are in their own chunks. It is the ROUTER
   TABLE: this is a client-side router and every registered route costs
   an entry in it plus a dynamic-import stub, about half a kilobyte
   each. That is the honest price of a screen existing at all, and it is
   the same price the other nineteen paid.

   TWO ATTEMPTS CAME OFF THE WIRE FIRST, and both were the same mistake
   this file has recorded twice before:

     · the signup form began INLINE in the account screen, which is
       eager because signing in is what sends a queued report. Entry
       went 214.9 -> 220.5 — 5.6 KB charged to every ramp agent at a
       remote strip, to carry a form an operator fills in once in its
       life. Moving it behind a lazy import left half a kilobyte of slot
       and loader still on the eager screen; making it a DESTINATION
       removed even that, and is the honester shape — signing up is a
       different job from signing in;
     · `SignupSchema` went into the shared barrel, which the report form
       imports for CreateReportSchema, so a zod object describing that
       same once-in-a-lifetime form rode in the entry chunk. Split into
       ./signup, imported by the API and by nothing in the browser —
       exactly what permissions.ts was split out for.

   Without those two, this raise would have been 215 -> 221.

   WHAT THE REPORTER GETS FOR THEIR KILOBYTE: an operator that can sign
   up on a Sunday evening without calling anybody, which is the only way
   the product ever reaches the reporter at all. */
/* TOTAL 492 -> 494 KB. ENTRY UNMOVED AT 216.0, and that is the whole
   argument rather than a footnote to it.

   WHAT IT BOUGHT: the tutorial's second act. The five steps it had
   ended exactly where an SMS begins — file, read the deadline, watch
   the queue, sign in, set a review cadence. An operator who followed
   every one of them finished with a queue that drains and no idea how
   to produce the things an auditor actually asks for: a hazard raised
   from the report that revealed it, an assessment with an ALARP
   justification, a risk accepted by somebody senior enough to accept
   it, a corrective action closed on evidence, one indicator with a
   period behind it. All five screens existed. Nothing walked anybody
   into them.

   That is a churn problem before it is a documentation problem. The
   product is sold on being an SMS rather than a reporting inbox, and
   the only path from one to the other was reading the source.

   WHERE THE WEIGHT LANDED, and why this raise is cheap where the last
   one was expensive. It is content inside the `pages` chunk, which is
   lazily loaded and shared with About, Questions, Privacy and Terms. A
   reporter at a remote strip filing a report never fetches it. The
   people who pay the 1.3 KB are the ones reading the documentation,
   which is the audience it is for.

   WHICH EXPOSES THE REAL LIMIT, recorded here because the next person
   will hit it. `js (total)` cannot tell weight a REPORTER pays from
   weight a PROSPECT pays — it sums both, so documentation competes for
   budget with the offline-filing path. That is the same defect the CSS
   budget has, where one number sums every stylesheet and splitting the
   file therefore buys nothing. Both want the shape `entry` already has:
   two numbers, one for what must arrive before somebody can file and
   one for everything else. Until that exists, raises like this one have
   to be argued in prose instead of being obvious from the figure. */
/* TOTAL RAISED 494 -> 495 KB. One kilobyte, and the receipt is short
   because what it bought is unusually easy to state.

   /today is the screen a safety manager opens first, and every
   judgement it made lived inside a render function that NOTHING
   EXECUTED. The accessibility sweep and the smoke suite both meet that
   screen signed out, so the reporter view, the digest view and both
   failure branches shipped with no test touching them. That is the same
   shape as the scheduled digest function found broken in production the
   same morning: code a deploy runs and a suite does not.

   The judgement moved to packages/shared/src/today.ts — the split
   digest.ts and mail.ts already use, where the module holds what to say
   and the screen holds how it looks — and eighteen assertions now cover
   it. Three of those are the ones worth the kilobyte: an unknown is
   never "clear". A screen whose whole job is to answer "is everything
   all right" must not say the most reassuring possible thing at the
   moment it knows least, and before this it could.

   WHERE THE WEIGHT LANDS. today.ts is imported by /today, which is
   LAZY — a reporter at a remote strip filing a hazard never fetches it.
   The entry chunk is untouched at 212.3 of 217, which is the number
   that gates time-to-first-report and the one these receipts have said
   six times over is the one to protect.

   AND THE SAME LIMIT THE LAST RECEIPT NAMED still applies: `js (total)`
   sums what a REPORTER pays with what a SAFETY OFFICE pays, so a screen
   only managers open competes for budget with the offline-filing path.
   Until that becomes two numbers the way `entry` already is, raises
   like this one have to be argued rather than read off the figure. */
/* TOTAL 495 -> 500 KB, for the five attributes a State files beside the
   occurrence category. ENTRY UNMOVED at 212.3 for the third raise
   running, and CSS UNMOVED TOO, which is the part of this receipt worth
   reading.

     triage chunk   22,696 -> 28,013   +5,317 bytes
     total js      505,997 -> 511,314  +5,317 bytes
     entry         217,441 -> 217,441  UNMOVED
     css            61,438 ->  61,438  UNMOVED

   THE TOTAL GREW BY EXACTLY WHAT THE TRIAGE CHUNK GREW BY, to the byte.
   Nothing else moved, which is the shape a correctly-split change makes
   — and the last receipt records how a plausible set of zeroes turned
   out to be `git stash` leaving untracked files in place, so both sides
   here were built with `git stash -u` and differenced.

   CSS DID NOT MOVE BECAUSE NOTHING WAS ADDED TO IT. The css budget was
   at 60.0 of 60 KB before this change — no headroom at all — so the
   panel reuses `.queue__cat`, `.queue__cat-opt` and `.queue__codes`
   rather than declaring a parallel set of `.queue__attr` rules that
   would have looked identical and cost a kilobyte. Five radio groups
   are the same widget as twenty checkboxes with a different input type,
   and the stylesheet already knew how to lay that out.

   WHAT IT BUYS. cicttCodes says WHAT HAPPENED. These five say how badly
   it hurt somebody, what it did to the aircraft, whether it was dark,
   whether the crew could see, and what kind of flight it was — the
   denominators without which "eleven runway excursions" is a number
   nobody can act on and with which it becomes "nine of them at night,
   seven on non-scheduled sectors, two with substantial damage".

   The weight is the HINTS, and they are the reason this is 5 KB rather
   than 1. A radio labelled "Substantial" with nothing beside it gets
   picked by feel; one that says the definition turns on structural
   strength, performance or flight characteristics and that an exclusion
   list decides most cases sends a borderline case to Annex 13. The
   vocabulary is cheap and the judgement is what costs — which is the
   same trade `CICTT_CAVEAT` already pays for on the same screen.

   IT COSTS THE REPORTER NOTHING, and that is why the entry figure did
   not move. adrep.ts is imported by the triage screen alone, by path,
   for the same reason cictt.ts is: coding to ADREP is a trained
   judgement made after reading a narrative, so a reporter at a remote
   strip downloads none of it.

   THE ENTRY RULE STILL STANDS. Entry beginning to track total is the
   moment to take something out instead of buying more, and it has now
   held flat across three consecutive raises. */
/* CSS 60 -> 61 KB, for the identifier face, and it is FOUR
   DECLARATIONS. The stylesheet had two bytes of headroom — 61,438 of
   61,440 — which is why this raise exists at all rather than being
   absorbed the way a normal rule would be.

     css        61,438 -> 61,747  +309 bytes
     entry     217,441 -> 217,441 UNMOVED
     total js  511,314 -> 511,314 UNMOVED

   WHAT IT BUYS. `--us-font-mono` was declared in the brand file and
   read by NOTHING — a token naming a system stack that no rule ever
   applied. Pointing it at a self-hosted face without also using it
   would have been worse than leaving it alone: the service worker
   precaches by extension, so the file would have been downloaded by
   every reporter on install and rendered on no screen.

   So it goes where the confusion is real. A CICTT category and an
   aircraft type mix letters and digits — LOC-I, SCF-PP, C208, B738,
   F100, L410 — and a proportional face lets 0 and O, or 1 and l, land
   on the same shape. The code goes mono; its NAME beside it stays in
   the body face, because that is prose.

   AND THE HONEST LIMIT, recorded because it is the reason this is 309
   bytes rather than a typographic pass: the strongest case for a mono
   face is the audit-chain hash, and NO HASH IS RENDERED ANYWHERE IN
   THIS PRODUCT YET. When the verification output gets a surface, it
   reads --us-font-mono and this is already paid for. Until then the
   claim is the codes, and the receipt says so rather than implying the
   larger one. */
/* TOTAL 500 -> 501 KB, for the operator's profile at signup. ENTRY
   MOVED 140 BYTES and that is the whole exposure a reporter has to it.

     signup chunk   4,440 ->   5,596  +1,156 bytes
     total js     511,366 -> 512,752  +1,386 bytes
     entry        217,493 -> 217,633    +140 bytes
     css           61,747 ->  61,747  UNMOVED

   THE 140 ENTRY BYTES ARE THE SITEMAP ENTRY FROM THE COMMIT BEFORE
   THIS ONE, not this change — the vocabularies ride in the lazily
   imported signup panel, which is where that module was split out to
   in the first place and for exactly this reason.

   WHAT IT BUYS, AND THE FIRST PART IS A BUG RATHER THAN A FEATURE. The
   signup form has always rendered a fleet-size field, the panel has
   always posted it, SignupSchema has always validated it — and the
   org.create never wrote it. Every operator that ever signed up typed
   how many aircraft it flies and left fleetSize null, which is the one
   input billableBand() derives pricing from. The symptom was silence:
   no error, no wrong invoice, an operator that could not be billed and
   nothing saying why.

   THEN THE DENOMINATORS. What the operator flies, where from, and what
   kind of flying — coded against AIRCRAFT_TYPES, AERODROMES and the
   same OPERATION_TYPES the triage panel codes an occurrence's type of
   operation against, so a declared profile and a coded occurrence group
   together rather than being two vocabularies for one fact. "Four
   runway excursions" against two Caravans out of Wilson is a different
   fact from four across a mixed fleet on the northern network, and
   nothing in this product could tell them apart.

   ASKED HERE BECAUSE IT IS THE ONE MOMENT SOMEBODY IS ALREADY
   DESCRIBING THEIR OPERATION. A profile filled in later from a settings
   screen is a profile that stays empty, and an empty denominator makes
   every rate on every dashboard a count.

   COLLAPSED, AND ALL THREE OPTIONAL. `details` groups rather than a
   native multi-select, which on a handset is a scroll region with no
   visible affordance for choosing more than one. This is the only
   unauthenticated route that writes and the customer it exists for is
   evaluating the product on a Sunday evening — a required multi-select
   between them and a working account loses the customer rather than
   getting answered.

   THE ENTRY RULE STILL STANDS at 4.5 KB of headroom. */
/* TOTAL 501 -> 502 KB, and every byte of it is a screen learning to say
   "I do not know". ENTRY moved 200 bytes for two 737 variants.

     register chunk   +~900 bytes  (the third state and the refusal)
     entry           212.5 -> 212.6 KB   +2 aircraft types
     total js        501.6 KB of 502
     css             UNMOVED — the panel reuses .notice--error

   WHAT IT BUYS, AND IT IS THE FOURTH TIME THIS DEFECT HAS APPEARED. The
   register's load() returned `[]` when the stored copy could not be
   parsed, and the screen rendered "Nothing on the register yet. The
   first entry is usually the hazard behind the last report somebody
   filed." A safety manager whose store is damaged was told they had not
   started one — and the reasonable next action after reading that is to
   type an entry, on top of entries that are there and cannot be shown.

   THE IRONY WAS TWELVE LINES DOWN. save() already carried a comment
   citing charter rule 8 — a refused write is reported, never swallowed
   — and returned a boolean the caller surfaces. The READ path never got
   the same treatment. Same file, same rule, one direction.

   AND THE WARNING WAS NOT ENOUGH ON ITS OWN. The first version of this
   change said "do not add an entry until it reads again", which is
   telling somebody not to do a thing the software will happily let them
   do — the same shape as a coverage entry that overstates. The submit
   handler now REFUSES while the store is unreadable, and refuses rather
   than queues, because the one store this screen has is the one that
   cannot be read.

   THE B733 AND B734 are the other 200 bytes. The list carried the 737
   NG and MAX and neither Classic — the two variants an East African
   regional freight or charter operator is most likely to be flying. A
   type list that cannot name a customer's whole jet fleet sends that
   fleet to the free-text escape, which is the half nobody can count. */
/* TOTAL 502 -> 513 KB and CSS 61 -> 62, for the account area. ENTRY
   MOVED 0.3 KB, which is the whole exposure a reporter has to any of
   it.

     account-home chunk       0 ->  4,341 bytes   NEW
     profile chunk            0 ->  5,893 bytes   NEW
     total js           501.7 KB -> 512.0 KB
     entry              212.6 KB -> 212.9 KB   +0.3, a route and a footer link
     css                 61,747 -> 62,515      +768 bytes, six rules

   TEN KILOBYTES IS A LOT AND IT IS ALL PROSE. Both modules are mostly
   copy: what changing a password will do before it does it, why the
   current one is asked for, why the email is not editable here, and
   what a failed save did and did not change. That text is the feature.
   A password form that signs a person out of every device without
   saying so first teaches them not to change their password again,
   which is the opposite of what this route exists for.

   IT COSTS THE REPORTER 0.3 KB, and that is the number the entry budget
   exists to protect. Both files are lazily imported — account-home.js
   from the account screen, profile.js from its route — the same split
   that admin-reset.js, export-panel.js and signup-panel.js already use,
   and for the same reason: the account screen is EAGER because signing
   in is what sends a queued report, so anything added to it directly is
   parsed before first paint by somebody filing a hazard at a strip.

   WHAT IT BUYS, AND THE SECOND HALF IS A LIVE SECURITY GAP. The first
   is navigation: eighteen destinations existed and no page answered
   "what can I do here", so every role met the same menu and learned by
   refusal which screens were not theirs.

   The second is that NOBODY COULD CHANGE THEIR OWN PASSWORD. The
   administrator reset route ends by saying "hand it over directly and
   have them change it" — and nothing could. A temporary password
   generated by an administrator and handed over in person was the
   PERMANENT password of that account: an instruction with a wording and
   no mechanism, the same shape the demo-password rotation had before
   `--rotate` was written, on an account that reads every narrative in
   the operator.

   THE CSS IS SIX RULES AND REUSES THE GRID. The card layout is
   .picture-grid — the same auto-fit that lays out the risk picture's
   figures — because cards per row should follow the width rather than a
   breakpoint somebody keeps in step with a count by hand. Only what a
   list needs beyond a figure grid is new.

   ---------------------------------------------------------------
   CSS 62 -> 63 KB, AND THE RECEIPT IS TWO RULES.

   `.fact` and `.fact strong`: a cell that is neither a link nor a
   figure. .picture-grid already lays out auto-fit cells and
   .account-card already styles one, but that rule hangs off `a` and
   these are not links — so this is the same cell without the anchor,
   and deliberately without a hover, because a card that lifts under
   the pointer and does nothing when clicked is worse than a plain one.

   WHAT IT BOUGHT. The containers were widened first, and that did not
   remove the blank space on the signed-out screens — it MOVED it. Body
   text is capped at 68ch and should be, so a wider panel just puts the
   emptiness inside itself. Space has to be USED, and the thing to use
   it with was already on those screens as prose: /sms spent a
   four-line sentence naming the eight Annex 19 elements behind the
   sign-in, and /picture was a heading, two sentences and a button on a
   page the sticky footer stretched to the full viewport.

   Both now list what is behind the sign-in, from data rather than from
   a second copy of it — /sms intersects SURFACES with SMS_COMPONENTS
   so the offer cannot name an element the screen does not hold, and
   /picture's four are gated against the screen's own headings by
   tests/picture-offer.test.ts, mutation-checked in both directions.

   0.2 KB of the 1 KB is spent. The rest is headroom for the same
   treatment on the remaining signed-out screens.

   ---------------------------------------------------------------
   CSS 63 -> 64 KB, AND THIS SPENDS THE HEADROOM ON SOMETHING ELSE.

   The paragraph above says the remaining 0.8 KB was for the signed-out
   screens and "not a reason to raise it again". It went on the PRINTED
   PACK instead, so that sentence is worth correcting rather than
   quietly outliving its accuracy.

   What overtook it: rendering the pack to A4 and reading it. The SRA's
   first field printed "New scheduled service to an unpaved northern
   strip" and its second "The aircraft, the aerodromes, the people, the
   procedures...". Both are PLACEHOLDERS. On screen the grey says so;
   on paper, handed to somebody who has never seen this application, an
   empty assessment reads as a completed one describing a route nobody
   proposed.

   A printed safety document asserting something untrue about an
   operator is the one class of defect this product cannot ship, and it
   outranks the tidiness of a spending plan written twenty minutes
   earlier. The rules bought: placeholders never print, an empty field
   prints as a rule rather than a box to fill in, a stat rail prints as
   an aligned list rather than a grid that drops its fifth figure, and
   the SRA step list stops rendering "1. 1.".

   All of it is inside @media print, so a reporter at a remote strip
   downloads it and never renders it — the weight is real but it is not
   on the critical path, and the entry chunk is untouched at 210.4 KB.

   The signed-out treatment still needs its 0.8 KB. That is now a raise
   to argue for on its own merits rather than one already banked. */
/* =====================================================================
   TOTAL JS 513 -> 520 KB: THE OPERATOR'S MARK ON THEIR OWN DOCUMENTS.

   Every pack this product prints — a risk assessment, the register,
   the indicator table, the SMS record — went out under UsalamaSMS's
   identity. The document is the OPERATOR'S: their assessment, their
   risk position, their name on the line to an authority. So they can
   now put their mark on it.

   THE ENTRY CHUNK IS UNTOUCHED, which is the number that matters and
   the reason this raise is the total rather than both. 210.6 KB of
   217, unchanged to the decimal by this feature. The upload screen is
   lazy — /account/logo, imported on click — so a ramp agent filing a
   hazard at a remote strip never downloads the canvas resizer, the
   validator or the form. It is charged to the safety manager who opens
   a settings screen on an office connection, once.

   WHAT THE WEIGHT IS. A file picker, a canvas pass that downscales to
   512px on the longest edge, and checkLogo() shared with the route.
   The canvas pass is doing three jobs at once: it enforces the ceiling
   BEFORE a slow link carries the bytes, it normalises whatever format
   was chosen into one the server accepts, and — the one worth the
   kilobytes — it strips metadata, because a logo exported from a
   design tool carries author, software and sometimes a file path with
   somebody's name in it.

   SVG IS REFUSED RATHER THAN RASTERISED, in the client and in the
   route, for the same reason in both: it is markup that can carry
   script, and this image renders into the operator's own pages.
   tests/logo.test.ts mutation-checks that refusal and the anchoring of
   the data-URI pattern — unanchored, it accepts
   `javascript:alert(1)//data:image/png;base64,...`.
   ===================================================================== */
/* TOTAL JS 520 -> 526 KB: EVIDENCE ON A REPORT.

   A narrative describes a dented cowling. A photograph of the dented
   cowling is what an investigator can assess.

   ENTRY UNTOUCHED AGAIN at 210.6 of 217 KB, and that is the number this
   product is sold on. The evidence panel is dynamically imported when
   somebody OPENS the disclosure on a queue row — a ramp agent who opens
   the queue to read a report never downloads it, and filing a report
   never touches it at all.

   THE WEIGHT IS THE CANVAS PASS, and it is the same shape as the logo
   resizer for the same reasons: it strips EXIF by re-encoding, so GPS,
   device and timestamp do not travel; it downscales to 1600px so a
   reporter on one bar is not sending eight megabytes off a sensor; and
   it enforces the ceiling before the upload rather than after it.

   It does NOT claim to do more. EVIDENCE_CAVEAT is on the control and
   says the part software cannot do — a face, a registration or a name
   on a document in the frame survives all of it. */
/* =====================================================================
   CSS 64 -> 80 KB: THE INSTRUMENT LANGUAGE.

   The product was described by its owner as "generic, flat and
   disorganised", and all three were fair:

     GENERIC   a gradient hero, 1px rounded cards repeated on every
               surface, one accent doing every job. That cluster is the
               default look of any B2B SaaS built this decade.
     FLAT      partly self-inflicted. Hover lift and shadow were
               stripped from tool surfaces to stop them reading as a
               brochure, and the type scale came down three times. Both
               were right and together they left no elevation vocabulary
               at all, so nothing signalled what was primary.
     DISORGANISED  every screen was the same vertical stack of
               full-width panels. No grid, no fixed regions, so the eye
               re-learns each screen.

   The direction chosen is PRECISION INSTRUMENT: the product reads as
   equipment rather than as software. Hairline rules instead of card
   borders, ground tone instead of shadow, tabular figures wherever
   numbers align, mono for identifiers, and ONE accent reserved for
   state with teal kept for action. It draws on the mark's own language
   — line art on dark — and it is the one direction in this field that
   is not another dashboard.

   WHY THE NUMBER IS AFFORDABLE. CSS is render-blocking, which is why
   this budget exists at all. It is also cached after the first visit
   and gzips about 5:1, so 16 KB of source is roughly 3 KB on the wire,
   once. The number that decides whether a reporter can file at a remote
   strip is the ENTRY JS budget, and that is untouched at 217 KB.

   WHAT IS EXPECTED TO COME BACK. This raise buys the new language
   before the old one is removed, because deleting the card system while
   half the screens still use it would break them. A consolidation pass
   follows and should return several kilobytes — the card rules, the
   duplicated spacing, the surface split this supersedes. If it does
   not, that is a finding worth writing down rather than absorbing.
   ===================================================================== */
/* =====================================================================
   RAISED ON THE OWNER'S INSTRUCTION, AND HERE IS WHAT IT BOUGHT.

   js total went to 560 and entry to 224. The old js ceiling was 526
   against 524.4 actual — 1.6 KB, after a consolidation pass had already
   returned a kilobyte by moving three developer notes out of tagged
   template literals, where they were shipping to reporters as string
   content. Headroom that thin is not a budget, it is a tripwire: the
   next honest change fails the build and the temptation is to nudge the
   number rather than to look.

   WHAT WAS BOUGHT, in the pass this raise covers:

   · THE REPORTING CLOCK IN THE HERO. Roughly seven hundred pixels of
     the front door were empty at 1440; it now carries every
     jurisdiction's shortest reporting period, generated from
     MOR_OBLIGATIONS — the registry the whole product computes from, so
     it cannot go stale and a new jurisdiction appears without anybody
     adding it.
   · THE WORKSPACE LABEL. The operator's own mark and name in the sync
     strip on every route, loaded lazily through the record the printed
     pack already fetches. This is the tenanted product finally saying
     whose system it is; it costs nothing on the entry path because a
     reporter filing anonymously never loads it.
   · THE PROGRESS COMPONENT on the maturity assessment — twelve
     elements with no indication of length until now, and the count
     computed from the answers rather than held.
   · THE COMPOSED RECORD. A register row's owner, review date and
     provenance as three labelled facts rather than one grey run.
   · THE MENU'S PURPOSE LINES and its second column, which is what
     stopped it scrolling a third of its contents off a 900px screen.

   ENTRY IS THE NUMBER THAT MATTERS AND IT BARELY MOVED: 210.6 KB
   before this pass, 212.4 after, against a ceiling now at 224. The
   1.8 KB is the workspace painter and the hero clock's markup. Every
   other item above is in a lazily-loaded route chunk, which is the
   whole reason the two numbers are kept apart — the total says
   something grew, the entry says it grew where a reporter at a remote
   strip has to pay for it.

   The css ceiling is untouched at 80 against 69.5 actual. It was
   raised for this redesign already and the redesign has not spent it.
   ===================================================================== */
const BUDGET = { entry: 224 * 1024, js: 560 * 1024, css: 80 * 1024 };

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
