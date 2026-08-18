/* =====================================================================
   WHICH COMMIT IS ACTUALLY SERVED, answerable from outside.

   A FAILED DEPLOY IS SILENT, and that is the whole reason this file
   exists. Netlify's deploys are atomic: when a build fails the last
   good one keeps serving, so the site looks perfectly healthy while
   merges quietly stop landing. On 18 August 2026 production served a
   commit two merges old for ninety minutes while CI was green on every
   one of them, and the only reason anybody noticed is that somebody
   happened to be watching a pull request.

   Netlify can email on a failed deploy. That is a dashboard toggle, no
   API reaches it, and a control that depends on somebody remembering
   to switch it on is not a control. This is the version that lives in
   the repository and cannot be forgotten.

   WHY NOT THE SERVICE WORKER'S BUILD ID. `stamp-sw.mjs` already stamps
   one, and it is a hash of the ASSET LIST — content, not provenance.
   Two commits whose output is byte-identical stamp identically, which
   is correct for cache invalidation and useless for "is the commit I
   merged the one being served". A documentation-only change is exactly
   the case that would defeat it, and this repository ships those.

   So the commit ref is written verbatim, from Netlify's own COMMIT_REF.

   IT MUST NOT BE PRECACHED. The service worker's manifest is built in
   stamp-sw.mjs, and this file is written afterwards for the same
   reason prerender.mjs runs afterwards: a precached build id is the
   first version a browser ever saw, frozen, which would make the
   watchdog assert that the deploy of six weeks ago is still live.
   ===================================================================== */
import { writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

if (!existsSync(DIST)) {
  console.error('FATAL: dist/ does not exist — stamp-build-id runs after the build.');
  process.exit(1);
}

/* Netlify sets COMMIT_REF in the build environment. Locally there is
   no such thing, so git answers instead, and a checkout with no git at
   all says so rather than inventing a value — an id of "unknown" that
   the watchdog can never match is honest; a fabricated one is not. */
function commitRef() {
  const fromCI = process.env.COMMIT_REF?.trim();
  if (fromCI) return fromCI;
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const ref = commitRef();
writeFileSync(resolve(DIST, 'build-id.txt'), `${ref}\n`, 'utf8');
console.log(`  build id         ${ref}${process.env.COMMIT_REF ? '' : ' (from git, not COMMIT_REF)'}`);
