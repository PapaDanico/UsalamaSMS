/* ============================================================
   THE ONE NUMBER THAT PRICES AN OPERATOR, ASKED FOR WHERE IT IS
   MISSED.

   `fleetSize` is optional at signup, and after signup nothing in the
   product could set it — it was written by the signup route and by the
   vendor's console, and by nothing an operator can reach.

   That is a commercial dead end rather than a cosmetic gap.
   `requireEntitlement` refuses to guess a band, on the argument
   written into `core.ts`: a wrong price is worse than no price,
   because the operator budgets against it. So a lapsed operator with
   no fleet size recorded met a wall that said we could not quote them
   and gave them nowhere to fix it — at the exact moment they were
   trying to pay.

   Measured on production on 21 September 2026: the one live operator
   had recorded an AOC number, two fleet types, sixteen bases and four
   operation types, and left this null.

   ------------------------------------------------------------
   ONE FORM, TWO PLACES. It belongs on the account screen, where an
   operator keeps their details, and at the paywall, where they find
   out it is missing. Two copies of a form that writes a price-bearing
   number is two places for the validation to drift, so it is written
   once here and mounted twice.

   IT ASKS ONLY OF SOMEBODY WHO MAY ANSWER. `/api/v1/auth/me` returns
   the caller's permissions, so the form is not offered to a reporter
   who would only meet a 403 — and the route refuses regardless,
   because a client-side check is a courtesy and never a control.
   ============================================================ */

import { html } from './html.js';
import { authFetch } from './session.js';

/**
 * Mount the fleet-size form into `slot`.
 *
 * `onSaved` receives `{ fleetSize, band }` as the server computed it,
 * so the caller can show the price it just became rather than making
 * somebody reload to find out.
 */
export function mountFleetSize(slot, { onSaved } = {}) {
  slot.innerHTML = html`
    <form novalidate>
      <label class="field">
        <span class="field-label">How many aircraft does this operator fly?</span>
        <input class="input-field" type="number" name="fleetSize" min="1" max="2000"
               inputmode="numeric" required />
        <span class="field-hint">
          It sets which band this operator is in. Nothing else on this screen depends
          on it, and it is not a limit on anything — every Annex 19 element is in
          every band.
        </span>
      </label>
      <p class="mat-actions">
        <button type="submit" class="btn btn-primary btn-sm">Record the fleet size</button>
      </p>
      <p class="hint" data-fleet-status role="status" aria-live="polite"></p>
    </form>
  `.toString();

  const status = slot.querySelector('[data-fleet-status]');

  slot.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    /* CAPTURED BEFORE THE AWAIT. `currentTarget` is null the moment a
       handler yields, which this repository has already shipped once. */
    const form = event.currentTarget;
    const raw = form.elements.fleetSize.value.trim();
    const n = Number(raw);

    if (!raw || !Number.isInteger(n) || n < 1 || n > 2000) {
      status.textContent = 'A whole number of aircraft, from 1 to 2000.';
      return;
    }

    status.textContent = 'Recording…';
    let res;
    try {
      res = await authFetch('/api/v1/org/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fleetSize: n }),
      });
    } catch {
      status.textContent = 'The safety office could not be reached, and nothing changed.';
      return;
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      status.textContent =
        body.message ?? 'That was not accepted, and the fleet size has not changed.';
      return;
    }

    status.textContent = body.band
      ? `Recorded. A fleet of ${body.fleetSize} is the ${body.band.name} band.`
      : 'Recorded.';
    onSaved?.(body);
  });
}
