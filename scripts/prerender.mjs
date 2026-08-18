/* =====================================================================
   ONE HTML FILE PER ROUTE, SO A SHARED LINK DESCRIBES WHAT IT POINTS AT.

   THE DECISION THIS REVERSES IS ON THE RECORD, and it was reasonable
   when it was made. apps/web/src/index.html said prerendering was "a
   build-time change for a gain that matters on one URL. The root is
   what gets shared; the rest is honest as long as the card describes
   the product rather than a screen."

   The premise stopped being true. /amendment was given its own URL on
   the owner's request, along with the other new routes, which is a
   statement that those URLs are meant to be sent to people. Until this
   script existed, every one of them shared as the homepage: same title,
   same description, and an `og:url` pointing at `/`. A regulator sent
   the Amendment 2 readiness page saw a card about the product.

   ---------------------------------------------------------------
   WHY THIS IS NOT A CRAWL, WHICH IS HOW THE OTHER SWEEPS WORK.

   check:a11y and check:symmetry discover routes by rendering the app
   and reading its own menu, which is right for them: they run in
   `verify`, on a machine with a browser. THIS runs inside `build`, and
   `build` runs on Netlify, where netlify.toml sets
   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 and there is no Chromium at all. A
   prerenderer that needed a browser would work on this machine, pass
   review, and silently emit nothing on the deploy that matters.

   So the routes are parsed out of the router's own registration calls.
   That is one declaration, in main.js, used by both — a second list of
   paths kept in step by hand is the thing this repository keeps
   deleting.

   ---------------------------------------------------------------
   WHY IT RUNS AFTER stamp-sw AND check:dist, WHICH IS LOAD-BEARING.

   scripts/stamp-sw.mjs precaches by extension, `.html` is on the list,
   and its `walk()` recurses. Emitting these before it puts all thirty
   into the service worker's install manifest. MEASURED against this
   dist rather than estimated: the manifest goes from 56 assets to 86,
   and the HTML in it from 57 KB to 635 KB — half a megabyte charged to
   every reporter on install, over the bad link this product exists for,
   for files the app itself never fetches. That is the exact objection
   that excludes og-card.jpg and the extended-Latin font cut by name,
   an order of magnitude larger. Running afterwards leaves the manifest
   as it was, which is checked: 56 assets, two HTML files.

   The consequence is worth stating plainly: THESE FILES ARE FOR THE
   FIRST REQUEST ONLY. A scraper, or a cold visit with no worker
   installed, gets the route's own head. Everybody else is served the
   shell by the service worker or by the SPA fallback, and the router
   sets the title client-side as it always has.
   ===================================================================== */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const ORIGIN = 'https://usalamasms.com';

const fail = (msg) => {
  console.error(`\nprerender FAILED — ${msg}\n`);
  process.exit(1);
};

/* ------------------------------------------------------------------
   WHAT EACH ROUTE IS, IN ONE SENTENCE A STRANGER READS FIRST.

   Node-only, and deliberately not imported by the app. A description is
   read by scrapers, which do not run JavaScript, and by nobody else —
   browsers have never rendered `meta[name=description]`. Shipping
   thirty of them in the entry chunk would charge a ramp agent on a
   2G link for text only LinkedIn will ever see.

   That also means the router's client-side description branch does
   nothing and never did: no `.register()` call passes a description, so
   `match.meta.description` is always undefined. It is left alone here
   rather than quietly deleted, but it is not what makes this work.
   ------------------------------------------------------------------ */
const DESCRIPTIONS = {
  '/': null, // the root keeps the card's own words, checked by check:claims
  '/about': 'Who builds UsalamaSMS, what it covers of ICAO Annex 19, and what no software can supply for you.',
  '/account': 'Sign in to send your queued reports to the safety office and open your organisation’s record.',
  '/account/logo': 'Upload your operator’s mark so printed packs and exports carry your identity, not ours.',
  '/account/profile': 'Your name, your address and your password.',
  '/account/team': 'Everybody who can sign in to your organisation, what each of them may do, and how to add or offboard somebody.',
  '/admin': 'The supplier’s console. Operators do not appear here.',
  '/amendment': 'What ICAO Annex 19 Amendment 2 changes from 26 November 2026, and which of it an operator has to answer for.',
  '/coverage': 'Element by element against Annex 19’s twelve: what this product holds, and what it deliberately does not.',
  '/fatigue': 'What your fatigue reports say, read against the duty limits you declared \u2014 including the duties that stayed inside them and still left somebody too tired to fly.',
  '/faq': 'Straight answers on price, data, the regulator, offline filing and what happens if you stop paying.',
  '/glossary': 'The vocabulary a safety management system is written in, in the words a regulator uses.',
  '/methodology': 'The risk matrix and the reporting deadlines, rendered from the modules that compute them rather than typed beside them.',
  '/picture': 'Your operator’s safety position in one view: what is open, what is overdue and which barriers are degraded.',
  '/pricing': 'What UsalamaSMS costs, per operator rather than per seat, and what is included at each tier.',
  '/privacy': 'What this product records, what it de-identifies, how long it keeps it, and the limit of that safeguard.',
  '/report': 'File a safety report. Works with the radio off and sends when a connection returns.',
  '/reset': 'Set a new password from the link you were sent.',
  '/signup': 'Create an operator account and start the trial. No card, and your record is yours to export.',
  '/sms': 'Your organisation’s own record against Annex 19: the signed policy, the appointments, the exercises, the documents, the audits and the training.',
  '/templates': 'The source documents and templates behind each instrument, with what each one is for.',
  '/terms': 'The terms this product is supplied under.',
  '/today': 'What needs you today: the reports, actions, reviews and lapses with a date against them.',
  '/toolkits': 'The instruments: occurrence classification, risk assessment, the register, indicators, maturity and the KCAA corrective action plan.',
  '/toolkits/icaas': 'Assemble a corrective action plan in the shape KCAA’s ICAAS portal asks for, from the record you already hold.',
  '/toolkits/culture': 'Fourteen questions about whether your people will actually file a report. Scored on the device, and never sent anywhere.',
  '/toolkits/maturity': 'Assess your safety management system against the SM ICG maturity ladder, without a score that flatters you.',
  '/toolkits/register': 'The risk register regulation 9 asks for, held for the operator rather than on one device.',
  '/toolkits/spi': 'Safety performance indicators with alert levels computed from your own history, rolled up to Kenya’s six high-risk categories.',
  '/toolkits/sra': 'A safety risk assessment in ICAO Doc 9859’s five steps, with the tolerability decision recorded against whoever made it.',
  '/training': 'The SMS training programme: who has had what, when it lapses, and what is outstanding.',
  '/triage': 'The reporting queue for the whole operator, with the disposition of every report recorded against whoever made it.',
  '/tutorials': 'Short walkthroughs of each screen, in the order an operator meets them.',
};

/* Screens that exist for somebody signed in, and have no business in a
   search result. NOT the same question as whether the file is emitted —
   they all get one, because they all get shared between colleagues and
   a link in a WhatsApp group should still say what it opens. */
const NOINDEX = new Set([
  '/account', '/account/logo', '/account/profile', '/account/team',
  '/admin', '/picture', '/reset', '/sms', '/today', '/training', '/triage',
]);

/* ---- the routes, from the router's own registrations ---- */
const main = readFileSync(resolve(ROOT, 'apps/web/src/main.js'), 'utf8');
const routes = [];
for (const chunk of main.split('.register(').slice(1)) {
  const path = /^\s*'([^']+)'/.exec(chunk);
  const title = /title:\s*'((?:[^'\\]|\\.)*)'/.exec(chunk);
  if (path) routes.push({ path: path[1], title: title ? title[1] : null });
}

/* RULE 11. A parse that returns nothing emits nothing and reports
   success — the shape this repository keeps meeting. The floor sits
   well under the real count so it fails on a broken parse rather than
   on a screen being retired. */
if (routes.length < 20) {
  fail(
    `only ${routes.length} route(s) parsed out of apps/web/src/main.js. ` +
    'The registration syntax changed and this would have emitted nothing.'
  );
}

const untitled = routes.filter((r) => !r.title).map((r) => r.path);
if (untitled.length) fail(`no title declared for ${untitled.join(', ')}`);

/* BOTH DIRECTIONS. A missing description is a route sharing as the
   product; a description for a route that no longer exists is a line
   nobody will ever delete, and the pair is what keeps this file honest
   against main.js rather than merely non-empty. */
const known = new Set(routes.map((r) => r.path));
const missing = routes.filter((r) => !(r.path in DESCRIPTIONS)).map((r) => r.path);
if (missing.length) {
  fail(
    `no description for ${missing.join(', ')} — add one to DESCRIPTIONS in this file. ` +
    'A route without one shares as the product rather than as itself.'
  );
}
const orphans = Object.keys(DESCRIPTIONS).filter((p) => !known.has(p));
if (orphans.length) fail(`DESCRIPTIONS names ${orphans.join(', ')}, which main.js does not register`);

/* ---- the shell ---- */
const shellPath = resolve(DIST, 'index.html');
if (!existsSync(shellPath)) fail('dist/index.html not found. Run this after `vite build`.');
const shell = readFileSync(shellPath, 'utf8');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Replace the CONTENT of a named tag, and report when the tag was not
   found. A silent no-op here is a file that looks prerendered and
   carries the homepage's card. */
function setMeta(html, attr, name, value, where) {
  const re = new RegExp(`(<meta\\s+${attr}="${name}"\\s+content=")[^"]*(")`, 'i');
  const multi = new RegExp(
    `(<meta\\s*\\n\\s*${attr}="${name}"\\s*\\n\\s*content=")[^"]*(")`, 'i'
  );
  if (re.test(html)) return html.replace(re, `$1${esc(value)}$2`);
  if (multi.test(html)) return html.replace(multi, `$1${esc(value)}$2`);
  fail(`no <meta ${attr}="${name}"> in dist/index.html while writing ${where}`);
  return html;
}

let written = 0;
for (const { path, title } of routes) {
  if (path === '/') continue; // the shell IS the root, and check:claims owns its words

  const url = `${ORIGIN}${path}`;
  const full = `${title} — UsalamaSMS`;
  const description = DESCRIPTIONS[path];

  let html = shell;
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(full)}</title>`);
  html = setMeta(html, 'name', 'description', description, path);
  html = setMeta(html, 'property', 'og:url', url, path);
  html = setMeta(html, 'property', 'og:title', full, path);
  html = setMeta(html, 'property', 'og:description', description, path);
  html = setMeta(html, 'name', 'twitter:title', full, path);
  html = setMeta(html, 'name', 'twitter:description', description, path);

  /* The canonical is what stops thirty near-identical shells being read
     as thirty copies of the homepage. */
  if (/<link\s+rel="canonical"\s+href="[^"]*"/i.test(html)) {
    html = html.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `$1${url}$2`);
  } else {
    html = html.replace(/<\/head>/i, `  <link rel="canonical" href="${url}" />\n  </head>`);
  }

  if (NOINDEX.has(path)) {
    html = html.replace(
      /<\/head>/i,
      '  <meta name="robots" content="noindex, follow" />\n  </head>'
    );
  }

  const dir = resolve(DIST, path.replace(/^\//, ''));
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), html);
  written += 1;
}

/* THE OUTPUT IS RE-READ RATHER THAN ASSUMED. Every replacement above
   could match nothing and leave the shell intact, which is the failure
   this whole file exists to prevent — so one emitted route is opened
   again and checked against the homepage it must not be. */
const sample = routes.find((r) => r.path === '/amendment') ?? routes.find((r) => r.path !== '/');
const back = readFileSync(resolve(DIST, sample.path.replace(/^\//, ''), 'index.html'), 'utf8');
if (!back.includes(`${ORIGIN}${sample.path}"`)) {
  fail(`${sample.path}/index.html does not carry its own og:url — the replacement matched nothing`);
}
if (back.includes(`<meta property="og:url" content="${ORIGIN}/"`)) {
  fail(`${sample.path}/index.html still carries the homepage og:url`);
}

const indexed = routes.length - 1 - NOINDEX.size;
console.log(
  `  prerender ok     ${written} routes, ${indexed} indexable, ${NOINDEX.size} noindex` +
  ' — emitted after the service worker manifest, so none are precached'
);
