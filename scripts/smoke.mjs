#!/usr/bin/env node
/* ============================================================
   Smoke tests — drives the BUILT app in a real browser.

   The unit tests and the source-level guards cover what can be checked
   without a DOM. They cannot tell you that the app renders, that the
   router resolves, that the service worker installs, or that a report
   filed with the radio off is still there afterwards — and those are
   the properties the product is actually sold on.

   Everything below runs against dist/, not against source. A test that
   passes on source and fails on the bundle is a test that has never
   protected a user.

   THE CENTRAL TEST is `files a report with the network cut`. If that
   one fails, the product does not do the thing its strategy document
   says it exists to do.

   ONE RULE LEARNED THE EXPENSIVE WAY: never assert on something whose
   layout depends on browser behaviour rather than on this project's
   CSS. CI installs its own Chromium and this environment provides one
   at PLAYWRIGHT_BROWSERS_PATH; the two are not guaranteed to be the
   same build. A check that measured a child of a collapsed <details>
   therefore passed locally and failed in CI on the same commit — a
   guard whose verdict depends on which browser ran it is worse than no
   guard, because it teaches everyone to hit re-run.

   Set state explicitly (`el.open = true`) rather than toggling it, and
   assert visibility before trusting a measurement.
   ============================================================ */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('FATAL: dist/index.html not found. Run `npm run build` first.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

/* ============================================================
   A static server that serves what NETLIFY WOULD SERVE.

   THE DEFECT THIS CLOSES. It used to fall back to index.html for every
   unmatched path, under a comment saying it "mirrors the SPA fallback
   Netlify provides". Netlify provided nothing of the kind: netlify.toml
   had no [[redirects]] at all, so on the deployed site /report,
   /triage, /account and /design were the platform's 404 page. Only the
   root worked, and only because dist/index.html happens to be there.

   Two checks in this file exist specifically to prove a deep link
   resolves — one of them named "the offline claim, at the URL a person
   is on" — and both passed for the whole life of the project against a
   fallback the production host did not have. A test server that is more
   forgiving than the real one does not test the deployment; it tests
   itself.

   So the rules are READ FROM netlify.toml. Delete the redirect block
   and the deep-link checks fail here, which is how the fix was
   verified.
   ============================================================ */
const REDIRECTS = (() => {
  const toml = readFileSync(resolve(ROOT, 'netlify.toml'), 'utf8');
  const rules = [];
  // Deliberately a small reader rather than a TOML dependency: it
  // handles the [[redirects]] tables this file needs and REFUSES the
  // rest, so a rule shape it cannot model is an error rather than a
  // silent omission that would put the lie back.
  for (const block of toml.split(/\[\[redirects\]\]/).slice(1)) {
    const body = block.split(/\n\[/)[0];
    const read = (key) => new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\n]+)"?`, 'm').exec(body)?.[1]?.trim();
    const from = read('from');
    const to = read('to');
    const status = Number(read('status') ?? 301);
    const force = /^\s*force\s*=\s*true/m.test(body);
    if (!from || !to) continue;
    if (!from.endsWith('/*') || status !== 200) {
      console.error(
        `FATAL: scripts/smoke.mjs models splat rewrites only, and netlify.toml ` +
          `declares ${from} -> ${to} (${status}). Teach this reader that shape ` +
          `rather than letting the suite test a routing table the deploy does not have.`
      );
      process.exit(1);
    }
    rules.push({ prefix: from.slice(0, -1), to, force });
  }
  return rules;
})();

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  let file = join(DIST, pathname);
  const isFile = existsSync(file) && !statSync(file).isDirectory();

  if (pathname === '/') file = join(DIST, 'index.html');
  else if (!isFile) {
    // An existing asset wins over a rewrite unless the rule is forced,
    // which is Netlify's shadowing order — /sw.js and /manifest.json
    // must reach the browser as themselves.
    const rule = REDIRECTS.find((r) => pathname.startsWith(r.prefix));
    if (!rule) {
      res.writeHead(404).end('not found');
      return;
    }
    file = join(DIST, rule.to);
  }

  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const PORT = 4321;
const BASE = `http://127.0.0.1:${PORT}`;


/* The navigation is a header menu now, so reaching a destination on a
   handset is two actions: open, then choose. Wrapped so every call site
   does it the same way and none of them reach into a panel that is
   closed. */
async function navigateTo(page, href) {
  const toggle = page.locator('#menu-toggle');
  if (await toggle.isVisible()) await toggle.click();
  await page.click(`#menu-panel a[href="${href}"]`);
}

/* ============================================================
   THE REGISTRY'S SHAPE, READ FROM THE REGISTRY.

   Four checks below used to hardcode "five jurisdictions, three of them
   provisional". When the three provisional rows were removed — they
   carried a 72-hour deadline no instrument publishes — all four failed
   with messages asserting a registry that no longer existed, and the
   only thing wrong was the numbers typed here.

   Charter rule 10 applies to a test suite as much as to a screen: a
   count about the product is computed, not typed. These are parsed from
   the source so the next change to the list moves the expectation with
   it, and a row added without a UI row still fails.
   ============================================================ */
const REGULATIONS = readFileSync(
  new URL('../packages/shared/src/regulations.ts', import.meta.url),
  'utf8'
);
const JURISDICTION_COUNT = [
  ...(/export const JURISDICTIONS = \[([^\]]+)\]/.exec(REGULATIONS)?.[1] ?? '').matchAll(
    /"([A-Z]{2,4})"/g
  )
].length;
const PROVISIONAL_COUNT = (REGULATIONS.match(/note:\s*\n?\s*"PROVISIONAL/g) ?? []).length;

/* The coverage figure, computed from the same declaration the page
   renders. This was typed as 1.5 and went stale the moment /toolkits/sra
   moved element 3.2 from NOT_BUILT to PARTIAL — the check then failed
   with "the arithmetic says 1.5" while the arithmetic said 2, which is
   a suite asserting its own out-of-date copy of the answer.

   BUILT counts one, PARTIAL a half; ASSESSED_ONLY and NOT_BUILT count
   nothing. Same rule as coverageSummary(), read from the same file. */
const MATURITY = readFileSync(
  new URL('../packages/shared/src/maturity.ts', import.meta.url),
  'utf8'
);
// COVERAGE is wrapped in Object.freeze([...]), so it closes with "]);"
// rather than "];" — the first pattern matched nothing and the check
// exited rather than passing on an empty block, which is the correct
// direction for a guard that cannot read what it is guarding.
const COVERAGE_BLOCK = /export const COVERAGE[\s\S]*?\n\]\);/.exec(MATURITY)?.[0] ?? '';
const COVERED =
  (COVERAGE_BLOCK.match(/state:\s*"BUILT"/g) ?? []).length +
  (COVERAGE_BLOCK.match(/state:\s*"PARTIAL"/g) ?? []).length / 2;
if (COVERED <= 0) {
  console.error('smoke: could not read the COVERAGE states out of maturity.ts.');
  process.exit(1);
}
if (JURISDICTION_COUNT < 2) {
  console.error('smoke: could not read JURISDICTIONS out of the registry.');
  process.exit(1);
}

const results = [];
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    results.push(`  ok   ${name}`);
  } catch (err) {
    failed++;
    results.push(`  FAIL ${name}\n         ${err.message.split('\n')[0]}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await new Promise((r) => server.listen(PORT, r));

/* Resolve Chromium rather than hardcoding a path. PLAYWRIGHT_BROWSERS_PATH
   points at a directory of versioned installs, so the exact binary path
   moves with every browser bump — a hardcoded one works until it does
   not, and then fails on somebody else's machine only. */
function findChromium() {
  if (process.env['CHROME_PATH']) return process.env['CHROME_PATH'];
  const base = process.env['PLAYWRIGHT_BROWSERS_PATH'];
  if (base && existsSync(base)) {
    const candidates = readdirSync(base)
      .filter((d) => d.startsWith('chromium-'))
      .sort()
      .reverse()
      .map((d) => join(base, d, 'chrome-linux', 'chrome'))
      .filter((p) => existsSync(p));
    if (candidates[0]) return candidates[0];
  }
  return undefined; // let playwright resolve its own download
}

const browser = await chromium.launch({ executablePath: findChromium() });

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 } // a mid-range Android, not a desktop
  });
  const page = await context.newPage();

  /* Any uncaught page error fails the run. A console full of exceptions
     that nobody reads is how a broken screen ships looking fine. */
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  /* Every request that leaves our own origin, collected from the first
     navigation. The product's claim is that a safety narrative reaches
     the safety office and nobody else; a font, an analytics beacon or a
     CDN script is a request to somebody else, and the deployed CSP
     forbids them. This suite runs against a local server with no CSP,
     so nothing here would stop one — which is exactly why it is
     counted rather than assumed. */
  const offOrigin = [];
  page.on('request', (req) => {
    try {
      const host = new URL(req.url()).hostname;
      if (host !== '127.0.0.1' && host !== 'localhost') offOrigin.push(req.url());
    } catch {
      /* data: and blob: URLs have no host and go nowhere. */
    }
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  await check('the app renders', async () => {
    assert(await page.locator('.band-dark h1').isVisible(), 'the landing page did not render');
    assert(await page.locator('.us-mark').first().isVisible(), 'the mark did not render');
  });

  await check('no uncaught page errors on load', async () => {
    assert(pageErrors.length === 0, `page errors: ${pageErrors.join('; ')}`);
  });

  await check('THE HOUSE FACE LOADS, AND ITS WEIGHTS ARE REAL ONES', async () => {
    /* Two failures this catches, and both look correct in a screenshot.

       ONE: the face does not load at all and the page renders in the
       system sans. That is not hypothetical here — fonts.css declared
       NOTHING for the whole early life of the project while --us-font
       named a family first, so every layout was designed against
       metrics the browser never had. It was invisible in headless
       Chromium, whose default sans is close enough, and obvious on a
       handset.

       TWO — the new one, and the reason this check measures rather than
       inspects. DM Sans ships as a VARIABLE face covering 400 to 700.
       Declare a single `font-weight: 400` on it and the browser still
       serves every rule that asks for bold: it SYNTHESISES one by
       smearing the regular. It looks approximately right, it survives
       review, and the metrics the type hierarchy was built on are gone.
       The sibling product shipped four @font-face rules pointing at four
       byte-identical copies of this same file for exactly that reason —
       four names read as four faces to everyone who looked.

       A synthesised bold gives itself away in the widths: with only a
       400 face, 400 and 500 render identically and 600 and 700 render
       identically, because synthesis has one setting. A real axis moves
       at every stop. So the assertion is STRICTLY increasing, which no
       synthesis can satisfy. */
    const type = await page.evaluate(async () => {
      await document.fonts.ready;
      const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
      const el = document.createElement('span');
      el.style.cssText =
        'position:absolute;visibility:hidden;white-space:nowrap;font-size:40px;font-family:"DM Sans"';
      el.textContent = 'Hazard identification 0123';
      document.body.appendChild(el);
      const widths = {};
      for (const w of [400, 500, 600, 700]) {
        el.style.fontWeight = String(w);
        widths[w] = el.getBoundingClientRect().width;
      }
      el.style.fontFamily = 'no-such-family-xyz';
      el.style.fontWeight = '400';
      const fallback = el.getBoundingClientRect().width;
      el.remove();
      return { loaded, widths, fallback, body: getComputedStyle(document.body).fontFamily };
    });

    assert(
      type.loaded.includes('DM Sans'),
      'no DM Sans face reported as loaded, so the page is rendering in the system ' +
        `fallback while claiming ${type.body.split(',')[0]}. Faces loaded: ` +
        `${type.loaded.length ? [...new Set(type.loaded)].join(', ') : 'none'}`
    );
    assert(
      /^"?DM Sans"?/.test(type.body.trim()),
      `the body is set in ${type.body.split(',')[0]} rather than the house face`
    );
    assert(
      type.widths[400] !== type.fallback,
      'text at weight 400 measures exactly the same as the system fallback, so the ' +
        'face is declared and not actually being used'
    );

    const stops = [400, 500, 600, 700];
    for (let i = 1; i < stops.length; i += 1) {
      const prev = stops[i - 1];
      const here = stops[i];
      assert(
        type.widths[here] > type.widths[prev],
        `weight ${here} renders ${type.widths[here]}px against ${prev}'s ${type.widths[prev]}px. ` +
          'Equal or narrower means the variable axis is not being instanced and the ' +
          'browser is synthesising, which is a smeared regular wearing the metrics of one.'
      );
    }

    /* And it came from our own origin. netlify.toml sets font-src 'self'
       with no CDN exception, so an off-origin font would fail to load
       rather than quietly working — but the CSP is a header on a
       deployed site and this suite runs against a local server, where
       nothing would stop it. A font request is a request, and this
       product's whole claim is about where requests go. */
    assert(
      offOrigin.length === 0,
      `${offOrigin.length} off-origin request(s) during load: ${offOrigin.join(', ')}`
    );
  });

  await check('THE LANDING PAGE CARRIES THE DEADLINES, AND THEY ARE COMPUTED', async () => {
    // The five regulatory rows were the footer of every screen, which
    // made the most consequential claim in the product into the thing a
    // person scrolled past. They are a section here, at an anchor a
    // safety manager can be sent a link to.
    //
    // Rendered from MOR_OBLIGATIONS rather than written into the page —
    // charter rule 10, and the only way a page citing a 24-hour
    // obligation cannot drift from the engine that computes the
    // countdown.
    const section = await page.evaluate(() => {
      const el = document.querySelector('#deadlines');
      if (!el) return null;
      return {
        rows: el.querySelectorAll('.reg-list__row').length,
        text: el.textContent ?? ''
      };
    });

    assert(section, 'there is no #deadlines section on the landing page to link to');
    assert(
      section.rows === JURISDICTION_COUNT,
      `${section.rows} regulatory rows; the registry defines ${JURISDICTION_COUNT}`
    );
    // The Kenyan figure is the one that was wrong for most of this
    // project's life. If this ever prints 72 for KCAA again, that is the
    // original defect resurfacing on a new surface.
    assert(/24 hours/.test(section.text), 'the 24-hour KCAA obligation is not stated');
    assert(/becoming aware/.test(section.text), 'when the clock starts is not stated');
    /* Switch 1 is the highest-risk claim in the product and this is the
       surface somebody checking a deadline lands on. What it has to say
       depends on what is true: which rows are provisional when any are,
       and — when none are — that an unlisted authority gets ICAO's
       "without delay" rather than a borrowed number. */
    assert(
      PROVISIONAL_COUNT
        ? /provisional/i.test(section.text)
        : /without delay/i.test(section.text),
      PROVISIONAL_COUNT
        ? 'which jurisdictions are provisional is not stated'
        : 'the page does not tell an operator outside the listed authorities what applies'
    );
  });

  await check('THE FRONT DOOR REACHES THE FORM IN ONE TAP', async () => {
    // A landing page in front of a thirty-second form is a tax on the
    // person the form was designed for. It is only acceptable because
    // the form is one visible, unscrolled tap away here — and because
    // the manifest's start_url is /report, so nobody who INSTALLED this
    // ever sees this page at all.
    const cta = page.locator('.hero-actions a[href="/report"]');
    assert(await cta.isVisible(), 'the landing page has no visible link to the report form');
    const box = await cta.boundingBox();
    assert(box && box.y < 844, `the "File a report" action is ${Math.round(box?.y ?? 0)}px down, below the first screen`);

    const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
    assert(
      manifest.start_url === '/report',
      `the manifest starts an installed app at ${manifest.start_url}, not on the form`
    );
  });

  /* Everything below drives the report form, which is no longer at the
     root. Navigating once here rather than per check keeps the run at
     one page load. */
  await page.goto(BASE + '/report', { waitUntil: 'networkidle' });

  await check('the report form has exactly three required fields', async () => {
    // The thirty-second target is a design constraint and the whole
    // strategy rests on it, so every required field is a decision made
    // here rather than an accident that accumulated.
    //
    // Three: title, narrative, and report TYPE. Type was added when it
    // stopped being pre-answered — it defaulted to HAZARD, which meant
    // an occurrence filed by someone who did not look at the control
    // never had a regulatory deadline computed, and the operator missed
    // a 24-hour KCAA obligation with no screen ever suggesting one
    // existed. One tap against a silently missed deadline.
    //
    // Raising this number again needs the same kind of argument.
    const required = await page.locator('#report-form [required]').count();
    assert(required === 3, `${required} required fields; the form is designed for 3`);
  });

  await check('the form STATES the number of required fields it actually has', async () => {
    // It said "Two required fields" while the form asked for three, from
    // the day report type stopped being pre-answered. Nobody re-read the
    // sentence because nothing pointed at it, and the one number a
    // thirty-second form makes a promise about was wrong on the screen
    // that makes the promise.
    //
    // The fix was to count it from the DOM. This is what stops someone
    // typing it back in — charter rule 11: a claim that can drift needs
    // something that fails when it does.
    const WORDS = { No: 0, One: 1, Two: 2, Three: 3, Four: 4, Five: 5 };
    const lede = (await page.locator('.page-head .lede').textContent()) ?? '';
    const stated = /^\s*(\w+)\s+required fields?/i.exec(lede.trim());
    assert(stated, `the form does not state how many fields are required: "${lede.trim()}"`);
    const claimed = WORDS[stated[1]] ?? Number(stated[1]);
    const actual = await page.locator('#report-form [required]').count();
    assert(
      claimed === actual,
      `the form says ${stated[1]} required fields and has ${actual}`
    );
  });

  await check('the anonymity control is visible without opening anything', async () => {
    assert(
      await page.locator('.report__anon input').isVisible(),
      'the anonymous toggle is hidden — someone who needs it must see it before they type'
    );
  });

  await check('EXACTLY ONE navigation is visible at a time', async () => {
    // The shell renders the destinations twice: inline in the header for
    // wide screens, and in a menu panel behind a button for handsets.
    // Only one may be reachable at a width, and the moment both are,
    // every a[href] selector in this file becomes ambiguous — which is
    // how this check came to exist, by Playwright picking a display:none
    // link and timing out.
    //
    // It is a real defect in its own right: two ways around on one
    // screen is a person tapping the one that is not where they expect.
    const at390 = await page.evaluate(() => ({
      inline: getComputedStyle(document.querySelector('#nav')).display !== 'none',
      toggle: getComputedStyle(document.querySelector('#menu-toggle')).display !== 'none',
      panelOpen: !document.querySelector('#menu-panel').hidden,
    }));
    assert(!at390.inline, 'the inline header nav is visible at 390px; it should be behind Menu');
    assert(at390.toggle, 'the Menu button is not visible at 390px, so there is no way around');
    assert(!at390.panelOpen, 'the menu panel is open before anyone asked for it');

    // It opens, it closes on Escape, and it says where each link goes.
    await page.click('#menu-toggle');
    assert(await page.locator('#menu-panel').isVisible(), 'the menu did not open');
    const hints = await page.locator('#menu-panel .nav-item-summary').count();
    const items = await page.locator('#menu-panel .nav-item').count();
    assert(items >= 3, `${items} destinations in the menu`);
    assert(hints === items, `${items} destinations but ${hints} hints — a label alone is not navigation`);
    await page.keyboard.press('Escape');
    assert(await page.locator('#menu-panel').isHidden(), 'Escape did not close the menu');

    // And the inverse at a desktop width: inline links, no Menu button.
    const wide = await page.context().newPage();
    await wide.setViewportSize({ width: 1280, height: 900 });
    await wide.goto(BASE, { waitUntil: 'networkidle' });
    const at1280 = await wide.evaluate(() => ({
      inline: getComputedStyle(document.querySelector('#nav')).display !== 'none',
      toggle: getComputedStyle(document.querySelector('#menu-toggle')).display !== 'none',
    }));
    await wide.close();
    assert(at1280.inline, 'the inline nav is hidden at 1280px');
    assert(!at1280.toggle, 'the Menu button is still shown at 1280px, beside the inline links');
  });

  await check('THE FOOTER IS A SITE INDEX, NOT THE HEADER DRAWN TWICE', async () => {
    // The original defect was a footer carrying exactly the header's
    // four destinations and nothing else — a menu drawn twice that told
    // nobody anything. The first version of this check policed it by
    // counting links and requiring FEWER than the menu, which was a
    // proxy and the wrong one: it would have failed a proper site index
    // and passed a footer that repeated three of four destinations.
    //
    // The rule that actually expresses it: the footer must carry
    // destinations the header does not. Those are the ones a person
    // looks to the bottom of a page for — the methodology, the terms,
    // who is behind this — and their absence is what made the old
    // footer redundant.
    //
    // Both lists are rendered from shared/sitemap.js, so this also
    // fails if that declaration is bypassed and someone hand-writes a
    // column again.
    const links = await page.evaluate(() => {
      const hrefs = (sel) =>
        [...document.querySelectorAll(sel)].map((a) => a.getAttribute('href'));
      const footer = hrefs('.footer a');
      const header = new Set([...hrefs('#menu-panel a'), ...hrefs('#nav a')]);
      const el = document.querySelector('.footer');
      return {
        footer,
        headerOnly: [...header],
        footerOnly: footer.filter((h) => !header.has(h)),
        height: el.getBoundingClientRect().height,
        viewport: window.innerHeight,
        regRows: el.querySelectorAll('.reg-list__row').length,
        text: el.textContent ?? ''
      };
    });

    assert(
      links.footerOnly.length >= 4,
      `the footer carries ${links.footerOnly.length} destinations the header does not ` +
        `(${links.footerOnly.join(', ') || 'none'}). Below four it is the navigation ` +
        'drawn twice, which is what it was before.'
    );
    assert(
      links.regRows === 0,
      `${links.regRows} regulatory rows are still in the footer; they belong at /#deadlines`
    );
    assert(
      links.height < links.viewport * 1.5,
      `the footer is ${Math.round(links.height)}px tall against a ${links.viewport}px ` +
        'viewport — a footer longer than a screen and a half is a page of its own'
    );
    // What it must still say. The jurisdiction count is computed from
    // the registry rather than typed, so a sixth changes this sentence
    // without anyone editing the HTML — charter rule 10, applied to the
    // one line that survived the move.
    assert(
      /jurisdictions/.test(links.text),
      'the footer does not say how many jurisdictions the figures cover'
    );
    /* The caveat is conditional on there being something to caveat. With
       no provisional row the footer says every figure was read against
       its primary instrument, and asserting the word "provisional"
       regardless would demand a warning about nothing. */
    assert(
      PROVISIONAL_COUNT
        ? /provisional/i.test(links.text)
        : /primary instrument/i.test(links.text),
      PROVISIONAL_COUNT
        ? 'the footer does not carry the provisional caveat'
        : 'the footer does not say the figures were read against their instruments'
    );
    assert(
      /Annex 19 Amendment 2/.test(links.text),
      'the footer does not name the standard the product is built against'
    );
    assert(
      links.footer.includes('/#deadlines'),
      'the footer does not link to the deadlines it used to contain'
    );
  });

  await check('EVERY DESTINATION IN THE ARCHITECTURE RESOLVES', async () => {
    // Six of these are lazily loaded, which means six chances for a
    // route to be declared in the sitemap and never registered on the
    // router — a menu item that lands on "not found". Nothing else in
    // this file would notice: the link renders, it is clickable, and
    // the not-found screen is a screen.
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('.footer a, #menu-panel a')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && h.startsWith('/'))
    );
    const unique = [...new Set(hrefs)];
    assert(unique.length >= 8, `${unique.length} distinct destinations declared`);

    for (const href of unique) {
      const probe = await page.context().newPage();
      await probe.goto(BASE + href, { waitUntil: 'networkidle' });
      const heading = (await probe.locator('#main h1').first().textContent()) ?? '';
      const failed = await probe.locator('.notice--error').count();
      await probe.close();
      assert(
        !/not found/i.test(heading),
        `${href} is declared in the architecture and resolves to the not-found screen`
      );
      assert(
        failed === 0,
        `${href} rendered its load-failure message; its chunk did not arrive`
      );
      assert(heading.trim().length > 0, `${href} rendered no heading at all`);
    }
  });

  await check('WCAG 2.2 SC 2.5.8 — every standalone target is at least 24px', async () => {
    // The existing 44px check below measures the report form's controls.
    // This one sweeps EVERY route, because the document pages added a
    // class of target the form does not have: a small standalone link
    // at the end of an answer. "Link to this answer" shipped at 18px.
    //
    // Two exemptions, both in the success criterion rather than
    // invented here:
    //   · a link whose size is constrained by the line-height of the
    //     sentence around it — an inline link in prose;
    //   · a control whose hit area is a label wrapping it, which is how
    //     the HRC chips work: the input is 1px and the label is 48.
    // A check that ignored those would fail on conformant markup, and a
    // check that ignored neither would be noise nobody acts on.
    const routes = ['/', '/report', '/triage', '/account', '/methodology',
                    '/glossary', '/tutorials', '/faq', '/about', '/privacy', '/terms'];
    const small = [];

    for (const route of routes) {
      const probe = await page.context().newPage();
      await probe.setViewportSize({ width: 390, height: 844 });
      await probe.goto(BASE + route, { waitUntil: 'networkidle' });
      const found = await probe.evaluate(() => {
        const main = document.querySelector('#main');
        const inlineLink = (el) => el.tagName === 'A' && el.closest('p,li,dd,summary');
        const wrappedByLabel = (el) => el.closest('label') && el.closest('label') !== el;
        return [...main.querySelectorAll('a[href],button,summary,input,select,textarea')]
          .filter((el) => {
            const box = el.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) return false;
            if (inlineLink(el) || wrappedByLabel(el)) return false;
            return box.width < 24 || box.height < 24;
          })
          .map((el) => {
            const box = el.getBoundingClientRect();
            return `${el.tagName}.${(el.className || '').toString().split(' ')[0]} ` +
                   `${Math.round(box.width)}x${Math.round(box.height)}`;
          });
      });
      await probe.close();
      for (const f of found) small.push(`${route}: ${f}`);
    }

    assert(small.length === 0, `targets under 24px:\n  ${small.join('\n  ')}`);
  });

  await check('tap targets are at least 44px', async () => {
    // OPEN THE OPTIONAL SECTION FIRST. The HRC chips live inside a
    // collapsed <details>, and a collapsed element's children measure
    // either null or 0px depending on the Chromium version — so this
    // check passed locally and failed in CI on the same commit, which
    // is the worst thing a guard can do. Measuring only what is
    // actually laid out makes the result depend on the CSS rather than
    // on which browser build ran it.
    await page.locator('details.report__more').evaluate((el) => { el.open = true; });

    // The SUBJECT is the tap target, not the control. A 24px checkbox
    // inside a full-width label is a 24px checkbox with a large target,
    // because clicking the label toggles it — asserting on the input
    // would have failed a control that is genuinely easy to hit and
    // taught the next person to inflate the checkbox instead.
    for (const sel of ['.btn-primary', '.chip', '.report__anon', '.select__control']) {
      const locator = page.locator(sel).first();
      assert(await locator.count(), `${sel} not found on the page at all`);
      assert(await locator.isVisible(), `${sel} is not visible, so its size means nothing`);
      const box = await locator.boundingBox();
      assert(box, `${sel} has no layout box`);
      assert(box.height >= 44, `${sel} is ${Math.round(box.height)}px high; gloved thumbs need 44`);
    }

    // Every chip, not just the first — one narrow chip in a wrapped row
    // is exactly the one that gets missed.
    for (const chip of await page.locator('.chip').all()) {
      const box = await chip.boundingBox();
      assert(box && box.height >= 44, `a chip is ${Math.round(box?.height ?? 0)}px high`);
    }

    await page.locator('details.report__more').evaluate((el) => { el.open = false; });

    // And the label must actually toggle the control, or the target is
    // decorative.
    const before = await page.locator('.report__anon input').isChecked();
    await page.locator('.report__anon').click();
    const after = await page.locator('.report__anon input').isChecked();
    assert(before !== after, 'clicking the anonymity label does not toggle the checkbox');
    await page.locator('.report__anon').click();
  });

  await check('the page does not scroll horizontally at 320px', async () => {
    await page.setViewportSize({ width: 320, height: 800 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    assert(overflow <= 0, `${overflow}px of horizontal overflow at 320px`);
    await page.setViewportSize({ width: 390, height: 844 });
  });

  await check('every dropdown is the shared component', async () => {
    // Standardisation is only real if it is enforced. A hand-rolled
    // <select> outside .select__control would drift on height, focus
    // ring and chevron, and nothing would notice until someone used it
    // with a keyboard.
    const total = await page.locator('select').count();
    const standard = await page.locator('select.select__control').count();
    assert(total > 0, 'no dropdowns on the report form');
    assert(total === standard, `${total - standard} select(s) bypass the Select component`);
  });

  await check('every dropdown has a real label and an unselected default', async () => {
    const selects = await page.locator('select.select__control').all();
    for (const select of selects) {
      const id = await select.getAttribute('id');
      assert(id, 'a dropdown has no id, so its <label for> cannot bind');
      assert(
        await page.locator(`label[for="${id}"]`).count(),
        `dropdown ${id} has no associated <label>`
      );
      // A dropdown that opens pre-answered collects that answer from
      // everyone who did not look, and a confidently wrong aerodrome is
      // worse for aggregation than a blank one.
      // Jurisdiction is the one deliberate exception: it is a property
      // of the operator, not of the event, and asking every reporter to
      // restate their own regulator on every report is friction that
      // buys nothing.
      assert(
        (await select.inputValue()) === '' || (await select.getAttribute('name')) === 'jurisdiction',
        `dropdown ${id} opens pre-answered`
      );
    }
  });

  await check('the "not listed" escape reveals a free-text field', async () => {
    // A vocabulary with no way out does not remove free text — it puts
    // the real answer in the narrative, where nothing can count it, and
    // a wrong entry in the column.
    const other = page.locator('input[name="locationOther"]');
    // Set the state rather than clicking it. A click TOGGLES, so this
    // check's behaviour depended on what a previous check left behind.
    await page.locator('details.report__more').evaluate((el) => { el.open = true; });
    assert(!(await other.isVisible()), 'the escape field is visible before it is chosen');
    await page.selectOption('select[name="location"]', '__OTHER__');
    assert(await other.isVisible(), 'choosing "not listed" did not reveal the free-text field');
    await page.selectOption('select[name="location"]', 'HKJK');
    assert(!(await other.isVisible()), 'the escape field stayed visible after choosing a real value');
  });

  /* ============================================================
     THE ONE THAT MATTERS.
     ============================================================ */
  await check('files a report with the network cut', async () => {
    await context.setOffline(true);

    // Type is required and unanswered by design — see the required-field
    // check above.
    await page.selectOption('select[name="type"]', 'HAZARD');
    await page.fill('input[name=title]', 'Bird activity on short final, runway 06');
    await page.fill(
      'textarea[name=narrative]',
      'A flock of at least twenty birds crossed the approach path below 300 ft AGL. ' +
        'Third consecutive morning. No avoidance action was required.'
    );
    // Standardised values, chosen through the dropdowns.
    await page.selectOption('select[name="location"]', 'HKJK');
    await page.selectOption('select[name="phase"]', 'APPROACH');
    await page.click('button[type=submit]');

    await page.waitForFunction(
      () => document.querySelector('#report-status')?.textContent?.trim().length > 0, undefined, { timeout: 5000 });

    const status = await page.locator('#report-status').textContent();
    assert(
      /saved on this device/i.test(status),
      `offline submit said "${status?.trim()}" — it must not claim the report was sent`
    );

    // And it must actually be in IndexedDB, not merely reported as such.
    const stored = await page.evaluate(async () => {
      const open = indexedDB.open('usalamasms');
      const db = await new Promise((res, rej) => {
        open.onsuccess = () => res(open.result);
        open.onerror = () => rej(open.error);
      });
      return new Promise((res, rej) => {
        const tx = db.transaction('reports', 'readonly').objectStore('reports').getAll();
        tx.onsuccess = () => res(tx.result);
        tx.onerror = () => rej(tx.error);
      });
    });
    assert(stored.length === 1, `${stored.length} reports in IndexedDB, expected 1`);
    assert(stored[0].syncState === 'pending', `syncState is ${stored[0].syncState}, expected pending`);
    assert(stored[0].awareAt, 'awareAt was not recorded — the reporting clock has no start');
    // The taxonomy codes, not whatever someone typed. This is the whole
    // reason the dropdowns exist: "HKJK", "JKIA" and "Nairobi" were
    // three aerodromes to a GROUP BY.
    assert(stored[0].location === 'HKJK', `location stored as "${stored[0].location}"`);
    assert(stored[0].phase === 'APPROACH', `phase stored as "${stored[0].phase}"`);
  });

  await check('an unclassified report is refused in language a person can act on', async () => {
    // The raw Zod message for this is
    //   "Invalid enum value. Expected 'MOR' | 'VCR' | 'HAZARD' | ..."
    // and it reached the screen until this check existed.
    await page.goto(BASE + '/report', { waitUntil: 'networkidle' });
    await page.fill('input[name=title]', 'Something happened on the ramp');
    await page.fill('textarea[name=narrative]', 'A description long enough to pass validation.');
    await page.click('button[type=submit]');
    await page.waitForFunction(
      () => document.querySelector('#report-status')?.textContent?.trim().length > 0, undefined, { timeout: 5000 });
    const status = (await page.locator('#report-status').textContent()) ?? '';
    assert(!/Invalid enum|Expected '/.test(status), `raw schema error shown to the user: "${status.trim()}"`);
    assert(/kind of report/i.test(status), `unhelpful rejection message: "${status.trim()}"`);
  });

  await check('an anonymous draft is never left on the device', async () => {
    // Source-level guards prove the branch exists. This proves it works:
    // an abandoned anonymous draft in localStorage is readable by the
    // next person to pick up a shared crew-room handset, with no
    // authentication, and it would make the server's irreversible
    // anonymity irrelevant.
    await page.goto(BASE + '/report', { waitUntil: 'networkidle' });

    await page.fill('input[name=title]', 'Ordinary draft that should persist');
    await page.fill('textarea[name=narrative]', 'A named report may be drafted to disk.');
    await page.waitForTimeout(50);
    const namedDraft = await page.evaluate(() => localStorage.getItem('usalamasms.reportDraft'));
    assert(namedDraft, 'a named report was not drafted — the convenience is gone');

    // Ticking the box must remove what is already there.
    await page.locator('.report__anon').click();
    await page.waitForTimeout(50);
    const afterTick = await page.evaluate(() => localStorage.getItem('usalamasms.reportDraft'));
    assert(afterTick === null, 'ticking anonymous left the earlier draft on disk');

    // And must keep it off, however much more is typed.
    await page.fill('textarea[name=narrative]', 'Something the reporter would not want traced.');
    await page.waitForTimeout(50);
    const afterTyping = await page.evaluate(() => localStorage.getItem('usalamasms.reportDraft'));
    assert(afterTyping === null, 'an anonymous narrative was written to localStorage');
  });

  await check('the sync strip reports the unsent report rather than staying quiet', async () => {
    // Charter rule 8 extended. A queued report that the strip does not
    // mention is a report the person believes was sent.
    await page.waitForFunction(
      () =>
        /waiting to send|saved on this device|cannot be sent/i.test(
          document.querySelector('#sync-text')?.textContent ?? ''
        ), undefined, { timeout: 5000 });
    const strip = await page.locator('#sync-strip').getAttribute('data-state');
    assert(
      ['offline', 'pending', 'signed_out'].includes(strip),
      `sync strip is "${strip}" with an unsent report`
    );
  });

  await check('a queued report with no session says SO, rather than "waiting to send"', async () => {
    // THE FAILURE THIS EXISTS FOR. apps/web had no login screen, no token
    // store and no Authorization header, while /api/v1/sync/batch has
    // always required authentication. Every sync a real device attempted
    // returned 401, and flushOutbox swallowed it with the comment "auth
    // refresh handled elsewhere". There was no elsewhere.
    //
    // So the strip said "1 report waiting to send" — forever, truthfully
    // about the queue and falsely about the outcome. A report that
    // cannot be sent and says so sends someone to the safety office. A
    // report that cannot be sent and calls itself pending is a hazard
    // nobody ever hears about, on a handset assuring its owner otherwise.
    await page.context().setOffline(false);
    await page.evaluate(() => {
      localStorage.removeItem('usalamasms.session');
      localStorage.removeItem('usalamasms.refresh');
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });

    await page.waitForFunction(
      () => document.querySelector('#sync-strip')?.dataset.state === 'signed_out', undefined, { timeout: 5000 });
    const text = (await page.locator('#sync-text').textContent()) ?? '';
    assert(/signs? in/i.test(text), `the strip does not name the action that fixes it: "${text.trim()}"`);
    // And it must NOT be the reassuring message, which is the specific
    // sentence this product cannot afford to show falsely.
    assert(!/^\s*\d+ reports? waiting to send/i.test(text), `still reporting a dead queue as merely pending: "${text.trim()}"`);
  });

  await check('the queued report appears in triage', async () => {
    await navigateTo(page, '/triage');
    await page.waitForSelector('.queue__item', { timeout: 5000 });
    const text = await page.locator('.queue__item').first().textContent();
    assert(/Bird activity/.test(text), 'the report filed offline is not in the queue');
    assert(/Waiting to send/i.test(text), 'the queue does not show that it is unsent');
    // The stored CODE renders as its human label, not as "HKJK".
    assert(/Jomo Kenyatta/.test(text), 'the aerodrome code is not resolved to a label');
    assert(/Approach/.test(text), 'the flight phase is not shown');
  });

  await check('every status badge carries a WORD and a glyph, not just a colour', async () => {
    // The identity's six medallions are colour-coded, and colour is the
    // one channel this product may never rely on alone: the risk scale
    // follows that rule and the status badges are held to it too.
    // A greyscale print, a regulator's fax and a reader with a red-green
    // deficiency all have to get the same six states.
    const badges = await page.$$eval('.badge', (els) =>
      els.map((el) => ({
        status: el.dataset.status,
        text: (el.querySelector('.badge__label')?.textContent ?? '').trim(),
        glyphPaths: el.querySelectorAll('.badge__glyph path').length,
      }))
    );
    assert(badges.length > 0, 'no status badge rendered on a queue with reports in it');
    for (const b of badges) {
      assert(b.text.length > 1, `badge ${b.status} has no readable label`);
      assert(b.glyphPaths > 0, `badge ${b.status} has no glyph — colour would be its only channel`);
    }
  });

  await check('the triage filters use the same dropdown component', async () => {
    const total = await page.locator('.filters select').count();
    const standard = await page.locator('.filters select.select__control').count();
    assert(total === 3, `${total} filter dropdowns, expected 3`);
    assert(total === standard, 'a triage filter bypasses the Select component');
  });

  await check('filtering the queue actually filters it', async () => {
    // The controls are collapsed by default — three stacked dropdowns
    // were a full handset screen and pushed every report below the fold.
    // Opened explicitly rather than toggled, for the same reason the tap
    // target check sets `.open` directly: a collapsed element's children
    // measure differently across Chromium builds.
    await page.locator('details.filters-shell').evaluate((el) => { el.open = true; });
    assert(await page.locator('.queue__item').count() === 1, 'expected one report to start');
    // A type the report is not.
    await page.selectOption('select[name="filter-type"]', 'MOR');
    await page.waitForFunction(
      () => document.querySelectorAll('.queue__item').length === 0, undefined, { timeout: 3000 });
    // And the empty state must say the queue is filtered, not empty —
    // a safety manager who reads "nothing reported" and is looking at a
    // filtered view draws exactly the wrong conclusion.
    const empty = await page.locator('.panel').textContent();
    assert(/No reports match these filters/.test(empty), 'the filtered-empty state reads as an empty queue');
    await page.selectOption('select[name="filter-type"]', '');
    await page.waitForFunction(
      () => document.querySelectorAll('.queue__item').length === 1, undefined, { timeout: 3000 });

    // ONE RENDER PER CHANGE, and it used to be two to the power of the
    // number of changes. Both delegated listeners were attached inside
    // render(), and render() calls itself from inside both of them; the
    // router clears the outlet's children between routes but never
    // replaces the outlet, so nothing removed a listener from it.
    // Measured before the fix: 1, 2, 4, 8, 16, 32 renders across six
    // filter changes, each one a full read of the report store and a
    // complete rebuild of the list. Twelve changes locked the tab.
    //
    // Counting renders rather than listeners, because the render is what
    // costs — and because a future rewrite that leaks in some other way
    // still fails this.
    const renders = await page.evaluate(() => {
      window.__renders = 0;
      const outlet = document.querySelector('#main');
      new MutationObserver((recs) => {
        for (const r of recs) if (r.addedNodes.length) window.__renders += 1;
      }).observe(outlet, { childList: true });
      return true;
    });
    void renders;

    // Driven through the element rather than through Playwright's
    // selectOption: each render rebuilds the filter bar, and the
    // collapsed <details> around it makes visibility waits flaky in a
    // way that has nothing to do with what is being measured.
    const CHANGES = ['MOR', '', 'MOR', '', 'MOR', ''];
    for (const value of CHANGES) {
      await page.evaluate((v) => {
        const sel = document.querySelector('select[name="filter-type"]');
        sel.value = v;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
      await page.waitForTimeout(140);
    }
    const counted = await page.evaluate(() => window.__renders);
    assert(
      counted <= CHANGES.length,
      `${CHANGES.length} filter changes produced ${counted} renders. Each is a full read of ` +
        'the report store and a rebuild of the list; the listeners are accumulating.'
    );
    await page.waitForFunction(
      () => document.querySelectorAll('.queue__item').length === 1, undefined, { timeout: 3000 });
  });

  await context.setOffline(false);

  await check('SYNC CARRIES THE SESSION — the seam both halves of the gate missed', async () => {
    // The smoke suite proved a report reaches IndexedDB. The integration
    // suite proved a batch reaches Postgres, using a token it minted
    // itself. Neither exercised browser -> API, because the browser could
    // not produce a session — and that gap is exactly where the missing
    // Authorization header lived.
    //
    // The API is not running here, so the requests are intercepted. What
    // is being proved is the thing that was actually absent: that the
    // browser sends credentials at all, and that a queued report leaves
    // the outbox once it does.
    const seen = { login: null, sync: null };

    await page.route('**/api/v1/auth/login', async (route) => {
      seen.login = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token-that-is-long-enough-to-pass',
          role: 'FRONTLINE',
          orgId: 'org-under-test'
        })
      });
    });

    await page.route('**/api/v1/sync/batch', async (route) => {
      const req = route.request();
      seen.sync = {
        authorization: req.headers()['authorization'] ?? null,
        body: req.postDataJSON()
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: seen.sync.body.items.map((i) => ({
            clientId: i.clientId,
            status: 'applied',
            serverUpdatedAt: new Date().toISOString()
          }))
        })
      });
    });

    await navigateTo(page, '/account');
    await page.waitForSelector('#login-form', { timeout: 5000 });
    await page.fill('#login-email', 'ramp@example.test');
    await page.fill('#login-password', 'a-sufficiently-long-test-password');
    await page.click('#login-form button[type=submit]');

    await page.waitForFunction(() => document.querySelector('#login-panel'), undefined, { timeout: 5000 });

    assert(seen.login?.email === 'ramp@example.test', 'the login request did not carry the email');
    assert(seen.sync, 'signing in with a queued report did not trigger a sync');
    assert(
      seen.sync.authorization === 'Bearer test-access-token',
      `sync went out with authorization "${seen.sync.authorization}" — this is the defect: ` +
        `every real sync 401'd and the device reported the report as merely pending`
    );
    assert(seen.sync.body.items.length >= 1, 'the queued report was not in the batch');
    assert(seen.sync.body.deviceId, 'the batch carried no deviceId');

    // And the outbox is now empty, which is what makes the strip honest.
    await page.waitForFunction(
      () => document.querySelector('#sync-strip')?.dataset.state === 'synced', undefined, { timeout: 5000 });

    await page.unroute('**/api/v1/auth/login');
    await page.unroute('**/api/v1/sync/batch');
  });

  await check('FILING WHILE ONLINE LEAVES THE STRIP TELLING THE TRUTH', async () => {
    // FOUND BY RUNNING THE APP AGAINST A REAL FASTIFY AND A REAL
    // POSTGRES, not against a mock. File a report while online — the
    // ordinary case, the one that happens every time — and:
    //
    //   the form dispatches report-filed; the shell repaints the strip
    //   from an outbox that still holds the report and prints "1 report
    //   waiting to send"; the flush sends it; the server answers 200;
    //   the row leaves the outbox; and nothing tells the shell.
    //
    // The strip then said "1 report waiting to send" for a report that
    // had arrived seventy milliseconds earlier, and went on saying it.
    // Verified against the real stack: outbox empty, row in the
    // database, audit chain extended, strip still claiming it was
    // queued.
    //
    // That is the same class of lie the strip exists to prevent,
    // pointing the other way. It sends somebody to the safety office to
    // re-file a report that already arrived, and it teaches them that
    // the one indicator this product hangs on cannot be believed.
    //
    // Every existing strip check missed it: they either cut the network
    // (so the flush genuinely did not finish) or drove the flush from
    // the sign-in path, which announced itself explicitly.
    await page.context().setOffline(false);
    /* NO CLEAN SLATE, AND NO GLOBAL ASSERTION.

       Two wrong answers preceded this one and both are worth naming,
       because the second turned CI red while passing locally.

       The first version waited for outbox.length === 0. Earlier checks
       deliberately leave reports queued that cannot drain, so "the
       outbox is empty" was never a statement about THIS report.

       The second deleted the database to get a clean slate. A delete
       is BLOCKED while the page holds an open connection, and the
       handler resolved on `onblocked` as readily as on `onsuccess` —
       so on a slower runner the database survived, Dexie was left
       wedged, the new report was never enqueued, and the check
       reported "nothing was ever sent" about a send it had prevented.
       A check that breaks the thing it measures is worse than no
       check.

       So neither. The strip is read BEFORE filing and compared with
       after, which is exactly the regression: a report that reaches
       the server must stop being counted. Whatever else is in the
       queue is in it both times and cancels out. */
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const countOf = async () => {
      const text = (await page.locator('#sync-text').textContent()) ?? '';
      const match = /(\d+) reports? waiting to send/i.exec(text);
      return match ? Number(match[1]) : 0;
    };

    /* ESTABLISHES ITS OWN SESSION rather than inheriting one from an
       earlier check. flushOutbox bails when isSignedIn() is false, and
       a check that depends on what the previous check left in
       localStorage reports "nothing was ever sent" the moment anything
       above it changes — which is a check that fails for a reason
       unrelated to what it tests. The same ordering dependency the
       provisional-jurisdictions check had. */
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'strip-probe-token',
          refreshToken: 'strip-probe-refresh-token-long-enough',
          role: 'FRONTLINE',
          orgId: 'org'
        })
      })
    );
    await page.route('**/api/v1/auth/refresh', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'strip-probe-token',
          refreshToken: 'strip-probe-refresh-token-long-enough',
          role: 'FRONTLINE',
          orgId: 'org'
        })
      })
    );

    let batches = 0;
    await page.route('**/api/v1/sync/batch', async (route) => {
      batches++;
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: body.items.map((i) => ({
            clientId: i.clientId,
            status: 'applied',
            serverUpdatedAt: new Date().toISOString()
          }))
        })
      });
    });

    await page.goto(BASE + '/account', { waitUntil: 'networkidle' });
    if (await page.locator('#login-form').count()) {
      await page.fill('#login-email', 'ramp@example.test');
      await page.fill('#login-password', 'a-sufficiently-long-test-password');
      await page.click('#login-form button[type=submit]');
      await page.waitForSelector('#login-panel', { timeout: 8000 });
    }

    await page.goto(BASE + '/report', { waitUntil: 'networkidle' });
    const baseline = await countOf();

    const typeValue = await page.locator('select[name=type] option').nth(1).getAttribute('value');
    await page.selectOption('select[name=type]', typeValue);
    await page.fill('input[name=title]', 'Online filing, strip must not lie');
    await page.fill(
      'textarea[name=narrative]',
      'Filed with the network up, to prove the strip stops saying it is waiting.'
    );
    await page.click('#report-form button[type=submit]');

    /* PROMPTLY, and the budget is the assertion.

       The defect was not "the report never arrives" — a background
       sync gets there eventually, when the browser decides to fire it.
       The defect was that a person standing there with a working radio
       watched nothing happen. So the window is four seconds, not
       fifteen: long enough for a slow runner to complete one request,
       short enough that a browser-scheduled background sync cannot be
       what satisfies it.

       A previous version polled for fifteen seconds and therefore
       passed with the immediate flush deleted, which is the whole
       defect. Caught by re-running the mutation.

       AND EVEN AT FOUR SECONDS THIS CANNOT PROVE IT. Headless Chromium
       fires a registered background sync almost at once, so the batch
       arrives either way and this check stays green with the immediate
       flush removed. The difference only exists on a real device. That
       property is therefore asserted in scripts/check-claims.mjs, at
       the source, where it can actually fail — and this comment is
       here so the next person does not mistake this check for the one
       that covers it. What THIS check covers is the strip: a report
       that reached the server must stop being counted. */
    const sentBy = Date.now() + 4000;
    while (batches === 0 && Date.now() < sentBy) await page.waitForTimeout(100);

    if (batches === 0) {
      const why = await page.evaluate(() => ({
        online: navigator.onLine,
        session: localStorage.getItem('usalamasms.session'),
        refresh: Boolean(localStorage.getItem('usalamasms.refresh')),
        strip: document.querySelector('#sync-strip')?.dataset.state,
        text: document.querySelector('#sync-text')?.textContent?.trim()
      }));
      assert(false, `nothing was ever sent: ${JSON.stringify(why)}`);
    }

    // ...and the strip comes back down, without waiting for another
    // event. Baseline-relative: whatever was already stuck in the queue
    // was there before this report too.
    const settled = Date.now() + 5000;
    let after = await countOf();
    while (after > baseline && Date.now() < settled) {
      await page.waitForTimeout(200);
      after = await countOf();
    }
    const text = (await page.locator('#sync-text').textContent()) ?? '';
    assert(
      after <= baseline,
      `the report reached the server and the strip still counts it: ` +
        `"${text.trim()}" (was ${baseline} before filing, ${after} after)`
    );

    await page.unroute('**/api/v1/sync/batch');
    await page.unroute('**/api/v1/auth/login');
    await page.unroute('**/api/v1/auth/refresh');
  });

  await check('TRY AGAIN REPAINTS THE STRIP IT WAS SENT TO FIX', async () => {
    // The strip's error state says "open Triage to review". Triage's
    // answer is a Try again button. It calls retryReport(), which
    // re-queues and flushes — and NOTHING in triage repaints the strip
    // afterwards.
    //
    // So the only thing that can clear the error the button was pressed
    // to clear is flushOutbox announcing its own outcome. This check is
    // what makes that mechanism load-bearing rather than speculative:
    // delete the announce and the strip stays red after a successful
    // retry, telling the person the report still failed while it sits
    // in the database.
    await page.context().setOffline(false);

    await page.route('**/api/v1/auth/refresh', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'retry-probe-token',
          refreshToken: 'retry-probe-refresh-token-long-enough',
          role: 'FRONTLINE',
          orgId: 'org'
        })
      })
    );

    // REJECT the item rather than failing the request. A 5xx is
    // retryable, so the report stays pending and backs off — and the
    // Try again button only exists for a report the server has actually
    // refused, which is the state a person needs an action for.
    let allow = false;
    await page.route('**/api/v1/sync/batch', async (route) => {
      const body = route.request().postDataJSON();
      if (!allow) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            results: body.items.map((i) => ({
              clientId: i.clientId,
              status: 'rejected',
              error: 'Refused once, on purpose, so Try again has something to retry.'
            }))
          })
        });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: body.items.map((i) => ({
            clientId: i.clientId,
            status: 'applied',
            serverUpdatedAt: new Date().toISOString()
          }))
        })
      });
    });

    await page.goto(BASE + '/account', { waitUntil: 'networkidle' });
    if (await page.locator('#login-form').count()) {
      await page.route('**/api/v1/auth/login', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            accessToken: 'retry-probe-token',
            refreshToken: 'retry-probe-refresh-token-long-enough',
            role: 'FRONTLINE',
            orgId: 'org'
          })
        })
      );
      await page.fill('#login-email', 'ramp@example.test');
      await page.fill('#login-password', 'a-sufficiently-long-test-password');
      await page.click('#login-form button[type=submit]');
      await page.waitForSelector('#login-panel', { timeout: 8000 });
      await page.unroute('**/api/v1/auth/login');
    }

    await page.goto(BASE + '/report', { waitUntil: 'networkidle' });
    const typeValue = await page.locator('select[name=type] option').nth(1).getAttribute('value');
    await page.selectOption('select[name=type]', typeValue);
    await page.fill('input[name=title]', 'Retry probe, first send refused');
    await page.fill('textarea[name=narrative]', 'Filed to prove Try again clears the strip it was sent to fix.');
    await page.click('#report-form button[type=submit]');

    /* Wait for the REFUSAL to land before going looking for the button
       it produces. Navigating on a timer meant racing the flush: if it
       had not finished, the report was still pending, there was no
       error state and therefore no Try again, and the check failed on
       timing rather than on behaviour. */
    await page.waitForFunction(
      () => document.querySelector('#sync-strip')?.dataset.state === 'error',
      undefined,
      { timeout: 10000 }
    );

    await navigateTo(page, '/triage');
    const retry = page.locator('[data-retry]').first();
    await retry.waitFor({ timeout: 10000 });

    allow = true;
    await retry.click();

    await page.waitForFunction(
      () => document.querySelector('#sync-strip')?.dataset.state === 'synced',
      undefined,
      { timeout: 8000 }
    );

    await page.unroute('**/api/v1/sync/batch');
    await page.unroute('**/api/v1/auth/refresh');
  });

  await check('THE MATURITY ASSESSMENT SURVIVES A RELOAD, AND SENDS NOTHING', async () => {
    // The page tells a part-time safety manager they can do this over
    // two sittings. That is a promise about persistence, and a promise
    // on a surface a customer reads has to be kept by a mechanism —
    // charter rule 7.
    //
    // It also promises the opposite about the network: nothing leaves
    // the device. Both halves are checked here, because the second is
    // the one somebody would notice too late.
    /* Two things are NOT the assessment phoning home, and a check that
       counted them would fail on correct behaviour:
         · /auth/refresh, which the shell fires on every load to turn a
           stored refresh token back into an access token;
         · a request whose body carries none of the answers.
       So: no API call other than that one, and no request body that
       mentions an element id. */
    const requests = [];
    const watch = (r) => {
      if (!r.url().includes('/api/')) return;
      if (/\/auth\/refresh$/.test(new URL(r.url()).pathname)) return;
      requests.push(`${r.method()} ${new URL(r.url()).pathname}`);
    };
    const leaked = [];
    const watchBody = (r) => {
      const body = r.postData();
      if (body && /"?el-|maturity|"1\.1"/.test(body)) leaked.push(new URL(r.url()).pathname);
    };
    page.on('request', watch);
    page.on('request', watchBody);

    await page.goto(BASE + '/toolkits/maturity', { waitUntil: 'networkidle' });
    await page.check('input[name="el-1.1"][value="3"]');
    await page.check('input[name="el-2.1"][value="1"]');

    // The score is COMPUTED, so it must already be right before any reload.
    await page.waitForFunction(
      () => /2\.0/.test(document.querySelector('.mat-summary__value')?.textContent ?? ''),
      undefined,
      { timeout: 5000 }
    );

    await page.reload({ waitUntil: 'networkidle' });
    assert(
      await page.locator('input[name="el-1.1"][value="3"]').isChecked(),
      'the answers did not survive a reload, and the page says they will'
    );
    const restored = (await page.locator('.mat-summary__value').textContent()) ?? '';
    assert(/2\.0/.test(restored), `the score did not come back: "${restored.trim()}"`);

    // Unanswered elements excluded, not counted as zero: two answers at
    // 3 and 1 is a mean of 2.0, never 0.33.
    const coverage = (await page.locator('.mat-summary__coverage').textContent()) ?? '';
    assert(/2 of 12/.test(coverage), `coverage reads "${coverage.trim()}"`);

    assert(
      requests.length === 0,
      `the assessment made ${requests.length} API request(s): ${requests.join(', ')}`
    );
    assert(
      leaked.length === 0,
      `an assessment answer left the device in a request to ${leaked.join(', ')}`
    );

    // Clear leaves nothing behind, or the next person on a shared
    // crew-room handset inherits somebody's assessment.
    await page.click('#mat-clear');
    await page.reload({ waitUntil: 'networkidle' });
    assert(
      (await page.locator('input[type=radio]:checked').count()) === 0,
      'Clear answers left answers behind'
    );
    page.off('request', watch);
    page.off('request', watchBody);
  });

  await check('COVERAGE STATES A POSITION AN OPERATOR WOULD ADOPT ON', async () => {
    // The highest-consequence sentence in the product. An independent
    // review found it describing itself as a safety management system
    // while covering one and a half of Annex 19's twelve elements, and
    // rated an operator adopting it as its sole SMS a Critical risk:
    // they would fail an audit believing they were covered.
    //
    // The unit test already asserts the arithmetic. What it cannot see
    // is whether the page a buyer actually reads renders that figure,
    // or a stale number typed beside it. Charter rule 10 — a count is
    // computed, never typed — is only kept if the computed one is the
    // one on screen.
    await page.goto(BASE + '/coverage', { waitUntil: 'networkidle' });
    await page.waitForSelector('.cov', { timeout: 5000 });

    const cards = await page.locator('.cov').count();
    assert(cards === 12, `${cards} elements declared, and Annex 19 has 12`);

    const covered = (await page.locator('.stat__value').first().textContent()) ?? '';
    assert(
      covered.trim() === String(COVERED),
      `the coverage figure reads "${covered.trim()}" — the declaration says ${COVERED}`
    );

    // Every element says what is NOT here, including the built ones.
    const missing = await page.locator('.cov__missing').count();
    assert(missing === 12, `${missing} of 12 elements say what they do not cover`);

    // And the disclaimer is on the page itself, not only in a footer
    // somebody scrolls past.
    const warning = (await page.locator('.doc__body .note').first().textContent()) ?? '';
    assert(
      /not a complete SMS/i.test(warning),
      'the coverage page does not say, on the page, that this is not a complete SMS'
    );
  });

  await check('THE RISK REGISTER COMPUTES ITS BANDS AND KEEPS ITS ENTRIES', async () => {
    // Element 2.2, and two promises made in the page's own words: the
    // bands are "computed by the same ICAO Doc 9859 scale as the
    // matrix, never stored", and entries "live in this browser".
    //
    // The second is the one worth checking hardest, because the page
    // is honest about its limit — on this device only — and a limit
    // stated but not kept is worse than one not stated.
    await page.goto(BASE + '/toolkits/register', { waitUntil: 'networkidle' });
    await page.waitForSelector('#reg-form', { timeout: 5000 });

    await page.fill('input[name="hazard"]', 'Bird activity on short final');
    await page.fill('textarea[name="consequence"]', 'Engine ingestion on approach');
    await page.selectOption('select[name="severity"]', 'A_CATASTROPHIC');
    await page.selectOption('select[name="likelihood"]', 'FREQUENT');
    await page.selectOption('#reg-form select[name="owner"]', 'SAFETY_MANAGER');
    await page.selectOption('#reg-form select[name="reviewInterval"]', '365');
    await page.click('#reg-form button[type="submit"]');

    await page.waitForSelector('.reg-entry', { timeout: 5000 });

    // 5 x 5 is 25 and red. The number and the band both come from
    // risk.ts; neither is stored on the entry.
    const chip = (await page.locator('.risk-chip').first().textContent()) ?? '';
    assert(/25 initial/.test(chip), `the initial band reads "${chip.trim()}", expected 25`);
    const tol = await page.locator('.risk-chip').first().getAttribute('data-tolerability');
    assert(tol === 'INTOLERABLE', `5x5 came back ${tol}, and Doc 9859 calls it red`);

    // An intolerable risk nobody has accepted is the one an inspector
    // opens the register to find. It is named in words, not colour.
    assert(
      await page.locator('.reg-entry__flag').first().isVisible(),
      'an intolerable, unaccepted entry is not flagged as one'
    );
    const health = (await page.locator('#reg-health .stat__value').nth(1).textContent()) ?? '';
    assert(health.trim() === '1', `the health strip counts ${health.trim()} intolerable, expected 1`);

    // Kept across a reload — the page says entries live here.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.reg-entry', { timeout: 5000 });
    const kept = await page.locator('.reg-entry').count();
    assert(kept === 1, `${kept} entries survived a reload, and the page promises they do`);

    // Removing one removes it for good, or a register nobody can
    // correct is a register nobody keeps. It asks first — see
    // REMOVING AN ENTRY ASKS FIRST for why, and for the dismissal case.
    page.once('dialog', (d) => d.accept());
    await page.click('[data-remove]');
    await page.reload({ waitUntil: 'networkidle' });
    assert(
      (await page.locator('.reg-entry').count()) === 0,
      'a removed entry came back after a reload'
    );
  });

  await check('AN INDICATOR IS JUDGED AGAINST THE PERIODS BEFORE IT', async () => {
    // The claim on this screen, and the one that would be easiest to
    // fake: alert levels computed from the operator's own history rather
    // than picked. Six steady quarters then a spike must alert; the same
    // six quarters with an ordinary seventh must not, or the tool is
    // just colouring in the most recent bar.
    await page.goto(BASE + '/toolkits/spi', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.removeItem('usalamasms.spi'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#spi-new', { timeout: 5000 });

    await page.fill('#spi-new input[name="name"]', 'Unstable approaches');
    await page.fill('#spi-new input[name="exposureUnit"]', 'approaches');
    await page.selectOption('#spi-new select[name="owner"]', 'SAFETY_MANAGER');
    await page.click('#spi-new button[type="submit"]');
    await page.waitForSelector('[data-add-period]', { timeout: 5000 });

    const addPeriod = async (label, events) => {
      await page.fill('[data-add-period] input[name="label"]', label);
      await page.fill('[data-add-period] input[name="events"]', String(events));
      await page.fill('[data-add-period] input[name="exposure"]', '1000');
      await page.click('[data-add-period] button[type="submit"]');
      await page.waitForTimeout(120);
    };

    // Dated labels, as an operator's cadence actually is — and as the
    // ordering guard needs in order to have an opinion at all.
    const QUARTERS = ['2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4', '2026-Q1', '2026-Q2'];
    for (const label of QUARTERS) await addPeriod(label, 4);

    // Six periods of baseline and nothing judged yet — the screen must
    // say so rather than drawing a confident line through them.
    let head = ((await page.locator('.cov__has').first().textContent()) ?? '').trim();
    const noLevels = ((await page.locator('.cov__missing').first().textContent()) ?? '').trim();
    assert(
      /Recording, with no alert levels yet/.test(head),
      `with only a baseline the card reads "${head.slice(0, 80)}"`
    );
    assert(
      /No alert levels yet/.test(noLevels) && /of 6/.test(noLevels),
      `the card does not say how much history it still needs: "${noLevels.slice(0, 90)}"`
    );

    // An ordinary seventh: still quiet.
    await addPeriod('2026-Q3', 4);
    head = ((await page.locator('.cov__has').first().textContent()) ?? '').trim();
    assert(
      !/^Alert/.test(head),
      `a period identical to its baseline raised an alert: "${head.slice(0, 80)}"`
    );

    // And a spike: loud, with the criterion named in words rather than
    // signalled by a colour.
    await addPeriod('2026-Q4', 40);
    const card = ((await page.locator('.reg-entry').first().textContent()) ?? '').replace(
      /\s+/g,
      ' '
    );
    assert(/Alert/.test(card), `the spike did not alert: "${card.slice(0, 140)}"`);
    assert(
      /beyond 3 SD/i.test(card),
      'the alert does not name which criterion was crossed, only that one was'
    );
    const alerting = (await page.locator('#spi-strip .stat__value').nth(2).textContent()) ?? '';
    assert(alerting.trim() === '1', `"alerting now" reads ${alerting.trim()}, expected 1`);

    // AND IT REFUSES A PERIOD THAT WOULD CORRUPT THE BASELINE. The whole
    // method judges each period against the periods before it, and entry
    // order was the only definition of "before" — nothing stopped a
    // back-filled quarter or the same one twice, and every level, band
    // and count then came out of the wrong baseline, shown with exactly
    // the same confidence as a right one.
    const bandsBefore = await page.locator('.oblig-table tbody tr').count();
    await page.fill('[data-add-period] input[name="label"]', '2026-Q2');
    await page.fill('[data-add-period] input[name="events"]', '4');
    await page.fill('[data-add-period] input[name="exposure"]', '1000');
    await page.click('[data-add-period] button[type="submit"]');
    await page.waitForTimeout(150);
    let refusal = ((await page.locator('.spi-period__error').first().textContent()) ?? '').trim();
    assert(/already recorded/.test(refusal), `a duplicate period was accepted: "${refusal}"`);
    assert(
      (await page.locator('.oblig-table tbody tr').count()) === bandsBefore,
      'the duplicate period was written despite the refusal'
    );

    await page.fill('[data-add-period] input[name="label"]', '2020-Q1');
    await page.fill('[data-add-period] input[name="events"]', '4');
    await page.fill('[data-add-period] input[name="exposure"]', '1000');
    await page.click('[data-add-period] button[type="submit"]');
    await page.waitForTimeout(150);
    refusal = ((await page.locator('.spi-period__error').first().textContent()) ?? '').trim();
    assert(/comes before/.test(refusal), `an out-of-sequence period was accepted: "${refusal}"`);

    // The refusal is next to the form that produced it, not in the
    // "Add an indicator" section at the bottom of the page — where it
    // used to be written, usually off screen.
    const wherePlaced = await page.evaluate(() => {
      const region = document.querySelector('.spi-period__error');
      return Boolean(region?.closest('[data-add-period]'));
    });
    assert(wherePlaced, 'the refusal is rendered outside the form that caused it');

    // The chart is decoration and says so; the numbers are in the table.
    assert(
      (await page.locator('.spi-chart[aria-hidden="true"]').count()) === 1,
      'the trend chart is exposed to assistive technology as though it carried the data'
    );
    const rows = await page.locator('.oblig-table tbody tr').count();
    assert(rows === 8, `${rows} periods in the table, expected 8`);

    // It survives a reload, and it sent nothing to do any of it.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.reg-entry', { timeout: 5000 });
    assert(
      (await page.locator('.oblig-table tbody tr').count()) === 8,
      'the periods did not survive a reload'
    );

    // Printed, it is the indicator and not the forms that produce it.
    await page.emulateMedia({ media: 'print' });
    const printed = await page.evaluate(() => {
      const vis = (el) => Boolean(el && getComputedStyle(el).display !== 'none');
      return {
        newForm: vis(document.querySelector('#spi-new')),
        periodForm: vis(document.querySelector('[data-add-period]')),
        table: vis(document.querySelector('.oblig-table')),
        rows: document.querySelectorAll('.oblig-table tbody tr').length
      };
    });
    await page.emulateMedia({ media: 'screen' });
    assert(!printed.newForm, 'the blank add-an-indicator form prints');
    assert(!printed.periodForm, 'the blank add-a-period form prints under every indicator');
    assert(printed.table && printed.rows === 8, 'the periods do not print');

    await page.evaluate(() => localStorage.removeItem('usalamasms.spi'));
  });

  await check('A TOOLKIT NOBODY CAN FIND IN THE MENU IS NOT SHIPPED', async () => {
    // Found by a probe, not by a test. The safety risk assessment was
    // built, routed, linked from the coverage page and reachable by
    // typing the URL — and invisible to anybody navigating. The menu
    // carried "Toolkits" with a hint listing the three instruments that
    // existed on the day the hint was typed, and a hint typed once goes
    // stale for exactly the person looking for the thing that was added
    // last.
    //
    // The rule, and it is not "the SRA is in the hint": every toolkit
    // that is big enough to have a route of its own must be NAMED in
    // the hint of the menu item that leads to it. Both sides are read
    // from the running page, so this fails whenever a fourth is added
    // and the hint is not — which is the failure that actually happened.
    //
    // It lives down here among the toolkit checks rather than beside the
    // navigation ones because the checks up there share one page that is
    // sitting on the report form. Written there, it navigated away and
    // took nine of them down with it. The suite's page is already 390
    // wide, which is where the header keeps its destinations behind the
    // Menu button, so no resize is needed either.
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.click('#menu-toggle');
    const hint = (
      await page
        .locator('#menu-panel a[href="/toolkits"] .nav-item-summary')
        .textContent()
    )?.toLowerCase().replace(/\s+/g, ' ').trim() ?? '';
    await page.keyboard.press('Escape');
    assert(hint.length > 0, 'the Toolkits menu item carries no hint at all');

    await page.goto(BASE + '/toolkits', { waitUntil: 'networkidle' });
    const toolkits = await page.evaluate(() =>
      [...document.querySelectorAll('.hero-actions a')]
        .map((a) => ({ href: a.getAttribute('href'), label: (a.textContent ?? '').trim() }))
        .filter((t) => t.href && t.href.startsWith('/toolkits/'))
    );
    assert(
      toolkits.length >= 3,
      `${toolkits.length} routed toolkits offered on the index; the product ships at least 3`
    );

    for (const t of toolkits) {
      // The toolkit's own last two words — "risk assessment", "risk
      // register", "maturity assessment". A hint that names it in
      // different words is a hint that names something else.
      const name = t.label.toLowerCase().split(/\s+/).slice(-2).join(' ');
      assert(
        hint.includes(name),
        `the menu hint for Toolkits does not name "${t.label}" (${t.href}). ` +
          `It reads "${hint}". A toolkit absent from the hint is a toolkit a ` +
          'person navigating never learns exists.'
      );
    }
  });

  await check('AN SRA REFUSES TO BE ACCEPTED WITH A RED RISK ON IT', async () => {
    // The claim with the highest consequence on this screen. Doc 9859's
    // red band is not "acceptable with sign-off from somebody
    // sufficiently senior" — it is not acceptable at any level of
    // benefit. A tool that let an accountable executive click past it
    // would be helping produce the document that proves they knew.
    await page.goto(BASE + '/toolkits/sra', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.removeItem('usalamasms.sra'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#sra-hazard', { timeout: 5000 });

    // Five steps, from the module rather than from the markup.
    const steps = await page.locator('#sra-steps li').count();
    assert(steps === 5, `${steps} steps rendered, and Doc 9859 sets out 5`);

    await page.fill('#sra-system textarea[name="system"]',
      'Twice-weekly F50 service into an unpaved strip with no published instrument ' +
      'approach, flown by crews currently operating only to paved destinations.');

    const addHazard = async (hazard, sev, lik, resSev, resLik) => {
      await page.fill('#sra-hazard input[name="hazard"]', hazard);
      await page.fill('#sra-hazard textarea[name="consequence"]', 'Runway excursion on landing');
      await page.selectOption('#sra-hazard select[name="severity"]', sev);
      await page.selectOption('#sra-hazard select[name="likelihood"]', lik);
      await page.fill('#sra-hazard textarea[name="controls"]', 'Crosswind limit reduced');
      if (resSev) await page.selectOption('#sra-hazard select[name="residualSeverity"]', resSev);
      if (resLik) await page.selectOption('#sra-hazard select[name="residualLikelihood"]', resLik);
      await page.selectOption('#sra-hazard select[name="owner"]', 'CHIEF_PILOT');
      await page.check('#sra-hazard input[name="controlReviewed"]');
      await page.click('#sra-hazard button[type="submit"]');
      await page.waitForTimeout(250);
    };

    // One hazard whose control does NOT bring it out of the red band.
    await addHazard('Unpaved surface in the wet season', 'A_CATASTROPHIC', 'FREQUENT',
      'A_CATASTROPHIC', 'FREQUENT');
    await addHazard('No published approach', 'C_MAJOR', 'REMOTE', 'D_MINOR', 'IMPROBABLE');

    const rows = await page.locator('.reg-entry').count();
    assert(rows === 2, `${rows} hazards on the assessment, expected 2`);

    const verdict = ((await page.locator('#sra-verdict').textContent()) ?? '').replace(/\s+/g, ' ');
    assert(/Not ready/.test(verdict), `verdict reads "${verdict.slice(0, 90)}"`);
    assert(
      /not acceptable at any level of benefit/i.test(verdict),
      'the blocker does not say why a red residual cannot be signed off'
    );

    // The count is computed, not typed.
    const stillRed = (await page.locator('#sra-strip .stat__value').nth(2).textContent()) ?? '';
    assert(stillRed.trim() === '1', `"still intolerable" reads ${stillRed.trim()}, expected 1`);

    // AND WHAT COMES OUT OF THE PRINTER IS THE ASSESSMENT. An SRA is
    // printed to be taken into the room where the change is accepted.
    // The blank entry form printed above it — nine empty fields and a
    // submit button — is two pages the reader turns past before
    // reaching anything that was assessed, and it is the first thing
    // they see. Same reasoning as the register, which learned it first.
    await page.emulateMedia({ media: 'print' });
    const printed = await page.evaluate(() => {
      const shown = (sel) => {
        const el = document.querySelector(sel);
        return Boolean(el && getComputedStyle(el).display !== 'none');
      };
      return {
        entryForm: shown('#sra-hazard'),
        hazards: [...document.querySelectorAll('.reg-entry')].filter(
          (el) => getComputedStyle(el).display !== 'none'
        ).length,
        verdict: shown('#sra-verdict'),
        system: shown('#sra-system')
      };
    });
    await page.emulateMedia({ media: 'screen' });

    assert(!printed.entryForm, 'the blank hazard-entry form prints above the assessment');
    assert(
      printed.hazards === 2,
      `${printed.hazards} of 2 hazards survive the print stylesheet — hiding the ` +
        'form must not hide what was assessed'
    );
    assert(printed.verdict, 'the acceptance verdict does not print');
    assert(printed.system, 'the system description does not print');

    await page.evaluate(() => localStorage.removeItem('usalamasms.sra'));
  });

  await check('THE REGISTER ASKS FOR A POST, NOT A TYPED NAME', async () => {
    // A typed owner becomes "Ops", "ops", "Ops dept" and "S.K." — four
    // owners of one hazard, none countable and one of them nobody. The
    // escape stays for an organisation the list cannot describe, but it
    // is the exception rather than the default.
    await page.goto(BASE + '/toolkits/register', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.removeItem('usalamasms.register'));
    await page.reload({ waitUntil: 'networkidle' });

    for (const name of ['owner', 'acceptedBy', 'reviewInterval']) {
      const tag = await page.locator(`#reg-form [name="${name}"]`).evaluate((el) => el.tagName);
      assert(tag === 'SELECT', `${name} is a ${tag}, and it has a bounded vocabulary`);
    }

    // The review DATE is computed from the interval, never typed
    // alongside it — two fields that can disagree is one field too many.
    const dateField = page.locator('#reviewby-field');
    assert(await dateField.isHidden(), 'the specific-date field is shown before it is asked for');

    await page.fill('input[name="hazard"]', 'Owner from the list');
    await page.fill('textarea[name="consequence"]', 'x');
    await page.selectOption('#reg-form select[name="owner"]', 'SAFETY_MANAGER');
    await page.selectOption('#reg-form select[name="reviewInterval"]', '90');
    await page.click('#reg-form button[type="submit"]');
    await page.waitForSelector('.reg-entry', { timeout: 5000 });

    const meta = ((await page.locator('.reg-entry__meta').first().textContent()) ?? '').trim();
    assert(
      /Safety Manager/.test(meta),
      `the entry records "${meta.slice(0, 60)}" rather than the post that was chosen`
    );
    // 90 days out, so a year that is not this one means the arithmetic
    // ran on the wrong anchor.
    const due = new Date(Date.now() + 90 * 864e5).getFullYear();
    assert(
      new RegExp(String(due)).test(meta),
      `the computed review date is not ${due}: "${meta.slice(0, 80)}"`
    );

    // And the escape still exists for an organisation the list cannot
    // describe — a vocabulary with no way out sends the real answer
    // into the narrative, where nothing can count it.
    await page.selectOption('#reg-form select[name="owner"]', '__other__');
    await page.waitForSelector('#reg-form [name="ownerOther"]', { timeout: 5000 });

    await page.evaluate(() => localStorage.removeItem('usalamasms.register'));
  });

  await check('ONE MALFORMED ROW CANNOT DESTROY THE REGISTER', async () => {
    // Found by a pre-flight probe, not by a test: a single entry with
    // no `owner` threw inside the health arithmetic, killed the
    // repaint, and took every OTHER entry on the register down with
    // it. Permanently — the bad row was saved, so it crashed the page
    // again on every load, and nothing in the UI could recover it.
    //
    // localStorage is written to by other tabs, other code and anyone
    // with the dev tools open. Whatever comes back is not trusted.
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.evaluate(() =>
      localStorage.setItem(
        'usalamasms.register',
        JSON.stringify([
          { id: 'r-broken' },
          {
            id: 'r-good',
            hazard: 'Bird activity on short final',
            consequence: 'Ingestion',
            severity: 'C_MAJOR',
            likelihood: 'REMOTE',
            controls: '',
            owner: 'Safety manager',
            reviewBy: '2027-01-01',
            status: 'OPEN'
          }
        ])
      )
    );
    await page.goto(BASE + '/toolkits/register', { waitUntil: 'networkidle' });
    await page.waitForSelector('.reg-entry', { timeout: 5000 });

    const rows = await page.locator('.reg-entry').count();
    assert(rows === 2, `${rows} rows rendered — the good entry must survive the bad one`);

    const good = await page.locator('.reg-entry:has-text("Bird activity")').count();
    assert(good === 1, 'the intact entry did not render beside the malformed one');

    // And the malformed one is SURFACED, not silently dropped: an
    // entry with no owner is exactly what the unowned count is for.
    const unowned = (await page.locator('#reg-health .stat__value').nth(3).textContent()) ?? '';
    assert(unowned.trim() === '1', `unowned reads ${unowned.trim()}, expected 1`);

    await page.evaluate(() => localStorage.removeItem('usalamasms.register'));
  });

  await check('A REFUSED WRITE IS REPORTED, NOT SWALLOWED', async () => {
    // Charter rule 8. In a private window or against a full quota the
    // entry used to appear on the register, look filed, and be gone on
    // the next load. Losing an assessed hazard silently is worse than
    // refusing it, because only one of the two is noticed.
    await page.goto(BASE + '/toolkits/register', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      Storage.prototype.setItem = function () {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      };
    });
    await page.fill('input[name="hazard"]', 'Quota hazard');
    await page.fill('textarea[name="consequence"]', 'Would be lost silently');
    await page.selectOption('#reg-form select[name="owner"]', 'SAFETY_MANAGER');
    await page.selectOption('#reg-form select[name="reviewInterval"]', '365');
    await page.click('#reg-form button[type="submit"]');
    await page.waitForSelector('.reg-entry', { timeout: 5000 });

    const warning = ((await page.locator('#reg-error').textContent()) ?? '').trim();
    assert(warning.length > 0, 'the entry could not be saved and the page said nothing');
    assert(
      /could not be saved|not be saved/i.test(warning),
      `the warning does not say the entry was not saved: "${warning}"`
    );
    await page.reload({ waitUntil: 'networkidle' });
  });

  await check('REMOVING AN ENTRY ASKS FIRST, AND KEEPS THE KEYBOARD SOMEWHERE', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.evaluate(() =>
      localStorage.setItem(
        'usalamasms.register',
        JSON.stringify(
          ['a', 'b'].map((k) => ({
            id: k,
            hazard: `Hazard ${k}`,
            consequence: 'x',
            severity: 'C_MAJOR',
            likelihood: 'REMOTE',
            controls: '',
            owner: 'Safety manager',
            reviewBy: '2027-01-01',
            status: 'OPEN'
          }))
        )
      )
    );
    await page.goto(BASE + '/toolkits/register', { waitUntil: 'networkidle' });
    await page.waitForSelector('.reg-entry', { timeout: 5000 });

    // Dismissed: the entry stays. An assessed hazard is not deleted by
    // a mis-tap on a handset.
    page.once('dialog', (d) => d.dismiss());
    await page.click('[data-remove]');
    await page.waitForTimeout(200);
    assert(
      (await page.locator('.reg-entry').count()) === 2,
      'dismissing the confirmation still removed the entry'
    );

    // Accepted: it goes, and focus lands somewhere usable rather than
    // on <body>, which is where a keyboard user loses the register.
    page.once('dialog', (d) => d.accept());
    await page.locator('[data-remove]').first().focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    assert(
      (await page.locator('.reg-entry').count()) === 1,
      'accepting the confirmation did not remove the entry'
    );
    const active = await page.evaluate(() => document.activeElement?.tagName ?? 'NONE');
    assert(active !== 'BODY', `focus fell to ${active} after the list was rebuilt`);

    await page.evaluate(() => localStorage.removeItem('usalamasms.register'));
  });

  await check('A LONG HAZARD DOES NOT PUSH THE PAGE SIDEWAYS', async () => {
    // A hazard pasted out of a maintenance log arrives as one unbroken
    // token. Measured at 3886px against a 390px handset before the
    // fix, which puts every other control off-screen.
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.evaluate(() =>
      localStorage.setItem(
        'usalamasms.register',
        JSON.stringify([
          {
            id: 'long',
            hazard: 'A'.repeat(300),
            consequence: 'B'.repeat(300),
            severity: 'C_MAJOR',
            likelihood: 'REMOTE',
            controls: '',
            owner: 'Safety manager',
            reviewBy: '2027-01-01',
            status: 'OPEN'
          }
        ])
      )
    );
    await page.goto(BASE + '/toolkits/register', { waitUntil: 'networkidle' });
    await page.waitForSelector('.reg-entry', { timeout: 5000 });
    const { sw, cw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth
    }));
    assert(sw <= cw + 1, `the page is ${sw}px wide in a ${cw}px viewport`);
    await page.evaluate(() => localStorage.removeItem('usalamasms.register'));
  });

  await check('METHODOLOGY renders both tables from the real modules', async () => {
    // The route was called "design system", which described the screen
    // to the people who built it and to nobody else. What is behind it
    // — the Doc 9859 matrix and the deadline registry, rendered by the
    // modules that compute them — is the most useful page for anyone
    // deciding whether to trust the numbers, so it is named for what it
    // is and carries the derivation in prose beside the tables.
    await navigateTo(page, '/methodology');
    await page.waitForSelector('.risk-matrix__cell', { timeout: 5000 });
    const cells = await page.locator('.risk-matrix__cell').count();
    assert(cells === 25, `${cells} matrix cells, expected 25`);

    // Colour is never the only channel: every cell carries its code.
    const codes = await page.locator('.risk-matrix__code').count();
    assert(codes === 25, `${codes} tolerability codes, expected 25`);

    // And the obligation table, which is the other half of the claim.
    // Five authorities, each with the date its figure was last read
    // against the primary instrument — a figure without one does not
    // enter the registry, and a page that dropped the dates would be
    // making the claim without the evidence.
    const rows = await page.locator('.oblig-table tbody tr').count();
    assert(
      rows === JURISDICTION_COUNT,
      `${rows} obligation rows, expected ${JURISDICTION_COUNT}`
    );
    const verified = await page.locator('.oblig-table .verified').count();
    assert(
      verified === JURISDICTION_COUNT,
      `${verified} rows carry a verification date, expected ${JURISDICTION_COUNT}`
    );
  });

  await check('THE DEADLINE CALCULATOR COMPUTES, AND REFUSES THE UNSAFE INPUT', async () => {
    // A page that explains a derivation and leaves the reader to do the
    // arithmetic has explained nothing. This drives the same
    // reportingDeadline() the report form calls.
    //
    // The refusal is the half that matters. Awareness before the
    // occurrence is a silent error in the OPERATOR'S FAVOUR — it moves
    // a deadline later — which is the direction that gets somebody in
    // trouble with an authority rather than the direction that gets
    // caught. The engine throws on it; this proves the screen does not
    // swallow the throw and print a number anyway.
    await page.selectOption('#deadline-calc select[name=jurisdiction]', 'KE');
    await page.fill('#deadline-calc input[name=occurredAt]', '2026-08-11T10:00');
    await page.fill('#deadline-calc input[name=awareAt]', '2026-08-14T08:00');
    await page.waitForFunction(
      () => document.querySelector('#deadline-result')?.dataset.state === 'ok',
      undefined,
      { timeout: 5000 }
    );

    const answer = (await page.locator('#deadline-result').textContent()) ?? '';
    // 24 hours from awareness at 08:00Z on the 14th is 08:00Z on the 15th.
    // Anchored to the occurrence it would read 2026-08-12, which is the
    // defect the whole clockStart model exists to prevent.
    assert(
      /2026-08-15 08:00Z/.test(answer),
      `KCAA 24h from 2026-08-14 08:00Z should be 2026-08-15 08:00Z; got "${answer.trim()}"`
    );
    assert(/24 hours from awareness/.test(answer), `the answer does not state its basis: "${answer.trim()}"`);

    // Now the wrong way round.
    await page.fill('#deadline-calc input[name=awareAt]', '2026-08-10T08:00');
    await page.waitForFunction(
      () => document.querySelector('#deadline-result')?.dataset.state === 'error',
      undefined,
      { timeout: 5000 }
    );
    const refusal = (await page.locator('#deadline-result').textContent()) ?? '';
    assert(
      /awareness cannot come before/i.test(refusal),
      `the refusal does not say what is wrong: "${refusal.trim()}"`
    );
    assert(
      !/\d{4}-\d{2}-\d{2}/.test(refusal),
      `a date was printed alongside the refusal: "${refusal.trim()}"`
    );
  });

  await check('IN-PAGE ANCHORS SCROLL, AND CLEAR THE STICKY CHROME', async () => {
    // TWO FAILURES, ONE CHECK, because they present identically to a
    // reader: nothing useful happened.
    //
    // The first was fatal and invisible. The router re-rendered on
    // popstate, and Chrome fires popstate for a same-document hash
    // change — so clicking any in-page anchor rebuilt the screen,
    // destroying the DOM the browser was about to scroll to and
    // resetting the scroll to zero. Every contents entry on six
    // document pages, the footer's link to the deadlines, and the skip
    // link a keyboard user reaches first: all dead. Nothing saw it,
    // because a re-render produces identical markup and every selector
    // still matched. The only evidence was a scroll position.
    //
    // The second is WCAG 2.2 SC 2.4.11 (Focus Not Obscured). This app
    // has a sticky header AND a sticky sync strip above the content;
    // landing a heading underneath them is arriving at a section whose
    // title you cannot read.
    await navigateTo(page, '/faq');
    await page.waitForSelector('.toc a', { timeout: 5000 });
    await page.click('.toc a[href="#regulatory"]');
    // Wait for the scroll to SETTLE, not to start. scroll-behavior is
    // smooth, so "scrollY > 0" is true a frame after the click while the
    // page is still a thousand pixels from where it is going — and the
    // first version of this check measured exactly there and reported an
    // overshoot that was really a race.
    await page.waitForFunction(
      () => {
        const y = window.scrollY;
        if (window.__lastY === y) return true;
        window.__lastY = y;
        return false;
      },
      undefined,
      { timeout: 5000, polling: 250 }
    );

    const landing = await page.evaluate(() => {
      const heading = document.querySelector('#regulatory h2').getBoundingClientRect();
      const chromeBottom = Math.max(
        document.querySelector('.nav').getBoundingClientRect().bottom,
        document.querySelector('#sync-strip').getBoundingClientRect().bottom
      );
      return {
        scrollY: window.scrollY,
        clearance: heading.top - chromeBottom,
        hash: window.location.hash
      };
    });

    assert(landing.scrollY > 0, 'clicking a contents entry did not scroll the page at all');
    assert(landing.hash === '#regulatory', `the URL is ${landing.hash}, so it cannot be shared`);
    assert(
      landing.clearance >= 0,
      `the heading lands ${Math.abs(Math.round(landing.clearance))}px underneath the sticky ` +
        'header and sync strip — WCAG 2.2 SC 2.4.11'
    );

    // And the section really is the one in view, not merely somewhere
    // on a page that happened to scroll.
    assert(
      landing.clearance < 200,
      `the heading is ${Math.round(landing.clearance)}px below the chrome; the anchor ` +
        'overshot the section it names'
    );

    // THE CROSS-PAGE CASE, which is the footer's most important link and
    // had never once worked. "/#deadlines" starts with a slash, so the
    // router claimed it; normalise() strips the fragment to get a route,
    // and the fragment went with it. Every press landed on the top of
    // the landing page instead of on the regulatory basis.
    await page.click('.footer a[href="/#deadlines"]');
    await page.waitForFunction(
      () => {
        if (!document.querySelector('#deadlines')) return false;
        const y = window.scrollY;
        if (window.__lastY2 === y) return true;
        window.__lastY2 = y;
        return false;
      },
      undefined,
      { timeout: 5000, polling: 250 }
    );

    const crossPage = await page.evaluate(() => {
      const heading = document.querySelector('#deadlines h2').getBoundingClientRect();
      const chromeBottom = Math.max(
        document.querySelector('.nav').getBoundingClientRect().bottom,
        document.querySelector('#sync-strip').getBoundingClientRect().bottom
      );
      return {
        path: window.location.pathname,
        hash: window.location.hash,
        scrollY: window.scrollY,
        clearance: heading.top - chromeBottom
      };
    });

    assert(crossPage.path === '/', `the deadlines link went to ${crossPage.path}`);
    assert(crossPage.hash === '#deadlines', `the fragment was dropped: "${crossPage.hash}"`);
    assert(
      crossPage.scrollY > 0,
      'the deadlines link landed on the top of the landing page rather than on the deadlines'
    );
    assert(
      crossPage.clearance >= 0 && crossPage.clearance < 200,
      `the deadlines heading is ${Math.round(crossPage.clearance)}px from the sticky chrome`
    );
  });

  await check('A LINKED ANSWER OPENS ITSELF', async () => {
    // Every question has a URL, derived from its own text so the id
    // cannot drift from the sentence above it. Landing on one has to
    // OPEN it: the browser scrolls to a closed disclosure perfectly
    // happily, and the reader arrives at the question they already
    // clicked and none of the answer.
    await navigateTo(page, '/faq');
    const id = await page.locator('.qa__item').first().getAttribute('id');
    assert(id && id.startsWith('q-'), `a question has no linkable id: "${id}"`);

    await page.goto(`${BASE}/faq#${id}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      (target) => document.getElementById(target)?.hasAttribute('open'),
      id,
      { timeout: 5000 }
    );
    assert(
      await page.locator(`#${id} .qa__answer`).isVisible(),
      'the linked question is open but its answer is not visible'
    );

    // Expand all / collapse all, which is the affordance somebody
    // printing the page reaches for first.
    await page.click('[data-qa="close"]');
    const closed = await page.locator('.qa__item[open]').count();
    await page.click('[data-qa="open"]');
    const opened = await page.locator('.qa__item[open]').count();
    const total = await page.locator('.qa__item').count();
    assert(closed === 0, `${closed} questions stayed open after Collapse all`);
    assert(opened > 0 && opened < total, 'Expand all opened every group, not just its own');
  });

  await check('THE GLOSSARY RENDERS THE MODULE, NOT A COPY OF IT', async () => {
    // 186 lines of vocabulary transcribed from the KCAA course glossary
    // existed in the repository so the de-identifier would not scrub
    // "the AOC holder" into "the [FLT] holder", and nothing ever showed
    // a word of it to a user.
    //
    // The count is read from the page and compared against the module
    // the de-identifier reads. A page that retyped the list would drift
    // from the redactor, and the drift would show up as a safety
    // narrative with a mangled acronym in it.
    await navigateTo(page, '/glossary');
    await page.waitForSelector('#acronyms', { timeout: 5000 });

    const onPage = await page.locator('#acronyms .deflist__row').count();
    const inModule = Object.keys(
      (await import('../packages/shared/src/glossary.ts')).SMS_ACRONYMS
    ).length;
    assert(
      onPage === inModule,
      `${onPage} abbreviations rendered against ${inModule} in the module the de-identifier reads`
    );

    // The three occurrence classes, and the sentence a reporter needs.
    const classes = await page.locator('.class-card').count();
    assert(classes === 3, `${classes} occurrence classes, expected 3`);
    const text = (await page.locator('#classes').textContent()) ?? '';
    assert(
      /only in the result/.test(text),
      'the glossary does not carry the accident/serious-incident distinction, ' +
        'which is the single sentence most reporters get wrong'
    );
    // And the provenance, because a transcription without a date is a
    // claim about a document nobody can re-check.
    const source = (await page.locator('#acronyms .footnote').textContent()) ?? '';
    assert(/KCAA/.test(source) && /\d{4}-\d{2}-\d{2}/.test(source),
      `the glossary does not name its source and transcription date: "${source.trim()}"`);

    // The filter narrows the list and SAYS how far. A filter that hides
    // rows without a count is indistinguishable from a page that has
    // lost its content, which on a reference page is the difference
    // between "no match" and "broken".
    await page.fill('#glossary-filter', 'aoc');
    await page.waitForFunction(
      () => document.querySelectorAll('#acronyms .deflist__row:not([hidden])').length === 1,
      undefined,
      { timeout: 5000 }
    );
    const shown = (await page.locator('#acronyms .deflist__row:not([hidden])').textContent()) ?? '';
    assert(/Air operator certificate/.test(shown), `filtering for AOC showed "${shown.trim()}"`);
    const counter = (await page.locator('#glossary-count').textContent()) ?? '';
    assert(/1 of \d+/.test(counter), `the filter does not say how far it narrowed: "${counter.trim()}"`);
    // A letter heading with nothing under it is worse than no heading.
    const strayLetters = await page.locator('#acronyms .alpha:not([hidden])').count();
    assert(strayLetters === 1, `${strayLetters} letter groups visible for a single match`);

    // And it matches the EXPANSION too — somebody who half-remembers
    // "the performance indicator one" should find SPI.
    await page.fill('#glossary-filter', 'performance indicator');
    await page.waitForFunction(
      () => document.querySelectorAll('#acronyms .deflist__row:not([hidden])').length > 0,
      undefined,
      { timeout: 5000 }
    );
    const byMeaning = (await page.locator('#acronyms').textContent()) ?? '';
    assert(/SPI/.test(byMeaning), 'the filter does not search the expansions, only the terms');

    await page.fill('#glossary-filter', 'zzzz');
    await page.waitForSelector('#glossary-empty:not([hidden])', { timeout: 5000 });
    await page.fill('#glossary-filter', '');
  });

  await check('THE BASELINE JURISDICTION SHOWS NO DEADLINE IT CANNOT CITE', async () => {
    // ICAO Annex 13 requires notification with a minimum of delay and
    // names no period; Annex 19 leaves it to the State. Three rows once
    // carried the EU's 72 hours as an "ICAO-common" figure, which is not
    // a figure ICAO publishes. The table must show the absence rather
    // than fill it — a plausible number here is the exact failure the
    // regulatory engine was written to remove.
    await navigateTo(page, '/methodology');
    await page.waitForSelector('.oblig-table', { timeout: 5000 });

    const icaoRow = page.locator('.oblig-table tbody tr', { hasText: 'ICAO' }).first();
    assert(await icaoRow.count(), 'the ICAO baseline is not in the obligation table');

    const text = ((await icaoRow.textContent()) ?? '').replace(/\s+/g, ' ');
    assert(
      /no fixed period/i.test(text) && /without delay/i.test(text),
      `the ICAO row does not state the absence of a period: "${text.slice(0, 120)}"`
    );
    assert(
      !/\b\d+ h\b/.test(text),
      `the ICAO row shows an hour figure no instrument publishes: "${text.slice(0, 120)}"`
    );

    // And the calculator agrees with the table.
    await page.selectOption('#deadline-calc select[name="jurisdiction"]', 'ICAO');
    await page.waitForFunction(
      () => /without delay/i.test(document.querySelector('#deadline-result')?.textContent ?? ''),
      undefined,
      { timeout: 5000 }
    );
  });

  await check('provisional jurisdictions are marked as provisional', async () => {
    // Navigates itself. It used to read whatever the previous check had
    // left on screen, which meant inserting a check above it silently
    // changed what it was measuring — and it did, the first time one
    // was: it went green on a page with no jurisdictions on it at all.
    await navigateTo(page, '/methodology');
    await page.waitForSelector('.oblig-table', { timeout: 5000 });
    const tags = await page.locator('#main .tag--provisional').count();
    assert(
      tags === PROVISIONAL_COUNT,
      `${tags} provisional tags on the page; the registry marks ${PROVISIONAL_COUNT} row(s)`
    );
  });

  await check('IS INSTALLABLE — the manifest advertises raster icons that exist', async () => {
    // This shipped with an SVG-only manifest, which looks tidy and is
    // not an installable app:
    //
    //   · iOS ignores an SVG apple-touch-icon completely and uses a
    //     screenshot of the page, so Add to Home Screen produced an icon
    //     of a half-rendered form.
    //   · Chrome's install criteria want a raster at 192 and 512, and a
    //     maskable one, or Android draws a white circle around it.
    //
    // Nothing in the build could have noticed: the manifest was valid
    // JSON pointing at files that existed.
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector('link[rel=manifest]');
      if (!link) return null;
      return (await fetch(link.href)).json();
    });
    assert(manifest, 'no manifest is linked from the document');

    const png = (manifest.icons ?? []).filter((i) => i.type === 'image/png');
    for (const size of ['192x192', '512x512']) {
      assert(
        png.some((i) => i.sizes === size),
        `the manifest advertises no PNG icon at ${size} — Chrome will not offer to install this`
      );
    }
    assert(
      png.some((i) => (i.purpose ?? '').includes('maskable')),
      'no maskable PNG — Android will draw a white circle around the icon'
    );

    // And every one of them must actually load. A manifest pointing at a
    // 404 is a manifest that passes every JSON check ever written.
    for (const iconEntry of manifest.icons ?? []) {
      const ok = await page.evaluate(
        async (src) => (await fetch(src, { method: 'GET' })).ok,
        iconEntry.src
      );
      assert(ok, `manifest icon ${iconEntry.src} does not load`);
    }

    // iOS reads this one and nothing else.
    const touch = await page.getAttribute('link[rel="apple-touch-icon"]', 'href');
    assert(touch, 'no apple-touch-icon — iOS would use a screenshot of the page');
    assert(
      touch.endsWith('.png'),
      `apple-touch-icon is "${touch}"; iOS ignores SVG here and substitutes a screenshot`
    );
  });

  await check('the service worker registers and precaches the shell', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.state ?? null;
    });
    assert(state === 'activated', `service worker state is ${state}`);

    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const shell = keys.find((k) => k.startsWith('usalamasms-shell-'));
      if (!shell) return 0;
      return (await (await caches.open(shell)).keys()).length;
    });
    assert(cached > 0, 'the shell cache is empty — offline launch would show the fallback page');
  });

  await check('a deep link resolves after a full reload', async () => {
    await page.goto(`${BASE}/triage`, { waitUntil: 'networkidle' });
    assert(await page.locator('.queue').isVisible(), '/triage did not render on a cold load');
  });

  await check('A DEEP LINK RELOADS OFFLINE — the offline claim, at the URL a person is on', async () => {
    // The worker precaches '/' and the hashed assets. It does NOT cache
    // /triage or /account, because those URLs are the router's business
    // and never exist as documents — they are reached by tapping the tab
    // bar, which is client-side and issues no navigation request.
    //
    // So a reload on one of them with no network matched nothing, fell
    // through to offline.html, and told the person "you are offline"
    // while the entire app sat in the cache one entry along. A product
    // whose central claim is that it works without signal must not show
    // an offline page to someone whose app is already on the device.
    //
    // THE URL MATTERS HERE. An earlier version of this check navigated
    // to /triage online first and then reloaded — which passed against
    // the broken worker, because that online visit had cached /triage
    // as a document. The defect only appears for a route reached the way
    // people actually reach it. This uses /account, which the suite only
    // ever opens by tapping.
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(400);

    await page.context().setOffline(true);
    await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);

    const state = await page.evaluate(() => ({
      isOfflinePage: /you are offline|no connection|reports you file are saved/i.test(
        document.querySelector('.offline-page, #offline')?.textContent ?? ''
      ),
      hasShell: Boolean(document.querySelector('#menu-toggle')),
      heading: document.querySelector('h1')?.textContent?.trim() ?? '',
    }));
    await page.context().setOffline(false);

    assert(
      state.hasShell,
      `an offline reload of /account did not render the app shell — it served ` +
        `"${state.heading}", which is the offline page for an app already on the device`
    );
    assert(!state.isOfflinePage, 'the offline page was served instead of the cached app');
    assert(/sign in|signed in/i.test(state.heading), `offline /account rendered "${state.heading}"`);
  });

  await check('no uncaught page errors across the whole run', async () => {
    assert(pageErrors.length === 0, `page errors: ${pageErrors.join('; ')}`);
  });
} finally {
  await browser.close();
  server.close();
}

for (const line of results) console.log(line);

if (failed > 0) {
  console.error(`\n${failed} smoke check(s) failed.`);
  process.exit(1);
}

/* Charter rule 11: a suite that runs nothing passes every time. */
if (results.length < 12) {
  console.error(`\nSmoke run executed only ${results.length} checks; this file defines more.`);
  process.exit(1);
}

console.log(`\nSmoke passed — ${results.length} checks against the built bundle.`);
