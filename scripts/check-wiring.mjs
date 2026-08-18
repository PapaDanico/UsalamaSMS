#!/usr/bin/env node
/* ============================================================
   The SMS screen and the API it writes to, checked against each
   other rather than against a memory of each other.

   WHY THIS EXISTS. Two defects, both found by driving the /sms screen
   against a real API and neither findable any other way the repository
   had:

   1. The appointments form POSTed to /api/v1/sms/accountabilities,
      because element 1.3 READS from there — the matrix and who holds
      each post are one round trip. The write endpoint is
      /api/v1/sms/appointments and always was. The server answered 400
      invalid_accountability, which the screen reported as "That was
      not accepted. Check the fields and try again." So the form told
      the safety manager their typing was wrong about a request that
      never had a chance of succeeding.

   2. The submit handler closed the disclosure with
      `querySelector('#element-' + id + ' .sms-add')`. An Annex 19
      element id contains a dot, so `#element-1.1` is a selector for id
      `element-1` carrying class `1` — a SyntaxError, thrown AFTER the
      write had already been accepted. The record was saved, the list
      repainted, and the exception landed in a console nobody was
      reading. Nothing on screen was wrong enough to report.

   Both share a shape: a string that looks like a correct reference and
   is not, failing somewhere the person using the screen cannot see. A
   typecheck cannot reach either — both are strings, and both are
   well-typed strings.

   WHAT TO DO WHEN IT FAILS. For a route: either the screen is pointed
   at an endpoint that does not exist, or one was renamed in the API
   and not here. Write the real path — do not relax the check. For a
   selector: use getElementById, which does not parse its argument, or
   CSS.escape. Do not rename the elements to remove the dots; the dots
   are ICAO's numbering and this product does not get to change it.
   ============================================================ */
import { readFileSync, readdirSync } from 'node:fs';

const SCREEN = 'apps/web/src/tools/sms/index.js';

/* EVERY ROUTE FILE, not routes.sms.ts alone.

   This read one file until the emergency contact directory landed in
   routes.erp.ts, and then reported that the screen "reads
   /api/v1/sms/contacts, which apps/api/src/routes.sms.ts does not
   register" — which was true of that file and false of the API. A gate
   that fails on correct wiring teaches people to move code to satisfy
   it, and the code was in the right place.

   Widening it is not relaxing it: every endpoint must still be
   registered, with the right method, somewhere the API actually
   registers it. What changes is that "somewhere" is now the API rather
   than one file of it — the same source check-claims.mjs reads for the
   coverage routes, and for the same reason. */
const ROUTE_DIR = 'apps/api/src';
const ROUTE_FILES = readdirSync(ROUTE_DIR)
  .filter((f) => f.startsWith('routes.') && f.endsWith('.ts'))
  .map((f) => `${ROUTE_DIR}/${f}`);
const ROUTES = ROUTE_FILES.join(', ');

const screen = readFileSync(SCREEN, 'utf8');
const routes = ROUTE_FILES.map((f) => readFileSync(f, 'utf8')).join('\n');
const problems = [];

if (ROUTE_FILES.length < 4) {
  console.error(
    `check:wiring — found only ${ROUTE_FILES.length} route file(s) in ${ROUTE_DIR}.`
  );
  console.error('A gate that reads almost nothing passes almost everything. Refusing to.');
  process.exit(1);
}

/* ---- 1. every endpoint the screen names must exist in the API ---- */

/* Read the routes the API actually registers, with their methods, so a
   GET-only path used as a POST target is caught rather than passing on
   the strength of the path alone — which is precisely defect 1. */
const registered = new Map();
for (const m of routes.matchAll(/app\.(get|post)\(\s*"([^"]+)"/g)) {
  const [, method, path] = m;
  if (!registered.has(path)) registered.set(path, new Set());
  registered.get(path).add(method.toUpperCase());
}
if (registered.size === 0) {
  console.error(`check:wiring — read no routes at all out of ${ROUTES}.`);
  console.error('A gate that finds nothing to check passes everything. Refusing to.');
  process.exit(1);
}

/* The screen declares its surfaces as `endpoint:` (read) and an
   optional `postEndpoint:` (write, when the two differ). */
const reads = [...screen.matchAll(/(?<!post)endpoint:\s*'([^']+)'/gi)].map((m) => m[1]);
const writes = [...screen.matchAll(/postEndpoint:\s*'([^']+)'/g)].map((m) => m[1]);
if (reads.length === 0) {
  console.error(`check:wiring — found no endpoints declared in ${SCREEN}.`);
  console.error('Either the screen stopped declaring them or this gate stopped reading them.');
  process.exit(1);
}

/* A surface with no postEndpoint writes to its read endpoint, so the
   read path must accept a POST too. That is the rule defect 1 broke. */
const writeTargets = new Set(writes);
for (const path of reads) {
  const methods = registered.get(path);
  if (!methods) {
    problems.push(`${SCREEN} reads ${path}, which ${ROUTES} does not register.`);
    continue;
  }
  if (!methods.has('GET')) problems.push(`${SCREEN} reads ${path}, which has no GET handler.`);
}
for (const path of writeTargets) {
  const methods = registered.get(path);
  if (!methods) {
    problems.push(`${SCREEN} posts to ${path}, which ${ROUTES} does not register.`);
    continue;
  }
  if (!methods.has('POST')) problems.push(`${SCREEN} posts to ${path}, which has no POST handler.`);
}
/* The write path must NAME THE RESOURCE the surface holds, and this is
   the assertion that catches defect 1. Checking only that the path
   accepts a POST does not: /api/v1/sms/accountabilities answers POST
   perfectly well — for an accountability. Posting an appointment to it
   is a well-formed request to the wrong resource, which is the whole
   defect, and a method table cannot see it.

   Every surface in this screen writes to a path whose last segment is
   its own key, so that correspondence is the invariant. If a future
   element genuinely needs to break it, the failure names both halves
   and the fix is deliberate rather than silent. */
/* Scoped to the SURFACES object. ELSEWHERE keys its entries by the
   same element ids and carries href/label instead — reading both as
   one map reported every element held on another screen as a broken
   surface. */
const surfacesBlock = screen.match(/const SURFACES = \{(.*?)\n\};/s)?.[1];
if (!surfacesBlock) {
  console.error(`check:wiring — could not find the SURFACES declaration in ${SCREEN}.`);
  process.exit(1);
}
const surfaces = [...surfacesBlock.matchAll(/'(\d\.\d)':\s*\{(.*?)\n {2}\}/gs)].map(([, id, block]) => ({
  id,
  key: block.match(/\bkey:\s*'([^']+)'/)?.[1],
  read: block.match(/(?<!post)endpoint:\s*'([^']+)'/i)?.[1],
  write: block.match(/postEndpoint:\s*'([^']+)'/)?.[1]
}));
if (surfaces.length === 0) {
  console.error(`check:wiring — parsed no surfaces out of ${SCREEN}.`);
  console.error('A gate that finds nothing to check passes everything. Refusing to.');
  process.exit(1);
}
for (const s of surfaces) {
  const target = s.write ?? s.read;
  if (!s.key || !target) {
    problems.push(`${SCREEN} surface ${s.id} declares no key or no endpoint.`);
    continue;
  }
  const resource = target.split('/').pop();
  if (resource !== s.key) {
    problems.push(
      `${SCREEN} surface ${s.id} holds '${s.key}' but writes to ${target}, which is the ` +
        `'${resource}' resource. A write to the wrong resource is a 400 the form reports as ` +
        'the reporter having mistyped. Declare postEndpoint.'
    );
  }
  if (!registered.get(target)?.has('POST')) {
    problems.push(`${SCREEN} surface ${s.id} posts to ${target}, which has no POST handler.`);
  }
}

/* ---- 2. no dotted id interpolated into a CSS selector ---- */

/* Narrow on purpose: an id built by interpolation and handed to
   querySelector. Annex 19 element ids and the component ids that carry
   them all contain dots, so this pattern is a SyntaxError waiting for
   the first one that does. */
for (const m of screen.matchAll(/query[Ss]elector(?:All)?\(\s*`([^`]*)`/g)) {
  const selector = m[1];
  if (/#[^\s,]*\$\{/.test(selector)) {
    const line = screen.slice(0, m.index).split('\n').length;
    problems.push(
      `${SCREEN}:${line} builds a CSS id selector by interpolation: \`${selector}\`. ` +
        'An element id contains a dot, so this throws. Use getElementById or CSS.escape.'
    );
  }
}

/* ------------------------------------------------------------------
   EVERY ROUTED TOOLKIT MUST OFFER THE WAY BACK TO THE TOOLKITS.

   shared/tool-nav.js exists because that way back was measured and
   found missing: on /toolkits/maturity the only visible link to the
   index sat at 9,893px down a 10,317px page — eleven screens of
   scrolling to leave an assessment. Its header records the numbers.

   The component was then added to five screens BY HAND, and /training
   was the sixth routed toolkit and did not get it. It is in the
   TOOLKITS registry, it appears in the toolkits index and in the menu
   hint that is computed from that registry — and the screen itself
   linked to NOTHING internal at all. A person who arrived there left
   by the browser's back button or not at all.

   Nothing noticed, because "did somebody remember to add the import"
   is not a thing any gate asked. This asks it, from the REGISTRY
   rather than from a list typed here, so the seventh toolkit is
   covered on the day it is added.
   ------------------------------------------------------------------ */
const sitemapSrc = readFileSync('apps/web/src/shared/sitemap.js', 'utf8');
const routedHrefs = [
  ...sitemapSrc.matchAll(/href:\s*'([^']+)',\s*\n\s*short:[^\n]*\n\s*routed:\s*true/g),
].map((m) => m[1]);

if (routedHrefs.length < 4) {
  problems.push(
    `only ${routedHrefs.length} routed toolkits were discovered out of sitemap.js — ` +
      'the parser has lost its subject, and a check over an empty list passes perfectly'
  );
} else {
  for (const href of routedHrefs) {
    /* /toolkits/sra -> tools/sra, /training -> tools/training. The
       last path segment is the screen directory in every case so far;
       a toolkit that breaks that convention fails here rather than
       being silently skipped, which is the direction that matters. */
    const dir = href.replace(/^\/(toolkits\/)?/, '').split('#')[0];
    const file = `apps/web/src/tools/${dir}/index.js`;
    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      problems.push(
        `${href} is a routed toolkit and ${file} does not exist. Either the screen ` +
          'moved or the registry is wrong; this check cannot tell which, and both are bugs.'
      );
      continue;
    }
    if (!/ToolNav\s*\(/.test(src)) {
      problems.push(
        `${file} is a routed toolkit and never calls ToolNav(). It appears in the ` +
          'toolkits index and in the computed menu hint, and offers no link back to ' +
          'them — see the header of shared/tool-nav.js for what that cost last time.'
      );
    }
  }
}

if (problems.length) {
  console.error('check:wiring — the screen and the API disagree:\n');
  for (const p of problems) console.error(`  · ${p}`);
  console.error('');
  process.exit(1);
}

console.log(
  `  wiring ok        ${reads.length} endpoints declared, ${registered.size} routes registered, ` +
    'no interpolated id selectors'
);
