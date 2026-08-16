/* ============================================================
   THE SHARE CARD, RENDERED FROM THE FACES THE SITE ACTUALLY SHIPS.

   WHY THIS FILE EXISTS. The card was rendered once, by hand, and
   committed as a finished JPEG. Then the type system changed — DM Sans
   out, Plus Jakarta Sans and Roboto in, and both dm-sans woff2 files
   deleted — and the card kept the old face, because a static asset with
   no generator has nothing to notice it has drifted.

   Nothing broke. That is the point: the build stayed green while the
   first thing anybody saw when the link was shared was set in a
   typeface the product no longer had. An artefact nobody can re-run is
   a claim about the brand that stops being true silently.

   So the card is now OUTPUT, and this is its source. `npm run og-card`
   re-renders it.

   AND A STAMP, because a generator alone does not close it. Re-rendering
   is only mandatory if something fails when you skip it, so this writes
   scripts/og-card.stamp — a hash of the INPUTS: both font files, the mark,
   the copy, and the layout of this file. check-assets.mjs recomputes it and
   fails when it disagrees.

   The stamp hashes inputs rather than the JPEG on purpose. Two Chromium
   builds encode the same pixels to different bytes, so an output hash
   would be a gate that fails for reasons that have nothing to do with
   the card — the flakiest kind of check, and the kind that gets deleted
   six months later along with the protection it carried.

   NOT IN public/. The stamp is a build input, not something a browser
   should ever fetch; check-assets.mjs budgets every byte in that
   directory, and a served file that exists only to police another file
   would be charged to a reporter at a remote strip.
   ============================================================ */

import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'apps/web/public');

/* ------------------------------------------------------------
   THE COPY.

   The headline is the slogan, and it is SHORT on purpose. The line it
   replaced ran eleven words over four lines, which reads as a paragraph
   at the size a timeline renders a card — a share card is glanced at,
   not read, and most often at a fraction of 1200px wide.

   THREE WORDS, SET LARGE, is the whole argument for this one. It stays
   legible in a WhatsApp thumbnail, where a sentence does not, and it
   names what separates this product from the binder and the spreadsheet
   it replaces: an operator does not need more paperwork, it needs to be
   able to SHOW a regulator what happened. That is the hash-chained
   record, stated as a promise rather than a feature.

   No terminal stop — a slogan is a name for the thing rather than a
   sentence about it.

   The sub-line carries the two facts the slogan deliberately leaves out,
   and which a safety manager checks first: how much of Annex 19, and for
   what size of operator.
   ------------------------------------------------------------ */
export const COPY = {
  slogan: 'Proof, not paperwork',
  sub:
    "Eleven of ICAO Annex 19's twelve elements, built for the 3-to-15 " +
    'aircraft operator in East and Central Africa.',
  chips: [
    'Files with the radio off',
    'Deadlines computed, never remembered',
    'A record an auditor can verify',
  ],
  attribution: 'A product of JK & Associates',
  wordmarkA: 'Usalama',
  wordmarkB: 'SMS',
  descriptor: 'Aviation safety management',
};

/* The ground and the accent bar, sampled off the card this replaces so
   the brand survives the re-render rather than being re-invented. The
   bar is JK's three accents left to right — terracotta, Savannah Gold,
   Aviation Teal. */
const IN = {
  groundFrom: '#13312f',
  groundTo: '#205452',
  groundFoot: '#22312c',
  terracotta: '#c65e3b',
  gold: '#d4ab43',
  teal: '#2a7a7b',
};

const asset = (rel) => readFileSync(join(PUBLIC, rel));
const dataUri = (rel, mime) => `data:${mime};base64,${asset(rel).toString('base64')}`;

/* Only the LATIN subsets are embedded. The card's copy is latin, and
   the extended cuts exist for text this file does not set — carrying
   them would be 51 KB of base64 the render never draws a glyph from. */
const FONTS = {
  jakarta: 'fonts/jakarta-latin.woff2',
  roboto: 'fonts/roboto-latin.woff2',
};
const MARK = 'icons/mark-dark-256.png';

/* The families and weight ranges are the ones fonts.css declares. If
   they ever disagree the card is set in something the site does not
   serve, which is the whole defect this file exists to end — so
   check-assets.mjs reads both and compares. */
export const CARD_FAMILIES = ['Plus Jakarta Sans', 'Roboto'];

function documentFor() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face {
    font-family: 'Plus Jakarta Sans';
    font-weight: 400 800;
    src: url('${dataUri(FONTS.jakarta, 'font/woff2')}') format('woff2');
  }
  @font-face {
    font-family: 'Roboto';
    font-weight: 400 700;
    src: url('${dataUri(FONTS.roboto, 'font/woff2')}') format('woff2');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    font-family: 'Roboto', sans-serif;
    background:
      radial-gradient(120% 140% at 88% 0%, ${IN.groundTo} 0%, rgba(32,84,82,0) 62%),
      linear-gradient(155deg, ${IN.groundFrom} 0%, #1b443e 52%, ${IN.groundFoot} 100%);
    color: #fff;
    -webkit-font-smoothing: antialiased;
  }
  .card { height: 630px; padding: 66px 78px 0; display: flex; flex-direction: column; }
  .lockup { display: flex; align-items: center; gap: 18px; }
  .lockup img { width: 62px; height: 62px; display: block; }
  .wordmark {
    font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800;
    font-size: 34px; letter-spacing: -0.02em; line-height: 1.1;
    display: flex; align-items: center; gap: 9px;
  }
  .wordmark b { background: #fff; color: ${IN.groundFrom}; padding: 1px 10px 3px; font-weight: 800; }
  .descriptor {
    font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;
    color: rgba(255,255,255,0.62); margin-top: 5px;
  }
  h1 {
    font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800;
    font-size: 122px; line-height: 1.0; letter-spacing: -0.035em;
    margin-top: 44px; max-width: 980px; text-wrap: balance;
  }
  .sub {
    font-size: 26px; line-height: 1.5; color: rgba(255,255,255,0.84);
    margin-top: 30px; max-width: 820px;
  }
  .foot {
    margin-top: auto; padding-bottom: 46px;
    display: flex; align-items: center; gap: 14px;
  }
  .chip {
    font-size: 16.5px; color: rgba(255,255,255,0.9);
    border: 1px solid rgba(255,255,255,0.30); border-radius: 999px;
    padding: 10px 19px; white-space: nowrap;
  }
  .attrib { margin-left: auto; font-size: 16px; color: rgba(255,255,255,0.5); white-space: nowrap; }
  .bar {
    position: fixed; left: 0; right: 0; bottom: 0; height: 9px;
    background: linear-gradient(90deg, ${IN.terracotta} 0%, ${IN.gold} 50%, ${IN.teal} 100%);
  }
</style></head><body>
  <div class="card">
    <div class="lockup">
      <img src="${dataUri(MARK, 'image/png')}" alt="">
      <div>
        <div class="wordmark">${COPY.wordmarkA}<b>${COPY.wordmarkB}</b></div>
        <div class="descriptor">${COPY.descriptor}</div>
      </div>
    </div>
    <h1>${COPY.slogan}</h1>
    <p class="sub">${COPY.sub}</p>
    <div class="foot">
      ${COPY.chips.map((c) => `<span class="chip">${c}</span>`).join('')}
      <span class="attrib">${COPY.attribution}</span>
    </div>
  </div>
  <div class="bar"></div>
</body></html>`;
}

/**
 * The hash the gate compares against. Everything that can change what
 * the card LOOKS like goes in: the two font files, the mark, the copy,
 * and the markup this file emits — which folds in the palette and every
 * measurement, since they are all interpolated into it.
 */
export function stampFor() {
  const h = createHash('sha256');
  h.update(asset(FONTS.jakarta));
  h.update(asset(FONTS.roboto));
  h.update(asset(MARK));
  h.update(JSON.stringify(COPY));
  h.update(documentFor());
  return h.digest('hex');
}

export const STAMP_PATH = join(ROOT, 'scripts/og-card.stamp');
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
