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

import { html } from '../../shared/html.js';
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

export function render(outlet) {
  if (isSignedIn()) return renderSignedIn(outlet);
  return renderForm(outlet);
}

function renderSignedIn(outlet) {
  const session = getSession() ?? {};
  outlet.innerHTML = html`
    <section class="panel" id="login-panel">
      <header class="page-head">
        <span class="eyebrow">Account</span>
        <h1>Signed in</h1>
      </header>
      <p class="lede">
        Reports on this device will send automatically.
        ${session.role ? html`You are signed in as <strong>${labelForRole(session.role)}</strong>.` : ''}
      </p>
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
    <section class="panel">
      <header class="page-head">
        <span class="eyebrow">Account</span>
        <h1>Sign in</h1>
      </header>
      <p class="lede">
        Reports are held on this device until someone signs in, so the
        safety office can be told which organisation they belong to.
        <strong>You do not need to sign in to file one.</strong>
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
