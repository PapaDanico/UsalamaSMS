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

  await check('the report form has exactly two required fields', async () => {
    // The thirty-second target is a design constraint, and it is the
    // one the whole strategy rests on. A future field marked required
    // is a decision, not an accident, and this is where it gets made.
    const required = await page.locator('#report-form [required]').count();
    assert(required === 2, `${required} required fields; the form is designed for 2`);
  });

  await check('the anonymity control is visible without opening anything', async () => {
    assert(
      await page.locator('.report__anon input').isVisible(),
      'the anonymous toggle is hidden — someone who needs it must see it before they type'
    );
  });

  await check('tap targets are at least 44px', async () => {
    // The SUBJECT is the tap target, not the control. A 24px checkbox
    // inside a full-width label is a 24px checkbox with a large target,
    // because clicking the label toggles it — asserting on the input
    // would have failed a control that is genuinely easy to hit and
    // taught the next person to inflate the checkbox instead.
    for (const sel of ['.btn--primary', '.chip', '.report__anon']) {
      const box = await page.locator(sel).first().boundingBox();
      assert(box, `${sel} not found`);
      assert(box.height >= 44, `${sel} is ${Math.round(box.height)}px high; gloved thumbs need 44`);
    }

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

  /* ============================================================
     THE ONE THAT MATTERS.
     ============================================================ */
  await check('files a report with the network cut', async () => {
    await context.setOffline(true);

    await page.fill('input[name=title]', 'Bird activity on short final, runway 06');
    await page.fill(
      'textarea[name=narrative]',
      'A flock of at least twenty birds crossed the approach path below 300 ft AGL. ' +
        'Third consecutive morning. No avoidance action was required.'
    );
    await page.click('button[type=submit]');

    await page.waitForFunction(
      () => document.querySelector('#report-status')?.textContent?.trim().length > 0,
      { timeout: 5000 }
    );

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
      () => /waiting to send|saved on this device/i.test(document.querySelector('#sync-text')?.textContent ?? ''),
      { timeout: 5000 }
    );
    const strip = await page.locator('#sync-strip').getAttribute('data-state');
    assert(strip === 'offline' || strip === 'pending', `sync strip is "${strip}" with an unsent report`);
  });

  await check('the queued report appears in triage', async () => {
    await page.click('a[href="/triage"]');
    await page.waitForSelector('.queue__item', { timeout: 5000 });
    const text = await page.locator('.queue__item').first().textContent();
    assert(/Bird activity/.test(text), 'the report filed offline is not in the queue');
    assert(/Waiting to send/i.test(text), 'the queue does not show that it is unsent');
  });

  await context.setOffline(false);

  await check('the design route renders the matrix from the real module', async () => {
    await page.click('a[href="/design"]');
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
