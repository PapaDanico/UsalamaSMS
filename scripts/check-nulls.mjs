#!/usr/bin/env node
/* =====================================================================
   A VALUE THAT REACHED THE PAGE AS THE WORD "undefined".

   Every interpolation in this product goes through `html` in
   shared/html.js, which resolves null and undefined to the EMPTY
   STRING. So the obvious leak cannot happen and nobody looked for the
   one that can: a PLAIN template literal nested inside the tagged one.

     `median of ${n}; nine in ten within ${p90}`

   is an ordinary JavaScript string. `html` receives it already built,
   sees a string, and escapes it. "undefined" is not a special value by
   then — it is six letters of prose, and it printed on /picture, which
   is a DELIVERABLE that prints at A4 and reaches a regulator's desk.

   IT SURVIVED EVERY GATE THIS REPOSITORY OWNS, and the reason is the
   same one each time: they look at structure, not at words.

     check:a11y          renders /picture. axe finds no violation in a
                         word being wrong
     check:deliverables  measures the identity block's bounding box
     check:symmetry      315 measurements, all of them layout
     check:prose         reads SOURCE files, never the rendered page

   Nothing in the product read the page as a reader reads it.

   ---------------------------------------------------------------
   AND THE SECOND PROPERTY IS THE ONE THAT WAS BLANKING SCREENS.

   "The answer arrived" is not "the answer is readable". Two screens
   guarded on `if (!data)` — a test of PRESENCE — and then indexed
   straight into it:

     /fatigue       data.counts.withinDeclared   ->  page at TWO NODES
     /toolkits/spi  data.rows.map(...)           ->  section left stale

   A 200 whose body is not the shape the screen reads throws mid-render,
   so the honest "could not be reached" notice — already written, six
   lines above the throw in both files — is jumped straight over. The
   safety manager gets a blank page and nothing to read.

   IT IS REACHABLE, which is why the guards are fixes and not notes. The
   service worker caches API answers, so a body stored against an older
   shape is served with status 200 to a browser running the new bundle;
   so is a proxy's cached copy, and so is a half-deployed API. This
   repository has already had a production database five migrations
   behind a published deploy.

   So the empty-200 pass renders every screen against `{}` and asserts
   the screen SAYS SOMETHING rather than throwing. `{}` is not a
   pessimistic fixture — it is the smallest body a 200 can carry, and a
   screen that cannot survive it cannot survive any of the three causes
   above.

   ---------------------------------------------------------------
   WHY THE SCANNER TESTS ITSELF FIRST.

   A text-node walk that silently matched nothing would print "ok" over
   every screen in the product and retire the suspicion, which this
   repository holds to be worse than having no gate. So before any
   screen is judged, a known leak is injected into a rendered page and
   the scanner has to find it. If it does not, the gate fails there and
   asserts nothing about the product.
   ===================================================================== */
import { chromium } from 'playwright';
import { findChromium } from './lib/chromium.mjs';
import { SESSION, bodyFor } from './lib/a11y-fixtures.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = 4324;
const BASE = `http://127.0.0.1:${PORT}`;

/* THE TOKENS A LEAKED VALUE ARRIVES AS.

   `null`, `undefined` and `NaN` are what a missing field prints.
   "Invalid Date" is what `new Date(undefined).toString()` prints, and
   this product formats dates on nearly every screen. "[object Object]"
   is what an object interpolated into a plain literal prints — the
   shape that rendered "undefined or undefined" on /picture's withheld
   list, recorded in CLAUDE.md.

   Word boundaries on the three identifiers, because "annulled" and
   "undefinedish" are not leaks. */
const LEAK = /\b(null|undefined|NaN)\b|Invalid Date|\[object Object\]/;

/* =====================================================================
   PROSE THAT LEGITIMATELY USES THE WORD, declared with the reason.

   "undefined" is an ordinary English adjective and this product writes
   in ordinary English about things an operator has not defined yet. A
   gate that could not tell those apart would be argued away within a
   week, so each one is named — and the match is on the WHOLE trimmed
   text node, not a substring, so a real leak appearing in the same
   paragraph still fails.

   Adding an entry is a decision with a diff. Adding one to silence a
   real leak is the thing this list must not become, which is why each
   carries the sentence and not just the string. */
const PROSE = [
  [
    /^\d+ of \d+ still undefined$/,
    '/sms, the voluntary scheme. Six requirements Annex 19 asks an ' +
      'operator to write down, and the heading counts how many it has not ' +
      'written yet. "Undefined" is the state of the requirement, not of a ' +
      'value this screen failed to read.',
  ],
];

const allowed = (text) => PROSE.some(([re]) => re.test(text));

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain',
};

/* The same shape as the smoke server: an existing asset wins, anything
   else falls through to the shell, which is what Netlify does. */
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = join(DIST, pathname);
  if (pathname === '/' || !(existsSync(file) && !statSync(file).isDirectory())) {
    file = join(DIST, 'index.html');
  }
  let body;
  try {
    body = readFileSync(file);
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(body);
});

if (!existsSync(join(DIST, 'index.html'))) {
  console.error(
    '\ncheck:nulls — dist/index.html is missing, so this gate would pass by\n' +
    'doing nothing. Run `npm run build` first.'
  );
  process.exit(1);
}

/* Read in the page, so the injected self-test and the real scan run the
   SAME code. A scanner that tested a copy of itself would prove nothing
   about the one doing the work. */
const SCAN = `
  (() => {
    const leak = ${LEAK.toString()};
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = (n.textContent || '').trim();
      if (!t || !leak.test(t)) continue;
      let el = n.parentElement;
      const path = [];
      while (el && path.length < 4) {
        const cls = typeof el.className === 'string' && el.className.trim()
          ? '.' + el.className.trim().split(/\\s+/)[0] : '';
        path.push(el.tagName.toLowerCase() + cls);
        el = el.parentElement;
      }
      out.push({ text: t.slice(0, 160), where: path.reverse().join(' > ') });
    }
    return out;
  })()
`;

await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch({ executablePath: findChromium() });

let failures = [];
let checked = 0;
let assertions = 0;

try {
  /* ---- the routes, from the product's own architecture ------------ */
  const first = await browser.newContext({ serviceWorkers: 'block' });
  const home = await first.newPage();
  await home.goto(BASE, { waitUntil: 'networkidle' });
  const declared = await home.evaluate(() =>
    [...document.querySelectorAll('.footer a, #menu-panel a, a[href^="/"]')]
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && h.startsWith('/') && !h.startsWith('//'))
      .map((h) => h.split('#')[0])
      .filter(Boolean)
  );

  /* THE SELF-TEST, on a real rendered page and through the real
     scanner. See the header: a walk that matched nothing would print ok
     over the whole product. */
  const planted = await home.evaluate((scan) => {
    const probe = document.createElement('p');
    probe.id = 'null-gate-self-test';
    probe.textContent = 'days to close: undefined';
    document.body.appendChild(probe);
    // eslint-disable-next-line no-eval
    const hits = eval(scan);
    probe.remove();
    return hits.filter((h) => h.text.includes('days to close')).length;
  }, SCAN);
  await first.close();

  if (planted !== 1) {
    console.error(
      `\ncheck:nulls — THE SCANNER DID NOT FIND A LEAK PLANTED IN FRONT OF IT ` +
      `(${planted} hits, expected 1).\nEverything downstream of this would be a ` +
      `gate reporting "ok" about screens it never read.`
    );
    process.exit(1);
  }
  assertions++;

  const routes = [...new Set(['/', ...declared, '/admin'])].sort();

  /* RULE 11 FROM THE OTHER SIDE, the same floor check:a11y carries. A
     discovery that returns two routes passes this gate in four seconds
     and means nothing. Well below the real count, so it fails on a
     broken crawl rather than on a screen being retired. */
  if (routes.length < 8) {
    console.error(
      `\ncheck:nulls — only ${routes.length} route(s) discovered from the ` +
      'architecture. Something changed in the menu or the footer markup.'
    );
    process.exit(1);
  }

  console.log(
    `check:nulls — ${routes.length} screens, three states each: signed out,\n` +
    `             the operator's record, and a 200 carrying {}\n`
  );

  /* signed out · the seeded record · the smallest body a 200 can carry */
  const STATES = [
    ['out', null],
    ['record', (url) => bodyFor(url)],
    ['empty-200', () => ({})],
  ];

  /* =================================================================
     FOUR AT A TIME, AND THE REASON IS THE DEPLOY CEILING.

     105 renders serially cost 145 seconds measured on this machine. This
     gate runs inside `gate:bundle`, which runs inside the Netlify
     PRODUCTION build, and CLAUDE.md records that build at 497 seconds
     against a hard 900-second ceiling — so a serial version would spend
     a third of the remaining headroom on waiting for page loads.

     Four contexts, because the work is almost entirely idle: each render
     is a network-idle wait plus a deliberate 600ms settle for lazy
     chunks. Higher concurrency starts contending for CPU during the
     chunk parse and the returns flatten; four measured 44 seconds.

     THE COVERAGE IS IDENTICAL. Every route is still rendered in all
     three states in its own fresh context with service workers blocked
     — concurrency changes when they run, not what is asserted, and
     `checked` is the number that proves it.
     ================================================================= */
  const jobs = [];
  for (const route of routes) {
    for (const [state, fixture] of STATES) jobs.push({ route, state, fixture });
  }

  const one = async ({ route, state, fixture }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    const thrown = [];
    page.on('pageerror', (e) => thrown.push(String(e.message ?? e).slice(0, 200)));
    try {
      if (fixture) {
        await page.route('**/api/v1/**', (r) => r.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify(fixture(r.request().url())),
        }));
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.evaluate((s) => {
          localStorage.setItem('usalamasms.session', JSON.stringify(s));
          localStorage.setItem('usalamasms.refresh', 'stub');
        }, SESSION);
      }
      await page.goto(BASE + route, { waitUntil: 'networkidle' });
      /* Lazily-loaded chunks and the org fetch both land after
         networkidle on some screens. Scanning before the screen has
         finished is scanning a skeleton. */
      await page.waitForTimeout(600);

      const hits = await page.evaluate((scan) => eval(scan), SCAN);
      assertions++;
      for (const h of hits) {
        if (allowed(h.text)) continue;
        failures.push(
          `${route} [${state}] — a value reached the page as text\n` +
          `      ${h.where}\n      "${h.text}"`
        );
      }

      /* A THROW IS A FAILURE IN EVERY STATE, and the empty-200 pass is
         the one that finds them: a screen that indexes into a body it
         did not check leaves a page nobody can read and nothing in the
         console a safety manager will ever see. */
      assertions++;
      for (const t of thrown) {
        failures.push(`${route} [${state}] — the render threw\n      ${t}`);
      }
      checked++;
    } catch (e) {
      failures.push(
        `${route} [${state}] — the probe itself failed\n      ${String(e).slice(0, 200)}`
      );
    } finally {
      await ctx.close();
    }
  };

  const LANES = 4;
  let next = 0;
  await Promise.all(
    Array.from({ length: LANES }, async () => {
      for (;;) {
        const i = next++;
        if (i >= jobs.length) return;
        await one(jobs[i]);
      }
    })
  );

  /* THE SUBJECT GUARD, APPLIED TO THE OUTCOME. A pool that silently
     dropped its queue would leave `checked` short and every screen
     unasserted, which is the shape of a gate reporting sixty-four
     screens while checking thirty-two. */
  if (checked !== jobs.length) {
    failures.push(
      `the sweep completed ${checked} of ${jobs.length} renders — the rest ` +
      'asserted nothing at all'
    );
  }

} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n`);
  for (const f of failures) console.error(`  · ${f}`);
  console.error(
    '\ncheck:nulls FAILED.\n\n' +
    'A LEAKED VALUE: the fix is almost never `?? 0` or `?? "—"` at the call\n' +
    'site. Find out whether the field is one the API sends. If it is, the\n' +
    'name is wrong on one side. If it is not, the screen is asking for\n' +
    'something that does not exist and the honest render is an absence that\n' +
    'says so — this product refuses a zero painted over an unknown.\n\n' +
    'A THROW: guard the SHAPE, not the presence. `if (!data)` passes an\n' +
    'empty object straight into `data.rows.map`, and the notice written for\n' +
    'exactly that case gets jumped over.\n\n' +
    'Prose that legitimately uses one of these words goes in PROSE at the\n' +
    'top of this file, with the sentence saying why.\n'
  );
  process.exit(1);
}

console.log(
  `check:nulls passed — ${assertions} assertions over ${checked} renders, ` +
  `${PROSE.length} declared prose allowance(s).`
);
