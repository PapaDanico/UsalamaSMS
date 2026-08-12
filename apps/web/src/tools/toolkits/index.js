/* ============================================================
   The toolkits.

   Self-serve instruments, in the benchmark's pattern: a question an
   operator actually has, answered by the same code the product runs
   on, with the source named.

   THIS PAGE IS THE INDEX AND TWO OF THE INSTRUMENTS. The two below are
   here because they are one question and one answer. The three that
   have their own route — the safety risk assessment, the risk register
   and the maturity assessment — are sittings rather than calculations,
   and they carry state. The split, and the list, live in
   shared/sitemap.js so the menu hint cannot disagree with this page.

   Both tools on this page compute from modules that already existed
   and were shown to nobody:

     · THE CLASSIFIER drives OCCURRENCE_CLASSES and
       SERIOUS_INJURY_TESTS from the KCAA course glossary, then hands
       the answer to reportingDeadline(). It is the decision reporters
       get wrong, and getting it wrong is what starts — or fails to
       start — a 24-hour clock.

     · THE RISK ASSESSOR drives tolerability() and riskScore() from
       Doc 9859. The matrix on /methodology shows the whole grid; this
       answers one cell and says what the answer obliges.

   Nothing is stored and nothing is sent. Charter rule 6.
   ============================================================ */

import { html, raw } from '../../shared/html.js';
import { Select } from '../../components/Select.js';
import {
  OCCURRENCE_CLASSES,
  SERIOUS_INJURY_TESTS
} from '../../../../../packages/shared/src/glossary.ts';
import {
  tolerability,
  riskScore,
  SEVERITY_SCALE,
  LIKELIHOOD_SCALE
} from '../../../../../packages/shared/src/risk.ts';
import {
  MOR_OBLIGATIONS,
  JURISDICTIONS,
  isProvisional
} from '../../../../../packages/shared/src/regulations.ts';
/* The toolkit list is declared once, in shared/sitemap.js, because the
   menu hint is computed from it. This page renders the same list rather
   than keeping a second copy that goes stale the next time one is
   added — which is exactly how the SRA came to be invisible. */
import { TOOLKITS, ROUTED_TOOLKITS } from '../../shared/sitemap.js';

/* The scale is declared once, in risk.ts, alongside the matrix that
   scores it. Rendering it into a menu is presentation, so it happens
   here — but the wording is not retyped. */
const options = (scale) => scale.map((p) => ({ value: p.key, label: `${p.code} — ${p.label}` }));

const ACTION = {
  INTOLERABLE:
    'Stop or mitigate before the operation continues. This band is not acceptable at any level of benefit.',
  TOLERABLE:
    'Acceptable only with mitigation, a named owner and a review date. Record the justification.',
  ACCEPTABLE: 'Acceptable as it stands. Keep it under the normal monitoring cadence.'
};

function Classifier() {
  return html`
    <section class="doc-section" id="classifier">
      <h2>Is it an accident, a serious incident, or an incident?</h2>
      <p class="lede lede--tight">
        The distinction a reporter is most often asked to make, and the one that
        decides whether a regulatory clock starts. Three questions, taken from
        the definitions rather than from feel.
      </p>

      <form class="card tool-card" id="classify" novalidate>
        <fieldset class="mat-element">
          <legend>Was anyone killed or seriously injured?</legend>
          <div class="mat-scale mat-scale--tight">
            <label class="mat-option"
              ><input type="radio" name="injury" value="yes" />
              <span class="mat-option__label"><span class="mat-option__level">Yes</span></span></label
            >
            <label class="mat-option"
              ><input type="radio" name="injury" value="no" checked />
              <span class="mat-option__label"><span class="mat-option__level">No</span></span></label
            >
          </div>
          <details class="mat-element__evidence">
            <summary>What counts as a serious injury</summary>
            <ul class="threshold-list">
              ${SERIOUS_INJURY_TESTS.map((t) => html`<li>${t}</li>`)}
            </ul>
          </details>
        </fieldset>

        <fieldset class="mat-element">
          <legend>
            Was the aircraft damaged in a way that affects its strength or
            performance and needs major repair, or is it missing?
          </legend>
          <div class="mat-scale mat-scale--tight">
            <label class="mat-option"
              ><input type="radio" name="damage" value="yes" />
              <span class="mat-option__label"><span class="mat-option__level">Yes</span></span></label
            >
            <label class="mat-option"
              ><input type="radio" name="damage" value="no" checked />
              <span class="mat-option__label"><span class="mat-option__level">No</span></span></label
            >
          </div>
          <p class="field-hint">
            ${OCCURRENCE_CLASSES.find((c) => c.key === 'ACCIDENT')?.note ?? ''}
          </p>
        </fieldset>

        <fieldset class="mat-element">
          <legend>Do the circumstances say an accident very nearly happened?</legend>
          <div class="mat-scale mat-scale--tight">
            <label class="mat-option"
              ><input type="radio" name="nearly" value="yes" />
              <span class="mat-option__label"><span class="mat-option__level">Yes</span></span></label
            >
            <label class="mat-option"
              ><input type="radio" name="nearly" value="no" checked />
              <span class="mat-option__label"><span class="mat-option__level">No</span></span></label
            >
          </div>
        </fieldset>

        ${Select({
          name: 'jurisdiction',
          label: 'Which authority does the operation answer to?',
          value: 'KE',
          placeholder: 'Choose an authority',
          options: JURISDICTIONS.map((j) => ({ value: j, label: MOR_OBLIGATIONS[j].authority }))
        })}

        <output class="calc__out" id="classify-out" aria-live="polite"></output>
      </form>
    </section>
  `;
}

function RiskAssessor() {
  return html`
    <section class="doc-section" id="risk">
      <h2>What does this risk oblige?</h2>
      <p class="lede lede--tight">
        One cell of the Doc 9859 matrix, and what the answer requires. The whole
        grid, with its derivation, is on the
        <a href="/methodology#risk">methodology page</a>.
      </p>

      <form class="card tool-card" id="risk-form" novalidate>
        ${Select({
          name: 'severity',
          label: 'If it happens, how bad is the worst credible outcome?',
          value: 'C_MAJOR',
          placeholder: 'Choose a severity',
          options: options(SEVERITY_SCALE)
        })}
        ${Select({
          name: 'likelihood',
          label: 'How likely is it, in this operation?',
          value: 'REMOTE',
          placeholder: 'Choose a likelihood',
          options: options(LIKELIHOOD_SCALE)
        })}
        <output class="calc__out" id="risk-out" aria-live="polite"></output>
      </form>
    </section>
  `;
}

export function render(outlet) {
  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Toolkits</span>
        <h1>Instruments, not opinions</h1>
        <p class="lede">
          Each of these answers a question an operator actually has, using the
          same code the product runs on and naming the document behind it.
          Nothing is stored and nothing is sent.
        </p>
        <div class="hero-actions">
          ${/* The class attribute stays a literal on both branches:
                check:css reads these files as text, and a class built by
                interpolation is a class the gate cannot see. */
          ROUTED_TOOLKITS.map((t, i) =>
            i === 0
              ? html`<a class="btn btn-primary" href="${t.href}">${t.label}</a>`
              : html`<a class="btn btn-ghost-lt" href="${t.href}">${t.label}</a>`
          )}
        </div>
      </div>
    </section>

    <div class="panel wrap doc">
      <nav class="toc" aria-labelledby="toc-title">
        <h2 class="section-title" id="toc-title">On this page</h2>
        <ol>
          ${TOOLKITS.map(
            (t) => html`<li>
              <a href="${t.href.startsWith('/toolkits#') ? t.href.slice('/toolkits'.length) : t.href}"
                >${t.label}</a
              >
              <span class="toc-summary">${t.blurb}</span>
            </li>`
          )}
          <li>
            <a href="/methodology#windows">Reporting deadline calculator</a>
            <span class="toc-summary">Which clock a given occurrence starts, and when it runs out</span>
          </li>
        </ol>
      </nav>
      <div class="doc__body">${Classifier()} ${RiskAssessor()}</div>
    </div>
  `.toString();

  bindClassifier(outlet);
  bindRisk(outlet);
}

function bindClassifier(outlet) {
  const form = outlet.querySelector('#classify');
  const out = outlet.querySelector('#classify-out');

  const recompute = () => {
    const injury = form.elements.injury.value === 'yes';
    const damage = form.elements.damage.value === 'yes';
    const nearly = form.elements.nearly.value === 'yes';
    const jurisdiction = form.elements.jurisdiction.value;

    // The order is the definition's own: an accident is decided by
    // outcome, and a serious incident by circumstance. The glossary's
    // sentence — the difference "lies only in the result" — is why the
    // outcome test runs first.
    const key = injury || damage ? 'ACCIDENT' : nearly ? 'SERIOUS_INCIDENT' : 'INCIDENT';
    const klass = OCCURRENCE_CLASSES.find((c) => c.key === key);
    const obligation = MOR_OBLIGATIONS[jurisdiction];

    out.dataset.state = klass.reportable ? 'ok' : 'idle';
    out.innerHTML = html`
      <strong>${klass.label}</strong>
      <span class="calc__detail">
        ${klass.reportable
          ? html`Reportable as an occurrence ·
              ${obligation.hours === null
                ? html`<strong>without delay</strong> — no fixed period is set ·`
                : html`<strong>${obligation.hours} hours</strong> from
                    ${obligation.clockStart === 'AWARENESS' ? 'becoming aware' : 'the occurrence'} ·`}
              ${obligation.authority}${isProvisional(jurisdiction)
                ? html` · <span class="tag tag--provisional">provisional</span>`
                : ''}`
          : html`Not automatically reportable to the authority as an occurrence — and
              still worth filing. ${klass.note ?? ''}`}
      </span>
      <span class="calc__detail">
        This is the definition applied, not a determination. Whether a given
        occurrence is reportable remains the accountable manager's judgement and
        the authority's to review.
      </span>
    `.toString();
  };

  form.addEventListener('change', recompute);
  form.addEventListener('input', recompute);
  recompute();
}

function bindRisk(outlet) {
  const form = outlet.querySelector('#risk-form');
  const out = outlet.querySelector('#risk-out');

  const recompute = () => {
    const severity = form.elements.severity.value;
    const likelihood = form.elements.likelihood.value;
    if (!severity || !likelihood) {
      out.dataset.state = 'idle';
      out.textContent = 'Choose a severity and a likelihood.';
      return;
    }
    const t = tolerability(severity, likelihood);
    const score = riskScore(severity, likelihood);
    out.dataset.state = t === 'INTOLERABLE' ? 'error' : 'ok';
    out.innerHTML = html`
      <strong>${score} · ${t.charAt(0)}${t.slice(1).toLowerCase()}</strong>
      <span class="calc__detail">${ACTION[t]}</span>
      <span class="calc__detail">
        ICAO Doc 9859, fourth edition. Colour is never the only channel here
        either: the index and the band are both stated.
      </span>
    `.toString();
  };

  form.addEventListener('change', recompute);
  form.addEventListener('input', recompute);
  recompute();
}

void raw;
