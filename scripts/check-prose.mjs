#!/usr/bin/env node
/* =====================================================================
   AN HTML COMMENT INSIDE A TEMPLATE LITERAL IS NOT A COMMENT.

   Every screen in apps/web/src renders through a tagged template
   literal. Text between `<!--` and `-->` inside one of those is STRING
   CONTENT: the minifier cannot remove it, the bundler cannot remove it,
   and it is downloaded by a reporter at a remote strip along with the
   code. It looks like a comment in the editor and behaves like a
   paragraph on the wire.

   This gate holds two separate things, because the same construct has
   caused two different kinds of harm in this repository.

   ---------------------------------------------------------------
   1. A BACKTICK IN ONE OF THEM BREAKS THE BUILD, SILENTLY AND LATE.

   The literal ends at the backtick, and the rest of the line parses as
   JavaScript. Quoting a class name the way prose normally would —

       <!-- `.sms-scheme` is the existing rule -->

   — compiles to `html\`…\`.sms - scheme`, a subtraction against an
   undeclared identifier. It builds. It typechecks. It fails at RUNTIME
   as `scheme is not defined`, which is a message about the page, not
   about the comment, so the search starts in the wrong place.

   apps/web/src/tools/pricing/index.js shipped that exact defect to
   three smoke checks, and it was the THIRD time that file had been
   broken by a backtick inside an HTML comment. Twice is a mistake;
   three times is a missing gate. This is the gate.

   The smoke suite does catch it — the page-error check goes red. It
   catches it after a full build, a browser launch and twenty-one
   screens, and reports it as a symptom. This runs in milliseconds and
   names the file, the line and the construct.

   ---------------------------------------------------------------
   2. THE PROSE IS WEIGHT, AND WEIGHT ON THE WRONG PERSON.

   The comments explaining the pricing page to a developer cost about
   2 KB, and they pushed the TOTAL bundle over its budget — which is how
   anybody noticed. Moving them above the import, where they are real
   JavaScript comments and the minifier strips them, gave 2.7 KB back
   and lost nothing: the note is more readable at the top of the file
   than interleaved with the markup it describes.

   So the remaining weight is capped. The ceiling is not a target to
   grow into; it ratchets DOWN as files are cleaned, the same way the
   bundle budgets do, and raising it needs the same kind of receipt.

   WHAT THIS GATE DOES NOT DO is ban the construct. A short marker
   inside dense markup — a form, a table — genuinely helps somebody
   reading the template, and forbidding it outright would push people
   toward worse markup rather than shorter comments. The ceiling makes
   the cost visible and lets the author decide; the backtick rule is
   absolute, because there is no version of that which is correct.
   ===================================================================== */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'apps/web/src');

/* MEASURED, NOT CHOSEN, and it ratchets.

   19.5 when this gate landed, against 19.2 KB actually shipped after
   the pricing page was cleared. 13.0 after twelve notes came out of the
   triage template. 5.0 now, against 4.7: the report form, the maturity
   assessment, the register and the sign-in screen followed, and between
   them they paid for a whole new screen — the dashboard went in and the
   TOTAL bundle came DOWN, while the entry chunk gained five kilobytes
   of headroom it has not had in months.

   That is the argument for the ratchet in one line. Each raise would
   have been defensible on its own; the cumulative 15 KB was not, and
   nobody would have found it without a number that only moves one way.

   It sits a little above what the tree ships, so a genuine one-line
   marker does not fail a build and a paragraph does. */
const CEILING_KB = 5.0;

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.js')) files.push(path);
  }
})(SRC);
files.sort();

let bytes = 0;
let count = 0;
const offences = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/<!--[\s\S]*?-->/g)) {
    bytes += match[0].length;
    count += 1;
    if (!match[0].includes('`')) continue;
    /* The line number of the BACKTICK, not of the comment. On a
       twelve-line comment those are different, and the first is the one
       somebody has to edit. */
    const at = match.index + match[0].indexOf('`');
    offences.push({
      file: relative(ROOT, file),
      line: source.slice(0, at).split('\n').length,
    });
  }
}

const kb = bytes / 1024;
let failed = false;

if (offences.length) {
  failed = true;
  console.error('\nA BACKTICK INSIDE AN HTML COMMENT ENDS THE TEMPLATE LITERAL.\n');
  for (const o of offences) console.error(`  ${o.file}:${o.line}`);
  console.error(
    '\nThe markup after it parses as JavaScript, so the page fails at runtime\n' +
      'with a message about an undefined identifier rather than about the comment.\n' +
      'Move the note above the import, where it is a real comment and the\n' +
      'minifier strips it, or drop the backticks.',
  );
} else {
  console.log(`  prose ok         no backticks in ${count} HTML comments under apps/web/src`);
}

if (kb > CEILING_KB) {
  failed = true;
  console.error(
    `\nPROSE BUDGET EXCEEDED  ${kb.toFixed(1)} KB against a ${CEILING_KB} KB ceiling.\n\n` +
      'HTML comments inside a template literal are string content: they are\n' +
      'downloaded by every reporter who opens the screen. Move the note above\n' +
      'the import — it reads better there and costs nothing — or raise the\n' +
      'ceiling in scripts/check-prose.mjs deliberately, with a note saying what\n' +
      'the reader gets for the weight.',
  );
} else {
  console.log(`  prose ok         ${kb.toFixed(1)} KB of ${CEILING_KB} KB shipped as HTML comments`);
}

if (failed) process.exit(1);
console.log(`\ncheck:prose passed — ${count} comments across ${files.length} screens.`);
