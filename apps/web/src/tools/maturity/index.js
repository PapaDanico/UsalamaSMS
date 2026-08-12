/* ============================================================
   The SMS maturity assessment.

   The benchmark's Health Scorecard, applied to this product's domain:
   twelve questions against the ICAO SMS framework, scored on a
   five-point maturity scale, producing a position an operator can
   state and a work list it can act on.

   WHAT IS DIFFERENT FROM THE BENCHMARK'S, deliberately. JK weights its
   eight domains from a decade of engagement history and converts the
   result to a 0-100 Health Index. This does neither, because this
   product does not have that history — and borrowing the SHAPE of an
   authority without the thing that earned it is the failure the whole
   charter is written against. So: means per component, no weights, no
   invented headline number, and the gaps named.

   COMPUTE, NEVER STORE — charter rule 6. The score is derived from the
   answers on every keystroke. The ANSWERS persist locally so a
   part-time safety manager can do this over two sittings; the result
   never does, so it cannot go stale against a re-answered element, and
   nothing is sent anywhere.
   ============================================================ */

import { html, raw } from '../../shared/html.js';
import {
  SMS_COMPONENTS,
  MATURITY_LEVELS,
  MATURITY_SOURCE,
  scoreAssessment,
  levelFor
} from '../../../../../packages/shared/src/maturity.ts';

const STORE = 'usalamasms.maturity';

function load() {
  try {
    const raw_ = localStorage.getItem(STORE);
    const parsed = raw_ ? JSON.parse(raw_) : {};
    // Only numbers in range survive a read. A hand-edited or
    // half-written store must not put "4x" into an arithmetic mean.
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, v]) => Number.isInteger(v) && v >= 0 && v <= 4
      )
    );
  } catch {
    return {};
  }
}

function save(answers) {
  try {
    localStorage.setItem(STORE, JSON.stringify(answers));
  } catch {
    /* Private mode, or a full quota. The assessment still works for
       this sitting; it simply will not survive a reload, and saying so
       is better than failing the keystroke. */
  }
}

function Element(element, answers) {
  const current = answers[element.id];
  return html`
    <fieldset class="mat-element" data-element="${element.id}">
      <legend>
        <span class="mat-element__id">${element.id}</span>
        <span class="mat-element__name">${element.name}</span>
      </legend>
      <p class="mat-element__q">${element.question}</p>

      <div class="mat-scale">
        ${MATURITY_LEVELS.map(
          (level) => html`<label class="mat-option">
            <input
              type="radio"
              name="el-${element.id}"
              value="${level.value}"
              ${current === level.value ? raw('checked') : ''}
            />
            <span class="mat-option__label">
              <span class="mat-option__level">${level.value} · ${level.label}</span>
              <span class="mat-option__meaning">${level.meaning}</span>
            </span>
          </label>`
        )}
      </div>

      <p class="mat-element__evidence">
        <strong>Evidence for the top of the scale:</strong> ${element.evidence}
      </p>
    </fieldset>
  `;
}

function Result(result) {
  if (result.answered === 0) {
    return html`<p class="mat-empty">
      Answer an element and the position appears here. Nothing is sent anywhere,
      and nothing is stored except your answers, in this browser.
    </p>`;
  }

  const overall = levelFor(result.mean);

  return html`
    <div class="mat-summary">
      <p class="mat-summary__mean">
        <span class="mat-summary__value">${result.mean.toFixed(1)}</span>
        <span class="mat-summary__of">of 4 · ${overall.label}</span>
      </p>
      <p class="mat-summary__coverage">
        ${result.answered} of ${result.total} elements answered${result.complete
          ? ''
          : ' — the mean covers only what has been answered'}
      </p>
    </div>

    <ol class="mat-bars">
      ${result.components.map((c) => {
        const level = levelFor(c.mean);
        return html`<li class="mat-bar">
          <p class="mat-bar__head">
            <span class="mat-bar__name">${c.component.id}. ${c.component.name}</span>
            <span class="mat-bar__value"
              >${c.answered ? `${c.mean.toFixed(1)} · ${level.label}` : 'not answered'}</span
            >
          </p>
          <div
            class="mat-bar__track"
            role="img"
            aria-label="${c.component.name}: ${c.answered
              ? `${c.mean.toFixed(1)} out of 4, ${level.label}`
              : 'not answered'}"
          >
            <span class="mat-bar__fill" style="width: ${(c.mean / 4) * 100}%"></span>
          </div>
        </li>`;
      })}
    </ol>

    ${result.gaps.length
      ? html`<div class="mat-gaps">
          <h3>Where to start</h3>
          <p class="mat-gaps__lede">
            The elements at Absent or Documented, weakest first. This is the work
            list, and it is the half of an assessment worth taking to a meeting.
          </p>
          <ol>
            ${result.gaps.map(
              (g) => html`<li>
                <strong>${g.element.id} ${g.element.name}</strong> —
                ${MATURITY_LEVELS[g.level].label.toLowerCase()}.
                <span class="mat-gaps__evidence">${g.element.evidence}</span>
              </li>`
            )}
          </ol>
        </div>`
      : html`<p class="mat-gaps__none">
          No element is at Absent or Documented. That is a real position; the next
          question is which component the evidence is thinnest in.
        </p>`}
  `;
}

export function render(outlet) {
  let answers = load();

  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Toolkit</span>
        <h1>SMS maturity assessment</h1>
        <p class="lede">
          Twelve questions against the ICAO SMS framework's four components. It
          produces a position per component and a work list — not a score to put
          on a wall. Nothing is sent anywhere; your answers stay in this browser.
        </p>
        <dl class="stat-strip">
          <div class="stat">
            <dt class="stat__value">12</dt>
            <dd class="stat__label">Elements assessed</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">~15 min</dt>
            <dd class="stat__label">If you have the evidence to hand</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">0</dt>
            <dd class="stat__label">Signups, and nothing leaves the device</dd>
          </div>
          <div class="stat">
            <dt class="stat__value">26 Nov 2026</dt>
            <dd class="stat__label">Annex 19 Amendment 2 applies</dd>
          </div>
        </dl>
      </div>
    </section>

    <div class="panel wrap doc">
      <aside class="toc mat-result" id="mat-result" aria-live="polite">
        <h2 class="section-title">Your position</h2>
        <div id="mat-result-body"></div>
        <p class="mat-actions no-print">
          <button type="button" class="btn btn-secondary btn-sm" id="mat-print">
            Print or save as PDF
          </button>
          <button type="button" class="btn btn-ghost btn-sm" id="mat-clear">
            Clear answers
          </button>
        </p>
      </aside>

      <form class="doc__body" id="mat-form">
        <section class="doc-section">
          <h2>How to answer</h2>
          <p>
            Score what is <em>true today</em>, not what is planned. The scale runs
            from nothing in place to evidence that changes decisions, and the
            useful answer is the one you could show somebody.
          </p>
          <p class="note">
            <b>What is ICAO's here and what is ours</b>
            The four components and twelve elements are the ICAO SMS framework's.
            The five-point maturity scale is this product's articulation — ICAO
            does not publish one for these elements, and presenting ours as theirs
            would be inventing an authority. The element list is
            ${MATURITY_SOURCE.provisional
              ? 'compiled from secondary sources pending a read against Doc 9859 fourth edition, and is marked provisional wherever it appears'
              : 'read against the primary document'}.
          </p>
        </section>

        ${SMS_COMPONENTS.map(
          (component) => html`<section class="doc-section" id="component-${component.id}">
            <h2>${component.id}. ${component.name}</h2>
            <p class="lede lede--tight">${component.purpose}</p>
            ${component.elements.map((element) => Element(element, answers))}
          </section>`
        )}
      </form>
    </div>
  `.toString();

  const form = outlet.querySelector('#mat-form');
  const body = outlet.querySelector('#mat-result-body');

  const repaint = () => {
    body.innerHTML = Result(scoreAssessment(answers)).toString();
  };

  form.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'radio') return;
    const id = input.name.replace(/^el-/, '');
    answers = { ...answers, [id]: Number(input.value) };
    save(answers);
    repaint();
  });

  outlet.querySelector('#mat-print').addEventListener('click', () => window.print());

  outlet.querySelector('#mat-clear').addEventListener('click', () => {
    answers = {};
    save(answers);
    for (const input of form.querySelectorAll('input[type=radio]')) input.checked = false;
    repaint();
  });

  repaint();
}
