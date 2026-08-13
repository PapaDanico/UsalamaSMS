/* ============================================================
   Coverage — element by element, computed.

   WHY THIS PAGE EXISTS. An independent review found the product
   claiming to be a safety management system while covering one and a
   half of Annex 19's twelve elements, and rated the resulting risk
   Critical: an operator using it as its sole SMS would fail an audit
   believing it was covered. The review's own first recommendation was
   to publish which elements are implemented, which are planned, and
   which are out of scope.

   That review also could not see the source, and got six findings
   wrong as a result — it reported no risk matrix, no de-identification
   pipeline, no RBAC, no privacy notice, and accessibility unassessed,
   all of which exist. The answer to being audited from the outside is
   not to argue. It is to publish the inside.

   So: every element, its state, what exists, what does not, and a link
   where there is one. The counts are derived from COVERAGE rather than
   typed — charter rule 10 — and a test asserts the arithmetic produces
   the same figure the About page states in prose. If they ever
   disagree, one of them is telling an operator something false about
   its regulatory position.
   ============================================================ */

import { html } from '../../shared/html.js';
import {
  SMS_COMPONENTS,
  COVERAGE,
  coverageSummary,
  MATURITY_SOURCE
} from '../../../../../packages/shared/src/maturity.ts';

const STATE = {
  BUILT: { label: 'Built', status: 'SAFE', note: 'A person can do this work here today.' },
  PARTIAL: { label: 'Partial', status: 'CAUTION', note: 'Part of it works; the rest is named.' },
  ASSESSED_ONLY: {
    label: 'Assessed only',
    status: 'OFFLINE',
    note: 'It can tell you where you stand. It cannot do the work.'
  },
  NOT_BUILT: { label: 'Not built', status: 'ALERT', note: 'You need this elsewhere.' }
};

const byId = new Map(COVERAGE.map((c) => [c.id, c]));

export function render(outlet) {
  const summary = coverageSummary();

  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Coverage</span>
        <h1>What this covers, and what it does not</h1>
        <p class="lede">
          ICAO Annex 19 defines a safety management system as four components and
          twelve elements. This is every one of them, with what exists here, what
          does not, and where to go instead. The figures below are computed from
          the same declaration the table is drawn from.
        </p>
        <dl class="stat-strip">
          <div class="stat">
            <dt class="stat__value">${summary.elementsCovered}</dt>
            <dd class="stat__label">Elements covered, of ${summary.total}</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">${summary.built}</dt>
            <dd class="stat__label">Built</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">${summary.partial}</dt>
            <dd class="stat__label">Partial</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">${summary.assessedOnly + summary.notBuilt}</dt>
            <dd class="stat__label">Assessed only, or not built</dd>
          </div>
        </dl>
      </div>
    </section>

    <div class="panel wrap doc">
      <nav class="toc" aria-labelledby="toc-title">
        <h2 class="section-title" id="toc-title">On this page</h2>
        <ol>
          ${SMS_COMPONENTS.map(
            (c) => html`<li><a href="#c-${c.id}">${c.id}. ${c.name}</a></li>`
          )}
          <li><a href="#howcounted">How this is counted</a></li>
        </ol>
      </nav>

      <div class="doc__body">
        <section class="doc-section">
          <h2>Read this before adopting it</h2>
          <p class="note">
            <b>This is not a complete SMS</b>
            An operator using it as its sole safety management system would not
            satisfy Annex 19, and would not pass an audit that asked for the other
            elements. It is the reporting and risk-classification layer. Everything
            it does not do is listed below by name rather than omitted.
          </p>
          <p>
            <strong>The twelve are not our list.</strong> They are the Second Schedule to
            Kenya&rsquo;s Civil Aviation (Safety Management) Regulations, 2025
            (L.N. 32 of 2026), which prescribes &ldquo;four components and twelve elements
            as the minimum requirements for SMS implementation&rdquo; &mdash; the same
            framework as ICAO Annex 19, and for a Kenyan operator the actual legal
            obligation rather than a standard adopted somewhere above them. Every element
            below carries the Schedule&rsquo;s own id and its own words; a test holds them
            against it so a paraphrase cannot quietly move the measure.
          </p>
        </section>

        ${SMS_COMPONENTS.map(
          (component) => html`<section class="doc-section" id="c-${component.id}">
            <h2>${component.id}. ${component.name}</h2>
            <p class="lede lede--tight">${component.purpose}</p>

            ${component.elements.map((element) => {
              const c = byId.get(element.id);
              const state = STATE[c.state];
              return html`<article class="card cov">
                <div class="cov__head">
                  <h3>
                    <span class="mat-element__id">${element.id}</span> ${element.name}
                  </h3>
                  <span class="badge" data-status="${state.status}">
                    <span class="badge__label">${state.label}</span>
                  </span>
                </div>
                ${c.has
                  ? html`<p class="cov__has"><strong>Here:</strong> ${c.has}</p>`
                  : ''}
                <p class="cov__missing"><strong>Not here:</strong> ${c.missing}</p>
                ${c.href
                  ? html`<p class="cov__go"><a href="${c.href}">Open it</a></p>`
                  : ''}
              </article>`;
            })}
          </section>`
        )}

        <section class="doc-section" id="howcounted">
          <h2>How this is counted</h2>
          <p>
            <strong>Built</strong> counts one. <strong>Partial</strong> counts a
            half. <strong>Assessed only</strong> and <strong>not built</strong>
            count nothing — because being able to measure an element is not
            covering it, and treating the two as the same is exactly the overclaim
            this page exists to prevent.
          </p>
          <p>
            That arithmetic produced <strong>${summary.elementsCovered} of
            ${summary.total}</strong>, and it is derived from the same declaration
            the table above is drawn from. A test asserts the figure matches the
            sentence stated on the <a href="/about#notyet">About page</a>; if they
            disagree the build fails, because one of them would be telling an
            operator something false about its regulatory position.
          </p>
          <p class="footnote">
            The element names are ${MATURITY_SOURCE.provisional
              ? 'compiled from secondary sources pending a reading of Doc 9859 fourth edition, and are marked provisional wherever they appear'
              : 'read against the primary document'}. The four components are
            Annex 19's own. See the
            <a href="/toolkits/maturity">maturity assessment</a> to find where your
            own operation stands on all twelve — including the elements no software
            can stand in for.
          </p>
        </section>
      </div>
    </div>
  `.toString();
}
