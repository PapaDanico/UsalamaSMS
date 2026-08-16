/* ============================================================
   SETTING A NEW PASSWORD WITHOUT AN ADMINISTRATOR.

   WHY THIS SCREEN EXISTS. The account screen offers an administrative
   reset, mounted only for SYSTEM_ADMIN, and no operator that signs up
   ever has one: signup creates a single ACCOUNTABLE_EXECUTIVE, no route
   anywhere creates a second user, and that role does not hold
   `user.manage`. One forgotten password ends a customer's access to its
   own safety record. packages/shared/src/reset.ts carries the full
   argument and the measurements behind it.

   ONE MODULE, TWO PHASES, and no second route. `/reset` with no token
   asks for the address; `/reset?token=…` sets the password. Splitting
   them would mean two entries in the router and two screens to keep in
   agreement about the same four sentences, for a destination somebody
   visits once and never bookmarks.

   IN ITS OWN CHUNK, like the signup panel beside it. The account screen
   is EAGER — signing in is what sends a queued report — so a form
   nobody opens until the day they are locked out has no claim on the
   bundle a ramp agent downloads at a strip. What the eager screen
   carries is one anchor.

   IT NEVER SAYS "CHECK YOUR INBOX". The server answers identically for
   an address that has an account and one that does not, because a
   tenant's user list is an operator's staff roster. A screen that
   promised mail would be telling two thirds of its readers something
   false — so it prints the server's own sentence, which is true in
   every case, and prints the delivery state beside it when the
   deployment cannot send mail at all.
   ============================================================ */

import { html } from '../../shared/html.js';
import {
  RESET_TTL_MINUTES,
  MIN_PASSWORD_LENGTH
} from '../../../../../packages/shared/src/reset.ts';

function Banner(headline, lede) {
  return html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Account</span>
        <h1>${headline}</h1>
        <p class="lede">${lede}</p>
      </div>
    </section>
  `;
}

/* ---------------- Phase one: ask for the link ---------------- */

function RequestForm() {
  return html`
    ${Banner(
      'Forgotten password',
      html`Give the address the account is under and we will send a link to set a new
        password. Filing a report needs no account at all — this is only for signing
        in and sending what is already queued.`
    )}
    <section class="panel wrap">
      <form id="forgot-form" class="card" novalidate>
        <label class="field">
          <span class="field-label">Email</span>
          <input
            type="email" name="email" id="forgot-email"
            autocomplete="username" inputmode="email"
            autocapitalize="off" spellcheck="false" required
            class="input-field"/>
          <span class="field-hint">
            The address you sign in with. The link lasts ${RESET_TTL_MINUTES} minutes
            and works once.
          </span>
        </label>
        <button type="submit" class="btn btn-primary btn-block">Send the link</button>
        <p class="field-error" id="forgot-status" role="status" aria-live="polite"></p>
      </form>
      <output class="calc__out" id="forgot-out" aria-live="polite"></output>
      <p class="hint"><a href="/account">Back to signing in</a></p>
    </section>
  `;
}

function bindRequest(outlet) {
  const form = outlet.querySelector('#forgot-form');
  const status = outlet.querySelector('#forgot-status');
  const out = outlet.querySelector('#forgot-out');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    const email = form.elements.email.value.trim();
    if (!email) {
      status.textContent = 'An address is needed.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Asking…';

    let body = null;
    try {
      const res = await fetch('/api/v1/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.status === 429) {
        button.disabled = false;
        status.textContent =
          'Too many requests from this connection. Wait fifteen minutes before asking again.';
        return;
      }
      body = await res.json();
    } catch {
      button.disabled = false;
      /* OFFLINE IS ITS OWN SENTENCE. Everywhere else in this product a
         lost connection means the work waits on the device; here there
         is nothing to queue, and saying "it will send later" would be
         the one promise this screen cannot keep. */
      status.textContent =
        'No connection, so nothing could be asked for. Try again when you are back in signal.';
      return;
    }

    status.textContent = '';
    /* THE SERVER'S OWN SENTENCE, not a paraphrase of it. It is worded
       to be true whether or not the address has an account, and a
       screen that rewrites it into "check your inbox" undoes that. */
    out.innerHTML = html`<p>${body?.message ?? ''}</p>
      ${body?.delivery === 'NOT_CONFIGURED'
        ? html`<p class="field-error">
            <strong>No email will arrive.</strong> This deployment has no mail provider
            configured, so the link could not be sent to anybody. Tell whoever runs it —
            nothing is wrong with the account.
          </p>`
        : ''}`.toString();
    /* Left disabled. Asking twice invalidates the first link, which is
       correct on the server and confusing in an inbox, so the button
       stops offering it. */
  });
}

/* ---------------- Phase two: spend it ---------------- */

function SetForm() {
  return html`
    ${Banner(
      'Set a new password',
      html`Choose one you have not used here before. Setting it signs out every device
        this account is signed in on, which is the point of a reset rather than a side
        effect of it.`
    )}
    <section class="panel wrap">
      <form id="reset-form" class="card" novalidate>
        <label class="field">
          <span class="field-label">New password</span>
          <input
            type="password" name="newPassword" id="reset-password"
            autocomplete="new-password" required
            minlength="${MIN_PASSWORD_LENGTH}"
            class="input-field"/>
          <span class="field-hint">At least ${MIN_PASSWORD_LENGTH} characters.</span>
        </label>
        <button type="submit" class="btn btn-primary btn-block">Set it</button>
        <p class="field-error" id="reset-status" role="status" aria-live="polite"></p>
      </form>
      <output class="calc__out" id="reset-out" aria-live="polite"></output>
      <p class="hint"><a href="/reset">Ask for a new link</a></p>
    </section>
  `;
}

function bindSet(outlet, token) {
  const form = outlet.querySelector('#reset-form');
  const status = outlet.querySelector('#reset-status');
  const out = outlet.querySelector('#reset-out');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    const newPassword = form.elements.newPassword.value;

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      status.textContent = `At least ${MIN_PASSWORD_LENGTH} characters.`;
      return;
    }

    button.disabled = true;
    status.textContent = 'Setting…';

    let res;
    let body = null;
    try {
      res = await fetch('/api/v1/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });
      body = await res.json();
    } catch {
      button.disabled = false;
      status.textContent =
        'No connection, so nothing was changed. Try again when you are back in signal — ' +
        'the link is still good until it expires.';
      return;
    }

    if (!res.ok) {
      button.disabled = false;
      status.textContent = body?.message ?? 'That did not work.';
      return;
    }

    /* CLEARED AS SOON AS IT IS SPENT, the same as the login form does
       with the password it just used. */
    form.elements.newPassword.value = '';
    status.textContent = '';
    form.hidden = true;
    out.innerHTML = html`<p>${body?.message ?? ''}</p>
      <p><a class="btn btn-primary" href="/account">Sign in</a></p>`.toString();
  });
}

export function render(outlet) {
  /* READ FROM THE ADDRESS BAR, and never held anywhere else. The token
     stays in the URL for the life of this page and goes into one POST
     body; it is not written to storage, not put in the session, and not
     logged. A reset link is a credential, and the shortest thing it can
     live in is the right thing. */
  const token = new URLSearchParams(window.location.search).get('token');

  if (!token) {
    outlet.innerHTML = RequestForm().toString();
    bindRequest(outlet);
    return;
  }

  outlet.innerHTML = SetForm().toString();
  bindSet(outlet, token);
}
