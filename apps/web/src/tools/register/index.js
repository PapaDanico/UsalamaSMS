/* ============================================================
   NOTES ABOUT THE MARKUP, COLLECTED OUT OF THE TEMPLATE.

   An `<!-- -->` inside a tagged template literal is string content:
   no minifier removes it and every reporter downloads it. These read
   better collected, cost nothing here, and can hold a backtick safely.
   In the order the markup reaches them:

   1. WHERE IT CAME FROM. The question an auditor asks about a
      register is not only what is in it — it is how much of it the
      operator's own people found. A register of hazards somebody
      sat down and imagined is a different artefact from one fed by
      reporting, and only one of them is element 2.1 working.

   2. THE SIGNATURE, and what stands in for it when there cannot be
      one. Three states:
      already accepted — who signed and when, which is the line an
      auditor reads and the reason it is attributed to a person
      rather than to a post somebody typed;
      signable — a button, because the person pressing it is the
      person signing. The server decides whether they may: the
      band, the permission and RA 1210's escalation are all
      checked there, and its refusal is shown as written;
      device-only — said plainly. An acceptance recorded in one
      browser is a claim nobody can verify, and this product does
      not offer a control that produces one.

   3. no-print: a register taken to a safety meeting is the
      entries, the title and the health figures. A blank input
      form printed above them is a page of nothing that makes the
      reader turn over to find the register.

   4. ARRIVED FROM THE QUEUE, and said so before anything is
      typed. Without this the link is invisible until after the
      entry is filed, and somebody who opened the register from
      the menu in another tab would have no way to tell the two
      situations apart.
      IT NAMES NO REPORT. Not the title, not the reporter, not
      the date — a hazard is being written here for a register
      that gets printed, and the report it came from is protected
      and may be anonymous. The person raising it has just read
      the report in the queue; they do not need it repeated.
   ============================================================ */
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
import { attachPrintId } from '../../shared/print-id.js';
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

/* ACCEPTED IS NOT ON THIS LIST, and its absence is the change.

   It used to be, beside a dropdown headed "Accepted by" that offered
   every post in the operator — so accepting a risk was two form fields
   somebody filled in. Nothing checked whether the person filling them
   in held the acceptance permission, nothing recorded who actually did
   it, and nothing consulted the escalation rule this screen has stated
   beside the owner field since it was written.

   A name typed into a box is not a signature. Acceptance is now its own
   act, performed by the person doing it, against the row, on the
   server — which is also the only place a signature can be attributed
   to somebody an auditor can ask. */
const STATUSES = [
  ['OPEN', 'Open — assessed, not yet mitigated'],
  ['MITIGATED', 'Mitigated — controls in place'],
  ['CLOSED', 'Closed — no longer applicable']
];

const BADGE = { OPEN: 'ALERT', MITIGATED: 'CAUTION', ACCEPTED: 'SAFE', CLOSED: 'OFFLINE' };

/* Every entry is normalised on the way in. A probe put a single
   field-less entry in this store and the register rendered nothing at
   all — one bad row took twelve good ones with it, permanently, since
   the bad row was saved and crashed the page again on every load. A
   register that can be destroyed by one malformed row is not a
   register. See normaliseEntry(). */
/* AND AN UNREADABLE STORE IS NOT AN EMPTY ONE, which is the half this
   function did not have.
 *
 * The resilience above is right and it was reported wrong. A store that
 * would not parse — a full quota mid-write, a private window, a
 * half-synced profile — returned `[]`, and the screen rendered "Nothing
 * on the register yet. The first entry is usually the hazard behind the
 * last report somebody filed."
 *
 * That is the exact failure /today was fixed for: saying the most
 * reassuring possible thing at the moment it knows least. A safety
 * manager whose register cannot be read is told they have not started
 * one — and the reasonable next action after reading that is to type
 * the first entry, on top of a store that is already holding entries it
 * could not show them.
 *
 * The irony is twelve lines down: save() carries a comment citing
 * charter rule 8 — a refused write is reported, never swallowed — and
 * returns a boolean the caller surfaces. The READ path never got the
 * same treatment.
 *
 * So this returns null for "could not be read", distinct from [] for
 * "read, and empty". A row that will not normalise is still skipped,
 * because one malformed entry must not take twelve good ones with it —
 * that part was always correct. */
function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(normaliseEntry).filter(Boolean);
  } catch {
    return null;
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

  return html`<article class="card cov reg-entry" data-id="${entry.id}"
    data-tolerability="${shown?.t ?? ''}">
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
      <span class="reg-entry__nores"
        >${entry.source === 'REPORT' ? 'raised from a report' : 'entered directly'}</span
      >
      <button type="button" class="btn btn-ghost btn-sm" data-remove="${entry.id}">Remove</button>
    </p>

    <p class="reg-entry__meta">
      ${entry.acceptedAt
        ? html`<span class="verified"
            >Accepted${entry.acceptedBy ? html` by ${entry.acceptedBy}` : ''} on
            ${entry.acceptedAt}</span
          >`
        : entry.assessmentId
          ? html`<button
              type="button"
              class="btn btn-secondary btn-sm"
              data-accept="${entry.assessmentId}"
            >Accept this risk</button>`
          : html`<span class="reg-entry__nores"
              >On this device only — acceptance is signed at the safety office.</span
            >`}
      <span class="reg-entry__flag reg-said" role="status" aria-live="polite"></span>
    </p>
  </article>`;
}

export function render(outlet) {
  /* null means the store could not be read — see load(). Held
     separately so every consumer below still gets an array and nothing
     has to guard against a null it did not expect, while the screen
     keeps the one fact that matters: it does not know. */
  const loaded = load();
  const unreadable = loaded === null;
  let entries = loaded ?? [];

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

  /* ------------------------------------------------------------
     THE REPORT THIS ENTRY IS BEING RAISED FROM, if the safety officer
     arrived here from the queue rather than from the menu.

     AN ID AND NOTHING ELSE travels in the URL, deliberately. A URL is
     written to browser history, sent as a referrer and read over
     somebody's shoulder — and the title of a fatigue report is the
     sentence that identifies its author at a six-aircraft operator.
     The wording of the hazard is written here, by the person raising
     it, which is also what an SMS asks for: a hazard is the general
     condition abstracted from one or more reports, not a copy of one.

     Cleared once the entry is filed, so a second hazard typed in the
     same sitting is not silently attributed to the same report. */
  let fromReportId = new URLSearchParams(window.location.search).get('from') || '';

  /* Assigned at the bottom of this function, once the elements it
     repaints exist. Declared here so the acceptance handler can close
     over it — a signature is one of the two things on this screen that
     changes a row the server owns, and re-reading is how the screen
     learns what was recorded rather than inventing it locally. */
  let readFromServer = async () => {};

  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Toolkit</span>
        <h1>Risk register</h1>
      <div class="print-id-slot"></div>
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
      <aside class="toc mat-result no-print">
        <h2 class="section-title">Add an entry</h2>
        ${fromReportId
          ? html`<p class="notice">
              Raising this from a report in the queue. Write the hazard as the
              <strong>general condition</strong> — the register is read by people who
              cannot see the report, and it is shown to an inspector.
            </p>`
          : ''}
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
      <div class="stat" data-tone="${h.intolerableOpen ? 'alert' : ''}">
        <dt class="stat__value">${h.intolerableOpen}</dt>
        <dd class="stat__label">Intolerable and not accepted</dd>
      </div>
      <div class="stat" data-tone="${h.overdue ? 'alert' : ''}">
        <dt class="stat__value">${h.overdue}</dt>
        <dd class="stat__label">Past their review date</dd>
      </div>
      <div class="stat" data-tone="${h.unowned ? 'alert' : ''}">
        <dt class="stat__value">${h.unowned}</dt>
        <dd class="stat__label">With no owner</dd>
      </div>
      <div class="stat" data-tone="note">
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

    /* THREE STATES, NOT TWO. "Could not be read" is a different fact
       from "nothing here yet", and the reasonable next action after
       reading the second is to start typing — on top of a store that
       may already hold entries this screen could not show. The wording
       follows the risk picture's, which had this right first: it is not
       the same as there being none. */
    list.innerHTML = unreadable
      ? html`<p class="notice notice--error">
          <span>This register could not be read from this device — the stored copy is
          damaged or unavailable. That is not the same as it being empty. Nothing has
          been lost by opening this page, and anything already sent to the safety
          office is unaffected. Do not add an entry here until it reads again, or you
          will be typing on top of entries you cannot see.</span>
        </p>`.toString()
      : entries.length
        ? entries.map(Row).join('')
        : html`<p class="empty-state">
            <span>Nothing on the register yet. The first entry is usually the hazard
            behind the last report somebody filed.</span>
          </p>`.toString();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    /* THE REFUSAL, BECAUSE THE WARNING ABOVE IS ONLY WORDS.
     *
     * When the store could not be read, `entries` is an empty array —
     * so saving would write this one entry over whatever is actually
     * in there. The panel already says "do not add an entry until it
     * reads again", and this repository's own rule is that a claim is
     * kept by a MECHANISM rather than by asking. Telling somebody not
     * to do a thing the software will happily let them do is the same
     * defect as a coverage entry that overstates.
     *
     * Refused rather than queued: there is nowhere safe to queue it to.
     * The one store this screen has is the one that cannot be read. */
    if (unreadable) {
      error.textContent =
        'This register could not be read from this device, so nothing can be added to ' +
        'it — an entry saved now would be written over entries that are there and ' +
        'cannot be shown. Nothing you have typed has been lost from this form.';
      return;
    }

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
        ...(fromReportId ? { fromReportId, source: 'REPORT' } : {}),
        createdAt: new Date().toISOString()
      },
      ...entries
    ];
    const stored = save(entries);
    form.reset();
    /* One report, one raising. Leaving this set would attribute the
       next hazard typed in the same sitting to a report it has nothing
       to do with — a wrong link in a register is worse than no link,
       because it is the one an inspector follows. */
    fromReportId = '';
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
          status: added.status,
          ...(added.fromReportId ? { fromReportId: added.fromReportId } : {})
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

  /* ==========================================================
     SIGNING FOR A RISK.

     Everything that decides whether this is allowed lives on the
     server: the permission, the band, and RA 1210's escalation. This
     handler sends the act and shows the answer — it does not
     pre-judge, and deliberately so. A screen that hides the button
     from somebody it believes cannot sign teaches them nothing when
     it is wrong; a refusal that names the post that must sign tells
     them who to go to.

     THE ALARP STATEMENT IS ASKED FOR HERE, not after a 400. The
     server refuses an amber acceptance without one and that refusal
     is the control; asking first is the difference between a form
     that helps and one that scolds. Both still run.
     ========================================================== */
  list.addEventListener('click', async (event) => {
    const accept = event.target.closest?.('[data-accept]');
    if (accept) {
      const row = accept.closest('.reg-entry');
      const said = row?.querySelector('.reg-said');
      const entry = entries.find((e) => e.assessmentId === accept.dataset.accept);
      const shown =
        band(entry?.residualSeverity, entry?.residualLikelihood) ??
        band(entry?.severity, entry?.likelihood);

      let alarpJustification;
      if (shown?.t === 'TOLERABLE') {
        alarpJustification = window.prompt(
          'Accepting a tolerable risk\n\nA tolerable risk is only tolerable once it ' +
            'has been driven as low as reasonably practicable. Say what was done, and ' +
            'why going further is not reasonably practicable. This statement is the ' +
            'acceptance and it is recorded against your name.'
        );
        if (alarpJustification === null) return;
        if (!alarpJustification.trim()) {
          if (said) said.textContent = 'An acceptance with no ALARP statement is not one.';
          return;
        }
      }

      const label = accept.textContent;
      accept.disabled = true;
      accept.textContent = 'Signing…';
      try {
        const res = await authFetch(`/api/v1/register/${accept.dataset.accept}/accept`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(alarpJustification ? { alarpJustification } : {})
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          /* The server's own sentence. It names the band, or the post
             that has to sign instead, or says the risk is not ownable
             at all — every one of which is more use than "forbidden". */
          if (said) {
            said.textContent =
              body.message ?? 'The safety office could not be reached. Nothing was signed.';
          }
          return;
        }
        await readFromServer();
      } catch {
        if (said) {
          said.textContent =
            'No connection. Nothing was signed — an acceptance has to reach the safety ' +
            'office to be one.';
        }
      } finally {
        accept.disabled = false;
        accept.textContent = label;
      }
      return;
    }

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

  /* THE PACK IS ATTRIBUTED, or it carries no header at all. Not awaited:
     this screen renders instantly and must keep doing so, and an
     identity block that only matters on paper is not worth a network
     round trip in front of it. If the name never arrives the slot stays
     empty, which is the refusal printId() already implements. */
  void attachPrintId(outlet, 'Risk register — hazards, assessed and re-assessed');

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
  /* Named rather than inline, because the acceptance handler needs to
     run it again: a signature changes a row the server owns, and
     re-reading is how this screen learns who it recorded and when
     without guessing on the client. */
  readFromServer = async () => {
    if (!isSignedIn()) return;
    try {
      const res = await authFetch('/api/v1/register');
      if (!res.ok) return;
      const body = await res.json();
      const held = (body.entries ?? []).map(normaliseEntry).filter(Boolean);
      const known = new Set(held.map((e) => e.id));
      deviceOnly = entries.filter((e) => !known.has(e.id));
      source = 'server';
      entries = [...held, ...deviceOnly];
      save(entries);
      repaint();
    } catch {
      /* Offline. The device copy is still on screen and still correct
         about everything except what somebody else has done. */
    }
  };
  void readFromServer();

  void raw;
}
