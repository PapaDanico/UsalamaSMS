import { html } from '../shared/html.js';
import { can } from '../../../../packages/shared/src/index.ts';
import { SMS_COMPONENTS } from '../../../../packages/shared/src/maturity.ts';

const STORE = 'usalamasms.maturity';
const TOTAL_ELEMENTS = SMS_COMPONENTS.reduce((n, c) => n + c.elements.length, 0);

function maturityDone() {
  try {
    const raw = localStorage.getItem(STORE);
    const parsed = raw ? JSON.parse(raw) : {};
    const done = Object.entries(parsed).filter(
      ([k, v]) => !k.startsWith('_') && Number.isInteger(v) && v >= 0 && v <= 4
    ).length;
    return done >= TOTAL_ELEMENTS;
  } catch {
    return false;
  }
}

export function checklistModel({ scale, teamCount, role }) {
  return [
    {
      key: 'REPORT',
      label: 'File your first report',
      href: '/report',
      done: (scale?.reports ?? 0) > 0,
    },
    {
      key: 'MATURITY',
      label: 'Complete the SMS maturity assessment',
      href: '/toolkits/maturity',
      done: maturityDone(),
    },
    {
      key: 'REGISTER',
      label: 'Add one hazard to the risk register',
      href: '/toolkits/register',
      done: (scale?.registerEntries ?? 0) > 0,
    },
    {
      key: 'SPI',
      label: 'Create your first SPI',
      href: '/toolkits/spi',
      done: (scale?.indicators ?? 0) > 0,
    },
    {
      key: 'TEAM',
      label: 'Invite your team (2+ members)',
      href: '/account/team',
      done: (teamCount ?? 0) >= 2,
      actionable: can(role, 'user.manage'),
    },
  ];
}

function nextAction(items) {
  return items.find((item) => !item.done && item.actionable !== false) ?? null;
}

export function OnboardingChecklist({ scale, teamCount, trial, role }) {
  if (!trial || trial.state !== 'TRIAL') return '';
  const items = checklistModel({ scale, teamCount, role });
  const done = items.filter((item) => item.done).length;
  const next = nextAction(items);
  return html`
    <section class="card">
      <div class="cov__head">
        <h2>Onboarding checklist</h2>
        <span class="badge" data-status="${done === items.length ? 'SAFE' : 'CAUTION'}">
          <span class="badge__label">${done} of ${items.length} complete</span>
        </span>
      </div>
      <p class="hint">
        ${trial.daysRemaining === 0
          ? 'Your trial ends today.'
          : `${trial.daysRemaining} day${trial.daysRemaining === 1 ? '' : 's'} remain in your trial.`}
      </p>
      <ul class="next-list" data-onboarding-checklist>
        ${items.map((item) => html`<li>
          <strong>${item.done ? '[x]' : '[ ]'}</strong>
          ${item.done
            ? item.label
            : html`<a href="${item.href}">${item.label}</a>`}
        </li>`)}
      </ul>
      ${next
        ? html`<p class="mat-actions no-print">
            <a class="btn btn-primary btn-sm" href="${next.href}">Complete next step →</a>
          </p>`
        : ''}
    </section>
  `;
}
