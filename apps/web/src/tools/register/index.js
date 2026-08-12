/* ============================================================
   The risk register — element 2.2.

   WHAT AN AUDIT ASKED FOR. "Hazard to consequence to control to
   residual risk, with owners, closure dates and executive acceptance",
   named the highest-impact and lowest-complexity addition. It is right
   on both counts: reporting produces hazards, and a hazard nobody has
   assessed is a hazard nobody has decided about.

   ON THIS DEVICE, and the honest consequence of that. Entries live in
   this browser, like the maturity assessment and the report draft.
   That means a safety manager can keep a register offline, print it,
   and take it to a meeting — and it means the register is NOT shared
   with the safety office, does not sync, and is not visible to anyone
   else. Element 2.2 is not closed by this; it moves from a matrix with
   no register to a register with no distribution, and the coverage
   page says exactly that rather than claiming the element.

   The arithmetic is the same tolerability() the matrix, the assessor
   and the methodology page use. Never stored — recomputed on every
   read, so an entry cannot carry a band that disagrees with the scale.
   ============================================================ */

import { html, raw } from '../../shared/html.js';
import { Select } from '../../components/Select.js';
import {
  tolerability,
  riskScore,
  SEVERITY_SCALE,
  LIKELIHOOD_SCALE
} from '../../../../../packages/shared/src/risk.ts';
import { registerHealth } from '../../../../../packages/shared/src/maturity.ts';

const STORE = 'usalamasms.register';

/* Same declaration as the matrix and the assessor. An entry scored on
   a severity worded differently from the matrix it is read against is
   an entry an auditor has to reconcile by hand. */
const options = (scale) => scale.map((p) => ({ value: p.key, label: `${p.code} — ${p.label}` }));

const STATUSES = [
  ['OPEN', 'Open — assessed, not yet mitigated'],
  ['MITIGATED', 'Mitigated — controls in place'],
  ['ACCEPTED', 'Accepted — residual risk signed off'],
  ['CLOSED', 'Closed — no longer applicable']
];

const BADGE = { OPEN: 'ALERT', MITIGATED: 'CAUTION', ACCEPTED: 'SAFE', CLOSED: 'OFFLINE' };

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.id === 'string') : [];
  } catch {
    return [];
  }
}

function save(entries) {
  try {
    localStorage.setItem(STORE, JSON.stringify(entries));
  } catch {
    /* Private mode or a full quota. The register still works for this
       sitting and the page says where it lives, which is better than
       failing the keystroke. */
  }
}

function band(severity, likelihood) {
  if (!severity || !likelihood) return null;
  try {
    return { t: tolerability(severity, likelihood), score: riskScore(severity, likelihood) };
  } catch {
    return null;
  }
}

function Row(entry) {
  const initial = band(entry.severity, entry.likelihood);
  const residual = band(entry.residualSeverity, entry.residualLikelihood);
  const shown = residual ?? initial;

  return html`<article class="card cov reg-entry" data-id="${entry.id}">
    <div class="cov__head">
      <h3>${entry.hazard}</h3>
      <span class="badge" data-status="${BADGE[entry.status] ?? 'OFFLINE'}">
        <span class="badge__label">${entry.status.toLowerCase()}</span>
      </span>
    </div>

    <p class="cov__has"><strong>If it happens:</strong> ${entry.consequence}</p>

    <p class="reg-entry__risk">
      ${initial
        ? html`<span class="risk-chip" data-tolerability="${initial.t}"
            >${initial.score} initial</span
          >`
        : ''}
      ${residual
        ? html`<span class="risk-chip" data-tolerability="${residual.t}"
            >${residual.score} residual</span
          >`
        : html`<span class="reg-entry__nores">no controls assessed yet</span>`}
      ${shown && shown.t === 'INTOLERABLE' && entry.status !== 'ACCEPTED'
        ? html`<strong class="reg-entry__flag">Intolerable and not accepted</strong>`
        : ''}
    </p>

    ${entry.controls
      ? html`<p class="cov__missing"><strong>Controls:</strong> ${entry.controls}</p>`
      : ''}

    <p class="reg-entry__meta">
      <span>${entry.owner || 'No owner'}</span>
      <span>review by ${entry.reviewBy || 'no date'}</span>
      ${entry.acceptedBy ? html`<span>accepted by ${entry.acceptedBy}</span>` : ''}
      <button type="button" class="btn btn-ghost btn-sm" data-remove="${entry.id}">Remove</button>
    </p>
  </article>`;
}

export function render(outlet) {
  let entries = load();

  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Toolkit</span>
        <h1>Risk register</h1>
        <p class="lede">
          Hazard, consequence, controls, residual risk — with an owner and a
          review date, which are the two fields an auditor checks first. The
          bands are computed by the same ICAO Doc 9859 scale as the matrix, never
          stored, so an entry cannot carry a band that disagrees with it.
        </p>
        <dl class="stat-strip" id="reg-health"></dl>
      </div>
    </section>

    <div class="panel wrap doc">
      <aside class="toc mat-result">
        <h2 class="section-title">Add an entry</h2>
        <form id="reg-form" novalidate>
          <label class="field">
            <span class="field-label">The hazard *</span>
            <input class="input-field" name="hazard" required />
          </label>
          <label class="field">
            <span class="field-label">If it happens, what is the consequence? *</span>
            <textarea class="input-field" name="consequence" rows="2" required></textarea>
          </label>

          ${Select({
            name: 'severity',
            label: 'Severity, before controls',
            value: 'C_MAJOR',
            placeholder: 'Choose a severity',
            options: options(SEVERITY_SCALE)
          })}
          ${Select({
            name: 'likelihood',
            label: 'Likelihood, before controls',
            value: 'REMOTE',
            placeholder: 'Choose a likelihood',
            options: options(LIKELIHOOD_SCALE)
          })}

          <label class="field">
            <span class="field-label">Controls</span>
            <textarea class="input-field" name="controls" rows="2"></textarea>
            <span class="field-hint">
              Leave blank until something is actually in place. An entry with no
              controls carries its initial risk, which is the honest number.
            </span>
          </label>

          ${Select({
            name: 'residualSeverity',
            label: 'Severity, after controls',
            placeholder: 'Not assessed yet',
            options: options(SEVERITY_SCALE)
          })}
          ${Select({
            name: 'residualLikelihood',
            label: 'Likelihood, after controls',
            placeholder: 'Not assessed yet',
            options: options(LIKELIHOOD_SCALE)
          })}

          <label class="field">
            <span class="field-label">Owner *</span>
            <input class="input-field" name="owner" required />
            <span class="field-hint">
              A person, not a department. An entry nobody owns is an entry nobody
              acts on, and it is the commonest defect in a real register.
            </span>
          </label>
          <label class="field">
            <span class="field-label">Review by *</span>
            <input class="input-field" type="date" name="reviewBy" required />
          </label>

          ${Select({
            name: 'status',
            label: 'Status',
            value: 'OPEN',
            placeholder: 'Choose a status',
            options: STATUSES.map(([value, label]) => ({ value, label }))
          })}

          <label class="field">
            <span class="field-label">Accepted by</span>
            <input class="input-field" name="acceptedBy" />
            <span class="field-hint">
              Only for an accepted residual risk, and only somebody who can accept
              it on the operator's behalf.
            </span>
          </label>

          <button type="submit" class="btn btn-primary btn-block">Add to register</button>
          <p class="field-error" id="reg-error" role="status" aria-live="polite"></p>
        </form>
        <p class="mat-actions no-print">
          <button type="button" class="btn btn-secondary btn-sm" id="reg-print">
            Print or save as PDF
          </button>
        </p>
      </aside>

      <div class="doc__body">
        <section class="doc-section">
          <h2>The register</h2>
          <p class="note">
            <b>On this device only</b>
            Entries live in this browser. They are not sent anywhere, not shared
            with the safety office, and not visible to anyone else — so this is a
            register a safety manager can keep and print, not yet one an
            organisation shares. <a href="/coverage#c-2">Coverage</a> says so
            rather than claiming the element.
          </p>
          <div id="reg-list"></div>
        </section>
      </div>
    </div>
  `.toString();

  const list = outlet.querySelector('#reg-list');
  const health = outlet.querySelector('#reg-health');
  const form = outlet.querySelector('#reg-form');
  const error = outlet.querySelector('#reg-error');

  const repaint = () => {
    const h = registerHealth(entries, new Date());
    health.innerHTML = html`
      <div class="stat">
        <dt class="stat__value">${h.total}</dt>
        <dd class="stat__label">Entries</dd>
      </div>
      <div class="stat">
        <dt class="stat__value">${h.intolerableOpen}</dt>
        <dd class="stat__label">Intolerable and not accepted</dd>
      </div>
      <div class="stat">
        <dt class="stat__value">${h.overdue}</dt>
        <dd class="stat__label">Past their review date</dd>
      </div>
      <div class="stat">
        <dt class="stat__value">${h.unowned}</dt>
        <dd class="stat__label">With no owner</dd>
      </div>
    `.toString();

    list.innerHTML = entries.length
      ? entries.map(Row).join('')
      : html`<p class="empty-state">
          <span>Nothing on the register yet. The first entry is usually the hazard
          behind the last report somebody filed.</span>
        </p>`.toString();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const f = form.elements;
    const required = ['hazard', 'consequence', 'owner', 'reviewBy'];
    const missing = required.filter((n) => !f[n].value.trim());
    if (missing.length) {
      error.textContent =
        'An entry needs a hazard, its consequence, an owner and a review date. ' +
        'The last two are what make it a register rather than a list.';
      return;
    }
    error.textContent = '';

    entries = [
      {
        id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        hazard: f.hazard.value.trim(),
        consequence: f.consequence.value.trim(),
        severity: f.severity.value,
        likelihood: f.likelihood.value,
        controls: f.controls.value.trim(),
        residualSeverity: f.residualSeverity.value || undefined,
        residualLikelihood: f.residualLikelihood.value || undefined,
        owner: f.owner.value.trim(),
        reviewBy: f.reviewBy.value,
        status: f.status.value,
        acceptedBy: f.acceptedBy.value.trim() || undefined,
        createdAt: new Date().toISOString()
      },
      ...entries
    ];
    save(entries);
    form.reset();
    repaint();
  });

  list.addEventListener('click', (event) => {
    const id = event.target.closest?.('[data-remove]')?.dataset.remove;
    if (!id) return;
    entries = entries.filter((e) => e.id !== id);
    save(entries);
    repaint();
  });

  outlet.querySelector('#reg-print').addEventListener('click', () => window.print());

  repaint();
  void raw;
}
