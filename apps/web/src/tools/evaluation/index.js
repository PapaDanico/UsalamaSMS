/* ============================================================
   THE SMS EVALUATION SELF-ASSESSMENT.

   A regulator running an SMS evaluation arrives with a list of criteria
   and asks, for each one, to be shown something. This screen walks the
   same list before the visit, so the operator finds the answers they
   cannot give while there is still time to do something about it.

   -------------------------------------------------------------
   WHAT THIS REPLACED, because the rewrite is most of the work here.

   The first version was one unbroken run of 48 forms built by string
   concatenation, with a hand-rolled `esc()` and none of the product's
   own markup. Three things were wrong with it and all three showed up
   the moment somebody tried to USE it rather than read it:

     · NO SENSE OF PLACE. Forty-eight identical cards, no grouping, no
       count, no way back to the top. An assessor three hours in could
       not tell how much was left, and the tool is numbered in seven
       sections precisely so that nobody has to hold it in their head.
     · NO PROGRESS. The one question an assessor asks between sessions
       — what have I still not answered? — had no answer on the screen,
       so the only way to find out was to scroll all of it.
     · IT DID NOT LOOK LIKE THE PRODUCT. Bare <label> and <input>, no
       .field, no .btn, no card; so the screen a safety manager reaches
       for under audit pressure was the one that looked least finished.

   And it could not be PRINTED, which for a self-assessment is most of
   the point: the artefact is what you hand the auditor, or bring to
   the meeting where somebody asks how the SMS is doing.

   -------------------------------------------------------------
   EVIDENCE BEFORE RATING, and that rule is the product's opinion.

   The route refuses a level without evidence, source references, an
   accountable post and a review date. `evaluationProgress` counts the
   same way, so the figure at the top is the number of criteria that
   would survive being asked "show me" — never the number of dropdowns
   somebody has touched.

   A tool that let you rate 48 criteria EFFECTIVE in four minutes would
   be worse than no tool, because it would produce a document that
   looks like assurance.

   -------------------------------------------------------------
   `event.currentTarget` IS READ BEFORE THE AWAIT. It is valid only
   while the event is dispatching, and this screen shipped with a read
   after it — which made every save silent in both directions. The
   element is captured into `form` first; `check:wiring` fails the
   build if that regresses.
   ============================================================ */

import { html } from '../../shared/html.js';
import { authFetch, isSignedIn } from '../../shared/session.js';
import { attachPrintId } from '../../shared/print-id.js';
import {
  EVALUATION_INSTRUMENT,
  EVALUATION_LEVELS,
  EVALUATION_LEVEL_MEANING,
  EVALUATION_PHASE,
  EVALUATION_SECTIONS,
  EVALUATION_VERIFIED_AGAINST_PRIMARY,
  evaluationProgress
} from '../../../../../packages/shared/src/evaluation.ts';

/* WHAT THIS IS AND IS NOT, in one place because it is said on both
   views and must not drift between them. A self-assessment that lets
   somebody believe they hold a regulator's verdict is the one failure
   this screen cannot ship. */
const Boundary = () => html`
  <p class="note">
    <strong>What this is.</strong> Your own assessment against the criteria in the
    ${EVALUATION_INSTRUMENT.authority}'s ${EVALUATION_INSTRUMENT.title}
    (${EVALUATION_INSTRUMENT.reference} ${EVALUATION_INSTRUMENT.version}). It is
    <strong>not</strong> that tool, not a regulator's assessment, and it determines
    nothing about conformance. Your authority reaches its own view.
    ${EVALUATION_VERIFIED_AGAINST_PRIMARY
      ? ''
      : html`<br /><strong>Provenance:</strong> the criterion list here has not been
          reconciled against ${EVALUATION_INSTRUMENT.reference} itself. Check any
          reference number against the published tool before you quote it to
          anybody.`}
  </p>
`;

/* THE FOUR LEVELS, EXPLAINED ONCE.

   These were rendered inside every criterion's help text, which put the
   same four sentences on the screen 48 times and, worse, 48 times into
   the PRINTED pack — pages of definition wrapped around the evidence
   somebody actually wants to read.

   Once, at the top, where it reads as a key and prints as one. */
const Levels = () => html`
  <details class="ev-section card" id="ev-levels">
    <summary>
      <span>How the four levels are decided</span>
      <span class="hint">read this before the first rating</span>
    </summary>
    <dl class="deflist">
      ${EVALUATION_LEVELS.map(
        (value) => html`
          <div class="deflist__row">
            <dt>${title(value)} <span class="hint">phase ${EVALUATION_PHASE[value]}</span></dt>
            <dd>${EVALUATION_LEVEL_MEANING[value]}</dd>
          </div>
        `
      )}
    </dl>
    <p class="hint">
      A first evaluation asks the phase 1 questions — is it there, and does it fit an
      operation your size. Phase 2 follows about a year into operating and asks
      whether people are doing it and whether it is working.
    </p>
  </details>
`;

export async function render(outlet) {
  if (!isSignedIn()) {
    outlet.innerHTML = html`
      <section class="panel wrap">
        <header class="page-head">
          <span class="eyebrow">Assurance</span>
          <h1>SMS evaluation self-assessment</h1>
          <p class="lede">
            Walk the criteria a regulator evaluates an SMS against, and record what
            you would show for each one. Sign in with a safety-management role to
            start.
          </p>
        </header>
        ${Boundary()}
        <p class="mat-actions">
          <a class="btn btn-primary" href="/account">Sign in</a>
          <a class="btn btn-ghost" href="/report">File a safety report</a>
        </p>
      </section>
    `.toString();
    return;
  }

  const requestedId = new URLSearchParams(window.location.search).get('id');
  if (requestedId) return renderAssessment(outlet, requestedId);
  return renderIndex(outlet);
}

/* ---------------------------- the index ---------------------------- */

async function renderIndex(outlet) {
  outlet.innerHTML = html`
    <section class="panel wrap">
      <header class="page-head">
        <span class="eyebrow">Assurance</span>
        <h1>SMS evaluation self-assessment</h1>
        <p class="lede">
          ${EVALUATION_SECTIONS.reduce((n, s) => n + s.criteria.length, 0)} criteria in
          ${EVALUATION_SECTIONS.length} sections. A rating is only recorded with the
          evidence behind it — what you would show, where it is written down, whose
          post owns it, and when it is next looked at.
        </p>
      </header>

      ${Boundary()}

      <div class="card">
        <h2 class="section-title">Start an assessment</h2>
        <form id="ev-create">
          <label class="field">
            <span class="field-label">What this assessment is called *</span>
            <input class="input-field" name="title" required maxlength="200"
                   placeholder="Oversight readiness review, 2026" />
          </label>
          <label class="field">
            <span class="field-label">Scope *</span>
            <textarea class="input-field" name="scope" required minlength="10" maxlength="6000"
                      rows="3"
                      placeholder="Which approvals, operations and bases this covers, and the period assessed."></textarea>
            <span class="field-hint">
              An assessment with no stated boundary is one nobody can read later. Name
              what it covers and, if it matters, what it does not.
            </span>
          </label>
          <label class="field">
            <span class="field-label">Assessment date *</span>
            <input class="input-field" type="date" name="assessedOn" required />
          </label>
          <p class="mat-actions">
            <button type="submit" class="btn btn-primary">Create assessment</button>
          </p>
          <p class="hint" id="ev-create-status" role="status"></p>
        </form>
      </div>

      <div id="ev-list" aria-live="polite"></div>
    </section>
  `.toString();

  outlet.querySelector('[name=assessedOn]').value = new Date().toISOString().slice(0, 10);

  const list = outlet.querySelector('#ev-list');
  try {
    const response = await authFetch('/api/v1/seti');
    if (!response.ok) throw new Error('unavailable');
    const { assessments } = await response.json();
    list.innerHTML = assessments.length
      ? html`
          <h2 class="section-title">Assessments held</h2>
          <ul class="account-grid" role="list">
            ${assessments.map(
              (a) => html`<li class="card">
                <h3><a href="/evaluation?id=${a.id}">${a.title}</a></h3>
                <p class="hint">
                  Assessed ${new Date(a.assessedOn).toLocaleDateString()}${a._count
                    ? html` · ${a._count.items} criteria in the ledger`
                    : ''}
                </p>
              </li>`
            )}
          </ul>
        `.toString()
      : /* THE ZERO-STATE SAYS WHERE THE FIRST RECORD IS MADE, and on
           this screen that is the form directly above it rather than
           another route. `check:empty-states` holds the declaration. */
        html`<p class="empty-state">
          No assessment yet. The form above starts one — it creates all
          ${EVALUATION_SECTIONS.reduce((n, s) => n + s.criteria.length, 0)} criteria
          empty, and you fill them in over as many sittings as it takes.
        </p>`.toString();
  } catch {
    list.innerHTML = html`<p class="empty-state">
      The assessment ledger could not be read. Check your connection — and that your
      role includes conducting or verifying an SMS audit.
    </p>`.toString();
  }

  const status = outlet.querySelector('#ev-create-status');
  outlet.querySelector('#ev-create').addEventListener('submit', async (event) => {
    event.preventDefault();
    /* CAPTURED BEFORE THE AWAIT. See the header. */
    const form = event.currentTarget;
    status.textContent = 'Creating…';
    const body = Object.fromEntries(new FormData(form));
    const response = await authFetch('/api/v1/seti', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      status.textContent =
        'That was not accepted. Check the required fields, and that your role may conduct an assessment.';
      return;
    }
    const { assessment } = await response.json();
    window.location.assign(`/evaluation?id=${encodeURIComponent(assessment.id)}`);
  });
}

/* ------------------------- one assessment -------------------------- */

async function renderAssessment(outlet, id) {
  const response = await authFetch(`/api/v1/seti/${encodeURIComponent(id)}`);
  if (!response.ok) {
    outlet.innerHTML = html`
      <section class="panel wrap">
        <h1>SMS evaluation self-assessment</h1>
        <p class="empty-state">
          This assessment is unavailable. It may belong to another operator, or your
          role may not include conducting one.
          <a href="/evaluation">Back to assessments</a>
        </p>
      </section>
    `.toString();
    return;
  }

  const { assessment } = await response.json();
  const byId = new Map(assessment.items.map((item) => [item.criterionId, item]));

  outlet.innerHTML = html`
    <section class="panel wrap" data-assessment="${assessment.id}">
      <div class="print-id-slot"></div>

      <p class="no-print"><a href="/evaluation">Back to assessments</a></p>

      <header class="page-head">
        <span class="eyebrow">SMS evaluation self-assessment</span>
        <h1>${assessment.title}</h1>
        <p class="lede">${assessment.scope}</p>
        <p class="hint">
          Assessed ${new Date(assessment.assessedOn).toLocaleDateString()} by
          ${assessment.assessor.name}.
        </p>
      </header>

      ${Boundary()}

      <dl class="stat-strip" id="ev-progress"></dl>

      ${Levels()}

      <nav class="toc no-print" aria-labelledby="ev-toc-title">
        <h2 class="section-title" id="ev-toc-title">The sections</h2>
        <ol>
          ${EVALUATION_SECTIONS.map(
            (s) => html`<li>
              <a href="#ev-${slug(s.section)}">${s.section}</a>
              <span class="toc__count" data-done-for="${slug(s.section)}"></span>
            </li>`
          )}
        </ol>
      </nav>

      <p class="mat-actions no-print">
        <button type="button" class="btn btn-secondary btn-sm" id="ev-print">
          Print or save as PDF
        </button>
        <button type="button" class="btn btn-ghost btn-sm" id="ev-toggle-open">
          Expand all
        </button>
      </p>

      ${EVALUATION_SECTIONS.map((group) => Section(group, byId))}
    </section>
  `.toString();

  paintProgress(outlet, byId);

  /* THE OPERATOR'S MARK. This is a handover document — it goes to an
     auditor, a board or the regulator's inspector — and a pack of loose
     pages with no operator name on it is a pack nobody can attribute. */
  void attachPrintId(outlet, 'SMS evaluation self-assessment');

  outlet.querySelector('#ev-print').addEventListener('click', () => window.print());

  const toggle = outlet.querySelector('#ev-toggle-open');
  toggle.addEventListener('click', () => {
    const open = toggle.textContent.trim() === 'Expand all';
    for (const d of outlet.querySelectorAll('details.ev-section')) d.open = open;
    toggle.textContent = open ? 'Collapse all' : 'Expand all';
  });

  for (const form of outlet.querySelectorAll('.ev-item')) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      /* CAPTURED BEFORE THE AWAIT — the defect this screen shipped
         with, and the one check:wiring guards. */
      const el = event.currentTarget;
      const criterionId = el.dataset.criterion;
      const note = el.querySelector('.ev-status');
      const body = Object.fromEntries(new FormData(el));

      note.dataset.state = 'pending';
      note.textContent = 'Saving…';

      const saved = await authFetch(
        `/api/v1/seti/${encodeURIComponent(id)}/items/${encodeURIComponent(criterionId)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      note.dataset.state = saved.ok ? 'ok' : 'error';
      note.textContent = saved.ok
        ? 'Saved'
        : 'Not saved — a rating needs evidence, a source, an accountable post and a review date.';

      if (saved.ok) {
        /* THE FIGURE AT THE TOP MOVES. An assessor who saves a
           criterion and sees no change in the count has been given no
           reason to believe the save landed — which is the same
           silence this screen already shipped once. */
        byId.set(criterionId, { criterionId, ...body });
        el.closest('article')?.setAttribute('data-rated', 'yes');
        paintProgress(outlet, byId);
      }
    });
  }
}

function Section(group, byId) {
  const done = group.criteria.filter((c) => isRated(byId.get(c.id))).length;
  return html`
    <details class="ev-section card" id="ev-${slug(group.section)}"
             ${done < group.criteria.length ? 'open' : ''}>
      <summary>
        <span>${group.section}</span>
        <span class="hint">${done} of ${group.criteria.length} evidenced</span>
      </summary>
      ${group.criteria.map((criterion) => Criterion(criterion, byId.get(criterion.id)))}
    </details>
  `;
}

function Criterion(criterion, item = {}) {
  const level = item.level ?? '';
  return html`
    <article class="rec" data-rated="${isRated(item) ? 'yes' : 'no'}">
      <h3>${criterion.id} — ${criterion.title}</h3>

      <form class="ev-item" data-criterion="${criterion.id}">
        <label class="field">
          <span class="field-label">Where this has got to *</span>
          <select class="input-field" name="level" required>
            <option value="">Not assessed</option>
            ${EVALUATION_LEVELS.map(
              (value) => html`<option value="${value}" ${value === level ? 'selected' : ''}>
                ${title(value)} — phase ${EVALUATION_PHASE[value]}
              </option>`
            )}
          </select>
          <span class="field-hint">What each level means is set out once, above.</span>
        </label>

        <label class="field">
          <span class="field-label">What you would show *</span>
          <textarea class="input-field" name="evidence" required minlength="10" rows="3"
                    placeholder="The thing itself — a committee's minutes, a signed policy, a trend somebody acted on.">${item.evidence ?? ''}</textarea>
        </label>

        <label class="field">
          <span class="field-label">Where it is written down *</span>
          <textarea class="input-field" name="sourceRefs" required minlength="3" rows="2"
                    placeholder="Document name, revision, page and paragraph.">${item.sourceRefs ?? ''}</textarea>
          <span class="field-hint">
            An assessor's next words after "is it present?" are "show me". A reference
            nobody can follow is the finding, not the evidence.
          </span>
        </label>

        <label class="field">
          <span class="field-label">Accountable post *</span>
          <input class="input-field" name="ownerPost" required value="${item.ownerPost ?? ''}"
                 placeholder="Safety Manager" />
          <span class="field-hint">The post, not the person — people move.</span>
        </label>

        <label class="field">
          <span class="field-label">Review due *</span>
          <input class="input-field" type="date" name="reviewDueOn" required
                 value="${item.reviewDueOn ? String(item.reviewDueOn).slice(0, 10) : ''}" />
        </label>

        <label class="field">
          <span class="field-label">Assessor notes</span>
          <textarea class="input-field" name="assessorNotes" rows="2"
                    placeholder="What is weak, what you would not want asked about.">${item.assessorNotes ?? ''}</textarea>
        </label>

        <p class="mat-actions">
          <button type="submit" class="btn btn-secondary btn-sm">Save criterion</button>
          <output class="ev-status hint"></output>
        </p>
      </form>
    </article>
  `;
}

/* The same rule the route enforces and `evaluationProgress` counts by:
   a level on its own is not an answer. */
function isRated(item) {
  return Boolean(
    item &&
      item.level &&
      item.evidence &&
      item.sourceRefs &&
      item.ownerPost &&
      item.reviewDueOn
  );
}

function paintProgress(outlet, byId) {
  const items = [...byId.values()];
  const { total, rated, remaining } = evaluationProgress(items);
  const phase = (n) =>
    items.filter((i) => isRated(i) && EVALUATION_PHASE[i.level] === n).length;

  outlet.querySelector('#ev-progress').innerHTML = html`
    <div class="stat">
      <dt class="stat__value">${rated} of ${total}</dt>
      <dd class="stat__label">Criteria with evidence behind them</dd>
    </div>
    <div class="stat">
      <dt class="stat__value">${remaining}</dt>
      <dd class="stat__label">Still to answer</dd>
    </div>
    <div class="stat">
      <dt class="stat__value">${phase(1)}</dt>
      <dd class="stat__label">Rated present or suitable — phase 1</dd>
    </div>
    <div class="stat">
      <dt class="stat__value">${phase(2)}</dt>
      <dd class="stat__label">Rated operating or effective — phase 2</dd>
    </div>
  `.toString();

  for (const group of EVALUATION_SECTIONS) {
    const done = group.criteria.filter((c) => isRated(byId.get(c.id))).length;
    const badge = outlet.querySelector(`[data-done-for="${slug(group.section)}"]`);
    if (badge) badge.textContent = `${done}/${group.criteria.length}`;
    const summary = outlet.querySelector(`#ev-${slug(group.section)} summary .hint`);
    if (summary) summary.textContent = `${done} of ${group.criteria.length} evidenced`;
  }
}

const slug = (text) =>
  String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const title = (value) => value.charAt(0) + value.slice(1).toLowerCase();
