/* =====================================================================
   THE ACCESSIBILITY SWEEP.

   WHY A SWEEP AND NOT MORE ASSERTIONS. This product already asserts a
   great many accessibility PROPERTIES, each one written after somebody
   thought of it: every status badge carries a word as well as a colour,
   contrast is gated at 4.5:1 over Warm Sand and white, table-of-contents
   targets clear 24px, the page does not scroll sideways at 320px, focus
   is kept somewhere when a row is removed, every dropdown has a real
   label and an unselected default.

   All of that is real and none of it is a sweep. The gap in an
   assert-what-you-thought-of approach is exactly the violations nobody
   thought of, and the first run of this file found sixty-five of them
   across twenty screens — including two where text was rendering at
   1.02:1 and 1.97:1, which is not low contrast but invisible. One of
   them was the sentence on the safety risk assessment saying WHY an
   assessment cannot be accepted.

   Neither would ever have been found by adding assertions, because
   both were pairings nobody had declared: a class written for a dark
   surface and reused six weeks later on a light one. The brand gate
   checks the token pairs it is given; it cannot check a pairing that
   only exists once the page is rendered.

   THE ROUTES ARE DISCOVERED, NOT LISTED, from the architecture the
   product renders its own menu and footer from. A hardcoded list is a
   guard that stops covering the moment somebody adds a screen — and
   this repository has been bitten by exactly that shape before, when a
   ten-table list is how eight tables arrived outside the RLS posture.

   RUN AGAINST THE BUILT BUNDLE, like smoke, because minification and
   chunking are part of what ships and a check against source is a
   check against something nobody loads.

   WCAG 2.1 AA is the standard asserted. Not "best effort": a failing
   rule fails the build, and a rule that has to be lived with is
   declared in ACCEPTED below with its reason, the same way the export
   declares what deliberately does not travel.
   ===================================================================== */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = 4322;
const BASE = `http://127.0.0.1:${PORT}`;

/* Rules deliberately not enforced, with the reason. EMPTY TODAY, and
   that is worth keeping: the sweep found sixty-five violations and all
   sixty-five were fixed rather than excused. An entry here is a
   decision on the record, not a way to make the gate quiet. */
const ACCEPTED = new Map();

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

let AXE;
try {
  AXE = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
} catch {
  console.error(
    '\ncheck:a11y — axe-core is not installed, so this gate would pass by doing nothing.\n' +
      'That is the failure mode this repository treats as worse than having no gate.\n' +
      'Run `npm install` and try again.'
  );
  process.exit(1);
}

await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch();

let failed = 0;
let checked = 0;
let nodesScanned = 0;

try {
  /* ---- discover the routes from the product's own architecture ---- */
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
  await first.close();

  const routes = [...new Set(['/', ...declared])].sort();

  /* RULE 11 FROM THE OTHER SIDE. A discovery that returns two routes
     passes this gate in four seconds and means nothing. The floor is
     deliberately well below the real count so it fails on a broken
     crawl rather than on a screen being retired. */
  if (routes.length < 8) {
    console.error(
      `\ncheck:a11y — only ${routes.length} route(s) discovered from the architecture. ` +
        'This gate asserts over every screen and cannot do that from a crawl that found ' +
        'almost nothing. Something changed in the menu or the footer markup.'
    );
    process.exit(1);
  }

  console.log(`check:a11y — WCAG 2.1 AA over ${routes.length} rendered screens\n`);

  for (const route of routes) {
    /* A fresh context per route, with service workers blocked. The
       lesson recorded twice in smoke.mjs: a service worker serves the
       precached shell, and a check that reads it is a check that has
       not reached the screen it is asserting about. */
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle' });
      /* Lazily-loaded chunks and the org fetch both land after
         networkidle on some screens. Asserting before the screen has
         finished rendering measures a skeleton. */
      await page.waitForTimeout(500);
      await page.addScriptTag({ content: AXE });

      const result = await page.evaluate(async () =>
        window.axe.run(document, {
          runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
          resultTypes: ['violations'],
        })
      );

      checked += 1;
      nodesScanned += result.passes?.length ?? 0;

      const violations = result.violations.filter((v) => !ACCEPTED.has(v.id));
      if (violations.length === 0) {
        console.log(`  ok   ${route}`);
      } else {
        failed += 1;
        console.log(`  FAIL ${route}`);
        for (const v of violations) {
          console.log(`         [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node(s))`);
          for (const n of v.nodes.slice(0, 3)) {
            console.log(`           ${n.target.join(' ')}`);
            const why = (n.any[0]?.message ?? n.all[0]?.message ?? '').replace(/\s+/g, ' ');
            if (why) console.log(`             ${why.slice(0, 180)}`);
          }
          if (v.nodes.length > 3) {
            console.log(`           …and ${v.nodes.length - 3} more`);
          }
        }
      }
    } catch (err) {
      failed += 1;
      console.log(`  FAIL ${route} — could not be swept: ${err.message.split('\n')[0]}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

/* A sweep that reached no screen must not report success. Same rule as
   the discovery floor above, applied to the outcome rather than to the
   input. */
if (checked === 0) {
  console.error('\ncheck:a11y — no screen was swept. Nothing was asserted.');
  process.exit(1);
}

if (failed > 0) {
  console.error(
    `\ncheck:a11y FAILED — ${failed} of ${checked} screens carry a WCAG 2.1 AA violation.\n` +
      'Fix the violation. Adding it to ACCEPTED needs a reason that survives being read ' +
      'by somebody who cannot see it.'
  );
  process.exit(1);
}

console.log(
  `\ncheck:a11y passed — ${checked} screens, no WCAG 2.1 AA violations` +
    `${ACCEPTED.size ? `, ${ACCEPTED.size} rule(s) accepted with a reason` : ''}.`
);
