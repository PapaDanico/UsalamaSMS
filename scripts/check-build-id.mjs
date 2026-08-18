/* =====================================================================
   THE WATCHDOG'S SUBJECT, GUARDED.

   .github/workflows/deploy-watchdog.yml polls
   https://usalamasms.com/build-id.txt after every push to main and
   reports three outcomes: the merged SHA is live, the old SHA is still
   live, or something else is being served. All three readings assume
   the file is there.

   NOTHING ASSERTED THAT IT WAS. `stamp-build-id` is the LAST step in
   `npm run build`, and `check:dist` — the gate that lists the assets a
   deploy must carry — runs three steps EARLIER, so the file does not
   exist yet when it looks. Measured rather than assumed:

     build: … vite build && stamp-sw && check:dist && prerender && stamp-build-id
                                        ^^^^^^^^^^                 ^^^^^^^^^^^^^^
                                        looks here                 writes here

   So the one thing the detector reads was the one thing no gate could
   see. Drop the step, or let it write nothing, and /build-id.txt 404s
   — at which point the watchdog reports "never answered in 15 minutes:
   that is an OUTAGE" on EVERY merge. A detector that cries wolf on a
   green deploy gets switched off within a week, and then the silence
   it was built to break is back and nobody is watching for it.

   That is the failure mode worth spending a file on: not the watchdog
   being wrong, but the watchdog being RIGHT-SOUNDING and wrong often
   enough to be disbelieved.

   IT ALSO ASSERTS THE ID IS NOT PRECACHED, which today is true by
   ORDERING rather than by exclusion — stamp-sw builds its manifest
   from dist before this file is written. Ordering is not a guarantee;
   somebody reshuffling the chain would freeze the build id into the
   first version a browser ever saw, which is the exact defect
   stamp-build-id.mjs's own header warns about and nothing enforced.
   ===================================================================== */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const idPath = resolve(ROOT, 'dist/build-id.txt');
if (!existsSync(idPath)) {
  problems.push(
    'dist/build-id.txt does not exist. The deploy watchdog polls it after every ' +
      'push to main and would report an OUTAGE on a perfectly good deploy. Either ' +
      'stamp-build-id has been dropped from `npm run build`, or it failed silently.'
  );
} else {
  const raw = readFileSync(idPath, 'utf8');
  const id = raw.trim();

  /* A commit ref, or the literal `unknown` that stamp-build-id writes
     where there is no COMMIT_REF and no git. `unknown` is a legitimate
     value — an id the watchdog can never match is honest — so it
     passes here and fails where it should, in the workflow. What must
     not pass is an EMPTY file or a line of something else, because
     both read as "served, and not the SHA you merged", which is the
     watchdog's third outcome and its most alarming one. */
  if (!/^[0-9a-f]{7,40}$|^unknown$/.test(id)) {
    problems.push(
      `dist/build-id.txt contains ${JSON.stringify(id.slice(0, 60))}, which is neither a ` +
        'commit ref nor the literal `unknown`. The watchdog would report that production ' +
        'is serving something else entirely.'
    );
  }
  if (raw.includes('\n') && !raw.endsWith('\n')) {
    problems.push('dist/build-id.txt has a line break that is not its trailing newline.');
  }
}

/* NOT PRECACHED. The service worker's manifest is a list of URLs the
   first load stores forever; a build id in it is frozen at whatever it
   was when that browser first arrived. */
const swPath = resolve(ROOT, 'dist/sw.js');
if (existsSync(swPath)) {
  if (/build-id/.test(readFileSync(swPath, 'utf8'))) {
    problems.push(
      'dist/sw.js references build-id.txt. It must not be precached: a stored build id ' +
        'is the first version that browser ever saw, frozen, and the watchdog would be ' +
        'reading a deploy from six weeks ago. Check stamp-build-id still runs AFTER stamp-sw.'
    );
  }
} else {
  problems.push('dist/sw.js does not exist, so this gate cannot check the precache manifest.');
}

if (problems.length) {
  console.error('\ncheck:build-id FAILED\n');
  for (const p of problems) console.error(`  ✗ ${p}\n`);
  process.exit(1);
}
console.log('  build-id ok      the watchdog has something to read, and it is not precached');
