#!/usr/bin/env node
/* ============================================================
   Brand gate — runs in `npm run build`, before anything is bundled.

   This exists because the identity artwork ships two combinations that
   cannot be read:

     · white "CAUTION" on Savannah Gold          2.16:1
     · Deep Terracotta beside Ochre Red          1.40:1 against each other

   Both are easy to reintroduce by eye, because both look fine at badge
   size on a designer's calibrated monitor and neither looks fine on a
   sunlit ramp. So they are not a style note in a document nobody opens
   during a sprint — they are an exit code.

   CHARTER RULE 11 — a check that stops checking must fail. Every
   assertion below names a token, and a token that has been renamed or
   deleted is a FAILURE, not a silent pass. A guard whose subject has
   been removed is indistinguishable from a guard that passed, and that
   is worse than having no guard.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLESHEET = resolve(HERE, '../apps/web/src/style.css');

/* A token that has gone missing is a first-class gate failure, so it is
   reported like one. Without this the run still exits non-zero — but it
   does so behind forty lines of `at ModuleJob.run`, and the one sentence
   naming the token scrolls off the top. */
process.on('uncaughtException', (err) => {
  if (err && err.name === 'MissingToken') {
    console.error(`\nBrand gate failed — a token this gate depends on is gone:\n`);
    console.error(`  · ${err.message}\n`);
    process.exit(1);
  }
  throw err;
});

/* ---------------------------- WCAG ---------------------------- */

/** Relative luminance, WCAG 2.2 §1.4.3. */
function luminance(hex) {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Contrast ratio between two #rrggbb colours. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_TEXT = 4.5; // normal-size body text
const AA_NONTEXT = 3.0; // borders, focus rings, meaningful graphics

/* The risk-fill floors. Deliberately below 3.0, and the reason is in the
   RISK block of style.css: three fills cannot all clear 3:1 against each
   other inside a light palette, so asserting 3.0 would assert something
   unsatisfiable. These two are what rejected the first two drafts of the
   scale — a mid green at 1.10:1 against Ochre Red, then a pale green
   that disappeared into Warm Sand. */
const RISK_FILL_MIN = 2.4;
const RISK_FILL_CVD_MIN = 1.7;

/* ------------- Colour vision deficiency simulation -------------
   Brettel/Viénot-style linear approximations in linear-light sRGB.
   These are approximations and are used as a REGRESSION FLOOR, not as
   a clinical claim: their job is to fail the build when a future
   repaint puts two risk states back on the same perceived colour, which
   is exactly what a red/green scale does by default. */
const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

const CVD = {
  protanopia: [
    [0.152, 1.053, -0.205],
    [0.115, 0.786, 0.099],
    [-0.004, -0.048, 1.052]
  ],
  deuteranopia: [
    [0.367, 0.861, -0.228],
    [0.28, 0.673, 0.047],
    [-0.012, 0.043, 0.969]
  ],
  tritanopia: [
    [1.256, -0.077, -0.179],
    [-0.078, 0.931, 0.148],
    [0.005, 0.691, 0.304]
  ]
};

/** Simulate how a colour is seen under a given dichromacy. */
function simulate(hex, kind) {
  const rgb = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  return (
    '#' +
    CVD[kind]
      .map((row) => {
        const v = Math.max(0, Math.min(1, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]));
        return Math.round(toSrgb(v) * 255)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

/* --------------------- Token extraction ----------------------- */

const css = readFileSync(STYLESHEET, 'utf8');

/**
 * Resolve a custom property to a literal #rrggbb, following var()
 * indirection. Throws if the token is absent or does not resolve to a
 * hex literal — that is rule 11 in force: an assertion about a token
 * that no longer exists must fail loudly.
 */
function token(name, seen = new Set()) {
  /* A missing token is a rule-11 failure and deserves the same clean,
     actionable output a contrast failure gets. Raised as MissingToken so
     the top-level handler can print it without a Node stack trace — a
     wall of `at ModuleJob.run` teaches nobody which token moved. */
  if (seen.has(name)) {
    throw new Error(`--${name} resolves in a cycle`);
  }
  seen.add(name);

  const declaration = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(css);
  if (!declaration) {
    const err = new Error(
      `--${name} is not defined in apps/web/src/style.css.\n` +
        `    This gate asserts something about that token, so its absence is a\n` +
        `    FAILURE and not a skipped check. If the token was renamed, rename it\n` +
        `    here too. If it was deleted, delete the assertion deliberately —\n` +
        `    charter rule 11: a check that stops checking must fail.`
    );
    err.name = 'MissingToken';
    throw err;
  }

  const value = declaration[1].trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();

  const indirect = /^var\(\s*--([\w-]+)\s*\)$/.exec(value);
  if (indirect) return token(indirect[1], seen);

  throw new Error(`--${name} is "${value}", which is not a hex literal or a var() reference`);
}

/* ------------------------- Assertions ------------------------- */

const failures = [];
const checks = [];

function expect(label, ratio, floor) {
  const ok = ratio >= floor;
  checks.push({ label, ratio, floor, ok });
  if (!ok) {
    failures.push(`${label}: ${ratio.toFixed(2)}:1, needs ${floor.toFixed(1)}:1`);
  }
}

/* The two grounds every light-scheme colour has to survive. There is no
   third: UsalamaSMS ships no dark scheme, deliberately (docs/04-BRAND.md). */
const WHITE = '#ffffff';
const SAND = token('us-sand');
const CHARCOAL = token('us-charcoal');

/* 1. Brand colours used as WORDS must clear the body-text floor on both
      grounds. This is the assertion the four *-text siblings exist for. */
for (const name of ['us-terracotta-text', 'us-gold-text', 'us-teal-text', 'us-ochre-text']) {
  expect(`--${name} on white`, contrast(token(name), WHITE), AA_TEXT);
  expect(`--${name} on Warm Sand`, contrast(token(name), SAND), AA_TEXT);
}

/* 2. Every risk step's own foreground, against its own fill. Specified
      per step because they genuinely differ — gold takes charcoal, the
      other two take white — and the artwork got this wrong. */
for (const step of ['intolerable', 'tolerable', 'acceptable']) {
  expect(
    `risk ${step}: foreground on fill`,
    contrast(token(`us-risk-${step}-on`), token(`us-risk-${step}`)),
    AA_TEXT
  );
  expect(
    `risk ${step}: word on white`,
    contrast(token(`us-risk-${step}-text`), WHITE),
    AA_TEXT
  );
}

/* 3. THE COLLISION GATE. The three risk fills must be mutually
      distinguishable as non-text graphics. This is what catches Deep
      Terracotta being pressed into service as a fourth risk step, or
      Ochre Red drifting toward Terracotta in a future repaint. */
const riskFills = ['intolerable', 'tolerable', 'acceptable'].map((s) => ({
  step: s,
  hex: token(`us-risk-${s}`)
}));

for (let i = 0; i < riskFills.length; i++) {
  for (let j = i + 1; j < riskFills.length; j++) {
    const a = riskFills[i];
    const b = riskFills[j];

    expect(`risk fills: ${a.step} vs ${b.step}`, contrast(a.hex, b.hex), RISK_FILL_MIN);

    /* And again through each dichromacy. A red/green scale passes the
       plain check and fails these — which is the entire reason they
       are here rather than in a design review comment. */
    for (const kind of Object.keys(CVD)) {
      expect(
        `risk fills (${kind}): ${a.step} vs ${b.step}`,
        contrast(simulate(a.hex, kind), simulate(b.hex, kind)),
        RISK_FILL_CVD_MIN
      );
    }
  }
}

/* Each fill must also be visible AGAINST THE PAGE. This is the check
   that killed the pale-green draft: it cleared every pairwise test and
   was 1.06:1 against Warm Sand, so ten cells of the matrix rendered as
   blank page. */
for (const { step, hex } of riskFills) {
  expect(`risk fill ${step} vs white ground`, contrast(hex, WHITE), 1.35);
  expect(`risk fill ${step} vs Warm Sand ground`, contrast(hex, SAND), 1.35);
}

/* 4. Deep Terracotta is not on the risk scale, and this is the check
      that says so. It is 1.40:1 against Ochre Red — as a risk colour it
      would be invisible next to INTOLERABLE. Asserting the *absence* of
      a value is unusual, and it is the whole point: the failure mode
      here is a well-meaning future edit, not a typo. */
const TERRACOTTA = token('us-terracotta');
for (const { step, hex } of riskFills) {
  if (hex === TERRACOTTA) {
    failures.push(
      `risk ${step} is Deep Terracotta (${hex}). Terracotta is 1.40:1 ` +
        `against Ochre Red and must never appear on the tolerability ` +
        `scale — see the RISK block in style.css.`
    );
  }
}

/* 5. Body ink on both grounds, and the focus ring as a non-text graphic
      against both. A focus ring nobody can see is a keyboard user
      locked out of a hazard report. */
expect('body ink on white', contrast(token('us-ink-900'), WHITE), AA_TEXT);
expect('body ink on Warm Sand', contrast(token('us-ink-900'), SAND), AA_TEXT);
expect('tertiary ink on white', contrast(token('us-ink-600'), WHITE), AA_TEXT);
expect('tertiary ink on Warm Sand', contrast(token('us-ink-600'), SAND), AA_TEXT);
expect('focus ring on white', contrast(token('us-focus'), WHITE), AA_NONTEXT);
expect('focus ring on Warm Sand', contrast(token('us-focus'), SAND), AA_NONTEXT);

/* 6. Operational state colours, as words on the surfaces they appear on.
      The sync strip sits on Warm Sand. */
for (const name of ['us-state-synced', 'us-state-pending', 'us-state-offline', 'us-state-error']) {
  expect(`--${name} on Warm Sand`, contrast(token(name), SAND), AA_TEXT);
}

/* 7. Categorical colours are chart marks, not text. They need only the
      non-text floor against the surfaces they are drawn on — but they
      DO need it, or a series vanishes. */
for (let i = 1; i <= 6; i++) {
  expect(`--us-cat-${i} on white`, contrast(token(`us-cat-${i}`), WHITE), AA_NONTEXT);
}

/* 8. Charcoal on Savannah Gold — the specific pairing the artwork got
      wrong. Named explicitly so the regression has a test with its own
      line in the output. */
expect('CAUTION label: charcoal on Savannah Gold', contrast(CHARCOAL, token('us-gold')), AA_TEXT);

/* --------------------------- Report --------------------------- */

const width = Math.max(...checks.map((c) => c.label.length));
for (const c of checks) {
  const mark = c.ok ? '  ok  ' : ' FAIL ';
  console.log(`${mark} ${c.label.padEnd(width)}  ${c.ratio.toFixed(2)}:1  (>= ${c.floor.toFixed(1)})`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} contrast failure(s):\n`);
  for (const f of failures) console.error(`  · ${f}`);
  console.error('\nBrand gate failed. Nothing was built.');
  process.exit(1);
}

/* Rule 11 again, from the other direction: if this file ever runs with
   zero assertions — because the loops above were emptied, or a refactor
   dropped the token list — that is a failure. A gate that checks nothing
   passes every time. */
if (checks.length < 30) {
  console.error(
    `\nBrand gate ran only ${checks.length} assertions, which is fewer than ` +
      `this file is known to contain. Something removed checks without ` +
      `removing this guard. Failing rather than reporting a green sweep.`
  );
  process.exit(1);
}

console.log(`\nBrand gate passed — ${checks.length} assertions, no dark scheme to double them.`);
