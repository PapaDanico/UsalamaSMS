/* ============================================================
   THE DUTY A FATIGUE REPORT IS ABOUT — loaded only when asked for.

   Split out of the report form because that form is the entry chunk:
   the bytes a ramp agent downloads over a bad link before they can file
   anything. Inline, this cost 3.8 KB of entry — measured, not estimated
   — charged to every reporter filing a bird strike for eight questions
   they will never see. The two-number bundle budget is what surfaced
   it, and moving the weight is the answer the budget is asking for.

   EVERY FIELD IS OPTIONAL, and that is the design rather than laxity. A
   crew member at the end of a long duty is the least willing person in
   the operation to fill in eight boxes, and a form that refuses an
   incomplete fatigue report converts a report into silence. What
   arrives partial is reported as INCOMPLETE by fatigue.ts rather than
   guessed at, and the safety office can add the figures when it calls.

   LOCAL HOURS, not a timestamp. The window of circadian low belongs to
   the reporter's body clock, so what matters is the hour it felt like
   to them; a UTC timestamp would need an acclimatisation model this
   product does not have and must not guess at.
   ============================================================ */
import { html } from '../../shared/html.js';
import { SAMN_PERELLI } from '../../../../../packages/shared/src/fatigue.ts';

export function render(section) {
  if (section.dataset.filled === '1') return;
  section.dataset.filled = '1';
  section.innerHTML = html`
    <h2>The duty you were tired on</h2>
    <p class="hint">
      All optional. File the report even if you cannot remember the figures —
      what you can give is what makes it possible to see whether the limits
      are protecting anybody.
    </p>
    <label>How tired were you, at worst?
      <select name="fatigueSamnPerelli" class="input-field">
        <option value="">Prefer not to say</option>
        ${SAMN_PERELLI.map(
          (s) => html`<option value="${s.level}">${s.level} — ${s.label}</option>`
        )}
      </select></label>
    <label>Flight time, hours
      <input type="number" step="0.25" min="0" max="24" name="fatigueFlightTimeHours" class="input-field" /></label>
    <label>Duty period, hours
      <input type="number" step="0.25" min="0" max="48" name="fatigueDutyHours" class="input-field" /></label>
    <label>Rest before the duty, hours
      <input type="number" step="0.25" min="0" max="168" name="fatigueRestBeforeHours" class="input-field" /></label>
    <label>Sectors flown
      <input type="number" step="1" min="0" max="40" name="fatigueSectors" class="input-field" /></label>
    <label>Sleep in the 24 hours before it, hours
      <input type="number" step="0.25" min="0" max="24" name="fatigueSleepPrior24" class="input-field" /></label>
    <label>Local hour the duty started
      <input type="number" step="1" min="0" max="23" name="fatigueStartLocalHour" class="input-field" /></label>
    <label>Local hour it ended
      <input type="number" step="1" min="0" max="23" name="fatigueEndLocalHour" class="input-field" /></label>
  `.toString();
}
