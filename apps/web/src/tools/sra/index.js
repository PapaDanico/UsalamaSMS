/* ============================================================
   The Safety Risk Assessment.

   WHAT AN OPERATOR IS ACTUALLY ASKED FOR. The register answers "what
   hazards do we carry". An SRA answers the question that arrives at the
   worst moment: "you changed something — what did you think would
   happen, and what did you do about it?" A new route, a new type, a
   base closing, a roster change. Annex 19 element 3.2 asks for it
   before the change; an auditor asks for it after.

   THE FIVE STEPS ARE ICAO'S. Doc 9859 fourth edition: system analysis,
   identify hazards, analyse, assess, control — with the loop back from
   control to identification, which is the step most templates drop. A
   control changes the system, so it has to be run back through: a
   mitigation that introduces a new hazard is the commonest way an SRA
   makes an operation less safe while documenting the opposite.

   PROGRESS IS COMPUTED, NEVER TICKED. A checklist somebody ticks is a
   checklist that gets ticked. Each step reports done when its evidence
   exists — see sraProgress().

   ON THIS DEVICE, like the register and the maturity assessment, and
   the page says so rather than implying a shared record.
   ============================================================ */

import { html, raw } from '../../shared/html.js';
import { attachPrintId } from '../../shared/print-id.js';
import { Select, wireSelects } from '../../components/Select.js';
import {
  SEVERITY_SCALE,
  LIKELIHOOD_SCALE
} from '../../../../../packages/shared/src/risk.ts';
import {
  SRA_STEPS,
  sraProgress,
  sraVerdict,
  effectiveRisk
} from '../../../../../packages/shared/src/sra.ts';
import { SAFETY_ROLES } from '../../../../../packages/shared/src/posts.ts';

const STORE = 'usalamasms.sra';
const OTHER = '__other__';

const options = (scale) => scale.map((p) => ({ value: p.key, label: `${p.code} — ${p.label}` }));
const toOptions = (list) => list.map((o) => ({ value: o.code, label: o.label }));

function blank() {
  return {
    id: `sra-${Date.now()}`,
    title: '',
    system: '',
    hazards: [],
    status: 'DRAFT',
    acceptedBy: '',
    acceptedOn: '',
    createdAt: new Date().toISOString()
  };
}

function load() {
  try {
    const raw_ = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (!raw_ || typeof raw_ !== 'object') return blank();
    return {
      ...blank(),
      ...raw_,
      hazards: Array.isArray(raw_.hazards)
        ? raw_.hazards
            .filter((h) => h && typeof h.id === 'string')
            .map((h) => ({
              id: h.id,
              hazard: String(h.hazard ?? ''),
              consequence: String(h.consequence ?? ''),
              severity: h.severity || undefined,
              likelihood: h.likelihood || undefined,
              controls: String(h.controls ?? ''),
              residualSeverity: h.residualSeverity || undefined,
              residualLikelihood: h.residualLikelihood || undefined,
              owner: String(h.owner ?? ''),
              controlReviewed: Boolean(h.controlReviewed)
            }))
        : []
    };
  } catch {
    return blank();
  }
}

/* Charter rule 8: a refused write is reported. Same reasoning as the
   register — an assessment that looks saved and is gone on reload is
   worse than one that refuses to accept the keystroke. */
function save(sra) {
  try {
    localStorage.setItem(STORE, JSON.stringify(sra));
    return true;
  } catch {
    return false;
  }
}

function HazardRow(h) {
  const initial = effectiveRisk({ ...h, residualSeverity: undefined, residualLikelihood: undefined });
  const effective = effectiveRisk(h);
  const mitigated = Boolean(h.residualSeverity && h.residualLikelihood);

  return html`<article class="card cov reg-entry" data-hz="${h.id}">
    <div class="cov__head">
      <h3>${h.hazard}</h3>
      ${effective
        ? html`<span class="risk-chip" data-tolerability="${effective.tolerability}"
            >${effective.score} ${mitigated ? 'residual' : 'initial'}</span
          >`
        : html`<span class="reg-entry__nores">not analysed</span>`}
    </div>

    <p class="cov__has"><strong>If it happens:</strong> ${h.consequence || '—'}</p>

    ${h.controls
      ? html`<p class="cov__missing"><strong>Control:</strong> ${h.controls}</p>`
      : ''}

    ${initial && effective && mitigated
      ? html`<p class="reg-entry__risk">
          <span class="risk-chip" data-tolerability="${initial.tolerability}"
            >${initial.score} before</span
          >
          <span class="risk-chip" data-tolerability="${effective.tolerability}"
            >${effective.score} after</span
          >
        </p>`
      : ''}

    ${effective && effective.tolerability === 'INTOLERABLE'
      ? html`<p class="reg-entry__flag">
          Intolerable. Doc 9859 does not offer a sign-off that makes this band
          acceptable — the change cannot proceed on this assessment.
        </p>`
      : ''}

    <p class="reg-entry__meta">
      <span>${h.owner || 'No owner'}</span>
      <span
        >${h.controlReviewed
          ? 'control run back through hazard identification'
          : 'control not yet re-examined'}</span
      >
      <button type="button" class="btn btn-ghost btn-sm" data-remove="${h.id}">Remove</button>
    </p>
  </article>`;
}

export function render(outlet) {
  let sra = load();

  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Toolkit</span>
        <h1>Safety risk assessment</h1>
      <div class="print-id-slot"></div>
        <p class="lede">
          For a change rather than for the standing register: a new route, a
          new type, a base closing, a roster that moves. The five steps are
          ICAO Doc 9859's own safety risk management process, in its order,
          including the loop back from control to hazard identification that
          most templates drop.
        </p>
        <dl class="stat-strip" id="sra-strip"></dl>
      </div>
    </section>

    <div class="panel wrap doc">
      <nav class="toc" aria-labelledby="toc-title">
        <h2 class="section-title" id="toc-title">The five steps</h2>
        <ol id="sra-steps"></ol>
        <p class="mat-actions no-print">
          <button type="button" class="btn btn-secondary btn-sm" id="sra-print">
            Print or save as PDF
          </button>
        </p>
      </nav>

      <div class="doc__body">
        <section class="doc-section" id="step-system">
          <h2><span class="mat-element__id">1</span> ${SRA_STEPS[0].name}</h2>
          <p class="lede lede--tight">${SRA_STEPS[0].purpose}</p>
          <form class="card" id="sra-system" novalidate>
            <label class="field">
              <span class="field-label">What is this assessment about?</span>
              <input class="input-field" name="title" value="${sra.title}"
                placeholder="New scheduled service to an unpaved northern strip" />
            </label>
            <label class="field">
              <span class="field-label">The change, and the operation it sits in</span>
              <textarea class="input-field" name="system" rows="5"
                placeholder="The aircraft, the aerodromes, the people, the procedures, and where this touches anybody else's system.">${sra.system}</textarea>
              <span class="field-hint">${SRA_STEPS[0].evidence}</span>
            </label>
          </form>
        </section>

        <section class="doc-section" id="step-hazards">
          <h2><span class="mat-element__id">2–5</span> Hazards, analysed and controlled</h2>
          <p class="lede lede--tight">
            Steps two to five run per hazard rather than as separate passes,
            because that is how the work is actually done. The band is computed
            from the same Doc 9859 scale the matrix uses and is never stored.
          </p>

          <!-- no-print, for the register's reason: what goes to the
               meeting is the assessment — the change, the hazards, the
               bands and the verdict. A blank entry form printed above
               them is two pages of nothing before the reader reaches
               anything that was assessed. -->
          <form class="card no-print" id="sra-hazard" novalidate>
            <label class="field">
              <span class="field-label">The hazard *</span>
              <input class="input-field" name="hazard" required
                placeholder="A condition, not an event — 'unpaved surface in the wet season'" />
            </label>
            <label class="field">
              <span class="field-label">Credible consequence *</span>
              <textarea class="input-field" name="consequence" rows="2" required></textarea>
            </label>

            ${Select({
              name: 'severity',
              label: 'Severity, before controls',
              value: 'C_MAJOR',
              placeholder: 'Choose a severity',
              options: options(SEVERITY_SCALE)
            })}
            ${Select({
              name: 'likelihood',
              label: 'Likelihood, in THIS operation',
              value: 'REMOTE',
              placeholder: 'Choose a likelihood',
              options: options(LIKELIHOOD_SCALE)
            })}

            <label class="field">
              <span class="field-label">Control</span>
              <textarea class="input-field" name="controls" rows="2"
                placeholder="Leave blank if the risk is acceptable as it stands."></textarea>
            </label>

            ${Select({
              name: 'residualSeverity',
              label: 'Severity, after the control',
              placeholder: 'Not assessed yet',
              options: options(SEVERITY_SCALE)
            })}
            ${Select({
              name: 'residualLikelihood',
              label: 'Likelihood, after the control',
              placeholder: 'Not assessed yet',
              options: options(LIKELIHOOD_SCALE)
            })}
            ${Select({
              name: 'owner',
              label: 'Owner *',
              placeholder: 'Choose the post that owns this',
              options: toOptions(SAFETY_ROLES),
              otherValue: OTHER,
              otherLabel: 'Another post…',
              otherPlaceholder: 'The post, as your organisation names it'
            })}

            <label class="chip">
              <input type="checkbox" name="controlReviewed" class="input-field" />
              <span
                >The control has been run back through hazard identification — it
                introduces no new hazard</span
              >
            </label>

            <button type="submit" class="btn btn-primary btn-block">Add to the assessment</button>
            <p class="field-error" id="sra-error" role="status" aria-live="polite"></p>
          </form>

          <div id="sra-hazards"></div>
        </section>

        <section class="doc-section" id="step-accept">
          <h2>Acceptance</h2>
          <output class="calc__out" id="sra-verdict" aria-live="polite"></output>
          <p class="note">
            <b>On this device only</b>
            This assessment lives in this browser. It is not sent anywhere and
            not shared with the safety office — print it to take it to a
            meeting. <a href="/coverage#c-3">Coverage</a> says what that means
            for element 3.2 rather than claiming it.
          </p>
        </section>
      </div>
    </div>
  `.toString();

  const steps = outlet.querySelector('#sra-steps');
  const strip = outlet.querySelector('#sra-strip');
  const list = outlet.querySelector('#sra-hazards');
  const verdictOut = outlet.querySelector('#sra-verdict');
  const systemForm = outlet.querySelector('#sra-system');
  const hazardForm = outlet.querySelector('#sra-hazard');
  const error = outlet.querySelector('#sra-error');

  const repaint = () => {
    const progress = sraProgress(sra);
    const verdict = sraVerdict(sra);

    steps.innerHTML = progress
      .map(
        (s) => html`<li>
          <a href="#step-${s.step.id === 'system' ? 'system' : 'hazards'}">
            ${s.step.ordinal}. ${s.step.name}
          </a>
          <span class="badge" data-status="${s.complete ? 'SAFE' : 'CAUTION'}">
            <span class="badge__label">${s.complete ? 'done' : 'open'}</span>
          </span>
        </li>`
      )
      .join('');

    strip.innerHTML = html`
      <div class="stat">
        <dt class="stat__value">${verdict.stepsComplete}/${verdict.stepsTotal}</dt>
        <dd class="stat__label">Steps complete</dd>
      </div>
      <div class="stat">
        <dt class="stat__value">${verdict.hazards}</dt>
        <dd class="stat__label">Hazards identified</dd>
      </div>
      <div class="stat">
        <dt class="stat__value">${verdict.intolerableRemaining}</dt>
        <dd class="stat__label">Still intolerable</dd>
      </div>
    `.toString();

    list.innerHTML = sra.hazards.length
      ? sra.hazards.map(HazardRow).join('')
      : html`<p class="empty-state">
          <span>No hazards yet. The first is usually the one that made somebody
          uneasy about the change in the first place.</span>
        </p>`.toString();

    verdictOut.dataset.state = verdict.readyToAccept ? 'ok' : 'error';
    verdictOut.innerHTML = verdict.readyToAccept
      ? html`<strong>Ready to be accepted</strong>
          <span class="calc__detail">
            Every step is complete and no risk remains intolerable. Acceptance is
            still a person's decision and a signature — this says the assessment
            is finished, not that the change is wise.
          </span>`.toString()
      : html`<strong>Not ready</strong>
          <span class="calc__detail">${verdict.blocker}</span>`.toString();
  };

  const persist = () => {
    if (!save(sra)) {
      error.textContent =
        'This assessment could not be saved to the browser — private browsing, ' +
        'or the storage is full. Print it before you leave the page.';
    }
  };

  systemForm.addEventListener('input', () => {
    sra = { ...sra, title: systemForm.elements.title.value, system: systemForm.elements.system.value };
    persist();
    repaint();
  });

  wireSelects(hazardForm);

  hazardForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const f = hazardForm.elements;
    const ownerPicked = f.owner.value;
    const owner =
      ownerPicked === OTHER
        ? (f.ownerOther?.value ?? '').trim()
        : (SAFETY_ROLES.find((r) => r.code === ownerPicked)?.label ?? '');

    if (!f.hazard.value.trim() || !f.consequence.value.trim() || !owner) {
      error.textContent = 'A hazard needs its condition, a credible consequence and an owner.';
      return;
    }

    const rs = f.residualSeverity.value;
    const rl = f.residualLikelihood.value;
    if (Boolean(rs) !== Boolean(rl)) {
      error.textContent =
        'A residual risk needs both a severity and a likelihood — one without the ' +
        'other cannot be placed on the matrix.';
      return;
    }
    error.textContent = '';

    sra = {
      ...sra,
      hazards: [
        ...sra.hazards,
        {
          id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          hazard: f.hazard.value.trim(),
          consequence: f.consequence.value.trim(),
          severity: f.severity.value || undefined,
          likelihood: f.likelihood.value || undefined,
          controls: f.controls.value.trim(),
          residualSeverity: rs || undefined,
          residualLikelihood: rl || undefined,
          owner,
          controlReviewed: f.controlReviewed.checked
        }
      ]
    };
    hazardForm.reset();
    persist();
    repaint();
  });

  list.addEventListener('click', (event) => {
    const id = event.target.closest?.('[data-remove]')?.dataset.remove;
    if (!id) return;
    if (!window.confirm('Remove this hazard from the assessment?')) return;
    sra = { ...sra, hazards: sra.hazards.filter((h) => h.id !== id) };
    persist();
    repaint();
    const next = list.querySelector('[data-remove]');
    if (next) next.focus();
  });

  outlet.querySelector('#sra-print').addEventListener('click', () => window.print());

  /* THE PACK IS ATTRIBUTED, or it carries no header at all. Not awaited:
     this screen renders instantly and must keep doing so, and an
     identity block that only matters on paper is not worth a network
     round trip in front of it. If the name never arrives the slot stays
     empty, which is the refusal printId() already implements. */
  void attachPrintId(outlet, 'Safety risk assessment — ICAO Doc 9859, five steps');

  repaint();
  void raw;
}
