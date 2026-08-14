#!/usr/bin/env node
/* ============================================================
   Every class the markup emits must resolve to at least one rule.

   WHY THIS EXISTS. The design system was ported from a sibling site by
   dropping the rules for pages this app does not render, and the tool
   that dropped them worked from the class names THAT site's HTML uses.
   Twenty-four classes only this app emits therefore read as dead and
   went with them — among them `.wrap`, the page container, which is why
   the account screen shipped with its heading flush against the left
   edge and its lede running off the right.

   Nothing in the suite could see it. Playwright asks for an element by
   selector and reads its text or its box; an unstyled element has both,
   and answers every question the smoke suite knows how to ask. A
   stylesheet is the one artefact in this repo whose failure mode is
   silence — the browser drops a rule it cannot parse, drops a class
   nobody defined, and renders something that is merely wrong.

   Charter rule 11: a check that stops checking must fail. This one was
   watched failing before it was believed — run against the tree that
   shipped the pruned sheet it named all twenty-four, including .wrap.
   ============================================================ */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'apps/web/src';

/* Hooks, not styling. Each is a name the markup carries for a reason
   other than appearance, and each has to say which — an allowlist that
   accepts a name without a reason is how the next .wrap gets waved
   through. */
const HOOKS = new Map([
  [
    'print-id-slot',
    'A JS insertion point, not a visual. The four screens that render ' +
      'synchronously put an empty div here and attachPrintId() fills it once ' +
      'the operator name arrives; what lands inside is .print-id, which IS ' +
      'styled. Giving the slot itself a rule would put a box on the page in ' +
      'the interval before the fetch returns, and an empty box above a risk ' +
      'register is exactly the half-attributed header printId() refuses.',
  ],
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|ts|html)$/.test(p)) out.push(p);
  }
  return out;
}

/* What the markup emits. Two forms: a literal class attribute, and a
   classList call — both appear in this app, and a check that read only
   the first would miss every state class. */
function classesUsed(files) {
  const used = new Map(); // class -> first file that emits it
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/class\s*=\s*["'`]([^"'`]*)["'`]/g)) {
      for (const c of m[1].split(/\s+/)) {
        // Interpolated fragments (`class="${x}"`) cannot be resolved
        // statically and are not claimed to be.
        if (!c || c.includes('$') || c.includes('{')) continue;
        if (!used.has(c)) used.set(c, file);
      }
    }
    for (const m of src.matchAll(/classList\s*\.\s*(?:add|remove|toggle)\(([^)]*)\)/g)) {
      for (const s of m[1].matchAll(/['"]([\w-]+)['"]/g)) {
        if (!used.has(s[1])) used.set(s[1], file);
      }
    }
  }
  return used;
}

/* What the stylesheets define. The boot splash is styled inline in
   index.html — it has to paint before any stylesheet has loaded, which
   is the whole point of it — so that <style> counts as a sheet here. */
function classesDefined() {
  let css = readFileSync(join(SRC, 'style.css'), 'utf8');
  const html = readFileSync(join(SRC, 'index.html'), 'utf8');
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) css += '\n' + m[1];

  // Comments first. Prose in a comment contains things that look like
  // selectors ("e.g.", ".css") and a pruner that skipped this step is
  // what deleted the token block on an earlier pass.
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');

  const defined = new Set();
  for (const m of css.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) defined.add(m[1]);
  return defined;
}

/* ============================================================
   IT HAS TO PARSE, and a warning is not a guard.

   Removing one selector from a grouped rule left `.btn:hover,
   .card:hover,` dangling with a trailing comma and no block. CSS
   error recovery swallows everything up to the next brace, so the
   whole reduced-motion block was dropped from the bundle — somebody
   who asks their operating system for less motion kept getting the
   card lift and the button transform.

   The build DID say so. esbuild printed `Unexpected "}"` as a
   WARNING, on a line of a concatenated stdin that names no source
   file, in the middle of a successful build that exits 0. Nobody read
   it, including me, for several commits.

   So the parse result is a gate rather than a note. Charter rule 11:
   a check that stops checking must fail.
   ============================================================ */
async function mustParse() {
  /* esbuild's JS API, not `npx esbuild`.

     The first version spawned a subprocess, which added a PATH
     dependency and a package-resolution step to a gate whose whole job
     is to be reliable — and it read the wrong stream, so it could not
     fail at all until that was found. The API returns structured
     warnings, so there is nothing to regex out of stderr and nothing
     to resolve at run time. */
  const esbuild = await import('esbuild');
  const problems = [];

  for (const sheet of [join(SRC, 'style.css'), join(SRC, 'fonts.css')]) {
    const css = readFileSync(sheet, 'utf8');
    let result;
    try {
      result = await esbuild.transform(css, { loader: 'css', logLevel: 'silent' });
    } catch (error) {
      const detail = (error.errors ?? [])
        .map((e) => `${sheet}:${e.location?.line ?? '?'} ${e.text}`)
        .join('\n');
      problems.push(detail || `${sheet}: ${error.message}`);
      continue;
    }
    for (const warning of result.warnings ?? []) {
      problems.push(
        `${sheet}:${warning.location?.line ?? '?'}:${warning.location?.column ?? 0} ` +
          `${warning.text}\n    ${warning.location?.lineText?.trim() ?? ''}`
      );
    }
  }
  return problems;
}

const parseProblems = await mustParse();
if (parseProblems.length) {
  console.error('check:css FAILED — the stylesheet does not parse.\n');
  console.error(parseProblems.join('\n\n'));
  console.error(
    '\nCSS error recovery discards everything up to the next brace, so a rule ' +
      'that does not parse is a rule silently missing from the bundle.'
  );
  process.exit(1);
}

const files = walk(SRC);
const used = classesUsed(files);
const defined = classesDefined();

const missing = [];
for (const [cls, file] of used) {
  if (defined.has(cls)) continue;
  if (HOOKS.has(cls)) continue;
  missing.push({ cls, file });
}

const hookedButStyled = [...HOOKS.keys()].filter((c) => defined.has(c) && used.has(c));

if (missing.length === 0 && hookedButStyled.length === 0) {
  console.log(
    `check:css — ${used.size} classes emitted, all resolve to a rule ` +
      `(${HOOKS.size} declared hook${HOOKS.size === 1 ? '' : 's'}).`
  );
  process.exit(0);
}

for (const { cls, file } of missing) {
  console.error(`  .${cls} — emitted by ${file}, no rule defines it`);
}
for (const cls of hookedButStyled) {
  console.error(
    `  .${cls} — listed as a hook but a rule now styles it; drop it from HOOKS`
  );
}
console.error(
  `\ncheck:css FAILED — ${missing.length} class${missing.length === 1 ? '' : 'es'} ` +
    `emitted with no rule. Either style it or, if it is genuinely a hook, ` +
    `add it to HOOKS in this file with the reason.`
);
process.exit(1);
