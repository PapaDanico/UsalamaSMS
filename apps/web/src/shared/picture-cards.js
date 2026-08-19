import { html } from './html.js';

export function riskTolerabilityCard({ href, title, ariaLabel, bands }) {
  const intolerable = bands.INTOLERABLE ?? 0;
  const tolerable = bands.TOLERABLE ?? 0;
  const acceptable = bands.ACCEPTABLE ?? 0;
  const total = intolerable + tolerable + acceptable;

  return html`
    <a class="picture-card" href="${href}" aria-label="${ariaLabel}">
      <h3 class="picture-card__title">${title}</h3>
      <ul class="picture-card__bars" aria-label="Hazards by tolerability band">
        <li data-tolerability="INTOLERABLE">
          <span class="picture-card__band">Intolerable</span>
          <span class="picture-card__count ${intolerable > 0 ? 'picture-card__count--alert' : ''}">${intolerable}</span>
        </li>
        <li data-tolerability="TOLERABLE">
          <span class="picture-card__band">Tolerable</span>
          <span class="picture-card__count">${tolerable}</span>
        </li>
        <li data-tolerability="ACCEPTABLE">
          <span class="picture-card__band">Acceptable</span>
          <span class="picture-card__count">${acceptable}</span>
        </li>
      </ul>
      ${total === 0
        ? html`<p class="picture-card__note">No assessed hazards yet</p>`
        : html`<p class="picture-card__note">${total} assessed hazard${total === 1 ? '' : 's'}</p>`}
    </a>
  `;
}

export function openActionsCard({ href, title, ariaLabel, outstanding, overdue }) {
  return html`
    <a class="picture-card" href="${href}" aria-label="${ariaLabel}">
      <h3 class="picture-card__title">${title}</h3>
      <p class="picture-card__value ${overdue > 0 ? 'picture-card__value--alert' : ''}">${outstanding}</p>
      ${overdue > 0
        ? html`<p class="picture-card__note picture-card__note--alert">${overdue} overdue</p>`
        : html`<p class="picture-card__note">None overdue</p>`}
    </a>
  `;
}
