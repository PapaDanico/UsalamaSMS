/* ============================================================
   The risk register — element 2.2.

   WHAT AN AUDIT ASKED FOR. "Hazard to consequence to control to
   residual risk, with owners, closure dates and executive acceptance",
   named the highest-impact and lowest-complexity addition. It is right
   on both counts: reporting produces hazards, and a hazard nobody has
   assessed is a hazard nobody has decided about.

   ON THIS DEVICE, and the honest consequence of that. Entries live in
   this browser, like the maturity assessment and the report draft.
   That means a safety manager can keep a register offline, print it,
   and take it to a meeting — and it means the register is NOT shared
   with the safety office, does not sync, and is not visible to anyone
   else. Element 2.2 is not closed by this; it moves from a matrix with
   no register to a register with no distribution, and the coverage
   page says exactly that rather than claiming the element.

   The arithmetic is the same tolerability() the matrix, the assessor
   and the methodology page use. Never stored — recomputed on every
   read, so an entry cannot carry a band that disagrees with the scale.
   ============================================================ */

import { html, raw } from '../../shared/html.js';
import { isSignedIn, authFetch } from '../../shared/session.js';
import { Select, wireSelects } from '../../components/Select.js';
import {
  requiredHolder,
  meetsRequirement
} from '../../../../../packages/shared/src/holder.ts';
import {
  tolerability,
  riskScore,
  SEVERITY_SCALE,
  LIKELIHOOD_SCALE
} from '../../../../../packages/shared/src/risk.ts';
import {
  registerHealth,
  normaliseEntry
} from '../../../../../packages/shared/src/maturity.ts';
import {
  SAFETY_ROLES,
  REVIEW_INTERVALS
} from '../../../../../packages/shared/src/posts.ts';

const STORE = 'usalamasms.register';

/* Same declaration as the matrix and the assessor. An entry scored on
   a severity worded differently from the matrix it is read against is
   an entry an auditor has to reconcile by hand. */
const options = (scale) => scale.map((p) => ({ value: p.key, label: `${p.code} — ${p.label}` }));

/* The taxonomy lists use { code, label }; the component wants
   { value, label }. One adapter rather than the same map four times. */
const toOptions = (list) => list.map((o) => ({ value: o.code, label: o.label }));

const OTHER = '__other__';

/* The register stores the owner's LABEL, because that is what a printed
   register has to read as. RA 1210's escalation needs the post CODE, so
   the label is mapped back here rather than storing both — two fields
   holding one fact is how they come to disagree. A label that is not a
   known post (the free-text escape) maps to nothing, and
   meetsRequirement() reports that as unknown rather than as too
   junior. */
const POST_BY_LABEL = new Map(SAFETY_ROLES.map((r) => [r.label, r.code]));

/* A date computed from an interval, which is what the dropdown means.
   Local calendar parts, not toISOString: a review date is a day in the
   operator's own week, and the UTC reading is wrong for three hours of
   every Nairobi morning — the same boundary registerHealth() gets
   right. */
function dateInDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const STATUSES = [
  ['OPEN', 'Open — assessed, not yet mitigated'],
  ['MITIGATED', 'Mitigated — controls in place'],
  ['ACCEPTED', 'Accepted — residual risk signed off'],
  ['CLOSED', 'Closed — no longer applicable']
];

const BADGE = { OPEN: 'ALERT', MITIGATED: 'CAUTION', ACCEPTED: 'SAFE', CLOSED: 'OFFLINE' };

/* Every entry is normalised on the way in. A probe put a single
   field-less entry in this store and the register rendered nothing at
   all — one bad row took twelve good ones with it, permanently, since
   the bad row was saved and crashed the page again on every load. A
   register that can be destroyed by one malformed row is not a
   register. See normaliseEntry(). */
function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normaliseEntry).filter(Boolean);
  } catch {
    return [];
  }
}

/* Charter rule 8: a refused write is reported, never swallowed.
   Before this returned a boolean, a full quota or a private window
   meant the entry appeared on the register, looked filed, and was gone
   on the next load. Silently losing an assessed hazard is worse than
   refusing to accept it, because only one of the two is noticed. */
function save(entries) {
  try {
    localStorage.setItem(STORE, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

function band(severity, likelihood) {
  if (!severity || !likelihood) return null;
  try {
    return { t: tolerability(severity, likelihood), score: riskScore(severity, likelihood) };
  } catch {
    return null;
  }
}

function Row(entry) {
  const initial = band(entry.severity, entry.likelihood);
  const residual = band(entry.residualSeverity, entry.residualLikelihood);
  const shown = residual ?? initial;

  return html`<article class="card cov reg-entry" data-id="${entry.id}">
    <div class="cov__head">
      <h3>${entry.hazard}</h3>
      <span class="badge" data-status="${BADGE[entry.status] ?? 'OFFLINE'}">
        <span class="badge__label">${entry.status.toLowerCase()}</span>
      </span>
    </div>

    <p class="cov__has"><strong>If it happens:</strong> ${entry.consequence}</p>

    <p class="reg-entry__risk">
      ${initial
        ? html`<span class="risk-chip" data-tolerability="${initial.t}"
            >${initial.score} initial</span
          >`
        : ''}
      ${residual
        ? html`<span class="risk-chip" data-tolerability="${residual.t}"
            >${residual.score} residual</span
          >`
        : html`<span class="reg-entry__nores">no controls assessed yet</span>`}
      ${shown && shown.t === 'INTOLERABLE' && entry.status !== 'ACCEPTED'
        ? html`<strong class="reg-entry__flag">Intolerable and not accepted</strong>`
        : ''}
    </p>

    ${entry.controls
      ? html`<p class="cov__missing"><strong>Controls:</strong> ${entry.controls}</p>`
      : ''}

    ${shown
      ? html`<p class="reg-entry__escalation">
          ${(() => {
            /* RA 1210's escalation, stated where the owner is read.
               Doc 9859 says what a risk IS and almost nothing about who
               may carry it, and in a small operator that silence
               resolves the wrong way: whoever assessed the hazard puts
               their own name in the box, and the amber risk ends up
               owned by the person least able to spend money on it.

               STATED, NOT ENFORCED. The owner field has a free-text
               escape because a small operator's real titles are not
               this product's enum — "the Director" may genuinely be the
               accountable executive — so an unrecognised post is
               reported as unknown and the reader decides. Refusing
               would make the product argue with an operator about its
               own org chart. */
            const need = requiredHolder(shown.t);
            const verdict = meetsRequirement(shown.t, POST_BY_LABEL.get(entry.owner));
            if (verdict === 'meets') return '';
            return verdict === 'below'
              ? html`<strong>Owned below the level this band asks for.</strong>
                  ${need.because}`
              : html`<span>${need.because}</span>`;
          })()}
        </p>`
      : ''}

    <p class="reg-entry__meta">
      <span>${entry.owner || 'No owner'}</span>
      <span>review by ${entry.reviewBy || 'no date'}</span>
      ${entry.acceptedBy ? html`<span>accepted by ${entry.acceptedBy}</span>` : ''}
      <button type="button" class="btn btn-ghost btn-sm" data-remove="${entry.id}">Remove</button>
    </p>
  </article>`;
}

export function render(outlet) {
  let entries = load();

  /* WHERE THE REGISTER LIVES, and it is shown on screen rather than
     assumed. 'device' until the organisation's register answers: a
     safety manager who thinks the safety office can see their entries
     when it cannot has a register with no distribution and does not
     know it — which is precisely the gap /coverage described. */
  let source = 'device';

  /* Entries the safety office has never heard of. Counted rather than
     assumed to be zero: once the screen says "Safety office", a reader
     takes that to mean an inspector could be shown all of it, and any
     entry filed here before signing in is not covered by that
     sentence. Naming the number is the difference between a register
     with partial distribution and a register that claims full. */
  let deviceOnly = [];

  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Toolkit</span>
        <h1>Risk register</h1>
        <p class="lede">
          Hazard, consequence, controls, residual risk — with an owner and a
          review date, which are the two fields an auditor checks first. The
          bands are computed by the same ICAO Doc 9859 scale as the matrix, never
          stored, so an entry cannot carry a band that disagrees with it.
        </p>
        <dl class="stat-strip" id="reg-health"></dl>
      </div>
    </section>

    <div class="panel wrap doc">
      <!-- no-print: a register taken to a safety meeting is the
           entries, the title and the health figures. A blank input
           form printed above them is a page of nothing that makes the
           reader turn over to find the register. -->
      <aside class="toc mat-result no-print">
        <h2 class="section-title">Add an entry</h2>
        <form id="reg-form" novalidate>
          <label class="field">
            <span class="field-label">The hazard *</span>
            <input class="input-field" name="hazard" required />
          </label>
          <label class="field">
            <span class="field-label">If it happens, what is the consequence? *</span>
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
            label: 'Likelihood, before controls',
            value: 'REMOTE',
            placeholder: 'Choose a likelihood',
            options: options(LIKELIHOOD_SCALE)
          })}

          <label class="field">
            <span class="field-label">Controls</span>
            <textarea class="input-field" name="controls" rows="2"></textarea>
            <span class="field-hint">
              Leave blank until something is actually in place. An entry with no
              controls carries its initial risk, which is the honest number.
            </span>
          </label>

          ${Select({
            name: 'residualSeverity',
            label: 'Severity, after controls',
            placeholder: 'Not assessed yet',
            options: options(SEVERITY_SCALE)
          })}
          ${Select({
            name: 'residualLikelihood',
            label: 'Likelihood, after controls',
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
            otherPlaceholder: 'The post, as your organisation names it',
            hint:
              'A post, not a department. Typed owners become "Ops", "ops" and ' +
              '"Ops dept" — three owners of one hazard, none of which can be counted.'
          })}

          ${Select({
            name: 'reviewInterval',
            label: 'Review by *',
            value: '90',
            placeholder: 'Choose when this is looked at again',
            options: [
              ...toOptions(REVIEW_INTERVALS),
              { value: OTHER, label: 'On a specific date…' }
            ]
          })}
          <label class="field" id="reviewby-field" hidden>
            <span class="field-label">Review date</span>
            <input class="input-field" type="date" name="reviewBy" />
          </label>

          ${Select({
            name: 'status',
            label: 'Status',
            value: 'OPEN',
            placeholder: 'Choose a status',
            options: STATUSES.map(([value, label]) => ({ value, label }))
          })}

          ${Select({
            name: 'acceptedBy',
            label: 'Accepted by',
            placeholder: 'Not accepted yet',
            options: toOptions(SAFETY_ROLES),
            otherValue: OTHER,
            otherLabel: 'Another post…',
            otherPlaceholder: 'The post that accepted it',
            hint:
              "Only for an accepted residual risk, and only a post that can accept " +
              "it on the operator's behalf."
          })}

          <button type="submit" class="btn btn-primary btn-block">Add to register</button>
          <p class="field-error" id="reg-error" role="status" aria-live="polite"></p>
        </form>
        <p class="mat-actions no-print">
          <button type="button" class="btn btn-secondary btn-sm" id="reg-print">
            Print or save as PDF
          </button>
        </p>
      </aside>

      <div class="doc__body">
        <section class="doc-section">
          <h2>The register</h2>
          <p class="note">
            <b>On this device only</b>
            Entries live in this browser. They are not sent anywhere, not shared
            with the safety office, and not visible to anyone else — so this is a
            register a safety manager can keep and print, not yet one an
            organisation shares. <a href="/coverage#c-2">Coverage</a> says so
            rather than claiming the element.
          </p>
          <div id="reg-list"></div>
        </section>
      </div>
    </div>
  `.toString();

  const list = outlet.querySelector('#reg-list');
  const health = outlet.querySelector('#reg-health');
  const form = outlet.querySelector('#reg-form');
  const error = outlet.querySelector('#reg-error');

  const repaint = () => {
    const h = registerHealth(entries, new Date());
    health.innerHTML = html`
      <div class="stat">
        <dt class="stat__value">${h.total}</dt>
        <dd class="stat__label">Entries</dd>
      </div>
      <div class="stat">
        <dt class="stat__value">${h.intolerableOpen}</dt>
        <dd class="stat__label">Intolerable and not accepted</dd>
      </div>
      <div class="stat">
        <dt class="stat__value">${h.overdue}</dt>
        <dd class="stat__label">Past their review date</dd>
      </div>
      <div class="stat">
        <dt class="stat__value">${h.unowned}</dt>
        <dd class="stat__label">With no owner</dd>
      </div>
      <div class="stat">
        <dt class="stat__value">${source === 'server' ? 'Safety office' : 'This device'}</dt>
        <dd class="stat__label">
          ${source === 'server'
            ? deviceOnly.length
              ? `Held for the operator — but ${deviceOnly.length} ` +
                `${deviceOnly.length === 1 ? 'entry is' : 'entries are'} still ` +
                'only on this device'
              : 'Held for the operator — an inspector can be shown these'
            : 'Sign in and these reach the safety office'}
        </dd>
      </div>
    `.toString();

    list.innerHTML = entries.length
      ? entries.map(Row).join('')
      : html`<p class="empty-state">
          <span>Nothing on the register yet. The first entry is usually the hazard
          behind the last report somebody filed.</span>
        </p>`.toString();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const f = form.elements;

    /* The owner and the acceptor are dropdowns with a free-text escape,
       so the value is either a post code or OTHER plus what was typed.
       Resolved once, here, rather than at every read. */
    const label = (name) => {
      const picked = f[name]?.value ?? '';
      if (picked === OTHER) return (f[`${name}Other`]?.value ?? '').trim();
      const match = SAFETY_ROLES.find((r) => r.code === picked);
      return match ? match.label : picked;
    };

    /* The review date is computed from the interval, except where a
       specific date was asked for. Never both — an entry carrying an
       interval AND a date is an entry where the two can disagree. */
    const interval = f.reviewInterval?.value ?? '';
    const reviewBy = interval === OTHER ? (f.reviewBy?.value ?? '') : interval ? dateInDays(interval) : '';

    const owner = label('owner');
    const required = { hazard: f.hazard.value.trim(), consequence: f.consequence.value.trim() };
    const missing = Object.values(required).some((v) => !v) || !owner || !reviewBy;
    if (missing) {
      error.textContent =
        'An entry needs a hazard, its consequence, an owner and a review date. ' +
        'The last two are what make it a register rather than a list.';
      return;
    }
    error.textContent = '';

    /* A residual severity without its likelihood, or the reverse, is
       half an assessment. It used to be stored and then silently
       ignored by the arithmetic, so the entry displayed "no controls
       assessed yet" while carrying a residual severity nobody could
       see. Ask for the other half instead. */
    const rs = f.residualSeverity.value;
    const rl = f.residualLikelihood.value;
    if (Boolean(rs) !== Boolean(rl)) {
      error.textContent =
        'A residual risk needs both a severity and a likelihood. One without ' +
        'the other cannot be placed on the matrix, so it would be stored and ' +
        'never counted.';
      (rs ? f.residualLikelihood : f.residualSeverity).focus();
      return;
    }

    entries = [
      {
        id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        hazard: f.hazard.value.trim(),
        consequence: f.consequence.value.trim(),
        severity: f.severity.value,
        likelihood: f.likelihood.value,
        controls: f.controls.value.trim(),
        residualSeverity: f.residualSeverity.value || undefined,
        residualLikelihood: f.residualLikelihood.value || undefined,
        owner,
        reviewBy,
        status: f.status.value,
        acceptedBy: label('acceptedBy') || undefined,
        createdAt: new Date().toISOString()
      },
      ...entries
    ];
    const stored = save(entries);
    form.reset();
    repaint();

    /* THE SERVER IS THE RECORD WHEN THERE IS ONE. Same shape as the
       indicators: post it, and take the row back out if the server
       refuses rather than leaving an entry on screen that the register
       does not have. An entry that looks filed and is not is worse than
       one nobody wrote down, because the second gets written again. */
    const added = entries[0];
    if (source === 'server') {
      authFetch('/api/v1/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hazard: added.hazard,
          consequence: added.consequence,
          severity: added.severity,
          likelihood: added.likelihood,
          ...(added.controls ? { controls: added.controls } : {}),
          ...(added.residualSeverity && added.residualLikelihood
            ? {
                residualSeverity: added.residualSeverity,
                residualLikelihood: added.residualLikelihood
              }
            : {}),
          ...(added.owner ? { owner: added.owner } : {}),
          ...(added.reviewBy ? { reviewBy: added.reviewBy } : {}),
          status: added.status
        })
      })
        .then(async (res) => {
          if (res.ok) {
            /* ADOPT THE SERVER'S ID. The entry was created here with a
               locally generated id and the server stored it under its
               own; leaving the two different means the next load reads
               the same hazard twice — once from the server and once
               from this device — and a register that lists every entry
               twice after a reload is a register nobody trusts to
               count. Taking the server's id makes the two copies one
               row, which is what lets the read below keep device-only
               work without duplicating anything. */
            const created = await res.json().catch(() => ({}));
            const serverId = created.entry?.id;
            if (serverId && serverId !== added.id) {
              const at = entries.findIndex((x) => x.id === added.id);
              if (at >= 0) {
                entries[at] = { ...entries[at], id: serverId };
                save(entries);
                repaint();
              }
            }
            return;
          }
          const detail = await res.json().catch(() => ({}));
          entries = entries.filter((x) => x.id !== added.id);
          save(entries);
          repaint();
          error.textContent =
            detail.detail?.formErrors?.[0] ??
            detail.message ??
            'The safety office could not be reached — this entry was not filed.';
        })
        .catch(() => {
          error.textContent =
            'No connection — this entry is on the device and has not reached the ' +
            'safety office yet.';
        });
    }
    if (!stored) {
      error.textContent =
        'This entry is on the register for this sitting, but it could NOT be ' +
        'saved to this browser — private browsing, or the storage is full. It ' +
        'will be gone when you leave the page. Print it before you do.';
    }
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-remove]');
    const id = button?.dataset.remove;
    if (!id) return;

    // Removing an assessed hazard is not undoable and there is no copy
    // anywhere else. Ask.
    const entry = entries.find((e) => e.id === id);
    const confirmed = window.confirm(
      `Remove "${entry?.hazard || 'this entry'}" from the register?\n\n` +
        'This cannot be undone, and the entry exists nowhere else.'
    );
    if (!confirmed) return;

    entries = entries.filter((e) => e.id !== id);
    const stored = save(entries);
    repaint();
    if (!stored) {
      error.textContent =
        'The entry was removed from this view, but the change could not be ' +
        'saved to this browser. It may come back when you reload.';
    }

    /* The list is rebuilt wholesale, so the button that was just
       activated no longer exists and focus falls to <body> — a
       keyboard or screen-reader user loses their place in the
       register entirely. Put them on the next entry's control, or on
       the list itself when that was the last one. */
    const next = list.querySelector('[data-remove]');
    if (next) next.focus();
    else {
      list.setAttribute('tabindex', '-1');
      list.focus();
    }
  });

  /* The date input is revealed only by the "on a specific date" option,
     and required only then. A `required` field that is hidden blocks a
     submit the person cannot see the cause of. */
  /* Without this the "Another post…" option selects and nothing
     appears — a dead escape hatch, which is worse than no escape at
     all: the person picks the nearest wrong post from the list and the
     register records an owner who is not the owner. The report form and
     the triage queue both wire theirs; this screen was added later and
     did not, and only a check that actually selected the sentinel would
     ever have noticed. */
  wireSelects(form);

  const intervalSelect = form.elements.reviewInterval;
  const reviewByField = outlet.querySelector('#reviewby-field');
  const syncReviewBy = () => {
    const specific = intervalSelect.value === OTHER;
    reviewByField.hidden = !specific;
    form.elements.reviewBy.required = specific;
  };
  intervalSelect.addEventListener('change', syncReviewBy);
  syncReviewBy();

  outlet.querySelector('#reg-print').addEventListener('click', () => window.print());

  repaint();

  /* Read the organisation's register last, so the screen is usable
     before the network answers. A failure leaves the device copy in
     place: working offline is a supported way to use this product, not
     an error state.

     A SERVER READ MUST NEVER DELETE WORK THAT ONLY EXISTS HERE, and
     the first version of this did exactly that. It assigned the server
     list straight over `entries` and saved it, so a signed-in safety
     manager whose organisation had no server-side register yet — which
     is EVERY existing user on the first load after this ships, because
     the server side arrives in the same release — opened the screen
     and watched an empty register overwrite their own. No click, no
     confirmation, no undo, and nothing on screen to say it had
     happened. It is the same fault as the unguarded "Clear answers"
     button, minus the button.

     So the two lists are unioned by id, server first. Entries the
     safety office holds are authoritative for anything it knows
     about; anything it has never heard of stays exactly where it is.

     THE HONEST COST, stated rather than hidden: there is no delete
     synchronisation yet, so an entry removed on another device can
     reappear here. That is the right way round. A hazard that comes
     back is visible and can be removed again; a hazard silently
     deleted is not noticed at all, and this register exists to be the
     thing that was not forgotten. */
  if (isSignedIn()) {
    authFetch('/api/v1/register')
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        const held = (body.entries ?? []).map(normaliseEntry).filter(Boolean);
        const known = new Set(held.map((e) => e.id));
        deviceOnly = entries.filter((e) => !known.has(e.id));
        source = 'server';
        entries = [...held, ...deviceOnly];
        save(entries);
        repaint();
      })
      .catch(() => {});
  }

  void raw;
}
