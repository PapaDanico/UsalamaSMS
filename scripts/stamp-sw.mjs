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
const BUDGET = { entry: 212 * 1024, js: 332 * 1024, css: 46 * 1024 };

const sizes = { js: 0, css: 0, entry: 0 };
for (const asset of assets) {
  const ext = asset.endsWith('.js') ? 'js' : asset.endsWith('.css') ? 'css' : null;
  if (!ext) continue;
  const bytes = statSync(resolve(DIST, asset.slice(1))).size;
  sizes[ext] += bytes;
  // The entry chunk is the largest JS asset: Vite names lazy chunks the
  // same way, so size is the only thing distinguishing them without
  // parsing the manifest, and a lazy chunk larger than the entry would
  // be a finding rather than a miscount.
  if (ext === 'js' && bytes > sizes.entry) sizes.entry = bytes;
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
