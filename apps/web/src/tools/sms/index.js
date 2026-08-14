/* ============================================================
   THE SMS RECORD — the eight Annex 19 elements the organisation holds.

   WHY ONE SCREEN AND NOT EIGHT. Every other surface in this product is
   one question: file a report, work the queue, assess a change. This
   one is a different kind of thing — it is the folder an auditor asks
   for, and an auditor asks for it as a whole. Splitting it into eight
   routes would make the framework invisible at exactly the moment
   somebody is trying to see whether their framework is complete.

   So: the four Annex 19 components, in ICAO's order, each holding its
   elements, each element showing what the organisation actually has
   and offering the one action that adds to it. The structure is read
   from SMS_COMPONENTS — the same declaration the maturity assessment
   and the coverage table render from — so an element cannot appear
   here under a name the framework does not use.

   THIS IS THE ORGANISATION'S RECORD, NOT THIS DEVICE'S, and that is
   the whole difference from the toolkits. Every read and write goes to
   the API, is scoped to the caller's operator in SQL, and appends to
   the audit chain. It needs a session, and it says so rather than
   rendering an empty folder to somebody who is simply signed out.
   ============================================================ */

import { html, raw } from '../../shared/html.js';
import { isSignedIn, getSession, authFetch } from '../../shared/session.js';
import { printId, loadOrg } from '../../shared/print-id.js';
import { SMS_COMPONENTS } from '../../../../../packages/shared/src/maturity.ts';
import { can } from '../../../../../packages/shared/src/index.ts';
import { currencyOf, currencySummary } from '../../../../../packages/shared/src/currency.ts';
import {
  VOLUNTARY_REQUIREMENTS,
  VOLUNTARY_PROTECTION,
  unanswered
} from '../../../../../packages/shared/src/voluntary.ts';

/* Which element each surface belongs to, so the screen is assembled
   from the framework rather than from a list somebody typed in this
   file. The endpoint and the shape are what differ; the ordering,
   naming and grouping all come from SMS_COMPONENTS. */
const SURFACES = {
  '1.1': {
    key: 'policy',
    endpoint: '/api/v1/sms/policy',
    collection: 'policies',
    action: 'Draft a new version',
    permission: 'policy.draft'
  },
  '1.2': {
    key: 'accountabilities',
    endpoint: '/api/v1/sms/accountabilities',
    collection: 'accountabilities',
    action: 'Add an accountability',
    permission: 'accountability.manage'
  },
  '1.3': {
    key: 'appointments',
    /* Read with the accountabilities — the matrix and who holds each
       post are one screen and one round trip. WRITTEN somewhere else,
       because an appointment is a different row with a different
       schema: posting it to the read endpoint is a 400 that looks
       like a validation problem with the form. */
    endpoint: '/api/v1/sms/accountabilities',
    postEndpoint: '/api/v1/sms/appointments',
    collection: 'appointments',
    action: 'Record an appointment',
    permission: 'appointment.manage'
  },
  '1.4': {
    key: 'exercises',
    endpoint: '/api/v1/sms/exercises',
    collection: 'exercises',
    action: 'Record an exercise',
    permission: 'erp.manage',
    /* ELEMENT 1.4 IS TWO RECORDS, AND ONLY THIS ONE HAS TWO.

       The exercise answers what an INSPECTOR asks — was a plan
       exercised, what did it find, did the plan change. The contact
       directory answers what an OPERATOR needs at three in the
       morning: who to call, in what order, with what authority.
       Annex 19's element is "COORDINATION of emergency response
       planning", and coordination is a list of people outside the
       organisation who have agreed to answer.

       Kept as a second collection under one element rather than
       promoted to its own screen, because they are one element and
       splitting them would put half of 1.4's evidence where nobody
       looking at 1.4 would find it. */
    secondary: {
      key: 'contacts',
      endpoint: '/api/v1/sms/contacts',
      collection: 'contacts',
      title: 'The contact directory',
      action: 'Add a contact',
      permission: 'erp.manage'
    }
  },
  '1.5': {
    key: 'documents',
    endpoint: '/api/v1/sms/documents',
    collection: 'documents',
    action: 'Add a controlled document',
    permission: 'document.manage'
  },
  '3.3': {
    key: 'findings',
    endpoint: '/api/v1/sms/findings',
    collection: 'findings',
    action: 'Raise a finding',
    permission: 'sms.audit.conduct'
  },
  '4.1': {
    key: 'training',
    endpoint: '/api/v1/sms/training',
    collection: 'training',
    action: 'Record training',
    permission: 'training.manage'
  },
  '4.2': {
    key: 'communications',
    endpoint: '/api/v1/sms/communications',
    collection: 'communications',
    action: 'Publish a bulletin',
    permission: 'communication.publish'
  }
};

/* The four elements this screen does NOT hold, and where they live
   instead. Stated rather than omitted: an element missing from a
   framework view reads as an element the product forgot, and the whole
   point of this screen is that somebody can see whether their SMS is
   complete. */
const ELSEWHERE = {
  '2.1': { href: '/report', label: 'Reporting is the report form and the queue' },
  '2.2': { href: '/toolkits/register', label: 'The risk register' },
  '3.1': { href: '/toolkits/spi', label: 'Safety performance indicators' },
  '3.2': { href: '/toolkits/sra', label: 'The safety risk assessment' }
};

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

/* ---------------------------------------------------------------
   How each element's records read. One function per element rather
   than a generic table, because what an auditor looks for differs —
   a policy is read for its signature, a finding for whether it was
   verified, a training record for whether it has lapsed.
   --------------------------------------------------------------- */
/* THE DIRECTORY'S OWN VOCABULARY. "Never confirmed" is deliberately not
   the same badge as "out of date": one needs somebody to establish the
   contact exists at all, the other needs a call. Colour is never the
   only channel — the label says it. */
const FRESH_LABEL = {
  CURRENT: 'confirmed',
  DUE_SOON: 'confirm soon',
  STALE: 'out of date',
  NEVER_VERIFIED: 'never confirmed'
};
const FRESH_STATUS = {
  CURRENT: 'SAFE',
  DUE_SOON: 'CAUTION',
  STALE: 'ALERT',
  NEVER_VERIFIED: 'ALERT'
};

const RENDER = {
  policy: (rows) =>
    rows.map(
      (p) => html`<article class="rec" data-state="${p.signedOn ? 'ok' : 'open'}">
        <div class="rec__head">
          <h4>Version ${p.version}${p.supersededOn ? ' · superseded' : ''}</h4>
          <span class="badge" data-status="${p.signedOn ? 'SAFE' : 'CAUTION'}">
            <span class="badge__label">${p.signedOn ? 'signed' : 'unsigned'}</span>
          </span>
        </div>
        <p class="rec__body">${p.statement}</p>
        <p class="rec__meta">
          <span>${p.signedOn ? `Signed by ${p.signedBy?.name ?? 'the accountable executive'}` : 'Not yet signed'}</span>
          <span>${fmtDate(p.signedOn)}</span>
          <span>${p._count?.reads ?? 0} ${(p._count?.reads ?? 0) === 1 ? 'person has' : 'people have'} read it</span>
        </p>
      </article>`
    ),

  accountabilities: (rows) =>
    rows.map(
      (a) => html`<article class="rec">
        <div class="rec__head"><h4>${a.post}</h4>
          ${a.elementId ? html`<span class="tag">element ${a.elementId}</span>` : ''}</div>
        <p class="rec__body">${a.responsibility}</p>
      </article>`
    ),

  appointments: (rows) =>
    rows.map(
      (a) => html`<article class="rec">
        <div class="rec__head"><h4>${a.post}</h4></div>
        <p class="rec__meta">
          <span>${a.user?.name ?? 'Unnamed'}</span>
          <span>since ${fmtDate(a.appointedOn)}</span>
          <span>${a.letterRef ? `letter ${a.letterRef}` : 'no letter reference'}</span>
        </p>
      </article>`
    ),

  contacts: (rows) =>
    rows.map(
      (c) => html`<article class="rec" data-state="${c.freshness === 'CURRENT' ? 'ok' : 'open'}">
        <div class="rec__head">
          <h4>${c.callOrder ? `${c.callOrder}. ` : ''}${c.name}</h4>
          <span class="badge" data-status="${FRESH_STATUS[c.freshness]}">
            <span class="badge__label">${FRESH_LABEL[c.freshness]}</span>
          </span>
        </div>
        <p class="rec__body"><strong>${c.role}</strong>${c.organisation ? ` · ${c.organisation}` : ''}</p>
        <!-- A TELEPHONE LINK, because this list is read on a handset by
             somebody who needs to dial it, not copy it out. -->
        <p class="rec__body"><a href="tel:${c.phone.replace(/[^+0-9]/g, '')}">${c.phone}</a>${c.altPhone ? ` · ${c.altPhone}` : ''}</p>
        ${c.authority ? html`<p class="rec__body"><strong>Can authorise:</strong> ${c.authority}</p>` : ''}
        <p class="rec__meta">
          <span>${c.verifiedOn ? `Confirmed ${fmtDate(c.verifiedOn)}` : 'Never confirmed'}</span>
        </p>
        ${allow('erp.manage')
          ? html`<p class="rec__meta no-print">
              <button type="button" class="btn btn-ghost btn-sm" data-verify-contact="${c.id}">
                I have confirmed this number
              </button>
            </p>`
          : ''}
      </article>`
    ),

  exercises: (rows) =>
    rows.map(
      (e) => html`<article class="rec" data-state="${e.planUpdated ? 'ok' : 'open'}">
        <div class="rec__head"><h4>${fmtDate(e.heldOn)}</h4>
          <span class="badge" data-status="${e.planUpdated ? 'SAFE' : 'CAUTION'}">
            <span class="badge__label">${e.planUpdated ? 'plan updated' : 'plan unchanged'}</span>
          </span></div>
        <p class="rec__body">${e.scenario}</p>
        <p class="rec__body"><strong>Findings:</strong> ${e.findings}</p>
        <p class="rec__meta"><span>${e.participants}</span></p>
      </article>`
    ),

  documents: (rows) =>
    rows.map(
      (d) => html`<article class="rec">
        <div class="rec__head"><h4>${d.reference} · ${d.title}</h4>
          <span class="tag">v${d.version}</span></div>
        <p class="rec__meta">
          <span>${d.approvedBy?.name ? `Approved by ${d.approvedBy.name}` : 'Not approved'}</span>
          <span>${fmtDate(d.approvedOn)}</span>
          <span>${d.reviewBy ? `review by ${fmtDate(d.reviewBy)}` : 'no review date'}</span>
        </p>
      </article>`
    ),

  findings: (rows) =>
    rows.map((f) => {
      /* CLOSED IS NOT VERIFIED, and the screen says which. An operator
         reading a list where both look the same is exactly how a closed
         finding that never worked survives an audit. */
      const state = f.verifiedOn ? 'ok' : f.closedOn ? 'part' : 'open';
      const word = f.verifiedOn ? 'verified' : f.closedOn ? 'closed, not verified' : 'open';
      return html`<article class="rec" data-state="${state}">
        <div class="rec__head"><h4>${f.auditRef}</h4>
          <span class="badge" data-status="${f.verifiedOn ? 'SAFE' : f.closedOn ? 'CAUTION' : 'ALERT'}">
            <span class="badge__label">${word}</span>
          </span></div>
        <p class="rec__body">${f.finding}</p>
        ${f.correctiveAction ? html`<p class="rec__body"><strong>Action:</strong> ${f.correctiveAction}</p>` : ''}
        <p class="rec__meta">
          <span>${f.severity.toLowerCase()}</span>
          <span>${f.ownerPost}</span>
          <span>${f.dueBy ? `due ${fmtDate(f.dueBy)}` : 'no due date'}</span>
          ${f.elementId ? html`<span>element ${f.elementId}</span>` : ''}
        </p>
      </article>`;
    }),

  /* ELEMENT 4.1, THE ANTICIPATION HALF.

     This compared two date STRINGS and rendered lapsed or current —
     which is precisely what /coverage said was missing: "an expired
     row is visible to somebody who opens the screen; nothing tells an
     operator a currency is about to lapse". A recurrent lapsing next
     Tuesday looked identical to one lapsing in a year, so the only way
     to act in time was to open the screen on the right day and do the
     subtraction by eye.

     currencyOf() computes four states from the dates already stored,
     with a window proportional to each record's own validity — the
     reasoning is in currency.ts and the short end is the point. The
     summary above the list is the number a safety manager actually
     wants, because "is there anything I must do about training" is one
     question and two counts make it a subtraction.

     The badge still carries a WORD as well as a colour. Amber alone is
     a state a colour-blind reader does not have. */
  training: (rows) => {
    const today = new Date();
    const records = rows.map((t) => ({
      row: t,
      verdict: currencyOf(
        {
          completedOn: new Date(t.completedOn),
          expiresOn: t.expiresOn ? new Date(t.expiresOn) : null
        },
        today
      )
    }));
    const summary = currencySummary(
      records.map((r) => ({
        completedOn: new Date(r.row.completedOn),
        expiresOn: r.row.expiresOn ? new Date(r.row.expiresOn) : null
      })),
      today
    );

    const BADGE = { LAPSED: 'ALERT', DUE_SOON: 'CAUTION', CURRENT: 'SAFE', NO_EXPIRY: 'OFFLINE' };
    const WORD = {
      LAPSED: 'lapsed',
      DUE_SOON: 'lapses soon',
      CURRENT: 'current',
      NO_EXPIRY: 'no expiry'
    };

    const head = summary.total
      ? html`<p class="note" data-currency-summary>
          <b
            >${summary.needsAttention
              ? `${summary.needsAttention} of ${summary.total} need attention`
              : 'Nothing lapsing'}</b
          >
          ${summary.lapsed ? `${summary.lapsed} lapsed. ` : ''}${summary.dueSoon
            ? `${summary.dueSoon} lapse within their warning window. `
            : ''}${summary.soonestDays !== null
            ? `The next is ${summary.soonestDays === 0 ? 'today' : `in ${summary.soonestDays} day${summary.soonestDays === 1 ? '' : 's'}`}.`
            : 'No record here carries an expiry date.'}
        </p>`
      : '';

    return [
      head,
      ...records.map(({ row: t, verdict }) => {
        const state = verdict.state;
        return html`<article
          class="rec"
          data-state="${state === 'CURRENT' || state === 'NO_EXPIRY' ? 'ok' : 'open'}"
        >
          <div class="rec__head">
            <h4>${t.user?.name ?? 'Unnamed'}</h4>
            <span class="badge" data-status="${BADGE[state]}">
              <span class="badge__label">${WORD[state]}</span>
            </span>
          </div>
          <p class="rec__meta">
            <span>${t.course}</span>
            <span>completed ${fmtDate(t.completedOn)}</span>
            <span>${t.expiresOn ? `expires ${fmtDate(t.expiresOn)}` : 'no expiry'}</span>
            ${state === 'DUE_SOON'
              ? html`<span>in ${verdict.daysLeft} day${verdict.daysLeft === 1 ? '' : 's'}</span>`
              : ''}
            ${state === 'LAPSED'
              ? html`<span>${Math.abs(verdict.daysLeft)} day${verdict.daysLeft === -1 ? '' : 's'} ago</span>`
              : ''}
          </p>
        </article>`;
      })
    ];
  },

  communications: (rows) =>
    rows.map(
      (c) => html`<article class="rec">
        <div class="rec__head"><h4>${c.title}</h4>
          ${c.reportId ? html`<span class="tag">feedback to a reporter</span>` : ''}</div>
        <p class="rec__body">${c.body}</p>
        <p class="rec__meta">
          <span>${c.publishedBy?.name ?? 'Unnamed'}</span>
          <span>${fmtDate(c.publishedOn)}</span>
        </p>
      </article>`
    )
};

/* The one action each element offers, as fields. Deliberately the
   smallest set that makes the record real — an auditor asks for the
   signature and the date, not for twelve optional columns. */
const FORMS = {
  policy: [{ name: 'statement', label: 'The safety policy', type: 'textarea', rows: 6, required: true }],
  accountabilities: [
    { name: 'post', label: 'Post', required: true },
    { name: 'responsibility', label: 'What this post is accountable for', type: 'textarea', rows: 3, required: true },
    { name: 'elementId', label: 'Annex 19 element (optional)', placeholder: '2.1' }
  ],
  appointments: [
    { name: 'post', label: 'Post', required: true },
    { name: 'userId', label: 'Person', type: 'people', required: true },
    { name: 'appointedOn', label: 'Appointed on', type: 'date', required: true },
    { name: 'letterRef', label: 'Appointment letter reference' }
  ],
  contacts: [
    { name: 'name', label: 'Name', required: true },
    { name: 'role', label: 'What they are for', required: true,
      placeholder: 'KCAA duty officer' },
    { name: 'organisation', label: 'Organisation' },
    /* NOT type="tel" AND NOT VALIDATED. A call list holds satellite
       numbers, extensions, radio frequencies and "ask Wilson tower for
       the duty engineer". A field that refuses any of those pushes the
       real answer into the notes, where nobody dials it from. */
    { name: 'phone', label: 'Number to call', required: true },
    { name: 'altPhone', label: 'Second number' },
    { name: 'callOrder', label: 'Position in the call-out order', type: 'number' },
    { name: 'authority', label: 'What they can authorise', type: 'textarea', rows: 2 }
  ],
  exercises: [
    { name: 'scenario', label: 'Scenario', type: 'textarea', rows: 3, required: true },
    { name: 'heldOn', label: 'Held on', type: 'date', required: true },
    { name: 'participants', label: 'Who took part', required: true },
    { name: 'findings', label: 'What it found', type: 'textarea', rows: 3, required: true },
    { name: 'planUpdated', label: 'The plan was changed as a result', type: 'checkbox' }
  ],
  documents: [
    { name: 'reference', label: 'Reference', required: true, placeholder: 'SMS-001' },
    { name: 'title', label: 'Title', required: true },
    { name: 'version', label: 'Version', required: true, placeholder: '3.0' },
    { name: 'reviewBy', label: 'Review by', type: 'date' }
  ],
  findings: [
    { name: 'auditRef', label: 'Audit reference', required: true, placeholder: 'IA-2026-03' },
    { name: 'finding', label: 'The finding', type: 'textarea', rows: 3, required: true },
    { name: 'severity', label: 'Severity', type: 'select',
      options: [['NONCONFORMITY', 'Non-conformity'], ['OBSERVATION', 'Observation'], ['IMPROVEMENT', 'Improvement']] },
    { name: 'ownerPost', label: 'Owner (post)', required: true },
    { name: 'dueBy', label: 'Due by', type: 'date' },
    { name: 'elementId', label: 'Annex 19 element (optional)', placeholder: '3.1' }
  ],
  training: [
    { name: 'userId', label: 'Person', type: 'people', required: true },
    { name: 'course', label: 'Course', required: true },
    { name: 'completedOn', label: 'Completed on', type: 'date', required: true },
    { name: 'expiresOn', label: 'Expires on', type: 'date' }
  ],
  communications: [
    { name: 'title', label: 'Title', required: true },
    { name: 'body', label: 'What people need to know', type: 'textarea', rows: 4, required: true }
  ]
};

function Field(f, people) {
  const id = `sms-${f.name}`;
  if (f.type === 'checkbox') {
    return html`<label class="chip">
      <input type="checkbox" name="${f.name}" class="input-field" id="${id}" />
      <span>${f.label}</span>
    </label>`;
  }
  if (f.type === 'people') {
    return html`<label class="field" for="${id}">
      <span class="field-label">${f.label}${f.required ? ' *' : ''}</span>
      <select class="input-field" name="${f.name}" id="${id}">
        <option value="">Choose a person</option>
        ${people.map((p) => html`<option value="${p.id}">${p.name}</option>`)}
      </select>
    </label>`;
  }
  if (f.type === 'select') {
    return html`<label class="field" for="${id}">
      <span class="field-label">${f.label}</span>
      <select class="input-field" name="${f.name}" id="${id}">
        ${f.options.map(([v, l]) => html`<option value="${v}">${l}</option>`)}
      </select>
    </label>`;
  }
  if (f.type === 'textarea') {
    return html`<label class="field" for="${id}">
      <span class="field-label">${f.label}${f.required ? ' *' : ''}</span>
      <textarea class="input-field" name="${f.name}" id="${id}" rows="${f.rows ?? 3}"></textarea>
    </label>`;
  }
  return html`<label class="field" for="${id}">
    <span class="field-label">${f.label}${f.required ? ' *' : ''}</span>
    <input class="input-field" name="${f.name}" id="${id}" type="${f.type ?? 'text'}"
      placeholder="${f.placeholder ?? ''}" />
  </label>`;
}

export async function render(outlet) {
  if (!isSignedIn()) {
    outlet.innerHTML = html`
      <section class="band-dark">
        <div class="wrap">
          <span class="eyebrow">The SMS record</span>
          <h1>Your organisation's safety management system</h1>
          <p class="lede">
            The eight Annex 19 elements your operator holds rather than this
            device: the signed policy, who is accountable, the appointments,
            the emergency exercises, the controlled documents, the internal
            audit findings, the training matrix and what reporters were told.
          </p>
          <div class="hero-actions"><a class="btn btn-primary" href="/account">Sign in</a></div>
        </div>
      </section>
      <div class="panel wrap">
        <p class="note">
          <b>This one needs a session</b>
          Unlike the toolkits, this is your organisation's record and not this
          handset's — every entry is scoped to your operator and written to an
          append-only chain. Signing in is what tells the server which operator
          you belong to. Filing a report has never needed one and never will.
        </p>
      </div>
    `.toString();
    return;
  }

  const session = getSession();
  const role = session?.role ?? 'FRONTLINE';
  const allow = (p) => {
    try {
      return can(role, p);
    } catch {
      return false;
    }
  };

  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">The SMS record</span>
        <h1>Four components, twelve elements</h1>
        <p class="lede">
          ICAO Annex 19's framework, and what your operator holds against each
          part of it. This is the organisation's record — scoped to your
          operator, written to an append-only chain, and readable by an
          inspector you invite rather than by anybody with the handset.
        </p>
        <dl class="stat-strip" id="sms-strip"></dl>
      </div>
    </section>
    <div class="panel wrap doc">
      <nav class="toc" aria-labelledby="toc-title">
        <h2 class="section-title" id="toc-title">The four components</h2>
        <ol>
          ${SMS_COMPONENTS.map(
            (c) => html`<li><a href="#component-${c.id}">${c.name}</a>
              <span class="toc-summary">${c.purpose}</span></li>`
          )}
        </ol>
        <p class="mat-actions no-print">
          <button type="button" class="btn btn-secondary btn-sm" id="sms-print">
            Print or save as PDF
          </button>
        </p>
      </nav>
      <div class="doc__body" id="sms-body"></div>
    </div>
  `.toString();

  const body = outlet.querySelector('#sms-body');
  const strip = outlet.querySelector('#sms-strip');
  const state = {};
  let people = [];

  /* =====================================================================
     REGULATION 13(3), where an operator writes its own six answers.

     WHY THIS IS SEVEN TEXTAREAS AND NOT A WIZARD. The six are not
     sequential and are rarely answered in one sitting — an operator
     writes the objective today and the processing route after they have
     agreed it with a manager. The route accepts partial writes for the
     same reason, and every field posts what it holds so a save never
     depends on the others being finished.

     WHAT IT REFUSES TO DO IS SCORE. unanswered() returns which are
     still undefined, and the heading says how many rather than "4 of 6
     complete". Regulation 13(3) is not a score: an operator that has
     not defined who may report has not partly defined it.
     ===================================================================== */
  const schemeBlock = () => {
    const held = state['/api/v1/sms/voluntary'];
    if (held?.error) {
      return html`<p class="notice notice--error">
        ${held.error === 'forbidden'
          ? 'Your role does not include reading the voluntary reporting scheme.'
          : 'The voluntary reporting scheme could not be read. That is not the same as it being undefined.'}
      </p>`;
    }
    const scheme = held?.scheme ?? {};
    const FIELD = {
      '13(3)(a)': 'objective',
      '13(3)(b)': 'scope',
      '13(3)(c)': 'whoMayReport',
      '13(3)(d)': 'whenToReport',
      '13(3)(e)': 'howProcessed',
      '13(3)(f)': 'contactPost'
    };
    const answers = Object.fromEntries(
      Object.entries(FIELD).map(([cite, key]) => [cite, scheme[key] ?? ''])
    );
    const left = unanswered(answers);
    const editable = allow('policy.draft');

    return html`<div class="sms-scheme">
      <p class="cov__missing">
        <strong>Regulation 13(3)</strong> requires this operator's voluntary reporting
        system to define six things. They are yours to state, not ours to supply.
      </p>
      <p class="note">
        <b>${VOLUNTARY_PROTECTION.cite}</b> ${VOLUNTARY_PROTECTION.text}
      </p>
      <p class="rec__meta">
        <span
          >${left.length
            ? `${left.length} of ${VOLUNTARY_REQUIREMENTS.length} still undefined`
            : 'All six defined'}</span
        >
        ${left.length
          ? html`<span>${left.map((r) => r.cite).join(', ')}</span>`
          : ''}
      </p>

      ${editable
        ? html`<details class="sms-add no-print">
            <summary>Define the voluntary reporting system</summary>
            <form id="scheme-form" novalidate>
              ${VOLUNTARY_REQUIREMENTS.map(
                (r) => html`<label class="field">
                  <span class="field-label">${r.cite} — ${r.requirement}</span>
                  <span class="field-note">${r.question}</span>
                  <textarea class="input-field" name="${FIELD[r.cite]}" rows="2">${
                    scheme[FIELD[r.cite]] ?? ''
                  }</textarea>
                </label>`
              )}
              <label class="field">
                <span class="field-label">${VOLUNTARY_PROTECTION.cite} — how protection is afforded</span>
                <span class="field-note"
                  >How is the system non-punitive in practice, and what protects a
                  source who uses it?</span
                >
                <textarea class="input-field" name="protection" rows="2">${
                  scheme.protection ?? ''
                }</textarea>
              </label>
              <button type="submit" class="btn btn-primary btn-sm">Save the definition</button>
              <p class="field-error" data-err="scheme" role="status" aria-live="polite"></p>
            </form>
          </details>`
        : html`<p class="rec__meta no-print">
            <span>Your role can read this definition and not write it.</span>
          </p>`}
    </div>`;
  };

  let org = null;

  const load = async () => {
    /* Fetched with the rest rather than after them — it is one request
       and it is cached, but a second round trip on a handset paying for
       it is a second round trip. */
    org = await loadOrg();
    const endpoints = [
      ...new Set(
        Object.values(SURFACES).flatMap((s) =>
          s.secondary ? [s.endpoint, s.secondary.endpoint] : [s.endpoint]
        )
      )
    ];
    await Promise.all(
      endpoints.map(async (url) => {
        try {
          const res = await authFetch(url);
          if (!res.ok) {
            state[url] = { error: res.status === 403 ? 'forbidden' : 'unavailable' };
            return;
          }
          state[url] = await res.json();
        } catch {
          /* Offline, or the API is not configured. Reported as such —
             an empty folder shown to somebody whose records exist is a
             worse answer than saying the record could not be read. */
          state[url] = { error: 'unreachable' };
        }
      })
    );

    /* The voluntary scheme, fetched with the rest rather than after
       them. It is a SINGLETON, not a collection, so it sits outside the
       SURFACES map and its own request would otherwise be a second
       round trip on a handset that may be paying for it. */
    try {
      const res = await authFetch('/api/v1/sms/voluntary');
      state['/api/v1/sms/voluntary'] = res.ok
        ? await res.json()
        : { error: res.status === 403 ? 'forbidden' : 'unavailable' };
    } catch {
      state['/api/v1/sms/voluntary'] = { error: 'unreachable' };
    }
    /* Read out of what was just loaded rather than fetched again — the
       accountabilities endpoint is already in `state`, and asking for
       it twice is a second round trip on a handset that may be paying
       for it.

       From `people`, never from `appointments`: the appointees are the
       people who already hold a post, so building the dropdown from
       them means the first appointment can never be made and no
       training can be recorded until it is. */
    const matrix = state['/api/v1/sms/accountabilities'];
    people = matrix?.error ? [] : (matrix?.people ?? []);
  };

  const rowsFor = (elementId) => {
    const surface = SURFACES[elementId];
    if (!surface) return null;
    const payload = state[surface.endpoint];
    if (!payload || payload.error) return { error: payload?.error ?? 'unreachable' };
    return { rows: payload[surface.collection] ?? [] };
  };

  /* ------------------------------------------------------------------
     A SECOND COLLECTION UNDER ONE ELEMENT.

     Only 1.4 has one, and the reason is in the descriptor: the exercise
     answers the inspector's question and the directory answers the
     operator's, and they are one element. Rendered beneath the primary
     rather than beside it, so an element that has both reads as one
     record with two parts.

     THE DIRECTORY'S VERDICT IS SHOWN EVEN WHEN IT IS EMPTY, and that is
     the opposite of the generic empty state above. "Nothing recorded
     against this element yet" is a fair description of no exercises; it
     is a misleading description of no contacts, because an empty
     directory is not a neutral starting point — it is a plan that
     connects to nobody.
     ------------------------------------------------------------------ */
  const secondaryBlock = (sec) => {
    const payload = state[sec.endpoint];
    const rows = payload?.error ? [] : (payload?.[sec.collection] ?? []);
    const verdict = payload?.error ? null : payload?.directory;

    return html`
      <div class="sms-secondary">
        <h4>${sec.title}</h4>

        ${payload?.error
          ? html`<p class="notice notice--error">
              ${payload.error === 'forbidden'
                ? 'Your role does not include reading the contact directory.'
                : 'The contact directory could not be read. That is not the same as it being empty — do not treat it as such.'}
            </p>`
          : html`
              ${verdict?.concern
                ? html`<p class="notice">${verdict.concern}</p>`
                : ''}
              ${rows.length
                ? html`<div class="rec-list">${RENDER[sec.key](rows)}</div>`
                : ''}
            `}

        ${allow(sec.permission)
          ? html`<details class="sms-add no-print">
              <summary>${sec.action}</summary>
              <form data-post="${sec.key}" novalidate>
                ${FORMS[sec.key].map((f) => Field(f, people))}
                <button type="submit" class="btn btn-primary btn-sm">${sec.action}</button>
                <p class="field-error" data-err="${sec.key}" role="status" aria-live="polite"></p>
              </form>
            </details>`
          : ''}
      </div>
    `;
  };

  const repaint = () => {
    let held = 0;
    for (const id of Object.keys(SURFACES)) {
      const r = rowsFor(id);
      if (r && !r.error && r.rows.length) held += 1;
    }
    strip.innerHTML = html`
      <div class="stat"><dt class="stat__value">${held}/8</dt>
        <dd class="stat__label">Elements with evidence</dd></div>
      <div class="stat"><dt class="stat__value">4</dt>
        <dd class="stat__label">Elsewhere in the product</dd></div>
      <div class="stat"><dt class="stat__value">12</dt>
        <dd class="stat__label">Elements in the framework</dd></div>
    `.toString();

    body.innerHTML = printId(org, 'Safety management system record — Annex 19, twelve elements').toString() + SMS_COMPONENTS.map(
      (component) => html`<section class="doc-section" id="component-${component.id}">
        <h2><span class="mat-element__id">${component.id}</span> ${component.name}</h2>
        <p class="lede lede--tight">${component.purpose}</p>

        ${component.elements.map((element) => {
          const surface = SURFACES[element.id];
          if (!surface) {
            const other = ELSEWHERE[element.id];
            /* 2.1 IS BOTH, and that is the honest answer rather than a
               structural compromise. FILING a report is a reporter's
               task and lives on /report; DEFINING the voluntary system
               that reports arrive through is the safety office's, and
               regulation 13(3) requires it in writing. One element, two
               different people, two different screens — so the pointer
               stays and the definition sits under it. */
            const scheme = element.id === '2.1' ? schemeBlock() : '';
            return html`<article class="card sms-el" id="element-${element.id}">
              <div class="cov__head">
                <h3><span class="mat-element__id">${element.id}</span> ${element.name}</h3>
                <span class="badge" data-status="SAFE"><span class="badge__label">elsewhere</span></span>
              </div>
              <p class="cov__has">${other?.label ?? 'Held on another screen.'}
                ${other ? html` <a href="${other.href}">Open it</a>.` : ''}</p>
              ${scheme}
            </article>`;
          }
          const r = rowsFor(element.id);
          const count = r?.rows?.length ?? 0;
          return html`<article class="card sms-el" id="element-${element.id}" data-element="${element.id}">
            <div class="cov__head">
              <h3><span class="mat-element__id">${element.id}</span> ${element.name}</h3>
              <span class="badge" data-status="${count ? 'SAFE' : 'CAUTION'}">
                <span class="badge__label">${count ? `${count} on record` : 'nothing recorded'}</span>
              </span>
            </div>
            <p class="cov__missing">${element.evidence}</p>

            ${r?.error
              ? html`<p class="notice notice--error">
                  ${r.error === 'forbidden'
                    ? 'Your role does not include reading this part of the record.'
                    : 'This part of the record could not be read. That is not the same as it being empty — do not treat it as such.'}
                </p>`
              : count
                ? html`<div class="rec-list">${RENDER[surface.key](r.rows)}</div>`
                : html`<p class="empty-state"><span>Nothing recorded against this element yet.</span></p>`}

            ${surface.secondary ? secondaryBlock(surface.secondary) : ''}

            ${allow(surface.permission)
              ? html`<details class="sms-add no-print">
                  <summary>${surface.action}</summary>
                  <form data-post="${element.id}" novalidate>
                    ${FORMS[surface.key].map((f) => Field(f, people))}
                    <button type="submit" class="btn btn-primary btn-sm">${surface.action}</button>
                    <p class="field-error" data-err="${element.id}" role="status" aria-live="polite"></p>
                  </form>
                </details>`
              : html`<p class="rec__meta no-print"><span>Your role can read this and not add to it.</span></p>`}
          </article>`;
        })}
      </section>`
    ).join('');
  };

  await load();
  repaint();

  body.addEventListener('submit', async (event) => {
    const form = event.target;

    /* THE VOLUNTARY SCHEME, handled before the collection forms because
       it is not one. It has no data-post element id — there is one
       scheme per operator, not one per element — and every field posts
       what it holds, including the empty ones, so clearing a definition
       is possible and a save never waits on the other six being
       finished. */
    if (form?.id === 'scheme-form') {
      event.preventDefault();
      const err = body.querySelector('[data-err="scheme"]');
      const payload = {};
      for (const el of form.querySelectorAll('textarea[name]')) {
        payload[el.name] = el.value.trim();
      }
      if (!Object.values(payload).some((v) => v)) {
        if (err) err.textContent = 'Nothing to save yet — define at least one of them.';
        return;
      }
      try {
        const res = await authFetch('/api/v1/sms/voluntary', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          if (err) {
            err.textContent =
              res.status === 403
                ? 'Your role cannot write this definition.'
                : 'That was not accepted. Check the fields and try again.';
          }
          return;
        }
        if (err) err.textContent = '';
        await load();
        repaint();
      } catch {
        if (err) {
          err.textContent =
            'No connection — the definition was not saved. It is not on this device either.';
        }
      }
      return;
    }

    const elementId = form?.dataset?.post;
    if (!elementId) return;
    event.preventDefault();
    /* A SECONDARY COLLECTION POSTS UNDER ITS OWN KEY, not under an
       element id — 1.4 has two forms and one element, so keying both on
       "1.4" would put the contact into the exercises endpoint and
       return a validation error that looks like a problem with the
       form. Resolved here rather than by giving the secondary a fake
       element id, which is the version that goes wrong silently. */
    const surface =
      SURFACES[elementId] ??
      Object.values(SURFACES)
        .map((x) => x.secondary)
        .find((sec) => sec && sec.key === elementId);
    if (!surface) return;
    const err = body.querySelector(`[data-err="${elementId}"]`);
    const say = (m) => {
      if (err) err.textContent = m;
    };

    const payload = {};
    for (const f of FORMS[surface.key]) {
      const el = form.elements[f.name];
      if (!el) continue;
      if (f.type === 'checkbox') {
        payload[f.name] = el.checked;
        continue;
      }
      const value = String(el.value ?? '').trim();
      if (!value) {
        if (f.required) {
          say(`${f.label.replace(' *', '')} is needed.`);
          return;
        }
        continue;
      }
      /* A date input gives YYYY-MM-DD; the API takes an instant. Sent as
         UTC midnight rather than local, so the same record does not
         change date when it is read in another timezone.

         AND A NUMBER INPUT GIVES A STRING. zod's z.number() refuses "1"
         and the 400 that comes back reads as a validation problem with
         the field rather than with the type — coerced here, once, for
         every form rather than in the one that noticed. */
      payload[f.name] =
        f.type === 'date' ? `${value}T00:00:00.000Z`
          : f.type === 'number' ? Number(value)
            : value;
    }
    say('');

    let res;
    try {
      res = await authFetch(surface.postEndpoint ?? surface.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch {
      say('Could not reach the safety office. Nothing was recorded — try again when you have a connection.');
      return;
    }

    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json())?.detail ?? '';
      } catch {
        detail = '';
      }
      say(
        detail ||
          (res.status === 403
            ? 'Your role cannot add to this part of the record.'
            : 'That was not accepted. Check the fields and try again.')
      );
      return;
    }

    await load();
    repaint();
    /* Found by element id, not by CSS: an Annex 19 element id contains
       a dot, so `#element-1.1` is a selector for id `element-1` with
       class `1` — a SyntaxError thrown after every successful write,
       leaving the disclosure open over a form that had already been
       accepted. getElementById does not parse its argument. */
    const back = document.getElementById(`element-${elementId}`)?.querySelector('.sms-add');
    if (back) back.open = false;
  });

  /* CONFIRMING A NUMBER. One delegated listener, because the directory
     re-renders on every save and per-row listeners would be re-attached
     each time — the P-01 shape the triage queue was fixed for. */
  body.addEventListener('click', async (event) => {
    const btn = event.target.closest?.('[data-verify-contact]');
    if (!btn) return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const res = await authFetch(
        `/api/v1/sms/contacts/${btn.dataset.verifyContact}/verify`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
      );
      if (!res.ok) {
        window.alert(
          res.status === 403
            ? 'Your role cannot confirm a contact.'
            : 'That was not accepted. Nothing was changed.'
        );
      }
    } catch {
      window.alert('Could not reach the safety office. Nothing was changed.');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
      await load();
      repaint();
    }
  });

  outlet.querySelector('#sms-print').addEventListener('click', () => window.print());
  void raw;
}
