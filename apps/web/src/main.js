/* ============================================================
   App shell.

   One outlet, the sync strip above all of it, and the architecture
   declared in shared/sitemap.js rather than here.

     /             the landing page — what this is, and what its
                   numbers rest on
     /report       the report form — the screen the product lives or
                   dies by, and the manifest's start_url
     /triage       what is on this device and what has not been sent
     /account      sign in, so the queue can send

   and, lazily, the reference: /methodology (which replaced the route
   once called "design system" — a name that described the screen to
   the people who built it and to nobody else), /tutorials, /faq,
   /about, /privacy, /terms.

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
import { SECTIONS, WORKING_SECTIONS } from './shared/sitemap.js';
import { render as renderHome } from './tools/home/index.js';
import { render as renderReport } from './tools/report/index.js';
import { render as renderLogin } from './tools/login/index.js';

/* ------------------------------ Chrome ------------------------------ */

document.getElementById('logo-slot').innerHTML = Lockup({ height: 34 }).toString();
document.getElementById('footer-logo-slot').innerHTML = Lockup({ height: 30 }).toString();

/* ============================================================
   THE NAVIGATION, from one declaration.

   shared/sitemap.js holds the whole information architecture. The
   header renders the sections marked `working` — what somebody uses
   the product to do, and the reference they reach for while doing it.
   The footer renders all four as columns. Two hand-written lists is
   how the footer came to repeat the header's four destinations and
   tell nobody anything, and the half nobody looks at is the half that
   goes stale.

   THE MENU IS THE NAVIGATION, and it lives in the header. This shipped
   with a bottom tab bar, on the argument that a thumb cannot reach the
   top of a 6.7-inch screen. That argument is real and it lost to a
   plainer one: the header is where a person looks for the way around.

   The lockup is the way home — an <a href="/"> in every header on
   every screen, which is why the landing page is not also an item in
   the list. A menu offering "Home" beside a logo that already goes
   there is a list padded to look fuller.

   Each item carries a HINT, which the tab bar could never have shown.
   "Triage" means nothing to somebody on their first shift;
   "everything filed on this handset, sent or not" does.
   ============================================================ */

/* Inline on a wide screen. SHORT labels here — the header has room for
   four words, not for four sentences. Only the platform's own
   destinations plus the methodology, because eight inline links is a
   menu bar, and a menu bar on a safety tool is somebody hunting. */
document.getElementById('nav').innerHTML = [
  ...SECTIONS[0].items,
  SECTIONS[1].items[0]
]
  .map((d) => html`<a href="${d.href}">${d.short ?? d.label}</a>`)
  .join('');

const menuPanel = document.getElementById('menu-panel');
const menuToggle = document.getElementById('menu-toggle');

menuPanel.innerHTML = WORKING_SECTIONS.map(
  (section) => html`<div class="nav-group">
      <p class="nav-group__title">${section.title}</p>
      ${section.items.map(
        (d) => html`<a class="nav-item" href="${d.href}">
          <span class="nav-item-title">${d.label}</span>
          <span class="nav-item-summary">${d.hint}</span>
        </a>`
      )}
    </div>`
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
   THE FOOTER, RENDERED FROM THE SAME DECLARATION.

   Four columns, one per section of the architecture, so the footer
   cannot fall out of step with the header. It is not the header drawn
   twice — it carries About, Methodology, Tutorials, Questions, the
   privacy notice and the terms, none of which are working navigation —
   and scripts/smoke.mjs holds that line by asserting the footer
   carries links the header does not.

   No hints here. A hint under a footer link is a paragraph in a column
   eighty pixels wide.

   THE ONE COMPUTED LINE. The five regulatory rows moved to the landing
   page, which is where a person checking a deadline can be sent a URL.
   What stays is the fact the footer of every screen owes a reader: how
   many jurisdictions the figures cover and how many are provisional.
   Charter rule 10 — typing "five" here would be a second place the
   count lives, and the one nobody updates when a sixth is added.
   ============================================================ */
document.getElementById('footer-columns').innerHTML = SECTIONS.map(
  (section) => html`<div class="footer-col">
      <h2 class="section-title">${section.title}</h2>
      ${section.items.map((d) => html`<p><a href="${d.href}">${d.label}</a></p>`)}
    </div>`
).join('');

const jurisdictions = Object.keys(MOR_OBLIGATIONS);
const provisional = jurisdictions.filter(isProvisional);

document.getElementById('footer-jurisdictions').textContent =
  `Deadlines cover ${jurisdictions.length} jurisdiction` +
  (jurisdictions.length === 1 ? '' : 's') +
  (provisional.length
    ? `, of which ${provisional.length} carry a provisional figure pending a reading of the primary instrument.`
    : ', every one read against its primary instrument, with ICAO as the baseline where a State period has not been.');

/* Reveal the shell and retire the boot screen. Done here rather than in
   CSS so the swap happens when the app can actually render, not when
   the stylesheet loads — a shell that appears before its content is a
   flash of empty chrome. */
document.getElementById('app-shell').hidden = false;
document.getElementById('boot')?.remove();

/* ------------------------------ Routes ------------------------------ */
const outlet = document.getElementById('main');

/* One place where a lazily-loaded screen is awaited, and one place
   where failing to load one is reported. Written once because a route
   that silently renders nothing when its chunk fails is indistinguishable
   from a route that rendered an empty screen on purpose. */
function lazy(el, load) {
  el.innerHTML = '<div class="panel wrap"><p class="lede">Loading…</p></div>';
  load().then(
    (render) => render(el),
    () => {
      /* Two different failures used to share one message, and the one
         that fires most often got the wrong half. A chunk 404s when a
         new version has been deployed under a page that is still
         running the old build — the reader is on full signal and was
         being told they had none. Ask the browser which situation this
         is rather than guessing, and offer the action that fixes it. */
      el.innerHTML = navigator.onLine
        ? '<section class="panel wrap"><h1>This app has been updated</h1>' +
          '<p class="notice notice--error">A newer version was published while ' +
          'this page was open, so part of the old one is no longer available. ' +
          'Reload to pick it up. Anything already filed on this device is ' +
          'untouched — reloading does not send or lose a report.</p>' +
          '<p><button type="button" class="btn btn-primary" id="stale-reload">Reload</button></p>' +
          '</section>'
        : '<section class="panel wrap"><h1>This page needs a connection</h1>' +
          '<p class="notice notice--error">It is fetched when asked for rather than ' +
          'carried on every screen, so it needs signal the first time. Filing a report ' +
          'does not — that works offline and is on this device already.</p></section>';
      el.querySelector('#stale-reload')?.addEventListener('click', () =>
        window.location.reload()
      );
    }
  );
}

router
  .register('/', (el) => renderHome(el), { title: 'Safety intelligence for African skies' })
  .register('/report', (el) => renderReport(el), { title: 'File a report' })
  /* LAZY, and this was the entry budget's last 4 KB.

     The queue is a working destination and splitting it is not free —
     it costs a round trip the first time somebody opens it. It is
     still right: the entry chunk gates time-to-FIRST-REPORT, the
     manifest starts an installed app on /report, and a person who has
     just filed something has a connection often enough that the chunk
     is there before they look. What the entry cannot afford is a
     screen nobody has asked for yet. */
  .register(
    '/triage',
    (el) => lazy(el, () => import('./tools/triage/index.js').then((m) => (o) => void m.render(o))),
    { title: 'Reports on this device' }
  )
  // NOT a guard in front of the report form, deliberately. Filing must
  // never require a password — see the header of tools/login. This route
  // is where someone goes to make the queue send, not a gate they pass
  // through to reach the product.
  .register('/account', (el) => renderLogin(el), { title: 'Sign in' })
  /* LAZY, all of them. A ramp agent filing a hazard at a remote strip
     opens none of these, and every kilobyte here would otherwise be
     charged to the screen they do open — which loads over the link that
     is the reason this product exists.

     Each carries its own failure message rather than a shared one,
     because "this screen could not be loaded" on a privacy notice and
     on the methodology are different problems for the reader. */
  .register(
    '/methodology',
    (el) => lazy(el, () => import('./tools/methodology/index.js').then((m) => (o) => m.render(o))),
    { title: 'Methodology' }
  )
  .register(
    '/toolkits',
    (el) => lazy(el, () => import('./tools/toolkits/index.js').then((m) => (o) => m.render(o))),
    { title: 'Toolkits' }
  )
  .register(
    '/toolkits/register',
    (el) => lazy(el, () => import('./tools/register/index.js').then((m) => (o) => m.render(o))),
    { title: 'Risk register' }
  )
  .register(
    '/toolkits/sra',
    (el) => lazy(el, () => import('./tools/sra/index.js').then((m) => (o) => m.render(o))),
    { title: 'Safety risk assessment' }
  )
  .register(
    '/toolkits/spi',
    (el) => lazy(el, () => import('./tools/spi/index.js').then((m) => (o) => m.render(o))),
    { title: 'Safety performance indicators' }
  )
  .register(
    '/toolkits/maturity',
    (el) => lazy(el, () => import('./tools/maturity/index.js').then((m) => (o) => m.render(o))),
    { title: 'SMS maturity assessment' }
  )
  .register(
    '/templates',
    (el) => lazy(el, () => import('./tools/templates/index.js').then((m) => (o) => m.render(o))),
    { title: 'Templates and source documents' }
  )
  .register(
    '/sms',
    (el) => lazy(el, () => import('./tools/sms/index.js').then((m) => (o) => m.render(o))),
    { title: 'The SMS record' }
  )
  .register(
    '/coverage',
    (el) => lazy(el, () => import('./tools/coverage/index.js').then((m) => (o) => m.render(o))),
    { title: 'What this covers' }
  )
  .register(
    '/glossary',
    (el) => lazy(el, () => import('./tools/glossary/index.js').then((m) => (o) => m.render(o))),
    { title: 'Glossary' }
  )
  .register(
    '/about',
    (el) =>
      lazy(el, () =>
        Promise.all([import('./tools/pages/index.js'), import('./content/pages.js')]).then(
          ([mod, content]) => (o) => mod.renderPage(o, content.PAGES['/about'])
        )
      ),
    { title: 'About us' }
  )
  .register(
    '/tutorials',
    (el) =>
      lazy(el, () =>
        Promise.all([import('./tools/pages/index.js'), import('./content/pages.js')]).then(
          ([mod, content]) => (o) => mod.renderPage(o, content.PAGES['/tutorials'])
        )
      ),
    { title: 'Tutorials' }
  )
  .register(
    '/faq',
    (el) =>
      lazy(el, () =>
        Promise.all([import('./tools/pages/index.js'), import('./content/pages.js')]).then(
          ([mod, content]) => (o) => mod.renderPage(o, content.PAGES['/faq'])
        )
      ),
    { title: 'Questions, answered straight' }
  )
  .register(
    '/privacy',
    (el) =>
      lazy(el, () =>
        Promise.all([import('./tools/pages/index.js'), import('./content/pages.js')]).then(
          ([mod, content]) => (o) => mod.renderPage(o, content.PAGES['/privacy'])
        )
      ),
    { title: 'Privacy notice' }
  )
  .register(
    '/terms',
    (el) =>
      lazy(el, () =>
        Promise.all([import('./tools/pages/index.js'), import('./content/pages.js')]).then(
          ([mod, content]) => (o) => mod.renderPage(o, content.PAGES['/terms'])
        )
      ),
    { title: 'Terms of use' }
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
