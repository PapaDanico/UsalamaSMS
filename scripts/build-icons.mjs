#!/usr/bin/env node
/* ============================================================
   Icon suite. TWO sources, and the split is deliberate.

   docs/04-BRAND.md says "never hand-edit a generated icon — change the
   path and regenerate", which was a claim about a generator that did
   not exist. This is it.

   THE APP ICONS ARE DRAWN FROM Logo.js. Everything icon() renders reads
   its path constants out of apps/web/src/components/Logo.js by parsing
   the module rather than by copying the strings, so a home-screen tile
   cannot disagree with the header mark. Two sources of a logo's
   geometry means two logos, eventually.

   THE TAB ICON IS CROPPED FROM THE SUPPLIED ARTWORK. Logo.js's geometry
   is an approximation of the identity, and at 192px and up it is a good
   one. At 32px it is not — see the note above cropMark(), which is
   where that was measured rather than assumed. The two do not disagree
   about the brand; one is the drawing and one is the photograph of it,
   and they are used at the sizes each is right at.

   BOTH SVG AND PNG. An SVG-only manifest is not installable: iOS
   ignores an SVG apple-touch-icon entirely and substitutes a screenshot
   of the page. Rasterising uses Playwright, already a devDependency for
   the smoke suite, rather than adding an image library.
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = resolve(ROOT, 'apps/web/src/components/Logo.js');
const OUT = resolve(ROOT, 'apps/web/public/icons');

const source = readFileSync(LOGO, 'utf8');

/** Pull a path constant out of the Logo module by name. */
function constant(name) {
  // SHIELD_PATH is an array joined with spaces; the element paths are
  // plain string literals. Both forms are handled, and a name that
  // matches neither is a hard failure — charter rule 11, since every
  // icon below asserts this geometry exists.
  const array = new RegExp(`${name} = \\[([\\s\\S]*?)\\]\\.join\\(' '\\)`).exec(source);
  if (array) {
    return [...array[1].matchAll(/'([^']*)'/g)].map((m) => m[1]).join(' ');
  }
  const literal = new RegExp(`${name} =\\s*\\n?\\s*'([^']*)'`).exec(source);
  if (literal) return literal[1];

  /* A bare array of literals — RUNWAY_BARS is three separate paths that
     must stay separate, because joining them would connect the last
     point of one bar to the first of the next and draw the runway as a
     zigzag. Returned as an array; every other form returns a string. */
  const bare = new RegExp(`${name} = \\[([\\s\\S]*?)\\];`).exec(source);
  if (bare) return [...bare[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);

  throw new Error(
    `${name} not found in apps/web/src/components/Logo.js.\n` +
      `  The icon suite is generated from that module's geometry. If the ` +
      `constant was renamed, rename it here; do not paste the path.`
  );
}

const SHIELD = constant('SHIELD_PATH');
const CRANE_BODY = constant('CRANE_BODY');
const CRANE_NECK = constant('CRANE_NECK');
const CRANE_HEAD = constant('CRANE_HEAD');
const AIRCRAFT = constant('AIRCRAFT');
const DETAIL_MIN_HEIGHT = Number(/DETAIL_MIN_HEIGHT = (\d+)/.exec(source)?.[1] ?? 40);
const ARC_CLIMB = constant('ARC_CLIMB');
const ARC_DESCEND = constant('ARC_DESCEND');
const CRANE_WING = constant('CRANE_WING');
const CRANE_EYE = constant('CRANE_EYE');
const QUARTER_TOP = constant('QUARTER_TOP');
const QUARTER_LEFT = constant('QUARTER_LEFT');
const QUARTER_RIGHT = constant('QUARTER_RIGHT');
const CRANE_LEGS = constant('CRANE_LEGS');
const CRANE_CREST = constant('CRANE_CREST');
const RUNWAY_BARS = constant('RUNWAY_BARS');

/* Brand values, read from the stylesheet rather than typed here — one
   source, and check-brand.mjs already guards them. */
const css = readFileSync(resolve(ROOT, 'apps/web/src/style.css'), 'utf8');
const token = (name) => {
  const m = new RegExp(`--${name}\\s*:\\s*(#[0-9a-f]{6})\\s*;`, 'i').exec(css);
  if (!m) throw new Error(`--${name} not found in style.css`);
  return m[1];
};

const GOLD = token('us-gold');
const TERRACOTTA = token('us-terracotta');
const TEAL = token('us-teal');
const CHARCOAL = token('us-charcoal');
const SAND = token('us-sand');

/**
 * One icon.
 *
 * `safeZone` shrinks the artwork for maskable icons: every platform mask
 * can crop to the outer 20%, so the artwork sits inside the 80% safe
 * circle. An icon that fills its canvas is an icon with its shoulders
 * cut off on a Pixel.
 */
/* THE MASKABLE SCALE, measured rather than eyeballed, AND NAMED ONCE.
   The mask crops to the outer 20%, leaving a safe circle of
   0.8 x 512 = 409.6px. The artwork is 112x132 units, so at scale s its
   DIAGONAL is sqrt((112s)^2 + (132s)^2) = 173s, and that diagonal is
   what has to fit the circle rather than either edge. At 0.58 the
   diagonal came to 367px against 409.6 available — a tile with visible
   slack on every side, which on a launcher reads as a small logo
   floating in a dark square while the apps beside it fill theirs.

   0.63 puts the diagonal at 399px, which fits with 10px to spare. 0.65
   puts it at 412px, which OVERFLOWS by two and would have the shield's
   corners shaved off on a circular mask — the exact failure the safe
   zone exists to prevent, arrived at by rounding up. So the number is
   0.63 and it is the largest one that fits.

   A CONSTANT BECAUSE IT WAS TYPED TWICE. Raising it from 0.58 changed
   the line that scales the artwork and missed the line just below that
   decides whether to draw the detail set, which went on computing the
   artwork's height from 0.58. Harmless here — both land far above the
   40px threshold — and it is the same defect this file's own header
   warns about, two lines apart. */
const MASKABLE_SCALE = 0.63;
const FULL_SCALE = 0.76;

function icon({ size, background, ink, accent, safeZone = false, colour = false }) {
  const artwork = safeZone ? MASKABLE_SCALE : FULL_SCALE;
  const scale = artwork * (size / 140);
  const w = 120 * scale;
  const h = 140 * scale;
  const dx = (size - w) / 2;
  const dy = (size - h) / 2;

  /* THE DETAIL THRESHOLD, applied here as it is in the in-app mark.
     Every icon in this suite was drawn at the reduced set — shield,
     crane body, aircraft — regardless of size, which is right at 32px
     and wrong at 512. A home-screen icon rendered from the reduced set
     is a blob under a floating gold triangle.

     40px is Logo.js's own threshold, read from that module rather than
     repeated, so the icons and the in-app mark cannot disagree about
     where detail starts. */
  const detail = size * artwork >= DETAIL_MIN_HEIGHT;

  const bird = colour ? CHARCOAL : ink;
  const arcs = colour ? SAND : accent;

  const runway = RUNWAY_BARS.map(
    (d) => `<path d="${d}"/>`
  ).join('\n        ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${background}"/>
  <g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${scale.toFixed(4)})">
    ${
      colour
        ? `<g stroke="none">
      <path d="${QUARTER_TOP}" fill="${TERRACOTTA}"/>
      <path d="${QUARTER_LEFT}" fill="${TEAL}"/>
      <path d="${QUARTER_RIGHT}" fill="${GOLD}"/>
    </g>`
        : ''
    }
    <path d="${SHIELD}" fill="none" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    ${
      detail
        ? `<g fill="none" stroke="${arcs}" stroke-width="2.6" stroke-linecap="round">
      <path d="${ARC_CLIMB}"/>
      <path d="${ARC_DESCEND}"/>
    </g>`
        : ''
    }
    <g fill="${bird}">
      <path d="${CRANE_BODY}"/>
      <path d="${CRANE_NECK}"/>
      <path d="${CRANE_HEAD}"/>
    </g>
    ${
      detail
        ? `<path d="${CRANE_WING}" fill="${SAND}" opacity="0.5"/>
    <path d="${CRANE_EYE}" fill="${SAND}"/>
    <g fill="none" stroke="${bird}" stroke-width="2.4" stroke-linecap="round">
      <path d="${CRANE_LEGS}"/>
    </g>
    <g fill="none" stroke="${accent}" stroke-width="1.9" stroke-linecap="round">
      <path d="${CRANE_CREST}"/>
    </g>
    <g fill="none" stroke="${bird}" stroke-width="3" stroke-linecap="round">
        ${runway}
    </g>`
        : ''
    }
    <path d="${AIRCRAFT}" fill="${accent}"/>
  </g>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });

const FILES = {
  // The installed app icon is the PRIMARY logo — the quartered shield
  // from the identity guidelines, not a monochrome reduction. This is
  // the one place the brand is seen at size and out of context.
  'icon-192.svg': icon({ size: 192, background: SAND, ink: CHARCOAL, accent: GOLD, colour: true }),
  'icon-512.svg': icon({ size: 512, background: SAND, ink: CHARCOAL, accent: GOLD, colour: true }),
  // Maskable: dark field, gold mark, artwork inside the safe zone.
  'maskable-512.svg': icon({
    size: 512,
    background: CHARCOAL,
    ink: GOLD,
    accent: GOLD,
    safeZone: true,
  }),
  // Transparent, for use inside documents and exports.
  'mark.svg': icon({ size: 256, background: 'none', ink: CHARCOAL, accent: GOLD }),
};

for (const [name, contents] of Object.entries(FILES)) {
  writeFileSync(resolve(OUT, name), contents);
  console.log(`  wrote icons/${name}`);
}

/* =====================================================================
   THE TAB ICON IS CROPPED FROM THE SUPPLIED ARTWORK, NOT REDRAWN.

   THE FIRST TWO ATTEMPTS BOTH FAILED, IN OPPOSITE DIRECTIONS, and both
   are the reason this reads the artwork instead.

   It began as icon() at the reduced detail set, which still draws the
   shield as an OUTLINE. At 32px that 5-unit stroke scales to 0.87px and
   at the 16px a tab actually renders it is 0.43px — and a sub-pixel
   stroke does not draw a thin line, it draws a grey smudge. The ground
   was `none` and the ink charcoal, so on a dark tab bar it was
   near-black on near-black as well.

   The correction was a filled SILHOUETTE of the shield, gold on
   charcoal. That fixed both defects and threw away the mark: no crane,
   no contrail, no aircraft — a gold blob that could belong to any
   company with a shield. The reasoning ("at 16px a bird with a beak and
   two legs is noise") was sound and the conclusion was still wrong,
   because a tab icon nobody recognises has not saved anything.

   WHAT SETTLED IT WAS RENDERING BOTH AND LOOKING. Logo.js's geometry is
   an approximation of the identity; at 192px and up it is a good one,
   and at tab size the crane collapses to an amorphous blob while the
   CONTRAIL ARC — the sweeping line carrying the aircraft, which is the
   most recognisable thing in the mark — is not in that geometry at all.
   So no reduction of it was going to work, because the thing worth
   keeping was never there.

   docs/brand/lockup-wide.jpg is the supplied lockup: gold line art on a
   patterned dark ground. This crops the shield out of it, so what ships
   is the ACTUAL mark rather than a reconstruction of it.

   TWO COLOURS, KEYED AT 4x AND THEN DOWNSCALED, and the order is the
   whole trick. The key snaps every pixel to gold or to charcoal, which
   is what removes the terracotta pattern behind the mark — at 32px that
   pattern is noise competing with the only thing worth seeing. Keying
   at the target size would also snap away the ANTIALIASING, leaving
   gold stair-steps on a hard edge. Keying at 4x and letting the
   downscale average the result gives a clean ground and smooth strokes:
   the separation happens where there are pixels to spare, the smoothing
   happens after. Rendered at 16, 32 and 64 on light and dark grounds
   before it was believed.

   Only 32 is shipped. Browsers downscale it for the 16px slot with a
   better filter than keying at 16 produces, which was measured the same
   way — a hand-keyed 16 is mush and the browser's 16 reads as a shield.

   AND THE GROUND IS OPAQUE, in the brand's own dark. That reads on a
   white tab bar and on a black one because it brings its own contrast
   rather than borrowing the browser's.

   BOUNDS READ OFF THE ARTWORK, not guessed: the shield spans x 145..475
   and y 140..565 of the 1536x864 lockup, squared about its own centre
   so the mark is centred rather than cropped to its own aspect, and
   padded 10% so it does not touch the edges.
   ===================================================================== */
const LOCKUP = resolve(ROOT, 'docs/brand/lockup-wide.jpg');
const MARK_BOX = { x: 145, y: 140, w: 330, h: 425 };
const MARK_PAD = 1.1;
const MARK_SS = 4;

async function cropMark(page, size) {
  const src = `data:image/jpeg;base64,${readFileSync(LOCKUP).toString('base64')}`;
  const dataUrl = await page.evaluate(
    async ({ src, box, size, pad, ss, gold, ink }) => {
      const img = new Image();
      img.src = src;
      await img.decode();

      const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const G = rgb(gold);
      const I = rgb(ink);

      const big = size * ss;
      const s = Math.max(box.w, box.h) * pad;
      const c = document.createElement('canvas');
      c.width = c.height = big;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, box.x - (s - box.w) / 2, box.y - (s - box.h) / 2, s, s, 0, 0, big, big);

      const d = g.getImageData(0, 0, big, big);
      const px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], gr = px[i + 1], bl = px[i + 2];
        const isGold = r > 140 && gr > 105 && bl < 140 && r - bl > 60 && gr - bl > 25;
        const [cr, cg, cb] = isGold ? G : I;
        px[i] = cr;
        px[i + 1] = cg;
        px[i + 2] = cb;
        px[i + 3] = 255;
      }
      g.putImageData(d, 0, 0);

      const o = document.createElement('canvas');
      o.width = o.height = size;
      const og = o.getContext('2d');
      og.imageSmoothingQuality = 'high';
      og.drawImage(c, 0, 0, size, size);
      return o.toDataURL('image/png');
    },
    { src, box: MARK_BOX, size, pad: MARK_PAD, ss: MARK_SS, gold: GOLD, ink: CHARCOAL },
  );
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

const RASTER = [
  { from: 'icon-192.svg', to: 'icon-192.png', size: 192 },
  { from: 'icon-512.svg', to: 'icon-512.png', size: 512 },
  { from: 'maskable-512.svg', to: 'maskable-512.png', size: 512 },
  // iOS reads this one and only this one. 180 is the size it asks for.
  { from: 'icon-512.svg', to: 'apple-touch-icon.png', size: 180 },
  // Cropped from the lockup rather than rasterised from an SVG — see above.
  { from: LOCKUP, to: 'favicon-32.png', size: 32, crop: true },
];

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
    for (const { from, to, size, crop } of RASTER) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });

      if (crop) {
        writeFileSync(resolve(OUT, to), await cropMark(page, size));
        await page.close();
        console.log(`  wrote icons/${to}  (${size}px, cropped from ${relative(ROOT, from)})`);
        continue;
      }

      const svg = readFileSync(resolve(OUT, from), 'utf8');
      /* The SVG is inlined into a page sized exactly to the icon, with
         no margin and a transparent ground, so the raster is the artwork
         and nothing else. `omitBackground` keeps the favicon's
         transparency — a 32px charcoal mark on an opaque white square is
         a white square in a dark browser theme. */
      await page.setContent(
        `<!doctype html><meta charset="utf-8">` +
          `<style>html,body{margin:0;padding:0;background:transparent}` +
          `svg{display:block;width:${size}px;height:${size}px}</style>` +
          svg
      );
      await page.screenshot({ path: resolve(OUT, to), omitBackground: true });
      await page.close();
      console.log(`  wrote icons/${to}  (${size}px, rasterised from ${from})`);
    }
  } finally {
    await browser.close();
  }
} else {
  const missing = RASTER.filter(({ to }) => !existsSync(resolve(OUT, to))).map((r) => r.to);
  if (missing.length > 0) {
    console.error(
      `\nFATAL: ${missing.length} raster icon(s) missing and no browser to draw them:\n` +
        missing.map((m) => `  · icons/${m}`).join('\n') +
        `\n\n  These are committed to the repository. Regenerate them on a machine\n` +
        `  with Playwright's Chromium and commit the result:\n\n` +
        `      npx playwright install chromium && npm run icons\n\n` +
        `  Do not ship without them: an SVG-only manifest is not installable —\n` +
        `  iOS substitutes a screenshot of the page for the touch icon.`
    );
    process.exit(1);
  }
  for (const { to } of RASTER) console.log(`  verified icons/${to} (committed)`);
}

const drawn = Object.keys(FILES).length + RASTER.filter((r) => !r.crop).length;
const cropped = RASTER.filter((r) => r.crop).length;
console.log(
  `\n${drawn + cropped} icons: ${drawn} drawn from Logo.js geometry, ` +
    `${cropped} cropped from docs/brand/lockup-wide.jpg.`,
);
