#!/usr/bin/env node
/* =====================================================================
   EVERY READ OF SafetyReport DECIDES ABOUT RETRACTION, OUT LOUD.

   A retraction is a tombstone: the row stays and stops counting. That
   only works if every query agrees, and the design note for this
   feature says exactly how it fails — "the way this goes wrong is one
   query somebody forgets". A forgotten exclusion does not throw, does
   not fail a type check and does not look wrong in review. It shows a
   withdrawn duplicate in the triage queue, or counts it in the
   reporting rate an operator is measured on, and nothing says so.

   So this gate reads every `prisma.safetyReport.<read>` call in the API
   and requires each one to say which it is:

     · `retractedAt` in the WHERE — it excludes tombstones;
     · `RETRACTION-INCLUDES-DELIBERATELY` in a comment on the call — it
       includes them ON PURPOSE, and the export is the reason that
       escape exists.

   THE EXPORT IS WHY THE SECOND OPTION IS NOT A LOOPHOLE. Every other
   read path answers "what needs doing", and a withdrawn duplicate needs
   nothing. The export answers "what is on the record" and is handed to
   an authority. If it hid retracted reports, retraction would become a
   way to remove an inconvenient occurrence from what the regulator
   sees — the single thing this feature must not be. So including them
   is correct there and the gate must permit it; what it must not
   permit is doing so silently.

   ---------------------------------------------------------------
   WHY A TEXT SCAN RATHER THAN A TYPE.

   A branded `where` type would be better and was tried: the eight
   collections in the export share one clause across models that have no
   retractedAt column, so the type has to be per-model, and the
   per-model version is satisfied by spreading a helper — which is
   exactly the line somebody deletes when a query needs a different
   scope. The check that survives that edit is the one that reads what
   the call actually says.

   MUTATION-CHECK THIS by deleting `retractedAt: null` from any one
   query and confirming this names that file and line.
   ===================================================================== */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = resolve(ROOT, 'apps/api/src');

/* The reads. `findUnique` and `findFirst` by id are deliberately NOT
   here: fetching one known row to act on it is not a list, and a
   retraction route that could not read a retracted row could not report
   that it was already retracted. */
const READS = ['findMany', 'count', 'groupBy', 'aggregate'];

const OPT_OUT = 'RETRACTION-INCLUDES-DELIBERATELY';

/* How far back to look for the opt-out marker. A comment sits directly
   above the call it describes; twenty lines is generous enough for a
   paragraph and short enough that an unrelated marker elsewhere in the
   file cannot license a query. */
const MARKER_LOOKBACK = 20;

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (path.endsWith('.ts')) files.push(path);
  }
})(API);
files.sort();

const offences = [];
let checked = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');

  for (const read of READS) {
    const needle = `safetyReport.${read}(`;
    let from = 0;
    for (;;) {
      const at = source.indexOf(needle, from);
      if (at === -1) break;
      from = at + needle.length;
      checked += 1;

      /* The call's own text, to its closing paren. Balanced rather than
         a fixed window: these calls carry nested objects and a
         line-count heuristic would read into the next statement. */
      let depth = 0;
      let end = at + needle.length - 1;
      for (let i = end; i < source.length; i += 1) {
        if (source[i] === '(') depth += 1;
        else if (source[i] === ')') {
          depth -= 1;
          if (depth === 0) { end = i; break; }
        }
      }
      const call = source.slice(at, end + 1);
      const line = source.slice(0, at).split('\n').length;

      if (call.includes('retractedAt')) continue;

      const above = lines.slice(Math.max(0, line - 1 - MARKER_LOOKBACK), line).join('\n');
      if (above.includes(OPT_OUT) || call.includes(OPT_OUT)) continue;

      /* A SHARED CLAUSE COUNTS, AND THE FIRST VERSION OF THIS GATE SAID
         IT DID NOT.

         The risk picture asks eight questions of this table and builds
         one `where` for all of them — which is the BETTER shape, because
         it makes forgetting require actively removing something. The
         gate read the call text, saw `where` rather than a literal, and
         reported two correct queries as offences.

         A gate that cries wolf on correct code is a gate somebody turns
         off, and this repository has recorded that twice about two other
         checks. So: when the clause is an identifier, resolve it to its
         declaration in the same file and read THAT. It is still a text
         scan, and it still cannot be satisfied by anything except the
         word appearing where the query is built. */
      /* THREE SHAPES REACH A CLAUSE and the first version handled one.
         `where: clause`, the shorthand `where,` that a variable of that
         name produces, and `where: { ...clause, more }` where the shared
         part is spread and narrowed. Missing the last two is how this
         gate reported the risk picture — which builds its clause
         correctly, once, for eight queries. */
      const candidates = new Set();
      for (const m of call.matchAll(/where:\s*([A-Za-z_$][\w$]*)\s*[,}]/g)) candidates.add(m[1]);
      for (const m of call.matchAll(/\.\.\.([A-Za-z_$][\w$]*)/g)) candidates.add(m[1]);
      if (/[{,]\s*where\s*[,}]/.test(call)) candidates.add('where');

      let resolved = false;
      for (const name of candidates) {
        const decl = new RegExp(
          `(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=([\\s\\S]{0,400}?);\\n`,
        ).exec(source);
        if (decl && decl[1].includes('retractedAt')) { resolved = true; break; }
      }
      if (resolved) continue;

      offences.push({ file: relative(ROOT, file), line, read });
    }
  }
}

if (checked === 0) {
  console.error('check:retraction — found no SafetyReport reads at all under apps/api/src.');
  console.error('A gate that finds nothing to check passes everything. Refusing to.');
  process.exit(1);
}

if (offences.length) {
  console.error('\nA READ OF SafetyReport DOES NOT SAY WHAT IT DOES ABOUT RETRACTION.\n');
  for (const o of offences) console.error(`  ${o.file}:${o.line}  (${o.read})`);
  console.error(
    '\nA retracted report is a tombstone: the row stays and stops counting.\n' +
      'Add `retractedAt: null` to the WHERE so this query excludes them — or, if\n' +
      `it genuinely should include them, say so with a ${OPT_OUT}\n` +
      'comment above the call and explain why. The export does; it is evidence\n' +
      'handed to an authority, and hiding a withdrawn report from a regulator is\n' +
      'the one thing this feature must never become.',
  );
  process.exit(1);
}

console.log(
  `  retraction ok    ${checked} SafetyReport reads, every one states its position on tombstones`,
);
