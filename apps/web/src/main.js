/* ============================================================
   App shell.

   Three routes, one outlet, and the sync strip above all of them.

     /          the report form — the screen the product lives or dies by
     /triage    what is on this device and what has not been sent
     /design    the brand system rendering itself against the real
                modules, so docs/04-BRAND.md can be checked by looking

   The strip is deliberately OUTSIDE the outlet. It is chrome, not a
   page: charter rule 8 extended says an unsynced report has not been
   made, and the only person who can carry it to signal is the one
   holding the handset. That fact does not stop being true when they
   navigate.
   ============================================================ */

import { html } from './shared/html.js';
import { Logo } from './components/Logo.js';
import { router } from './shared/router.js';
import { registerServiceWorker, listenForFlushRequests } from './shared/register-sw.js';
import { syncStatus, flushOutbox } from './shared/offline.ts';
import { render as renderReport } from './tools/report/index.js';
import { render as renderTriage } from './tools/triage/index.js';
import { render as renderDesign } from './tools/design/index.js';

/* ------------------------------ Chrome ------------------------------ */
document.getElementById('logo-slot').innerHTML = Logo({ height: 40 }).toString();

document.getElementById('nav').innerHTML = html`
  <a href="/">Report</a>
  <a href="/triage">Triage</a>
  <a href="/design">Design</a>
`.toString();

/* ------------------------------ Routes ------------------------------ */
const outlet = document.getElementById('main');

router
  .register('/', (el) => renderReport(el), { title: 'File a report' })
  .register('/triage', (el) => void renderTriage(el), { title: 'Triage' })
  .register('/design', (el) => renderDesign(el), { title: 'Design system' })
  .setNotFound((el) => {
    el.innerHTML = html`
      <section class="panel">
        <h1>Not found</h1>
        <p class="lede">
          That page does not exist. <a href="/">File a report</a> instead.
        </p>
      </section>
    `.toString();
  })
  .start(outlet);

/* Mark the current route in the nav after every navigation. */
function markCurrentNav() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  for (const link of document.querySelectorAll('#nav a')) {
    const active = link.getAttribute('href') === path;
    link.toggleAttribute('data-current', active);
    // aria-current is what a screen reader announces; the attribute
    // above is only what CSS colours. Both, or the visual state is a
    // state sighted users have and nobody else does.
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
window.addEventListener('popstate', markCurrentNav);
document.addEventListener('click', () => queueMicrotask(markCurrentNav));
markCurrentNav();

/* ---------------------------- Sync strip ---------------------------- */

const strip = document.getElementById('sync-strip');
const stripText = document.getElementById('sync-text');

const MESSAGES = {
  synced: () => 'Up to date — nothing waiting to send',
  pending: (n) => `${n} report${n === 1 ? '' : 's'} waiting to send`,
  offline: (n) =>
    n > 0
      ? `Offline — ${n} report${n === 1 ? '' : 's'} saved on this device, will send when signal returns`
      : 'Offline — reports you file are saved on this device',
  error: (_n, e) => `${e} report${e === 1 ? '' : 's'} could not be sent — open Triage to review`
};

export async function renderSyncState() {
  try {
    const { state, pending, errored } = await syncStatus();
    strip.dataset.state = state;
    stripText.textContent = MESSAGES[state](pending, errored);
  } catch {
    // A failed status read must not blank the strip: silence here looks
    // identical to "everything is sent", which is the one thing it must
    // never be mistaken for.
    strip.dataset.state = 'error';
    stripText.textContent = 'Could not read local storage — reports may not be saved';
  }
}

void renderSyncState();
window.addEventListener('online', () => void renderSyncState());
window.addEventListener('offline', () => void renderSyncState());

/* Refresh the strip after a submission, without the form needing to
   know the strip exists. */
window.addEventListener('usalamasms:report-filed', () => void renderSyncState());

/* -------------------------- Offline plumbing -------------------------- */
registerServiceWorker({
  onUpdateReady: () => console.info('[usalamasms] a new version is ready; reload to apply')
});

/* The worker asks; the page owns the ONE implementation of the flush.
   Two implementations of backoff and conflict handling is how a hazard
   report gets filed twice. */
listenForFlushRequests(async () => {
  const outcome = await flushOutbox();
  await renderSyncState();
  return outcome;
});
