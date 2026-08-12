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
  OPERATOR_SCALES,
  scoreAssessment,
  levelFor
} from '../../../../../packages/shared/src/maturity.ts';
import { implementationPlan } from '../../../../../packages/shared/src/plan.ts';

const STORE = 'usalamasms.maturity';

const SUIT_VALUES = ['SUITABLE', 'NOT_SUITABLE'];
const SCALE_IDS = OPERATOR_SCALES.map((s) => s.id);

/**
 * Read the assessment.
 *
 * The store gained two things that are not levels — the operator's
 * scale and a suitability judgement per element — and they live under
 * underscore-prefixed keys so the level map stays exactly what it was.
 * An older store with only levels reads back unchanged, which matters:
 * somebody halfway through an assessment should not lose it to a
 * deploy.
 *
 * Everything is validated on the way in, for the same reason it always
 * was — a hand-edited store must not put "4x" into an arithmetic mean,
 * and must not put an unknown band where a label is looked up.
 */
function load() {
  try {
    const raw_ = localStorage.getItem(STORE);
    const parsed = raw_ ? JSON.parse(raw_) : {};
    const answers = Object.fromEntries(
      Object.entries(parsed).filter(
        ([k, v]) => !k.startsWith('_') && Number.isInteger(v) && v >= 0 && v <= 4
      )
    );
    const suitability = Object.fromEntries(
      Object.entries(parsed._suitability ?? {}).filter(([, v]) => SUIT_VALUES.includes(v))
    );
    const scale = SCALE_IDS.includes(parsed._scale) ? parsed._scale : undefined;
    return { answers, suitability, scale };
  } catch {
    return { answers: {}, suitability: {}, scale: undefined };
  }
}

function save(state) {
  try {
    localStorage.setItem(
      STORE,
      JSON.stringify({ ...state.answers, _suitability: state.suitability, _scale: state.scale })
    );
  } catch {
    /* Private mode, or a full quota. The assessment still works for
       this sitting; it simply will not survive a reload, and saying so
       is better than failing the keystroke. */
  }
}

function Element(element, answers, suitability) {
  const current = answers[element.id];
  const suit = suitability[element.id];
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

      <!-- A SECOND, DIFFERENT QUESTION. The scale above asks how far
           this element has been taken; this asks whether that is the
           right amount for THIS operator. SM ICG grades suitability
           against size, nature, complexity and inherent risk, so the
           two genuinely come apart — and an element taken a long way
           and still wrong is the finding a ladder cannot produce.
           Neither option is preselected: it is a question most
           operators have never been asked. -->
      <div class="mat-suit">
        <span class="mat-suit__q">Is what you have suitable for an operation your size?</span>
        ${[['SUITABLE', 'Suitable'], ['NOT_SUITABLE', 'Not suitable']].map(
          ([value, label]) => html`<label class="chip">
            <input
              type="radio"
              name="suit-${element.id}"
              value="${value}"
              ${suit === value ? raw('checked') : ''}
            />
            <span>${label}</span>
          </label>`
        )}
      </div>
    </fieldset>
  `;
}

function Result(result, scale, plan) {
  if (result.answered === 0) {
    return html`<p class="mat-empty">
      Answer an element and the position appears here. Nothing is sent anywhere,
      and nothing is stored except your answers, in this browser.
    </p>`;
  }

  const overall = levelFor(result.mean);
  /* THE HEADLINE IS THE WEAKEST ELEMENT, not the average — see
     `position` in maturity.ts. The mean stays on screen because the
     distribution is worth seeing, but it is demoted to context and
     labelled as an average, because an average of a framework whose
     pass condition is universal is a number that flatters. */
  const limiting = result.position !== undefined ? MATURITY_LEVELS[result.position] : null;

  return html`
    <div class="mat-summary">
      ${limiting
        ? html`<p class="mat-summary__mean">
              <span class="mat-summary__value">${limiting.label}</span>
              <span class="mat-summary__of">is where this SMS stands</span>
            </p>
            <p class="mat-summary__coverage">
              An SMS is only as implemented as its weakest element, and
              ${result.limitedBy.length === 1 ? 'one element sits' : `${result.limitedBy.length} elements sit`}
              at ${limiting.label.toLowerCase()}:
              ${result.limitedBy.map((e) => `${e.id} ${e.name}`).join(', ')}. Work on any other
              element will move the average and leave this position exactly where it is.
            </p>
            <p class="mat-summary__coverage">
              The average across all twelve is ${result.mean.toFixed(1)} of 4 · ${overall.label}.
              It is shown for the shape of the spread, not as the position — an average lets a
              strong element stand in for a missing one, and an audit does not average.
            </p>`
        : html`<p class="mat-summary__mean">
              <span class="mat-summary__value">${result.mean.toFixed(1)}</span>
              <span class="mat-summary__of">of 4 · ${overall.label} · average so far</span>
            </p>
            <p class="mat-summary__coverage">
              ${result.answered} of ${result.total} elements answered — this is the average of
              those, not a position. Answer all twelve and this becomes the level of the weakest,
              which is the one an auditor writes up.
            </p>`}
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

    ${result.unsuitable.length
      ? html`<div class="mat-gaps mat-gaps--suit">
          <h3>Built for somebody else</h3>
          <p class="mat-gaps__lede">
            ${scale
              ? html`Judged against an operation you described as
                  <strong>${(OPERATOR_SCALES.find((s) => s.id === scale) || {}).label}</strong>.`
              : 'You have not said how big the operation is, so these are your own judgements taken at face value.'}
            An element can be taken a long way and still be wrong for the operator — a procedure
            set written for an airline is not followed on six aircraft. That is not a gap and it
            does not move the position; it is work of a different kind.
          </p>
          <ol>
            ${result.unsuitable.map(
              (u) => html`<li>
                <strong>${u.element.id} ${u.element.name}</strong> —
                ${u.overBuilt
                  ? `at ${MATURITY_LEVELS[u.level].label.toLowerCase()}, which is more than this operation needs.`
                  : `at ${MATURITY_LEVELS[u.level].label.toLowerCase()}, and not the right shape either.`}
                <span class="mat-gaps__evidence">${u.element.evidence}</span>
              </li>`
            )}
          </ol>
        </div>`
      : ''}

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

    ${plan.phases.length
      ? html`<div class="mat-plan">
          <h3>Your implementation plan</h3>
          <p class="mat-gaps__lede">
            The artefact a regulator asks a new operator to submit, built from the
            answers above rather than from a template you fill in again. The phases
            are this scale's own rungs: everything on one rung, moved to the next.
            Nothing counts as being in place before it is written down, so that is
            phase one — that rule is SM ICG's, not ours.
            ${plan.scale
              ? html`Scoped to an operation you described as
                  <strong>${(OPERATOR_SCALES.find((s) => s.id === plan.scale) || {}).label}</strong>.`
              : ''}
          </p>
          ${plan.phases.map(
            (phase) => html`<section class="mat-phase">
              <h4>
                <span class="mat-element__id">Phase ${phase.order}</span>
                ${phase.title}
              </h4>
              <p class="mat-phase__purpose">${phase.purpose}</p>
              <ol>
                ${phase.steps.map(
                  (step) => html`<li>
                    <strong>${step.element.id} ${step.element.name}</strong> —
                    ${step.from.label.toLowerCase()} to ${step.to.label.toLowerCase()}.
                    <span class="mat-gaps__evidence">${step.action}</span>
                    <span class="mat-phase__done"><strong>Done when:</strong> ${step.evidence}</span>
                  </li>`
                )}
              </ol>
            </section>`
          )}
          ${plan.settled.length
            ? html`<p class="mat-phase__settled">
                Already at the top of the scale, and carried here so the plan shows the
                whole picture rather than only the debt:
                ${plan.settled.map((e) => `${e.id} ${e.name}`).join(', ')}.
              </p>`
            : ''}
          ${plan.complete
            ? ''
            : html`<p class="mat-phase__partial">
                This plan covers the elements you have answered. Answer the rest and it
                will cover those too — it says nothing about an element it was never
                told about, rather than guessing.
              </p>`}
        </div>`
      : ''}
  `;
}

export function render(outlet) {
  let { answers, suitability, scale } = load();

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
        <!-- ASKED FIRST, because the suitability question below cannot
             be answered without it. SM ICG grades suitability against
             "the size, nature, and complexity of the organisation and
             the inherent risk in its activity" — so a tool that asks
             whether an SMS is suitable and never asks whose it is has
             asked half a question. Bands rather than a headcount box:
             the judgement is qualitative, and eleven staff is not
             categorically different from nine. -->
        <section class="doc-section" id="operator-scale">
          <h2>First, who is this for?</h2>
          <p>
            Suitability is judged against the operation, not against a fixed bar. A
            one-page emergency plan can be entirely suitable at a single strip; the
            same plan is not suitable across four bases.
          </p>
          <div class="mat-scale">
            ${OPERATOR_SCALES.map(
              (s) => html`<label class="mat-option">
                <input
                  type="radio"
                  name="operator-scale"
                  value="${s.id}"
                  ${scale === s.id ? raw('checked') : ''}
                />
                <span class="mat-option__label">
                  <span class="mat-option__level">${s.label}</span>
                  <span class="mat-option__meaning">${s.meaning}</span>
                </span>
              </label>`
            )}
          </div>
        </section>

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
          <p class="note">
            <b>Why the weakest element is the answer, and not the average</b>
            That rule is not ours. It follows the
            <a href="${MATURITY_SOURCE.scoringBasisUrl}" rel="noreferrer">SM ICG SMS Evaluation
            Tool</a>, which Australia's CASA has adopted as Form 1591 — it expects every element
            to be at least operating, and effectiveness in all of them. A framework whose pass
            condition applies to all twelve cannot be reported by an average, because an average
            lets a strong element stand in for a missing one. SM ICG goes further and advises
            that an SMS not be scored at all; where a number appears here it is shown as the
            spread, never as a pass mark.
          </p>
        </section>

        ${SMS_COMPONENTS.map(
          (component) => html`<section class="doc-section" id="component-${component.id}">
            <h2>${component.id}. ${component.name}</h2>
            <p class="lede lede--tight">${component.purpose}</p>
            ${component.elements.map((element) => Element(element, answers, suitability))}
          </section>`
        )}
      </form>
    </div>
  `.toString();

  const form = outlet.querySelector('#mat-form');
  const body = outlet.querySelector('#mat-result-body');

  const repaint = () => {
    const plan = implementationPlan(answers, { suitability, ...(scale ? { scale } : {}) });
    body.innerHTML = Result(scoreAssessment(answers, 1, suitability), scale, plan).toString();
  };

  form.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'radio') return;

    if (input.name === 'operator-scale') {
      scale = input.value;
    } else if (input.name.startsWith('suit-')) {
      suitability = { ...suitability, [input.name.slice(5)]: input.value };
    } else if (input.name.startsWith('el-')) {
      answers = { ...answers, [input.name.slice(3)]: Number(input.value) };
    } else {
      return;
    }
    save({ answers, suitability, scale });
    repaint();
  });

  outlet.querySelector('#mat-print').addEventListener('click', () => window.print());

  outlet.querySelector('#mat-clear').addEventListener('click', () => {
    answers = {};
    suitability = {};
    scale = undefined;
    save({ answers, suitability, scale });
    for (const input of form.querySelectorAll('input[type=radio]')) input.checked = false;
    repaint();
  });

  repaint();
}
