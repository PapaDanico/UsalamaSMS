/* ============================================================
   Phase 0 app shell.

   This page exists to render the brand system against real data from
   the real modules — not a static mockup of them. The matrix below is
   built by calling `tolerability()` from the shared package, so a
   change to the Doc 9859 cell set shows up here immediately, and the
   deadline table reads MOR_OBLIGATIONS rather than a copy of it.

   Charter rule 10 in miniature: nothing on this page is typed twice.
   ============================================================ */

import { html } from './shared/html.js';
import { Logo } from './components/Logo.js';
/* Imported from the two PURE modules, not from the package index.
   index.ts pulls in zod, and this page needs a Set lookup and a date
   addition — it does not need 47 kB of schema machinery. Measured: the
   bundle went from 63.8 kB to a fraction of it. The design target is a
   mid-range Android at a remote strip. */
import { tolerability, riskScore } from '../../../packages/shared/src/risk.ts';
import {
  MOR_OBLIGATIONS,
  JURISDICTIONS,
  isProvisional,
  reportingDeadline
} from '../../../packages/shared/src/regulations.ts';

/* ------------------------------ Logo ------------------------------ */
document.getElementById('logo-slot').innerHTML = Logo({ height: 40 }).toString();

/* ----------------------------- Matrix ----------------------------- */

const SEVERITIES = [
  ['A_CATASTROPHIC', 'A', 'Catastrophic'],
  ['B_HAZARDOUS', 'B', 'Hazardous'],
  ['C_MAJOR', 'C', 'Major'],
  ['D_MINOR', 'D', 'Minor'],
  ['E_NEGLIGIBLE', 'E', 'Negligible']
];

const LIKELIHOODS = [
  ['FREQUENT', '5', 'Frequent'],
  ['OCCASIONAL', '4', 'Occasional'],
  ['REMOTE', '3', 'Remote'],
  ['IMPROBABLE', '2', 'Improbable'],
  ['EXTREMELY_IMPROBABLE', '1', 'Extremely improbable']
];

/* One letter per tolerability. This is the channel that carries the
   meaning when colour cannot — greyscale, dichromacy, a bad projector. */
const CODE = { INTOLERABLE: 'I', TOLERABLE: 'T', ACCEPTABLE: 'A' };

const matrix = html`
  <thead>
    <tr>
      <th scope="col"><span class="visually-hidden">Severity</span></th>
      ${LIKELIHOODS.map(
        ([, digit, label]) => html`<th scope="col" title="${label}">${digit} ${label}</th>`
      )}
    </tr>
  </thead>
  <tbody>
    ${SEVERITIES.map(
      ([sev, letter, sevLabel]) => html`
        <tr>
          <th scope="row" title="${sevLabel}">${letter} ${sevLabel}</th>
          ${LIKELIHOODS.map(([lik, digit, likLabel]) => {
            const t = tolerability(sev, lik);
            const score = riskScore(sev, lik);
            return html`<td>
              <div class="risk-matrix__cell" data-tolerability="${t}">
                <span
                  >${score}<span class="visually-hidden">
                    — ${sevLabel}, ${likLabel}: ${t.toLowerCase()}</span
                  ></span
                >
                <span class="risk-matrix__code" aria-hidden="true">${CODE[t]}</span>
              </div>
            </td>`;
          })}
        </tr>
      `
    )}
  </tbody>
`;

document.getElementById('matrix').innerHTML = matrix.toString();

/* --------------------------- Obligations --------------------------- */
/* A worked example rather than an abstract table: an occurrence at
   10:00Z discovered three days later. The gap is the entire point — it
   is what the replaced constant got wrong, and a table of raw hour
   counts would hide it. */

const occurredAt = new Date('2026-08-11T10:00:00Z');
const awareAt = new Date('2026-08-14T08:00:00Z');

const fmt = (d) =>
  d.toISOString().replace('T', ' ').slice(0, 16) + 'Z';

const obligations = html`
  <thead>
    <tr>
      <th scope="col">Jurisdiction</th>
      <th scope="col">Window</th>
      <th scope="col">Clock starts</th>
      <th scope="col">Due</th>
      <th scope="col">Instrument</th>
    </tr>
  </thead>
  <tbody>
    ${JURISDICTIONS.map((j) => {
      const o = MOR_OBLIGATIONS[j];
      const { due } = reportingDeadline(j, { occurredAt, awareAt });
      const provisional = isProvisional(j);
      return html`
        <tr>
          <th scope="row">
            ${o.authority}
            ${provisional
              ? html`<span class="tag tag--provisional">provisional</span>`
              : ''}
          </th>
          <td class="num">${o.hours} h</td>
          <td>${o.clockStart === 'AWARENESS' ? 'awareness' : 'occurrence'}</td>
          <td class="num">${fmt(due)}</td>
          <td class="cite">
            ${o.instrument}
            <span class="verified">verified ${o.verifiedOn}</span>
          </td>
        </tr>
      `;
    })}
  </tbody>
`;

document.getElementById('obligations').innerHTML = obligations.toString();

/* --------------------------- Sync strip --------------------------- */
/* The offline module is not imported here. It opens an IndexedDB
   connection and registers a service worker sync, and this page has no
   outbox to flush — importing it would mean a Phase 0 brand page
   creating a database on a reviewer's machine. The strip reads
   navigator.onLine only, which is all it can honestly report yet. */

const strip = document.getElementById('sync-strip');
const stripText = document.getElementById('sync-text');

function renderSyncState() {
  const online = navigator.onLine;
  strip.dataset.state = online ? 'synced' : 'offline';
  stripText.textContent = online
    ? 'Online — nothing waiting to send'
    : 'Offline — reports are saved on this device and will send when signal returns';
}

renderSyncState();
window.addEventListener('online', renderSyncState);
window.addEventListener('offline', renderSyncState);
