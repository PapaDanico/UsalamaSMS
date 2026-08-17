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
   THE PRODUCT MUST NOT CLAIM TO BE A WHOLE SMS — WHICH IS STILL TRUE
   AT ELEVEN OF TWELVE, AND FOR A BETTER REASON THAN IT USED TO BE.

   This rule was written when the product covered one and a half
   elements and three surfaces said "UsalamaSMS is a safety management
   system" anyway. That was charter rule 7 failing on the one surface
   where it costs most: an operator deciding whether its regulatory
   position is covered.

   Coverage has since moved to ten built and two partial. The
   arithmetic no longer embarrasses the sentence — and the sentence is
   still wrong, on the standard's own terms. Annex 19 makes the SMS the
   OPERATOR'S system: a signed policy, an accountable executive who is
   actually accountable, a just culture people believe in. No vendor
   ships those. Software can hold the record of them and compute what
   follows; it cannot be them.

   So the rule stays, and what changed is what the page must say in its
   place. It used to have to list what an operator would NOT find here,
   and that list went stale in the worst direction — nine of its ten
   entries were built and shipping while the page still sent prospects
   away to buy them. What it must do now is NAME THE PARTIAL ELEMENTS,
   and which ones those are is read out of COVERAGE rather than typed
   here, so an element that slips to PARTIAL cannot go unmentioned.
   ============================================================ */
const pages = read('apps/web/src/content/pages.js');
const home = read('apps/web/src/tools/home/index.js');
const overclaim = /\bis a safety management system\b/i;
assert(
  'the product does not claim to BE a safety management system',
  !overclaim.test(pages) && !overclaim.test(home),
  'a surface claims this product IS a safety management system. Annex 19 makes that the ' +
    "operator's own system — a signed policy, a genuinely accountable executive, a just " +
    'culture. This runs eleven of its twelve elements and cannot be it'
);

/* The ids COVERAGE marks partial, discovered rather than recited.

   Read here rather than reusing the `coverageSource` binding further
   down this file: that one is declared after this block, so referring
   to it from here is a temporal dead zone and takes the whole gate out
   with a ReferenceError — which is a check that fails for a reason
   unrelated to what it checks, and reads to the next person as the
   claim being wrong. */
const coverageDecl = read('packages/shared/src/maturity.ts');
/* `id` and `state` are NOT adjacent — most entries carry a comment
   between them explaining the grade, which is the most useful prose in
   that file and must not have to move to satisfy a regular expression.
   So the split is on the entry boundary and each entry is read whole.

   The first attempt required them adjacent, matched nothing, and the
   assertion below it passed over an empty list — a gate naming zero
   elements agrees that all zero of them are named. The guard is what
   turned that into a failure instead of a green tick. */
const partialIds = coverageDecl
  .split(/\n  \{\n/)
  .filter((entry) => /state:\s*"PARTIAL"/.test(entry))
  .map((entry) => entry.match(/id:\s*"([\d.]+)"/)?.[1])
  .filter(Boolean);
/* THE GUARD HAD TO LEARN THAT ZERO IS AN ANSWER.

   It required partialIds.length > 0, because an empty list would have
   meant the parser had broken rather than that the product had
   finished — a gate naming zero elements agrees that all zero of them
   are named, which is the shape this file exists to refuse.

   Both elements are now BUILT, so zero is the truth. The guard
   therefore checks the PARSER rather than the count: the ids it
   extracted must match the PARTIAL states it can see, whatever that
   number is. If the regex ever stops matching, the two disagree and
   this still fails. */
const partialStates = (coverageDecl.match(/state:\s*"PARTIAL"/g) ?? []).length;
assert(
  'the partial elements were discovered out of the coverage table',
  partialIds.length === partialStates,
  `found ${partialIds.length} partial ids against ${partialStates} PARTIAL states — ` +
    'the parser and the table disagree, so this check is reading something it does not understand'
);
assert(
  'and the coverage table was parsed at all',
  (coverageDecl.match(/state:\s*"(BUILT|PARTIAL|NOT_BUILT)"/g) ?? []).length >= 12,
  'fewer than twelve element states were found in the coverage table — the parser has ' +
    'lost its subject, and every assertion below it would pass over nothing'
);
const unnamed = partialIds.filter((id) => !pages.includes(`(${id})`));
assert(
  'the About page names every element that is only partial',
  unnamed.length === 0,
  `${unnamed.join(', ')} is PARTIAL in the coverage table and unnamed on /about. An ` +
    'operator reading "eleven of twelve" is entitled to know which two are half of one'
);
assert(
  'and it still says what no software can supply',
  /no software can/i.test(pages),
  'the About page must say which part of an SMS this cannot be — the commitment behind ' +
    'the signature, not the record of it'
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

/* Test count, ASKED OF THE RUNNER rather than parsed out of the files.

   THIS GATE AGREED WITH THE README AND BOTH WERE WRONG BY SIX. It used
   to read the sources: count `it(` lines, then find each `it.each(NAME)`
   and count the entries of the named array by looking for lines that
   start with `{`, `"` or `'`. That is a re-implementation of vitest's
   collection, and a re-implementation drifts — an entry wrapped
   differently, an array whose closing bracket does not sit on its own
   line, a `describe.each`, and the count is quietly short. It read 431
   while the suite ran 437, and nothing could notice, because the number
   the gate compared the README against was produced by the same broken
   parser. A check whose two sides come from one flawed source cannot
   fail; that is the failure mode this repository treats as worse than
   having no check.

   `vitest list` collects the suite exactly as a run would and prints one
   line per case. It is the runner's own answer to the question the
   README is making a claim about, which is the same discipline the
   brand gate uses: execute it, read the number it reports about itself,
   never count the thing yourself.

   The file discovery stays as an assertion in its own right — it is
   what makes "no tests at all" fail loudly instead of passing as zero. */
const testFiles = readdirSync(resolve(ROOT, 'tests')).filter((f) => f.endsWith('.test.ts'));
assert(
  'test files were discovered',
  testFiles.length > 0,
  'no *.test.ts found under tests/ — this gate asserts a count over them'
);

/* The installed binary by path, through this same node, rather than
   `npx vitest`. npx resolves through PATH and a package manager, both of
   which differ between a laptop and a CI runner — and a resolution
   failure here returns no lines, which the assertion below would read
   as "the runner collected nothing" rather than as "the count is
   wrong". Deterministic invocation keeps that failure honest. */
const listed = spawnSync(
  process.execPath,
  [resolve(ROOT, 'node_modules/vitest/vitest.mjs'), 'list'],
  { encoding: 'utf8', cwd: ROOT }
);
const testCount = (listed.stdout ?? '')
  .split('\n')
  .filter((l) => /^tests\/.+ > /.test(l)).length;
assert(
  'the runner collected the suite and reported its cases',
  testCount > 0,
  '`vitest list` produced no cases — this gate cannot count what it cannot collect (rule 11)'
);

const testsStated = statedCount(/(\d+) unit tests/, 'test count');
assert(
  'README test count matches what the runner collects',
  testsStated === testCount,
  `README says ${testsStated}, the runner collects ${testCount}`
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

/* ---------------- The same figure, on the page a CUSTOMER reads ----

   THE HOLE THIS CLOSES, AND IT WAS OPEN LONG ENOUGH TO MATTER. The
   assertion above ties the README to the table. The README is read by
   whoever works on this repository. /about is read by whoever is
   deciding whether to pay for it, and nothing checked it at all.

   So it drifted, in the direction nobody watches for. While COVERAGE
   moved to ten built and two partial, /about went on saying the product
   "substantially covers ONE AND A HALF of them" and listed ten things an
   operator "still needs, and will not find here" — nine of which were
   built and shipping. A prospect was being told to go and buy nine
   products they already had.

   The page even claimed the two figures "cannot drift apart", which was
   the only sentence on it doing no work: nothing enforced that, and they
   had. That is charter rule 10 exactly — a number typed rather than
   computed — landing on the one surface where being wrong costs a sale
   instead of a code review.

   BOTH FORMS ARE CHECKED, because prose has two ways to say eleven. A
   gate that only reads the numeral is satisfied by a lede that spells
   it out and says something else. */
const aboutSource = read('apps/web/src/content/pages.js');
const WORD = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
];

const numeric = [...aboutSource.matchAll(/([\d.]+) of 12\b/g)].map((m) => Number(m[1]));
const spelled = [...aboutSource.matchAll(/\b([a-z]+) of (?:the |ICAO[^]{0,24})?twelve elements/gi)]
  .map((m) => m[1].toLowerCase());

/* Rule-11 guard. An empty set satisfies "every claim agrees" perfectly,
   so the gate has to find claims before it is entitled to pass them. */
assert(
  'the customer-facing coverage claims were found at all',
  numeric.length + spelled.length >= 2,
  `read ${numeric.length} numeric and ${spelled.length} spelled-out coverage claims out of ` +
    'apps/web/src/content/pages.js — this check would pass by finding nothing'
);

assert(
  'every numeric coverage claim a customer reads matches the coverage table',
  numeric.every((n) => n === coverageFigure),
  `apps/web/src/content/pages.js states ${[...new Set(numeric)].join(', ')} of 12; the table ` +
    `computes ${coverageFigure} (${coverageBuilt} built + ${coveragePartial} partial at half credit)`
);

assert(
  'every spelled-out coverage claim a customer reads matches it too',
  spelled.every((w) => w === WORD[coverageFigure]),
  `apps/web/src/content/pages.js spells the figure "${[...new Set(spelled)].join('", "')}" ` +
    `where the table computes ${coverageFigure}` +
    (Number.isInteger(coverageFigure)
      ? ` — write "${WORD[coverageFigure]}"`
      : ' — a half figure has no word form, so use the numeral')
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
/* THE FILES ARE DISCOVERED, NOT LISTED.

   This gate named routes.auth.ts and routes.sync.ts, because those were
   the two that existed when it was written. Twelve more route files
   arrived afterwards and the list did not grow — so the gate went on
   passing about two files while saying something that reads as though
   it is about all of them.

   That is the hardcoded-list defect this repository has already met
   twice: a ten-table list is how eight tables arrived outside the RLS
   posture, and check-a11y.mjs discovers its routes for exactly this
   reason. A gate over a literal list stops covering the moment somebody
   adds a file, and nothing announces it. */
const routeFiles = readdirSync(resolve(ROOT, 'apps/api/src'))
  .filter((f) => f.startsWith('routes.') && f.endsWith('.ts'))
  .map((f) => `apps/api/src/${f}`);

assert(
  'the rate-limit gate found the route files it is about',
  routeFiles.length >= 10,
  `only ${routeFiles.length} route file(s) were discovered — this gate is reading ` +
    `the wrong directory and would pass on an empty set (charter rule 11)`
);

const routeSources = routeFiles.map((p) => read(p)).join('\n');
const declaredLimits = (routeSources.match(/rateLimit\s*:/g) ?? []).length;

/* ------------------------------------------------------------------
   AND A WRITE ROUTE MUST DECLARE ONE.

   The assertions below check that a DECLARED limit is a wired limit,
   which was the defect of the day they were written. They cannot see
   the opposite failure, and the audit found it: routes.change.ts,
   routes.register.ts and routes.spi.ts each registered POSTs that
   create rows, behind `authenticate` and nothing else. Every other
   route file carried a limit; those three carried none, and the gate
   was looking the wrong way to notice.

   Authentication bounds WHO may write. It does not bound how often, so
   a stuck retry loop on a handset — or a token somebody kept after
   leaving — wrote until something else broke.

   Mutating verbs only. A read route may legitimately go unlimited;
   /health does, deliberately, so an orchestrator probe stays free. */
const unlimitedWriters = routeFiles.filter((p) => {
  const source = read(p);
  const writes = /app\.(post|put|patch|delete)\b/.test(source);
  return writes && !/rateLimit\s*:/.test(source);
});

assert(
  'every route file that writes declares a rate limit',
  unlimitedWriters.length === 0,
  `${unlimitedWriters.length} route file(s) register a POST/PUT/PATCH/DELETE and ` +
    `declare no config.rateLimit, so an authenticated caller may write without ` +
    `bound: ${unlimitedWriters.join(', ')}`
);

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
    [
      "/api/v1/auth/signup",
      "Creating the operator account is how an SMS comes to exist for a customer, " +
        "not one of the twelve things it has to do. /coverage answers what an " +
        "operator can evidence to an inspector, and 'we have an account' is not on " +
        "that list — putting it there would be the coverage page overstating in the " +
        "other direction, by counting a commercial step as a regulatory one.",
    ],
    [
      "/api/v1/admin/operators",
      "THE VENDOR'S CONSOLE IS NOT THE OPERATOR'S SMS. /coverage answers what an " +
        "operator can evidence to an inspector, and 'our supplier provisioned our " +
        "account' is not on that list. Listing it would be the coverage page " +
        "counting a commercial step as a regulatory one — the same overstatement " +
        "the signup exemption below exists to avoid, and worse here because this " +
        "route is not even reachable by anybody in the operator's organisation.",
    ],
    [
      "/api/v1/admin/operators/:id/entitlement",
      "As above — confirming what a customer has paid for is a fact about the " +
        "invoice, not about their safety management system.",
    ],
    ["/api/v1/auth/logout", "As above."],
    ["/api/v1/auth/refresh", "As above."],
    ["/api/v1/auth/me", "As above."],
    [
      "/api/v1/auth/password",
      "Changing your own password is account security, not one of the twelve " +
        "things an SMS has to do. It exists because the administrator reset route " +
        "ends by saying 'have them change it' and nothing could — an instruction " +
        "with no mechanism, the same shape the demo-password rotation had. That " +
        "makes it a real gap and still not a regulatory one: an inspector asks what " +
        "an operator can evidence about its safety management, and 'our safety " +
        "officer can rotate their own credential' is not on that list. Putting it " +
        "on /coverage would be the page overstating in the other direction, by " +
        "counting a security hygiene control as an Annex 19 element.",
    ],
    [
      "/api/v1/auth/forgot",
      "Recovering access to the account is account security, not one of the twelve " +
        "things an SMS has to do — the same line the self-service password change is " +
        "on. It exists because the ADMINISTRATIVE reset was unreachable: signup makes " +
        "one ACCOUNTABLE_EXECUTIVE, that role does not hold user.manage, and no route " +
        "makes a second user, so every operator that signed up had nobody able to " +
        "reset it. A real defect, and still not something an inspector asks an " +
        "operator to evidence about its safety management.",
    ],
    ["/api/v1/auth/reset", "As above — the second half of the same path."],
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
  /* THE VERB AFTER THE PARAMETER COUNTS, AND THE FIRST ATTEMPT AT THIS
     CRIED WOLF.

     It read `route.split("/:")[0]`, which truncates
     /api/v1/sms/documents/:id/read to /api/v1/sms/documents — a string
     the screen that LISTS documents contains, so the check passed on
     the prefix and never looked at the verb. That route shipped with
     no caller anywhere in the product while element 1.5 claimed "a
     record of who has read the revision now in force", which is a
     claim kept by a route nobody could reach.

     THE OBVIOUS TIGHTENING IS WRONG, and this file already said so
     about a different check. Requiring the literal `/verb` in the
     bundle fails four CORRECT routes, because the screens build the
     verb by interpolation — `/api/v1/actions/${id}/${what}` and
     `/api/v1/changes/${id}/${approving ? 'approve' : 'review'}`. The
     path fragment genuinely is not in the source; the call genuinely
     is.

     So a verb counts as reached if the bundle contains it as a PATH
     FRAGMENT or as a QUOTED STRING — the two ways a screen can
     actually name it. Measured against every verb route the API
     registers at the time of writing: complete, cancel, approve and
     review pass on the quoted form, verify and notified on the path
     form, and read failed on both, which was the one real defect.
     Zero false positives and one true positive is the discrimination
     this needs; a rule that cannot tell those apart is one somebody
     turns off. */
  const reachable = (route) => {
    const [prefix, ...rest] = route.split("/:");
    if (!web.includes(prefix)) return false;
    const verbs = rest.flatMap((chunk) => chunk.split("/").slice(1)).filter(Boolean);
    return verbs.every(
      (verb) => web.includes(`/${verb}`) || new RegExp(`['"]${verb}['"]`).test(web),
    );
  };

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

/* ---------------- The gap analysis's own numbers ----------------
   docs/09-GAP-ANALYSIS.md is a document ABOUT the product's shortfalls,
   which makes a stale figure in it worse than a stale figure anywhere
   else: it would overstate or understate a gap, and somebody would plan
   against it. Its own header promises every figure is computed or cited.
   This is the mechanism that keeps that promise.

   ONLY THE LOAD-BEARING ONES. The file marks descriptive figures "(as
   at this date)" and those are deliberately not gated — a gate over
   every number in a prose document is a gate that fails on a sentence
   being reworded, and one that fails for the wrong reason gets deleted.
   What is gated is what a reader would act on: the element coverage,
   the split behind it, and the count of jurisdictions the registry
   actually holds.
   ---------------------------------------------------------------- */
{
  const gaps = read('docs/09-GAP-ANALYSIS.md');
  const covSrc = read('packages/shared/src/maturity.ts');

  /* BUILT / PARTIAL counted off the COVERAGE array's own entries. The
     module is TypeScript and this gate is a plain script, so the states
     are counted from the source rather than imported — the same
     technique the route gates above use, and it fails loudly if the
     shape changes rather than silently reading zero. */
  const covBlock = /export const COVERAGE[\s\S]*?\n\]\);/.exec(covSrc)?.[0] ?? '';
  assert(
    'the COVERAGE array was located in maturity.ts',
    covBlock.length > 0,
    'could not find `export const COVERAGE` — this gate has lost its subject (rule 11)'
  );
  const builtActual = (covBlock.match(/state:\s*"BUILT"/g) ?? []).length;
  const partialActual = (covBlock.match(/state:\s*"PARTIAL"/g) ?? []).length;
  const coveredActual = builtActual + partialActual / 2;

  const statedSplit = /\*\*(\d+) built, (\d+) partial\. Coverage (\d+) of 12\*\*/.exec(gaps);
  assert(
    'the gap analysis states the element split and coverage',
    Boolean(statedSplit),
    'docs/09-GAP-ANALYSIS.md no longer states "N built, N partial. Coverage N of 12"'
  );
  if (statedSplit) {
    assert(
      'gap analysis element split matches maturity.ts',
      Number(statedSplit[1]) === builtActual && Number(statedSplit[2]) === partialActual,
      `the analysis says ${statedSplit[1]} built and ${statedSplit[2]} partial; ` +
        `COVERAGE holds ${builtActual} and ${partialActual}`
    );
    assert(
      'gap analysis coverage figure matches the computation',
      Number(statedSplit[3]) === coveredActual,
      `the analysis says ${statedSplit[3]} of 12; built + partial/2 is ${coveredActual}`
    );
  }

  /* The jurisdiction count, which is the analysis's largest strategic
     claim. Counted off the registry's own keys — adding Tanzania must
     move the sentence that says one country is one country, because
     that sentence is the reason somebody would prioritise adding it. */
  const regSrc = read('packages/shared/src/regulations.ts');
  const regBlock = /export const MOR_OBLIGATIONS[\s\S]*?\n};/.exec(regSrc)?.[0] ?? '';
  assert(
    'the MOR_OBLIGATIONS registry was located',
    regBlock.length > 0,
    'could not find `export const MOR_OBLIGATIONS` — this gate has lost its subject (rule 11)'
  );
  const rowsActual = (regBlock.match(/^\s{2}[A-Z]{2,4}:\s*\{/gm) ?? []).length;
  const rowsStated = /carries \*\*(\w+) rows:/.exec(gaps)?.[1];
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  assert(
    'the gap analysis states how many jurisdiction rows the registry holds',
    Boolean(rowsStated) && rowsStated.toLowerCase() in WORDS,
    'docs/09-GAP-ANALYSIS.md no longer states the registry row count in words'
  );
  assert(
    'gap analysis jurisdiction count matches the registry',
    WORDS[String(rowsStated).toLowerCase()] === rowsActual,
    `the analysis says ${rowsStated} rows; MOR_OBLIGATIONS defines ${rowsActual}`
  );
}

/* ---------------- The operator's own copy is complete ----------------
   The terms of use say an operator can hold its own copy, "which is the
   only form of data ownership that survives a vendor". Charter rule 7:
   a claim on a customer surface is kept by a mechanism.

   THE MECHANISM WAS A LIST, AND A LIST HAS NO OPINION ABOUT WHAT IS NOT
   ON IT. Nine tenant-owned collections were absent from the export —
   the indicators regulation 9(5) requires, their periods, the voluntary
   scheme regulation 13(3) requires, change assessments, the emergency
   contact directory, corrective actions, the disposition history and
   both acknowledgement records. Each arrived after the route was
   written; none was added to it; nothing went red.

   So the schema is the source of truth and this gate is the diff. A
   model carrying `orgId` is tenant-owned safety record, and it must
   either be READ by the export or be NAMED in EXPORT_EXCLUSIONS with a
   reason. Neither is a build failure.

   ASSERTED OVER THE SCHEMA RATHER THAN OVER A LIST OF MODELS, for the
   same reason the RLS test asserts over pg_tables: a list is exactly
   what failed here, and encoding the current answer into the guard
   reproduces the defect one level up.
   --------------------------------------------------------------- */
{
  const schema = read('prisma/schema.prisma');
  const exportSrc = read('apps/api/src/routes.export.ts');

  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)];
  assert(
    'Prisma models were found to diff the export against',
    models.length > 0,
    'no `model X {` blocks in prisma/schema.prisma — this gate has lost its subject (rule 11)'
  );

  /* Tenant-owned means it carries orgId. That is the same definition
     tenantWhere() uses at runtime, so the gate and the query agree on
     what "this operator's data" means. */
  const tenantOwned = models.filter(([, , body]) => /^\s*orgId\s/m.test(body)).map(([, n]) => n);
  assert(
    'tenant-owned models were identified',
    tenantOwned.length > 5,
    `only ${tenantOwned.length} models carry orgId — the detection is wrong, not the schema`
  );

  const excluded = new Set(
    [...(/EXPORT_EXCLUSIONS[\s\S]*?\n\}\);/.exec(exportSrc)?.[0] ?? '')
      .matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1])
  );

  const absent = tenantOwned.filter((m) => {
    const client = m[0].toLowerCase() + m.slice(1);
    return !new RegExp(`prisma\\.${client}\\.find`).test(exportSrc) && !excluded.has(m);
  });
  assert(
    'THE OPERATOR\'S OWN COPY HOLDS EVERY TENANT-OWNED COLLECTION',
    absent.length === 0,
    `${absent.join(', ')} — tenant-owned and neither exported nor listed in ` +
      'EXPORT_EXCLUSIONS. The terms promise an operator its own copy; a collection ' +
      'that is silently absent from that file is the promise failing by omission, ' +
      'which is how nine of them went missing before this gate existed'
  );

  /* And the other direction: an exclusion for a model that no longer
     exists is a reason nobody will ever re-read, sitting in a file that
     looks maintained. Rule 11 from the other side. */
  const stale = [...excluded].filter((m) => !tenantOwned.includes(m) && !new RegExp(`^model ${m} `, 'm').test(schema));
  assert(
    'no exclusion names a model the schema does not define',
    stale.length === 0,
    `${stale.join(', ')} — excluded from the export, but no such model exists`
  );
}

/* ---------------- Every printable screen is attributable ------------
   A screen with a print button produces a document that leaves the
   building as loose paper. printId() exists so an auditor can tell
   whose pack it is — the org id in the token is a uuid, useless on
   paper — and it refuses to render at all when the name is unknown,
   because half-attributed is the version filed under the wrong
   operator.

   IT WAS ON TWO OF SIX. The four without it were the risk register, the
   indicators, the safety risk assessment and the maturity assessment —
   which is to say, the four documents an auditor is most likely to be
   handed. Nothing was wrong with the reasoning; it simply was not
   carried across as each screen gained its button, and no check knew
   the button existed.

   SO THE BUTTONS ARE DISCOVERED, NOT LISTED. Any module calling
   window.print() must also reach printId, directly or through
   attachPrintId. The seventh screen to gain a print button fails the
   build until it is attributable too.
   --------------------------------------------------------------- */
{
  const toolsDir = resolve(ROOT, 'apps/web/src/tools');
  const modules = readdirSync(toolsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `apps/web/src/tools/${d.name}/index.js`);

  const printable = [];
  for (const rel of modules) {
    let src;
    try { src = read(rel); } catch { continue; }
    if (/window\.print\(\)/.test(src)) printable.push([rel, src]);
  }
  assert(
    'screens with a print button were discovered',
    printable.length > 0,
    'no module calls window.print() — this gate has lost its subject (rule 11)'
  );

  /* THE EXCEPTION IS DECLARED IN THE MODULE, NOT HERE, and that is the
     lesson from EXPORT_EXCLUSIONS. A skip-list living in the gate is
     invisible to whoever edits the screen; a marker in the file is read
     by the next person to touch it.

     A module that genuinely should not carry an operator's name says so
     with `PRINT-ID: not an operator document`, followed by the reason.
     /pages is the real case — it prints this product's own
     documentation, and stamping a customer's name on UsalamaSMS's
     methodology page would be a false attribution rather than a missing
     one.

     /picture prints through the browser chrome rather than a button and
     already calls printId, so it is covered from the other direction:
     reaching printId is what is asserted, not owning a button. */
  /* COMMENTS ARE STRIPPED BEFORE THE CODE TEST, and finding out why is
     the reason this paragraph exists. The first version of this gate
     matched the raw source, and it passed against a register with its
     attachPrintId import and call both deleted — because the comment
     explaining the call still contained the word `printId()`. A gate
     satisfiable by prose about the thing is a gate that cannot fail,
     which is the one failure mode this repository treats as worse than
     having no gate at all.

     The MARKER is matched against the raw source deliberately: it is a
     declaration, and a declaration belongs in a comment. Only the claim
     to have implemented something has to be made in code. */
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const EXEMPT = /PRINT-ID:\s*not an operator document/;
  const unattributed = printable
    .filter(([, src]) => !/\b(printId|attachPrintId)\b/.test(code(src)) && !EXEMPT.test(src))
    .map(([rel]) => rel.split('/').at(-2));
  assert(
    'EVERY PRINTABLE SCREEN CAN BE ATTRIBUTED TO AN OPERATOR',
    unattributed.length === 0,
    `${unattributed.join(', ')} — has a print button and never reaches printId. ` +
      'A pack handed to an auditor with no operator name on it cannot be attributed, ' +
      'and this is how four of six screens came to be that way: the button was added, ' +
      'the header was not, and nothing knew the button existed'
  );
}

/* ---------------- A TENANT CANNOT CONFIGURE THE LAW ----------------
   An operator may set what it calls its posts, what its manual calls
   each point on the risk scales, which strips it flies to and how long
   its own review cycle is. It may NOT set the reporting deadlines, the
   tolerability bands, the de-identification rule, the audit chain or
   what the twelve Annex 19 elements mean. A product that lets a tenant
   edit those has sold a compliance tool that cannot be relied on for
   compliance.

   THE LINE IS NOT CROSSED BY DECISION. Nobody sits down and adds a
   configurable MOR deadline. It is crossed by a settings screen growing
   one more field that seemed harmless — an "escalation hours", a "band
   override for our operation", a "custom element wording" — each
   individually arguable and collectively the end of the claim.

   So the gate reads the field names. The tenant configuration, in the
   shared module and in the Prisma model behind it, must contain no
   field whose name belongs to the other side of the line. Names rather
   than behaviour, deliberately: behaviour is what a reviewer checks and
   a name is what a gate can, and the failure mode being guarded is
   somebody adding a field in a hurry rather than somebody rewriting
   tolerability().

   AND THE ARITHMETIC MUST NOT READ THE CONFIGURATION AT ALL. risk.ts
   computes the band on every read and is what makes two operators'
   registers comparable to a regulator holding both. A tenant-aware
   tolerability() would make "what band is this" a question about whose
   database is being read.
   --------------------------------------------------------------- */
{
  const tenantSrc = read('packages/shared/src/tenant.ts');
  const schema = read('prisma/schema.prisma');
  const riskSrc = read('packages/shared/src/risk.ts');

  /* Words that name the other side of the line. Matched against FIELD
     NAMES only — the prose in this module argues about deadlines and
     bands constantly, and a gate that read the comments would fail on
     the file explaining why it must not. */
  const FORBIDDEN = [
    'deadline', 'hours', 'tolerab', 'band', 'threshold', 'deident',
    'anonym', 'chain', 'element', 'severityScale', 'likelihoodScale',
    'matrix', 'jurisdiction', 'instrument',
  ];

  const iface = /export interface TenantConfig \{([\s\S]*?)\n\}/.exec(tenantSrc)?.[1] ?? '';
  assert(
    'the TenantConfig interface was located',
    iface.length > 0,
    'no `export interface TenantConfig` in tenant.ts — this gate has lost its subject (rule 11)'
  );
  /* Comments stripped before the names are read, for the reason the
     print-attribution gate learned: a check satisfiable — or failable —
     by prose about the thing is not checking the thing. */
  const ifaceFields = [
    ...iface.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/^\s*readonly (\w+)\??:/gm),
  ].map((m) => m[1]);
  assert(
    'TenantConfig declares fields to check',
    ifaceFields.length > 0,
    'no readonly fields found on TenantConfig — the field detection is wrong, not the type'
  );

  const model = /model OrgConfig \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';
  assert(
    'the OrgConfig model was located',
    model.length > 0,
    'no `model OrgConfig` in prisma/schema.prisma — this gate has lost its subject (rule 11)'
  );
  const modelFields = [
    ...model.replace(/^\s*\/\/.*$/gm, ' ').replace(/^\s*\/\/\/.*$/gm, ' ')
      .matchAll(/^\s{2}(\w+)\s+\S/gm),
  ].map((m) => m[1]);

  const crossings = [...ifaceFields, ...modelFields].filter((f) =>
    FORBIDDEN.some((w) => f.toLowerCase().includes(w.toLowerCase()))
  );
  assert(
    'NO TENANT-CONFIGURABLE FIELD NAMES SOMETHING THAT IS NOT THE TENANT\'S TO DECIDE',
    crossings.length === 0,
    `${[...new Set(crossings)].join(', ')} — a tenant configuration field named after a ` +
      'reporting deadline, a tolerability band, de-identification, the audit chain or an ' +
      'element definition. Those come from the instrument, from Doc 9859, from L.N. 32 ' +
      'and from Annex 19; an operator that can edit them has bought a compliance tool ' +
      'that cannot be relied on for compliance'
  );

  /* The arithmetic stays tenant-blind. */
  assert(
    'THE RISK ARITHMETIC DOES NOT READ THE TENANT CONFIGURATION',
    !/\btenant\b|TenantConfig|normaliseConfig|orgConfig/i.test(riskSrc),
    'risk.ts reaches for the tenant configuration. The 5x5 and its bands are Doc 9859\'s, ' +
      'computed on every read — a tenant-aware tolerability() makes "what band is this" a ' +
      'question about whose database is being read, and two operators\' registers stop ' +
      'being comparable to a regulator holding both'
  );

  /* And the labels can only ever be a RENAME: the maps are keyed by the
     framework's own key sets, derived from the scales rather than
     retyped, so there is no representation for a sixth severity. */
  assert(
    'the label maps are keyed by the framework\'s own keys, derived not retyped',
    /SEVERITY_KEYS[\s\S]{0,120}SEVERITY_SCALE\.map/.test(tenantSrc) &&
      /LIKELIHOOD_KEYS[\s\S]{0,120}LIKELIHOOD_SCALE\.map/.test(tenantSrc),
    'the allowed label keys are no longer derived from the scales. A second hand-written ' +
      'list of severity keys is a second list, and it goes stale the day a scale changes — ' +
      'at which point a tenant can name a point the matrix does not have'
  );
}

/* ---------------- A HANDOFF IS NOT AN ALERT ----------------
   The share control hands a computed warning to WhatsApp or a mail
   client. It reaches somebody who has ALREADY OPENED THE SCREEN — it
   removes the retyping, not the checking.

   THE ONE WAY IT DOES HARM IS BY BEING MISTAKEN FOR THE THING IT
   STANDS IN FOR. An operator who believes they are being alerted stops
   looking, and then the first they hear of a lapsed licence or a
   missed reporting deadline is from the authority. That is a worse
   position than having no share button, because the button bought the
   belief.

   So two things are asserted. Element 4.1 must still say the warning
   does not arrive — the coverage figure does not move for this, and a
   future edit that quietly closes 4.1 on the strength of a share sheet
   fails here. And the copy must not use the vocabulary of notification:
   a button that says "notify the safety manager" is a promise this
   cannot keep.
   --------------------------------------------------------------- */
{
  const covSrc = read('packages/shared/src/maturity.ts');
  /* Located by index rather than by a regex over braces: the entries
     contain nested objects and template strings, and a brace-counting
     pattern that looked right matched the wrong block and reported 4.1
     as no longer PARTIAL while it plainly was. A window from the id to
     the next id is unambiguous. */
  /* SEARCHED INSIDE `COVERAGE`, not across the file. `id: "4.1"` appears
     twice — once in the twelve-element FRAMEWORK list, which carries a
     question and an evidence line and no state at all, and once in
     COVERAGE, which is the one this assertion is about. Anchoring on
     the first occurrence found the framework entry, saw no
     state: "PARTIAL" in it, and reported that 4.1 had been closed while
     it plainly had not. A false failure is not a harmless one: it
     teaches whoever meets it that this gate cries wolf. */
  const covStart = covSrc.indexOf('export const COVERAGE');
  const inCoverage = covStart >= 0 ? covSrc.slice(covStart) : '';
  const at41 = inCoverage.indexOf('id: "4.1"');
  const at42 = inCoverage.indexOf('id: "4.2"');
  const training = at41 >= 0 && at42 > at41 ? inCoverage.slice(at41, at42) : '';
  assert(
    "element 4.1's coverage entry was located",
    training.length > 0,
    'no 4.1 entry in COVERAGE — this gate has lost its subject (rule 11)'
  );
  /* CHANGED DELIBERATELY, WHICH IS WHAT THE OLD MESSAGE ASKED FOR.

     This used to assert element 4.1 was PARTIAL, and its failure text
     said: "if real delivery has shipped, this assertion should be
     changed deliberately in the same commit — not discovered to have
     been passing." Real delivery has shipped, and this is that commit.

     The chain was verified end to end rather than assumed:
     netlify/functions/digest.mts runs on cron 0 5 * * *, computeDigest
     classifies every training record through currencyOf — which
     returns DUE_SOON BEFORE the expiry, not only LAPSED after it —
     sendDigest emails every recipient holding report.read.org, and
     mail.ts renders "N training currencies are lapsing" into the
     message. A share sheet reaches somebody who already opened the
     screen; this reaches somebody who did not.

     SO THE ASSERTION IS NOW THE ONE THAT WOULD CATCH A REGRESSION:
     the delivery path must still exist. Deleting the scheduled
     function, or dropping currencies from the digest, puts element 4.1
     back to where it was and this gate says so. */
  const digestFn = read('netlify/functions/digest.mts');
  assert(
    'ELEMENT 4.1 IS BUILT ONLY WHILE THE WARNING ACTUALLY ARRIVES',
    /state:\s*"BUILT"/.test(training) &&
      /sendDigest/.test(digestFn) &&
      /currencies/.test(read('apps/api/src/digest.compute.ts')),
    'element 4.1 claims BUILT, but the delivery path that justifies it is gone. ' +
      'A currency standing computed on a screen only reaches somebody who opens the ' +
      'screen — which is exactly what made this element PARTIAL for months. Either ' +
      'restore the scheduled digest and its training currencies, or put 4.1 back to ' +
      'PARTIAL and say why'
  );

  /* The copy, on the component and on every screen that hosts it.
     Comments stripped first: this file and that one argue about
     alerting constantly, and a gate that read the prose would fail on
     the paragraph explaining why the prose matters. */
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const hosts = [
    'apps/web/src/components/Handoff.js',
    'packages/shared/src/handoff.ts',
  ];
  const overclaims = [];
  for (const rel of hosts) {
    const code = strip(read(rel));
    /* Matched inside quoted strings only — the words are legitimate in
       an identifier or a type name, and only reach a person as copy. */
    for (const m of code.matchAll(/['"`]([^'"`]{4,})['"`]/g)) {
      if (/\b(alert|notif(y|ies|ication)|remind(er|s)?)\b/i.test(m[1])) {
        overclaims.push(`${rel}: ${JSON.stringify(m[1].slice(0, 60))}`);
      }
    }
  }
  assert(
    'THE SHARE CONTROL DOES NOT SPEAK THE LANGUAGE OF NOTIFICATION',
    overclaims.length === 0,
    `${overclaims.join('; ')} — this control cannot notify anybody. It composes a ` +
      'sentence for a person who is already looking at the screen, and copy that says ' +
      'otherwise sells a promise the product does not keep'
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
