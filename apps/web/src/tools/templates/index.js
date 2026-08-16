/* ============================================================
   Templates and source documents.

   THE PROBLEM THIS PAGE IS FOR. A small operator's obstacle is rarely
   that it disagrees with Annex 19. It is that twelve elements is an
   enormous blank page, and the published templates that would fill it
   sit across three authorities' sites in formats nobody links
   together. This is the index nobody publishes.

   IT LINKS, IT DOES NOT HOST, and the reasoning is in templates.ts
   rather than restated here.

   THE FIRST THING ON THE PAGE IS THE JURISDICTION WARNING, above the
   list rather than under it. Australian templates are excellent
   structure and they are not Kenyan law. An operator who cites CASA
   guidance to a KCAA inspector as the requirement has made the same
   class of mistake this product exists to correct — a confident wrong
   answer, delivered by a tool that looked authoritative.

   IT BORROWS /coverage's VOCABULARY RATHER THAN INVENTING ITS OWN.
   That page says, per element, what is here and what is not; this one
   says the same thing per document. `cov__has` and `cov__missing` are
   already exactly those two statements, so a second set of classes
   meaning the same thing would be two places for the styling to drift
   and one more thing for the CSS gate to hold. Same argument as the
   severity scale living once beside the matrix that scores it.
   ============================================================ */

import { html } from '../../shared/html.js';
import { TEMPLATES, elementsWithTemplate } from '../../../../../packages/shared/src/templates.ts';
/* THE AUTHORITY'S OWN GUIDANCE, kept in its own module and rendered in
   its own section. templates.ts opens by saying its contents are not
   Kenyan law, which was honest and was the best shelf available; these
   nine are the shelf that makes that caveat unnecessary. Filing them
   together would flatten the distinction between a template an
   operator may copy and a circular an operator is measured against. */
/* THE CIRCULAR TABLE'S SCROLL CONTAINER CARRIES tabindex AND A NAME,
   and the other tables on this site do not need either. Theirs contain
   links, so a keyboard already reaches inside and scrolls them. This
   one is entirely text, which makes it a region a mouse can scroll and
   a keyboard cannot — axe reports scrollable-region-focusable, and it
   is right rather than pedantic: the reader most likely to be working
   through a regulator's index by keyboard is the one who cannot use a
   trackpad to drag it sideways.

   Written here rather than beside the markup because an HTML comment
   inside a tagged template literal is string content: no minifier
   removes it and every reporter downloads it. CLAUDE.md records three
   separate occasions that cost this repository real bytes. */
import { CIRCULARS, CIRCULARS_CAVEAT } from '../../../../../packages/shared/src/circulars.ts';
import { SMS_ELEMENTS } from '../../../../../packages/shared/src/maturity.ts';

const ELEMENT_IDS = SMS_ELEMENTS.map((e) => e.id);
const COVERED = elementsWithTemplate(ELEMENT_IDS);

/** What an entry serves, short enough to sit in the heading pill. */
function scope(template) {
  if (template.elements === 'ALL') return 'All twelve';
  return template.elements.join(', ');
}

export function render(outlet) {
  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Reference</span>
        <h1>Templates and source documents</h1>
        <p class="lede">
          The published artefacts an operator can build an SMS from — what each one is
          for, what this product already holds against it, and what you still have to go
          and get.
        </p>
        <dl class="stat-strip">
          <div class="stat">
            <dt class="stat__value">${TEMPLATES.length}</dt>
            <dd class="stat__label">Documents indexed</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">${COVERED.length} of ${ELEMENT_IDS.length}</dt>
            <dd class="stat__label">Elements with a template behind them</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">${CIRCULARS.length}</dt>
            <dd class="stat__label">KCAA circulars read</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">0</dt>
            <dd class="stat__label">Copies held here, deliberately</dd>
          </div>
        </dl>
      </div>
    </section>

    <div class="panel wrap doc">
      <nav class="toc" aria-labelledby="toc-title">
        <h2 class="section-title" id="toc-title">On this page</h2>
        <ol>
          <li><a href="#first">Read this first</a></li>
          <li><a href="#circulars">The Authority's Advisory Circulars</a></li>
          ${TEMPLATES.map((t) => html`<li><a href="#${t.id}">${t.title}</a></li>`)}
        </ol>
      </nav>

      <div class="doc__body">
        <section class="doc-section" id="first">
          <h2>Read this first</h2>
          <!-- Above the list, not under it. -->
          <p class="note">
            <b>These are Australian documents, and they are not Kenyan law</b>
            CASA publishes the best free SMS material any authority has produced, and its
            structure is worth copying. But a Kenyan operator is governed by the Civil
            Aviation (Safety Management) Regulations and answers to KCAA. Use these to
            build; do not cite one to an inspector as the requirement. Where a figure
            differs between a template here and your own regulator, your regulator is
            right.
          </p>
          <p>
            Nothing below is stored here. Every link goes to the publisher's own copy,
            because a template mirrored here is a template that goes stale here and the
            reader has no way to tell which. That is the same reason this product computes
            deadlines rather than storing them &mdash; the
            <a href="/#deadlines">regulatory basis</a> names the instrument
            behind each one and when it was last read.
          </p>
        </section>

        <section class="doc-section" id="circulars">
          <h2>The Authority's Advisory Circulars</h2>
          <p class="hint">${CIRCULARS_CAVEAT}</p>
          <div class="table-scroll" tabindex="0" role="region"
               aria-label="KCAA Advisory Circulars">
          <table>
            <caption class="visually-hidden">
              KCAA Advisory Circulars, their reference and issue date, the Annex 19
              elements they bear on, what this product holds against each, and what
              remains the operator's own work.
            </caption>
            <thead>
              <tr>
                <th scope="col">Circular</th>
                <th scope="col">Elements</th>
                <th scope="col">What we hold</th>
                <th scope="col">What is still yours</th>
              </tr>
            </thead>
            <tbody>
              ${CIRCULARS.map(
                (c) => html`<tr>
                  <th scope="row">
                    <span class="tag">${c.reference}</span>
                    <span class="cell-none">${c.title}</span>
                    <span class="cell-none">
                      Issued ${new Date(c.issued).toLocaleDateString('en-GB', {
                        month: 'long',
                        year: 'numeric'
                      })}${c.issuedDateDisputed ? ' \u00b7 date disputed on the document itself' : ''}
                    </span>
                  </th>
                  <td>${c.elements === 'ALL' ? 'All twelve' : c.elements.join(', ')}</td>
                  <td>${c.weHold}</td>
                  <td>${c.youStillNeed}</td>
                </tr>`
              )}
            </tbody>
          </table>
          </div>
        </section>

        <section class="doc-section">
          <h2>Templates from other authorities</h2>
          ${TEMPLATES.map(
            (template) => html`<article class="card cov" id="${template.id}">
              <div class="cov__head">
                <h3>
                  <span class="mat-element__id">${scope(template)}</span> ${template.title}
                </h3>
              </div>
              <p class="lede lede--tight">${template.purpose}</p>
              <p class="cov__has"><strong>Already here:</strong> ${template.weHold}</p>
              <p class="cov__missing">
                <strong>Still yours to do:</strong> ${template.youStillNeed}
              </p>
              <p class="cov__go">
                ${template.publisher} &middot; ${template.reference} &mdash;
                <a href="${template.url}" rel="noopener noreferrer" target="_blank"
                  >open it at the publisher</a
                >
              </p>
            </article>`
          )}
        </section>

        <section class="doc-section">
          <h2>Where this product does the work for you</h2>
          <p>
            Where a template asks something this product can answer from what you have
            already told it, it does. The
            <a href="/toolkits/maturity">maturity assessment</a> produces the gap analysis
            and the implementation plan &mdash; owners, dates, resources and phases
            &mdash; rather than asking you to fill the same table in twice.
            <a href="/coverage">What this covers</a> states, element by element, exactly
            where that stops.
          </p>
        </section>
      </div>
    </div>
  `.toString();
}
