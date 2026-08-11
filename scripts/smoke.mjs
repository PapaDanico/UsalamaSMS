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

/* A static server that mirrors the SPA fallback Netlify provides, so a
   deep link to /triage resolves here the way it does in production. */
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = join(DIST, decodeURIComponent(url.pathname));

  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, url.pathname === '/' ? 'index.html' : 'index.html');
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

  await page.goto(BASE, { waitUntil: 'networkidle' });

  await check('the app renders', async () => {
    assert(await page.locator('#report-form').isVisible(), 'the report form did not render');
    assert(await page.locator('.us-mark').first().isVisible(), 'the mark did not render');
  });

  await check('no uncaught page errors on load', async () => {
    assert(pageErrors.length === 0, `page errors: ${pageErrors.join('; ')}`);
  });

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

  await check('the anonymity control is visible without opening anything', async () => {
    assert(
      await page.locator('.report__anon input').isVisible(),
      'the anonymous toggle is hidden — someone who needs it must see it before they type'
    );
  });

  await check('EXACTLY ONE navigation is visible at a time', async () => {
    // The shell renders each destination three times: the inline top
    // nav (wide screens), the bottom tab bar (handsets) and the footer.
    // Only one of the first two may be visible at any width, and the
    // moment both are, every `a[href="/triage"]` selector in this file
    // becomes ambiguous — which is how this check came to exist, by
    // Playwright picking a display:none link and timing out.
    //
    // It is also a real defect in its own right: two primary navs on
    // screen is a person tapping the one that is not where they expect.
    const visible = await page.evaluate(() =>
      ['#nav', '#tabbar'].filter((sel) => {
        const el = document.querySelector(sel);
        return el && getComputedStyle(el).display !== 'none';
      })
    );
    assert(
      visible.length === 1,
      `${visible.length} primary navigations visible at 390px: ${visible.join(', ') || 'none'}`
    );
    assert(visible[0] === '#tabbar', `at 390px the tab bar should be the navigation, got ${visible[0]}`);

    // And the inverse, at a desktop width. A tab bar fixed across a
    // 1280px viewport is a phone app pretending.
    const wide = await page.context().newPage();
    await wide.setViewportSize({ width: 1280, height: 900 });
    await wide.goto(BASE, { waitUntil: 'networkidle' });
    const wideVisible = await wide.evaluate(() =>
      ['#nav', '#tabbar'].filter((sel) => {
        const el = document.querySelector(sel);
        return el && getComputedStyle(el).display !== 'none';
      })
    );
    await wide.close();
    assert(
      wideVisible.length === 1 && wideVisible[0] === '#nav',
      `at 1280px the inline nav should be the navigation, got [${wideVisible.join(', ')}]`
    );
  });

  await check('THE TYPEFACE ACTUALLY LOADS — not a system substitute', async () => {
    // fonts.css declared no @font-face for the whole life of the project.
    // It was fourteen lines of comment explaining that the woff2 files
    // were absent and that the stack would fall through to the system UI
    // sans — "a legible default rather than a broken one".
    //
    // Legible, and not the design. --us-font names Inter first, every
    // headline is set at -0.028em tracking against Inter's metrics, and
    // the whole thing rendered in Roboto on Android and SF on iOS. The
    // layout was right and the typography was somebody else's.
    //
    // HOW THIS IS MEASURED, because the obvious ways do not work and the
    // first version of this check passed against a stylesheet with the
    // @font-face rules deleted:
    //
    //   · document.fonts.check('400 15px Inter') returns TRUE for a
    //     family that does not exist, because the check succeeds against
    //     the fallback the list resolves to.
    //   · getComputedStyle(h1).fontFamily returns the DECLARED stack —
    //     the string 'Inter, ui-sans-serif, …' — whether or not Inter
    //     was ever loaded. It reports the CSS, not the rendering.
    //   · A woff2 request proves nothing either: index.html preloads two
    //     weights, so the files are fetched even when no rule uses them.
    //
    // What cannot be faked is the WIDTH of rendered text. Inter's
    // advance widths differ from any fallback, so measuring the same
    // string in 'Inter, monospace' against a family that certainly does
    // not exist, in the same fallback, answers the only question worth
    // asking: is the glyph on screen the one that was designed for.
    const verdict = await page.evaluate(() => {
      const measure = (family) => {
        const el = document.createElement('span');
        el.textContent = 'File a report — 24 hours';
        el.style.cssText =
          `position:absolute;left:-9999px;top:0;white-space:nowrap;` +
          `font-size:32px;font-weight:700;font-family:${family}`;
        document.body.appendChild(el);
        const w = el.getBoundingClientRect().width;
        el.remove();
        return w;
      };
      return {
        inter: measure("'Inter', monospace"),
        absent: measure("'NoSuchFaceXYZ', monospace"),
        registered: [...document.fonts].filter((f) => f.family === 'Inter').map((f) => f.status),
      };
    });

    assert(
      verdict.registered.length > 0,
      'no Inter @font-face is registered — the page is rendering in a system font'
    );
    assert(
      verdict.registered.every((st) => st === 'loaded'),
      `Inter faces registered but not loaded: ${verdict.registered.join(', ')}`
    );
    assert(
      verdict.inter !== verdict.absent,
      `text set in Inter measures identically to a font that does not exist ` +
        `(${verdict.inter}px both) — the design is rendering in the fallback`
    );
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
    for (const sel of ['.btn--primary', '.chip', '.report__anon', '.select__control']) {
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
    await page.goto(BASE, { waitUntil: 'networkidle' });
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
    await page.goto(BASE, { waitUntil: 'networkidle' });

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
    await page.click('.tabbar a[href="/triage"]');
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

    await page.click('.tabbar a[href="/account"]');
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

  await check('the design route renders the matrix from the real module', async () => {
    await page.click('.site-footer__links a[href="/design"]');
    await page.waitForSelector('.risk-matrix__cell', { timeout: 5000 });
    const cells = await page.locator('.risk-matrix__cell').count();
    assert(cells === 25, `${cells} matrix cells, expected 25`);

    // Colour is never the only channel: every cell carries its code.
    const codes = await page.locator('.risk-matrix__code').count();
    assert(codes === 25, `${codes} tolerability codes, expected 25`);
  });

  await check('provisional jurisdictions are marked as provisional', async () => {
    const tags = await page.locator('.tag--provisional').count();
    assert(tags === 3, `${tags} provisional tags, expected 3 (UG, TZ, RW)`);
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
      hasShell: Boolean(document.querySelector('#tabbar')),
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
