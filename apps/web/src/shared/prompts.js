/* ============================================================
   The two prompts a PWA owes its user, and the rules for both.

   INSTALL and UPDATE are the moments a web app either behaves like an
   application or reveals that it is a page. Both were missing: the
   update handler logged to the console, which is a message for me and
   not for a ramp agent, and there was no install affordance at all.

   THE RULE THAT GOVERNS BOTH: never interrupt someone who is filing.

   A safety report is typed in about thirty seconds by a person standing
   next to an aircraft. A banner that appears mid-sentence and shifts
   the layout is how a half-typed narrative gets abandoned — and an
   abandoned narrative is an occurrence nobody hears about. So:

     · Neither prompt is a modal, and neither moves the page. They dock
       above the tab bar as an overlay.
     · Neither appears while a form on screen is dirty.
     · Dismissing the install prompt is remembered. Asking twice is how
       an app teaches people to dismiss without reading.
     · The update prompt is NEVER auto-applied. Reloading a page that
       holds an unsaved narrative destroys it, and this app's whole
       promise is that it does not lose what you typed.
   ============================================================ */

import { html } from './html.js';
import { applyUpdate } from './register-sw.js';

const DISMISSED_KEY = 'usalamasms.installDismissed';

/** A form with anything typed into it. Never interrupt one. */
function isComposing() {
  const form = document.querySelector('#report-form');
  if (!form) return false;
  const title = form.elements.title?.value?.trim();
  const narrative = form.elements.narrative?.value?.trim();
  return Boolean(title || narrative);
}

function dock() {
  let el = document.getElementById('prompt-dock');
  if (!el) {
    el = document.createElement('div');
    el.id = 'prompt-dock';
    el.className = 'prompt-dock';
    document.body.appendChild(el);
  }
  return el;
}

function show({ id, text, actionLabel, onAction, dismissLabel = 'Not now', onDismiss }) {
  if (document.getElementById(id)) return;

  const el = document.createElement('div');
  el.id = id;
  el.className = 'prompt';
  el.setAttribute('role', 'status');
  el.innerHTML = html`
    <p class="prompt__text">${text}</p>
    <div class="prompt__actions">
      <button type="button" class="btn btn-secondary btn-sm" data-act="dismiss">
        ${dismissLabel}
      </button>
      <button type="button" class="btn btn--primary btn--sm" data-act="go">${actionLabel}</button>
    </div>
  `.toString();

  el.querySelector('[data-act=go]').addEventListener('click', () => {
    el.remove();
    onAction();
  });
  el.querySelector('[data-act=dismiss]').addEventListener('click', () => {
    el.remove();
    onDismiss?.();
  });

  dock().appendChild(el);
}

/**
 * "Add to Home Screen".
 *
 * Chromium fires `beforeinstallprompt` and lets the page defer it; iOS
 * fires nothing and offers no API, so there is no prompt to show there
 * and inventing one would be an instruction to tap a button we cannot
 * see. Silence on iOS is correct.
 */
export function watchForInstall() {
  let deferred = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Take control of when it appears. The browser's own moment is
    // whenever it feels like it, which is frequently mid-form.
    event.preventDefault();
    deferred = event;

    if (localStorage.getItem(DISMISSED_KEY)) return;
    if (isComposing()) return;

    show({
      id: 'install-prompt',
      // What it BUYS them, not what it is. "Install this app" is a
      // request; this is the reason to say yes.
      text: 'Add UsalamaSMS to your home screen — it opens straight to the report form and works with no signal.',
      actionLabel: 'Add',
      onAction: async () => {
        deferred.prompt();
        await deferred.userChoice;
        deferred = null;
      },
      onDismiss: () => localStorage.setItem(DISMISSED_KEY, '1'),
    });
  });

  window.addEventListener('appinstalled', () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    document.getElementById('install-prompt')?.remove();
  });
}

/**
 * A new version is cached and waiting.
 *
 * NEVER applied automatically. `applyUpdate` makes the waiting worker
 * take over and the page reload, and a reload with a half-typed
 * narrative on screen destroys it. The person decides, and if they are
 * mid-report the prompt waits for the next navigation.
 */
export function offerUpdate(registration) {
  if (isComposing()) {
    /* Try again when the form empties, which happens on submit.
       ON WINDOW ONLY. This registered the same listener on `document`
       as well, and report/index.js dispatches on `window` — so the
       document listener could never fire and, being {once:true}, was
       never removed either. A listener that cannot fire is not a
       fallback; it is a leak that reads like caution. */
    window.addEventListener('usalamasms:report-filed', () => offerUpdate(registration), {
      once: true,
    });
    return;
  }

  show({
    id: 'update-prompt',
    text: 'A new version of UsalamaSMS is ready. Reports already on this device are not affected.',
    actionLabel: 'Reload',
    dismissLabel: 'Later',
    onAction: () => applyUpdate(registration),
  });
}
