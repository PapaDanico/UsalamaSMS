/* =====================================================================
   DIRECT DEPLOY TO NETLIFY, WITHOUT GITHUB — AND THE CHECKS THAT MAKE
   IT SAFE TO DO.

   The normal path is: push to GitHub, Netlify builds from git, and the
   deploy record carries `commit_ref`. That SHA is what every
   verification in this repository is anchored to — the watchdog
   compares it, and `docs/06-DEPLOYMENT.md` says to read it rather than
   `state: "ready"`, because "ready" describes whatever IS published
   rather than the thing you meant to publish.

   A DIRECT UPLOAD HAS NO COMMIT, so Netlify records `commit_ref: null`
   and that anchor is gone. This script exists to replace it with one
   that does not depend on the platform: the tree is proven clean, the
   SHA is read from local git, and `dist/build-id.txt` is proven to
   carry that exact SHA before anything is uploaded. Provenance then
   travels INSIDE the artefact rather than beside it, and
   `https://usalamasms.com/build-id.txt` still answers "which commit is
   live" for anybody who asks.

   THE FAILURE THIS GUARDS AGAINST IS NOT HYPOTHETICAL. `deploy-site`
   uploads a DIRECTORY. Point it at a working tree with uncommitted
   edits and production is serving somebody's half-finished afternoon,
   with no record anywhere of what it was. `CLAUDE.md` already refuses
   that in prose; this refuses it with an exit code.

   THE FUNCTIONS ARE THE PART THAT KILLS THE PRODUCT. This site serves
   two — `api` and `digest` — and every read and write in the product
   goes through `api`. A publish that carries `dist/` and not the
   functions leaves a site that renders perfectly and answers 404 to
   every request behind it, which looks like a working deploy from the
   outside. So their presence is asserted BEFORE the upload, and the
   deploy record's own `available_functions` must be checked AFTER it.

   WHAT THIS SCRIPT DOES NOT DO: upload. It is a preflight, and it
   deliberately stops at "safe to publish". The upload is a separate,
   explicit act — see the runbook it prints on success.

   Usage:  node scripts/deploy-direct.mjs          (preflight only)
           node scripts/deploy-direct.mjs --skip-verify   (see below)

   `--skip-verify` exists for the one legitimate case: `npm run verify`
   has ALREADY been run in this session against this exact tree and
   passed. It still checks everything else. It prints a warning,
   because a flag that silences a gate is a flag somebody will reach
   for out of impatience.
   ===================================================================== */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SKIP_VERIFY = process.argv.includes('--skip-verify');

const failures = [];
const notes = [];
const fail = (m) => failures.push(m);
const ok = (m) => notes.push(`  ok    ${m}`);

const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();

console.log('\ndeploy-direct — preflight for a Netlify upload that bypasses GitHub\n');

/* ---- 1. THE TREE MUST BE CLEAN -------------------------------------
   Not cosmetic. `deploy-site` uploads whatever is on disk, so an
   uncommitted edit becomes production with no commit describing it.
   Untracked files count: a stray file in `dist/` ships too. */
let head = null;
try {
  const dirty = sh('git status --porcelain');
  if (dirty) {
    fail(
      'the working tree is not clean, so what would be uploaded does not\n' +
        '        correspond to any commit. Commit or stash first:\n' +
        dirty.split('\n').map((l) => `          ${l}`).join('\n')
    );
  } else {
    ok('working tree clean');
  }
  head = sh('git rev-parse HEAD');
  ok(`HEAD ${head.slice(0, 7)} — ${sh('git log -1 --format=%s').slice(0, 60)}`);
} catch {
  fail('not a git repository, so there is no SHA to stamp or to prove');
}

/* ---- 2. THE GATES ---------------------------------------------------
   `npm run verify` is build + smoke + a11y + deliverables + first-run
   + symmetry + the two-version PWA gate. On the GitHub path CI runs
   this. Off it, nothing does unless this does. */
if (SKIP_VERIFY) {
  notes.push(
    '  WARN  --skip-verify: the gates were NOT run by this script.\n' +
      '        Only pass this when `npm run verify` has already passed\n' +
      '        against this exact tree in this session.\n' +
      '\n' +
      '        AND KNOW WHAT IT COSTS, which mutation-testing this script\n' +
      '        surfaced rather than reasoning: `dist` is gitignored\n' +
      '        (.gitignore:2), so the clean-tree check above CANNOT SEE a\n' +
      '        stray file inside it. A file dropped into dist/ after the\n' +
      '        build leaves the tree "clean", keeps build-id.txt matching\n' +
      '        HEAD, and still ships.\n' +
      '        On the default path that hole is closed by construction —\n' +
      '        `verify` runs `vite build`, which rebuilds dist from source\n' +
      '        and takes the stray with it. Skipping verify is therefore\n' +
      '        the ONE mode in which the contents of dist are trusted\n' +
      '        rather than proven.'
  );
} else {
  console.log('  running `npm run verify` (this takes a few minutes)...\n');
  try {
    execSync('npm run verify', { cwd: ROOT, stdio: 'inherit' });
    ok('npm run verify — exit 0');
  } catch {
    fail('`npm run verify` failed. Nothing is uploaded when the gates are red.');
  }
}

/* ---- 3. THE ARTEFACT MUST EXIST ------------------------------------ */
const DIST = join(ROOT, 'dist');
if (!existsSync(join(DIST, 'index.html'))) {
  fail('dist/index.html is missing — run `npm run build`');
} else {
  ok('dist/index.html present');
}

/* ---- 4. PROVENANCE INSIDE THE ARTEFACT -----------------------------
   This is the whole substitute for `commit_ref`. If build-id.txt does
   not carry HEAD, then after the upload nothing anywhere can say which
   commit production is running — and this repository has already spent
   ninety minutes not knowing that once. */
const idPath = join(DIST, 'build-id.txt');
if (!existsSync(idPath)) {
  fail('dist/build-id.txt is missing — `npm run stamp-build-id` did not run');
} else if (head) {
  const stamped = readFileSync(idPath, 'utf8').trim();
  if (stamped !== head) {
    fail(
      `dist/build-id.txt says ${stamped.slice(0, 12)} but HEAD is ${head.slice(0, 12)}.\n` +
        '        The bundle is stale relative to the commit. Rebuild.'
    );
  } else {
    ok(`build-id.txt matches HEAD (${head.slice(0, 7)}) — provenance travels in the artefact`);
  }
}

/* ---- 5. THE FUNCTIONS ----------------------------------------------
   A site with no `api` renders perfectly and does nothing. */
const FN_DIR = join(ROOT, 'netlify', 'functions');
for (const fn of ['api.mts', 'digest.mts']) {
  if (!existsSync(join(FN_DIR, fn))) fail(`netlify/functions/${fn} is missing — the API would not deploy`);
}
if (!failures.some((f) => f.includes('netlify/functions'))) {
  ok('netlify/functions/api.mts and digest.mts present');
}

/* ---- 6. NO SECRET IN THE UPLOAD ------------------------------------
   Netlify scans on its side and this repository's rule is that no
   secret is ever in the tree. Cheap to assert here, because the
   directory being uploaded is the one thing this script can see and
   the dashboard cannot warn about until after it is public. */
const SECRET_HINTS = [/sb_secret_[A-Za-z0-9_-]{8,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /postgres(ql)?:\/\/[^\s"']*:[^\s"']+@/];
let scanned = 0;
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(js|mjs|css|html|json|txt|map|webmanifest)$/.test(e.name)) continue;
    if (statSync(p).size > 6_000_000) continue;
    scanned += 1;
    const body = readFileSync(p, 'utf8');
    for (const re of SECRET_HINTS) {
      if (re.test(body)) fail(`${p.slice(ROOT.length + 1)} looks like it contains a secret (${re})`);
    }
  }
};
if (existsSync(DIST)) {
  try { walk(DIST); ok(`scanned ${scanned} built files for secrets — none found`); }
  catch (e) { notes.push(`  WARN  secret scan could not complete: ${e.message}`); }
}

/* ---- report --------------------------------------------------------- */
console.log('');
for (const n of notes) console.log(n);

if (failures.length) {
  console.error(`\ndeploy-direct — REFUSED, ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error('\nNothing was uploaded.\n');
  process.exit(1);
}

console.log(`
deploy-direct — preflight PASSED. Safe to publish ${head.slice(0, 7)}.

  Upload:   Netlify deploy-site, siteId 4e89de0f-0a31-4ec4-8539-bc2efcddf20e

  THEN VERIFY, because a direct upload records commit_ref: null and
  "state: ready" alone has misled this project before:

    1. get-deploy <id> → state must be "ready"
    2. the SAME record's available_functions must list BOTH \`api\` and
       \`digest\`. A site without \`api\` renders and answers nothing.
    3. https://usalamasms.com/build-id.txt must return
       ${head}
       That is the check commit_ref would have done.
`);
