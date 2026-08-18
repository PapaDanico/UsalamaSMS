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

   WCAG 2.2 AA is the standard asserted. Not "best effort": a failing
   rule fails the build, and a rule that has to be lived with is
   declared in ACCEPTED below with its reason, the same way the export
   declares what deliberately does not travel.
   ===================================================================== */
import { chromium } from 'playwright';
import { findChromium } from './lib/chromium.mjs';
import { FIXTURES, MUST_GROW, SESSION, bodyFor } from './lib/a11y-fixtures.mjs';
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

/* route|signedIn -> element count under <main>. The growth guard reads it. */
const rendered = new Map();

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
const browser = await chromium.launch({ executablePath: findChromium() });

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


  /* THE ONE ROUTE DISCOVERY CANNOT FIND, ADDED BACK BY NAME.

     Every route here comes from the product's own architecture, and
     that is deliberate — a hardcoded list stops covering the moment
     somebody adds a screen. /admin is the single exception, because it
     is deliberately absent from the menu and the footer: it is the
     vendor's console, and advertising it to operators would imply a
     presence inside their organisation.

     So the discovery is right and the sweep would have been wrong. A
     screen nobody advertises is still a screen somebody uses, and it
     shipped past both this gate and the symmetry sweep on its first
     build precisely because neither could see it. Named here, with the
     reason, rather than left silently uncovered. */
  const UNADVERTISED = ['/admin'];
  const routes = [...new Set(['/', ...declared, ...UNADVERTISED])].sort();

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

  console.log(
    `check:a11y — WCAG 2.2 AA over ${routes.length} rendered screens, ` +
    `signed out and signed in\n`
  );

  for (const route of routes) {
   for (const signedIn of [false, true]) {
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
      if (signedIn) {
        /* The record, stubbed. See lib/a11y-fixtures.mjs for why this is
           stubbed rather than served by a real API, and for the measured
           node counts that made the second pass worth having. */
        await page.route('**/api/v1/**', (r) => r.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify(bodyFor(r.request().url())),
        }));
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.evaluate((s) => {
          localStorage.setItem('usalamasms.session', JSON.stringify(s));
          localStorage.setItem('usalamasms.refresh', 'stub');
        }, SESSION);
      }
      await page.goto(BASE + route, { waitUntil: 'networkidle' });
      /* Lazily-loaded chunks and the org fetch both land after
         networkidle on some screens. Asserting before the screen has
         finished rendering measures a skeleton. */
      await page.waitForTimeout(500);
      await page.addScriptTag({ content: AXE });

      const result = await page.evaluate(async () =>
        window.axe.run(document, {
          runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
          /* TARGET-SIZE IS OFF BY DEFAULT IN AXE, AND ADDING THE TAG
             WITHOUT THIS WAS A CHECK THAT COULD NOT FAIL.

             `wcag22aa` carries exactly one axe rule — 2.5.8 Target Size
             (Minimum), the 24px floor — and axe ships it disabled. So
             the tags alone bought a NEW CLAIM AND NO NEW MECHANISM: the
             run reported "no WCAG 2.2 AA violations" while checking
             nothing 2.2 added.

             MUTATION-CHECKED, AND THE OBVIOUS MUTATION MISLEADS.
             Shrinking every `.btn-sm` on the site to 8px leaves this
             suite GREEN even with the rule enabled, which reads exactly
             like a dead check. It is not: 2.5.8 carries a SPACING
             exemption — an undersized target passes if it is far enough
             from its neighbours — and the controls on these screens are
             widely spaced, so a lone 8px button genuinely does not
             violate the criterion. Two ADJACENT 10px buttons do, and
             axe reports `target-size` against them. The rule fires; the
             site passes on the merits.

             That is recorded because the next person to test this gate
             will reach for the same mutation and get the same
             misleading green.

             Enabled explicitly, and 2.5.8 is worth having on this
             product specifically. --us-tap is 48px because this is a
             form filled in with gloves on, one-handed, sometimes on a
             moving airstair; a rule that fails at 24 is a floor well
             below the target, and anything that trips it has drifted
             badly. */
          rules: { 'target-size': { enabled: true } },
          resultTypes: ['violations'],
        })
      );

      checked += 1;
      nodesScanned += result.passes?.length ?? 0;

      /* WHAT THE SWEEP ACTUALLY REACHED, recorded so the growth guard
         below can tell a screen that rendered the record from one that
         rendered an error where the record should be. */
      rendered.set(`${route}|${signedIn}`, await page.evaluate(
        () => document.querySelectorAll('main *').length
      ));

      const label = `${route}${signedIn ? '  (signed in)' : ''}`;
      const violations = result.violations.filter((v) => !ACCEPTED.has(v.id));
      if (violations.length === 0) {
        console.log(`  ok   ${label}`);
      } else {
        failed += 1;
        console.log(`  FAIL ${label}`);
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
      console.log(
        `  FAIL ${route}${signedIn ? '  (signed in)' : ''} — could not be swept: ` +
        err.message.split('\n')[0]
      );
    }
    await ctx.close();
   }
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

/* THE GROWTH GUARD, and the reason the second pass is a check rather
   than a claim.

   A stub whose shape is wrong renders an error state, or nothing —
   the screen gets SMALLER signed in, axe finds no violation in the
   emptiness, and the sweep prints "ok" twice. The gate would then
   report sixty-four screens while genuinely checking thirty-two, which
   is worse than never having added the pass: it retires the suspicion.

   Measured before this existed, under a bare `{}` body: /today 23->19,
   /fatigue 5->2 and /picture 24->5 all SHRANK. Those three numbers are
   why lib/a11y-fixtures.mjs holds real shapes, and why this runs. */
const shortfall = [];
for (const route of MUST_GROW) {
  const out = rendered.get(`${route}|false`);
  const inn = rendered.get(`${route}|true`);
  if (out === undefined || inn === undefined) {
    shortfall.push(`${route} — not swept in both states`);
  } else if (inn <= out) {
    shortfall.push(`${route} — ${out} elements signed out, ${inn} signed in`);
  }
}
if (shortfall.length > 0) {
  console.error(
    `\ncheck:a11y FAILED — ${shortfall.length} screen(s) declared record-bearing did not ` +
      'render more signed in than signed out:\n'
  );
  for (const f of shortfall) console.error(`  · ${f}`);
  console.error(
    '\nThe fixture in scripts/lib/a11y-fixtures.mjs no longer matches what the screen ' +
      'reads, so the signed-in pass swept an error state and reported it clean. Fix the ' +
      'fixture. Removing the route from MUST_GROW needs a reason: a screen that stopped ' +
      "reading the operator's record is a product change, not a test change."
  );
  process.exit(1);
}

if (failed > 0) {
  console.error(
    `\ncheck:a11y FAILED — ${failed} of ${checked} screens carry a WCAG 2.2 AA violation.\n` +
      'Fix the violation. Adding it to ACCEPTED needs a reason that survives being read ' +
      'by somebody who cannot see it.'
  );
  process.exit(1);
}

const grew = [...MUST_GROW].filter(
  (r) => (rendered.get(`${r}|true`) ?? 0) > (rendered.get(`${r}|false`) ?? 0)
).length;
console.log(
  `\ncheck:a11y passed — ${checked} renders, no WCAG 2.2 AA violations` +
    `${ACCEPTED.size ? `, ${ACCEPTED.size} rule(s) accepted with a reason` : ''}.\n` +
    `  ${grew} of ${MUST_GROW.size} record-bearing screens confirmed to render the ` +
    'record in the signed-in pass.'
);
