#!/usr/bin/env node
/* ============================================================
   Stamp the service worker with a build id and the real asset list.

   Two things sw.js cannot know when it is written:

     1. WHAT VERSION IT IS. A hand-edited version string is a version
        string that stops being edited, and a cache that never
        invalidates serves last month's app to someone filing a safety
        report against this month's procedures.

     2. WHAT TO PRECACHE. Vite emits content-hashed filenames, so the
        shell's real asset names only exist after the bundle does.
        Precaching a guess means the first offline launch fetches
        nothing and shows the fallback page — the exact failure the
        worker exists to prevent, arriving silently.

   Runs after `vite build`, against dist/.
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const swPath = resolve(DIST, 'sw.js');
let sw;
try {
  sw = readFileSync(swPath, 'utf8');
} catch {
  console.error(
    'FATAL: dist/sw.js not found. The service worker lives in\n' +
      '  apps/web/public/sw.js and is copied by vite. If this fails, the\n' +
      '  build produced no worker and the app has no offline support —\n' +
      '  which must not pass silently (charter rule 11).'
  );
  process.exit(1);
}

if (!sw.includes('__BUILD_ID__')) {
  console.error(
    'FATAL: dist/sw.js contains no __BUILD_ID__ placeholder.\n' +
      '  Either it has already been stamped, or the placeholder was removed —\n' +
      '  in which case every deploy from now on shares one cache name and\n' +
      '  users keep the first version they ever loaded.'
  );
  process.exit(1);
}

/* Precache the shell: the entry document and every hashed asset. Fonts
   and icons are included — an offline launch that renders in Times New
   Roman with no mark is a launch that looks broken. */
const assets = walk(DIST)
  .map((f) => '/' + relative(DIST, f).split(/[\\/]/).join('/'))
  .filter((f) => !f.endsWith('/sw.js'))
  .filter((f) => /\.(js|css|woff2?|svg|png|json|html)$/.test(f))
  .sort();

/* The build id is derived from the asset list, so an identical build
   produces an identical id and browsers do not churn their caches for
   a deploy that changed nothing. */
const buildId = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 12);

sw = sw.replace('__BUILD_ID__', buildId);
sw = sw.replace(
  /const PRECACHE = \[[^\]]*\];/,
  `const PRECACHE = ${JSON.stringify(assets)};`
);

writeFileSync(swPath, sw);

console.log(`  service worker stamped ${buildId} — ${assets.length} assets precached`);

/* ============================================================
   Bundle budget.

   The design target is a mid-range Android on a patchy connection at a
   remote strip, and the sibling product ships eighteen tools in 114 KB.
   That number is not a boast — it is the reason that product works where
   it works, and it survives only because something fails when it stops
   being true.

   This page went from 8.8 KB to 165 KB the moment the real offline
   layer landed: Dexie for the outbox, and zod because the device
   validates with the SAME schema the server uses — a report rejected
   server-side after three days offline is unfixable, so that one is
   worth its weight. Both are deliberate. What is not acceptable is the
   next 100 KB arriving without anyone noticing, which is how every
   bundle that ends up at 2 MB got there.

   Raise these numbers when you have decided to; do not raise them to
   make a build pass.

   ---------------------------------------------------------------
   WHY THERE ARE NOW THREE NUMBERS RATHER THAN TWO.

   This measured TOTAL JavaScript, which was the same thing as "what a
   person downloads before they can file a report" for exactly as long
   as there was one chunk. The design route — the whole brand system,
   the token swatches, a screen only we open — is now split out, and
   under a total-only budget that split made the number WORSE: the entry
   chunk fell and the chunk overhead pushed the sum up.

   A budget that punishes the change it should reward is a budget
   measuring the wrong thing. So:

     · ENTRY is what gates time-to-first-report. It is the number that
       matters and it keeps the original 200 KB, unmoved.
     · TOTAL still has a ceiling, because "split it into forty chunks"
       must not become a way to smuggle a megabyte in. It is set at
       240 KB — the entry budget plus room for the lazy routes that
       exist, and no more.

   This is a change of METRIC and it is written down here rather than
   done quietly, because changing what you measure to pass a build is
   the exact failure this whole block exists to prevent. The test is
   whether the new metric would have caught the old problem: a 40 KB
   library added to the report form still breaks ENTRY, which is what
   the 200 KB was protecting.
   ============================================================ */
/* ENTRY RAISED 200 -> 212 KB, once, and here is the receipt.

   Checked first that the overage was not fat. The shared package's
   barrel does `export * from "./glossary"`, so importing CreateReportSchema
   from it could have dragged the whole SMS glossary into a phone; it does
   not — grepping the built entry for SRB, SPI and MEL returns nothing, so
   Rollup shakes it. The 206 KB is Dexie, zod, the taxonomy, the regulatory
   engine and the shell, all of which the FIRST screen genuinely uses.

   What the 12 KB bought, all of it user-facing:

     · the session layer and the sign-in screen — without which nothing
       this app collected could leave the device at all;
     · Try again / Copy text on a failed report, which is the action the
       sync strip had been telling people to go and find;
     · conflicts made visible, after they were silently invisible;
     · the install and update prompts.

   NOT a metric change. The previous entry/total split was one, recorded
   above, and doing it twice would be the thing this block exists to stop.
   The test still holds: a 40 KB library added to the report form breaks
   this, which is what the number is protecting.

   For scale, the entry is 64.6 KB over the wire gzipped. The raw ceiling
   is kept because parse time on a mid-range Android is charged on raw
   bytes, and that phone is the target device. */
/* CSS 32 -> 34 KB, and this is the receipt.

   The 32 KB was set against a stylesheet this app wrote for itself. It
   now carries a design system ported wholesale from a sibling product,
   and the port is the point: it is why a screen has a band, a card, a
   trust strip and a nav that look like they were drawn by one hand
   rather than assembled per screen.

   1.8 KB of the port was given back first — thirty-nine rules for
   pages this app does not render (the diagnostic radar, the partner
   bar, the booking CTA), removed rather than budgeted for. The 2 KB
   above the old ceiling is what remains after that, and it is spent on
   the twenty-four classes this app's own markup emits: the page
   container, the form controls, the six status badges, the two
   regulatory tables. Those had no rules at all — which is the defect
   check:css now guards, and the reason the account screen once
   rendered flush against the left edge.

   The number still bites. Over the wire this is 8.1 KB gzipped; the
   raw ceiling stands because a mid-range Android is charged style
   recalculation on raw bytes, and that phone is the target device. A
   second component library dropped in here would break this, which is
   what the ceiling is for. */
const BUDGET = { entry: 212 * 1024, js: 240 * 1024, css: 34 * 1024 };

const sizes = { js: 0, css: 0, entry: 0 };
for (const asset of assets) {
  const ext = asset.endsWith('.js') ? 'js' : asset.endsWith('.css') ? 'css' : null;
  if (!ext) continue;
  const bytes = statSync(resolve(DIST, asset.slice(1))).size;
  sizes[ext] += bytes;
  // The entry chunk is the largest JS asset: Vite names lazy chunks the
  // same way, so size is the only thing distinguishing them without
  // parsing the manifest, and a lazy chunk larger than the entry would
  // be a finding rather than a miscount.
  if (ext === 'js' && bytes > sizes.entry) sizes.entry = bytes;
}

let overBudget = false;
for (const kind of ['entry', 'js', 'css']) {
  const kb = (sizes[kind] / 1024).toFixed(1);
  const limit = (BUDGET[kind] / 1024).toFixed(0);
  const label = kind === 'entry' ? 'js (entry)' : kind === 'js' ? 'js (total)' : kind;
  if (sizes[kind] > BUDGET[kind]) {
    console.error(`  BUDGET EXCEEDED  ${label}: ${kb} KB against a ${limit} KB budget`);
    overBudget = true;
  } else {
    console.log(`  budget ok        ${label}: ${kb} KB of ${limit} KB`);
  }
}

if (overBudget) {
  console.error(
    '\nBundle budget exceeded. Either remove weight or raise the budget in\n' +
      'scripts/stamp-sw.mjs deliberately, with a note saying what you bought\n' +
      'for it. Do not raise it silently to make this build pass.'
  );
  process.exit(1);
}
