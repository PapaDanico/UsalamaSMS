/* ============================================================
   Methodology.

   THIS REPLACES THE ROUTE THAT WAS CALLED "DESIGN SYSTEM". That name
   described the screen to the people who built it and to nobody else:
   a safety manager reading a menu has no reason to open something
   called a design system, and what was behind it — the ICAO Doc 9859
   matrix and the reporting-deadline registry, rendered from the modules
   that compute them — is the single most useful page for the person
   deciding whether to trust the numbers.

   So it keeps the mechanism and drops the framing. The matrix still
   calls tolerability() and the obligation table still reads
   MOR_OBLIGATIONS, which is what makes this page a demonstration rather
   than a description: neither table can drift from the engine, because
   neither table has its own copy of anything.

   LAZY. A ramp agent filing a hazard at a remote strip does not open
   this, and every kilobyte here is otherwise charged to the screen they
   do open.
   ============================================================ */

import { html } from '../../shared/html.js';
import { Select } from '../../components/Select.js';
import {
  tolerability,
  riskScore,
  SEVERITY_SCALE,
  LIKELIHOOD_SCALE
} from '../../../../../packages/shared/src/risk.ts';
import {
  MOR_OBLIGATIONS,
  JURISDICTIONS,
  isProvisional,
  reportingDeadline
} from '../../../../../packages/shared/src/regulations.ts';

/* One letter per tolerability. This is the channel that carries the
   meaning when colour cannot — greyscale, dichromacy, a bad projector,
   a monochrome fax to a regulator. */
const CODE = { INTOLERABLE: 'I', TOLERABLE: 'T', ACCEPTABLE: 'A' };

function Matrix() {
  return html`
    <thead>
      <tr>
        <th scope="col"><span class="visually-hidden">Severity</span></th>
        ${LIKELIHOOD_SCALE.map(
          ({ code, label }) => html`<th scope="col" title="${label}">${code} ${label}</th>`
        )}
      </tr>
    </thead>
    <tbody>
      ${SEVERITY_SCALE.map(
        ({ key: sev, code: letter, label: sevLabel }) => html`
          <tr>
            <th scope="row" title="${sevLabel}">${letter} ${sevLabel}</th>
            ${LIKELIHOOD_SCALE.map(({ key: lik, label: likLabel }) => {
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
}

/* A worked example rather than an abstract table: an occurrence at
   10:00Z discovered three days later. The gap is the entire point — it
   is what the replaced constant got wrong, and a table of raw hour
   counts would hide it. */
const OCCURRED_AT = new Date('2026-08-11T10:00:00Z');
const AWARE_AT = new Date('2026-08-14T08:00:00Z');

const fmt = (d) => d.toISOString().replace('T', ' ').slice(0, 16) + 'Z';

function Obligations() {
  return html`
    <thead>
      <tr>
        <th scope="col">Authority</th>
        <th scope="col">Window</th>
        <th scope="col">Clock starts</th>
        <th scope="col">Due</th>
        <th scope="col">Instrument</th>
      </tr>
    </thead>
    <tbody>
      ${JURISDICTIONS.map((j) => {
        const o = MOR_OBLIGATIONS[j];
        const { due } = reportingDeadline(j, { occurredAt: OCCURRED_AT, awareAt: AWARE_AT });
        return html`
          <tr>
            <th scope="row">
              ${o.authority}
              ${isProvisional(j) ? html`<span class="tag tag--provisional">provisional</span>` : ''}
            </th>
            <td class="num" data-label="Window">${o.hours} h</td>
            <td data-label="Clock starts">
              ${o.clockStart === 'AWARENESS' ? 'awareness' : 'occurrence'}
            </td>
            <td class="num" data-label="Due">${fmt(due)}</td>
            <td class="cite" data-label="Instrument">
              ${o.instrument}
              <span class="verified">verified ${o.verifiedOn}</span>
            </td>
          </tr>
        `;
      })}
    </tbody>
  `;
}

/* ============================================================
   THE CALCULATOR.

   A page that explains a derivation and then makes the reader do the
   arithmetic has explained nothing. This is the same reportingDeadline()
   the report form calls, with the two dates exposed — so a safety
   manager working out where a Tuesday-morning discovery actually lands
   gets the answer from the engine rather than from a mental model of
   it.

   It refuses the same input the engine refuses: awareness before the
   occurrence. That is a silent 48-hour error in the operator's favour,
   which is the direction that gets somebody in trouble, so it is an
   error message rather than a shrug.
   ============================================================ */
function bindCalculator(outlet) {
  const form = outlet.querySelector('#deadline-calc');
  if (!form) return;
  const out = outlet.querySelector('#deadline-result');

  const recompute = () => {
    const jurisdiction = form.elements.jurisdiction.value;
    const occurredAt = new Date(form.elements.occurredAt.value);
    const awareAt = new Date(form.elements.awareAt.value);

    if (!jurisdiction || Number.isNaN(occurredAt.getTime()) || Number.isNaN(awareAt.getTime())) {
      out.dataset.state = 'idle';
      out.textContent = 'Choose an authority and both moments.';
      return;
    }

    try {
      const { due, obligation } = reportingDeadline(jurisdiction, { occurredAt, awareAt });
      const anchor = obligation.clockStart === 'AWARENESS' ? 'awareness' : 'the occurrence';
      out.dataset.state = 'ok';
      out.innerHTML = html`
        <strong>${fmt(due)}</strong>
        <span class="calc__detail">
          ${obligation.hours} hours from ${anchor} &middot; ${obligation.authority}${isProvisional(
            jurisdiction
          )
            ? html` &middot; <span class="tag tag--provisional">provisional</span>`
            : ''}
        </span>
      `.toString();
    } catch (error) {
      out.dataset.state = 'error';
      out.textContent = /precedes/.test(String(error.message))
        ? 'Awareness cannot come before the occurrence. Check the two moments — ' +
          'the wrong way round gives an answer that is late in the operator\'s favour.'
        : 'Those dates could not be read.';
    }
  };

  form.addEventListener('input', recompute);
  form.addEventListener('change', recompute);
  recompute();
}

function Calculator() {
  return html`
    <form class="card calc-card" id="deadline-calc" novalidate>
      ${Select({
        name: 'jurisdiction',
        label: 'Which authority does the operation answer to?',
        placeholder: 'Choose an authority',
        value: 'KE',
        options: JURISDICTIONS.map((j) => ({
          value: j,
          label: MOR_OBLIGATIONS[j].authority
        }))
      })}

      <div class="field">
        <label class="field-label" for="calc-occurred">When did it happen? (UTC)</label>
        <input
          class="input-field"
          type="datetime-local"
          id="calc-occurred"
          name="occurredAt"
          value="2026-08-11T10:00"
        />
      </div>

      <div class="field">
        <label class="field-label" for="calc-aware">When did the operator become aware? (UTC)</label>
        <input
          class="input-field"
          type="datetime-local"
          id="calc-aware"
          name="awareAt"
          value="2026-08-14T08:00"
        />
        <p class="field-hint">
          Usually a later moment than the occurrence, and it is the one most
          instruments anchor to.
        </p>
      </div>

      <!-- No "for" attribute: the Select component mints its own ids,
           and an output pointing at an id that does not exist is worse
           than one pointing at nothing. aria-live carries the update. -->
      <output class="calc__out" id="deadline-result" aria-live="polite"
        >Choose an authority and both moments.</output
      >
    </form>
  `;
}

export function render(outlet) {
  const provisional = JURISDICTIONS.filter(isProvisional);

  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Methodology</span>
        <h1>How every figure in this product is derived</h1>
        <p class="lede">
          Two mechanisms decide what the software tells an operator: the
          reporting window, read from each jurisdiction's own instrument, and
          the risk classification, taken from ICAO Doc 9859. Both are rendered
          below by the modules that compute them, so neither table can drift
          from the engine behind it.
        </p>
        <dl class="stat-strip">
          <div class="stat">
            <dt class="stat__value">${JURISDICTIONS.length}</dt>
            <dd class="stat__label">Jurisdictions in the registry</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">${provisional.length}</dt>
            <dd class="stat__label">Provisional, pending a primary read</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">5 &times; 5</dt>
            <dd class="stat__label">Doc 9859 risk matrix</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">0</dt>
            <dd class="stat__label">Deadlines stored rather than computed</dd>
          </div>
        </dl>
      </div>
    </section>

    <div class="panel wrap doc">
      <nav class="toc" aria-labelledby="toc-title">
        <h2 class="section-title" id="toc-title">On this page</h2>
        <ol>
          <li><a href="#windows">The reporting window</a></li>
          <li><a href="#risk">Risk classification</a></li>
          <li><a href="#colour">Why colour is never the only channel</a></li>
          <li><a href="#provenance">Provenance and revision</a></li>
        </ol>
      </nav>

      <div class="doc__body">
        <section class="doc-section" id="windows">
          <h2>The reporting window</h2>
          <p class="lede lede--tight">
            Computed from the jurisdiction and the moment the operator became
            aware. Never anchored to the occurrence, and never stored.
          </p>
          <p>
            The two dates are usually different, and the gap is the whole risk.
            The table below works a single example: an occurrence at 10:00Z on
            11&nbsp;August, discovered at 08:00Z on 14&nbsp;August. Under an
            occurrence-anchored clock a Kenyan operator has already missed the
            window before anyone knew it had opened.
          </p>
          <div class="table-scroll">
            <table class="oblig-table">
              <caption class="visually-hidden">
                Reporting deadline by authority for an occurrence at 10:00Z on
                11 August 2026, discovered at 08:00Z on 14 August 2026
              </caption>
              ${Obligations()}
            </table>
          </div>
          <p class="footnote">
            Rows marked provisional carry the ICAO-common figure pending a
            reading of the primary instrument. They are marked wherever they
            appear, including inside a live countdown, because a figure an
            operator relies on and cannot check is worse than no figure.
          </p>

          <h3>Work out a specific window</h3>
          <p>
            The same function the report form calls, with both moments exposed.
            Nothing entered here is stored or sent.
          </p>
          ${Calculator()}
        </section>

        <section class="doc-section" id="risk">
          <h2>Risk classification</h2>
          <p class="lede lede--tight">
            ICAO Doc 9859, fourth edition: severity A&ndash;E against likelihood
            5&ndash;1, resolving to three tolerability states.
          </p>
          <p>
            Each cell shows its risk index and a one-letter tolerability code.
            The index is the product of the two axes; the code is
            <strong>I</strong> intolerable, <strong>T</strong> tolerable,
            <strong>A</strong> acceptable.
          </p>
          <div class="table-scroll">
            <table class="risk-matrix">
              <caption class="visually-hidden">
                Risk tolerability by severity and likelihood
              </caption>
              ${Matrix()}
            </table>
          </div>
        </section>

        <section class="doc-section" id="colour">
          <h2>Why colour is never the only channel</h2>
          <p>
            Every cell above carries its index and its letter. The matrix
            therefore survives greyscale printing, a monochrome fax to an
            authority, a projector with the contrast wound down, and a reader
            who cannot separate the hues — which is roughly one man in twelve.
          </p>
          <p class="footnote">
            One consequence is visible and deliberate: the tolerable band is
            the lightest of the three, which inverts the usual reading of
            severity as weight. That is the price of the three states being
            tellable apart without hue at all. The two alternatives measured
            1.10:1 and 1.06:1 against their neighbours and are recorded, with
            their numbers, in the brand document.
          </p>
        </section>

        <section class="doc-section" id="provenance">
          <h2>Provenance and revision</h2>
          <p>
            Every regulatory figure carries the date it was last read against
            its primary instrument, shown beside the citation in the table
            above. A figure without such a date does not enter the registry.
          </p>
          <p>
            The product is built to ICAO Annex 19 Amendment 2, applicable
            <time datetime="2026-11-26">26 November 2026</time>, with Doc 10159
            on safety intelligence. When an instrument changes, the registry
            changes and every countdown in the product changes with it on the
            next read — there is no stored deadline to migrate, which is the
            reason for computing rather than storing.
          </p>
        </section>
      </div>
    </div>
  `.toString();

  bindCalculator(outlet);
}
