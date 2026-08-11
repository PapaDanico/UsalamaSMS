#!/usr/bin/env node
/* ============================================================
   Icon suite, generated from ONE geometry source.

   docs/04-BRAND.md says "never hand-edit a generated icon — change the
   path and regenerate", which was a claim about a generator that did
   not exist. This is it.

   Everything below reads the path constants out of
   apps/web/src/components/Logo.js by parsing the module rather than by
   copying the strings, so the favicon cannot disagree with the header
   mark. Kanda's icon suite works the same way and for the same reason:
   two sources of a logo's geometry means two logos, eventually.

   SVG ONLY, and that is a documented limitation rather than an
   oversight. Rasterising to PNG needs a browser or an image library;
   Kanda already carries Playwright for pre-rendering so it gets PNGs
   nearly free, and this project carries neither and is not adding a
   200-package dependency to produce six files. Chrome and Android
   accept SVG icons in a manifest. iOS home-screen icons do not, so an
   iPhone user who installs this gets the default screenshot tile —
   recorded in docs/05-SWITCHES.md with what to do about it.
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

/* Brand values, read from the stylesheet rather than typed here — one
   source, and check-brand.mjs already guards them. */
const css = readFileSync(resolve(ROOT, 'apps/web/src/style.css'), 'utf8');
const token = (name) => {
  const m = new RegExp(`--${name}\\s*:\\s*(#[0-9a-f]{6})\\s*;`, 'i').exec(css);
  if (!m) throw new Error(`--${name} not found in style.css`);
  return m[1];
};

const GOLD = token('us-gold');
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
function icon({ size, background, ink, accent, safeZone = false }) {
  const scale = (safeZone ? 0.58 : 0.76) * (size / 140);
  const w = 120 * scale;
  const h = 140 * scale;
  const dx = (size - w) / 2;
  const dy = (size - h) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${background}"/>
  <g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${scale.toFixed(4)})">
    <path d="${SHIELD}" fill="none" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <g fill="${ink}">
      <path d="${CRANE_BODY}"/>
      <path d="${CRANE_NECK}"/>
      <path d="${CRANE_HEAD}"/>
    </g>
    <path d="${AIRCRAFT}" fill="${accent}"/>
  </g>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });

const FILES = {
  // Browser tab. No crest, no runway, no contrail — at 32px they turn
  // to mud and only the silhouette survives. Same threshold the in-app
  // mark applies, for the same measured reason.
  'favicon.svg': icon({ size: 32, background: 'none', ink: CHARCOAL, accent: GOLD }),
  'icon-192.svg': icon({ size: 192, background: SAND, ink: CHARCOAL, accent: GOLD }),
  'icon-512.svg': icon({ size: 512, background: SAND, ink: CHARCOAL, accent: GOLD }),
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

console.log(`\n${Object.keys(FILES).length} icons generated from Logo.js geometry.`);
