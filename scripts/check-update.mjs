/* ============================================================
   The update path — the one thing a PWA does that a website does not.

   WHY THIS FILE EXISTS. Every other check drives one version of the
   app. The failure this catches needs two, and it is the failure a
   long-lived installed app hits most: a new version is published while
   somebody has the old one open.

   What was found by driving it, all three parts of one defect:

     · the worker called skipWaiting() on install, so it took over
       without asking — overriding a decision prompts.js states in
       words: an update is "NEVER applied automatically";
     · activate then deleted the previous version's cache while a page
       was still running that version's JavaScript, so the next route
       that page opened fetched a chunk whose hash had moved and got a
       404 — and the reader, on full signal, was told "This page needs
       a connection";
     · the prompt's Reload button posted to registration.waiting, which
       is null once the worker has skipped. It did nothing.

   The two-version dance is simulated rather than built twice: v2 is v1
   with a new worker VERSION and one lazily-loaded chunk removed, which
   is exactly what a real deploy does to a chunk whose contents changed.
   ============================================================ */

import { createServer } from 'node:http';
import { readFile, cp, rm, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';
import { findChromium } from './lib/chromium.mjs';

const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;
const DIST = new URL('../dist/', import.meta.url).pathname;
const V1 = '/tmp/usalamasms-update-v1';
const V2 = '/tmp/usalamasms-update-v2';

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2'
};

const results = [];
let failed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    results.push(`  ok   ${name}`);
  } catch (err) {
    failed++;
    results.push(`  FAIL ${name}\n         ${err.message.split('\n')[0]}`);
  }
};
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

// ---- Build the two versions -----------------------------------------
await rm(V1, { recursive: true, force: true });
await rm(V2, { recursive: true, force: true });
await cp(DIST, V1, { recursive: true });
await cp(DIST, V2, { recursive: true });

const sw = await readFile(join(V2, 'sw.js'), 'utf8');
const version = sw.match(/const VERSION = '([^']+)'/)?.[1];
if (!version) {
  console.error('check:update — could not read VERSION out of the built sw.js.');
  process.exit(1);
}

/* One lazily-loaded chunk disappears from v2, which is what a deploy
   does to any chunk whose contents changed.

   It has to leave v2's PRECACHE list as well as the directory. The
   first run of this harness retired the file but left it named in the
   worker's manifest, so cache.addAll() rejected, install failed, and
   there was never a waiting worker at all — a harness that reported
   "the new version did not wait" about a version it had itself
   prevented from installing. The same shape of mistake as an earlier
   check in this repo that deleted the database it was measuring. */
const assets = await readdir(join(V2, 'assets'));
const victim = assets.find((f) => f.startsWith('index-') && f.endsWith('.js') && f !== assets[0]);
assert(victim, 'no lazily-loaded chunk found to retire');
await rm(join(V2, 'assets', victim));

const patched = sw
  .replace(version, 'deadbeefcafe')
  .replace(new RegExp(`["']/assets/${victim}["'],?`), '');
assert(!patched.includes(victim), `could not take ${victim} out of v2's precache manifest`);
await writeFile(join(V2, 'sw.js'), patched);

/* THE REAL POLICY, READ FROM THE REAL CONFIG.

   The referrer check below is only worth anything if this harness sends
   what production sends. Hardcoding "no-referrer" here would produce a
   test that passes forever while netlify.toml quietly said something
   else — so the value is parsed out of the deployed configuration, and
   weakening that file turns the BROWSER measurement red. */
const netlifyToml = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const REFERRER_POLICY = netlifyToml.match(/Referrer-Policy\s*=\s*"([^"]+)"/)?.[1];
assert(REFERRER_POLICY, 'could not read Referrer-Policy out of netlify.toml');

let ROOT = V1;
const gone = [];
/* Every /api/ request the browser makes, with the Referer it carried. */
const apiSeen = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  if (url.pathname.startsWith('/api/')) {
    apiSeen.push({ path: url.pathname, referer: req.headers.referer ?? '' });
    res.writeHead(200, {
      'content-type': 'application/json',
      'referrer-policy': REFERRER_POLICY
    });
    res.end(JSON.stringify({ reset: true, message: 'Password set.' }));
    return;
  }
  const path = join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  try {
    const body = await readFile(path);
    res.writeHead(200, {
      'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
      'referrer-policy': REFERRER_POLICY
    });
    res.end(body);
  } catch {
    if (extname(url.pathname)) {
      gone.push(url.pathname);
      res.writeHead(404);
      res.end('gone');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html', 'referrer-policy': REFERRER_POLICY });
    res.end(await readFile(join(ROOT, 'index.html')));
  }
});
await new Promise((r) => server.listen(PORT, r));

/* Resolved, not guessed. This line used to fall back to
   '/opt/pw-browsers/chromium' — one development container's layout,
   written as though it were a default. See scripts/lib/chromium.mjs. */
const browser = await chromium.launch({
  executablePath: findChromium()
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

await page.goto(BASE + '/report', { waitUntil: 'networkidle' });
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
  timeout: 20000
});

// A new version is published while this person has the app open.
ROOT = V2;
const seen = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  let controllerChanged = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    controllerChanged = true;
  });
  await reg.update();
  await new Promise((r) => setTimeout(r, 3000));
  return {
    waiting: Boolean(reg.waiting),
    controllerChanged,
    caches: await caches.keys()
  };
});

await check('A NEW VERSION WAITS TO BE ASKED, RATHER THAN TAKING OVER', async () => {
  assert(seen.waiting, 'the new worker did not wait — it activated without being asked');
  assert(
    !seen.controllerChanged,
    'the new worker claimed the open page before the person accepted it'
  );
});

await check('THE OPEN PAGE KEEPS THE ASSETS IT IS STILL RUNNING ON', async () => {
  assert(
    seen.caches.some((k) => k.includes(version)),
    `the cache for the running version was purged under it — caches: ${seen.caches.join(', ')}`
  );
});

await check('AND A ROUTE STILL OPENS FROM THE VERSION IT IS ON', async () => {
  // The whole point of not purging: this navigation used to 404 and
  // put "This page needs a connection" in front of an online reader.
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = '/toolkits/register';
    document.body.appendChild(a);
    a.click();
  });
  await page.waitForSelector('#reg-form', { timeout: 8000 });
  const heading = ((await page.locator('#main h1').first().textContent()) ?? '').trim();
  assert(heading === 'Risk register', `the route rendered "${heading}" instead of the register`);
});

await check('THE PROMPT IS OFFERED, AND ITS BUTTON ACTUALLY APPLIES THE UPDATE', async () => {
  // Reload used to post to registration.waiting, which is null once the
  // worker has skipped — so the button did nothing, twice over.
  const dock = page.locator('#update-prompt');
  assert(await dock.count(), 'no update prompt was shown to the person');

  /* Accepting must actually reload the page. Waiting on the navigation
     itself rather than on a condition that is true the moment it is
     asked — the first version of this waited for
     `performance.getEntriesByType('navigation').length > 0`, which is
     true on any loaded page, so it measured the caches before the
     reload had begun and failed the fix it was written to prove. */
  const reloaded = page.waitForNavigation({ timeout: 20000 });
  // [data-act=go], not the first button: dismiss is rendered first, so
  // `#update-prompt button` clicks "Later" and then waits forever for
  // a reload nobody asked for.
  await page.click('#update-prompt [data-act=go]');
  await reloaded;
  await page.waitForLoadState('networkidle');

  await page.waitForFunction(
    () => caches.keys().then((k) => k.some((n) => n.includes('deadbeefcafe'))),
    undefined,
    { timeout: 15000 }
  );

  const caches_ = await page.evaluate(() => caches.keys());
  assert(
    caches_.some((k) => k.includes('deadbeefcafe')),
    `after accepting, the new version is not the cached one: ${caches_.join(', ')}`
  );
  assert(
    !caches_.some((k) => k.includes(version)),
    `the old cache survived an accepted update, so it will never be reclaimed: ${caches_.join(', ')}`
  );
});

await check('A DISMISSED UPDATE IS OFFERED AGAIN ON THE NEXT LOAD', async () => {
  /* THE DEFECT: `updatefound` fires when a new worker STARTS
     installing. It does not fire for one that finished installing on a
     previous visit and is sitting in `waiting` — and this worker
     deliberately does not skipWaiting, so that is exactly where it sits
     once somebody dismisses the prompt or closes the tab.

     So the prompt appeared once, was ignored, and never appeared again.
     The handset stayed on the old build permanently, including an old
     copy of the reporting deadline table. It surfaced as "the font is
     still the same" from somebody several versions behind, which is the
     visible half of a much less visible problem.

     A fresh context, because the page above has already accepted the
     update and is running v2. */
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tab = await fresh.newPage();
  try {
    ROOT = V1;
    await tab.goto(BASE + '/report', { waitUntil: 'networkidle' });
    await tab.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined,
      { timeout: 20000 });

    ROOT = V2;
    await tab.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.update();
      await new Promise((r) => setTimeout(r, 3000));
    });
    assert(await tab.locator('#update-prompt').count(), 'no prompt was offered at all');

    // Dismissed, exactly as somebody in a hurry does.
    await tab.click('#update-prompt [data-act=dismiss]');
    await tab.waitForTimeout(400);
    assert(
      (await tab.locator('#update-prompt').count()) === 0,
      'dismissing the prompt did not dismiss it'
    );

    // The next time they open the app. The worker is still waiting;
    // `updatefound` will not fire again for it.
    await tab.reload({ waitUntil: 'networkidle' });
    await tab.waitForTimeout(2500);
    assert(
      await tab.locator('#update-prompt').count(),
      'the waiting update was never offered again — the device is pinned to the old build ' +
        'for good, and nothing in the app will ever tell the person why'
    );
  } finally {
    await fresh.close();
    ROOT = V2;
  }
});

await check('A CREDENTIAL IN A URL IS NEVER WRITTEN TO CACHE STORAGE', async () => {
  /* ============================================================
     THE DEFECT, AND IT WAS INVISIBLE IN BOTH FILES THAT CAUSED IT.

     `cache.put(request, …)` keys on the FULL URL. A password-reset
     link is a navigation to /reset?token=<32 random bytes>, which is a
     same-origin GET like any other — so the worker wrote the live
     credential into Cache Storage, on disk, outliving the tab and the
     session and readable by anything running on the origin.

     sw.js was right about caching a shell. reset-panel.js was right
     about holding a secret, and says in its own comment that the token
     "is not written to storage" — true of every line in that file and
     false of the running system. Neither file references the other,
     which is why nothing in either one could have shown this.

     FOUND BY ASKING THE BROWSER, not by reading. Real dist, real
     worker, real Chromium, a navigation to a reset URL, then
     `caches.keys()` — and the answer contained the token.

     THE FIXTURE IS A TOKEN-SHAPED STRING, deliberately. A short marker
     like "abc" could match something incidental in the bundle and turn
     this into a check that passes for the wrong reason; 32 characters
     of nothing-else-in-this-repo cannot.

     WHAT TO DO WHEN IT FAILS. Something now caches a navigation under
     a key that includes its query string. Normalise the key — see
     cacheKeyFor() in sw.js. Do not solve it by taking the token out of
     the URL: a link in an email has nowhere else to carry it.
     ============================================================ */
  const SECRET = 'MEASUREDSECRETTOKEN0123456789abcdefghij';
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tab = await fresh.newPage();
  try {
    await tab.goto(BASE + '/', { waitUntil: 'networkidle' });
    await tab.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 20000,
    });

    // The thing a person clicking a link in their inbox actually does.
    await tab.goto(`${BASE}/reset?token=${SECRET}`, { waitUntil: 'networkidle' });
    await tab.waitForTimeout(1200);

    /* THE SCREEN MUST HAVE RENDERED, or this measures an empty cache
       and reports it as safety — the shape of check this repository has
       been bitten by before. */
    assert(
      await tab.locator('#reset-form').count(),
      'the reset form did not render, so nothing was measured and a green result means nothing',
    );

    const stored = await tab.evaluate(async (secret) => {
      const hits = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) {
          if (req.url.includes(secret)) hits.push(`${name} :: ${req.url}`);
        }
      }
      return hits;
    }, SECRET);

    assert(
      stored.length === 0,
      'a live credential from the URL is sitting in Cache Storage on disk, where it ' +
        `outlives the tab and the session: ${stored.join(', ')}`,
    );

    /* AND THE SHELL IS STILL CACHED, which is the other direction and
       the reason this is not fixed by simply not caching. A gate that
       only checks the secret is absent passes perfectly against a
       worker that caches nothing at all and has quietly ended the
       offline promise. */
    const shellCached = await tab.evaluate(async () => {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        if (await cache.match('/reset')) return true;
      }
      return false;
    });
    assert(
      shellCached,
      'the navigation was not cached under its path either — offline reloads of this ' +
        'route now depend on the network, which is the promise this product is built on',
    );
  } finally {
    await fresh.close();
  }
});

await check('AND IT DOES NOT ESCAPE IN A REFERER EITHER', async () => {
  /* ============================================================
     THE SECOND HALF OF THE SAME CREDENTIAL, and the reason it needs
     its own check is that the cache fix does nothing for it.

     `Referrer-Policy: strict-origin-when-cross-origin` — the value
     this repository shipped, and a sensible default everywhere else —
     sends the FULL URL on SAME-ORIGIN requests. It only strips the
     path when crossing origins. So POST /api/v1/auth/reset carried

       Referer: /reset?token=<32 random bytes>

     into the access log of every hop that records one, and so did the
     module fetch for the screen's own chunk, which happens before any
     line of application code runs.

     THIS WAS FIRST DISMISSED ON REASONING AND THE REASONING WAS
     WRONG. The absence of a <meta name="referrer"> was measured and
     read as "default policy, low risk". The actual header was not
     looked at until later, and when it was, the token was in it. That
     is the whole argument for this skill written small: an inference
     about a header is not a measurement of a header.

     WHAT TO DO WHEN IT FAILS. netlify.toml has been loosened, or a
     screen has started putting a secret in a URL that this check does
     not know about. Do not fix it by narrowing the marker.
     ============================================================ */
  const SECRET = 'REFERERPROBETOKEN0123456789abcdefghij';
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tab = await fresh.newPage();
  apiSeen.length = 0;
  try {
    await tab.goto(`${BASE}/reset?token=${SECRET}`, { waitUntil: 'networkidle' });

    /* The form must be there and must actually submit, or this counts
       the referers of zero requests and calls it safety. */
    assert(await tab.locator('#reset-form').count(), 'the reset form did not render');
    await tab.fill('#reset-password', 'a-long-enough-password');
    await tab.click('#reset-form button[type=submit]');
    await tab.waitForTimeout(1200);

    assert(
      apiSeen.some((r) => r.path === '/api/v1/auth/reset'),
      'the form never reached the API, so no referer was measured and green means nothing',
    );

    const leaking = apiSeen.filter((r) => r.referer.includes(SECRET));
    assert(
      leaking.length === 0,
      'the credential in the URL is being sent to the server in a Referer header, where ' +
        `it lands in the access log: ${leaking.map((r) => `${r.path} <- ${r.referer}`).join(', ')}`,
    );
  } finally {
    await fresh.close();
  }
});

console.log('\n' + results.join('\n'));
await browser.close();
server.close();
await rm(V1, { recursive: true, force: true });
await rm(V2, { recursive: true, force: true });

if (failed) {
  console.error(`\n${failed} update check(s) failed.\n`);
  process.exit(1);
}
console.log(`\ncheck:update passed — ${results.length} checks across two versions.\n`);
