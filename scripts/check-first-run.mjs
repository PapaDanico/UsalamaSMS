/* =====================================================================
   THE SCREEN AN OPERATOR MEETS ON DAY ONE.

   Measured on 18 August 2026, against a signed-in operator with nothing
   filed, no indicator and an empty register, /today read:

     Nothing needs you today
     No reporting deadline is open, no currency is lapsing, nothing is
     waiting to be triaged and no corrective action is overdue.

   Every clause of that is TRUE. Together they tell somebody who has
   done nothing at all that everything is fine. The digest is computed
   over an empty record, correctly finds nothing, and the screen
   rendered the absence of findings as a clean bill of health.

   today.ts had already refused to call an UNKNOWN clear, and said why:
   "a screen whose job is to answer 'is everything all right' saying the
   most reassuring possible thing at the moment it knows least is the
   failure this product exists to refuse." The argument was never
   extended to EMPTY. This gate is that extension, held over the
   rendered screen rather than over the predicate.

   BOTH DIRECTIONS, and the second is not padding. A sequence that never
   stops is a nag, and a product that offers "file your first report" to
   an operator with seven of them reads as not having noticed. So the
   established render must NOT carry the first-run block, and the two
   renders must differ — a fixture that quietly stopped taking would
   otherwise make every assertion here vacuous.
   ===================================================================== */
import { chromium } from 'playwright';
import { findChromium } from './lib/chromium.mjs';
import { SESSION, bodyFor, emptyBodyFor, clearBodyFor } from './lib/a11y-fixtures.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = 4324;
const BASE = `http://127.0.0.1:${PORT}`;

/* The all-clear wording, which must never be what a new operator reads.
   Matched as the screen renders it rather than by a class, because what
   is wrong with it is the sentence, not the markup. */
const ALL_CLEAR = 'Nothing needs you today';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
};

if (!existsSync(DIST)) {
  console.error('check:first-run — dist/ is absent. Run npm run build first.');
  process.exit(1);
}

const server = createServer((q, r) => {
  let p = join(DIST, decodeURIComponent(q.url.split('?')[0]));
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(DIST, 'index.html');
  r.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
  r.end(readFileSync(p));
});
await new Promise((r) => server.listen(PORT, r));

const failures = [];
const passes = [];
function assert(what, ok, why) {
  if (ok) { passes.push(what); console.log(`  ok   ${what}`); }
  else failures.push(`${what} — ${why}`);
}

const browser = await chromium.launch({ executablePath: findChromium() });
const render = async (responder) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.route('**/api/v1/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(responder(r.request().url())),
  }));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((s) => {
    localStorage.setItem('usalamasms.session', JSON.stringify(s));
    localStorage.setItem('usalamasms.refresh', 'stub');
  }, SESSION);
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const out = await page.evaluate(() => ({
    text: (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' ').trim(),
    steps: document.querySelectorAll('[data-first-run] li').length,
    toReport: !!document.querySelector('[data-first-run] a[href="/report"]'),
    heading: document.querySelector('main h1')?.innerText ?? '',
  }));
  await ctx.close();
  return out;
};

let empty, established, clear;
try {
  empty = await render(emptyBodyFor);
  established = await render(bodyFor);
  clear = await render(clearBodyFor);
} finally {
  await browser.close();
  server.close();
}

console.log('check:first-run — /today on day one, and once running\n');

/* RULE 11 FIRST. Everything below compares two renders; if the screen
   failed to render at all, each comparison is satisfied by emptiness. */
assert(
  'both states rendered a screen at all',
  Boolean(empty.heading) && Boolean(established.heading),
  `empty heading ${JSON.stringify(empty.heading)}, established heading ` +
  `${JSON.stringify(established.heading)} — one of them did not load`
);

assert(
  'AN EMPTY RECORD IS NOT REPORTED AS A CLEAR ONE',
  !empty.text.includes(ALL_CLEAR),
  `a brand-new operator was told ${JSON.stringify(ALL_CLEAR)}. The digest correctly ` +
  'found nothing wrong; the screen rendered that absence as a clean bill of health'
);

assert(
  'and is told what its position actually is',
  /not running yet/i.test(empty.heading),
  `the headline read ${JSON.stringify(empty.heading)}, which does not say the ` +
  'system is not running yet'
);

assert(
  'the first fifteen minutes are sequenced on the screen',
  empty.steps >= 3,
  `${empty.steps} step(s) rendered. The sequence is what makes this an onboarding ` +
  'rather than a differently-worded absence'
);

assert(
  'and the first step is the report form, which is the product entry',
  empty.toReport,
  'no link to /report inside the first-run sequence. An operator who reads that they ' +
  'are not running yet and is given nowhere to start has been told off, not helped'
);

assert(
  'AN OPERATOR ALREADY RUNNING IS NOT OFFERED THE FIRST STEP',
  established.steps === 0,
  `${established.steps} first-run step(s) rendered for an operator with reports and ` +
  'indicators. A sequence that never stops is a nag'
);

/* THE RULE IS NOT A WALL. An operator with a real record and genuinely
   nothing outstanding SHOULD read the all-clear, and a first-run change
   that suppressed it everywhere would have replaced one wrong answer
   with another. */
assert(
  'AND A RUNNING OPERATOR WITH NOTHING WRONG STILL GETS THE ALL-CLEAR',
  clear.text.includes(ALL_CLEAR) && clear.steps === 0,
  `a settled operator read ${JSON.stringify(clear.heading)} with ${clear.steps} ` +
  'first-run step(s). The all-clear is correct for them and must survive'
);

assert(
  'and the two states do not read the same',
  empty.text !== established.text && empty.heading !== established.heading,
  'the empty and established renders are identical, so the fixture never took and ' +
  'every assertion above passed over one screen measured twice'
);

if (failures.length > 0) {
  console.error(`\n${failures.length} first-run failure(s):\n`);
  for (const f of failures) console.error(`  · ${f}`);
  console.error('\nFirst-run gate failed.');
  process.exit(1);
}

console.log(
  `\ncheck:first-run passed — ${passes.length} assertions over three renders of /today.\n` +
  `  day one:  ${JSON.stringify(empty.heading)}\n` +
  `  running:  ${JSON.stringify(established.heading)}\n` +
  `  settled:  ${JSON.stringify(clear.heading)}`
);
