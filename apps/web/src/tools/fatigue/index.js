/* ============================================================
   FATIGUE — what the reports say, read against what binds you.

   THE SCREEN IS BUILT AROUND ONE NUMBER, and it is not the total. A
   duty that stayed inside every limit the operator declared and still
   produced a fatigue report is the finding the prescriptive route
   cannot generate on its own: limits are a blunt instrument, and a
   report from inside them is evidence that these limits are not
   protecting this operation. It leads.

   The breach count matters less and is deliberately second. A broken
   limit already has an owner and a process; the compliant duty that
   still hurt somebody is the one that gets missed.

   NO NARRATIVES ON THIS SCREEN, because the route does not send them.
   A fatigue narrative is somebody saying they were too tired to fly
   safely, which is the most career-sensitive sentence in this product.
   The duty figures are what the analysis needs.

   THE CAVEAT IS RENDERED, NOT FOOTNOTED. An operator must not read a
   quiet fatigue page as evidence it holds an FRMS — that is a
   State-approved undertaking this product neither provides nor claims.

   ------------------------------------------------------------
   AND "THE ANSWER ARRIVED" IS NOT "THE ANSWER IS READABLE".

   This screen used to guard on `if (!data)`, which is a test of
   PRESENCE, and then read `data.counts.withinDeclared` — so a 200
   carrying a body of the wrong shape threw halfway through the render
   and left the page at TWO NODES. Measured: blank, no heading, no
   sentence, nothing in the console a safety manager would ever see.
   The honest notice for an unreachable office was already written six
   lines above and the crash jumped straight over it.

   IT IS REACHABLE, which is why it is fixed rather than noted. The
   service worker caches API answers, so a body stored against an older
   shape is served with status 200 to a browser running the new bundle;
   so is a proxy's cached copy, and so is a half-deployed API. Every one
   of those is a 200 this screen cannot read.

   THE FIX IS NOT `?? 0`. A zero painted over an unknown is the failure
   this product exists to refuse — `today.ts` says it in full about
   UNKNOWN, and a fatigue screen reporting "0 past a declared limit"
   because it could not parse the answer is the most dangerous possible
   version of it. So the shape is CHECKED, and a body this screen cannot
   read gets the same sentence as no body at all.
   ============================================================ */
import { html } from '../../shared/html.js';
import { authFetch, isSignedIn } from '../../shared/session.js';

const VERDICT_LABEL = {
  WITHIN_DECLARED: 'Inside your limits',
  EXCEEDED_DECLARED: 'Past a declared limit',
  INCOMPLETE: 'Not enough detail',
  NO_LIMITS_DECLARED: 'No limits declared',
};

function Report(r) {
  const when = new Date(r.createdAt).toISOString().slice(0, 10);
  return html`<article class="rec" data-fatigue-report>
    <h3>${r.title}</h3>
    <p class="rec__meta">
      <span>${when}</span>
      <span>${VERDICT_LABEL[r.verdict] ?? r.verdict}</span>
      ${r.samnPerelli ? html`<span>Rated ${r.samnPerelli} of 7</span>` : ''}
    </p>
    ${r.exceeded.length
      ? html`<ul>${r.exceeded.map((e) => html`<li>${e}</li>`)}</ul>`
      : ''}
    ${r.factors.length
      ? html`<ul>${r.factors.map((f) => html`<li>${f}</li>`)}</ul>`
      : ''}
  </article>`;
}

/* THE SHAPE THIS SCREEN READS, asserted rather than assumed.

   Every field the render below indexes into, and nothing else — a
   predicate that checked more than the screen uses would refuse a body
   the screen could have rendered, which is the same fault in the other
   direction.

   `declared` is the branch, so `limits.instrument` is only required
   when it is true: an operator with no declared limits has no
   instrument to name, and demanding one would refuse the state every
   new operator starts in. */
function readable(data) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.total !== 'number') return false;
  if (typeof data.caveat !== 'string') return false;
  if (!Array.isArray(data.reports)) return false;
  const c = data.counts;
  if (!c || typeof c !== 'object') return false;
  for (const k of ['withinDeclared', 'exceededDeclared', 'impairmentReported', 'incomplete']) {
    if (typeof c[k] !== 'number') return false;
  }
  if (data.declared && typeof data.limits?.instrument !== 'string') return false;
  return true;
}

export async function render(outlet) {
  if (!isSignedIn()) {
    outlet.innerHTML = html`
      <section class="panel wrap">
        <header class="page-head">
          <span class="eyebrow">Safety performance</span>
          <h1>Fatigue</h1>
          <p class="lede">Sign in to see what your fatigue reports say.</p>
        </header>
      </section>`.toString();
    return;
  }

  let data = null;
  let denied = false;
  try {
    const res = await authFetch('/api/v1/fatigue');
    if (res.status === 403) denied = true;
    else if (res.ok) data = await res.json();
  } catch {
    /* Rendered as the unreachable state below rather than a blank screen. */
  }

  if (denied) {
    outlet.innerHTML = html`
      <section class="panel wrap">
        <header class="page-head">
          <span class="eyebrow">Safety performance</span>
          <h1>Fatigue</h1>
        </header>
        <div class="notice" data-denied>
          <strong>Your role does not read the operator's reports.</strong>
          Fatigue reports are read by the same roles that read the reporting
          queue. Nothing here is hidden from you by accident.
        </div>
      </section>`.toString();
    return;
  }

  /* ONE GUARD FOR BOTH, and they are deliberately not distinguished on
     screen. "No answer" and "an answer this screen cannot read" are two
     different faults to whoever fixes them and the SAME fault to a
     safety manager: the figures are not available and nothing on this
     page should be believed. Splitting them would invite reading the
     second as partial success. */
  if (!readable(data)) {
    outlet.innerHTML = html`
      <section class="panel wrap">
        <header class="page-head">
          <span class="eyebrow">Safety performance</span>
          <h1>Fatigue</h1>
        </header>
        <div class="notice">
          <strong>The fatigue figures could not be read.</strong>
          This screen reads the organisation's record, so it needs a
          connection — and it will not show part of an answer it cannot
          account for. Nothing here means your reports are clear; it means
          they have not been counted. Reload, and if it persists the safety
          office has not answered.
        </div>
      </section>`.toString();
    return;
  }

  const c = data.counts;
  const lead = data.declared
    ? html`
        <p class="lede" data-lead>
          <strong>${c.withinDeclared}</strong> of ${data.total} fatigue
          ${data.total === 1 ? 'report' : 'reports'} came from a duty that was
          inside every limit you declared. That is the number worth reading:
          staying within the limits is what makes those reports worth reading,
          not what settles them.
        </p>`
    : html`
        <p class="lede" data-lead>
          You have <strong>${data.total}</strong> fatigue
          ${data.total === 1 ? 'report' : 'reports'} and no declared duty limits,
          so none of them can be read against what binds you. Declare your
          limits below and name the instrument they come from.
        </p>`;

  outlet.innerHTML = html`
    <section class="panel wrap">
      <header class="page-head">
        <span class="eyebrow">Safety performance</span>
        <h1>Fatigue</h1>
        ${lead}
      </header>

      <div class="notice" data-caveat>${data.caveat}</div>

      <h2>What the reports say</h2>
      <dl class="stat-strip" data-counts>
        <div class="stat">
          <dt class="stat__value">${c.withinDeclared}</dt>
          <dd class="stat__label">Inside your limits, still too tired</dd>
        </div>
        <div class="stat">
          <dt class="stat__value">${c.exceededDeclared}</dt>
          <dd class="stat__label">Past a declared limit</dd>
        </div>
        <div class="stat">
          <dt class="stat__value">${c.impairmentReported}</dt>
          <dd class="stat__label">Rated 5 or worse of 7</dd>
        </div>
        <div class="stat">
          <dt class="stat__value">${c.incomplete}</dt>
          <dd class="stat__label">Not enough detail to read</dd>
        </div>
      </dl>
      ${data.truncated
        ? html`<p class="field-error">More reports than this screen shows were
            filed in the window. The counts are over what is shown.</p>`
        : ''}

      <h2>Your declared limits</h2>
      ${data.declared
        ? html`<p data-instrument>
            From <strong>${data.limits.instrument}</strong>.
          </p>`
        : html`<p class="empty-state"><span>Nothing declared yet.</span></p>`}
      <form class="card" id="declare-limits" novalidate>
        <label>Maximum flight time in one duty, hours
          <input name="maxFlightTimeHours" type="number" step="0.25" min="0" max="24"
                 value="${data.limits?.maxFlightTimeHours ?? ''}" /></label>
        <label>Maximum duty period, hours
          <input name="maxDutyHours" type="number" step="0.25" min="0" max="48"
                 value="${data.limits?.maxDutyHours ?? ''}" /></label>
        <label>Minimum rest before duty, hours
          <input name="minRestHours" type="number" step="0.25" min="0" max="168"
                 value="${data.limits?.minRestHours ?? ''}" /></label>
        <label>Maximum flight time in any 7 days, hours
          <input name="maxFlightTime7DaysHours" type="number" step="0.25" min="0" max="168"
                 value="${data.limits?.maxFlightTime7DaysHours ?? ''}" /></label>
        <label>Where these come from
          <input name="instrument" type="text" maxlength="200"
                 placeholder="OM-A 7.1, or the regulation, or an AOC condition"
                 value="${data.limits?.instrument ?? ''}" /></label>
        <button type="submit" class="btn btn-primary">Declare these limits</button>
        <p class="field-error" data-err="limits" role="status" aria-live="polite"></p>
      </form>

      <h2>The reports</h2>
      ${data.reports.length
        ? html`<div class="rec-list">${data.reports.map(Report)}</div>`
        : html`<p class="empty-state"><span>No fatigue reports in this window.
            A fatigue report is filed like any other, with the duty block on the
            form — <a href="/report">file one</a>.</span></p>`}
    </section>
  `.toString();

  const form = outlet.querySelector('#declare-limits');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    const err = outlet.querySelector('[data-err="limits"]');
    err.textContent = '';
    const body = {};
    for (const k of ['maxFlightTimeHours', 'maxDutyHours', 'minRestHours',
                     'maxFlightTime7DaysHours']) {
      const v = f.elements[k].value.trim();
      if (v !== '') body[k] = Number(v);
    }
    body.instrument = f.elements.instrument.value.trim();
    try {
      const res = await authFetch('/api/v1/fatigue/limits', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const answer = await res.json().catch(() => ({}));
        /* The server's own sentence — the instrument refusal explains
           why an unsourced limit is refused, and "forbidden" would read
           as a malfunction. */
        err.textContent = answer.message ?? answer.detail
          ?? 'That was not accepted. Nothing changed.';
        return;
      }
      await render(outlet);
    } catch {
      err.textContent = 'The safety office could not be reached. Nothing changed.';
    }
  });
}
