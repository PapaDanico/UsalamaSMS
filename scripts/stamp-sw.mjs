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
   That number is not a boast — it is the reason Kanda works where it
   works, and it survives only because something fails when it stops
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
   ============================================================ */
const BUDGET = { js: 200 * 1024, css: 32 * 1024 };

const sizes = { js: 0, css: 0 };
for (const asset of assets) {
  const ext = asset.endsWith('.js') ? 'js' : asset.endsWith('.css') ? 'css' : null;
  if (!ext) continue;
  sizes[ext] += statSync(resolve(DIST, asset.slice(1))).size;
}

let overBudget = false;
for (const kind of ['js', 'css']) {
  const kb = (sizes[kind] / 1024).toFixed(1);
  const limit = (BUDGET[kind] / 1024).toFixed(0);
  if (sizes[kind] > BUDGET[kind]) {
    console.error(`  BUDGET EXCEEDED  ${kind}: ${kb} KB against a ${limit} KB budget`);
    overBudget = true;
  } else {
    console.log(`  budget ok        ${kind}: ${kb} KB of ${limit} KB`);
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
