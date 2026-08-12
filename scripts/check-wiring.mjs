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
import { readFileSync } from 'node:fs';

const SCREEN = 'apps/web/src/tools/sms/index.js';
const ROUTES = 'apps/api/src/routes.sms.ts';

const screen = readFileSync(SCREEN, 'utf8');
const routes = readFileSync(ROUTES, 'utf8');
const problems = [];

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
