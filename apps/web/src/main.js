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

import { html, raw } from './shared/html.js';
import { Lockup } from './components/Logo.js';
import { router } from './shared/router.js';
import { registerServiceWorker, listenForFlushRequests } from './shared/register-sw.js';
import { syncStatus, flushOutbox } from './shared/offline.ts';
import { resumeSession } from './shared/session.js';
import { watchForInstall, offerUpdate } from './shared/prompts.js';
import { render as renderReport } from './tools/report/index.js';
import { render as renderTriage } from './tools/triage/index.js';
import { render as renderLogin } from './tools/login/index.js';

/* ------------------------------ Chrome ------------------------------ */

document.getElementById('logo-slot').innerHTML = Lockup({ height: 34 }).toString();
document.getElementById('footer-logo-slot').innerHTML = Lockup({ height: 30 }).toString();

/* The destinations, declared once and rendered into two places. A phone
   gets them in the bottom bar where a thumb is; a desktop gets them
   inline in the top bar. Two lists would drift, and the one that
   drifted would be the one nobody was looking at. */
const DESTINATIONS = [
  {
    href: '/',
    label: 'Report',
    // 24px stroke icons, drawn inline so the shell has no icon-font and
    // no sprite request on a cold start over a bad link.
    icon: '<path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M15 3v4h4"/><path d="M12 11v6M9 14h6"/>'
  },
  {
    href: '/triage',
    label: 'Triage',
    icon: '<path d="M4 6h16M4 12h10M4 18h6"/><circle cx="18" cy="17" r="3"/>'
  },
  {
    href: '/account',
    label: 'Account',
    icon: '<circle cx="12" cy="8" r="3.4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'
  }
];

document.getElementById('nav').innerHTML = html`
  ${DESTINATIONS.map((d) => html`<a href="${d.href}">${d.label}</a>`)}
  <a href="/design">Design</a>
`.toString();

document.getElementById('tabbar').innerHTML = DESTINATIONS.map(
  (d) => html`<a href="${d.href}">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        ${raw(d.icon)}
      </svg>
      <span>${d.label}</span>
    </a>`
).join('');

/* Reveal the shell and retire the boot screen. Done here rather than in
   CSS so the swap happens when the app can actually render, not when
   the stylesheet loads — a shell that appears before its content is a
   flash of empty chrome. */
document.getElementById('app-shell').hidden = false;
document.getElementById('boot')?.remove();

/* ------------------------------ Routes ------------------------------ */
const outlet = document.getElementById('main');

router
  .register('/', (el) => renderReport(el), { title: 'File a report' })
  .register('/triage', (el) => void renderTriage(el), { title: 'Triage' })
  // NOT a guard in front of the report form, deliberately. Filing must
  // never require a password — see the header of tools/login. This route
  // is where someone goes to make the queue send, not a gate they pass
  // through to reach the product.
  .register('/account', (el) => renderLogin(el), { title: 'Sign in' })
  /* LAZY. The design route renders the whole brand system — the risk
     matrix, the obligation table, every token swatch — and it exists so
     docs/04-BRAND.md can be checked by looking. A ramp agent never opens
     it, and it was riding in the bundle that has to load over a bad link
     before anyone can file anything.

     Split out, it comes back over the network when someone asks for it,
     which is a fair trade for a screen only we use. */
  .register(
    '/design',
    (el) => {
      el.innerHTML = '<p class="lede">Loading the design system…</p>';
      import('./tools/design/index.js').then(
        (mod) => mod.render(el),
        () => {
          el.innerHTML =
            '<section class="panel"><h1>Design system</h1>' +
            '<p class="notice notice--error">This screen could not be loaded. ' +
            'It is fetched on demand and needs a connection the first time.</p></section>';
        }
      );
    },
    { title: 'Design system' }
  )
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
  for (const link of document.querySelectorAll('#nav a, #tabbar a, .site-footer__links a')) {
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
  error: (_n, e) => `${e} report${e === 1 ? '' : 's'} could not be sent — open Triage to review`,
  // The message that did not exist while the app had no way to sign in.
  // It names the ONE action that resolves it, because "waiting to send"
  // for something that can never send is the most damaging sentence
  // this strip could show.
  signed_out: (n) =>
    `${n} report${n === 1 ? '' : 's'} on this device cannot be sent until someone signs in`
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
window.addEventListener('usalamasms:session-changed', () => void renderSyncState());

/* Turn the stored refresh token back into a usable access token, then
   send anything that was waiting. Silent on failure — offline and
   expired are both normal, and both are already described by the strip
   rather than by an alert. */
void resumeSession()
  .then((ok) => (ok ? flushOutbox() : null))
  .then(() => renderSyncState());

/* Refresh the strip after a submission, without the form needing to
   know the strip exists. */
window.addEventListener('usalamasms:report-filed', () => void renderSyncState());
/* Fired after a flush finishes, as opposed to when a session starts. The
   two are not the same moment and treating them as one left the strip
   describing a queue that had already drained. */
window.addEventListener('usalamasms:sync-changed', () => void renderSyncState());

/* -------------------------- Offline plumbing -------------------------- */
/* A console.info is a message for whoever wrote this, not for a ramp
   agent. The update is offered on screen and NEVER applied on its own —
   applying it reloads the page, and a reload with a half-typed narrative
   on screen destroys the one thing this product promises to keep. */
registerServiceWorker({
  onUpdateReady: (registration) => offerUpdate(registration)
});

watchForInstall();

/* The worker asks; the page owns the ONE implementation of the flush.
   Two implementations of backoff and conflict handling is how a hazard
   report gets filed twice. */
listenForFlushRequests(async () => {
  const outcome = await flushOutbox();
  await renderSyncState();
  return outcome;
});
