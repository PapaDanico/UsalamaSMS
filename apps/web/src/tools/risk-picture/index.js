import { html } from '../../shared/html.js';
import { isSignedIn, authFetch } from '../../shared/session.js';
import { ToolNav } from '../../shared/tool-nav.js';
import {
  tolerability,
  SEVERITY_SCALE
} from '../../../../../packages/shared/src/risk.ts';

const TOLERABILITY_ORDER = ['INTOLERABLE', 'TOLERABLE', 'ACCEPTABLE'];
const TOLERABILITY_LABEL = {
  INTOLERABLE: 'Intolerable',
  TOLERABLE: 'Tolerable',
  ACCEPTABLE: 'Acceptable'
};

/* The Prisma enum order, highest to lowest severity. */
const SEVERITY_ORDER = SEVERITY_SCALE.map((s) => s.key).reverse();

function governing(entry) {
  if (entry.residualSeverity && entry.residualLikelihood) {
    return tolerability(entry.residualSeverity, entry.residualLikelihood);
  }
  if (entry.severity && entry.likelihood) {
    return tolerability(entry.severity, entry.likelihood);
  }
  return null;
}

function governingSeverity(entry) {
  return entry.residualSeverity ?? entry.severity ?? null;
}

function tolerabilityBreakdown(entries) {
  const counts = Object.fromEntries(TOLERABILITY_ORDER.map((k) => [k, 0]));
  for (const e of entries) {
    const t = governing(e);
    if (t && t in counts) counts[t]++;
  }
  return counts;
}

function severityDistribution(entries) {
  const counts = Object.fromEntries(SEVERITY_ORDER.map((k) => [k, 0]));
  for (const e of entries) {
    const sev = governingSeverity(e);
    if (sev && sev in counts) counts[sev]++;
  }
  return counts;
}

function actionSummary(actions) {
  let open = 0;
  let closed = 0;
  let overdue = 0;
  for (const a of actions) {
    const s = a.status;
    if (s === 'VERIFIED' || s === 'CANCELLED') {
      closed++;
    } else {
      open++;
      if (s === 'OVERDUE') overdue++;
    }
  }
  return { open, closed, overdue };
}

function timeToClose(actions) {
  const closed = actions.filter(
    (a) => (a.status === 'VERIFIED' || a.status === 'CANCELLED') &&
      (a.verifiedOn || a.cancelledOn)
  );
  if (closed.length < 3) return null;
  const days = closed.map((a) => {
    const end = new Date(a.verifiedOn ?? a.cancelledOn);
    const start = new Date(a.createdAt);
    return (end.getTime() - start.getTime()) / 86_400_000;
  });
  return Math.round(days.reduce((s, d) => s + d, 0) / days.length);
}

export function render(outlet) {
  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Toolkit</span>
        <h1>Risk picture</h1>
        <p class="lede">
          Your operator's risk landscape — tolerability, severity, open actions and
          how long they take to close.
        </p>
      </div>
    </section>

    <div class="panel wrap doc">
      ${ToolNav('/toolkits/risk-picture')}

      <div class="doc__body" id="risk-picture-body">
        ${isSignedIn()
          ? html`<p class="hint">Loading your risk picture…</p>`
          : html`<div class="empty-state">
              <h3>Sign in to view the risk picture</h3>
              <p>The risk register and corrective actions are held at the safety office.
              Sign in to read them.</p>
              <p class="mat-actions"><a class="btn btn-primary" href="/account">Sign in</a></p>
            </div>`}
      </div>
    </div>
  `.toString();

  if (!isSignedIn()) return;

  const body = outlet.querySelector('#risk-picture-body');
  load(body);
}

async function load(body) {
  try {
    const [regRes, actRes] = await Promise.all([
      authFetch('/api/v1/register'),
      authFetch('/api/v1/actions')
    ]);

    if (!regRes.ok || !actRes.ok) {
      body.innerHTML = html`<p class="notice notice--urgent">
        The safety office could not be reached. Try again when there is signal.
      </p>`.toString();
      return;
    }

    const { entries } = await regRes.json();
    const { actions } = await actRes.json();

    if (!entries.length && !actions.length) {
      body.innerHTML = html`<div class="empty-state">
        <h3>No risks or actions yet</h3>
        <p>Add entries to the <a href="/toolkits/register">risk register</a> and
        record corrective actions from the
        <a href="/triage">reporting queue</a> to build a picture here.</p>
      </div>`.toString();
      return;
    }

    const breakdown = tolerabilityBreakdown(entries);
    const distribution = severityDistribution(entries);
    const { open, closed, overdue } = actionSummary(actions);
    const avgDays = timeToClose(actions);

    const maxBreakdown = Math.max(...Object.values(breakdown), 1);
    const maxDistrib = Math.max(...Object.values(distribution), 1);

    body.innerHTML = html`
      <dl class="stat-strip">
        ${TOLERABILITY_ORDER.map((t) => html`
          <div class="stat" data-tone="${t === 'INTOLERABLE' && breakdown[t] > 0 ? 'alert' : ''}">
            <dt class="stat__value">${breakdown[t]}</dt>
            <dd class="stat__label">${TOLERABILITY_LABEL[t]}</dd>
          </div>`).join('')}
        <div class="stat">
          <dt class="stat__value">${open}</dt>
          <dd class="stat__label">Open actions</dd>
        </div>
        <div class="stat" data-tone="${overdue > 0 ? 'alert' : ''}">
          <dt class="stat__value">${overdue}</dt>
          <dd class="stat__label">Overdue actions</dd>
        </div>
      </dl>

      <section class="doc-section">
        <h2>Tolerability breakdown</h2>
        <p class="lede lede--tight">
          The governing tolerability of each assessed hazard — residual where
          controls have been assessed, initial otherwise.
        </p>
        ${entries.length
          ? html`<div class="table-scroll">
              <table class="oblig-table">
                <caption class="visually-hidden">Hazard counts by tolerability band</caption>
                <thead>
                  <tr>
                    <th scope="col">Band</th>
                    <th scope="col">Count</th>
                    <th scope="col" aria-label="Proportion"></th>
                  </tr>
                </thead>
                <tbody>
                  ${TOLERABILITY_ORDER.map((t) => html`<tr>
                    <td data-tolerability="${t}">${TOLERABILITY_LABEL[t]}</td>
                    <td>${breakdown[t]}</td>
                    <td>
                      <div class="risk-picture__bar" style="--w:${Math.round(breakdown[t] / maxBreakdown * 100)}%"
                        aria-hidden="true"></div>
                    </td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>`
          : html`<p class="hint">No assessed hazards in the register yet.</p>`}
      </section>

      <section class="doc-section">
        <h2>Severity distribution</h2>
        <p class="lede lede--tight">
          How the hazards are distributed across Doc 9859's severity categories.
        </p>
        ${entries.length
          ? html`<div class="table-scroll">
              <table class="oblig-table">
                <caption class="visually-hidden">Hazard counts by severity</caption>
                <thead>
                  <tr>
                    <th scope="col">Severity</th>
                    <th scope="col">Count</th>
                    <th scope="col" aria-label="Proportion"></th>
                  </tr>
                </thead>
                <tbody>
                  ${SEVERITY_ORDER.map((s) => html`<tr>
                    <td>${s.charAt(0) + s.slice(1).toLowerCase()}</td>
                    <td>${distribution[s]}</td>
                    <td>
                      <div class="risk-picture__bar" style="--w:${Math.round(distribution[s] / maxDistrib * 100)}%"
                        aria-hidden="true"></div>
                    </td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>`
          : html`<p class="hint">No assessed hazards in the register yet.</p>`}
      </section>

      <section class="doc-section">
        <h2>Action status</h2>
        <p class="lede lede--tight">
          Open vs. closed corrective actions, and how many are overdue.
        </p>
        ${actions.length
          ? html`<dl class="stat-strip">
              <div class="stat">
                <dt class="stat__value">${open}</dt>
                <dd class="stat__label">Open</dd>
              </div>
              <div class="stat">
                <dt class="stat__value">${closed}</dt>
                <dd class="stat__label">Closed</dd>
              </div>
              <div class="stat" data-tone="${overdue > 0 ? 'alert' : ''}">
                <dt class="stat__value">${overdue}</dt>
                <dd class="stat__label">Overdue</dd>
              </div>
            </dl>`
          : html`<p class="hint">No corrective actions recorded yet.</p>`}
      </section>

      <section class="doc-section">
        <h2>Time to close</h2>
        <p class="lede lede--tight">
          Average days from action creation to closure (verified or cancelled).
        </p>
        ${avgDays !== null
          ? html`<p class="stat__value">${avgDays} <span class="stat__label">days on average</span></p>`
          : html`<p class="hint">Insufficient data — fewer than three closed actions.</p>`}
      </section>
    `.toString();
  } catch {
    body.innerHTML = html`<p class="notice notice--urgent">
      Something went wrong loading the risk picture.
    </p>`.toString();
  }
}
