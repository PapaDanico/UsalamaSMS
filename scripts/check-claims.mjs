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
  /* The four the corridor is actually flown between. Named individually
     so dropping one is a specific, legible failure. */
  for (const required of ['5Y', '5X', '5H', '9XR']) {
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
