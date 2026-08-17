/* ============================================================
   WHAT ACTUALLY SHIPPED — CHECKED AFTER THE BUILD, WHICH IS THE
   WHOLE POINT OF THIS FILE EXISTING SEPARATELY.

   THE DEFECT THAT PRODUCED IT. These three checks lived in
   check-assets.mjs, which runs inside `npm run check` — and `npm run
   build` is `check && icons && vite build && stamp-sw`. So they read
   `dist/` BEFORE `dist/` was built by the run that was checking it.

   Locally that is invisible, because a developer's dist is left over
   from the previous run and is usually current. On any machine where a
   dist from an EARLIER commit survives into a new build, they judged an
   artefact that predates the source beside them. Two of the three
   degraded politely when dist was missing — "install weight not
   measured" — which meant the number the offline promise is made of was
   NEVER enforced on a deploy, only on the machine of whoever last ran
   it locally. The third, the dangling-reference check, did not degrade
   politely: against a stale dist it failed a build whose source was
   correct.

   That was reproduced rather than theorised. Building from the previous
   commit's index.html, restoring the fixed source, and running the gate
   without rebuilding fails with "dist/index.html references 1 file(s)
   that are not in the build: /fonts/dm-sans-latin.woff2" — a correct
   message about a page nobody is shipping.

   So a check about build output belongs after the build. Everything
   here requires dist and REFUSES to run without it, rather than
   reporting success about a build it could not find.
   ============================================================ */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = resolve(ROOT, 'apps/web/public');
const DIST = resolve(ROOT, 'dist');

/* Mirrors the ceiling in check-assets.mjs. Held here because this is
   the file that can actually enforce it — see the header. */
const INSTALL_BUDGET_KB = 220;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const problems = [];
const notes = [];

/* NO DIST IS A FAILURE HERE, not a skip. This script runs after
   `vite build && stamp-sw`, so an absent dist means the build did not
   produce one — and a gate that shrugs at that is the shape CLAUDE.md
   records being bitten by four times. */
if (!existsSync(join(DIST, 'index.html')) || !existsSync(join(DIST, 'sw.js'))) {
  console.error('check:dist FAILED\n');
  console.error(
    '  dist/index.html or dist/sw.js is missing. This check runs AFTER the build, so ' +
      'there is no honest reading of that other than "the build did not produce what it ' +
      'is supposed to". Run `npm run build`.',
  );
  process.exit(1);
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const workerSrc = readFileSync(join(DIST, 'sw.js'), 'utf8');
const manifestRaw = workerSrc.match(/const PRECACHE = (\[[^\]]*\]);/)?.[1];

/* ============================================================
   EVERY ASSET THE BUILT PAGE POINTS AT IS IN THE BUILD.

   THE DEFECT. index.html preloaded /fonts/dm-sans-latin.woff2 after DM
   Sans was replaced and both dm-sans files were deleted in the same
   change. Every gate stayed green, and so did a runtime check that
   counted failed requests — because netlify.toml carries one rewrite,
   `/*` -> `/index.html` at status 200. NOTHING 404s on this site. A
   missing font returns the entire HTML document to something expecting
   a typeface, at status 200, and a cold start over a bad link pays for
   the whole page a second time to throw it away. Measured at three such
   requests per load.

   A STATIC CHECK, not a network one: a dangling reference is a fact
   about the build, and asking the server about it only ever gets the
   rewrite's answer.
   ============================================================ */
{
  const refs = [...html.matchAll(/(?:href|src)="(\/[^"?#]+\.[a-z0-9]{2,5})(?:[?#][^"]*)?"/gi)]
    .map((m) => m[1]);
  const dangling = [...new Set(refs)].filter((r) => !existsSync(join(DIST, r)));
  if (dangling.length) {
    problems.push(
      `  dist/index.html references ${dangling.length} file(s) that are not in the ` +
        `build: ${dangling.join(', ')}. The /* -> /index.html rewrite means these do ` +
        'NOT 404 — each one serves the whole HTML page at status 200 to something ' +
        'expecting a font, an icon or a stylesheet.',
    );
  }
  /* A regex that stopped matching would report a clean page forever. */
  if (refs.length < 3) {
    problems.push(
      `  only ${refs.length} root-relative asset reference(s) were found in ` +
        'dist/index.html, which is too few for this page — the extractor above has ' +
        'stopped matching and is checking nothing.',
    );
  }
}

/* ============================================================
   THE SHARE CARD IS NOT PRECACHED.

   og-card.jpg is fetched by link scrapers and never by the app, so
   precaching it would charge a reporter at a remote strip 53 KB on
   install for a picture they will never see. stamp-sw.mjs excludes it
   by name, and a declaration saying so is worth nothing on its own —
   the worker precaches by extension and .jpg is one it would happily
   take. So the BUILT worker's own manifest is what gets read.
   ============================================================ */
if (!manifestRaw) {
  problems.push(
    '  dist/sw.js has no PRECACHE manifest this check can read, so nothing was ' +
      'verified about what a reporter downloads on install.',
  );
} else if (manifestRaw.includes('og-card.jpg')) {
  problems.push(
    '  og-card.jpg is IN the precache manifest. It is declared in check-assets.mjs as ' +
      'the one asset in public/ that is not, and it is only affordable because of that. ' +
      'Restore the filter in scripts/stamp-sw.mjs.',
  );
}

/* ============================================================
   INSTALL WEIGHT, from the worker's own manifest.

   check-assets.mjs measures what is SERVED. This measures what a
   reporter waits for before the app is usable offline, which is the
   number the offline promise is actually made of — and until this file
   existed it was never measured on a deploy at all, because dist did
   not exist when it ran.
   ============================================================ */
if (manifestRaw) {
  const precached = new Set(JSON.parse(manifestRaw));
  const found = walk(PUBLIC).map((f) => relative(PUBLIC, f).split(/[\\/]/).join('/'));
  let installKb = 0;
  const carried = [];
  for (const rel of found) {
    if (!precached.has(`/${rel}`)) continue;
    installKb += statSync(join(PUBLIC, rel)).size / 1024;
    carried.push(rel);
  }
  if (carried.length < 5) {
    problems.push(
      `  only ${carried.length} of ${found.length} public files matched the precache ` +
        'manifest, so install weight was computed from almost nothing and any number it ' +
        'produced would be meaningless.',
    );
  } else if (installKb > INSTALL_BUDGET_KB) {
    problems.push(
      `  a reporter downloads ${installKb.toFixed(1)} KB from public/ on install, against ` +
        `a ${INSTALL_BUDGET_KB} KB ceiling. This is the cold start on a bad link, and it ` +
        'is the number the offline promise is made of.',
    );
  } else {
    notes.push(
      `install weight   ${installKb.toFixed(1)} KB of ${INSTALL_BUDGET_KB} KB downloaded ` +
        `on install (${carried.length} of ${found.length} files precached)`,
    );
  }
}

if (problems.length === 0) {
  console.log('  dist ok          every referenced asset is in the build');
  for (const n of notes) console.log(`  ${n}`);
  process.exit(0);
}

console.error('check:dist FAILED\n');
console.error(problems.join('\n\n'));
process.exit(1);
