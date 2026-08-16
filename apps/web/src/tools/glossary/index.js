/* ============================================================
   The glossary — and the classification test a reporter actually gets
   wrong.

   WHAT THIS FIXES. packages/shared/src/glossary.ts holds 186 lines of
   safety-management vocabulary transcribed from the KCAA course
   glossary — sixty-odd acronyms, ten Annex 19 definitions, the three
   occurrence classes with their legal tests, and the seven thresholds
   that make an injury "serious". It was written for the de-identifier,
   which needs the acronyms so it does not scrub "the AOC holder" into
   "the [FLT] holder", and then nothing else ever read it.

   So the product held the vocabulary its users need and showed them
   none of it. A frontline reporter deciding between an accident and a
   serious incident is applying a legal test whether they know it or
   not, and the glossary's own sentence on the difference — "only in
   the result" — is the clearest thing in the document.

   Rendered from the module, not retyped. The de-identifier and this
   page read the same object, so a term added for one is available to
   the other, and neither can drift.

   LAZY. A reference page is not the first screen.
   ============================================================ */

/* A filter rather than a scroll. Sixty terms is four thousand pixels,
   and somebody arriving here arrived because they read one acronym in a
   report and wanted it expanded. Client-side and instant: there is
   nothing to fetch, the whole list is already on the page. */

import { html } from '../../shared/html.js';
import {
  SMS_ACRONYMS,
  OCCURRENCE_CLASSES,
  SERIOUS_INJURY_TESTS,
  DEFINITIONS,
  GLOSSARY_SOURCE
} from '../../../../../packages/shared/src/glossary.ts';

/* Grouped by initial letter. Sixty entries in one column is a list
   nobody scans; the same sixty under their letters is a list somebody
   can jump into. */
function byLetter(entries) {
  const groups = new Map();
  for (const [term, expansion] of entries) {
    const letter = term[0].toUpperCase();
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push([term, expansion]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function render(outlet) {
  const acronyms = Object.entries(SMS_ACRONYMS).sort(([a], [b]) => a.localeCompare(b));
  const groups = byLetter(acronyms);
  const definitions = Object.entries(DEFINITIONS);

  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Reference</span>
        <h1>The vocabulary, from the source</h1>
        <p class="lede">
          Transcribed rather than paraphrased, from the KCAA safety management
          course glossary and the ICAO Annex 19 and Doc 9859 definitions it
          adopts. The same list the de-identifier reads, so a term the product
          protects is a term it can also explain.
        </p>
        <dl class="stat-strip">
          <div class="stat">
            <dt class="stat__value">${acronyms.length}</dt>
            <dd class="stat__label">Abbreviations</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">${definitions.length}</dt>
            <dd class="stat__label">Annex 19 definitions</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">${OCCURRENCE_CLASSES.length}</dt>
            <dd class="stat__label">Occurrence classes</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">${GLOSSARY_SOURCE.reviewCycleMonths} mo</dt>
            <dd class="stat__label">Review cycle</dd>
          </div>
        </dl>
      </div>
    </section>

    <div class="panel wrap doc">
      <nav class="toc" aria-labelledby="toc-title">
        <h2 class="section-title" id="toc-title">On this page</h2>
        <ol>
          <li><a href="#classes">Accident, serious incident, incident</a></li>
          <li><a href="#injury">What makes an injury serious</a></li>
          <li><a href="#definitions">Annex 19 definitions</a></li>
          <li><a href="#acronyms">Abbreviations<span class="toc__count">${acronyms.length}</span></a></li>
        </ol>
      </nav>

      <div class="doc__body">
        <section class="doc-section" id="classes">
          <h2>Accident, serious incident, incident</h2>
          <p class="lede lede--tight">
            The distinction a reporter is most often asked to make, and the one
            the definitions are least intuitive about.
          </p>
          ${OCCURRENCE_CLASSES.map(
            (c) => html`<article class="card class-card">
              <div class="class-card__head">
                <h3>${c.label}</h3>
                <span class="badge" data-status="${c.reportable ? 'ALERT' : 'CAUTION'}">
                  <span class="badge__label"
                    >${c.reportable ? 'Reportable occurrence' : 'File it anyway'}</span
                  >
                </span>
              </div>
              <p>${c.test}</p>
              ${c.note ? html`<p class="note"><b>Note</b>${c.note}</p>` : ''}
            </article>`
          )}
        </section>

        <section class="doc-section" id="injury">
          <h2>What makes an injury serious</h2>
          <p class="lede lede--tight">
            A list of thresholds rather than a judgement — which matters,
            because "serious" is the word a reporter is most likely to apply by
            feel. Any one of these is enough.
          </p>
          <ul class="threshold-list">
            ${SERIOUS_INJURY_TESTS.map((t) => html`<li>${t}</li>`)}
          </ul>
        </section>

        <section class="doc-section" id="definitions">
          <h2>Annex 19 definitions</h2>
          <dl class="deflist">
            ${definitions.map(
              ([term, meaning]) => html`<div class="deflist__row">
                <dt>${term}</dt>
                <dd>${meaning}</dd>
              </div>`
            )}
          </dl>
        </section>

        <section class="doc-section" id="acronyms">
          <h2>Abbreviations</h2>
          <div class="field filter-field">
            <label class="field-label" for="glossary-filter">Filter</label>
            <input
              class="input-field"
              type="search"
              id="glossary-filter"
              placeholder="AOC, SPI, safety performance…"
              autocapitalize="characters"
              autocomplete="off"
              spellcheck="false"
            />
            <p class="field-hint" id="glossary-count" role="status" aria-live="polite"></p>
          </div>
          <p class="lede lede--tight">
            These are the tokens the de-identifier is told to leave alone. Each
            of them looks like the prefix of a flight number, and a redactor
            that turned "the AOC holder" into "the [FLT] holder" would have
            destroyed the sentence it was protecting.
          </p>
          ${groups.map(
            ([letter, entries]) => html`<div class="alpha">
              <h3 class="alpha__letter" aria-hidden="true">${letter}</h3>
              <dl class="deflist deflist--tight">
                ${entries.map(
                  ([term, expansion]) => html`<div class="deflist__row">
                    <dt>${term}</dt>
                    <dd>${expansion}</dd>
                  </div>`
                )}
              </dl>
            </div>`
          )}
          <p class="empty-state" id="glossary-empty" hidden>
            <span>No abbreviation matches that. The list is what the
            de-identifier is told to leave alone, so a term missing here is a
            term the redactor would treat as a flight number.</span>
          </p>

          <p class="footnote">
            Source: ${GLOSSARY_SOURCE.instrument}. Transcribed
            ${GLOSSARY_SOURCE.transcribedOn}; definitions move with Annex
            amendments, and Amendment 2 becomes applicable
            <time datetime="2026-11-26">26 November 2026</time>.
          </p>
        </section>
      </div>
    </div>
  `.toString();

  bindFilter(outlet, acronyms.length);
}

/* Filtering hides rows rather than re-rendering the list. Re-rendering
   would lose the caret on every keystroke, and it would rebuild sixty
   DOM nodes to answer a question about a substring. */
function bindFilter(outlet, total) {
  const input = outlet.querySelector('#glossary-filter');
  const count = outlet.querySelector('#glossary-count');
  const empty = outlet.querySelector('#glossary-empty');
  if (!input) return;

  const rows = [...outlet.querySelectorAll('#acronyms .deflist__row')].map((row) => ({
    row,
    // The expansion as well as the term. Somebody who half-remembers
    // "the performance indicator one" should find SPI.
    haystack: (row.textContent ?? '').toLowerCase()
  }));
  const groups = [...outlet.querySelectorAll('#acronyms .alpha')];

  const apply = () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    for (const { row, haystack } of rows) {
      const hit = !q || haystack.includes(q);
      row.hidden = !hit;
      if (hit) shown++;
    }
    // A letter heading with nothing under it is worse than no heading.
    for (const group of groups) {
      group.hidden = !group.querySelector('.deflist__row:not([hidden])');
    }
    empty.hidden = shown > 0;
    count.textContent = q
      ? `${shown} of ${total} abbreviations`
      : `${total} abbreviations, A to Z`;
  };

  input.addEventListener('input', apply);
  apply();
}
