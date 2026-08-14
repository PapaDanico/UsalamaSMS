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

/* A slug per question, so an answer has a URL.

   Derived from the question text rather than authored, because an
   authored id is one more thing to keep in step with the sentence above
   it — and a support reply that links to the wrong answer is worse than
   one that links to the page. */
function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/* A question list is a run of <details>. Native disclosure rather than
   a scripted accordion: it is keyboard-operable, it is searchable by
   the browser's own find-in-page in current Chrome and Safari, and it
   prints expanded — which the print rule relies on, because a pack
   that omits half its answers is not a pack. */
function Questions(section) {
  return html`
    <div class="qa-controls">
      <button type="button" class="btn btn-ghost btn-sm" data-qa="open">Expand all</button>
      <button type="button" class="btn btn-ghost btn-sm" data-qa="close">Collapse all</button>
    </div>
    <div class="qa">
      ${section.items.map(
        (q) => html`<details class="qa__item" id="q-${slug(q.q)}">
          <summary><span>${q.q}</span></summary>
          <div class="qa__answer">
            ${raw(q.a)}
            <a class="qa__link" href="#q-${slug(q.q)}">Link to this answer</a>
          </div>
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
      <div class="doc__body">
        ${page.sections.map(Section)}
        <!-- A compliance document that cannot be put in a binder or
             attached to an inspector's email is a document that gets
             retyped. The print stylesheet already drops the chrome and
             opens every disclosure; this is the affordance that says
             so. -->
        <p class="doc-actions no-print">
          <button type="button" class="btn btn-secondary btn-sm" id="print-page">
            Print or save as PDF
          </button>
        </p>
      </div>
    </div>
  `.toString();

  /* PRINT-ID: not an operator document.
     Every other printable screen stamps the operator's name on the page,
     because a risk register or a set of indicators handed to an auditor
     as loose paper has to be attributable. These pages are the opposite
     case: the methodology, the glossary, the tutorials, the privacy
     notice and the terms are THIS PRODUCT'S documents, not any
     customer's. Printing "Kabete Air Charter" above UsalamaSMS's own
     derivation of the Doc 9859 matrix would not be a missing
     attribution, it would be a false one — and a false attribution is
     the failure printId() refuses to commit in the other direction when
     it renders nothing rather than "UsalamaSMS operator".
     A claims gate reads this marker; deleting it fails the build. */
  outlet.querySelector('#print-page')?.addEventListener('click', () => window.print());

  /* Expand and collapse all, per question group. Two buttons rather
     than one toggle: a toggle whose label depends on state is a label
     somebody reads after they have already pressed it. */
  for (const button of outlet.querySelectorAll('[data-qa]')) {
    button.addEventListener('click', () => {
      const open = button.dataset.qa === 'open';
      const list = button.closest('.doc-section')?.querySelectorAll('.qa__item') ?? [];
      for (const item of list) item.open = open;
    });
  }

  /* A question linked to from elsewhere opens itself. Without this the
     browser scrolls to a closed disclosure and the reader sees the
     question they already clicked and none of the answer. */
  openFragmentTarget();
}

/* ONE listener, bound once at module scope.

   The first version registered it inside renderPage, so every visit to
   a document page added another — five pages navigated ten times left
   fifty listeners, each holding a closure over an outlet that had since
   been emptied. It worked, which is what makes that class of leak worth
   naming: nothing misbehaves until something does, and by then the
   cause is fifty frames away from the symptom.

   Bound at module scope it cannot accumulate, and this module is itself
   loaded lazily and only once. The handler reads the live document
   rather than a captured element, so it is correct on whichever screen
   happens to be rendered. */
window.addEventListener('hashchange', openFragmentTarget);

function openFragmentTarget() {
  const id = window.location.hash.replace(/^#/, '');
  if (!id) return;
  const target = document.getElementById(id);
  if (target instanceof HTMLDetailsElement) {
    target.open = true;
    target.scrollIntoView();
  }
}
