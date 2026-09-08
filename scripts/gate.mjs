#!/usr/bin/env node
/* =====================================================================
   EVERYTHING, IN ONE COMMAND, ON A MACHINE THAT IS NOT GITHUB'S.

   `npm run check` runs inside the Netlify build, so it is genuinely
   enforced. Nothing else in this repository is. Measured on 8 September
   2026, twenty days after GitHub Actions stopped executing steps:

     · the integration suite — 505 tests over a real Postgres, plus the
       seven RLS assertions that are the whole security posture — had
       run NOWHERE since 19 August;
     · six gates in `npm run verify` (smoke, a11y, deliverables,
       first-run, symmetry, update) run in NEITHER place. Netlify runs
       `npm run build`, which is `check` plus the build steps; `verify`
       is a superset nothing calls;
     · the eleven-mutation matrix proving the gates still reject their
       own defects lived only in `.github/workflows/check.yml`.

   None of that was written down as a gap because each piece had a home
   on paper. `deploy-watchdog.yml` had a home on paper too, and had
   never once made the comparison it was written for.

   THE SKIP IS THE DANGEROUS PART. Every file in `tests/integration` is
   `describe.skipIf(!hasDatabase)`, which is right on a laptop and is
   exactly how an integration suite dies: no database, every test
   skips, vitest reports green. `REQUIRE_DB=1` makes
   `tests/integration/guard.test.ts` fail instead — and the only thing
   that ever set `REQUIRE_DB` was the workflow that no longer runs. So
   for twenty days the command existed, exited 0, and asserted nothing.

   This script sets it, and starts a Postgres if there is none, and
   REFUSES rather than degrading: no database is a failure here, never
   a quiet pass.

   Run it before saying the platform is sound. `npm run check` and
   `npm run verify` remain what they were; this is the superset that
   knows about the database and about the gates' own mutations.
   ===================================================================== */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const started = Date.now();

function run(label, command, args, env = {}) {
  process.stdout.write(`\n─── ${label}\n`);
  const r = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: false,
  });
  if (r.status !== 0) {
    console.error(`\nGATE FAILED at: ${label}`);
    console.error(`(${command} ${args.join(" ")}) exited ${r.status}`);
    process.exit(1);
  }
}

function capture(command, args) {
  return spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });
}

/* ---------------------------------------------------------------
   A DATABASE, OR A FAILURE. Never a skip.
   --------------------------------------------------------------- */
function ensureDatabase() {
  if (process.env["DATABASE_URL"]) {
    console.log(`using the DATABASE_URL already in the environment`);
    return process.env["DATABASE_URL"];
  }

  console.log("no DATABASE_URL — starting a throwaway Postgres");
  const up = capture("bash", [resolve(ROOT, "scripts/local-db.sh")]);
  const line = (up.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("export DATABASE_URL="))
    .pop();

  if (!line) {
    console.error(
      "\nGATE FAILED: could not start a Postgres, and the integration suite\n" +
        "would have SKIPPED every one of its 505 tests and reported green.\n" +
        "That is the failure this script exists to refuse.\n",
    );
    if (up.stderr) console.error(up.stderr);
    process.exit(1);
  }

  const url = line.replace(/^export DATABASE_URL=/, "").replace(/^"|"$/g, "");
  process.env["DATABASE_URL"] = url;
  return url;
}

const url = ensureDatabase();
console.log(`DATABASE_URL is set (${url.replace(/:[^:@/]*@/, ":***@")})`);

/* REQUIRE_DB is the promise. guard.test.ts fails if it is made and not
   kept, which is the only thing standing between "505 passed" and
   "505 skipped, reported as green". */
const withDb = { DATABASE_URL: url, REQUIRE_DB: "1" };

run("schema: apply every migration to it", "npx", ["prisma", "migrate", "deploy"], withDb);
run("schema: does the database match the code", "npm", ["run", "check:db"], withDb);

run("the gates (typecheck, brand, claims, css, glyphs, prose, authz, wiring, 1056 unit tests)", "npm", ["run", "check"], withDb);

run("the gates still REJECT their own defects", "npm", ["run", "check:gates-fail"], withDb);

run("the integration suite, against a real Postgres", "npm", ["run", "test:integration"], withDb);

run("the built bundle in a real browser (smoke, a11y, deliverables, first-run, symmetry, PWA update)", "npm", ["run", "verify"], withDb);

const seconds = Math.round((Date.now() - started) / 1000);
console.log(`
═══════════════════════════════════════════════════════════════
GATE PASSED in ${seconds}s.

Covered: the migrations against a real database, every gate in
\`check\`, the mutation matrix proving those gates still bite, the
integration suite including the seven RLS posture assertions, and
the built bundle driven in Chromium.

What this does NOT cover, and no command can: whether the commit
you merged reached production. Read currentDeploy.commit_ref.
═══════════════════════════════════════════════════════════════`);
