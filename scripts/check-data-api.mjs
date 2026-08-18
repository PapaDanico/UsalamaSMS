/* =====================================================================
   THE DATA API IS NOT ADOPTED, AND THAT IS NOW ENFORCED RATHER THAN
   REMEMBERED.

   Every read and write in this product goes through the Fastify API,
   which connects as the database owner and enforces tenancy in SQL.
   Nothing uses supabase-js, `createClient()` or PostgREST, and the
   anon/publishable key is deliberately absent — there is nothing to
   hold it.

   UNTIL NOW THAT WAS A SENTENCE IN CLAUDE.md. On 18 August 2026 the
   Netlify Supabase extension proposed, in its own onboarding:

       const supabase = createClient(
         process.env.SUPABASE_DATABASE_URL,
         process.env.SUPABASE_ANON_KEY
       );

   which is a reasonable thing for it to say and the wrong thing for
   this codebase. The pressure to paste it will not stop, and a
   security posture that survives only while everybody remembers the
   reasoning is one hire away from not existing.

   THREE INDEPENDENT THINGS WOULD BREAK IF SOMEBODY DID PASTE IT, all
   measured on that date rather than argued:

     · `anon`, `authenticated` and `service_role` hold ZERO grants in
       schema public, so every query returns permission denied;
     · every table carries a RESTRICTIVE deny-all policy, which denies
       anon every row even where a grant existed;
     · the site's own Content-Security-Policy is `connect-src 'self'`,
       so a browser-side client cannot reach supabase.co at all.

   This gate is the fourth, and it is the only one that fails EARLY —
   at build time, in the pull request, before anybody has spent an
   afternoon wondering why nothing returns.

   WHAT IT DOES NOT DO. It does not forbid the Data API forever. It
   forbids adopting it ACCIDENTALLY. CLAUDE.md sets the terms — grants,
   policies, removal of the deny-all backstop, and a test that a second
   tenant cannot read the first one's reports, in the same change — and
   somebody making that change deletes this file as part of it, which
   is a decision with a diff rather than a drift.
   ===================================================================== */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['apps', 'packages', 'netlify'];
const EXT = new Set(['.ts', '.js', '.mts', '.mjs', '.cjs', '.tsx']);

const failures = [];
let scanned = 0;

/* Comments AND STRING LITERALS are stripped before scanning, and both
   halves were learned rather than assumed.

   Comments, because this repository EXPLAINS its refusal in prose —
   core.ts and setup-env.mjs both name `createClient()` to say what
   they do not do. A gate that fired on the word would make the
   explanation unwritable, and an unexplained rule is the one that gets
   removed by whoever meets it next.

   STRINGS, because the first version of this gate failed on core.ts
   and the mention turned out to be neither a comment nor a call: it is
   inside the ERROR MESSAGE the API prints when somebody sets
   SUPABASE_DATABASE_URL as the connection string, telling them the
   value is meant for createClient(), which this API does not use.

   That message is the single most useful sentence in the file for the
   person who has just misconfigured a deploy. A gate that forced its
   deletion would have traded a real diagnostic for a false one. */
const stripCommentsAndStrings = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (!EXT.has(extname(entry))) continue;
    scanned += 1;
    const rel = full.slice(ROOT.length + 1);
    const code = stripCommentsAndStrings(readFileSync(full, 'utf8'));

    if (/from\s+['"]@supabase\/|require\(\s*['"]@supabase\//.test(code))
      failures.push(`${rel} imports a @supabase package`);
    if (/\bcreateClient\s*\(/.test(code))
      failures.push(`${rel} calls createClient()`);
    for (const key of ['SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY'])
      if (new RegExp(`env[.\\[]['"]?${key}`).test(code))
        failures.push(`${rel} reads ${key} — the browser-facing key this product does not hold`);
  }
}

for (const r of ROOTS) walk(resolve(ROOT, r));

/* THE GUARD. A walk that found nothing agrees perfectly that nothing
   is wrong — the shape this repository has been bitten by more than
   once. The count is asserted before any conclusion is drawn from it. */
if (scanned < 50) {
  console.error(
    `check:data-api scanned only ${scanned} files under ${ROOTS.join(', ')}. ` +
      'It has lost its subject, and every conclusion below it would be vacuous.',
  );
  process.exit(1);
}

/* The dependency list is the other half: a package can be installed
   long before anything imports it, and `npm install @supabase/server`
   is exactly what the onboarding tells somebody to run first. */
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
for (const field of ['dependencies', 'devDependencies']) {
  for (const name of Object.keys(pkg[field] ?? {})) {
    if (name.startsWith('@supabase/'))
      failures.push(`package.json ${field} carries ${name}`);
  }
}

if (failures.length) {
  console.error('\nThe Supabase Data API is not adopted by this product:\n');
  for (const f of failures) console.error(`  · ${f}`);
  console.error(
    '\nEvery read and write goes through the Fastify API, which connects as the\n' +
      'database owner. anon/authenticated/service_role hold no grants, every table\n' +
      'carries a RESTRICTIVE deny-all, and the CSP is connect-src \'self\' — so this\n' +
      'would not work even if it were wanted.\n\n' +
      'Adopting the Data API deliberately means the grants, the policies, removing\n' +
      'the deny-all backstop, and a test that a second tenant cannot read the first\n' +
      "one's reports — in the same change. See CLAUDE.md. Delete this gate as part\n" +
      'of that change, not before it.',
  );
  process.exit(1);
}

console.log(`  data-api ok      ${scanned} sources, no client SDK, no browser key, no PostgREST`);
