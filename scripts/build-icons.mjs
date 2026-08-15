#!/usr/bin/env node
/* =====================================================================
   EVERY ICON IS CROPPED FROM ONE SUPPLIED FILE. Nothing here is drawn.

   WHAT THIS REPLACED, and why the replacement is the whole point.

   These icons used to be generated from the path constants in
   apps/web/src/components/Logo.js — a hand-built approximation of the
   identity. That was defensible while it was the only vector source,
   and it produced a mark that is RECOGNISABLY NOT THE ONE THE DESIGNER
   DREW: straight crossing lines where the artwork has sweeping contrail
   arcs, an arrowhead where the artwork has an airliner, a spiked crest
   where the artwork has a rounded one.

   THE SUPPLIED ARTWORK DISAGREES WITH ITSELF, which is worth knowing
   before trusting any one file. docs/brand/ holds four renderings of
   this mark and no two match:

     guidelines-spread.jpg  quartered colour shield, straight crossing
                            lines, crane, aircraft — captioned PRIMARY
     lockup-wide.jpg        gold line art, curved contrail arcs, an
                            airliner, crane on a runway
     splash-portrait.jpg    gold line art, crane at the TOP, TWO
                            aircraft, runway in perspective
     slide-template.png     gold line art on cream, different again

   So "align the icons with the brand assets" cannot mean "match the
   assets", because they do not match each other. It means PICK ONE AND
   USE ONLY IT, which is what this does: lockup-wide.jpg, for three
   reasons and not by preference.

     · It carries the mark at the largest clean size of the four —
       330x425 against slide-template's 240x275.
     · It is a flat render rather than a photograph of a printed page,
       so there is no perspective, paper grain or page curl to key
       through.
     · Its ground is a flat-ish pattern rather than a gradient, and a
       gradient cannot be keyed away without keying away the mark.

   RESOLUTION IS SUFFICIENT AND THAT WAS CHECKED, NOT ASSUMED. 425px of
   source sounds thin for a 512px icon, but no icon draws the mark at
   its full canvas: the largest is icon-512 at pad 1.25, which puts the
   mark at 410px, and the maskable is smaller still. Every output below
   DOWNSCALES the source. Nothing is upscaled.

   ---------------------------------------------------------------
   THE KEY, AND WHY IT RUNS AT 4x.

   Every pixel is snapped to one of two brand tokens: gold if it is part
   of the mark, ground if it is not. That is what removes the terracotta
   pattern the mark sits on — at icon sizes that pattern is noise
   competing with the only thing worth seeing.

   Keying at the target size would also snap away the ANTIALIASING and
   leave hard gold stair-steps. Keying at 4x and letting the downscale
   average the result gives a clean ground and smooth strokes: separate
   where there are pixels to spare, smooth afterwards.

   ---------------------------------------------------------------
   PNG ONLY. There is no vector source for this mark — the supplied
   files are all raster — so an SVG here could only ever be a redrawing,
   which is the thing that was wrong. An SVG icon beside a PNG one is
   also two logos with the browser choosing, which is what the favicon
   pair did until it was found.

   Rasterising uses Playwright, already a devDependency for the smoke
   suite, rather than adding an image library.
   ===================================================================== */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'apps/web/public/icons');
const LOCKUP = resolve(ROOT, 'docs/brand/lockup-wide.jpg');

/* Brand values read from the stylesheet rather than typed here — one
   source, and check-brand.mjs already guards them. */
const css = readFileSync(resolve(ROOT, 'apps/web/src/style.css'), 'utf8');
const token = (name) => {
  const m = new RegExp(`--${name}\\s*:\\s*(#[0-9a-f]{6})\\s*;`, 'i').exec(css);
  if (!m) throw new Error(`--${name} not found in style.css`);
  return m[1];
};
const GOLD = token('us-gold');
const CHARCOAL = token('us-charcoal');

/* BOUNDS READ OFF THE ARTWORK, not guessed: the shield spans x 145..475
   and y 140..565 of the 1536x864 lockup. Squared about its own centre so
   the mark is centred rather than cropped to its own aspect. */
const MARK_BOX = { x: 145, y: 140, w: 330, h: 425 };
const SUPERSAMPLE = 4;

/**
 * One icon, cropped and keyed.
 *
 * THE SOURCE WINDOW NEVER MOVES. `pad` insets the mark on the OUTPUT
 * tile; it does not widen the crop. Those are two different operations
 * and the first version conflated them, which is a defect you can see:
 * widening the window to pad 1.60 for the maskable reached past the
 * mark into the lockup's decorative border, and the key — correctly,
 * since that border is the same gold — brought a strip of pattern onto
 * the top of the tile.
 *
 * Cropping tight and insetting afterwards cannot do that, because there
 * is no source outside the mark in the pipeline at all. It also means
 * every icon keys IDENTICAL pixels and differs only in layout, so a
 * change in the key cannot affect one tile and not another.
 *
 * `ground` of null leaves everything that is not the mark transparent,
 * for the one output that sits on a surface of its own.
 */
async function cropMark(page, { size, pad, ink, ground }) {
  const src = `data:image/jpeg;base64,${readFileSync(LOCKUP).toString('base64')}`;
  const dataUrl = await page.evaluate(
    async ({ src, box, size, pad, ss, ink, ground }) => {
      const img = new Image();
      img.src = src;
      await img.decode();

      const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const INK = rgb(ink);
      const GND = ground ? rgb(ground) : [0, 0, 0];

      /* Step one: the mark alone, keyed, at 4x the size it will occupy.
         The window is exactly MARK_BOX squared about its own centre —
         no pad, so nothing outside the mark is ever sampled. */
      const drawn = Math.round((size / pad) * ss);
      const s = Math.max(box.w, box.h);
      const c = document.createElement('canvas');
      c.width = c.height = drawn;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, box.x - (s - box.w) / 2, box.y - (s - box.h) / 2, s, s, 0, 0, drawn, drawn);

      const d = g.getImageData(0, 0, drawn, drawn);
      const px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], gr = px[i + 1], bl = px[i + 2];
        /* The gold of the mark against everything else in the source.
           Tuned on the artwork and checked by rendering, not derived:
           the ground is a dark terracotta whose red channel is high
           enough that lightness alone does not separate them, so the
           test is warmth (r - b, g - b) as well as level. */
        const isMark = r > 140 && gr > 105 && bl < 140 && r - bl > 60 && gr - bl > 25;
        px[i] = isMark ? INK[0] : GND[0];
        px[i + 1] = isMark ? INK[1] : GND[1];
        px[i + 2] = isMark ? INK[2] : GND[2];
        /* Transparent OUTSIDE the mark when there is no ground — and
           also where the inset will be, below, which is why the ground
           is painted rather than left to the keyed rectangle. */
        px[i + 3] = isMark || ground ? 255 : 0;
      }
      g.putImageData(d, 0, 0);

      /* Step two: the tile. Ground first so the inset is ground rather
         than a transparent border, then the mark centred on it. */
      const o = document.createElement('canvas');
      o.width = o.height = size;
      const og = o.getContext('2d');
      if (ground) {
        og.fillStyle = ground;
        og.fillRect(0, 0, size, size);
      }
      og.imageSmoothingQuality = 'high';
      const inset = (size - size / pad) / 2;
      og.drawImage(c, inset, inset, size / pad, size / pad);

      /* Step three: QUANTISE THE RAMP, and this is a weight decision
         rather than a visual one.

         The downscale leaves a continuous gradient between ground and
         mark along every edge, so a tile that is two colours to look at
         is thousands of colours to encode. Cropped icons came in 38 KB
         heavier than the flat-filled SVGs they replaced — enough to put
         public/ over its budget, on a product whose promise is a ramp
         agent at a remote strip paying for all of this on install.

         Snapping each channel to 16 levels collapses that ramp to a
         handful of repeated byte patterns, which is what PNG's filters
         and zlib are good at. 16 levels of antialiasing on a 32px icon
         is more than the eye resolves; the saving is most of the 38 KB.
         Checked by rendering at every size afterwards, not assumed. */
      const STEPS = 16;
      const snap = (v) => Math.round((v / 255) * (STEPS - 1)) * (255 / (STEPS - 1));
      const out = og.getImageData(0, 0, size, size);
      for (let i = 0; i < out.data.length; i++) out.data[i] = snap(out.data[i]);
      og.putImageData(out, 0, 0);

      return o.toDataURL('image/png');
    },
    { src, box: MARK_BOX, size, pad, ss: SUPERSAMPLE, ink, ground },
  );
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

/* =====================================================================
   THE PADS, DERIVED.

   The mark is drawn at 1/pad of the tile's height, centred, on ground.
   pad is a LAYOUT number and touches nothing about the crop.

   1.10  THE BROWSER TAB. Nearly full bleed, because a favicon is 16
         device pixels in a row of twenty and every one of them counts.
         Rendered at 16, 32 and 64 on light and dark grounds and in a
         tab strip beside five other favicons before it was believed.

   1.25  APP ICONS AND THE TOUCH ICON. Mark at 80% of the tile, which is
         the breathing room a home-screen icon wants and a tab icon
         cannot afford.

   1.60  MASKABLE, and this one is measured. The mask crops to the outer
         20%, leaving a safe circle of 0.8 x 512 = 409.6px. What has to
         fit that circle is the mark's DIAGONAL, not either edge: the
         mark is 330x425, so drawn at height 512/pad its diagonal is
         (512/pad) x sqrt((330/425)^2 + 1) = 648.2/pad. Setting that at
         or under 409.6 gives pad >= 1.583, so 1.60 — the smallest value
         that fits, with 6px to spare. Rounding DOWN here is what shaves
         the shield's corners off on a circular mask, which is the exact
         failure the safe zone exists to prevent.
   ===================================================================== */
const RASTER = [
  { to: 'favicon-32.png', size: 32, pad: 1.1, ink: GOLD, ground: CHARCOAL },
  { to: 'icon-192.png', size: 192, pad: 1.25, ink: GOLD, ground: CHARCOAL },
  { to: 'icon-512.png', size: 512, pad: 1.25, ink: GOLD, ground: CHARCOAL },
  { to: 'maskable-512.png', size: 512, pad: 1.6, ink: GOLD, ground: CHARCOAL },
  // iOS reads this one and only this one. 180 is the size it asks for.
  { to: 'apple-touch-icon.png', size: 180, pad: 1.25, ink: GOLD, ground: CHARCOAL },
  /* THE TWO THAT BRING NO GROUND, for the mark inside the product
     rather than on a tile. Transparent, so each takes the surface it is
     placed on, and there are two because the surfaces are opposite —
     the guidelines list a monochrome variant for each and this is
     those, not an invention.

     SIZED TO WHERE THEY ARE USED, not to a round number. The header and
     footer lockup draws at 34px, so 128 covers a 3.7x display; the home
     hero draws at 116px, so 256 covers 2.2x. Shipping both at 256 would
     cost 10 KB for pixels a header never renders. */
  { to: 'mark-light-128.png', size: 128, pad: 1, ink: CHARCOAL, ground: null },
  { to: 'mark-dark-256.png', size: 256, pad: 1, ink: GOLD, ground: null },
];

mkdirSync(OUT, { recursive: true });

/* THE DRAWN ICONS ARE DELETED RATHER THAN LEFT, and this loop is here
   because leaving them is how a browser goes on picking one. They were
   generated from Logo.js and none of them is regenerated now; a stale
   icon-512.svg sitting in public/ is a second logo the manifest or a
   future edit can still reach. check-assets.mjs fails on an undeclared
   file, so this and that gate close from opposite ends. */
for (const stale of readdirSync(OUT).filter((f) => f.endsWith('.svg'))) {
  unlinkSync(resolve(OUT, stale));
  console.log(`  removed icons/${stale}  (drawn, superseded by the crop)`);
}

/* The rasterised PNGs are COMMITTED, and this step regenerates them
   where a browser exists rather than requiring one everywhere.

   Netlify's build image has no Chromium, so making `npm run build`
   depend on launching one turned a working deploy into a failed one —
   found by the deploy failing, which is a slow way to learn it.

   Skipping is only safe because the outputs are in the repository. So
   the skip VERIFIES rather than shrugs: if a PNG the manifest depends
   on is missing, this fails and says how to make it. Charter rule 11 —
   a check that stops checking must fail. */
let browser = null;
try {
  const { chromium } = await import('playwright');
  browser = await chromium.launch();
} catch (err) {
  browser = null;
  console.log(`\n  no browser available (${err.message.split('\n')[0]})`);
  console.log('  verifying the committed PNGs instead of regenerating them');
}

if (browser) {
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
    for (const spec of RASTER) {
      writeFileSync(resolve(OUT, spec.to), await cropMark(page, spec));
      console.log(
        `  wrote icons/${spec.to}  (${spec.size}px, pad ${spec.pad}, ` +
          `${spec.ground ? 'on charcoal' : 'transparent'})`,
      );
    }
    await page.close();
  } finally {
    await browser.close();
  }
} else {
  const missing = RASTER.filter(({ to }) => !existsSync(resolve(OUT, to))).map((r) => r.to);
  if (missing.length > 0) {
    console.error(
      `\nFATAL: ${missing.length} icon(s) missing and no browser to crop them:\n` +
        missing.map((m) => `  · icons/${m}`).join('\n') +
        `\n\n  These are committed to the repository. Regenerate them on a machine\n` +
        `  with Playwright's Chromium and commit the result:\n\n` +
        `      npx playwright install chromium && npm run icons\n\n` +
        `  Do not ship without them: an icon-less manifest is not installable —\n` +
        `  iOS substitutes a screenshot of the page for the touch icon.`,
    );
    process.exit(1);
  }
  for (const { to } of RASTER) console.log(`  verified icons/${to} (committed)`);
}

console.log(
  `\n${RASTER.length} icons, every one cropped from docs/brand/lockup-wide.jpg. ` +
    `Nothing drawn.`,
);
