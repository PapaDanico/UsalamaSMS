#!/usr/bin/env node
/* ============================================================
   Every character the product can put on screen must be one the
   shipped face can draw.

   WHY THIS EXISTS, and it is a fresh scar rather than a precaution. The
   safety performance indicator screen labelled its alert bands "beyond
   1σ", "beyond 2σ", "beyond 3σ". Greek sigma is outside both unicode
   ranges DM Sans ships here — latin and latin-ext — so the browser drew
   two characters in the house face and the third in whatever the system
   had, in the middle of a label, on the screen whose own comment says
   the subset split exists to stop exactly that. It was found in a
   screenshot, by eye, which is not a repeatable process.

   The failure mode is the stylesheet's: silence. Font fallback is
   designed to be invisible. The glyph appears, it is the right glyph,
   it is legible, and nothing in a headless run notices that it arrived
   from a different family with different metrics and a different
   weight. A missing glyph would be a box and somebody would file it; a
   substituted one just quietly degrades every label that carries it.

   HOW IT WORKS. The ranges are read from fonts.css rather than
   restated, so subsetting the font differently moves this gate with it
   — charter rule 10 applied to a coverage table instead of a count. The
   sources are scanned for STRING AND TEMPLATE LITERAL contents only,
   because that is what can reach a screen; comments are free to use
   whatever notation reads best to the person editing them, and the one
   on the SPI screen explaining why sigma is gone uses a sigma.

   WHAT TO DO WHEN IT FAILS. Almost always: write the word. "SD" rather
   than σ, "->"" rather than an arrow. The alternative — adding a subset
   — is a real option and costs a file on every load that needs it, so
   it is a decision rather than a reflex.
   ============================================================ */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FONTS = 'apps/web/src/fonts.css';
const ROOTS = ['apps/web/src', 'packages/shared/src'];

/* ---------- the ranges the face actually ships ---------- */

const fontsCss = readFileSync(FONTS, 'utf8');
const ranges = [];
for (const decl of fontsCss.matchAll(/unicode-range:\s*([^;]+);/g)) {
  for (const part of decl[1].split(',')) {
    const m = /U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?/.exec(part.trim());
    if (!m) continue;
    const lo = parseInt(m[1], 16);
    ranges.push([lo, m[2] ? parseInt(m[2], 16) : lo]);
  }
}

if (ranges.length === 0) {
  console.error(
    `\ncheck:glyphs FAILED — no unicode-range found in ${FONTS}.\n\n` +
      'This gate reads its coverage from the @font-face declarations. With none\n' +
      'to read it would pass everything, which is worse than not existing —\n' +
      'charter rule 11: a check that stops checking must fail.'
  );
  process.exit(1);
}

const covered = (cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

/* ---------- what can reach a screen ---------- */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|ts|html)$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * String and template literal contents, with comments skipped.
 *
 * A regex cannot do this: `// see https://x` inside a string and a `/*`
 * inside a template are both ordinary text, and stripping them by
 * pattern silently removes real content — which would make this gate
 * pass by not looking, the failure it is written to avoid. So it is a
 * character walk with four states, which is short and cannot be fooled.
 */
function literals(src) {
  const found = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line += 1;
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      const startLine = line;
      let buf = '';
      i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') {
          buf += src[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (src[i] === '\n') line += 1;
        buf += src[i];
        i += 1;
      }
      i += 1;
      found.push({ text: buf, line: startLine });
      continue;
    }
    i += 1;
  }
  return found;
}

/** HTML is text by default, so all of it counts but its comments. */
function htmlText(src) {
  const found = [];
  let line = 1;
  const stripped = src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  for (const raw of stripped.split('\n')) {
    found.push({ text: raw, line });
    line += 1;
  }
  return found;
}

/* ---------- the sweep ---------- */

const offenders = new Map();
let scanned = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    scanned += 1;
    const chunks = file.endsWith('.html') ? htmlText(src) : literals(src);
    for (const { text, line } of chunks) {
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (covered(cp)) continue;
        const key = ch;
        if (!offenders.has(key)) offenders.set(key, []);
        const sites = offenders.get(key);
        if (sites.length < 6) sites.push(`${file}:${line}`);
      }
    }
  }
}

if (offenders.size === 0) {
  console.log(
    `check:glyphs — ${scanned} sources scanned, every character on a customer ` +
      `surface is inside the ${ranges.length} ranges the face ships.`
  );
  process.exit(0);
}

console.error('');
for (const [ch, sites] of offenders) {
  const cp = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
  console.error(`  "${ch}"  U+${cp} — not in any shipped subset`);
  for (const site of sites) console.error(`        ${site}`);
}
console.error(
  `\ncheck:glyphs FAILED — ${offenders.size} character${offenders.size === 1 ? '' : 's'} ` +
    'the shipped face cannot draw.\n\n' +
    'Each one renders in the system fallback, mid-word, with different metrics\n' +
    'and a different weight — and it looks fine in a screenshot, which is how\n' +
    'the sigma on the indicator screen survived. Write the word instead, or\n' +
    `add the subset to ${FONTS} deliberately and pay for the extra file.`
);
process.exit(1);
