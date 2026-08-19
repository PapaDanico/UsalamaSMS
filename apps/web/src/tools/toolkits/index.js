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
import { isSignedIn, authFetch } from '../../shared/session.js';
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
  isProvisional,
  reportingHours,
  isReportableUnder
} from '../../../../../packages/shared/src/regulations.ts';
/* The toolkit list is declared once, in shared/sitemap.js, because the
   menu hint is computed from it. This page renders the same list rather
   than keeping a second copy that goes stale the next time one is
   added — which is exactly how the SRA came to be invisible. */
import { TOOLKITS, ROUTED_TOOLKITS } from '../../shared/sitemap.js';

/* The one sentence each toolkit gets, keyed by the href the list
   already declares. It lives HERE rather than in the sitemap because
   this page is the only surface that prints it, and the sitemap is
   imported by main.js — six sentences in the entry chunk is weight
   charged to somebody filing a report at a strip who will never open
   this index. The LIST is still declared once; only the prose moved to
   where it is printed, and tests/sitemap.test.ts requires every entry
   to have one so a new toolkit cannot arrive without copy. */
const BLURBS = {
  '/toolkits/sra': ['Safety risk assessment', 'The five ICAO steps, for a change before it is made'],
  '/toolkits/register': ['Risk register', 'The standing hazards, with an owner and a review date'],
  '/toolkits/spi': [
    'Safety performance indicators',
    'Alert levels computed from your own history, not picked'
  ],
  '/toolkits/maturity': [
    'SMS maturity assessment',
    'Twelve elements of Annex 19, scored against evidence'
  ],
  '/toolkits/culture': [
    'Safety culture survey',
    'Whether your people will actually file — fourteen questions, nothing leaves the device'
  ],
  '/training': [
    'The SMS training programme',
    'What the course covers, who sits which version, and how long each one runs'
  ],
  '/toolkits/icaas': [
    'KCAA corrective action plan',
    'A corrective action composed into the pack the ICAAS portal asks for'
  ],
  '/toolkits/risk-picture': [
    'Risk picture dashboard',
    'Tolerability breakdown, severity distribution, and action status across the register'
  ],
  '/toolkits#classifier': [
    'Occurrence classifier',
    'Accident, serious incident or incident — and the clock it starts'
  ],
  '/toolkits#risk': ['Risk tolerability', 'One cell of the Doc 9859 matrix, and what it obliges']
};

/** [title, blurb] for a toolkit, by the href the list declares. */
const title = (href) => BLURBS[href][0];
const blurb = (href) => BLURBS[href][1];

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
              ? html`<a class="btn btn-primary" href="${t.href}">${title(t.href)}</a>`
              : html`<a class="btn btn-ghost-lt" href="${t.href}">${title(t.href)}</a>`
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
                >${title(t.href)}</a
              >
              <span class="toc-summary">${blurb(t.href)}</span>
            </li>`
          )}
          <li>
            <a href="/methodology#windows">Reporting deadline calculator</a>
            <span class="toc-summary">Which clock a given occurrence starts, and when it runs out</span>
          </li>
        </ol>
      </nav>
      <div class="doc__body">${isSignedIn()
          ? html`<div id="toolkits-risk-preview" class="doc-section">
              <p class="hint">Loading risk picture…</p>
            </div>`
          : ''
        }${Classifier()} ${RiskAssessor()}</div>
    </div>
  `.toString();

  bindClassifier(outlet);
  bindRisk(outlet);
  if (isSignedIn()) loadRiskPreview(outlet);
}

/* Fetch a compact risk picture snapshot and render it at the top of the
   toolkits body. Numbers are stale the moment they land — this is a
   dashboard preview, not a workbench — so no refresh loop is needed.
   A failure is silent: the preview slot is replaced with nothing rather
   than an error panel that would push the calculators down. */
async function loadRiskPreview(outlet) {
  const slot = outlet.querySelector('#toolkits-risk-preview');
  if (!slot) return;
  try {
    const [regRes, actRes] = await Promise.all([
      authFetch('/api/v1/register'),
      authFetch('/api/v1/actions')
    ]);
    if (!regRes.ok || !actRes.ok) {
      slot.remove();
      return;
    }
    const { entries } = await regRes.json();
    const { actions } = await actRes.json();

    const bands = { INTOLERABLE: 0, TOLERABLE: 0, ACCEPTABLE: 0 };
    for (const e of entries) {
      const s = e.residualSeverity ?? e.severity;
      const l = e.residualLikelihood ?? e.likelihood;
      if (!s || !l) continue;
      const band = tolerability(s, l);
      if (band in bands) bands[band]++;
    }
    const open = actions.filter(
      (a) => a.status !== 'VERIFIED' && a.status !== 'CANCELLED'
    ).length;
    const overdue = actions.filter((a) => a.status === 'OVERDUE').length;
    const total = bands.INTOLERABLE + bands.TOLERABLE + bands.ACCEPTABLE;

    slot.innerHTML = html`
      <h2 class="section-title">Risk picture</h2>
      <p class="lede lede--tight">
        Your current risk position, drawn from the register and corrective actions.
        <a href="/toolkits/risk-picture">Full picture →</a>
      </p>
      <div class="picture-summary">
        <a class="picture-card" href="/toolkits/risk-picture" aria-label="Risk tolerability">
          <h3 class="picture-card__title">Tolerability</h3>
          <ul class="picture-card__bars" aria-label="Hazards by tolerability band">
            <li data-tolerability="INTOLERABLE">
              <span class="picture-card__band">Intolerable</span>
              <span class="picture-card__count ${bands.INTOLERABLE > 0 ? 'picture-card__count--alert' : ''}">${bands.INTOLERABLE}</span>
            </li>
            <li data-tolerability="TOLERABLE">
              <span class="picture-card__band">Tolerable</span>
              <span class="picture-card__count">${bands.TOLERABLE}</span>
            </li>
            <li data-tolerability="ACCEPTABLE">
              <span class="picture-card__band">Acceptable</span>
              <span class="picture-card__count">${bands.ACCEPTABLE}</span>
            </li>
          </ul>
          ${total === 0
            ? html`<p class="picture-card__note">No assessed hazards yet</p>`
            : html`<p class="picture-card__note">${total} assessed hazard${total === 1 ? '' : 's'}</p>`}
        </a>
        <a class="picture-card" href="/toolkits/risk-picture" aria-label="Open actions">
          <h3 class="picture-card__title">Open actions</h3>
          <p class="picture-card__value ${overdue > 0 ? 'picture-card__value--alert' : ''}">${open}</p>
          ${overdue > 0
            ? html`<p class="picture-card__note picture-card__note--alert">${overdue} overdue</p>`
            : html`<p class="picture-card__note">None overdue</p>`}
        </a>
      </div>
    `.toString();
  } catch {
    slot.remove();
  }
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
    /* THE PERIOD FOLLOWS THE CLASS. Kenya's regulation 12(1) sets three
       — 24 hours for an accident, 48 for a serious incident, 72 for an
       incident — and this screen has just decided which one it is. It
       used to print obligation.hours for all three, so an incident the
       law gives 72 hours was shown as 24. Strict rather than lax, but
       still not what the instrument says, on the one screen whose whole
       job is to answer that question. */
    const hours = reportingHours(jurisdiction, key);
    /* AND WHETHER IT IS REPORTABLE AT ALL follows the instrument too.
       The glossary calls an incident not reportable in every case,
       which is the general reading; Kenya's regulation 12(1) names
       incidents explicitly and gives them 72 hours. This screen was
       telling a Kenyan operator it need not report something the law
       requires inside three days. */
    const reportable = isReportableUnder(jurisdiction, key, klass.reportable);

    out.dataset.state = reportable ? 'ok' : 'idle';
    out.innerHTML = html`
      <strong>${klass.label}</strong>
      <span class="calc__detail">
        ${reportable
          ? html`Reportable as an occurrence ·
              ${hours === null
                ? html`<strong>without delay</strong> — no fixed period is set ·`
                : html`<strong>${hours} hours</strong> from
                    ${obligation.clockStart === 'AWARENESS' ? 'becoming aware' : 'the occurrence'}${obligation.clockStartUnstated
                      ? html`<span class="calc__caveat">
                          (the instrument names the period and not what starts it &mdash;
                          awareness is the reading applied here)</span>`
                      : ''}${obligation.clockStartInstrument
                      ? html`<span class="calc__caveat">
                          (${obligation.clockStartInstrument})</span>`
                      : ''} ·`}
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
