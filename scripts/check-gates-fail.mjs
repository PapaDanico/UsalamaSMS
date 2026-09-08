#!/usr/bin/env node
/* =====================================================================
   THE GATES, PROVED TO STILL REJECT WHAT THEY WERE WRITTEN TO REJECT.

   A gate is worth what its failure is worth, and a gate nobody has
   watched fail is a gate nobody has tested. This repository has met
   that four times — a CSS gate reading stdout while esbuild wrote to
   stderr, a smoke check measuring a send it had itself prevented, a
   timezone test green in UTC where both implementations agree, a
   culture test asserting array order while claiming to assert a
   minimum. Each passed perfectly while checking nothing.

   So every mutation below puts a real defect back and asserts the gate
   goes RED. If a gate starts accepting its own mutation, this fails
   instead of quietly going green.

   ------------------------------------------------------------
   WHY IT IS A SCRIPT AND NOT A WORKFLOW. It was eleven `run:` blocks
   in `.github/workflows/check.yml`, and GitHub Actions has not
   executed a step in this repository since 19 August 2026 —
   `runner_id: 0`, three to six seconds, 834 runs. Measured again on 8
   September with a workflow carrying NO checkout, NO npm and one
   `echo`: it failed in four seconds like all the others, which settles
   by experiment what that file previously concluded by reading
   failures. Nothing in this repository's YAML can fix it.

   The mutations were the most valuable thing in that file and the
   least portable. Here they run anywhere Node runs — including inside
   the Netlify build, which is the one machine that both publishes and
   still executes.

   ------------------------------------------------------------
   RESTORING IS THE HALF THAT GOES WRONG. CLAUDE.md records a mutation
   matrix whose six clean passes were all worthless: the file was
   untracked, `git checkout --` on an untracked path exits 0 and does
   nothing, and every mutation after the first stacked on the damage
   before it. A mutation that could not fail alone was indistinguishable
   from one that could.

   So nothing here trusts git. Every target is copied byte-for-byte
   before mutation, restored from that copy, and the restoration is
   CONFIRMED by sha256 before the next mutation runs. That confirmation
   is the step that would have caught it, so it is the step that is not
   optional: a failed restore aborts the whole run rather than carrying
   damage forward.
   ===================================================================== */
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const p = (rel) => resolve(ROOT, rel);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

/** Run a gate. Returns true when it PASSED (exit 0). */
function gatePasses(script) {
  const r = spawnSync(process.execPath, [p(`scripts/${script}`)], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return r.status === 0;
}

/* ---------------------------------------------------------------
   A mutation over a TRACKED file: copy, edit, run, restore, verify.
   `from` must appear exactly once — a substitution that silently
   matched nothing is a mutation that never happened, and it would
   report the gate as correctly rejecting a defect that was not there.
   --------------------------------------------------------------- */
function editing(file, from, to) {
  return {
    kind: "edit",
    file,
    apply() {
      const original = readFileSync(p(file));
      const text = original.toString();
      const hits = text.split(from).length - 1;
      if (hits !== 1) {
        throw new Error(
          `mutation target appears ${hits} times in ${file}, expected exactly 1 — ` +
            `the source moved and this mutation is no longer putting the defect back`,
        );
      }
      writeFileSync(p(file), text.replace(from, to));
      return original;
    },
    restore(original) {
      writeFileSync(p(file), original);
      const now = readFileSync(p(file));
      if (sha(now) !== sha(original)) {
        throw new Error(`RESTORE FAILED for ${file} — refusing to continue`);
      }
    },
  };
}

/* A mutation that ADDS a file. Restoring means it is gone again. */
function adding(file, contents) {
  return {
    kind: "add",
    file,
    apply() {
      mkdirSync(dirname(p(file)), { recursive: true });
      writeFileSync(p(file), contents);
      return null;
    },
    restore() {
      rmSync(p(file), { force: true });
      if (existsSync(p(file))) throw new Error(`RESTORE FAILED: ${file} still present`);
    },
  };
}

/* ---------------------------------------------------------------
   THE MATRIX. Every entry says what shipped, because a mutation whose
   reason is not written down is one somebody deletes when it becomes
   inconvenient.
   --------------------------------------------------------------- */
const MUTATIONS = [
  {
    name: "a mid-green risk scale",
    gate: "check-brand.mjs",
    why: "1.10:1 against Ochre Red — a risk scale that collapses under dichromacy",
    mutation: editing(
      "apps/web/src/style.css",
      "--us-risk-acceptable: #08301c;",
      "--us-risk-acceptable: #1f7a4d;",
    ),
  },
  {
    name: "a token renamed out from under an assertion",
    gate: "check-brand.mjs",
    why: "charter rule 11 — a gate asserting on a token that no longer exists must fail, not pass",
    mutation: editing("apps/web/src/style.css", "--us-ochre-text:", "--us-ochre-text-RENAMED:"),
  },
  {
    name: "a rate limit with no plugin behind it",
    gate: "check-claims.mjs",
    why: "the exact state login shipped in: routes declaring config.rateLimit, unbounded",
    mutation: editing(
      "apps/api/src/server.ts",
      'import rateLimit from "@fastify/rate-limit";',
      "",
    ),
  },
  {
    name: "a trial length spelled out that disagrees with TRIAL_DAYS",
    gate: "check-claims.mjs",
    why: "/about promised sixty days against TRIAL_DAYS 30 for weeks — every figure the gate compared was a numeral",
    mutation: editing(
      "apps/web/src/content/pages.js",
      "and thirty days in which",
      "and sixty days in which",
    ),
  },
  {
    name: "a present-tense partial claim with no PARTIAL element",
    gate: "check-claims.mjs",
    why: "the existing assertion iterates the PARTIAL list, and over an empty list it passes",
    mutation: editing(
      "apps/web/src/content/pages.js",
      "title: 'What twelve of twelve does not mean, and",
      "title: 'What is still partial, and",
    ),
  },
  {
    name: "a backtick inside an HTML comment",
    gate: "check-prose.mjs",
    why: "ends the tagged template literal and ships a runtime page error — it has done so three times",
    mutation: adding(
      "apps/web/src/prose-probe.js",
      "const x = html`<!-- see `.foo` for this -->`;\n",
    ),
  },
  {
    name: "prose over the ceiling on its own",
    gate: "check-prose.mjs",
    why:
      "string content no minifier removes, charged to a reporter on a remote strip. Over the " +
      "CEILING rather than over the headroom: a probe sized to the current slack goes green " +
      "the day somebody cleans a few screens",
    mutation: adding(
      "apps/web/src/prose-probe.js",
      "const x = html`<!--" + " padding".repeat(3000) + "-->`;\n",
    ),
  },
  {
    name: "a zero-state whose record is made elsewhere and links nowhere",
    gate: "check-empty-states.mjs",
    why: "/triage shipped saying 'Nothing on this device yet' with href=\"/report\" nowhere in the file",
    mutation: editing("apps/web/src/tools/triage/index.js", 'href="/report"', 'href="#"'),
  },
  {
    name: "a new zero-state with no declaration",
    gate: "check-empty-states.mjs",
    why: "a new screen would ship without anybody deciding where its first record is made",
    mutation: adding(
      "apps/web/src/tools/coverage/zero-probe.js",
      'export const probe = () => `<p class="empty-state"><span>Nothing yet.</span></p>`;\n',
    ),
  },
  {
    name: "the Supabase Data API snippet",
    gate: "check-data-api.mjs",
    why: "the exact snippet the Netlify extension tells you to paste; it would fail three ways at runtime and this catches it in the pull request",
    mutation: adding(
      "apps/web/src/data-api-probe.js",
      [
        "import { createClient } from '@supabase/supabase-js';",
        "export const supabase = createClient(",
        "  process.env.SUPABASE_DATABASE_URL,",
        "  process.env.SUPABASE_ANON_KEY",
        ");",
        "",
      ].join("\n"),
    ),
  },
  {
    name: "an analytics vendor imported on every page load",
    gate: "check-third-party.mjs",
    why: "/privacy says there is no analytics vendor and /terms says it in different words; vercel[bot] added exactly this in September",
    mutation: adding(
      "apps/web/src/analytics-probe.js",
      "import { inject } from '@vercel/analytics';\ninject();\n",
    ),
  },
];

/* A source-level rule rather than a mutation: check:deliverables must
   measure a bounding box. Its first version counted DOM nodes, and
   `.print-id { display: none }` left it green — the element present,
   the pack printing anonymous, and existence unable to tell those
   apart. The gate itself needs the built bundle, so what is guarded
   here is that it has not quietly gone back to counting. */
const SOURCE_RULES = [
  {
    name: "check:deliverables measures paint, not DOM presence",
    file: "scripts/check-deliverables.mjs",
    must: "getBoundingClientRect",
    why: "a gate that counts elements passes over a print identity block hidden by display:none — mutation-checked, it did",
  },
];

/* GUARDS ITS OWN SUBJECT. A matrix that lost its entries would report
   a clean sweep over nothing, which is the failure this whole file
   exists to refuse. */
const MINIMUM = 10;

function main() {
  if (MUTATIONS.length < MINIMUM) {
    console.error(
      `check:gates-fail has ${MUTATIONS.length} mutations, fewer than ${MINIMUM} — ` +
        `this check has lost its subject`,
    );
    process.exit(1);
  }

  const failures = [];
  let proved = 0;

  for (const m of MUTATIONS) {
    let saved;
    try {
      saved = m.mutation.apply();
    } catch (error) {
      failures.push(`${m.name}: could not apply — ${error.message}`);
      continue;
    }

    let accepted;
    try {
      accepted = gatePasses(m.gate);
    } finally {
      /* Restore FIRST and unconditionally. A thrown gate must not leave
         the working tree carrying a deliberate defect. */
      m.mutation.restore(saved);
    }

    if (accepted) {
      failures.push(
        `${m.gate} ACCEPTED ${m.name} — ${m.why}. The gate has stopped checking.`,
      );
    } else {
      proved += 1;
      console.log(`  rejected  ${m.name}  (${m.gate})`);
    }
  }

  for (const rule of SOURCE_RULES) {
    const text = readFileSync(p(rule.file), "utf8");
    if (!text.includes(rule.must)) {
      failures.push(`${rule.file} no longer contains ${rule.must} — ${rule.why}`);
    } else {
      proved += 1;
      console.log(`  holds     ${rule.name}`);
    }
  }

  /* AND THE RESTORED SOURCES MUST PASS. Every mutation above restores,
     and each restoration is sha256-confirmed — but the confirmations
     are per-file and this is the whole tree at once. If the sweep left
     anything behind, the gates say so here rather than in the next
     person's unrelated pull request. */
  const after = ["check-brand.mjs", "check-claims.mjs", "check-prose.mjs", "check-empty-states.mjs"];
  for (const gate of after) {
    if (!gatePasses(gate)) {
      failures.push(
        `${gate} FAILS on the restored tree — the sweep left damage behind, ` +
          `which makes every result above untrustworthy`,
      );
    }
  }

  if (failures.length) {
    console.error("\ncheck:gates-fail — the gates are not all still gating:\n");
    for (const f of failures) console.error(`  · ${f}`);
    process.exit(1);
  }

  console.log(`\ncheck:gates-fail ok — ${proved} gates proved to still reject their own defect.`);
}

main();
