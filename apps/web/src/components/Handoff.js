/* ============================================================
   THE SHARE CONTROL.

   Renders one button beside a warning the product has computed and
   cannot deliver. Pressing it opens whatever the operator already has —
   which on an Android handset in this market is WhatsApp — with the
   sentence already written.

   THREE PATHS, IN ORDER, AND THE LAST ONE ALWAYS WORKS:

     1. `navigator.share()` where the browser has it. This is the one
        that offers WhatsApp, and it is the reason this feature is worth
        building at all;
     2. `mailto:` where it does not. Every browser has this;
     3. clipboard, if the mail client cannot be opened either.

   The fallbacks are not politeness. A safety manager on a desktop
   without a mail client configured is the ordinary case in a small
   operator, and a share button that does nothing there is worse than no
   button — it looks like the message was sent.

   ABORT IS NOT FAILURE. `navigator.share()` rejects with AbortError
   when somebody opens the sheet and changes their mind, which is a
   normal thing to do. Reporting that as "could not share" teaches
   people to distrust the control.

   WHAT IT NEVER DOES is compose its own text. The message comes from
   packages/shared/src/handoff.ts, which takes counts and dates and has
   no parameter that could carry a narrative or a name — see the rule at
   the top of that file. This component is a button, not an author.
   ============================================================ */

import { html } from '../shared/html.js';
import { mailtoFor } from '../../../../packages/shared/src/handoff.ts';

/**
 * The markup. `data-handoff` carries the payload as JSON so one
 * delegated listener serves every button on a screen, the same pattern
 * the dropdowns and the triage rows use.
 */
export function HandoffButton(handoff, label = 'Send this to somebody') {
  if (!handoff) return '';
  return html`<button
    type="button"
    class="btn btn-ghost btn-sm handoff"
    data-handoff="${JSON.stringify(handoff)}"
  >${label}</button>`;
}

/**
 * One delegated listener for every share button under an outlet.
 *
 * Idempotent per outlet, like wireSelects(): the screens that carry
 * these re-render on every change, and attaching per button would leak
 * a listener each time.
 */
const wired = new WeakSet();

export function wireHandoff(outlet) {
  if (wired.has(outlet)) return;
  wired.add(outlet);

  outlet.addEventListener('click', async (event) => {
    const btn = event.target.closest?.('.handoff');
    if (!btn) return;

    let handoff;
    try {
      handoff = JSON.parse(btn.dataset.handoff);
    } catch {
      return;
    }
    if (!handoff?.body) return;

    const say = (msg) => {
      const note = btn.parentElement?.querySelector('.handoff__said');
      if (note) note.textContent = msg;
    };

    // ---- 1. the share sheet, where there is one -------------------
    if (navigator.share) {
      try {
        await navigator.share({ title: handoff.subject, text: handoff.body });
        say('Sent to the app you chose.');
        return;
      } catch (err) {
        /* Somebody opened the sheet and closed it. That is a decision,
           not a fault, and saying "could not share" about it is how a
           control loses its credibility. */
        if (err?.name === 'AbortError') return;
        // Anything else: fall through to mail.
      }
    }

    // ---- 2. mail ---------------------------------------------------
    try {
      window.location.href = mailtoFor(handoff);
      say('Opening your mail app.');
      return;
    } catch {
      // Fall through.
    }

    // ---- 3. the clipboard, which is always available ---------------
    try {
      await navigator.clipboard.writeText(handoff.body);
      say('Copied. Paste it wherever you need to.');
    } catch {
      say('This device would not share or copy. The figures are on screen above.');
    }
  });
}
