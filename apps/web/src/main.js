/* ============================================================
   App shell.

   Five routes, one outlet, and the sync strip above all of them.

     /          the landing page — what this is, and what its numbers
                are based on
     /report    the report form — the screen the product lives or dies by
     /triage    what is on this device and what has not been sent
     /account   sign in, so the queue can send
     /design    the brand system rendering itself against the real
                modules, so docs/04-BRAND.md can be checked by looking

   The form moved off `/` and the manifest's start_url moved onto
   /report with it. An installed app opens on the form because somebody
   who installed this installed it to file; a browser visitor opens on
   the landing page because they arrived to find out what it is. The
   constraint that put the form first is kept — it is just kept by
   start_url rather than by having no front door.

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
import {
  MOR_OBLIGATIONS,
  isProvisional
} from '../../../packages/shared/src/regulations.ts';
import { watchForInstall, offerUpdate } from './shared/prompts.js';
import { render as renderHome } from './tools/home/index.js';
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
  { href: '/report', label: 'File a report', hint: 'Three fields, thirty seconds, works with no signal' },
  { href: '/triage', label: 'Triage', hint: 'Everything filed on this device, sent or not' },
  { href: '/account', label: 'Account', hint: 'Sign in so queued reports can send' },
  { href: '/design', label: 'Design system', hint: 'The brand rendered against the real modules' }
];

/* Inline on a wide screen. Short labels here — the header has room for
   four words, not for four sentences. */
document.getElementById('nav').innerHTML = DESTINATIONS.map(
  (d) => html`<a href="${d.href}">${d.label.replace('File a report', 'Report')}</a>`
).join('');

/* ============================================================
   THE MENU IS THE NAVIGATION, and it lives in the header.

   This shipped with a bottom tab bar, on the argument that a thumb
   cannot reach the top of a 6.7-inch screen. That argument is real and
   it lost to a plainer one: the header is where a person looks for the
   way around, the footer was repeating the same four links as a second
   menu, and neither was telling them anything. The benchmark puts Menu
   in the header; so does this now, and the footer becomes information.

   The lockup is the way home. It is an <a href="/"> in every header on
   every screen, which is why the landing page is not also a
   destination in this list — a menu that offers "Home" beside a logo
   that already goes there is a list padded to look fuller.

   The panel carries a HINT per destination, which the tab bar could
   never have shown. "Triage" means nothing to somebody on their first
   shift; "everything filed on this device, sent or not" does.
   ============================================================ */
const menuPanel = document.getElementById('menu-panel');
const menuToggle = document.getElementById('menu-toggle');

menuPanel.innerHTML = DESTINATIONS.map(
  (d) => html`<a class="nav-item" href="${d.href}">
      <span class="nav-item-title">${d.label}</span>
      <span class="nav-item-summary">${d.hint}</span>
    </a>`
).join('');

function setMenu(open) {
  menuPanel.hidden = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
}

menuToggle.addEventListener('click', () => setMenu(menuPanel.hidden));

/* Close on anything that means "I am done here": a destination chosen,
   a click outside, or Escape. A panel that only closes by pressing the
   same button again is one people leave open and then tap through. */
menuPanel.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMenu(false);
});

document.addEventListener('click', (event) => {
  if (menuPanel.hidden) return;
  if (event.target.closest('#menu-panel, #menu-toggle')) return;
  setMenu(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !menuPanel.hidden) {
    setMenu(false);
    menuToggle.focus();
  }
});

/* ============================================================
   THE FOOTER'S ONE COMPUTED LINE.

   The five regulatory rows moved to the landing page, which is where a
   person checking a deadline can be sent with a URL. What stays here is
   the one fact the footer of every screen owes a reader: how many
   jurisdictions the figures cover, and how many of those are still
   provisional.

   Charter rule 10 applies to it exactly as it applied to the rows.
   Typing "five jurisdictions" here would be a second place the count
   lives, and the one nobody updates when a sixth is added — so it is
   counted from MOR_OBLIGATIONS, which is also what decides whether the
   sentence needs a caveat at all.
   ============================================================ */
const jurisdictions = Object.keys(MOR_OBLIGATIONS);
const provisional = jurisdictions.filter(isProvisional);

document.getElementById('footer-jurisdictions').textContent =
  `${jurisdictions.length} jurisdiction${jurisdictions.length === 1 ? '' : 's'}` +
  (provisional.length
    ? `, of which ${provisional.length} are provisional pending a read of the primary instrument.`
    : ', every one read against its primary instrument.');

/* Reveal the shell and retire the boot screen. Done here rather than in
   CSS so the swap happens when the app can actually render, not when
   the stylesheet loads — a shell that appears before its content is a
   flash of empty chrome. */
document.getElementById('app-shell').hidden = false;
document.getElementById('boot')?.remove();

/* ------------------------------ Routes ------------------------------ */
const outlet = document.getElementById('main');

router
  .register('/', (el) => renderHome(el), { title: 'Safety intelligence for African skies' })
  .register('/report', (el) => renderReport(el), { title: 'File a report' })
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
          That page does not exist. <a href="/report">File a report</a> instead.
        </p>
      </section>
    `.toString();
  })
  .start(outlet);

/* Mark the current route in the nav after every navigation. */
function markCurrentNav() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  for (const link of document.querySelectorAll('#nav a, #menu-panel a')) {
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

/* The unsent count, on the Triage tab.
   `.tabbar__badge` was styled and rendered by nothing — dead CSS for a
   job worth doing. A person who has navigated away from the strip still
   needs to know something is waiting, and the tab they would go to is
   the one that should say so. */
function renderTabBadge(pending) {
  // On the MENU BUTTON now, not on a tab. It is the only navigation
  // affordance on a handset, so it is the only place a count can be
  // seen without opening something.
  const tab = document.getElementById('menu-toggle');
  if (!tab) return;
  tab.querySelector('.tabbar__badge')?.remove();
  if (pending <= 0) return;

  const badge = document.createElement('span');
  badge.className = 'tabbar__badge';
  // 9+ rather than a three-digit number that overflows its own pill.
  badge.textContent = pending > 9 ? '9+' : String(pending);
  // The number alone is not an accessible label — "3" beside "Triage"
  // announces as "Triage 3", which is not what it means.
  badge.setAttribute('aria-label', `${pending} report${pending === 1 ? '' : 's'} waiting to send`);
  tab.appendChild(badge);
}

export async function renderSyncState() {
  try {
    const { state, pending, errored } = await syncStatus();
    strip.dataset.state = state;
    stripText.textContent = MESSAGES[state](pending, errored);
    renderTabBadge(pending);
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
