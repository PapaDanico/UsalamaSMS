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
import {
  VOLUNTARY_REQUIREMENTS,
  VOLUNTARY_PROTECTION,
  VOLUNTARY_INSTRUMENT
} from '../../../../../packages/shared/src/voluntary.ts';
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
  isStale,
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
   counts would hide it.

   THE EXAMPLE IS AN ACCIDENT, and the Window column reads
   accident / serious incident / incident where a State sets three.
   Kenya does: regulation 12(1) of L.N. 32/2026 gives 24, 48 and 72
   hours respectively. A single Due date with three possible windows
   above it is a date the reader cannot place, so the column says which
   class it belongs to rather than leaving them to guess the strictest. */
const OCCURRED_AT = new Date('2026-08-11T10:00:00Z');
const AWARE_AT = new Date('2026-08-14T08:00:00Z');

const fmt = (d) => d.toISOString().replace('T', ' ').slice(0, 16) + 'Z';

function Obligations() {
  return html`
    <thead>
      <tr>
        <th scope="col">Authority</th>
        <th scope="col">Window <span class="field-note">accident / serious / incident</span></th>
        <th scope="col">Clock starts</th>
        <th scope="col">Due <span class="field-note">for an accident</span></th>
        <th scope="col">Instrument</th>
      </tr>
    </thead>
    <tbody>
      ${JURISDICTIONS.map((j) => {
        const o = MOR_OBLIGATIONS[j];
        /* The worked example is an ACCIDENT, and it is named as one in
           the caption. Kenya's regulation 12(1) gives three periods and
           a table that shows one date has to say which occurrence it is
           the date for. */
        const { due } = reportingDeadline(j, { occurredAt: OCCURRED_AT, awareAt: AWARE_AT }, 'ACCIDENT');
        return html`
          <tr>
            <th scope="row">
              ${o.authority}
              ${isProvisional(j) ? html`<span class="tag tag--provisional">provisional</span>` : ''}
            </th>
            <td class="num" data-label="Window">
              ${o.hours === null
                ? html`<span class="cell-none">no fixed period</span>`
                : o.hoursByClass
                  ? html`${o.hoursByClass.ACCIDENT} / ${o.hoursByClass.SERIOUS_INCIDENT} /
                      ${o.hoursByClass.INCIDENT} h`
                  : `${o.hours} h`}
            </td>
            <td data-label="Clock starts">
              ${o.clockStart === 'AWARENESS' ? 'awareness' : 'occurrence'}
              ${o.clockStartUnstated ? html`<span class="field-note">not stated by the instrument</span>` : ''}
            </td>
            <td class="num" data-label="Due">
              ${due ? fmt(due) : html`<span class="cell-none">without delay</span>`}
            </td>
            <td class="cite" data-label="Instrument">
              ${o.instrument}
              <!-- "verified <date>" ON ITS OWN WAS THE PROBLEM. It is the
                   date somebody last looked, and printed alone it reads
                   as reassurance — while the row can be citing an
                   instrument years past its own review cycle, with a
                   newer one gazetted above it. The reader was being
                   shown our diligence and not the document's age. -->
              <span class="verified">verified ${o.verifiedOn}</span>
              <!-- ITS OWN CLASS, not tag--provisional. The two say
                   different things: provisional means we have not read
                   the primary instrument, stale means the instrument
                   has outlived its own revision cycle. Reusing the
                   class also broke the smoke check that counts
                   provisional rows — correctly, because on that count a
                   stale row WAS being reported as provisional. -->
              ${isStale(o, new Date())
                ? html`<span class="tag tag--stale">past its review cycle</span>`
                : ''}
              ${o.governedByUnread
                ? html`<span class="cite__governs">
                    Now governed by ${o.governedByUnread}, which has not been read against this
                    row. Treat the window above as a working figure and confirm it there before
                    relying on it for a filing.
                  </span>`
                : ''}
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
      out.innerHTML = due
        ? html`
            <strong>${fmt(due)}</strong>
            <span class="calc__detail">
              ${obligation.hours} hours from ${anchor} &middot; ${obligation.authority}${isProvisional(
                jurisdiction
              )
                ? html` &middot; <span class="tag tag--provisional">provisional</span>`
                : ''}
            </span>
          `.toString()
        : /* No instrument names a period, so no date is shown. Putting
             one here — even a generous one — would be the confident
             wrong deadline this whole module exists to prevent. */
          html`
            <strong>Without delay</strong>
            <span class="calc__detail">
              ${obligation.authority} sets no fixed period. Notify by the quickest
              means available, then obtain the reporting window from the authority
              of the State of the operator and file within it.
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
          <li><a href="#voluntary">The voluntary reporting system</a></li>
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

        <section class="doc-section" id="voluntary">
          <h2>The voluntary reporting system</h2>
          <p>
            This product offers a confidential, voluntary report type. That is a
            category on a form. Regulation 13 of the
            ${VOLUNTARY_INSTRUMENT.replace(/^Civil Aviation/, 'Civil Aviation')} does not
            describe a category &mdash; it describes a system, and it says what that
            system must be and must define.
          </p>
          <p class="note">
            <b>${VOLUNTARY_PROTECTION.cite}</b>
            &ldquo;${VOLUNTARY_PROTECTION.text}&rdquo; That is a property your system
            must have, not a reassurance this product can give on your behalf.
          </p>
          <p>
            Regulation 13(3) requires the system to define six things. They are yours
            to state: an objective, a scope and a contacting manager are facts about
            your organisation, and a tool that filled them in would be inventing an
            answer and handing it to a regulator under your name. What this product
            does is quote the requirement and leave the answer where it belongs.
          </p>
          <ol>
            ${VOLUNTARY_REQUIREMENTS.map(
              (r) => html`<li>
                <strong>${r.cite}</strong> ${r.requirement}
                <span class="field-note">${r.question}</span>
                ${r.note ? html`<span class="field-note">${r.note}</span>` : ''}
              </li>`
            )}
          </ol>
          <p class="field-note">
            Recording your six answers is not built yet. <a href="/coverage">What this
            covers</a> says so, rather than letting this list imply that answering it
            is kept anywhere.
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
