#!/usr/bin/env node
/* ============================================================
   Claims gate — charter rule 10: counts about the product are
   computed, not typed.

   Today this repository ships no marketing surface, so there are few
   public numbers to derive. That is precisely when a gate like this is
   worth writing: the first landing page that says "five jurisdictions"
   is written by someone in a hurry, and by then the habit either exists
   or it does not.

   What it asserts now is the layer underneath — that the registries the
   future claims will be computed FROM are internally consistent, and
   that the documents already making dated claims still contain them.

   CHARTER RULE 11 throughout: every assertion names its subject, and a
   subject that has gone missing is a failure rather than a skipped
   check.
   ============================================================ */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => {
  try {
    return readFileSync(resolve(ROOT, p), 'utf8');
  } catch {
    fail(
      `${p} is missing. This gate asserts something about that file, so its ` +
        `absence is a failure and not a skipped check (charter rule 11).`
    );
    return '';
  }
};

const failures = [];
const passes = [];

function fail(message) {
  failures.push(message);
}

function assert(label, condition, detail) {
  if (condition) passes.push(label);
  else fail(`${label}${detail ? ` — ${detail}` : ''}`);
}

/* ---------------- The regulatory registry ---------------- */

const regulations = read('packages/shared/src/regulations.ts');

const jurisdictionMatch = /export const JURISDICTIONS = \[([^\]]+)\]/.exec(regulations);
assert(
  'JURISDICTIONS list is present',
  Boolean(jurisdictionMatch),
  'the exported jurisdiction list could not be found'
);

if (jurisdictionMatch) {
  /* {2,4}: ICAO is four letters. The old {2} silently skipped it, so the
     gate counted two jurisdictions against three instrument rows and
     reported the mismatch as a defect in the registry rather than in
     itself. */
  const jurisdictions = [...jurisdictionMatch[1].matchAll(/"([A-Z]{2,4})"/g)].map((m) => m[1]);
  assert('at least two jurisdictions are encoded', jurisdictions.length >= 2);

  /* Every jurisdiction in the list must have a row in MOR_OBLIGATIONS.
     A jurisdiction with no row is a runtime crash on a lookup, and the
     lookup happens while computing a regulatory deadline. */
  for (const j of jurisdictions) {
    assert(
      `MOR_OBLIGATIONS has a row for ${j}`,
      new RegExp(`^\\s{2}${j}: \\{`, 'm').test(regulations),
      'a jurisdiction in the enum with no obligation row throws on lookup'
    );
  }

  /* Every row must cite an instrument and carry a verification date —
     charter rule 4. Counted rather than eyeballed.

     Counted INSIDE the MOR_OBLIGATIONS literal, not across the file.
     Counting the whole file also caught the `readonly instrument:` line
     in the ReportingObligation interface, so five rows reported as six
     and the gate failed on correct data. A gate that cries wolf is a
     gate someone turns off. */
  const registry = /MOR_OBLIGATIONS[\s\S]*?\n\};/.exec(regulations)?.[0] ?? '';
  assert(
    'the MOR_OBLIGATIONS registry literal is present',
    registry.length > 200,
    'the registry these counts describe could not be located'
  );

  const instruments = (registry.match(/instrument:/g) ?? []).length;
  const verified = (registry.match(/verifiedOn:/g) ?? []).length;
  const cycles = (registry.match(/reviewCycleMonths:/g) ?? []).length;

  assert(
    'every obligation row cites an instrument',
    instruments === jurisdictions.length,
    `${instruments} instruments for ${jurisdictions.length} jurisdictions`
  );
  assert(
    'every obligation row carries a verification date',
    verified === jurisdictions.length,
    `${verified} dates for ${jurisdictions.length} jurisdictions`
  );
  assert(
    'every obligation row carries a review cycle',
    cycles === jurisdictions.length,
    `${cycles} cycles for ${jurisdictions.length} jurisdictions`
  );

  /* Dates must be real and not in the future. A verifiedOn dated next
     year is a typo that makes a stale row look fresh forever. */
  for (const m of registry.matchAll(/verifiedOn: "([^"]+)"/g)) {
    const d = new Date(`${m[1]}T00:00:00Z`);
    assert(
      `verifiedOn ${m[1]} is a real date`,
      !Number.isNaN(d.getTime()),
      'unparseable date in a regulatory row'
    );
    assert(
      `verifiedOn ${m[1]} is not in the future`,
      d.getTime() <= Date.now(),
      'a future verification date makes a stale row look permanently fresh'
    );
  }
}

/* Kenya's figure is the one this whole module exists to correct. It gets
   its own named assertion so a regression has its own line of output. */
assert(
  'Kenya MOR is 24 hours, not the EU 72',
  /KE: \{[\s\S]*?hours: 24,/.test(regulations),
  'KCAA CAA-AC-SMS004A requires the pertinent information within 24 hours'
);
assert(
  'every clock starts from awareness, not occurrence',
  !/clockStart: "OCCURRENCE"/.test(regulations),
  'no encoded obligation currently runs from the occurrence; if one legitimately ' +
    'does, update this assertion deliberately rather than deleting it'
);

/* ---------------- De-identification coverage ---------------- */

const deident = read('apps/api/src/deident.ts');
const prefixBlock = /REGISTRATION_PREFIXES = \[([\s\S]*?)\] as const/.exec(deident);
assert('registration prefix list is present', Boolean(prefixBlock));

if (prefixBlock) {
  const prefixes = [...prefixBlock[1].matchAll(/"([A-Z0-9]{2,3})"/g)].map((m) => m[1]);
  assert(
    'more than Kenya alone is covered',
    prefixes.length >= 5,
    `only ${prefixes.length} prefixes — the stated market is the East African corridor`
  );
  /* KENYA, AND ONLY KENYA IS REQUIRED NOW.

     This list was ['5Y', '5X', '5H', '9XR'] — the four the corridor is
     actually flown between — and it failed when the last three were
     removed on 12 August 2026 as part of scoping the product to the
     State of Registry. That failure was the gate working: an
     uncovered prefix passes through de-identification in clear, and
     the check said so before anything was built.

     The three are not silently dropped from the check. They are
     asserted ABSENT below, so restoring one fails here and points at
     the decision rather than at a bug, and so the pairing with
     docs/05-SWITCHES.md entry 11 cannot drift. */
  for (const required of ['5Y']) {
    assert(
      `registration prefix ${required} is covered`,
      prefixes.includes(required),
      'an uncovered prefix passes through de-identification in clear'
    );
  }
  assert(
    'prefix list has no duplicates',
    new Set(prefixes).size === prefixes.length,
    'a duplicated prefix is a sign of a hand-merged list'
  );
}

/* ---------------- The corporate banner ----------------

   UsalamaSMS is published under the JK & Associates banner, and an
   operator entrusting its safety reports to a product is entitled to
   know which organisation stands behind it. Stated on three documents
   and in the footer of every screen — so it is checked in all four
   places rather than in whichever one somebody remembers to edit. */

const pageContent = read('apps/web/src/content/pages.js');
const BANNER = /JK &amp; Associates|JK & Associates/;

for (const [name, marker] of [
  ['About', 'export const ABOUT'],
  ['the privacy notice', 'export const PRIVACY'],
  ['the terms of use', 'export const TERMS']
]) {
  const start = pageContent.indexOf(marker);
  const rest = pageContent.slice(start, pageContent.indexOf('export const', start + 10));
  assert(
    `${name} names the corporate banner`,
    start !== -1 && BANNER.test(rest),
    `${name} does not say who publishes this product`
  );
}

assert(
  'the footer of every screen names the corporate banner',
  BANNER.test(read('apps/web/src/index.html')),
  'the shell footer does not carry the publisher'
);

/* ---------------- Documents that make dated claims ---------------- */

const switches = read('docs/05-SWITCHES.md');
assert(
  'the switches document still carries the jurisdiction-coverage entry',
  /PROVISIONAL/.test(switches) && /ICAO Annex 13/.test(switches),
  'the highest-risk claim in the product lost its entry'
);

/* The three removed rows must not creep back in anywhere. They asserted
   a 72-hour deadline that no instrument publishes, and the only reason
   they lasted was that a placeholder looked like a citation. */
for (const [file, text] of [
  ['packages/shared/src/regulations.ts', regulations],
  ['docs/05-SWITCHES.md', switches]
]) {
  assert(
    `${file} does not reinstate a deadline for UG, TZ or RW`,
    !/^\s*(UG|TZ|RW):\s*\{/m.test(text),
    'a jurisdiction row returned without an instrument to cite'
  );
}

/* The provisional flag in the code and the entry in the document have to
   agree. Either alone is a claim nobody is checking.

   This used to assert "at least three", which was true only while three
   rows carried a deadline no instrument publishes. It now compares the
   ROW COUNT against the figure the document states, so it fails in both
   directions: adding an unverified row without documenting it, and
   documenting one that the code does not actually mark. */
const provisionalRows = (regulations.match(/note:\s*\n?\s*"PROVISIONAL/g) ?? []).length;
const declared = /Provisional rows today:\s*\*\*(\d+)\*\*/.exec(switches);
assert(
  'the switches document states how many rows are provisional',
  Boolean(declared),
  'the count the code is checked against is missing from the document'
);
if (declared) {
  assert(
    'the provisional row count matches the document',
    provisionalRows === Number(declared[1]),
    `the code marks ${provisionalRows} provisional row(s); the document declares ${declared[1]}`
  );
}

/* And the guard itself must still be reachable, because it has no
   instances today — which is exactly when one quietly gets deleted as
   dead code. */
assert(
  'the provisional predicate is still exported',
  /export function isProvisionalObligation/.test(regulations),
  'the mechanism that marks an unverified row has gone'
);

/* ============================================================
   FILING SENDS, IT DOES NOT ONLY SCHEDULE.

   requestBackgroundSync once registered a Background Sync and, if that
   succeeded, did nothing else — the immediate flush lived in the catch
   block, so it ran only where the API is MISSING. On every current
   Chromium, and therefore on the mid-range Android this product is
   designed for, filing a report queued it and sent nothing while the
   form said "Report saved and sending now".

   WHY THIS IS A SOURCE ASSERTION rather than a browser one. Headless
   Chromium fires the registered sync event almost immediately, so a
   smoke check cannot tell an immediate flush from a background one —
   it passes either way, which was demonstrated by deleting the flush
   and watching the suite stay green. The difference only appears on a
   real device, where the browser may wait minutes or never.

   So the property is asserted where it is visible: the flush must be
   called on the ordinary path, not inside the catch. Crude, and it
   fails on exactly the edit that caused the defect — which is more
   than the environment can offer.
   ============================================================ */
const offline = read('apps/web/src/shared/offline.ts');
const bgSync = /export async function requestBackgroundSync[\s\S]*?\n}/.exec(offline)?.[0] ?? '';
const beforeCatch = bgSync.split('catch')[0] ?? '';
assert(
  'filing sends immediately rather than only scheduling a background sync',
  /flushOutbox\s*\(/.test(beforeCatch),
  'requestBackgroundSync does not call flushOutbox outside its catch block — ' +
    'on a device that HAS Background Sync, filing would queue the report and send nothing'
);

/* ============================================================
   THE PRODUCT MUST NOT CLAIM TO BE A WHOLE SMS.

   An independent audit put it plainly: ICAO Annex 19 defines twelve
   elements and this product substantially covers one and a half —
   hazard identification through reporting, and risk classification. It
   ASSESSES all twelve, which is a different thing from managing them.
   Three surfaces said "UsalamaSMS is a safety management system".

   That is the exact failure charter rule 7 exists to prevent: a claim
   on a surface a customer reads, kept by no mechanism. Worse than
   usual here, because the customer is an operator deciding whether its
   regulatory position is covered — and a safety product that lets
   somebody believe that has done the opposite of its job.

   So the copy now names the layer it is, and a section lists what an
   operator still needs and will not find. This assertion stops the
   shorter, better-sounding sentence from coming back.
   ============================================================ */
const pages = read('apps/web/src/content/pages.js');
const home = read('apps/web/src/tools/home/index.js');
const overclaim = /\bis a safety management system\b/i;
assert(
  'the product does not claim to BE a safety management system',
  !overclaim.test(pages) && !overclaim.test(home),
  'a surface claims this product is a safety management system; it is the reporting ' +
    'and risk-classification layer of one, and Annex 19 defines eleven more elements'
);
assert(
  'and it says what an operator still needs elsewhere',
  /What it is not, and what you still need/.test(pages) &&
    /risk register/.test(pages) &&
    /safety performance indicators/i.test(pages),
  'the About page must list the elements this product does not cover'
);

const charter = read('docs/DIAGNOSTIC-CHARTER.md');
assert(
  'the charter is the three-product version',
  /Version 2/.test(charter) && /UsalamaSMS/.test(charter),
  'this repo must carry the same charter version as its siblings'
);

/* ---------------- The README's own numbers ----------------
   Charter rule 10, applied to this repository's own front page.

   The README states an assertion count for the brand gate, an assertion
   count for this gate, and a test count. Those are exactly the kind of
   number that is true on the day it is typed and quietly wrong three
   commits later — and a project whose charter forbids hand-typed counts
   publishing three of them on its front page would be the most
   embarrassing possible failure mode.

   So they are derived: the brand gate is executed and its own reported
   total is read back, the test count comes from the test files, and this
   gate's total is known only at the end. Any drift fails the build.
   ---------------------------------------------------------- */

const readme = read('README.md');

function statedCount(pattern, label) {
  const m = pattern.exec(readme);
  assert(
    `README states a ${label}`,
    Boolean(m),
    'the README no longer makes this claim, so this assertion has lost its subject (rule 11)'
  );
  return m ? Number(m[1]) : null;
}

/* Brand gate: run it and read the number it reports about itself, rather
   than counting `expect(` calls here — the gate generates assertions in
   loops, so a static count would be a second, drifting source of truth. */
const brandRun = spawnSync(process.execPath, [resolve(ROOT, 'scripts/check-brand.mjs')], {
  encoding: 'utf8',
});
const brandActual = Number(/passed — (\d+) assertions/.exec(brandRun.stdout ?? '')?.[1] ?? NaN);
assert(
  'the brand gate runs and reports its assertion count',
  Number.isFinite(brandActual),
  'could not read an assertion total from scripts/check-brand.mjs'
);

const brandStated = statedCount(/(\d+) contrast assertions/, 'brand assertion count');
assert(
  'README brand assertion count matches the gate',
  brandStated === brandActual,
  `README says ${brandStated}, the gate reports ${brandActual}`
);

/* Test count, from the test files themselves — DISCOVERED, not listed.
   A hardcoded file list is a guard that stops covering the moment
   someone adds a suite, and it would have missed tests/deident-corpus
   entirely. `it.each` blocks are counted by their case arrays so the
   number matches what vitest reports. */
const testFiles = readdirSync(resolve(ROOT, 'tests')).filter((f) => f.endsWith('.test.ts'));
assert(
  'test files were discovered',
  testFiles.length > 0,
  'no *.test.ts found under tests/ — this gate asserts a count over them'
);

const testCount = testFiles
  .map((f) => {
    const src = read(`tests/${f}`);
    // Plain `it(` / `it.only(` cases.
    let n = (src.match(/^\s*it(?:\.only)?\(/gm) ?? []).length;
    // `it.each(ARRAY)` expands to one case per element. Count the entries
    // of the named array rather than guessing.
    for (const m of src.matchAll(/it\.each\((?:\.\.\.)?([A-Z_][A-Z0-9_]*)\)/g)) {
      const arr = new RegExp(`const ${m[1]}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];`).exec(src);
      if (arr) n += (arr[1].match(/^\s*[{"']/gm) ?? []).length;
    }
    return n;
  })
  .reduce((a, b) => a + b, 0);

const testsStated = statedCount(/(\d+) unit tests/, 'test count');
assert(
  'README test count matches the test files',
  testsStated === testCount,
  `README says ${testsStated}, the files define ${testCount}`
);

/* Smoke checks, counted from the suite rather than trusted. */
const smoke = read('scripts/smoke.mjs');
const smokeCount = (smoke.match(/await check\(/g) ?? []).length;
const smokeStated = statedCount(/(\d+) checks, including filing/, 'smoke check count');
assert(
  'README smoke check count matches the suite',
  smokeStated === smokeCount,
  `README says ${smokeStated}, the suite defines ${smokeCount}`
);

/* And the two-version gate's own count, which had drifted. It was
   stated as 4 in the README while the file defined 5 — a hand-typed
   number about the product on its front page, which is the exact thing
   charter rule 10 forbids, sitting two lines from three counts that
   were already derived. */
const updateGate = read('scripts/check-update.mjs');
const updateCount = (updateGate.match(/await check\(/g) ?? []).length;
const updateStated = statedCount(/(\d+) checks across TWO versions/, 'update check count');
assert(
  'README update-gate count matches the gate',
  updateStated === updateCount,
  `README says ${updateStated}, the gate defines ${updateCount}`
);

/* Integration checks, counted from the suite. These are the strongest
   assertions in the project — a chain that forks, a verifier that
   accepts an edited row, a join that re-identifies a reporter are all
   invisible to the source-level guards — so the number on the front
   page is derived like every other. */
const integrationDir = resolve(ROOT, 'tests/integration');
const integrationFiles = readdirSync(integrationDir).filter((f) => f.endsWith('.test.ts'));
assert(
  'integration suites were discovered',
  integrationFiles.length >= 3,
  `${integrationFiles.length} integration suites found; the README claims a count over them`
);

const integrationCount = integrationFiles
  .map((f) => (read(`tests/integration/${f}`).match(/^\s*it(?:\.only)?\(/gm) ?? []).length)
  .reduce((a, b) => a + b, 0);

const integrationStated = statedCount(/(\d+) checks against a real Postgres/, 'integration check count');
assert(
  'README integration count matches the suites',
  integrationStated === integrationCount,
  `README says ${integrationStated}, the suites define ${integrationCount}`
);

/* ============================================================
   THE PRIVACY NOTICE NAMES THE INSTRUMENT ITS SAFEGUARD COMES FROM.

   The notice described what the product does with a report and said
   nothing at all about de-identification — the strongest protection it
   offers, and the one Kenya's own regulations name. L.N. 32 of 2026,
   Third Schedule, paragraph 3.1 Note 2 identifies de-identification as
   a safeguard for protecting safety data, so this is the instrument's
   answer rather than a courtesy this product invented, and saying so is
   both more accurate and stronger.

   ASSERTED AGAINST THE CITATION, NOT AGAINST THE WORD. "We de-identify"
   would pass a search for "de-identif" and is exactly the weaker claim
   this replaced. What has to survive is the reference an operator's
   lawyer can look up.
   ============================================================ */
{
  const pages = read('apps/web/src/content/pages.js');
  /* WHITESPACE-NORMALISED BEFORE MATCHING. The first version of this
     tested the raw source and failed on "Third Schedule" — which is
     present, and wrapped across a line break with eight spaces of
     indent in the middle of it. A gate that only passes when prose is
     laid out a particular way is a gate that makes people fight the
     line wrapping instead of writing the sentence, and the citation is
     what matters, not where the editor broke the line. */
  const privacy = pages
    .slice(pages.indexOf('export const PRIVACY'), pages.indexOf('export const TERMS'))
    .replace(/\s+/g, ' ');
  assert(
    'the privacy notice was located at all',
    privacy.length > 500,
    `read ${privacy.length} characters of PRIVACY — this check would pass by finding nothing`,
  );
  assert(
    'THE PRIVACY NOTICE CITES THE INSTRUMENT BEHIND DE-IDENTIFICATION',
    /L\.N\. 32 of 2026/.test(privacy) && /Third Schedule/.test(privacy),
    'the notice describes de-identification without naming L.N. 32 of 2026 and its Third ' +
      'Schedule — which is the weaker claim, and the one an operator cannot check',
  );
  assert(
    'and states the limit rather than only the safeguard',
    /may still identify|removes names, not circumstances/i.test(privacy),
    'the notice claims de-identification without the caveat the reporting form already ' +
      'carries: a narrative specific enough to be useful may identify its author anyway',
  );
}

/* ---------------- The coverage figure ----------------

   The most consequential number this repository publishes. "N of 12"
   is an operator's regulatory position, and the README states it in
   prose while /coverage computes it from COVERAGE. Until now the only
   thing holding them together was a unit test asserting a literal 2,
   which is a number typed in a second place: move an element and the
   test fails, somebody edits the literal, and the README keeps saying
   what it said. The half-credit rule for PARTIAL is the product's own
   and is stated on the page; what is checked here is that the sentence
   an operator reads is the arithmetic the table performs.

   Read as text rather than imported, like every other source this gate
   inspects — it runs before the build. */
const coverageSource = read('packages/shared/src/maturity.ts');
const countState = (state) =>
  (coverageSource.match(new RegExp(`state:\\s*"${state}"`, 'g')) ?? []).length;
const coverageBuilt = countState('BUILT');
const coveragePartial = countState('PARTIAL');
const coverageTotal =
  coverageBuilt + coveragePartial + countState('ASSESSED_ONLY') + countState('NOT_BUILT');
const coverageFigure = coverageBuilt + coveragePartial / 2;

assert(
  'every one of the twelve elements has a coverage entry',
  coverageTotal === 12,
  `${coverageTotal} coverage entries for 12 elements`
);

const coverageStated = statedCount(/\*\*([\d.]+) of 12\*\*/, 'coverage figure');
assert(
  'README coverage figure matches the coverage table',
  coverageStated === coverageFigure,
  `README says ${coverageStated} of 12, the table computes ${coverageFigure} ` +
    `(${coverageBuilt} built + ${coveragePartial} partial at half credit)`
);

/* This gate's own total is only known once every assertion has run, so
   it is checked at the very end, below. */
const claimsStated = statedCount(/(\d+) assertions that the registries/, 'claims assertion count');

/* ---------------- Report ---------------- */

for (const p of passes) console.log(`  ok   ${p}`);

/* ============================================================
   DECLARED CONTROLS MUST BE WIRED CONTROLS.

   routes.auth.ts and routes.sync.ts carried `config.rateLimit` from the
   day they were written, with a correct comment above the login one
   explaining that login is the endpoint worth brute-forcing. The plugin
   that gives route-level `config.rateLimit` any meaning was never
   registered, and Fastify ignores unknown keys inside `config` in
   silence. The limits were decoration. Login was unbounded.

   Nothing could have caught it. Typecheck passes — `config` is
   `Record<string, unknown>`. Unit tests pass — they read source and the
   source says `rateLimit`. The audit found it by grepping the
   dependency list, which is not a repeatable process.

   This is the repeatable one: if any route declares a limit, the server
   must register the plugin, and the package must actually depend on it.
   A future route that declares a limit after someone removes the plugin
   fails the build.

   The general shape — a control named in one file and enabled in
   another — is the most expensive class of defect in this repository so
   far. It has now produced three: routes with no server, health
   endpoints unreachable at the deployed path, and this.
   ============================================================ */
const routeSources = ['apps/api/src/routes.auth.ts', 'apps/api/src/routes.sync.ts']
  .map((p) => read(p))
  .join('\n');
const declaredLimits = (routeSources.match(/rateLimit\s*:/g) ?? []).length;

assert(
  'routes still declare the rate limits this gate is about',
  declaredLimits > 0,
  'no route declares config.rateLimit — either the limits were removed, or ' +
    'this assertion has stopped checking anything (charter rule 11)'
);

const serverSource = read('apps/api/src/server.ts');
assert(
  'declared rate limits are backed by a registered plugin',
  /@fastify\/rate-limit/.test(serverSource) && /register\(\s*rateLimit/.test(serverSource),
  `${declaredLimits} route(s) declare config.rateLimit and server.ts does not ` +
    `register @fastify/rate-limit. Fastify ignores unknown config keys silently, ` +
    `so those limits do nothing and login accepts unlimited attempts.`
);

const pkg = JSON.parse(read('package.json'));
assert(
  'the rate-limit plugin is a real dependency',
  Boolean(pkg.dependencies?.['@fastify/rate-limit']),
  '@fastify/rate-limit is imported by server.ts but is not in dependencies — ' +
    'the deploy would fail to boot, or worse, resolve a hoisted transitive copy'
);

/* ============================================================
   NO SITE-WIDE CURRENCY CLAIM IN THE CHROME.

   The footer once ended "regulatory figures verified 11 August 2026" —
   a hardcoded date in static HTML, on every page of the product. It
   rotted the day after it was written, no gate noticed, and by the time
   anybody looked it was contradicting the very table it summarised:
   both obligations past their own review cycle, and the Kenyan one
   governed by a regulation nobody had read.

   A currency statement belongs beside the figure it qualifies. The
   chrome may say what the product is BUILT TO — that is a design
   statement and does not expire — and must not say when anything was
   last checked, because the chrome cannot know.
   ============================================================ */
{
  const shell = read('apps/web/src/index.html');
  /* Comments stripped first. This gate's own explanation of what it
     forbids quotes the forbidden line, and a comment is not a claim
     made to a reader — testing the raw source made the gate fail on
     the note describing why it exists. */
  const footer = shell
    .slice(shell.indexOf('<footer'))
    .replace(/<!--[\s\S]*?-->/g, '');
  assert(
    'the footer states no site-wide verification date',
    !/verified\s*(<time|[0-9])/i.test(footer),
    'the chrome claims a currency it cannot know — put it beside the figure instead',
  );
  /* THIS ASSERTION USED TO READ /methodology/.test(footer), AND THAT
     IS HOW A DEAD LINK LIVED IN THE FOOTER.

     Two faults, and the second is the instructive one.

     It read the wrong half. The footer's columns are not in this file
     at all — main.js writes them from shared/sitemap.js into an empty
     <div id="footer-columns">. So a static test over index.html sees
     the bottom strip and none of the navigation, and demanded a
     SECOND route to the basis in the strip because it could not see
     the first one in the column. The footer ended up saying
     "Regulatory basis" twice, three centimetres apart, in different
     words, pointing at two different places.

     And it could not fail. The link that satisfied it was
     "/methodology#reporting" — a fragment /methodology has never
     rendered. A substring test passes identically on a working route
     and a broken one, so the gate reported the claim kept for as long
     as the claim was false.

     So it now reads the declaration the footer is BUILT from, which
     is where the route either exists or does not. Whether that route
     lands on something real is the crawl in scripts/smoke.mjs, which
     resolves every fragment in the product against the ids its target
     actually renders — a question no static check can answer, because
     nearly every id here is written at runtime from a registry. */
  const sitemap = read('apps/web/src/shared/sitemap.js');
  assert(
    'the footer sends the reader to where currency IS stated',
    /href:\s*'\/#deadlines'/.test(sitemap) && /href:\s*'\/methodology'/.test(sitemap),
    'the footer architecture no longer routes to the per-instrument basis — ' +
      'sitemap.js must carry both the deadlines section and the methodology page',
  );
  assert(
    'AND THE STRIP DOES NOT REPEAT WHAT THE COLUMNS ALREADY SAY',
    !/regulatory basis/i.test(footer),
    'the conformance strip names the regulatory basis a second time — the ' +
      'footer column above it already links there, and two links to one idea ' +
      'in one footer read as two destinations',
  );
}

/* ------------------------------------------------------------------
   A SURFACE THAT LISTS THE DEADLINES MUST ALSO SAY WHAT NOW GOVERNS
   THEM.

   Four times in one week a field was added to a registry, carried
   correctly through the code, and printed by exactly one screen. The
   worst instance was this one: `governedByUnread` and `isStale`
   rendered on /methodology while the landing page's own "Reporting
   deadlines in force" section — the section the footer names as the
   regulatory basis and links to — showed a January 2023 advisory
   circular with no hint that a gazetted regulation now sits above it.

   A reader is owed three things about a figure: what it is, where it
   comes from, and whether that source is still the top of the stack.
   Two of the three is the combination that misleads, and it is the
   one that renders when a field is added without a surface.

   So: any file that renders rows out of MOR_OBLIGATIONS renders both.
   Files that merely CONSULT the registry — the report form computing a
   countdown, the toolkit filling a dropdown — are not listings and are
   excluded by requiring the marker both surfaces share.
   ------------------------------------------------------------------ */
{
  const listings = [
    'apps/web/src/tools/home/index.js',
    'apps/web/src/tools/methodology/index.js',
  ];
  assert(
    'the deadline-listing surfaces were found',
    listings.every((f) => read(f).includes('MOR_OBLIGATIONS')),
    'a file listed here no longer reads the registry — update the list or the gate is empty',
  );
  for (const file of listings) {
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    assert(
      `${file} says what now governs the figure`,
      src.includes('governedByUnread'),
      'it lists a deadline and not whether its instrument has been superseded',
    );
    assert(
      `${file} marks an instrument past its review cycle`,
      src.includes('isStale'),
      'it lists a deadline and not whether its instrument has aged out',
    );
  }
}

/* ============================================================
   THE COVERAGE TABLE IS CHECKED AGAINST THE API, NOT AGAINST ITSELF.

   THE DEFECT. Element 2.2 read "it lives in one browser… it does not
   sync, the safety office cannot see it, and nobody else can
   contribute to it" for half a day AFTER /api/v1/register shipped to
   production. Three clauses, all false, on the one surface in the
   product whose entire job is to state honestly what an operator can
   and cannot evidence to a regulator — and it was understating, which
   is the direction nobody checks because it looks like modesty.

   NOTHING COULD HAVE NOTICED. `state` and `missing` are prose. This
   gate already verified that the COVERAGE COUNT on the front page
   matches the table; it had no way to ask whether the table matches
   the product. A count computed from a stale table is a computed
   number that is confidently wrong.

   SO THE TABLE NOW NAMES ITS ROUTES, and the three assertions below
   are the ones that would have caught it:

     1. every route named is one the API actually registers — so a
        renamed endpoint fails here rather than on a screen;
     2. an element that names routes does not simultaneously say in
        `missing` that nothing is held for the operator — the exact
        contradiction 2.2 shipped with;
     3. the routes are read from routes.*.ts rather than from a list
        typed here, so this cannot drift from the API.
   ============================================================ */
{
  const maturity = read("packages/shared/src/maturity.ts");

  /* The API's own registrations, read the way check-wiring.mjs reads
     them. A list retyped here would be a second declaration, and the
     one that goes stale. */
  const registered = new Set();
  for (const f of readdirSync(resolve(ROOT, "apps/api/src"))) {
    if (!f.startsWith("routes.") || !f.endsWith(".ts")) continue;
    const src = read(`apps/api/src/${f}`);
    for (const m of src.matchAll(/app\.(?:get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
      registered.add(m[1]);
    }
  }
  assert(
    "the API's registered routes were read at all",
    registered.size > 8,
    `read only ${registered.size} routes out of apps/api/src — this check would ` +
      "pass by finding nothing, which is worse than not running",
  );

  const block = maturity.slice(
    maturity.indexOf("export const COVERAGE"),
    maturity.indexOf("export function", maturity.indexOf("export const COVERAGE")),
  );
  /* SLICED ON THE POSITION OF EACH id, not on a brace-and-indentation
     shape. The first version matched `\n  {\n    id: "` and found nine
     of the twelve, because three entries open with a block comment
     between the brace and the id — and it reported that as a defect in
     the table rather than in itself. Anchoring on the one token every
     entry certainly has is both simpler and unable to miss one. */
  const marks = [...block.matchAll(/id: "([0-9]+\.[0-9]+)"/g)];
  const entries = marks.map((m, i) => ({
    id: m[1],
    text: block.slice(m.index, marks[i + 1]?.index ?? block.length),
  }));
  assert(
    "the coverage entries were parsed",
    entries.length >= 12,
    `parsed ${entries.length} coverage entries; the framework has twelve`,
  );

  const unknown = [];
  const contradictions = [];
  let withRoutes = 0;

  /* The claim a route contradicts: that the RECORDS THEMSELVES are not
     held for the operator. Deliberately narrow — these are the
     sentences 2.2 actually carried, not a general search for negation.

     "does not sync" was in this pattern for one run and had to come
     out. It matched inside the corrected entry's own honest caveat,
     "Deletion does not synchronise either" — a true statement about a
     real remaining gap, failed by a gate meant to catch the opposite
     fault. A check that fires on accurate disclosure trains people to
     word around it, and the wording it drives them to is vaguer than
     what they started with. */
  const CLAIMS_NOTHING_HELD =
    /(?:lives|held) in one browser|safety office cannot see|nobody else can contribute|on one device rather than/i;

  for (const e of entries) {
    const routes = [...e.text.matchAll(/"(\/api\/[^"]+)"/g)].map((m) => m[1]);
    if (!routes.length) continue;
    withRoutes++;
    for (const r of routes) {
      if (!registered.has(r)) unknown.push(`${e.id} names ${r}, which the API does not register`);
    }
    const missing = /missing:\s*([\s\S]*?)(?:\n\s*href:|\n\s*\},)/.exec(e.text)?.[1] ?? "";
    if (CLAIMS_NOTHING_HELD.test(missing)) {
      contradictions.push(
        `${e.id} names ${routes.join(", ")} and still tells the reader its records ` +
          "are held on one device",
      );
    }
  }

  assert(
    "coverage names enough server routes to be worth checking",
    withRoutes >= 6,
    `only ${withRoutes} element(s) name a route; this gate would pass by finding nothing`,
  );
  assert(
    "every route the coverage table names is one the API registers",
    unknown.length === 0,
    unknown.join("; "),
  );
  assert(
    "NO ELEMENT CLAIMS ITS RECORDS ARE DEVICE-ONLY WHILE NAMING A ROUTE THAT HOLDS THEM",
    contradictions.length === 0,
    contradictions.join("; ") +
      " — this is the 2.2 defect: the coverage page understating the product to a regulator",
  );

  /* ============================================================
     AND THE OPPOSITE QUESTION: does the API hold anything no element
     admits to?

     THE DEFECT THIS EXISTS FOR. Element 2.1 read "the answers are the
     operator's own to write down elsewhere until this holds them" one
     commit after /api/v1/sms/voluntary shipped and held them. Every
     assertion above passed on it, because all three start from the
     routes an entry NAMES — and 2.1 named none for that capability.

     Silence is the cheaper way to understate. The 2.2 defect had to
     write three false clauses to go wrong; this one only had to leave
     a sentence alone. So the direction of the check is reversed here:
     start from what the API registers, and require that some element
     own it.

     SUB-PATHS COUNT AS OWNED. /api/v1/spi/:id/periods is the same
     capability as /api/v1/spi, and making every entry recite its own
     sub-routes would be noise that the next reader deletes. What must
     be named is a capability with no named parent at all — which is
     exactly the shape /api/v1/sms/voluntary had.
     ============================================================ */
  const NOT_AN_ELEMENT = new Map([
    ["/api/v1/auth/login", "Authentication is how an operator reaches the SMS, not part of it."],
    ["/api/v1/auth/logout", "As above."],
    ["/api/v1/auth/refresh", "As above."],
    ["/api/v1/auth/me", "As above."],
    ["/api/v1/export", "Evidence extraction spans every element rather than belonging to one."],
  ]);

  const named = new Set(
    entries.flatMap((e) => [...e.text.matchAll(/"(\/api\/[^"]+)"/g)].map((m) => m[1])),
  );
  const owned = (route) =>
    named.has(route) ||
    [...named].some((n) => route.startsWith(`${n}/`)) ||
    NOT_AN_ELEMENT.has(route);

  const unclaimed = [...registered].filter((r) => !owned(r)).sort();

  assert(
    "the exemption list is exemptions, not a second route table",
    NOT_AN_ELEMENT.size < registered.size / 2,
    `${NOT_AN_ELEMENT.size} of ${registered.size} routes are exempt — at that ratio ` +
      "this check passes by exempting whatever it would otherwise fail on",
  );
  /* ============================================================
     AND THE THIRD QUESTION: can a PERSON reach it?

     THE DEFECT THIS EXISTS FOR. /api/v1/actions shipped with create,
     complete, verify and cancel, fully tested, named in two coverage
     entries — and no screen in the product posted to any of them. The
     risk picture rendered "Outstanding / Overdue / Awaiting
     verification" over a table nothing could put a row in, so all three
     figures read zero permanently.

     BOTH ASSERTIONS ABOVE PASSED ON IT. The first asks whether every
     route an element names is registered: it was. The second asks
     whether the API holds anything no element admits to: 2.2 and 3.3
     both admitted to it. Neither has an opinion about the browser, and
     an operator cannot use an endpoint.

     This is the disposition defect one release later and one layer out.
     That one was disclosed on /coverage while the buttons were missing;
     this one was not, because nobody noticed the buttons were missing.

     WRITE ROUTES ONLY. A GET can legitimately exist for an export, a
     health probe or another service. A POST, PATCH or DELETE that no
     screen calls is a capability an operator was told they have and
     cannot use.
     ============================================================ */
  const web = readdirSync(resolve(ROOT, "apps/web/src"), { recursive: true })
    .filter((f) => typeof f === "string" && /\.(js|ts)$/.test(f))
    .map((f) => read(`apps/web/src/${f}`))
    .join("\n");

  assert(
    "the web source was read at all",
    web.length > 20000,
    `read ${web.length} characters of apps/web/src — this check would pass by finding nothing`,
  );

  const writeRoutes = new Set();
  for (const f of readdirSync(resolve(ROOT, "apps/api/src"))) {
    if (!f.startsWith("routes.") || !f.endsWith(".ts")) continue;
    const src = read(`apps/api/src/${f}`);
    for (const m of src.matchAll(/app\.(?:post|put|patch|delete)\(\s*"([^"]+)"/g)) {
      writeRoutes.add(m[1]);
    }
  }

  /* Reached means the path appears in the web source at all.
  
     WHAT THIS CATCHES, AND IT IS THE DEFECT THAT ACTUALLY HAPPENED
     TWICE: a route the browser has never heard of. /api/v1/actions
     shipped with four verbs, two coverage entries and no caller; and
     /api/v1/changes shipped with element 3.2 marked BUILT while the
     SMS screen pointed an operator at /toolkits/sra, a different
     instrument. In both cases the string appeared NOWHERE under
     apps/web, which is what this asserts.
     
     WHAT IT DOES NOT CATCH, stated rather than left to be discovered:
     a screen that only READS a collection makes the write routes on
     that prefix look reached. A stricter version was written and
     removed — it required the method and the path to sit near each
     other, and it failed on fourteen correct routes, because the SMS
     screen posts through a descriptor (`authFetch(surface.endpoint,
     { method: 'POST' })`) and the path literal lives in a map far from
     the verb. A gate that cries wolf on correct code is a gate
     somebody turns off, and there is already a comment in this file
     saying so about a different check.
     
     The narrow version is the one worth having. check-wiring.mjs
     covers the method question properly for the descriptor-driven
     screen, which is where that question is answerable.
     
     MUTATION-CHECK THIS BY REMOVING A PATH ENTIRELY, not by renaming
     one call site — the second leaves the string present and the gate
     correctly stays green. */
  const reachable = (route) => web.includes(route.split("/:")[0]);

  const NOT_FROM_A_SCREEN = new Map([
    ["/api/v1/auth/logout", "Called by the session module, which is not a screen."],
    ["/api/v1/sync/batch", "Called by the outbox, which is not a screen."],
  ]);

  const unreachable = [...writeRoutes]
    .filter((r) => !reachable(r) && !NOT_FROM_A_SCREEN.has(r))
    .sort();

  assert(
    "NO WRITE ROUTE EXISTS THAT NO SCREEN CAN REACH",
    unreachable.length === 0,
    `${unreachable.join(", ")} — the API accepts this and nothing in the product sends ` +
      "it. An operator reads /coverage, is told the capability exists, and cannot use it",
  );

  assert(
    "NO CAPABILITY IS REGISTERED BY THE API THAT NO ELEMENT ADMITS TO HOLDING",
    unclaimed.length === 0,
    `${unclaimed.join(", ")} — the API holds this and the coverage page does not say so. ` +
      "That is the 2.2 defect arriving by omission rather than by a false sentence: an " +
      "operator reads /coverage to know what it can evidence, and this is evidence it has",
  );
}

if (failures.length > 0) {
  console.error(`\n${failures.length} claim failure(s):\n`);
  for (const f of failures) console.error(`  · ${f}`);
  console.error('\nClaims gate failed. Nothing was built.');
  process.exit(1);
}

/* Rule 11, from the other side: a gate that asserts nothing passes every
   time. */
if (passes.length < 15) {
  console.error(
    `\nClaims gate ran only ${passes.length} assertions, fewer than this file is ` +
      `known to contain. Something removed checks without removing this guard.`
  );
  process.exit(1);
}

/* The last claim: this gate's own total, as printed on the front page.
   Checked here because it is the one number that cannot be known until
   every other assertion has run. `passes.length + 1` accounts for this
   assertion itself, which is about to join them. */
const claimsActual = passes.length + 1;
if (claimsStated !== claimsActual) {
  console.error(
    `\nREADME claims assertion count is wrong — README says ${claimsStated}, ` +
      `this gate ran ${claimsActual}. Charter rule 10: counts about the ` +
      `product are computed, not typed.`
  );
  process.exit(1);
}
console.log(`  ok   README claims assertion count matches this gate`);

console.log(`\nClaims gate passed — ${claimsActual} assertions.`);
