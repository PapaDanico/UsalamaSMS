import { html } from '../../shared/html.js';
import { authFetch } from '../../shared/session.js';

/* ============================================================
   ADMINISTRATIVE PASSWORD RESET.

   LAZY, and the budget is why. This began inside the account screen,
   which is eager because signing in is what sends a queued report —
   so it added 2.5 KB to the first paint of a form a ramp agent opens
   at a remote strip, to carry a panel one person opens twice a year.
   Split out and fetched only for a role that holds user.manage.

   Login, refresh, logout and me was the whole of authentication, which
   meant a safety manager who forgot a password had no way back in. On
   an operator with fifteen staff that is the second week, not an edge
   case.

   Deliberately not self-service: a reset email needs a mail provider,
   another key to configure, and another delivery path that fails
   quietly. An operator this size has a person who does this — and a
   person leaves an audit entry, which a link in an inbox does not.

   The password is shown ONCE and never stored. The panel says what the
   reset did, because "password changed" and "every session for this
   account is signed out" are different promises and the second is the
   one that matters after a phone goes missing.
   ============================================================ */
function Panel() {
  return html`
    <section class="panel wrap" id="admin-reset">
      <h2 class="section-title">Reset a colleague's password</h2>
      <p class="hint">
        For somebody locked out of their account. It signs out every device
        they are signed in on, which is what you want if a handset has gone
        missing — and is the reason this is not just a password change.
      </p>
      <form id="reset-form" class="card" novalidate>
        <label class="field">
          <span class="field-label">Their user ID</span>
          <input class="input-field" name="userId" autocomplete="off" required />
          <span class="field-hint">
            From the operator's user list. Not their email — an ID cannot be
            guessed at from a staff roster.
          </span>
        </label>
        <button type="submit" class="btn btn-primary">Reset password</button>
        <p class="field-error" id="reset-error" role="status" aria-live="polite"></p>
      </form>
      <output class="calc__out" id="reset-out" aria-live="polite"></output>
    </section>
  `;
}

function bind(root) {
  const form = root.querySelector('#reset-form');
  if (!form) return;
  const error = root.querySelector('#reset-error');
  const out = root.querySelector('#reset-out');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const userId = form.elements.userId.value.trim();
    if (!userId) {
      error.textContent = 'A user ID is needed.';
      return;
    }
    error.textContent = '';
    out.dataset.state = 'idle';
    out.textContent = 'Resetting…';

    try {
      const res = await authFetch('/api/v1/auth/admin/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      if (!res.ok) {
        out.dataset.state = 'error';
        out.textContent =
          res.status === 404
            ? 'No such user in this operator. Check the ID.'
            : res.status === 403
              ? 'Your role cannot reset passwords.'
              : `That did not work (${res.status}).`;
        return;
      }
      const body = await res.json();
      out.dataset.state = 'ok';
      /* Rendered rather than alerted, because it has to be read out or
         written down, and an alert is dismissed by the same tap that
         acknowledges it. */
      out.innerHTML = html`
        <strong>${body.email}</strong>
        <span class="calc__detail">
          Temporary password: <strong>${body.password}</strong>
        </span>
        <span class="calc__detail">
          Shown once and stored nowhere. Hand it over directly, and have them
          change it. Every device that account was signed in on has been
          signed out.
        </span>
      `.toString();
      form.reset();
    } catch {
      out.dataset.state = 'error';
      out.textContent = 'Could not reach the server. Check the connection and try again.';
    }
  });
}


export function mount(root) {
  if (!root) return;
  root.innerHTML = Panel().toString();
  bind(root);
}
