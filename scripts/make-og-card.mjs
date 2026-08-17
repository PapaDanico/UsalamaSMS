/* ============================================================
   THE SHARE CARD, RENDERED FROM THE FACES THE SITE ACTUALLY SHIPS.

   WHY THIS FILE EXISTS. The card was rendered once, by hand, and
   committed as a finished JPEG. Then the type system changed — DM Sans
   out, Plus Jakarta Sans and Roboto in, and both dm-sans woff2 files
   deleted — and the card kept the old face, because a static asset with
   no generator has nothing to notice it has drifted.

   Nothing broke. That is the point: the build stayed green while the
   first thing anybody saw when a link was shared was set in a typeface
   the product no longer had. An artefact nobody can re-run is a claim
   about the brand that stops being true silently.

   So the card is output, and this is its source. `npm run og-card`
   re-renders it and rewrites scripts/og-card.stamp.

   WHAT IS *NOT* HERE, DELIBERATELY. The copy, the palette, the
   measurements and stampFor() live in og-card-content.mjs, which
   imports nothing but node:fs and node:crypto. check-assets.mjs runs
   inside `npm run build` — the command Netlify executes on every deploy
   — and it needs the stamp. When the stamp lived beside this file, that
   gate pulled `playwright` onto the deploy path, which has no browsers
   and no reason to launch one. The split is the fix.
   ============================================================ */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { COPY, CARD_FAMILIES, STAMP_PATH, stampFor, documentFor } from './og-card-content.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'apps/web/public');

const CARD_PATH = join(PUBLIC, 'og-card.jpg');

async function render() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(documentFor(), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  /* THE FACES ARE CONFIRMED PRESENT BEFORE THE SHUTTER, because a
     @font-face that failed to parse falls back in silence and produces
     a card that looks almost right. Rendering it and finding out later
     is how this drifted the first time. */
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family)
  );
  for (const family of CARD_FAMILIES) {
    if (!loaded.includes(family)) {
      await browser.close();
      throw new Error(
        `${family} did not load, so the card would be rendered in a fallback. ` +
          `Loaded: ${loaded.join(', ') || 'nothing'}`
      );
    }
  }

  /* QUALITY 74, MEASURED AGAINST THIS COMPOSITION RATHER THAN PICKED.
     check-assets.mjs declares a 64 KB ceiling for this file, and the
     ground is a two-layer gradient — the one thing JPEG spends bytes
     on. Rendered at each stop:

       70 -> 57.0 KB    74 -> 61.0 KB    76 -> 62.7 KB    78 -> 65.6 KB

     78 fitted before the headline grew from 72px to 78px and does not
     now, which is why this is re-measured here instead of carried over:
     the number belongs to the layout, not to the format. 74 clears the
     ceiling with 3 KB in hand, and on flat colour and large type the
     difference from 86 is not visible. */
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 74 });
  await browser.close();

  writeFileSync(CARD_PATH, jpeg);
  writeFileSync(STAMP_PATH, `${stampFor()}\n`);
  return jpeg.length;
}

/* ONLY WHEN RUN DIRECTLY. check-assets.mjs imports stampFor() from this
   file to recompute the hash, and a top-level render would mean the gate
   launches Chromium and REWRITES the very card it is checking — a check
   that repairs its own subject and then reports it as correct, which is
   the failure this repository has met before and the reason that rule
   is in CLAUDE.md. Importing must be free of side effects. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bytes = await render();
  console.log(`  og-card.jpg rendered — ${(bytes / 1024).toFixed(1)} KB, ${COPY.slogan}`);
  console.log(`  stamp ${stampFor().slice(0, 12)} written to scripts/og-card.stamp`);
}
