/* ============================================================
   The design route.

   Not the product — the brand system rendering itself against the REAL
   modules, so the claims in docs/04-BRAND.md can be checked by looking
   rather than only by reading. The matrix calls tolerability() and the
   deadline table reads MOR_OBLIGATIONS, so neither can drift from the
   documents that describe them.

   It lives on its own route rather than on the home page because the
   home page is now the report form, which is the screen that matters.
   ============================================================ */

import { html } from '../../shared/html.js';
import { tolerability, riskScore } from '../../../../../packages/shared/src/risk.ts';
import {
  MOR_OBLIGATIONS,
  JURISDICTIONS,
  isProvisional,
  reportingDeadline
} from '../../../../../packages/shared/src/regulations.ts';

export function render(outlet) {
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




  outlet.innerHTML = html`
    <section class="panel">
      <h2>Risk tolerability — ICAO Doc 9859, 5&nbsp;&times;&nbsp;5</h2>
      <p>
        Colour is never the only channel. Every cell carries its index and
        a one-letter tolerability code, so the matrix survives greyscale
        printing, a monochrome fax to a regulator, and a reader who cannot
        separate the hues.
      </p>
      <div class="table-scroll">
        <table class="risk-matrix">${matrix}</table>
      </div>
      <p class="footnote">
        Savannah Gold is the lightest of the three, which inverts the usual
        severity-as-weight reading. That is the price of the three states
        being tellable apart without hue — the two alternatives measured
        1.10:1 and 1.06:1 and are recorded, with their numbers, in the
        brand document.
      </p>
    </section>

    <section class="panel">
      <h2>Reporting deadlines</h2>
      <p>
        Computed from the jurisdiction and the moment the operator became
        aware — never stored, never anchored to the occurrence. Rows not
        yet read against the primary instrument say so.
      </p>
      <div class="table-scroll">
        <table class="oblig-table">${obligations}</table>
      </div>
    </section>
  `.toString();
}
