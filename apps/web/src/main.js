/* ============================================================
   App shell.

   One outlet, the sync strip above all of it, and the architecture
   declared in shared/sitemap.js rather than here.

     /             the landing page — what this is, and what its
                   numbers rest on
     /report       the report form — the screen the product lives or
                   dies by, and the manifest's start_url
     /triage       the operator's queue, and what has not left this device
     /picture      the aggregate position: reporting, register, indicators
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
import { resumeSession, isSignedIn } from './shared/session.js';
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
/* GOLD, because the footer is charcoal. The header sits on Warm Sand
   and takes the ink variant; passing the same one here put a charcoal
   mark on a charcoal panel and made it disappear. */
document.getElementById('footer-logo-slot').innerHTML = Lockup({
  height: 30,
  tone: 'gold',
}).toString();

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
   four words, not for four sentences, and eight inline links is a menu
   bar rather than a route through the product.

   READ FROM `inHeader`, NOT FROM POSITION. This was
   `[...SECTIONS[0].items, SECTIONS[1].items[0]]` — "everything in the
   first group, plus whatever happens to be first in the second". That
   is a header whose contents are a side effect of the order of
   sitemap.js, and the very next change to that file was a reordering
   of every group. It would have rewritten the header silently and
   correctly-looking: still five links, still short labels, just no
   longer the five anybody chose.

   The five that carry the flag are one per step of the sequence, so
   the header reads left to right as the order the work happens in:
   where you stand, then what to do when something happens, then
   assessing it, then showing it works. */
document.getElementById('nav').innerHTML = WORKING_SECTIONS.flatMap((s) => s.items)
  .filter((d) => d.inHeader)
  .map((d) => html`<a href="${d.href}">${d.short ?? d.label}</a>`)
  .join('');

const menuPanel = document.getElementById('menu-panel');
const menuToggle = document.getElementById('menu-toggle');

/* TITLES NOW, SUMMARIES WHEN THEY ARRIVE.

   The hint sentences moved to shared/menu-hints.js and are imported
   dynamically, so they are not parsed before first paint. The reason
   is written out in that file; what matters here is the consequence:
   this panel renders complete and usable without them. A title is the
   navigation, a hint is help text, and every destination is clickable
   from the first frame whether or not the sentences ever land.

   The summary element is written empty rather than omitted. Creating
   it later would reflow the panel under whatever the reader had
   already started moving a thumb towards; an empty span reserves
   nothing visually and gives fill() somewhere to write. */
menuPanel.innerHTML = WORKING_SECTIONS.map(
  (section) => html`<div class="nav-group" data-group="${section.id}">
      <p class="nav-group__title">${section.title}</p>
      <p class="nav-group__purpose"></p>
      ${section.items.map(
        (d) => html`<a class="nav-item" href="${d.href}">
          <span class="nav-item-title">${d.label}</span>
          <span class="nav-item-summary"></span>
        </a>`
      )}
    </div>`
).join('');

/* Fetched once. The promise is the guard rather than a boolean, so a
   second call while the first is still in flight joins it instead of
   starting a parallel download — the same single-flight reasoning the
   token refresh uses, for the same reason. */
let hints;
function loadHints() {
  hints ??= import('./shared/menu-hints.js')
    .then(({ MENU_HINTS, GROUP_PURPOSE }) => {
      /* Keyed off the anchor's own href rather than a data- attribute
         repeating it. Writing data-hint-for onto fifteen items put the
         href in the entry chunk twice, which is weight spent to avoid
         one getAttribute — on the exact chunk this change exists to
         make smaller. */
      for (const a of menuPanel.querySelectorAll('a.nav-item')) {
        const text = MENU_HINTS[a.getAttribute('href')];
        if (text) a.querySelector('.nav-item-summary').textContent = text;
      }
      /* The group's own line, keyed off the id the section already
         carries — same rule as above, and the id is four characters
         where the title is a sentence. */
      for (const g of menuPanel.querySelectorAll('.nav-group')) {
        const text = GROUP_PURPOSE[g.dataset.group];
        if (text) g.querySelector('.nav-group__purpose').textContent = text;
      }
    })
    .catch(() => {
      /* Deliberately silent, and safe to be. The menu keeps every
         title and every destination; what is missing is a sentence of
         help under each one. Reporting that as an error would put a
         failure message in front of somebody whose navigation is
         working. */
    });
  return hints;
}

/* Warmed on idle so the first open usually finds them already there.
   requestIdleCallback yields to anything the app is still doing, which
   on a cold start at a strip is the point — this must never compete
   with the report form for the main thread. Safari has no
   requestIdleCallback, hence the timeout fallback. */
const warm = () => loadHints();
if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 4000 });
else setTimeout(warm, 2000);

function setMenu(open) {
  menuPanel.hidden = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
  if (open) void loadHints();
}

menuToggle.addEventListener('click', () => setMenu(menuPanel.hidden));

/* Ahead of the click where the platform gives us the chance. A pointer
   arriving on the button is a menu about to open, and on a handset
   pointerdown precedes click by the length of a tap. */
menuToggle.addEventListener('pointerenter', warm, { once: true });
menuToggle.addEventListener('pointerdown', warm, { once: true });

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
  .register('/report', (el) => renderReport(el), { title: 'File a report', surface: 'tool' })
  /* LAZY, and this was the entry budget's last 4 KB.

     The queue is a working destination and splitting it is not free —
     it costs a round trip the first time somebody opens it. It is
     still right: the entry chunk gates time-to-FIRST-REPORT, the
     manifest starts an installed app on /report, and a person who has
     just filed something has a connection often enough that the chunk
     is there before they look. What the entry cannot afford is a
     screen nobody has asked for yet. */
  /* LAZY, for the same reason the queue is. This is the screen a SAFETY
     MANAGER opens first and a reporter at a strip never opens at all —
     it needs a session and reads the organisation's record. Charging
     its weight to the entry chunk would bill the person filing a hazard
     over a bad link for a screen they will never see. */
  .register(
    '/today',
    (el) => lazy(el, () => import('./tools/today/index.js').then((m) => (o) => m.render(o))),
    { title: 'What needs you today', surface: 'tool' }
  )
  .register(
    '/triage',
    (el) => lazy(el, () => import('./tools/triage/index.js').then((m) => (o) => void m.render(o))),
    { title: 'The reporting queue', surface: 'tool' }
  )
  // NOT a guard in front of the report form, deliberately. Filing must
  // never require a password — see the header of tools/login. This route
  // is where someone goes to make the queue send, not a gate they pass
  // through to reach the product.
  .register('/account', (el) => renderLogin(el), { title: 'Sign in', surface: 'tool' })
  /* LAZY, like every other destination below. The profile form is
     opened rarely and by somebody already signed in, so it has no claim
     on the chunk a reporter downloads to file a hazard. */
  .register(
    '/account/profile',
    (el) => import('./tools/login/profile.js').then((m) => m.render(el)),
    { title: 'Your profile', surface: 'tool' }
  )
  /* Lazy for the same reason, and more so: this one carries a canvas
     resizer that only ever runs when somebody uploads a mark. */
  .register(
    '/account/logo',
    (el) => import('./tools/login/logo-panel.js').then((m) => m.render(el)),
    { title: 'Your operator’s mark', surface: 'tool' }
  )
  /* Lazy like its neighbours. An operator adds people a handful of
     times in the product's life; a ramp agent filing a hazard never
     opens it. */
  .register(
    '/account/team',
    (el) => import('./tools/login/team-panel.js').then((m) => m.render(el)),
    { title: 'The people in your organisation', surface: 'tool' }
  )
  /* LAZY, all of them. A ramp agent filing a hazard at a remote strip
     opens none of these, and every kilobyte here would otherwise be
     charged to the screen they do open — which loads over the link that
     is the reason this product exists.

     Each carries its own failure message rather than a shared one,
     because "this screen could not be loaded" on a privacy notice and
     on the methodology are different problems for the reader. */
  /* LAZY, and it must be. The risk picture reads every table the
     product has and a reporter at a strip never opens it — it is the
     screen a safety manager shows to somebody else. */
  /* LAZY, like every screen a ramp agent never opens. Fatigue is read
     by the safety office, and its weight has no claim on the chunk
     somebody downloads to file a hazard over a bad link. */
  .register(
    '/fatigue',
    (el) => lazy(el, () => import('./tools/fatigue/index.js').then((m) => (o) => m.render(o))),
    { title: 'Fatigue', surface: 'tool' }
  )
  .register(
    '/picture',
    (el) => lazy(el, () => import('./tools/picture/index.js').then((m) => (o) => void m.render(o))),
    { title: 'The risk picture', surface: 'tool' }
  )
  .register(
    '/methodology',
    (el) => lazy(el, () => import('./tools/methodology/index.js').then((m) => (o) => m.render(o))),
    { title: 'Methodology' }
  )
  .register(
    '/toolkits',
    (el) => lazy(el, () => import('./tools/toolkits/index.js').then((m) => (o) => m.render(o))),
    { title: 'Toolkits', surface: 'tool' }
  )
  .register(
    '/toolkits/register',
    (el) => lazy(el, () => import('./tools/register/index.js').then((m) => (o) => m.render(o))),
    { title: 'Risk register', surface: 'tool' }
  )
  .register(
    '/toolkits/sra',
    (el) => lazy(el, () => import('./tools/sra/index.js').then((m) => (o) => m.render(o))),
    { title: 'Safety risk assessment', surface: 'tool' }
  )
  .register(
    '/toolkits/spi',
    (el) => lazy(el, () => import('./tools/spi/index.js').then((m) => (o) => m.render(o))),
    { title: 'Safety performance indicators', surface: 'tool' }
  )
  .register(
    '/toolkits/maturity',
    (el) => lazy(el, () => import('./tools/maturity/index.js').then((m) => (o) => m.render(o))),
    { title: 'SMS maturity assessment', surface: 'tool' }
  )
  .register(
    '/templates',
    (el) => lazy(el, () => import('./tools/templates/index.js').then((m) => (o) => m.render(o))),
    { title: 'Templates and source documents' }
  )
  .register(
    '/sms',
    (el) => lazy(el, () => import('./tools/sms/index.js').then((m) => (o) => m.render(o))),
    { title: 'The SMS record', surface: 'tool' }
  )
  .register(
    '/coverage',
    (el) => lazy(el, () => import('./tools/coverage/index.js').then((m) => (o) => m.render(o))),
    { title: 'What this covers', surface: 'tool' }
  )
  .register(
    '/amendment',
    (el) => lazy(el, () => import('./tools/amendment/index.js').then((m) => (o) => m.render(o))),
    { title: 'Annex 19 Amendment 2 readiness', surface: 'tool' }
  )
  .register(
    '/training',
    (el) => lazy(el, () => import('./tools/training/index.js').then((m) => (o) => m.render(o))),
    { title: 'The SMS training programme', surface: 'tool' }
  )
  .register(
    '/toolkits/icaas',
    (el) => lazy(el, () => import('./tools/icaas/index.js').then((m) => (o) => m.render(o))),
    { title: 'KCAA corrective action plan', surface: 'tool' }
  )
  .register(
    '/admin',
    (el) => lazy(el, () => import('./tools/admin/index.js').then((m) => (o) => m.render(o))),
    { title: 'Platform administration', surface: 'tool' }
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
    '/signup',
    (el) => lazy(el, () => import('./tools/login/signup-panel.js').then((m) => m.render)),
    { title: 'Create an operator' }
  )
  /* LAZY, and unauthenticated by necessity — this is the screen for
     somebody who cannot sign in. Its own chunk for the same reason the
     signup panel has one: the account screen is eager, and a form
     opened on the day a person is locked out has no claim on the bundle
     a ramp agent downloads at a strip. */
  .register(
    '/reset',
    (el) => lazy(el, () => import('./tools/login/reset-panel.js').then((m) => m.render)),
    { title: 'Set a new password' }
  )
  .register(
    '/pricing',
    (el) => lazy(el, () => import('./tools/pricing/index.js').then((m) => m.render)),
    { title: 'What it costs' }
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

/* --------------------------- The workspace --------------------------- */

/* ======================================================================
   WHOSE WORKSPACE THIS IS, IN THE CHROME RATHER THAN IN THE CONTENT.

   Every screen in this product carried UsalamaSMS's identity and never
   the operator's, on both sides of signing in. A safety manager at one
   operator and a safety manager at another saw the same header over
   their own data — which is a tenanted product presenting itself as a
   single-tenant one, and the thing an operator notices when they are
   deciding whether this is THEIR system or somebody's website they type
   into.

   The tenant context belongs around the NAVIGATION rather than inside
   the page: a name that appears in one panel and not in the chrome
   stops orienting somebody the moment they move to another screen. So
   it goes in the strip that is already sticky under the header on every
   route.

   IT REUSES THE STRIP RATHER THAN ADDING A BAR. That strip exists
   because the unsent count must never be behind a tap; it is one line
   of chrome already paid for, and the operator's mark and name fit in
   the space to its right that was empty on every screen. Adding a
   second bar would spend a row of vertical on every route to say
   something this one can say for nothing.

   LOADED LAZILY, AND NOT AT ALL WHEN SIGNED OUT. loadOrg lives in
   print-id.js, outside the entry chunk, because the printed pack needed
   the same record. A reporter at a strip filing anonymously never
   fetches it and never pays for it — which is the same rule the menu
   hints follow, for the same person.

   THE MARK IS THE OPERATOR'S OWN, where they have uploaded one. alt is
   empty deliberately: the operator's name is the very next element as
   live text, and a screen reader announcing both says it twice.
   ====================================================================== */
const workspace = document.getElementById('workspace');

async function paintWorkspace() {
  if (!workspace) return;
  if (!isSignedIn()) {
    workspace.hidden = true;
    workspace.innerHTML = '';
    return;
  }
  try {
    const { loadOrg } = await import('./shared/print-id.js');
    const org = await loadOrg();
    if (!org?.orgName) return;
    workspace.innerHTML = html`
      ${org.logo ? html`<img class="workspace__mark" src="${org.logo}" alt="" />` : ''}
      <span class="workspace__name">${org.orgName}</span>
      ${org.jurisdiction ? html`<span class="workspace__where">${org.jurisdiction}</span>` : ''}
    `.toString();
    workspace.hidden = false;
  } catch {
    /* Silent, and safe to be. This is an identity label on a strip
       whose actual job — the unsent count — is unaffected. Reporting a
       failure here would put an error in front of somebody whose
       reporting is working. */
  }
}

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

/* THE WORKSPACE FOLLOWS THE SESSION, ON THE EVENT THE SESSION ALREADY
   FIRES. Signing in and signing out are the only two things that change
   whose workspace this is, and both dispatch this. A route hook would
   be the wrong shape twice over: this router has none, and navigating
   between two screens of the same operator is not a change of operator
   — it would repaint on every link for nothing. */
window.addEventListener('usalamasms:session-changed', () => void paintWorkspace());

/* Turn the stored refresh token back into a usable access token, then
   send anything that was waiting. Silent on failure — offline and
   expired are both normal, and both are already described by the strip
   rather than by an alert. */
/* AFTER resumeSession RESOLVES, not before. On a reload that holds a
   refresh token, isSignedIn() is false until the token is exchanged —
   painting first would settle the strip on "no operator" and leave it
   there, because the exchange fires no session-changed event when it
   is simply restoring what was already true. */
void resumeSession()
  .then((ok) => {
    void paintWorkspace();
    return ok ? flushOutbox() : null;
  })
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
