/* =====================================================================
   THE PRIVACY PAGE SAYS THERE IS NO ANALYTICS VENDOR, AND THAT IS NOW
   ENFORCED RATHER THAN REMEMBERED.

   Two customer-facing pages state it as a mechanism, not an intention:

     /privacy — "no font CDN, no analytics, no tag manager, no embedded
                 player ... A dependency that started calling home would
                 fail visibly rather than quietly."
     /terms   — "there is no analytics vendor, no font CDN, no tag
                 manager and no embedded media."

   ON 23 AUGUST 2026 A DEPENDENCY STARTED CALLING HOME. `main.js` gained
   `import { inject } from '@vercel/analytics'` and called it on every
   page load, and the bundle budget was raised 684 -> 688 KB to make room
   for it. Both claims above were false in the code from that commit
   until 7 September.

   THE MECHANISM HELD, WHICH IS THE ONLY REASON THIS IS NOT AN INCIDENT.
   `netlify.toml` sets `connect-src 'self'`, so the browser refused every
   beacon: no page view ever reached Vercel. The sentence on /privacy
   about failing visibly rather than quietly was literally correct.

   THAT IS NOT A REASON TO RELY ON IT. A CSP is one header away from
   being widened, by somebody who has no idea it is the last thing
   standing between a confidential safety-reporting product and a
   third-party record of who read which page. Reporters are told their
   identity is protected; an analytics vendor with page-level telemetry
   on `/report` is exactly the shape of the promise this product sells.

   SO THE CLAIM IS A GATE NOW. Three things fail the build:

     · a dependency on a known telemetry, analytics or session-replay
       vendor, in `dependencies` OR `devDependencies`;
     · an import of one from any source file;
     · a `src=` or `href=` in web source pointing at an external origin.

   WHAT IT DOES NOT DO. It does not forbid analytics forever. It forbids
   adding it while two pages tell customers it is absent. Whoever
   genuinely wants it changes the copy, the CSP and this list in the same
   change — a decision with a diff rather than a drift.
   ===================================================================== */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['apps', 'packages', 'netlify'];
const EXT = new Set(['.ts', '.js', '.mts', '.mjs', '.cjs', '.tsx']);

/* Named rather than pattern-matched on "analytics", because the useful
   ones are not all called that — `posthog-js` and `@sentry/browser` do
   the same job to the same third party. A vendor absent from this list
   is caught by the external-origin rule below instead. */
const VENDORS = [
  '@vercel/analytics', '@vercel/speed-insights',
  'posthog-js', 'mixpanel-browser', 'amplitude-js', '@amplitude/analytics-browser',
  '@segment/analytics-next', 'analytics',
  '@sentry/browser', '@sentry/react', '@sentry/node',
  'logrocket', '@fullstory/browser', 'hotjar',
  'react-ga', 'react-ga4', 'gtag', 'ga-lite',
  'plausible-tracker', 'fathom-client',
  '@datadog/browser-rum', 'newrelic',
];

const failures = [];
let scanned = 0;

/* Comments and string literals are stripped for the IMPORT scan, for the
   reason `check-data-api.mjs` records: this repository explains its
   refusals in prose, and `/privacy` names the very vendors it refuses.
   A scanner that reads its own documentation as a violation reports the
   opposite of the truth. The external-origin rule below runs on the RAW
   text, because a URL is only ever interesting as a literal. */
const stripCommentsAndStrings = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');

/* Our own origins. `usalamasms.com` is this product; the others are
   schema and spec URLs that appear in JSON-LD and never fetch. */
const OWN = /^(https?:)?\/\/(usalamasms\.com|schema\.org|www\.w3\.org|openapi\.vercel\.sh)/;

/* A RESOURCE LOAD, NOT A HYPERLINK — and the first version of this gate
   got that wrong, which is why the distinction is written down.
   Matching `href=` generally reported three violations that were an
   ordinary `<a>` to a Calendly booking page and to a partner's site. A
   link navigates the person AWAY on a click they chose; it fetches
   nothing and tells no third party anything until they act. The claim
   on /privacy is about what this page LOADS.
      So: any `src=`, and `href=` only where it is a <link>. */
const EXTERNAL = /(?:\bsrc\s*=|<link\b[^>]*?\bhref\s*=)\s*["'](https?:)?\/\/([^"'\s]+)/gi;

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!EXT.has(extname(full))) continue;
    const rel = full.slice(ROOT.length + 1);
    const raw = readFileSync(full, 'utf8');
    scanned += 1;

    const code = stripCommentsAndStrings(raw);
    for (const vendor of VENDORS) {
      /* `from '<vendor>'` survives the literal stripper as `from ''`, so
         match the import STATEMENT before stripping instead. */
      const imported = new RegExp(`(?:from|import|require\\s*\\()\\s*["'\`]${vendor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/[^"'\`]*)?["'\`]`);
      if (imported.test(raw) && !/^\s*\/\//m.test(code)) {
        failures.push(`${rel} imports ${vendor}`);
      }
    }

    /* External origins in markup. Web sources only: the API and the
       Netlify functions legitimately call Resend and Paystack from the
       SERVER, which no browser policy governs and no reporter's
       identity travels through. */
    if (rel.startsWith('apps/web/')) {
      for (const m of raw.matchAll(EXTERNAL)) {
        const url = `${m[1] ?? ''}//${m[2]}`;
        if (!OWN.test(url)) failures.push(`${rel} points at an external origin: ${url.slice(0, 80)}`);
      }
    }
  }
}

for (const r of ROOTS) walk(resolve(ROOT, r));

/* THE GATE GUARDS ITS OWN SUBJECT. A scan that walked nothing — a moved
   directory, a renamed extension — reports zero violations and passes
   perfectly, which is the failure mode this repository has met four
   times and named "a check that cannot fail is worse than no check". */
if (scanned < 100) {
  console.error(`\n  ✗ only ${scanned} source files were scanned; this gate has lost its subject.\n`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
for (const field of ['dependencies', 'devDependencies']) {
  for (const name of Object.keys(pkg[field] ?? {})) {
    if (VENDORS.includes(name)) failures.push(`package.json ${field} carries ${name}`);
  }
}

/* AND EACH CLAIM MUST STILL BE THERE, SEPARATELY — which the first
   version of this check got wrong and a mutation caught. It tested for
   `no analytics` and `no analytics vendor`, and the second phrase
   CONTAINS the first: deleting the sentence from /privacy left /terms
   satisfying both patterns, so the gate passed over a claim that had
   been removed. Two assertions that are really one assertion.

   Each page is now pinned on wording only it has. */
const pages = readFileSync(resolve(ROOT, 'apps/web/src/content/pages.js'), 'utf8');
const CLAIMS = [
  ['/privacy', /no font CDN,\s*no analytics,\s*no tag manager/i],
  ['/terms', /no analytics vendor,\s*no\s+font CDN/i],
];
for (const [page, pattern] of CLAIMS) {
  if (!pattern.test(pages)) {
    failures.push(
      `apps/web/src/content/pages.js no longer carries ${page}'s claim that this product ` +
        'loads no analytics — either restore it or retire this gate deliberately',
    );
  }
}

if (failures.length) {
  console.error(`\n  ✗ third-party gate: ${failures.length} violation(s)\n`);
  for (const f of failures) console.error(`  · ${f}`);
  console.error(
    '\n  /privacy and /terms both tell customers this product loads nothing from\n' +
      '  a third party and has no analytics vendor. The CSP (connect-src \'self\')\n' +
      '  enforces it at runtime, so a beacon added here fails silently in the\n' +
      '  browser while the claim becomes false in the code.\n\n' +
      '  To adopt analytics deliberately: change the copy on /privacy and /terms,\n' +
      '  widen the CSP in netlify.toml, and edit VENDORS here — in one change.\n',
  );
  process.exit(1);
}

console.log(`  third-party ok   ${scanned} sources, no analytics vendor, no external origin`);
