/* ============================================================
   THE WALL AN OPERATOR MEETS WHEN THE SUBSCRIPTION HAS LAPSED.

   THE SERVER HAS ANSWERED 402 SINCE requireEntitlement WAS WRITTEN AND
   EXACTLY ONE SCREEN KNEW WHAT IT MEANT. Everywhere else it fell into a
   generic catch and rendered "that was not accepted" — which tells a
   safety manager their typing was wrong about a request that was
   refused for money. A paywall that reads as a malfunction is a paywall
   that generates a support ticket instead of a payment.

   ------------------------------------------------------------
   IT SAYS WHAT STILL WORKS, FIRST.

   `stillAvailable` comes back on every 402 and it is the most important
   thing on this panel. A lapsed operator can still FILE a report, still
   READ their own record, and still EXPORT the whole thing. Somebody
   whose subscription has run out and who believes their people can no
   longer report a hazard has been given a safety problem by a billing
   problem, and this product does not do that.

   ------------------------------------------------------------
   IT NAMES A PRICE ONLY WHEN IT KNOWS ONE.

   The server sends `band: null` when the operator never recorded a
   fleet size, and this renders that as a question rather than a guess.
   A wrong price is worse than no price: an operator budgets against it,
   and then somebody has to take it back.

   ------------------------------------------------------------
   THE BUTTON RECORDS AN INTENTION AND GRANTS NOTHING. It posts to
   /api/v1/upgrade-request, which writes an audit entry and emails the
   vendor. Money arrives out of band; a person still grants the
   entitlement. And the reply says whether anybody was actually reached,
   because an operator who asked and reached nobody is waiting for an
   answer that is not coming.
   ============================================================ */
import { html } from './html.js';
import { authFetch } from './session.js';

const WORDS = {
  FILE_REPORT: 'your people can still file reports',
  READ_OWN_RECORD: 'you can still read everything already recorded',
  EXPORT_OWN_RECORD: 'you can still export your whole record, at any time',
};

/**
 * Render the wall into `slot` from a 402 body.
 *
 * Returns nothing and binds its own button. The caller's job is to
 * notice the 402 and hand over the body — deciding what a 402 MEANS is
 * this module's job, so two screens cannot word it differently.
 */
export function renderPaywall(slot, body) {
  const band = body?.band ?? null;
  const still = (body?.stillAvailable ?? []).map((k) => WORDS[k]).filter(Boolean);

  slot.innerHTML = html`
    <div class="notice" data-paywall>
      <strong>This is included once the subscription is active.</strong>
      <p>
        The safety office's working surfaces are paused. Nothing has been
        deleted and nothing is locked away:
      </p>
      <ul>
        ${still.map((s) => html`<li>${s}</li>`)}
      </ul>
      ${band
        ? html`<p data-band>
            For a fleet of ${body.fleetSize}, that is the
            <strong>${band.name}</strong> band — <strong>$${band.usdMonthly}</strong>
            a month, covering ${band.fleet}. Every Annex 19 element is in every
            band; what differs is the size of the operation, not the obligation.
          </p>`
        : html`<p data-band-unknown>
            We cannot quote a price because no fleet size is recorded against
            this operator. Ask us and we will confirm it rather than guess —
            a price you budget against should not be one we assumed.
          </p>`}
      <p class="mat-actions">
        <button type="button" class="btn btn-primary btn-sm" data-upgrade>
          Ask to upgrade
        </button>
        <a class="btn btn-secondary btn-sm" href="/pricing">See what each band covers</a>
      </p>
      <p class="hint" data-upgrade-result role="status" aria-live="polite"></p>
    </div>`.toString();

  const button = slot.querySelector('[data-upgrade]');
  const result = slot.querySelector('[data-upgrade-result]');

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Asking…';
    try {
      const res = await authFetch('/api/v1/upgrade-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error('refused');
      const out = await res.json();
      /* THREE OUTCOMES, NOT TWO. "Recorded but nobody was told" is a
         real state — the vendor may have no mail key set — and an
         operator who is left believing somebody is acting on it will
         wait instead of phoning. */
      result.textContent =
        out.notified === 'SENT'
          ? 'Asked. We have been told, and somebody will confirm payment with you.'
          : 'Recorded here, but the notification did not go out. Contact us directly ' +
            'so this is not sitting with nobody.';
      button.textContent = 'Asked';
    } catch {
      button.disabled = false;
      button.textContent = 'Ask to upgrade';
      result.textContent =
        'That did not reach us. Nothing was recorded — try again, or contact us directly.';
    }
  });
}
