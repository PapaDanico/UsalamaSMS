/* ============================================================
   THE AMENDMENT 2 READINESS CHECK — published, and useful to somebody
   who will never buy anything.

   WHY IT IS PUBLIC AND WHY IT ASKS RATHER THAN READS. Every other
   assessment in this product works from the operator's own records,
   which means it can only describe operators who are already
   customers. This one asks seven questions, because the person who
   most needs it has no account, no SMS, and fourteen weeks.

   IT ANSWERS HONESTLY EVEN WHEN THE ANSWER COSTS US A SALE. One of
   the seven changes — safety information sharing beyond the
   organisation — is something this product does not do, and the page
   says so in the same typeface as the ones it does. A checklist where
   every gap happens to be closed by the vendor publishing it is an
   advertisement wearing a diagnostic's clothes, and a safety manager
   recognises one immediately.

   NO PERCENTAGE, ON PURPOSE. "You are 71% ready" is not a thing an
   auditor recognises, and it is not a claim this product can make on
   an operator's behalf. What comes back is a count, a countdown, and
   the list of what is not in place — which is what somebody with a
   date on the calendar actually needs.

   THE COUNTDOWN GOES NEGATIVE. After 26 November 2026 this page says
   how many days late an operator is, rather than quietly reading zero
   for the rest of its life.
   ============================================================ */
import { html } from '../../shared/html.js';
import {
  CHANGES, NEWLY_IN_SCOPE, AMENDMENT2_DATES, AMENDMENT2_SOURCE,
  assessReadiness,
} from '../../../../../packages/shared/src/amendment2.ts';

const longDate = (iso) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

function Clock(days) {
  const late = days < 0;
  return html`<p class="notice" data-countdown>
    <strong>
      ${late
        ? `${Math.abs(days)} days past the applicability date.`
        : `${days} days until Amendment 2 applies.`}
    </strong>
    Adopted ${longDate(AMENDMENT2_DATES.adopted)}, effective
    ${longDate(AMENDMENT2_DATES.effective)}, and
    <strong>applicable ${longDate(AMENDMENT2_DATES.applicable)}</strong> —
    the effective date binds your State; the applicable date is the one
    your audit is against.
  </p>`;
}

function Result(r) {
  if (!r) return '';
  return html`<div class="sms-scheme" data-result>
    <h3>
      ${r.ready.length} of ${CHANGES.length} you can show today
    </h3>
    ${r.outstanding.length === 0
      ? html`<p class="picture-note">
          Nothing outstanding against the seven structural changes. Worth
          re-reading the questions with your auditor's eye — this is your
          own answer, not an assessment.
        </p>`
      : html`
          <p class="picture-note">
            ${r.outstanding.length}
            ${r.outstanding.length === 1 ? 'change' : 'changes'} you cannot yet
            evidence, with
            ${r.daysRemaining < 0
              ? `${Math.abs(r.daysRemaining)} days already gone`
              : `${r.daysRemaining} days left`}.
          </p>
          <ul class="picture-list" role="list">
            ${r.outstanding.map(
              (c) => html`<li>
                <strong>${c.title}</strong>
                <span class="barrier__meta">${c.show}</span>
                ${c.surface
                  ? html`<span class="barrier__meta">In this product: ${c.surface}</span>`
                  : html`<span class="barrier__meta"><strong>Not in this product.</strong>
                      ${c.notHere}</span>`}
              </li>`
            )}
          </ul>`}
  </div>`;
}

export async function render(outlet) {
  const draw = (result) => {
    const days = assessReadiness([], new Date()).daysRemaining;
    outlet.innerHTML = html`
      <section class="panel wrap">
        <header class="page-head">
          <span class="eyebrow">ICAO Annex 19 · Amendment 2</span>
          <h1>Are you ready for 26 November 2026?</h1>
          <p class="lede">
            Seven questions. No account, no email, no card. The answer is
            yours whether or not you ever use this product — and where one
            of these changes is something we do not do, this page says so.
          </p>
        </header>

        ${Clock(days)}

        <h2>What changed</h2>
        <p class="picture-note">
          Amendment 2 does not add a thirteenth element. It changes what
          several of the twelve are asked for — a stated acceptable level
          replaced by measured performance, safety intelligence introduced
          as a discipline of its own, and the SMS obligation extended to
          organisations that never had one.
        </p>

        <form data-readiness novalidate>
          <fieldset>
            <legend>Which of these can you evidence today?</legend>
            ${CHANGES.map(
              (c) => html`<label class="check">
                <input type="checkbox" name="change" value="${c.key}" />
                <span><strong>${c.title}</strong>
                  <span class="barrier__meta">${c.show}</span></span>
              </label>`
            )}
          </fieldset>
          <button type="submit" class="btn btn-primary">Show me what is left</button>
        </form>

        ${Result(result)}

        <h2>Newly required to hold an SMS</h2>
        <p class="picture-note">
          If you are one of these, Amendment 2 is not a change to your SMS.
          It is the reason you now need one.
        </p>
        <ul class="picture-list" role="list">
          ${NEWLY_IN_SCOPE.map(
            (p) => html`<li><strong>${p.who}</strong>
              <span class="barrier__meta">${p.note}</span></li>`
          )}
        </ul>

        <h2>Where this comes from</h2>
        <p class="picture-note">${AMENDMENT2_SOURCE}</p>
      </section>
    `.toString();

    outlet.querySelector('form[data-readiness]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const checked = [...e.currentTarget.querySelectorAll('input[name="change"]:checked')]
        .map((i) => i.value);
      draw(assessReadiness(checked, new Date()));
      /* Focus the answer rather than leaving a keyboard user at the top
         of a page that has changed underneath them. */
      outlet.querySelector('[data-result] h3')?.setAttribute('tabindex', '-1');
      outlet.querySelector('[data-result] h3')?.focus();
    });
  };

  draw(null);
}
