#!/usr/bin/env node
/* =====================================================================
   EVERY FILE SERVED FROM public/ IS DECLARED, WITH A CEILING.

   WHY THIS EXISTS, and it is a near miss rather than a hypothetical.
   Eight brand assets — coins, a crane, a lockup, a guidelines spread —
   were uploaded straight into apps/web/public/brand/. Vite copies
   public/ verbatim into dist/, so 3.7 MB began being served on the next
   deploy. Fourteen times the weight of everything else in that
   directory combined, on a product whose promise is a ramp agent at a
   remote strip with one bar of signal.

   NOTHING IN THE REPOSITORY HAD AN OPINION. The bundle budget in
   stamp-sw.mjs measures JavaScript and CSS; it has never looked at an
   image. The accessibility sweep, the CSS gate, the claims gate and the
   smoke suite all read code or rendered pages, and an unused file in
   public/ is neither.

   AND THE OFFLINE INSTALL ESCAPED BY LUCK. The service worker
   precaches by extension — `js|css|woff2|svg|png|json|html` — and the
   files arrived from WhatsApp named `.jpg`. Three of the eight are PNG
   data wearing that extension. Renaming one of them to what it actually
   is would have put it in the bundle every user downloads on install,
   and the build would have said nothing at all.

   So: an allowlist with a reason and a ceiling per file, plus a total.
   Adding an asset is a decision somebody writes down, which is the same
   shape as the bundle receipt and the switches document.

   Charter rule 11: a check that stops checking must fail. Watched
   failing three ways before it was believed — an undeclared file, a
   file over its own ceiling, and a total over budget.
   ===================================================================== */

import { readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = resolve(ROOT, 'apps/web/public');

/* The ceilings are the real sizes rounded up, not aspirations. A ceiling
   set well above what a file weighs is a ceiling that cannot fail, and
   the point of the number is that growth has to be noticed. */
const DECLARED = new Map([
  ['fonts/dm-sans-latin.woff2', [64, 'Body face, Latin. Subset; the largest single asset and worth it — a report form in Times New Roman reads as a broken page, and this is precached so it is paid once.']],
  ['fonts/dm-sans-latin-ext.woff2', [33, 'Body face, Latin Extended. Kenyan and East African names carry diacritics this subset covers and the base one does not.']],
  ['fonts/cormorant-garamond-latin.woff2', [39, 'Display face, Latin. Headings only.']],
  ['fonts/cormorant-garamond-latin-ext.woff2', [35, 'Display face, Latin Extended.']],
  ['fonts/jetbrains-mono-identifiers.woff2', [7, 'IDENTIFIERS ONLY, and the subset is the whole argument. --us-font-mono was a system stack — ui-monospace, SFMono-Regular, Menlo, Consolas — so an audit-chain hash rendered in a different face on a manager’s Mac and a ramp agent’s Android, which is exactly the data where character shape carries the meaning. A full Latin cut of this face is ~55 KB; subset to digits, A–Z, a–z and the punctuation an identifier uses, it is 6 KB, and it still disambiguates 0/O and 1/l/I, which is the only reason it is here. NOT FOR NUMBERS: figures already align through font-variant-numeric on the body face at zero bytes, and mono digits are wider and lighter than DM Sans’s, so setting a risk matrix in them would read as weaker rather than more precise.']],

  ['icons/mark.svg', [3, 'The shield mark, generated from Logo.js by build-icons.mjs. Never hand-edited.']],
  ['icons/favicon.svg', [2, 'Browser tab, vector.']],
  ['icons/favicon-32.png', [2, 'Browser tab, for the browsers that still want a raster.']],
  ['icons/icon-192.svg', [3, 'PWA icon, vector.']],
  ['icons/icon-512.svg', [3, 'PWA icon, vector.']],
  ['icons/maskable-512.svg', [3, 'PWA maskable icon, vector — the safe-zone variant Android crops.']],
  ['icons/icon-192.png', [14, 'PWA icon raster, for installers that refuse SVG.']],
  ['icons/icon-512.png', [40, 'PWA icon raster.']],
  ['icons/maskable-512.png', [26, 'PWA maskable raster.']],
  ['icons/apple-touch-icon.png', [14, 'iOS home screen. iOS does not accept an SVG icon — see docs/05-SWITCHES.md.']],

  ['manifest.json', [2, 'The PWA manifest. Installability is the offline promise.']],
  ['offline.html', [39, 'The page served when there is no network. Self-contained by necessity — it cannot reference a stylesheet, a font or an image that might not be cached — so its own weight is its whole cost. WENT 6 -> 37 KB WHEN THE CRANE WAS INLINED: 22 KB of that is a WebP of docs/brand/crane.png, resampled by scripts/derive-brand.mjs and never redrawn, with its ground flood-filled transparent from the edges so the patterned sand this page paints shows through, rather than a second and slightly different sand sitting on top of it — which is what the first attempt shipped, and what only a screenshot could catch. It is DECORATION, it is precached, and every user pays for it once on install — so if this budget ever needs room, this is the first thing to cut and the ceiling is set to make that visible rather than comfortable. What buys it: this is the page a ramp agent sees at the moment they most need to trust the product, and it is the only identity surface reachable while the shared stylesheet sits at 59.9 of 60 KB.']],
  ['sw.js', [12, 'The service worker, stamped by stamp-sw.mjs on every build.']],
]);

/* Everything in public/, together. Currently 268 KB, of which 162 KB is
   the four font subsets. A raise needs a receipt here, the same as the
   JavaScript budget. */
const TOTAL_BUDGET_KB = 306;
/* 300 -> 306 for the mono identifier subset. 6.3 KB, and it is the
   cheapest font in this directory by a factor of five — the full Latin
   cut of the same face would have been ~55 KB and would have taken this
   budget past 350. What it buys is recorded on the file's own line
   above; what it cost is one file, no Latin-Extended sibling, and no
   change to any other asset. */
/* 280 -> 300 for the crane on the offline page. 27 KB of the directory
   is now one illustration, which is the largest single non-font asset
   here and is charged to every install. Recorded rather than absorbed:
   the fonts are 162 KB and are load-bearing; this is not. */

/* THE BRAND MASTERS ARE NOT PRODUCT ASSETS, and this is where that is
   enforced rather than remembered. They live in docs/brand/ — 1536px
   coins, a 1024px crane, a guidelines spread, a slide template. They
   are for decks, social and the guidelines document, and none of them
   is displayed at anything like that size in this application. A master
   that reappears under public/ fails as an undeclared file, and this
   pattern makes the error message say why rather than leaving somebody
   to guess. */
const MASTER_SHAPES = /(coin|crane|lockup|pattern|splash|guidelines|slide|IMG-\d)/i;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const problems = [];
const found = walk(PUBLIC).map((f) => relative(PUBLIC, f).split(/[\\/]/).join('/'));
let total = 0;

for (const rel of found.sort()) {
  const kb = statSync(join(PUBLIC, rel)).size / 1024;
  total += kb;

  const declared = DECLARED.get(rel);
  if (!declared) {
    problems.push(
      MASTER_SHAPES.test(rel)
        ? `  ${rel} — this looks like a brand MASTER. Masters live in docs/brand/ and are ` +
          `never served: they are sized for decks, not for a handset on one bar of signal. ` +
          `If a screen genuinely needs one, derive it at the size it is displayed, declare ` +
          `it below with a ceiling, and say what it bought.`
        : `  ${rel} — served from public/ and declared nowhere (${kb.toFixed(1)} KB). ` +
          `Add it to DECLARED in this file with its reason and a ceiling, or delete it.`,
    );
    continue;
  }

  const [ceiling] = declared;
  if (kb > ceiling) {
    problems.push(
      `  ${rel} — ${kb.toFixed(1)} KB against its own ${ceiling} KB ceiling. ` +
        `Either it grew for a reason worth writing down, or something was added to it ` +
        `that does not belong.`,
    );
  }
}

for (const rel of DECLARED.keys()) {
  if (!found.includes(rel)) {
    problems.push(
      `  ${rel} — declared here and not present. A declaration for a file that does not ` +
        `exist is how this list stops describing anything.`,
    );
  }
}

if (total > TOTAL_BUDGET_KB) {
  problems.push(
    `  public/ totals ${total.toFixed(1)} KB against a ${TOTAL_BUDGET_KB} KB budget. ` +
      `Every byte here is served, and the precached ones are downloaded before a ` +
      `reporter can file anything.`,
  );
}

if (problems.length === 0) {
  console.log(
    `  assets ok        ${found.length} files declared, ${total.toFixed(1)} KB of ` +
      `${TOTAL_BUDGET_KB} KB served from public/`,
  );
  process.exit(0);
}

console.error('check:assets FAILED\n');
console.error(problems.join('\n\n'));
console.error(
  '\nThe service worker precaches by extension, so an image dropped into public/ with ' +
    'a name it recognises joins the bundle every user downloads on install — and the ' +
    'JavaScript budget cannot see it. This list is the only thing that can.',
);
process.exit(1);
