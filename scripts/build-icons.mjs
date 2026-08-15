#!/usr/bin/env node
/* ============================================================
   Icon suite, generated from ONE geometry source.

   docs/04-BRAND.md says "never hand-edit a generated icon — change the
   path and regenerate", which was a claim about a generator that did
   not exist. This is it.

   Everything below reads the path constants out of
   apps/web/src/components/Logo.js by parsing the module rather than by
   copying the strings, so the favicon cannot disagree with the header
   mark. Two sources of a logo's geometry means two logos, eventually.

   SVG ONLY, and that is a documented limitation rather than an
   oversight. Rasterising to PNG needs a browser or an image library, and
   this project is not adding a 200-package dependency to produce six
   files. Chrome and Android
   accept SVG icons in a manifest. iOS home-screen icons do not, so an
   iPhone user who installs this gets the default screenshot tile —
   recorded in docs/05-SWITCHES.md with what to do about it.
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

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
 * can crop to the outer 20%, so the artwork sits at 58% of the canvas
 * inside the 80% safe circle. An icon that fills its canvas is an icon
 * with its shoulders cut off on a Pixel.
 */
function icon({ size, background, ink, accent, safeZone = false, colour = false }) {
  /* 0.65 rather than 0.58 for the maskable, and the number is measured
     rather than eyeballed. The mask crops to the outer 20%, leaving a
     safe circle of 0.8 x 512 = 409.6px. The artwork is 112x132 units,
     so at scale s its DIAGONAL is sqrt((112s)^2 + (132s)^2) = 173s, and
     that diagonal is what has to fit the circle rather than either
     edge. At 0.58 the diagonal came to 367px against 409.6 available —
     a tile with visible slack on every side, which on a launcher reads
     as a small logo floating in a dark square while the apps beside it
     fill theirs.

     0.63 puts the diagonal at 399px, which fits with 10px to spare.
     0.65 puts it at 412px, which OVERFLOWS by two and would have the
     shield's corners shaved off on a circular mask — the exact failure
     the safe zone exists to prevent, arrived at by rounding up. So the
     number is 0.63 and it is the largest one that fits. */
  const scale = (safeZone ? 0.63 : 0.76) * (size / 140);
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
  const detail = size * (safeZone ? 0.58 : 0.76) >= DETAIL_MIN_HEIGHT;

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

/* =====================================================================
   THE BROWSER TAB IS NOT A SMALL VERSION OF THE LOGO.

   The favicon was rendered by icon() above, at the reduced detail set —
   which was the right instinct and the wrong output, because the
   reduction it applies still draws the shield as an OUTLINE. At 32px
   that 5-unit stroke scales to 0.87px; at the 16px a browser tab
   actually renders, it is 0.43px. A sub-pixel stroke does not draw a
   thin line, it draws a grey smudge — so the shape that carries the
   whole identity was the first thing to disappear.

   AND IT WAS INVISIBLE ON HALF THE BROWSERS IN USE. The ground was
   `none` and the ink was charcoal, so on a dark tab bar the mark was
   near-black on near-black. The rasteriser records the reasoning: it
   keeps transparency because "a 32px charcoal mark on an opaque white
   square is a white square in a dark browser theme". That is true, and
   transparency solves it by making the mark vanish instead. Both
   failures have one fix, and it is not transparency: an OPAQUE ground
   in the brand's own dark, carrying the mark in gold. That reads on a
   white tab bar and on a black one, because it brings its own contrast
   rather than borrowing the browser's.

   SO THE TAB GETS A SILHOUETTE. Filled, not stroked — a fill has no
   width to lose. No crane, no crest, no aircraft: at 16px there are
   about 256 pixels to spend and a bird with a beak, an eye and two legs
   spends them all on noise. What survives is the shield's proportion
   and the gold-on-charcoal pairing, which is enough to find in a row of
   twenty tabs, and that is the entire job of a favicon.

   The other four icons are unchanged. A home-screen tile is rendered at
   192px and up, is seen alone rather than in a row, and is the one
   place the full mark should be drawn.
   ===================================================================== */
function silhouette({ size, background, mark }) {
  /* The shield occupies x 4..116, y 4..136 of the 120x140 artboard. */
  const ART_X = 4;
  const ART_Y = 4;
  const ART_W = 112;
  const ART_H = 132;

  /* 86% of the canvas. Full bleed would clip the shield's shoulders
     against the tab's own rounding on some browsers, and much less than
     this wastes the pixels the whole exercise is about. */
  const scale = (size * 0.86) / ART_H;
  const dx = (size - ART_W * scale) / 2 - ART_X * scale;
  const dy = (size - ART_H * scale) / 2 - ART_Y * scale;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${background}"/>
  <g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${scale.toFixed(4)})">
    <path d="${SHIELD}" fill="${mark}"/>
  </g>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });

const FILES = {
  // Browser tab. A SILHOUETTE, not a reduction of the logo — see the
  // note above silhouette(): an outline loses its stroke to sub-pixel
  // rounding at tab size, and a transparent ground loses the mark
  // itself on a dark tab bar.
  'favicon.svg': silhouette({ size: 32, background: CHARCOAL, mark: GOLD }),
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

/* ============================================================
   PNG, because an SVG-only manifest is not an installable app.

   This shipped with SVG icons alone, which looks tidy and is not
   installable in the two places that matter:

     · iOS ignores an SVG apple-touch-icon completely. Add to Home
       Screen produces a screenshot of the page as the icon — the app
       arrives on someone's home screen looking like a bookmark of a
       half-rendered form.
     · Chrome's install criteria want a raster icon at 192 and 512, and
       a maskable one to avoid the white circle that Android draws
       around anything it cannot mask.

   Rasterised with Playwright rather than by adding sharp or canvas:
   Playwright is already a devDependency because the smoke suite drives
   a real browser, and the browser that renders the app is the correct
   authority on what its own SVG looks like. No new dependency, and no
   second renderer to disagree with the first.
   ============================================================ */
const RASTER = [
  { from: 'icon-192.svg', to: 'icon-192.png', size: 192 },
  { from: 'icon-512.svg', to: 'icon-512.png', size: 512 },
  { from: 'maskable-512.svg', to: 'maskable-512.png', size: 512 },
  // iOS reads this one and only this one. 180 is the size it asks for.
  { from: 'icon-512.svg', to: 'apple-touch-icon.png', size: 180 },
  { from: 'favicon.svg', to: 'favicon-32.png', size: 32 },
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
    for (const { from, to, size } of RASTER) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
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

const total = Object.keys(FILES).length + RASTER.length;
console.log(`\n${total} icons generated from Logo.js geometry.`);
