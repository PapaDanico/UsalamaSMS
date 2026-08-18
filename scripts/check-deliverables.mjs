/* =====================================================================
   THE DOCUMENT THAT REACHES A REGULATOR'S DESK.

   Every toolkit in this product ends in something a safety manager
   hands over — a risk assessment, a register, an indicator report, a
   maturity assessment, the twelve-element record, the risk picture.
   The route to paper is deliberately the browser's own print, not a
   second PDF engine, because a second engine is a second place for the
   numbers to disagree.

   WHAT THAT LEAVES UNGUARDED is the identity. A pack with the
   operator's name and mark on it is a document; the same pack without
   them is an anonymous printout that an inspector cannot file and a
   board cannot attribute. Nothing rendered that block until it was
   asked for, and nothing asserted it afterwards.

   MEASURED, at A4 (794 x 1123) with the media emulated to print and
   the operator known, before this gate existed:

     route                 identity  mark
     /toolkits/sra         yes       yes
     /toolkits/register    yes       yes
     /toolkits/spi         yes       yes
     /toolkits/maturity    yes       yes
     /sms                  yes       yes
     /picture              yes       yes

   All six already worked. This gate exists so the seventh does too, and
   so none of the six quietly stops.

   ---------------------------------------------------------------
   WHY THE ORG IS SEEDED INTO THE CACHE RATHER THAN FETCHED.

   `attachPrintId` defaults to `allowFetch: false`, and that is a
   decision rather than an oversight — the register, the risk assessment
   and the maturity assessment work with NO SESSION AT ALL, so an
   operator can use them while deciding whether to trust this product.
   A screen that phones home during that has answered the question being
   asked of it, in the wrong direction.

   So attribution on those three is opportunistic: cached name, or no
   header at all. Half-attributed is the version that gets filed under
   the wrong operator, and smoke.mjs already refuses it.

   THIS GATE THEREFORE ASSERTS THE REACHABLE PROPERTY: given an operator
   the browser knows, every deliverable carries the identity and the
   mark. A first attempt seeded only the session and reported all six as
   unattributed — which was the probe being wrong, not the product, and
   is why the seeding is spelled out here rather than assumed.
   ===================================================================== */
import { chromium } from 'playwright';
import { findChromium } from './lib/chromium.mjs';
import { SESSION, bodyFor } from './lib/a11y-fixtures.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = 4323;
const BASE = `http://127.0.0.1:${PORT}`;

/* A4 at 96dpi. The width is the one that matters: a deliverable that
   scrolls sideways on screen prints with its right-hand column cut off,
   and nobody discovers that until it is on a regulator's desk. */
const A4 = { width: 794, height: 1123 };

/* Every screen that produces a document somebody hands over, and what
   the document IS. A toolkit added without an entry here is a workflow
   that ends on screen with nothing to give anybody — the state all six
   of these were in before the print identity block existed. */
const DELIVERABLES = [
  ['/toolkits/sra', 'the safety risk assessment, ICAO Doc 9859 five steps'],
  ['/toolkits/register', "the risk register regulation 9 asks for"],
  ['/toolkits/spi', 'the indicators and targets regulation 9(5) asks for'],
  ['/toolkits/maturity', 'the SMS maturity assessment'],
  ['/sms', "the twelve-element record against Annex 19"],
  ['/picture', "the operator's own safety position"],
  ['/toolkits/culture', 'the safety culture survey, printed before the answers are cleared'],
  ['/toolkits/icaas?action=act-1', 'the corrective action pack for the Authority\'s portal'],
];

/* =====================================================================
   THE LIST WAS TYPED, AND TWO SCREENS HAD JOINED WITHOUT IT.

   The comment above says a toolkit with no entry here "is a workflow
   that ends on screen with nothing to give anybody". Two toolkits were
   in exactly that position and this gate reported ok over both:
   /toolkits/icaas, and /toolkits/culture as of this morning.

   Both call attachPrintId. Both therefore render a print identity
   block that this gate — the only thing that measures whether such a
   block actually reaches the page — never looked at.

   CULTURE IS THE ONE THAT WOULD HAVE HURT. Its own screen tells the
   operator to "print this page for the record, then clear the answers
   from the device". The printed sheet is not a convenience copy, it
   is the ONLY surviving artefact of the survey — the responses are
   deleted immediately after. A sheet that prints anonymous is an
   unattributable document about a named operator's safety culture,
   and the deletion means there is nothing left to re-print correctly.

   SO CALLING attachPrintId IS WHAT ENROLS A SCREEN, not remembering
   to type it here. /sms and /picture reach their identity another way
   and stay listed by hand; the assertion runs in the direction that
   was broken — every call site must be covered.
   ===================================================================== */
const printIdCallers = [];
for (const full of (function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const f = join(dir, name);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
})(join(ROOT, 'apps/web/src/tools'))) {
  if (!full.endsWith('.js')) continue;
  if (/attachPrintId\s*\(/.test(readFileSync(full, 'utf8'))) {
    const dir = full.split('/tools/')[1].split('/')[0];
    printIdCallers.push(dir);
  }
}

/* Rule 11 from the side that bites. */
if (printIdCallers.length < 4) {
  console.error(
    `\ncheck:deliverables FAILED\n\n  \u2717 only ${printIdCallers.length} screen(s) call ` +
      'attachPrintId. The discovery has lost its subject and would assert nothing.\n'
  );
  process.exit(1);
}

const listedDirs = new Set(
  DELIVERABLES.map(([r]) => r.split('?')[0].replace(/^\/(toolkits\/)?/, '').split('#')[0])
);
const uncovered = printIdCallers.filter((d) => !listedDirs.has(d));
if (uncovered.length) {
  console.error(
    '\ncheck:deliverables FAILED\n\n  \u2717 ' +
      `${uncovered.join(', ')} call attachPrintId and are not in DELIVERABLES, so nothing ` +
      'measures whether their print identity reaches the page. Add them, or stop printing.\n'
  );
  process.exit(1);
}


/* A one-pixel PNG. What is asserted is that the mark REACHES the page,
   not what it looks like. */
/* What a screen needs before it HAS a document to print. */
const CULTURE_RESPONSES = JSON.stringify(
  Array.from({ length: 6 }, (_, i) => ({
    at: `2026-08-0${i + 1}T09:00:00.000Z`,
    answers: Object.fromEntries(
      Array.from({ length: 14 }, (_, q) => [`q${q + 1}`, ((i + q) % 5) + 1])
    ),
  }))
);

const SEED = {
  '/toolkits/culture': [['usalama.culture.responses.v1', CULTURE_RESPONSES]],
};

const LOGO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42' +
  'mPk5+f/z0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC';
const ORG = {
  orgName: 'Strip Air', aocNumber: 'KE-AOC-014', jurisdiction: 'KE', logo: LOGO,
};

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
};

if (!existsSync(DIST)) {
  console.error('check:deliverables — dist/ is absent. Run npm run build first.');
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
const rows = [];
let measured = 0;

const browser = await chromium.launch({ executablePath: findChromium() });
try {
  for (const [route, what] of DELIVERABLES) {
    const ctx = await browser.newContext({ viewport: A4, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    try {
      await page.route('**/api/v1/**', (r) => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(bodyFor(r.request().url())),
      }));
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.evaluate(([s, o]) => {
        localStorage.setItem('usalamasms.session', JSON.stringify(s));
        localStorage.setItem('usalamasms.refresh', 'stub');
        localStorage.setItem('usalamasms.org', JSON.stringify(o));
      }, [SESSION, ORG]);

      /* PER-ROUTE STATE, because a deliverable is a document and some
         screens have no document until they have a record. Rendering
         such a screen empty and asserting it names the operator asks
         the wrong question — the same mistake check:a11y made before
         MUST_GROW, where a fixture of the wrong shape rendered an
         error state and the sweep printed ok twice. */
      const seed = SEED[route];
      if (seed) await page.addInitScript((entries) => {
        for (const [k, v] of entries) window.localStorage.setItem(k, v);
      }, seed);

      await page.goto(BASE + route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      await page.emulateMedia({ media: 'print' });
      await page.waitForTimeout(200);

      /* PAINTED, NOT MERELY PRESENT. The first version of this counted
         `querySelectorAll('.print-id').length`, and its own mutation
         matrix caught it: adding `.print-id { display: none }` inside
         the print block left the gate GREEN. The element was in the
         DOM, the pack printed anonymous, and a check on existence
         cannot tell those apart.

         So both are measured by bounding box, which is zero for
         display:none, visibility:hidden and a zero-height container
         alike. */
      const m = await page.evaluate(() => {
        const painted = (sel) =>
          [...document.querySelectorAll(sel)].filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }).length;
        return {
          identity: document.querySelector('.print-id')?.innerText ?? '',
          blocks: painted('.print-id'),
          mark: painted('.print-id__logo'),
          heading: document.querySelector('main h1')?.innerText ?? '',
          clips: document.documentElement.scrollWidth >
                 document.documentElement.clientWidth + 1,
        };
      });
      measured += 1;
      rows.push([route, m.blocks, m.mark, m.clips]);

      /* The screen rendered at all. A route that errored prints an empty
         page, has no identity block, and would otherwise be reported as
         a single tidy failure rather than as the crash it is. */
      if (!m.heading) {
        failures.push(`${route} — rendered no <h1>. The screen did not load; nothing below was tested`);
        await ctx.close();
        continue;
      }
      if (m.blocks === 0) {
        failures.push(`${route} — no identity block PAINTED. ${what} would print anonymous`);
      } else if (!m.identity.includes(ORG.orgName)) {
        failures.push(
          `${route} — an identity block that does not name the operator: ` +
          JSON.stringify(m.identity.slice(0, 80))
        );
      }
      if (m.blocks > 0 && m.mark === 0) {
        failures.push(`${route} — identity block carries no operator mark, though one is set`);
      }
      if (m.clips) {
        failures.push(`${route} — scrolls sideways at ${A4.width}px, so it prints cut off`);
      }
    } catch (err) {
      failures.push(`${route} — could not be measured: ${err.message.split('\n')[0]}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`check:deliverables — ${DELIVERABLES.length} handover documents at A4, media print\n`);
for (const [route, blocks, mark, clips] of rows) {
  const ok = blocks > 0 && mark > 0 && !clips;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${route.padEnd(20)} ` +
    `identity ${blocks > 0 ? 'yes' : 'NO '}   mark ${mark > 0 ? 'yes' : 'NO '}   ` +
    `${clips ? 'CLIPS' : 'fits'}`
  );
}

/* RULE 11. A loop that measured nothing reports no failures, and every
   assertion above is vacuously satisfied over an empty set. */
if (measured !== DELIVERABLES.length) {
  console.error(
    `\ncheck:deliverables — ${measured} of ${DELIVERABLES.length} screens were reached. ` +
    'The rest were never tested and their result is unknown, not passing.'
  );
  process.exit(1);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} deliverable failure(s):\n`);
  for (const f of failures) console.error(`  · ${f}`);
  console.error(
    '\nA pack without the operator on it is an anonymous printout: an inspector cannot ' +
    'file it and a board cannot attribute it. Fix the screen, or remove it from ' +
    'DELIVERABLES with a reason — a toolkit that no longer produces a document is a ' +
    'product decision, not a test change.'
  );
  process.exit(1);
}

console.log(
  `\ncheck:deliverables passed — ${measured} documents, each naming the operator, ` +
  'carrying its mark, and fitting the page.'
);
