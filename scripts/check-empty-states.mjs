/* =====================================================================
   THE SCREEN THAT IS EMPTY AND SAYS NOTHING ABOUT IT.

   Every data screen in this product renders a zero-state, and for a
   long time the way to audit them was to grep `class="empty-state"` and
   count. That measures markup, and markup turned out to be uncorrelated
   with whether the zero-state is any good:

     · /picture and /today carry the BEST zero-states in the product —
       each names what the emptiness means and links to where the first
       record is made — and NEITHER uses the class;
     · /triage and /fatigue both used it, and both were DEAD ENDS. The
       reporting queue is the first screen a new operator opens, it said
       "Nothing on this device yet", and `href="/report"` appeared
       nowhere in the file. The one path the whole product exists to
       start had no way forward on the screen that is empty of it.

   So the property this gate holds is not "has the class". It is: THE
   FIRST RECORD IS MADE SOMEWHERE, AND THE SCREEN THAT IS EMPTY OF IT
   EITHER IS THAT SOMEWHERE OR SAYS WHERE.

   WAY_FORWARD below is the declaration. A route means the record is
   created on another screen and this one must link there; `null` means
   creation is on this screen, and the note says how.

   ---------------------------------------------------------------
   WHAT THIS GATE DOES NOT CATCH, stated because a gate whose limits
   are unwritten gets trusted for more than it does.

   It cannot tell that a form on the screen creates the thing the list
   is empty of. /triage renders forms — filters, and the corrective
   action — and POSTs from them, so any "does this file have a form"
   test would have passed it while it was the defect. Distinguishing
   those needs a semantic model of each endpoint that this repository
   does not have and should not grow for a copy rule.

   What it does instead is force the DECISION to be written down and
   keep the writing honest: a new zero-state cannot ship without an
   entry, an entry naming a route that does not exist fails, an entry
   whose route is not linked from the file fails, and an entry for a
   file that no longer has a zero-state fails. The reasoning stays with
   a person; the gate stops it from being skipped or rotting.
   ===================================================================== */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = resolve(ROOT, 'apps/web/src');

const failures = [];
const passes = [];
function assert(what, ok, why) {
  if (ok) {
    passes.push(what);
    console.log(`  ok   ${what}`);
  } else {
    failures.push(`${what} — ${why}`);
  }
}

/* Where the first record is made, for every screen that renders a
   zero-state. A path means another screen; null means this one. */
const WAY_FORWARD = {
  'shared/router.js': [null, 'the error boundary, not an empty record set — it already offers the way back to /'],
  'tools/admin/index.js': [null, 'the console mints operators and grants entitlements from forms on this screen'],
  'tools/fatigue/index.js': ['/report', 'a fatigue report is filed on the report form, with the duty block'],
  'tools/glossary/index.js': [null, 'a search that matched nothing, not a record set — the input is on this screen'],
  'tools/login/team-panel.js': [null, 'colleagues are added from the form on this panel'],
  'tools/register/index.js': [null, 'the register entry form is on this screen'],
  'tools/sms/index.js': [null, "each element's own add form is behind the disclosure on this screen"],
  'tools/spi/index.js': [null, 'the indicator form is on this screen'],
  'tools/sra/index.js': [null, 'hazards are added to the assessment on this screen'],
  'tools/triage/index.js': ['/report', 'the queue lists reports; a report is filed on the report form'],
};

/* =====================================================================
   THE CLASS IS WHAT THIS GATE COULD SEE, AND IT WAS NEVER ALL OF THEM.

   Discovery below matches `class="empty-state"`. The header of this
   file already admits the consequence — /picture and /today carry the
   best zero-states in the product and NEITHER uses the class, so
   neither was ever checked here.

   That was a known two. On 18 August it became four without anybody
   noticing, which is the part that matters. Measured across the seven
   routed toolkits:

     toolkit              class   declared
     /toolkits/sra          yes      yes
     /toolkits/register     yes      yes
     /toolkits/spi          yes      yes
     /toolkits/maturity      no       no
     /toolkits/icaas         no       no
     /training               no       no
     /toolkits/culture       no       no      <- shipped that morning

   Four of seven outside the gate, and the gate reporting ok. A new
   toolkit joins the blind set by default, because the only thing that
   enrols a screen is a styling choice somebody made for other reasons.

   SO THE SUBJECT IS THE REGISTRY, NOT THE CLASS — the same correction
   check:wiring made for ToolNav. Every routed toolkit must carry a
   decision here, and the eighth is covered on the day it is added
   rather than whenever somebody happens to reach for the class.

   THREE ANSWERS ARE ALLOWED and the third is why this is a table
   rather than a boolean:

     a route  — the first record is made on another screen, named.
     null     — it is made HERE, on this screen.
     false    — there is no collection to be empty OF. Reference
                content. /training is the KCAA syllabus: no form, no
                control, nothing to accumulate. Forcing it to name a
                way forward would invent a workflow it does not have.

   `false` is the entry somebody will be tempted to use to make this
   gate quiet. It is not free — the assertion below requires a screen
   claiming it to have NO form and NO control, which is a fact about
   the file rather than an opinion about it.
   ===================================================================== */
const TOOLKIT_ZERO_STATE = {
  '/toolkits/sra': [null, 'hazards are added to the assessment on this screen'],
  '/toolkits/register': [null, 'the register entry form is on this screen'],
  '/toolkits/spi': [null, 'the indicator form is on this screen'],
  '/toolkits/maturity': [null, 'the assessment is answered on this screen'],
  '/toolkits/culture': [null, 'responses are collected on this screen and never leave the device'],
  '/toolkits/icaas': ['/picture', 'it composes a pack from records made elsewhere, and its zero-state links to the risk picture'],
  '/training': [false, 'reference content — the KCAA syllabus. No form, no control, no collection to be empty of'],
};

const sitemapSrc = readFileSync(resolve(WEB, 'shared/sitemap.js'), 'utf8');
const routedToolkits = [
  ...sitemapSrc.matchAll(/href:\s*'([^']+)',\s*\n\s*short:[^\n]*\n\s*routed:\s*true/g),
].map((m) => m[1]);

/* Rule 11 from the side that bites: a parser that has lost its subject
   asserts nothing over an empty list, perfectly. */
assert(
  'the routed-toolkit discovery found a plausible number',
  routedToolkits.length >= 4,
  `only ${routedToolkits.length} routed toolkit(s) parsed out of sitemap.js — the registry ` +
    'shape changed and this whole section would assert nothing'
);

const unclassified = routedToolkits.filter((h) => !(h in TOOLKIT_ZERO_STATE));
assert(
  'every routed toolkit has a zero-state decision recorded',
  unclassified.length === 0,
  `${unclassified.join(', ')} is routed and carries no entry in TOOLKIT_ZERO_STATE. ` +
    'Say where its first record is made, or that it has none — see this section header'
);

const rotted = Object.keys(TOOLKIT_ZERO_STATE).filter((h) => !routedToolkits.includes(h));
assert(
  'no entry describes a toolkit that is no longer routed',
  rotted.length === 0,
  `${rotted.join(', ')} is declared here and is not a routed toolkit any more`
);

/* `false` is a claim about the FILE, so it is checked against the file. */
for (const [href, [where, why]] of Object.entries(TOOLKIT_ZERO_STATE)) {
  const dir = href.replace(/^\/(toolkits\/)?/, '').split('#')[0];
  const file = resolve(WEB, `tools/${dir}/index.js`);
  assert(`${href} declares a reason`, typeof why === 'string' && why.length > 12, 'the note is empty or too short to be one');
  if (where === false) {
    const src = readFileSync(file, 'utf8');
    assert(
      `${href} claims no collection, and genuinely has no controls`,
      !/<form|<input|<select|<textarea|<button/.test(src),
      'it declares `false` — no collection to be empty of — while rendering a form or a control. ' +
        'That is the escape hatch being used to quiet this gate rather than to describe the screen'
    );
  }
}

/* ---- discovery: every file in the web app that renders a zero-state ---- */
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = resolve(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const found = new Map();
for (const full of walk(WEB)) {
  if (!full.endsWith('.js') && !full.endsWith('.ts')) continue;
  const src = readFileSync(full, 'utf8');
  if (src.includes('class="empty-state"')) found.set(relative(WEB, full), src);
}

/* RULE 11, from the side that bites. A discovery that matches nothing
   has nothing to disagree with the table about, so every assertion
   below passes perfectly over an empty set. The floor sits under the
   real count so a changed class name fails here rather than silently. */
assert(
  'the zero-state discovery found a plausible number of screens',
  found.size >= 8,
  `only ${found.size} file(s) under apps/web/src render class="empty-state". ` +
    'The class was renamed and this gate would have asserted nothing'
);

/* ---- the routes the router actually registers ---- */
const main = readFileSync(resolve(WEB, 'main.js'), 'utf8');
const routes = new Set();
for (const chunk of main.split('.register(').slice(1)) {
  const path = /^\s*'([^']+)'/.exec(chunk);
  if (path) routes.add(path[1]);
}
assert(
  "the router's registrations parsed",
  routes.size >= 20,
  `only ${routes.size} route(s) parsed out of main.js — the registration syntax changed`
);

/* ---- 1. a new zero-state cannot ship without a decision ---- */
const undeclared = [...found.keys()].filter((f) => !(f in WAY_FORWARD));
assert(
  'every screen with a zero-state declares where the first record is made',
  undeclared.length === 0,
  `${undeclared.join(', ')} render(s) a zero-state and is not in WAY_FORWARD. ` +
    'Add an entry: the route the first record is made on, or null with a note saying ' +
    'it is made on this screen'
);

/* ---- 2. and the declaration cannot rot into a list of stale files ---- */
const dead = Object.keys(WAY_FORWARD).filter((f) => !found.has(f));
assert(
  'no entry names a file that no longer renders a zero-state',
  dead.length === 0,
  `${dead.join(', ')} is declared in WAY_FORWARD and renders no zero-state. Delete the entry`
);

/* ---- 3. where the record is made elsewhere, the screen links there ---- */
const dangling = [];
const unregistered = [];
for (const [file, [route]] of Object.entries(WAY_FORWARD)) {
  if (route === null) continue;
  if (!routes.has(route)) unregistered.push(`${file} -> ${route}`);
  const src = found.get(file);
  if (src && !src.includes(`href="${route}"`)) dangling.push(`${file} -> ${route}`);
}
assert(
  'every screen whose record is made elsewhere links to where',
  dangling.length === 0,
  `${dangling.join(', ')} — the zero-state names another screen and the file links nowhere. ` +
    'An operator who reaches it has no way forward'
);
assert(
  'and every route named is one the router registers',
  unregistered.length === 0,
  `${unregistered.join(', ')} is not registered in main.js — the link lands on not-found`
);

/* ---- 4. a null entry has to say why, or it is an unexplained pass ---- */
const unexplained = Object.entries(WAY_FORWARD)
  .filter(([, [, note]]) => !note || note.length < 20)
  .map(([f]) => f);
assert(
  'every declaration carries the reasoning, not just a value',
  unexplained.length === 0,
  `${unexplained.join(', ')} declares no note. null with no note is "somebody decided ` +
    'nothing", which is the state this gate exists to end'
);

if (failures.length > 0) {
  console.error(`\n${failures.length} zero-state failure(s):\n`);
  for (const f of failures) console.error(`  · ${f}`);
  console.error('\nZero-state gate failed.');
  process.exit(1);
}

const elsewhere = Object.values(WAY_FORWARD).filter(([r]) => r !== null).length;
console.log(
  `\nZero-state gate passed — ${passes.length} assertions over ${found.size} screens, ` +
    `${elsewhere} of which make the first record on another screen.`
);
