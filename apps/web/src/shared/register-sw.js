/* ============================================================
   Service worker registration and the page side of Background Sync.

   The worker cannot flush the outbox itself — it has no DOM, a separate
   module graph, and no access to the Dexie instance the page holds. If
   it reimplemented the flush it would be a SECOND implementation of
   backoff, conflict handling and idempotency, and the day those two
   drift is the day a hazard report is filed twice or not at all.

   So the worker posts a message and the page does the work. One
   implementation, in shared/offline.ts, wherever the trigger came from.
   ============================================================ */

/**
 * @param {object} handlers
 * @param {() => Promise<unknown>} handlers.onFlush   Called when the worker asks for a flush.
 * @param {() => void} [handlers.onUpdateReady]       Called when a new version is waiting.
 */
export function registerServiceWorker({ onFlush, onUpdateReady } = {}) {
  if (!('serviceWorker' in navigator)) {
    // Not an error worth surfacing: the app still works, it just will
    // not open without a network. Logged so a support conversation can
    // establish which of the two situations someone is in.
    console.info('[usalamasms] no service worker support — offline launch unavailable');
    return Promise.resolve(null);
  }

  // Registration is deferred to load so it never competes with the
  // first paint. The design target is a mid-range Android; a worker
  // install that delays the report form is a worker that costs more
  // than it saves on the first visit.
  return new Promise((resolve) => {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              // `controller` is null on the very first install; that is
              // not an update, it is the initial one, and prompting
              // there would ask the user to reload a page they just
              // opened.
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                // The REGISTRATION is passed through, because applying
                // the update needs it and a handler that has to go and
                // find it again races the one that fired.
                onUpdateReady?.(registration);
              }
            });
          });
          resolve(registration);
        })
        .catch((err) => {
          console.warn('[usalamasms] service worker registration failed', err);
          resolve(null);
        });
    });
  });
}

/**
 * Listen for the worker's flush request.
 *
 * Registered once, at app start, and deliberately NOT inside the
 * offline module: that module is imported by tests and by code that has
 * no service worker, and a module with a global listener as an import
 * side effect is a module that cannot be tested in isolation.
 */
export function listenForFlushRequests(onFlush) {
  if (!('serviceWorker' in navigator) || typeof onFlush !== 'function') return;

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'usalamasms:flush-outbox') return;
    Promise.resolve(onFlush()).catch((err) => {
      // A rejected flush must not become an unhandled rejection — the
      // worker has already committed to this sync, and an uncaught
      // error here surfaces to the user as a console trace they cannot
      // act on rather than as a retry.
      console.warn('[usalamasms] outbox flush failed; will retry with backoff', err);
    });
  });
}

/** Tell a waiting worker to take over now. */
export function applyUpdate(registration) {
  registration?.waiting?.postMessage({ type: 'usalamasms:skip-waiting' });
}
