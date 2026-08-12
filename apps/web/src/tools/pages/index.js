/* ============================================================
   One renderer for every prose page.

   About, Tutorials, Questions, Privacy and Terms are the same object
   with different content: a head, a contents list, and a run of
   sections. Five renderers would be five places a heading level or a
   contents link could go wrong; this is one, and the content beside it
   in content/pages.js is data.

   LAZY, all of it. A ramp agent filing a hazard report at a remote
   strip never opens the privacy notice, and every kilobyte in the
   entry chunk is charged to the screen they do open. These arrive when
   somebody asks for them.

   ON THIS PAGE, on anything with more than three sections. A long
   document without a contents list is a document people scroll past
   rather than read — the benchmark puts one on every page over about
   a thousand words, and the questions page is four times that.
   ============================================================ */

import { html, raw } from '../../shared/html.js';

function Head(page) {
  return html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">${page.eyebrow}</span>
        <h1>${page.title}</h1>
        <p class="lede">${page.lede}</p>
        ${page.stats
          ? html`<dl class="stat-strip">
              ${page.stats.map(
                (s) => html`<div class="stat">
                  <dt class="stat__value">${s.value}</dt>
                  <dd class="stat__label">${s.label}</dd>
                </div>`
              )}
            </dl>`
          : ''}
      </div>
    </section>
  `;
}

function Contents(page) {
  if (page.sections.length < 4) return '';
  return html`
    <nav class="toc" aria-labelledby="toc-title">
      <h2 class="section-title" id="toc-title">On this page</h2>
      <ol>
        ${page.sections.map(
          (s) => html`<li>
            <a href="#${s.id}">${s.title}</a>
            ${s.items ? html`<span class="toc__count">${s.items.length}</span>` : ''}
          </li>`
        )}
      </ol>
    </nav>
  `;
}

/* A question list is a run of <details>. Native disclosure rather than
   a scripted accordion: it is keyboard-operable, it is searchable by
   the browser's own find-in-page in current Chrome and Safari, and it
   prints expanded — which the print rule relies on, because a pack
   that omits half its answers is not a pack. */
function Questions(section) {
  return html`
    <div class="qa">
      ${section.items.map(
        (q) => html`<details class="qa__item">
          <summary><span>${q.q}</span></summary>
          <div class="qa__answer">${raw(q.a)}</div>
        </details>`
      )}
    </div>
  `;
}

function Steps(section) {
  return html`
    <ol class="numbered">
      ${section.items.map(
        (s) => html`<li class="numbered__item">
          <h3>${s.title}</h3>
          ${raw(s.body)}
          ${s.pitfall
            ? html`<p class="note"><b>The usual mistake</b>${raw(s.pitfall)}</p>`
            : ''}
        </li>`
      )}
    </ol>
  `;
}

function Section(section) {
  const body = section.items
    ? section.kind === 'steps'
      ? Steps(section)
      : Questions(section)
    : raw(section.body ?? '');

  return html`
    <section class="doc-section" id="${section.id}">
      <h2>${section.title}</h2>
      ${section.intro ? html`<p class="lede lede--tight">${section.intro}</p>` : ''}
      ${body}
    </section>
  `;
}

export function renderPage(outlet, page) {
  outlet.innerHTML = html`
    ${Head(page)}
    <div class="panel wrap doc">
      ${Contents(page)}
      <div class="doc__body">${page.sections.map(Section)}</div>
    </div>
  `.toString();
}
