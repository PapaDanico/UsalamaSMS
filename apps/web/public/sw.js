/* ============================================================
   UsalamaSMS service worker.

   Until this file existed, "offline-first" was a claim the product
   could not honour. `requestBackgroundSync()` called
   navigator.serviceWorker.ready, always threw because nothing was ever
   registered, and fell through to a foreground flush — and the app
   shell was not cached at all, so a ramp agent at a remote strip got a
   browser error page rather than a report form. The offline module's
   own header comment described that person; the deployment did not
   serve them.

   THREE STRATEGIES, chosen per request type rather than globally,
   because a single strategy is always wrong for something:

     · App shell        — cache-first. It changes only when we deploy,
                          and it must open with no radio at all.
     · API reads        — network-first with a cache fallback, so a
                          stale answer is available but a fresh one wins.
     · API writes       — NEVER cached, never replayed by the worker.
                          The outbox in Dexie owns write durability, and
                          two mechanisms replaying the same POST is how
                          you file a hazard report twice.
   ============================================================ */

/* Bumped by scripts/stamp-sw.mjs at build time. A hand-edited version
   string is a version string that stops changing, and a cache that
   never invalidates serves last month's app forever. */
const VERSION = '__BUILD_ID__';
const SHELL_CACHE = `usalamasms-shell-${VERSION}`;
const DATA_CACHE = `usalamasms-data-${VERSION}`;

/* The offline fallback is precached explicitly. Everything else in the
   shell is added by the build stamp, because hashed asset filenames are
   not knowable when this file is written. */
const PRECACHE = ['/', '/offline.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // Take over promptly. A safety report form that is one version
      // behind because the user has not closed every tab is a support
      // conversation nobody has time for.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('usalamasms-') && !k.endsWith(VERSION))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only same-origin. The CSP forbids off-origin requests anyway, and a
  // worker that caches third-party responses is a worker that has
  // quietly become a privacy problem.
  if (url.origin !== self.location.origin) return;

  // ==========================================================
  // WRITES ARE NOT THE WORKER'S BUSINESS.
  //
  // Anything that is not a GET goes straight to the network and is
  // never cached or retried here. Durability for writes belongs to the
  // Dexie outbox, which has the clientId, the backoff and the conflict
  // handling. A worker that also retried POSTs would give one report
  // two independent replay paths — and the server deduplicates by
  // clientId precisely because it cannot trust the client not to.
  // ==========================================================
  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

/** Shell: cache first, network as filler, offline page as last resort. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // A navigation with no network and nothing cached is the one case
    // where the user must be told something rather than shown a browser
    // error they will read as "the app is broken".
    if (request.mode === 'navigate') {
      const offline = await caches.match('/offline.html');
      if (offline) return offline;
    }
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

/** API reads: fresh if possible, stale if not, and honest about which. */
async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      // Mark it. A safety dashboard showing yesterday's SPI values as
      // though they were current is worse than showing nothing — the
      // client reads this header to say when the figures are from.
      const headers = new Headers(cached.headers);
      headers.set('x-usalama-stale', 'true');
      return new Response(await cached.blob(), {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
}

/* ------------------------- Background sync -------------------------
   The tag matches requestBackgroundSync() in shared/offline.ts. The
   worker cannot import that module — it has no DOM and a separate
   module graph — so it asks the page to flush instead, which keeps ONE
   implementation of the outbox rather than two that can disagree about
   backoff and conflict handling.

   If no page is open, the sync is retried by the browser on the next
   opportunity; the reports are already durable in IndexedDB, so nothing
   is lost by waiting. */
self.addEventListener('sync', (event) => {
  if (event.tag !== 'usalamasms-outbox') return;
  event.waitUntil(askPagesToFlush());
});

async function askPagesToFlush() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (clients.length === 0) {
    // Nothing to drive the flush. Reject so the browser reschedules
    // rather than recording a sync that did nothing.
    throw new Error('no client available to flush the outbox');
  }
  for (const client of clients) client.postMessage({ type: 'usalamasms:flush-outbox' });
}

/* Allow a page to trigger cache cleanup after a deploy without a
   reload — used by the update prompt in the app shell. */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'usalamasms:skip-waiting') self.skipWaiting();
});
