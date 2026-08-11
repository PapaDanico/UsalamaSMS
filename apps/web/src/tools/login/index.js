/* ============================================================
   Sign in.

   The screen that did not exist, which is why nothing this product
   collected could ever leave a device.

   DESIGN CONSTRAINT, inherited from the report form: this is used by a
   ramp agent on a mid-range Android, and it is the ONLY thing standing
   between them and filing. So it is two fields and a button, it says
   why it is asking, and it never blocks the report form — a person who
   lands here can still file; the report waits in the outbox exactly as
   it does when the radio is off.

   That ordering is deliberate. Requiring a login before the form would
   convert "I have thirty seconds and gloves on" into "I need to
   remember a password", and the research is unambiguous that report
   VOLUME is what kills an SMS. Filing must never be gated. Sending is.
   ============================================================ */

import { html, raw } from '../../shared/html.js';
import { signIn, signOut, isSignedIn, getSession } from '../../shared/session.js';
import { flushOutbox } from '../../shared/offline.ts';

const REASONS = {
  invalid: 'That email and password did not match an account. Check both and try again.',
  // The server refuses to distinguish a wrong password from a missing
  // account, because an operator's user list is its staff roster. This
  // message must not undo that by guessing.
  throttled:
    'Too many attempts from this connection. Wait fifteen minutes, or ask your safety office to check the account.',
  offline:
    'No connection, so signing in is not possible right now. You can still file reports — they stay on this device and send when you are back in signal.'
};


/* Four claims, and every one is a mechanism this repository can point
   at rather than a sentiment. Charter rule 7 as it applies here: the
   promise is kept by a mechanism, and a claim printed on a surface a
   customer reads has to name one. */
const TRUST = [
  {
    text: 'Files with no signal — the report is on your device before it is anywhere else',
    icon: '<path d="M5 12.5a7 7 0 0 1 14 0"/><path d="M8.5 16a3.5 3.5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/><path d="M3 3l18 18"/>'
  },
  {
    text: 'Your name is attached only if you say so — an anonymous report stores no identifier at all',
    icon: '<path d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6z"/><path d="M9 12l2 2 4-4"/>'
  },
  {
    text: 'Every reporting deadline computed from today, never stored — so it cannot go stale',
    icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
  },
  {
    text: 'Reaches the safety office and nobody else — tenant-scoped, on a hash-chained record',
    icon: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'
  }
];

function Banner(headline, lede) {
  return html`
    <section class="band-ink">
      <div class="container">
        <!-- No lockup here. Kanda's hero carries one because its nav
             lockup is small and a hundred pixels of scroll away; ours is
             the same size and sits directly above, so a second copy
             reads as a rendering mistake rather than as a statement. -->
        <span class="eyebrow">Account</span>
        <h1>${headline}</h1>
        <p class="lede">${lede}</p>

        <ul class="trust">
          ${TRUST.map(
            (t) => html`<li class="trust__item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                ${raw(t.icon)}
              </svg>
              <span>${t.text}</span>
            </li>`
          )}
        </ul>
      </div>
    </section>
  `;
}

export function render(outlet) {
  if (isSignedIn()) return renderSignedIn(outlet);
  return renderForm(outlet);
}

function renderSignedIn(outlet) {
  const session = getSession() ?? {};
  outlet.innerHTML = html`
    ${Banner(
      'Signed in',
      html`Reports on this device send automatically from now on.${session.role
        ? html` You are signed in as <strong>${labelForRole(session.role)}</strong>.`
        : ''}`
    )}
    <section class="panel container" id="login-panel">
      <button type="button" class="btn btn--secondary" id="sign-out">Sign out</button>
      <p class="hint">
        Signing out does not delete anything you have filed. Reports still
        on this device stay here until someone signs in and they send.
      </p>
    </section>
  `.toString();

  outlet.querySelector('#sign-out').addEventListener('click', async () => {
    await signOut();
    window.dispatchEvent(new CustomEvent('usalamasms:session-changed'));
    render(outlet);
  });
}

function renderForm(outlet) {
  outlet.innerHTML = html`
    ${Banner(
      'Sign in',
      html`Reports are held on this device until someone signs in, so the safety
        office knows which organisation they belong to.`
    )}
    <section class="panel container">
      <p class="lede lede--tight">
        <strong>You do not need to sign in to file a report.</strong> Filing
        works with no account and no signal; signing in is what sends what is
        already queued.
      </p>

      <form id="login-form" class="card" novalidate>
        <label class="field">
          <span class="field__label">Email</span>
          <input
            type="email" name="email" id="login-email"
            autocomplete="username" inputmode="email"
            autocapitalize="off" spellcheck="false" required
          />
        </label>

        <label class="field">
          <span class="field__label">Password</span>
          <input
            type="password" name="password" id="login-password"
            autocomplete="current-password" required
          />
        </label>

        <button type="submit" class="btn btn--primary btn--block">Sign in</button>
        <p class="field__error" id="login-status" role="status" aria-live="polite"></p>
      </form>
    </section>
  `.toString();

  const form = outlet.querySelector('#login-form');
  const status = outlet.querySelector('#login-status');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;

    if (!email || !password) {
      status.textContent = 'Both fields are needed.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Signing in…';

    const result = await signIn(email, password);

    if (!result.ok) {
      button.disabled = false;
      status.textContent = REASONS[result.reason] ?? REASONS.invalid;
      return;
    }

    // The password is cleared from the DOM as soon as it is spent. It
    // survives in the browser's own autofill store, which is the user's
    // choice; it does not need to survive in ours.
    form.elements.password.value = '';

    window.dispatchEvent(new CustomEvent('usalamasms:session-changed'));

    // Send whatever has been waiting, immediately. Someone who signs in
    // with reports queued did it BECAUSE of the queued reports, and
    // making them wait for the next online event to find out whether it
    // worked is the kind of small silence this product cannot afford.
    const outcome = await flushOutbox();

    // AFTER the flush, not before. The session-changed event above fires
    // while the batch is still in flight, so the strip repaints from the
    // pre-flush queue and then never hears again — leaving "1 report
    // waiting to send" on screen for a report that has just arrived.
    // Small, and precisely the class of lie this strip exists to avoid.
    window.dispatchEvent(new CustomEvent('usalamasms:sync-changed'));
    render(outlet);

    if (outcome.sent > 0) {
      const panel = outlet.querySelector('#login-panel');
      if (panel) {
        panel.insertAdjacentHTML(
          'beforeend',
          html`<p class="hint" id="login-sent">
            ${outcome.sent} report${outcome.sent === 1 ? '' : 's'} sent.
          </p>`.toString()
        );
      }
    }
  });
}

function labelForRole(role) {
  return String(role)
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
