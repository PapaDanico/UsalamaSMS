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

import { readFileSync } from 'node:fs';
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
  const jurisdictions = [...jurisdictionMatch[1].matchAll(/"([A-Z]{2})"/g)].map((m) => m[1]);
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
  'the switches document still lists the provisional jurisdictions',
  /PROVISIONAL/.test(switches) && /Uganda, Tanzania and Rwanda/.test(switches),
  'the highest-risk claim in the product lost its entry'
);

/* The provisional flag in the code and the entry in the document have to
   agree. Either alone is a claim nobody is checking. */
const provisionalInCode = (regulations.match(/PROVISIONAL/g) ?? []).length;
assert(
  'the code still marks provisional rows',
  provisionalInCode >= 3,
  `${provisionalInCode} PROVISIONAL markers found; the document claims three jurisdictions are unverified`
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

/* Test count, from the test files themselves. */
const testCount = ['tests/safetycritical.test.ts', 'tests/confidentiality.test.ts']
  .map((p) => (read(p).match(/^\s*it\(/gm) ?? []).length)
  .reduce((a, b) => a + b, 0);

const testsStated = statedCount(/(\d+) unit tests/, 'test count');
assert(
  'README test count matches the test files',
  testsStated === testCount,
  `README says ${testsStated}, the files define ${testCount}`
);

/* This gate's own total is only known once every assertion has run, so
   it is checked at the very end, below. */
const claimsStated = statedCount(/(\d+) assertions that the registries/, 'claims assertion count');

/* ---------------- Report ---------------- */

for (const p of passes) console.log(`  ok   ${p}`);

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
