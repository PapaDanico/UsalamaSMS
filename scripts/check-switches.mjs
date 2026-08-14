/* =====================================================================
   THE CLAIMS THAT EXPIRE.

   `docs/05-SWITCHES.md` exists because "a product's most dangerous
   statements are the true ones that quietly stop being true". Every
   entry is a claim that is accurate today, the flag that controls it,
   and the test that fails when it rots. Its own header says a claim
   without all three is a comment.

   IT HAD ONE. Entry 6 said the icon suite was "SVG only, so iOS gets no
   home-screen icon", and that the test was "none yet". By the time
   anybody re-read it the PNG suite had shipped, index.html carried the
   apple-touch-icon, and a smoke check asserted that the manifest
   advertises raster icons that exist. The document that catalogues rot
   had rotted, and nothing could notice, because nothing read it.

   THE FRONT PAGE HAD THE OTHER HALF. The README's document table said
   "Ten claims with an expiry date" while the file carried eleven — a
   hand-typed count about the product, in the same table as three counts
   that are derived, which is precisely what charter rule 10 forbids.

   So this gate reads the file. Four things, and each is a different way
   the document stops doing its job:

     · THE COUNT IS DERIVED, so the README cannot drift from it again;
     · EVERY SWITCH DECLARES A FLAG AND A TEST, so a new one cannot be
       added as a comment;
     · A CALENDAR EXPIRY FAILS THE BUILD once it passes. Entry 3 carries
       an `EXPIRES` marker and used to say its test was "none, and that
       is a gap this file records rather than hides" — on the reasoning
       that a claim about market timing cannot be asserted without
       inventing a fact. That was wrong: the expiry is a date, today is
       a date, and comparing them is the whole test. What could not be
       asserted was whether the positioning still persuades, and the
       impossibility of testing the judgement was allowed to excuse not
       testing the date;
     · AND THE DATES IN THE MARKERS MUST BE REAL, because an unparseable
       date silently becomes an expiry that never trips — the exact
       shape of a check that cannot fail.
   ===================================================================== */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const failures = [];
const passes = [];
function assert(what, ok, why) {
  if (ok) {
    passes.push(what);
    console.log(`  ok   ${what}`);
  } else {
    failures.push(`${what} — ${why}`);
  }
}

const switches = read('docs/05-SWITCHES.md');
const readme = read('README.md');

/* ---- the entries themselves ---- */
const headings = [...switches.matchAll(/^## (\d+)\. (.+)$/gm)];
assert(
  'the switches document defines entries at all',
  headings.length > 0,
  'no `## N. ` headings in docs/05-SWITCHES.md — this gate has lost its subject (rule 11)'
);

/* Numbered from 1 with no gaps. A gap is what a deletion leaves behind,
   and entry 6 was deleted the day this gate was written — renumbering by
   hand is exactly the step somebody skips. */
const numbers = headings.map((m) => Number(m[1]));
const expected = headings.map((_, i) => i + 1);
assert(
  'the entries are numbered from 1 with no gaps',
  numbers.join(',') === expected.join(','),
  `numbered ${numbers.join(', ')} — a gap or a repeat is what a deletion leaves behind`
);

/* ---- the README's count, derived ---- */
const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const stated = /\|\s*(\w+) claims with an expiry date/.exec(readme)?.[1];
assert(
  'the README states how many claims have an expiry date',
  Boolean(stated),
  'the README no longer describes docs/05-SWITCHES.md by its count, so this assertion ' +
    'has lost its subject (rule 11)'
);
const statedN = WORDS[String(stated).toLowerCase()] ?? Number(stated);
assert(
  'README switch count matches the document',
  statedN === headings.length,
  `README says ${stated} (${statedN}), the document carries ${headings.length}. ` +
    'Charter rule 10: counts about the product are computed, not typed'
);

/* ---- every entry declares a flag and a test ---- */
const sections = switches.split(/^## \d+\. /m).slice(1);
const missing = [];
for (const [i, body] of sections.entries()) {
  const title = headings[i][2];
  const hasFlag = /\*\*The flag:/.test(body);
  const hasTest = /\*\*The test/.test(body);
  if (!hasFlag || !hasTest) {
    missing.push(
      `${i + 1}. ${title} — ${!hasFlag ? 'no flag' : ''}${!hasFlag && !hasTest ? ' and ' : ''}${!hasTest ? 'no test' : ''}`
    );
  }
}
assert(
  'EVERY SWITCH DECLARES A FLAG AND A TEST',
  missing.length === 0,
  `${missing.join('; ')}. This file's own header says a claim without both is a comment`
);

/* ---- calendar expiries ---- */
const markers = [...switches.matchAll(/<!--\s*EXPIRES:\s*([^\s>]+)\s*-->/g)];
const today = new Date();
today.setUTCHours(0, 0, 0, 0);

const badDates = markers.map((m) => m[1]).filter((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)));
assert(
  'every EXPIRES marker carries a real ISO date',
  badDates.length === 0,
  `${badDates.join(', ')} — an unparseable date is an expiry that never trips, which is ` +
    'a check that cannot fail'
);

const expired = [];
for (const m of markers) {
  const when = new Date(`${m[1]}T00:00:00Z`);
  if (Number.isNaN(when.getTime())) continue;
  /* Which entry the marker sits in, so the failure names the claim
     rather than a line number. */
  const before = switches.slice(0, m.index);
  const owner = [...before.matchAll(/^## (\d+)\. (.+)$/gm)].at(-1);
  if (when <= today) {
    expired.push(`${owner ? `${owner[1]}. ${owner[2]}` : 'an entry'} expired on ${m[1]}`);
  }
}
assert(
  'no claim with a calendar expiry has passed it',
  expired.length === 0,
  `${expired.join('; ')}. The claim is no longer accurate. Rewrite the entry to what is ` +
    'now true and move the marker, or delete the entry if the claim is gone — a resolved ' +
    'switch is deleted, not ticked'
);

/* Rule 11 from the other side: this gate must not pass by asserting
   nothing, and a switches file with no calendar expiry at all is a file
   somebody stripped the markers out of. */
assert(
  'at least one claim carries a calendar expiry',
  markers.length > 0,
  'no EXPIRES marker anywhere in docs/05-SWITCHES.md — the expiry check is inert'
);

if (failures.length > 0) {
  console.error(`\n${failures.length} switch failure(s):\n`);
  for (const f of failures) console.error(`  · ${f}`);
  console.error('\nSwitches gate failed.');
  process.exit(1);
}

console.log(
  `\nSwitches gate passed — ${passes.length} assertions over ${headings.length} claims, ` +
    `${markers.length} with a calendar expiry.`
);
