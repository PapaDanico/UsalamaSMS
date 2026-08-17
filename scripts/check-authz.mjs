#!/usr/bin/env node
/* ============================================================
   A ROUTE MUST NOT DISCLOSE A MODEL TO A ROLE THAT EVERY OTHER ROUTE
   REFUSES IT.

   WHY THIS EXISTS. On 17 August 2026 /api/v1/picture answered 200 to a
   SAFETY_OFFICER carrying the full text of an audit finding, and a
   colleague's name and lapsed course. Both are refused to that role
   everywhere else in the API:

     /api/v1/sms/findings   requires `audit.read`
     /api/v1/sms/training   returns ONLY the caller's own rows without
                            `training.manage`

   The route gated once, on `report.read.org`, and its own comment
   explained why: everything it read was an aggregate of records that
   permission already opened one at a time. That was TRUE of the five
   collections it was written for and FALSE of the two that barrier
   health added. The reasoning was load-bearing and nobody re-derived it
   when the reads changed.

   NOTHING CAUGHT IT. 744 unit tests, 80 smoke checks, 366 integration
   checks, seven mutation checks, an accessibility sweep and a green
   deploy preview all passed on the defect. Every one asked whether the
   feature WORKED. None asked what it EXPOSED. The permission that would
   have caught it lives in routes.sms.ts, the route that broke it lives
   in routes.picture.ts, and nothing in the build compared them.

   A DASHBOARD IS THE EASIEST PLACE IN A PRODUCT TO LOSE AN
   AUTHORISATION RULE, because it does not read like a read of the
   underlying table — it reads like arithmetic. Every aggregate route
   grows new sources over time, which is exactly what barrier health
   was, so this recurs without a check.

   ------------------------------------------------------------
   HOW IT COMPARES

   Per handler it computes the ROLES that can reach it and the models it
   DISCLOSES. Per model it then takes the union of every audience — the
   set of roles the API as a whole is willing to show that model to —
   and fails when one handler admits a role that NO OTHER handler
   disclosing the same model admits.

   Roles, not permission names, because permissions here are a flat
   Record<Role, Set<Permission>> with no hierarchy: `audit.read` and
   `report.read.org` are unordered and only their role sets compare.
   That subset test is what catches this defect and a count would not —
   before the fix both audiences held exactly five roles, and they were
   different fives.

   ------------------------------------------------------------
   FOUR DISTINCTIONS IT MAKES, EACH OF WHICH IT WOULD BE WRONG WITHOUT

   1. A SELECT OF `id` ALONE IS NOT A DISCLOSURE. routes.actions.ts asks
      whether a finding id belongs to the caller's org before hanging an
      action off it. That is a tenancy probe, not a read of the finding,
      and a gate flagging it would be relaxed within a week. The
      distinction is mechanical rather than a judgement: name any column
      beyond `id` and it counts. Omitting `select` entirely — fetching
      every column — counts too, which is the right direction.

   2. A CHECK GUARDING ONE QUERY IS STILL A CHECK. The fix for the
      defect was to stop gating once at the door:

          const mayReadFindings = can(auth.role, "audit.read");
          ...
          mayReadFindings ? prisma.auditFinding.findMany({...}) : []

      A gate reading only the entry check would call that fix identical
      to the defect. So a permission bound to a name counts for any
      query whose own expression mentions that name — including inside
      its `where`, which is how /api/v1/sms/training narrows itself to
      the caller's own rows.

   3. `if (!can(a) && !can(b)) return 403` IS A DISJUNCTION. It admits
      holders of EITHER. Reading it as a conjunction made
      /api/v1/changes look reachable by one role instead of three, which
      would have manufactured a finding against a route that is fine.

   4. STACKED CLAUSES INTERSECT. Separate `if (...) 403` statements each
      have to pass, so the audience is the intersection across them.
      Taking a union would let a route widen its audience by checking
      more things.

   ------------------------------------------------------------
   WHAT IT DOES NOT SEE, stated because a gate whose reach is unknown
   gets trusted past it:

   · a model read only through a RELATION — `include: { approvedBy: … }`
     or a nested `select` — is attributed to the parent model, not the
     related one;
   · `$queryRaw` is invisible; one exists, in routes.picture.ts, over
     SafetyReport, which that route already discloses directly;
   · it reasons about roles, never about rows, so a handler that leaks
     one tenant's data to another is out of scope. tenantWhere and the
     integration suite carry that.
   ============================================================ */
import { readFileSync, readdirSync } from 'node:fs';

const PERM_SOURCE = 'packages/shared/src/permissions.ts';
const ROUTE_DIR = 'apps/api/src';

/* ---- 1. the permission matrix, read rather than restated ---- */

const permSrc = readFileSync(PERM_SOURCE, 'utf8');
const ROLES = new Map();
for (const m of permSrc.matchAll(
  /^ {2}([A-Z_]+): new Set<Permission>\(\[([\s\S]*?)\]\),$/gm
)) {
  ROLES.set(m[1], new Set([...m[2].matchAll(/"([a-z.]+)"/g)].map((x) => x[1])));
}
if (ROLES.size < 5) {
  console.error(`check:authz — parsed only ${ROLES.size} roles out of ${PERM_SOURCE}.`);
  console.error('A gate that cannot read the permission matrix compares nothing. Refusing to.');
  process.exit(1);
}
const ALL_ROLES = new Set(ROLES.keys());

/* The one permission that means "the whole record". See its use below.
   Asserted to exist so the exemption cannot outlive the thing it
   exempts — a rule keyed on a permission nobody holds any more is a
   hole with a comment over it. */
const EXPORT_PERMISSION = 'org.export';
if (![...ROLES.values()].some((held) => held.has(EXPORT_PERMISSION))) {
  console.error(`check:authz — no role holds "${EXPORT_PERMISSION}", which this gate exempts.`);
  console.error('The exemption now covers nothing, or covers everything. Refusing to guess.');
  process.exit(1);
}

/** Roles holding at least one of `perms`. */
function rolesHoldingAny(perms) {
  const out = new Set();
  for (const [role, held] of ROLES) {
    if (perms.some((p) => held.has(p))) out.add(role);
  }
  return out;
}
const intersect = (a, b) => new Set([...a].filter((x) => b.has(x)));

/* ---- 2. the handlers ---- */

const ROUTE_FILES = readdirSync(ROUTE_DIR)
  .filter((f) => f.startsWith('routes.') && f.endsWith('.ts'))
  .map((f) => `${ROUTE_DIR}/${f}`);
if (ROUTE_FILES.length < 4) {
  console.error(`check:authz — found only ${ROUTE_FILES.length} route file(s).`);
  process.exit(1);
}

const REGISTRATION = /^ {2}app\.(get|post|put|delete)(?:<[^>]*>)?\(\s*"([^"]+)"/gm;
/* Helpers declared after the last handler belong to ALL handlers in the
   file — routes.actions.ts closes with `find()` and `sourceBelongsToOrg()`,
   which any of its handlers may call. Attributing their queries to the
   last handler alone would be a lie in the direction that hides things. */
const TRAILING_HELPER = /^ {2}(?:async )?function [a-zA-Z]|^ {2}(?:const|let) [a-zA-Z]+ = (?:async )?\(/m;

const handlers = [];
for (const file of ROUTE_FILES) {
  const src = readFileSync(file, 'utf8');
  const marks = [...src.matchAll(REGISTRATION)];
  if (marks.length === 0) continue;

  const spans = marks.map((m, i) => ({
    verb: m[1].toUpperCase(),
    path: m[2],
    from: m.index,
    to: i + 1 < marks.length ? marks[i + 1].index : src.length,
  }));

  const last = spans[spans.length - 1];
  const tail = src.slice(last.from, last.to);
  const helperAt = tail.search(TRAILING_HELPER);
  let shared = '';
  if (helperAt > 0) {
    shared = tail.slice(helperAt);
    last.to = last.from + helperAt;
  }

  for (const s of spans) {
    handlers.push({
      file, verb: s.verb, path: s.path,
      line: src.slice(0, s.from).split('\n').length,
      body: src.slice(s.from, s.to) + shared,
    });
  }
}
if (handlers.length < 20) {
  console.error(`check:authz — parsed only ${handlers.length} handlers.`);
  console.error('A gate that finds almost no routes checks almost nothing. Refusing to.');
  process.exit(1);
}

/* ---- 3. what each handler checks, and what it discloses ---- */

/* `"perm"` optionally cast — routes.export.ts writes
   `can(role as never, "org.export" as Permission)`. */
const PERM_ARG = String.raw`"([a-z.]+)"(?:\s+as\s+\w+)?`;
const CHECK_G = new RegExp(String.raw`\b(?:can|guard)\(\s*[^,)]+,\s*${PERM_ARG}\s*\)`, 'g');
/* A refusal clause: an `if` whose body returns 403. Its condition holds
   every permission that gates the handler at the door. */
const CLAUSE_G = /\bif\s*\(([\s\S]{0,400}?)\)\s*\{?\s*(?:\n\s*)?return\s+reply\s*\n?\s*\.?\s*\.code\(403\)/g;
const BOUND_G = new RegExp(
  String.raw`\b(?:const|let)\s+([a-zA-Z][a-zA-Z0-9]*)\s*=\s*(?:can|guard)\(\s*[^,)]+,\s*${PERM_ARG}\s*\)`,
  'g'
);
/* COUNT, GROUPBY AND AGGREGATE RETURN NUMBERS, NOT ROWS. Reading "how
   many changes are unreviewed" is not reading a change. Treating a
   count as a disclosure reported /api/v1/picture twice for the same
   model — once for the figure and once for the rows — and the figure
   was never the problem. */
const QUERY_G = /\b(?:prisma|tx)\.([a-zA-Z][a-zA-Z0-9]*)\.(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow)\b/g;

/* ---- the relation graph, so a nested read is attributed correctly ----

   WITHOUT THIS THE GATE INVENTS FINDINGS. GET /api/v1/register reads
   the whole register as `prisma.hazard.findMany({ select: { assessments:
   … } })` — the risk assessments arrive through a RELATION, so a
   model-name scan never sees riskAssessment read there at all. The
   register's own audience then went missing from riskAssessment's home,
   and /api/v1/picture was reported for disclosing it to the very roles
   the register already serves. A false positive on a route that is fine
   is how a gate gets deleted rather than fixed.

   It cuts the other way too: /api/v1/picture reaches SafetyReport's
   hrcTags through hazard → report, and that read only exists nested. */
const schema = readFileSync('prisma/schema.prisma', 'utf8');
const MODELS = new Set([...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]));
const RELATIONS = new Map();
for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const fields = new Map();
  for (const f of m[2].matchAll(/^\s{2}(\w+)\s+(\w+)(\[\])?\??/gm)) {
    if (MODELS.has(f[2])) fields.set(f[1], f[2]);
  }
  /* Prisma's client lowercases the first letter of the model name. */
  RELATIONS.set(m[1][0].toLowerCase() + m[1].slice(1), fields);
}
if (RELATIONS.size < 10) {
  console.error(`check:authz — parsed only ${RELATIONS.size} models out of the schema.`);
  console.error('Without the relation graph a nested read is invisible. Refusing to.');
  process.exit(1);
}

/** The balanced `{...}` beginning at `open`. */
function block(src, open) {
  let depth = 0;
  for (let p = open; p < src.length; p += 1) {
    if (src[p] === '{') depth += 1;
    else if (src[p] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, p + 1);
    }
  }
  return src.slice(open);
}

/**
 * Every model this query reads, and the columns it names of each —
 * following `select`/`include` through relations. Columns are null when
 * the query names none, which means every column.
 */
function readsOf(args, model) {
  const out = new Map();
  const walk = (region, m, depth) => {
    if (depth > 4 || !region) return;
    const at = /\b(?:select|include):\s*\{/.exec(region);
    if (!at) {
      /* No projection at this level: every column of this model. */
      if (!out.has(m)) out.set(m, null);
      return;
    }
    const body = block(region, at.index + at[0].length - 1);
    const cols = [];
    const rel = RELATIONS.get(m) ?? new Map();
    for (const k of body.matchAll(/\b([a-zA-Z][a-zA-Z0-9]*)\s*:/g)) {
      const key = k[1];
      const related = rel.get(key);
      if (related) {
        const sub = body.indexOf('{', k.index + k[0].length - 1);
        walk(sub === -1 ? '' : block(body, sub),
          related[0].toLowerCase() + related.slice(1), depth + 1);
      } else {
        cols.push(key);
      }
    }
    const prev = out.get(m);
    if (prev === null) return;
    out.set(m, [...(prev ?? []), ...cols]);
  };
  walk(args, model, 0);
  return out;
}

const facts = [];
for (const h of handlers) {
  const bound = new Map([...h.body.matchAll(BOUND_G)].map((m) => [m[1], m[2]]));

  /* Entry audience: intersection over refusal clauses, union within
     each — `if (!a && !b) 403` admits holders of either. */
  let entry = new Set(ALL_ROLES);
  const entryPerms = [];
  for (const c of h.body.matchAll(CLAUSE_G)) {
    const perms = [...c[1].matchAll(CHECK_G)].map((m) => m[1]);
    /* A clause naming a bound variable is gated by that permission too. */
    for (const [name, perm] of bound) {
      if (new RegExp(`\\b${name}\\b`).test(c[1])) perms.push(perm);
    }
    if (perms.length === 0) continue;
    entryPerms.push(perms);
    entry = intersect(entry, rolesHoldingAny(perms));
  }

  const marks = [...h.body.matchAll(QUERY_G)];
  for (let i = 0; i < marks.length; i += 1) {
    const m = marks[i];
    const prevEnd = i > 0 ? marks[i - 1].index + marks[i - 1][0].length : 0;
    const nextAt = i + 1 < marks.length ? marks[i + 1].index : h.body.length;

    /* THE GUARD WINDOW IS THE QUERY'S OWN EXPRESSION AND NOTHING ELSE.
       An earlier version took everything from the last blank line to
       the next query, which in routes.picture.ts — where twelve queries
       sit in one Promise.all — swept the NEXT query's ternary guard
       into THIS query's coverage. That narrows the computed audience,
       and a narrower audience is fewer findings: the bug direction that
       makes a gate quietly stop working.

       So: backwards only as far as the previous query ended (catching
       `mayReadTraining ?` immediately before), and forwards only to the
       close of this query's own argument list (catching `wide` inside a
       `where`). */
    const before = h.body.slice(prevEnd, m.index);
    const args = (() => {
      const open = h.body.indexOf('(', m.index + m[0].length - 1);
      if (open === -1 || open > nextAt) return '';
      let depth = 0;
      for (let p = open; p < h.body.length && p < nextAt; p += 1) {
        if (h.body[p] === '(') depth += 1;
        else if (h.body[p] === ')') {
          depth -= 1;
          if (depth === 0) return h.body.slice(open, p + 1);
        }
      }
      return h.body.slice(open, nextAt);
    })();
    const region = before + args;

    let roles = entry;
    const perms = entryPerms.flat();
    for (const [name, perm] of bound) {
      if (new RegExp(`\\b${name}\\b`).test(region)) {
        roles = intersect(roles, rolesHoldingAny([perm]));
        perms.push(perm);
      }
    }

    /* One query, possibly several models — the root and anything it
       reaches through a relation. */
    for (const [model, cols] of readsOf(args, m[1])) {
      facts.push({
        ...h, model, cols,
        discloses: cols === null || cols.some((c) => c !== 'id'),
        perms: [...new Set(perms)], roles,
      });
    }
  }
}

const disclosures = facts.filter((f) => f.discloses);
const byModel = new Map();
for (const f of disclosures) {
  if (!byModel.has(f.model)) byModel.set(f.model, []);
  byModel.get(f.model).push(f);
}
if (disclosures.length < 40) {
  console.error(`check:authz — found only ${disclosures.length} disclosing queries.`);
  console.error('A gate that reads almost nothing passes almost everything. Refusing to.');
  process.exit(1);
}

/* ---- 4. the finding ---- */

if (process.argv.includes('--matrix')) {
  console.log(`\nroles ${ROLES.size} · handlers ${handlers.length} · ` +
    `queries ${facts.length} · disclosures ${disclosures.length}\n`);
  for (const [model, fs] of [...byModel].sort()) {
    console.log(`── ${model}`);
    for (const f of [...fs].sort((a, b) => a.roles.size - b.roles.size)) {
      console.log(`   ${String(f.roles.size).padStart(2)}  ` +
        `[${f.perms.join(', ') || 'NO CHECK'}]`.padEnd(48) + `${f.verb} ${f.path}`);
    }
  }
  console.log();
  process.exit(0);
}

/* A MODEL'S HOME IS THE ROUTE FILE THAT WRITES IT, and the audience its
   own file grants is the one a foreign reader must not exceed.

   THE FIRST VERSION OF THIS COMPARED EACH READER AGAINST EVERY OTHER
   READER AND REPORTED SIXTEEN FINDINGS, fifteen of them noise. The
   cause is worth recording because it is the shape of a gate that would
   have been deleted rather than fixed: /api/v1/export reads almost
   every model behind `org.export`, which two roles hold, so it became
   the narrowest peer of nearly everything — and every PRIMARY endpoint
   was then "wider than its peers". The rule was measuring the wrong
   thing while sounding right.

   What actually distinguishes the defect is not width. It is that
   /api/v1/picture read a model belonging to somebody else's endpoint.
   /api/v1/sms/documents is not suspicious for admitting seven roles to
   controlledDocument — it is the documents endpoint, and it defines
   what reading a document requires. So ownership is the axis, and
   writes are how ownership is discovered: whoever creates a row decides
   who may read it. */
const WRITE_G = /\b(?:prisma|tx)\.([a-zA-Z][a-zA-Z0-9]*)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/g;
const homeOf = new Map();
for (const h of handlers) {
  for (const m of h.body.matchAll(WRITE_G)) {
    if (!homeOf.has(m[1])) homeOf.set(m[1], new Set());
    homeOf.get(m[1]).add(h.file);
  }
}

const problems = [];
const unowned = [];
for (const [model, fs] of byModel) {
  const home = homeOf.get(model);
  /* A model nothing writes has no owner to compare against — reference
     data, or a row this API only ever reads. Named below rather than
     passed over, so the set cannot grow unnoticed. */
  if (!home || home.size === 0) { unowned.push(model); continue; }

  /* What the owning file grants. Its disclosing reads first; if it only
     writes the model, whoever may write it may evidently see it. */
  const homeRoles = new Set();
  for (const g of fs) if (home.has(g.file)) for (const r of g.roles) homeRoles.add(r);
  if (homeRoles.size === 0) {
    for (const h of handlers) {
      if (!home.has(h.file) || !WRITE_G.test(h.body)) continue;
      WRITE_G.lastIndex = 0;
      const w = facts.find((x) => x.file === h.file && x.path === h.path && x.verb === h.verb);
      if (w) for (const r of w.roles) homeRoles.add(r);
    }
  }

  for (const f of fs) {
    if (home.has(f.file)) continue;
    /* `org.export` IS the whole record, by construction, so a route
       behind it is not a foreign reader of anything — it is the
       operator taking a copy of its own file.

       This is a statement about what the permission MEANS rather than a
       waiver of the rule. permissions.ts puts it plainly against
       ACCOUNTABLE_EXECUTIVE: "Data ownership that depends on the safety
       manager still being employed is not ownership." An export that
       omitted the training matrix because the exporting post cannot
       open the training screen would be a broken export, and narrowing
       it to satisfy this gate would damage the product to quiet a
       check. The permission is asserted to still exist below, so this
       cannot come to cover a renamed or deleted one. */
    if (f.perms.includes(EXPORT_PERMISSION)) continue;
    const extra = [...f.roles].filter((r) => !homeRoles.has(r));
    if (extra.length === 0) continue;
    problems.push(
      `${f.file}:${f.line}  ${f.verb} ${f.path}\n` +
      `      discloses ${model} to ${extra.sort().join(', ')}.\n` +
      `      ${model} belongs to ${[...home].join(', ')}, which admits only ` +
      `[${[...homeRoles].sort().join(', ') || 'nobody'}].\n` +
      `      this route checks [${f.perms.join(', ') || 'nothing'}] and reads ` +
      `${f.cols === null ? 'EVERY column (no select)' : f.cols.join(', ')}`
    );
  }
}

if (problems.length) {
  console.error('check:authz — a route discloses a model more widely than any other:\n');
  for (const p of problems) console.error(`  · ${p}\n`);
  console.error(
    '  Gate the read on the permission its own endpoint requires, and NAME what a\n' +
    '  caller was not shown rather than silently returning a smaller number.\n' +
    '  See /api/v1/picture for the shape. Do not widen the other route to match.\n'
  );
  process.exit(1);
}

console.log(
  `  authz ok         ${handlers.length} handlers, ${disclosures.length} disclosing reads ` +
  `over ${byModel.size} models` +
  (unowned.length ? `; ${unowned.length} unowned (${unowned.sort().join(', ')})` : '')
);
