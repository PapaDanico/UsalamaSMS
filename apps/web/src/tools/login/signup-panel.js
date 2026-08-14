/* ============================================================
   SIGNING UP — the panel, lazily imported.

   THE ROUTE THIS PRODUCT DID NOT HAVE. Nineteen screens, fifty-four
   routes and eleven of Annex 19's twelve elements, and the only way an
   operator could come into existence was a seed script run against the
   database by hand. That is what made it demonstrable and unsellable at
   the same time.

   IN ITS OWN MODULE, and the budget is why. It began inside the account
   screen, which is EAGER because signing in is what sends a queued
   report — and it put 5.6 KB into the first paint of the form a ramp
   agent opens at a remote strip, to carry a form an operator fills in
   once in its life. Entry went 214.9 -> 220.5. The same defect as the
   admin reset panel and the export panel, both of which live beside
   this file for the same reason.

   THE ACCOUNTABLE EXECUTIVE IS NAMED, not chosen. The copy says whose
   account this is, because the person filling it in IS the first user
   and Annex 19 makes that post personally answerable — somebody should
   know that before they type, not after they find they cannot change
   it.
   ============================================================ */

import { html } from '../../shared/html.js';
import { adoptSession } from '../../shared/session.js';

const SHELL = html`<section class="band-dark"><div class="wrap"><span class="eyebrow">Account</span><h1>Create an operator</h1><p class="lede">This is how an operator comes to exist in the product. It takes a minute, and nobody has to call you.</p></div></section><section class="panel wrap">      <details class="filters-shell" id="signup-shell">
        <summary><span>My operator does not have an account yet</span></summary>
        <form id="signup-form" class="card" novalidate>
          <p class="lede lede--tight">
            This creates the operator and makes you its
            <strong>accountable executive</strong> — the post that signs the safety
            policy. Everyone else is added from inside, afterwards.
          </p>

          <label class="field">
            <span class="field-label">Operator name *</span>
            <input
              type="text" name="orgName" id="signup-org" required maxlength="160"
              autocomplete="organization" class="input-field"
            />
            <span class="field-hint">As it appears on the certificate.</span>
          </label>

          <label class="field">
            <span class="field-label">AOC number</span>
            <input type="text" name="aocNumber" maxlength="60" class="input-field" />
            <span class="field-hint">
              Leave blank if you are still in certification — that is the point at
              which an SMS is worth the most.
            </span>
          </label>

          <label class="field">
            <span class="field-label">Aircraft</span>
            <input
              type="number" name="fleet" min="1" max="2000" inputmode="numeric"
              class="input-field"
            />
            <span class="field-hint">Decides the price band and nothing else.</span>
          </label>

          <label class="field">
            <span class="field-label">Your name *</span>
            <input
              type="text" name="name" required maxlength="120"
              autocomplete="name" class="input-field"
            />
          </label>

          <label class="field">
            <span class="field-label">Your email *</span>
            <input
              type="email" name="email" required autocomplete="email"
              inputmode="email" autocapitalize="off" spellcheck="false"
              class="input-field"
            />
          </label>

          <label class="field">
            <span class="field-label">Password *</span>
            <input
              type="password" name="password" required minlength="12"
              autocomplete="new-password" class="input-field"
            />
            <span class="field-hint">Twelve characters or more.</span>
          </label>

          <button type="submit" class="btn btn-primary btn-block">
            Create the operator
          </button>
          <p class="field-error" id="signup-status" role="status" aria-live="polite"></p>
        </form>
      </details>
</section>`.toString();

/* ============================================================
   CREATING THE OPERATOR.

   Posts the form and then does exactly what signing in does, because
   that is what has just happened: the route returns tokens, so the
   person who typed their operator's name is signed in as its
   accountable executive without being asked to prove it a second time.

   THE SERVER'S REFUSAL IS SHOWN AS WRITTEN, and its wording matters
   more here than anywhere else on this screen. A duplicate address is
   refused WITHOUT saying the address exists — the login route goes to
   real trouble not to be an account-enumeration oracle, and a signup
   form answering "that email is taken" would hand back the oracle
   login closed. The sentence the server returns is true either way.
   ============================================================ */
export function render(slot) {
  if (!slot) return;
  slot.innerHTML = SHELL;
  const form = slot.querySelector('#signup-form');
  const status = slot.querySelector('#signup-status');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const f = form.elements;
    const button = form.querySelector('button[type=submit]');

    const body = {
      orgName: f.orgName.value.trim(),
      name: f.name.value.trim(),
      email: f.email.value.trim(),
      password: f.password.value,
      ...(f.aocNumber.value.trim() ? { aocNumber: f.aocNumber.value.trim() } : {}),
      ...(f.fleet.value ? { fleet: Number(f.fleet.value) } : {})
    };

    if (!body.orgName || !body.name || !body.email || !body.password) {
      status.textContent = 'The operator, your name, your email and a password are all needed.';
      return;
    }
    if (body.password.length < 12) {
      status.textContent = 'The password needs twelve characters or more.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Creating…';

    try {
      const res = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        button.disabled = false;
        status.textContent =
          detail.message ??
          (res.status === 429
            ? 'Too many attempts from here. Try again in an hour.'
            : 'That could not be created. Check the details and try again.');
        return;
      }
      const session = await res.json();
      /* Stored the same way signIn() stores one, through the same
         module, so there is one place that knows what a session is. */
      adoptSession(session);
      form.elements.password.value = '';
      window.dispatchEvent(new CustomEvent('usalamasms:session-changed'));
      window.location.reload();
    } catch {
      button.disabled = false;
      status.textContent =
        'No connection. The operator was not created — nothing was sent.';
    }
  });
}
