/* ============================================================
   NOTES ABOUT THE MARKUP, COLLECTED OUT OF THE TEMPLATE.

   An `<!-- -->` inside a tagged template literal is string content:
   no minifier removes it and every reporter downloads it.

   1. WHAT NEEDS ATTENTION, FIRST AND ONLY IF THERE IS ANY. An
      empty attention panel with three reassuring zeroes in it is
      the thing that makes a dashboard stop being read.

   2. THE COUNT IS NOT A RATE AND THE PAGE SAYS SO ITSELF, rather
      than leaving a reader to assume Doc 9859's indicator is what
      they are looking at.
   ============================================================ */
/* ============================================================
   The risk picture.

   WHAT THIS SCREEN IS FOR. The UK Military Aviation Authority builds an
   aggregate risk picture from what its reporting system brings in, and
   uses it to decide where to look next. RA 1210 requires risk decisions
   to be "recorded and communicated across all relevant stakeholders" —
   and a decision communicated one row at a time has not been
   communicated. This is that page.

   IT IS ALSO THE ONLY SCREEN IN THE PRODUCT AN OPERATOR WILL SHOW TO
   SOMEBODY ELSE. Everything else here is worked on; this is presented.
   Which means the discipline is different: on a working screen a wrong
   number is corrected by the person who typed it, and on this one it is
   read out to an authority.

   So the design rule throughout is that AN ABSENCE IS STATED, NEVER
   RENDERED AS A ZERO. A zero on a dashboard reads as a measurement —
   "we close everything the same day", "we have no amber risks" — and
   the sentence it displaces is "we have not measured this yet". Every
   figure below either has a number behind it or says why it has not.

   NOTHING IS COMPUTED HERE. The arithmetic is in
   packages/shared/src/picture.ts and the gathering is in
   /api/v1/picture. This file lays out an answer it was given, which is
   why there is no fallback that quietly estimates something when the
   request fails.
   ============================================================ */

import { html } from '../../shared/html.js';
import { isSignedIn, authFetch } from '../../shared/session.js';
import { printId, loadOrg } from '../../shared/print-id.js';

const BAND_LABEL = {
  INTOLERABLE: 'Intolerable',
  TOLERABLE: 'Tolerable',
  ACCEPTABLE: 'Acceptable'
};

const STATE_LABEL = {
  SUBMITTED: 'Awaiting triage',
  TRIAGED: 'Triaged',
  UNDER_INVESTIGATION: 'Under investigation',
  ACTIONS_OPEN: 'Actions outstanding',
  CLOSED: 'Closed'
};

const POST_LABEL = {
  SAFETY_OFFICER: 'Safety officer',
  SAFETY_MANAGER: 'Safety manager',
  ACCOUNTABLE_EXECUTIVE: 'Accountable executive'
};

/* The trend, in words. NOT an arrow on its own: an arrow is colour and
   shape with no text, which fails the same people the brand gate's
   dichromacy simulation exists for, and "too short to say" has no arrow
   at all. */
const TREND_TEXT = {
  RISING: 'More than the months before it',
  FALLING: 'Fewer than the months before it',
  FLAT: 'In line with the months before it',
  TOO_SHORT: 'Too few months to say which way this is going'
};

/* BOUND ONCE PER OUTLET, for the reason the triage queue has a long
   comment about: the router clears the outlet's CHILDREN between routes
   but never replaces the outlet, so a listener attached on every render
   is a listener added on every render — and each handler re-renders.
   A WeakSet keyed on the node remembers and holds nothing alive. */
const bound = new WeakSet();

function bindActions(outlet) {
  if (bound.has(outlet)) return;
  bound.add(outlet);

  outlet.addEventListener('click', async (event) => {
    const el = event.target.closest?.(
      '[data-complete-action], [data-verify-action], [data-cancel-action]'
    );
    if (!el) return;

    const id =
      el.dataset.completeAction ?? el.dataset.verifyAction ?? el.dataset.cancelAction;
    const what = el.dataset.completeAction
      ? 'complete'
      : el.dataset.verifyAction
        ? 'verify'
        : 'cancel';

    /* THE NOTE IS ASKED FOR BEFORE THE REQUEST on the two moves that
       need one. The server refuses without it and that refusal is the
       control; asking here as well is the difference between a form
       that helps and one that scolds. Both still run. */
    const body = {};
    if (what === 'cancel') {
      const reason = window.prompt(
        'Why is this action not being done? A cancellation is a safety decision, and the reason is the part an auditor asks for.'
      );
      if (reason === null) return;
      if (!reason.trim()) {
        window.alert('A reason is needed. Without one this is indistinguishable from deleting the action.');
        return;
      }
      body.cancelledReason = reason;
    } else {
      const note = window.prompt(
        what === 'complete'
          ? 'What was done? This is recorded against your name.'
          : 'What did you check? Optional, and it is what the next reader sees.'
      );
      if (note === null) return;
      if (note.trim()) {
        body[what === 'complete' ? 'completionNote' : 'verificationNote'] = note;
      }
    }

    const label = el.textContent;
    el.disabled = true;
    el.textContent = 'Saving…';
    try {
      const res = await authFetch(`/api/v1/actions/${id}/${what}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        /* The server's own sentence. On a verify it explains that the
           person who completed an action cannot also verify it, which
           is the rule the whole loop rests on and is worth reading in
           full rather than as "forbidden". */
        const answer = await res.json().catch(() => ({}));
        window.alert(answer.message ?? 'That was not accepted. Nothing was changed.');
      }
    } catch {
      window.alert('The safety office could not be reached. Nothing was changed.');
    } finally {
      el.disabled = false;
      el.textContent = label;
      await render(outlet);
    }
  });
}

async function fetchActions() {
  try {
    const res = await authFetch('/api/v1/actions');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const ACTION_STATUS = {
  OPEN: 'open',
  DUE_SOON: 'due soon',
  OVERDUE: 'overdue',
  DONE: 'done, awaiting verification',
  VERIFIED: 'verified',
  CANCELLED: 'cancelled'
};

const ACTION_BADGE = {
  OPEN: 'SAFE',
  DUE_SOON: 'CAUTION',
  OVERDUE: 'ALERT',
  DONE: 'CAUTION',
  VERIFIED: 'SAFE',
  CANCELLED: 'NEUTRAL'
};

/* Where it came from, in words. An action is always raised FROM
   something — that is the CHECK constraint in the migration — and the
   list has to say which, or two identical-looking actions against
   different reports read as a duplicate. */
function sourceOf(a) {
  if (a.reportId) return 'from a report';
  if (a.findingId) return 'from an audit finding';
  if (a.riskId) return 'from a register entry';
  if (a.changeId) return 'from a change assessment';
  return '';
}

/* THE FOUR SECTIONS THIS SCREEN RENDERS, named once.

   Signed out, /picture was a heading, two sentences and a button on a
   page stretched to the full viewport by the sticky footer — the
   emptiest screen in the product, and it told a visitor evaluating
   this thing nothing about what they would get for signing in.

   The titles are the same four the signed-in screen renders as h2s
   below. They are NOT interpolated into those headings — a heading is
   prose in place and threading it through a constant to save four
   strings makes the screen harder to read than the duplication does.

   So the agreement is asserted instead: tests/picture-offer.test.ts
   reads this file and fails if a title here has no matching h2, or an
   h2 has no entry here. An offer that advertises a section the screen
   dropped is the failure worth catching, and it is silent — nothing
   else in the build compares a marketing list to the thing it
   describes. */
const LOCKED_SECTIONS = Object.freeze([
  {
    title: 'Reporting',
    what: 'How much is being filed, by whom, and whether the rate is holding up — the question an accountable executive asks first.'
  },
  {
    title: 'The register',
    what: 'The risk position the operator is carrying, and how much of it is past its own review date.'
  },
  {
    title: 'Indicators',
    what: 'The safety performance indicators regulation 9(5) asks for, against the targets somebody set.'
  },
  {
    title: 'What needs attention',
    what: 'The few things actually overdue or unowned, rather than everything sorted by date.'
  },
  {
    title: 'Barrier health',
    what: 'Which of your defences are currently down — mitigations, control reviews, competence, change closeout, audit findings and indicators — read together instead of six registers apart.'
  }
]);

export async function render(outlet) {
  if (!isSignedIn()) {
    outlet.innerHTML = html`
      <section class="panel">
        <header class="page-head">
          <span class="eyebrow">Safety assurance</span>
          <h1>The risk picture</h1>
        </header>
        <p class="notice">
          This is the operator's own position, drawn from its reports,
          its register and its indicators. Sign in to see it.
        </p>
        <p><a class="btn btn-primary" href="/account">Sign in</a></p>

        <h2 class="section-title">What it puts on one screen</h2>
        <ul class="picture-grid" role="list">
          ${LOCKED_SECTIONS.map(
            (s) => html`<li class="fact">
              <strong>${s.title}</strong>
              <span>${s.what}</span>
            </li>`
          )}
        </ul>
      </section>
    `.toString();
    return;
  }

  outlet.innerHTML = html`
    <section class="panel">
      <header class="page-head">
        <span class="eyebrow">Safety assurance</span>
        <h1>The risk picture</h1>
      </header>
      <p class="lede">Reading the record…</p>
    </section>
  `.toString();

  let data = null;
  let failure = null;
  try {
    const res = await authFetch('/api/v1/picture?days=90');
    if (res.ok) {
      const body = await res.json().catch(() => null);
      /* A 200 IS NOT A PICTURE, and this screen used to assume it was.
         Everything below indexes into `window`, `reporting`, `register`
         and the rest without checking any of them, so a 200 carrying a
         body this build does not understand threw on `win.days` and
         rendered NOTHING AT ALL — a white page where the honest "could
         not be reached" panel was already written and waiting.

         Not hypothetical, and not only a stubbed-API artefact: it is
         what an older client meets after the route changes shape, what
         a captive-portal or proxy returns when it answers 200 with its
         own page, and what a partial deploy serves. The failure this
         screen was built to avoid is showing something stale; a blank
         screen is the same fault wearing nothing at all.

         Found by driving the built app against an API that answered
         `{}`. The smoke suite's "no uncaught page errors" check never
         saw it because smoke stubs a well-formed body — the shape it
         asserts is the shape it supplies. */
      data =
        body && body.window && body.reporting && body.register && body.barriers
          ? body
          : null;
      if (!data) {
        failure =
          'The safety office answered, but not with a picture this version of the app ' +
          'can read. That usually means the app needs updating.';
      }
    } else failure = res.status === 403
      ? 'Your role does not include reading the organisation’s reports, so this picture cannot be drawn for you.'
      : 'The safety office could not be reached.';
  } catch {
    failure = 'The safety office could not be reached.';
  }

  if (!data) {
    /* NO CACHED PICTURE, AND NO ESTIMATE. Every other screen in this
       product degrades to what the device holds, and this one must not:
       a stale aggregate is indistinguishable from a current one, and
       this is the page somebody reads out to an authority. */
    outlet.innerHTML = html`
      <section class="panel">
        <header class="page-head">
          <span class="eyebrow">Safety assurance</span>
          <h1>The risk picture</h1>
        </header>
        <p class="notice notice--error">
          ${failure} Nothing is shown rather than something out of date —
          this page is an aggregate, and a stale aggregate looks exactly
          like a current one.
        </p>
      </section>
    `.toString();
    return;
  }

  const { reporting, register, indicators, changes, actions, barriers, window: win } = data;
  /* THE LIST, not only the counts.
  
     The counts shipped one release before this and read zero forever,
     because nothing in the product could create an action — the API
     had create, complete, verify and cancel, and no screen posted to
     any of them. A panel of figures over a capability nobody can reach
     is the same defect as a coverage entry that overstates, one layer
     further in. */
  const [org, list] = await Promise.all([loadOrg(), fetchActions()]);
  bindActions(outlet);

  outlet.innerHTML = html`
    <section class="panel">
      ${printId(org, `The risk picture — the ${win.days} days to ${win.to.slice(0, 10)}`)}
      <header class="page-head">
        <span class="eyebrow">Safety assurance</span>
        <h1>The risk picture</h1>
        <p class="lede">
          The operator's position, computed from its own record on every
          load. Reporting figures cover the last ${win.days} days; the
          open queue and the register are as they stand now.
        </p>
      </header>

      ${riskPictureCards({ register, actions, reporting })}

      ${attention({ register, indicators, changes, reporting, actions })}

      <h2>Barrier health</h2>
      ${barrierPanel(barriers)}

      <h2>Reporting</h2>
      <div class="picture-grid">
        ${figure('Reports filed', reporting.count, `in ${win.days} days`)}
        ${figure(
          'Days to close',
          reporting.closure.median === null ? '—' : reporting.closure.median,
          reporting.closure.median === null
            ? reporting.closure.note
            : `median of ${reporting.closure.n}; nine in ten within ${reporting.closure.p90}` +
              /* The server caps how many closures it reads. A median
                 over a capped sample is a median of a sample, and the
                 figure has to say so — the register below already does
                 for the same reason. */
              (reporting.closureTruncated
                ? '. Computed from the earliest closures only — the window holds more than this page reads'
                : '')
        )}
        ${figure('Awaiting triage', reporting.queue.by.SUBMITTED, 'all time, not the window')}
      </div>

      <p class="picture-note">${reporting.note}</p>
      <p class="picture-note">${TREND_TEXT[reporting.trend]}.</p>

      ${bars('The queue', reporting.queue.by, STATE_LABEL)}

      <h2 id="actions">Corrective actions</h2>
      ${actions.total === 0
        ? html`<p class="lede">
            Nothing recorded. An action is raised from the thing that
            prompted it — open a report in
            <a href="/triage">the reporting queue</a> and record what will be
            done about it. It is then tracked here to closure and to
            verification, which is what "mitigations tracked to closure" means
            in element 2.2's evidence.
          </p>`
        : html`
            <div class="picture-grid">
              ${figure('Outstanding', actions.outstanding, `of ${actions.total} recorded`)}
              ${figure('Overdue', actions.overdue, 'past a date somebody chose')}
              ${figure('Awaiting verification', actions.awaitingVerification, 'done, not yet checked')}
            </div>
            ${actions.truncated
              ? html`<p class="notice">
                  Showing the first actions only. These counts are a floor.
                </p>`
              : ''}
            ${actionList(list)}
          `}

      <h2>The register</h2>
      ${register.open.total === 0
        ? html`<p class="lede">
            No open entries. An empty register is not the same as no
            risk — it means nothing has been assessed and recorded here.
          </p>`
        : bars('Open entries by band', register.open.by, BAND_LABEL)}

      ${register.truncated
        ? html`<p class="notice">
            Showing the first entries only. The register is larger than
            this page reads, so these counts are a floor, not a total.
          </p>`
        : ''}

      ${holderPanel(register.holderGaps)}

      <h2>Indicators</h2>
      ${indicators.total === 0
        ? html`<p class="lede">
            No indicators defined. Regulation 9(5) of L.N. 32 of 2026
            asks a service provider for indicators and targets acceptable
            to the Authority.
            <a href="/toolkits/spi">Define one</a>.
          </p>`
        : indicators.alerting.length === 0
          ? html`<p class="lede">
              ${indicators.total} indicator${indicators.total === 1 ? '' : 's'},
              none currently over an alert level.
            </p>`
          : html`<ul class="picture-list">
              ${indicators.alerting.map(
                (i) => html`<li>
                  <strong>${i.name}</strong> — ${i.headline}
                </li>`
              )}
            </ul>`}
    </section>
  `.toString();
}

/* ------------------------------------------------------------------
   Risk picture summary cards.

   THREE LINKED CARDS at the top of the signed-in screen, each linking
   to /toolkits/risk-picture. They answer the three questions a Safety
   Manager or Accountable Executive arrives asking: what is the risk
   position, how many actions are open, and how quickly are things being
   closed. The full picture is one click away from each card.

   h3 headings are deliberate. The picture-offer test compares every
   plain <h2> on this screen to LOCKED_SECTIONS, and these summaries
   are not sections — they are signposts to one. Adding them as h2s
   would require adding them to LOCKED_SECTIONS and to the signed-out
   offer, which overstates what a two-number card is.
   ------------------------------------------------------------------ */
function riskPictureCards({ register, actions, reporting }) {
  const { INTOLERABLE, TOLERABLE, ACCEPTABLE } = register.open.by;
  const total = INTOLERABLE + TOLERABLE + ACCEPTABLE;
  const avgDays = reporting?.closure?.median ?? null;

  return html`
    <div class="picture-summary" aria-label="Risk picture summary">
      <a class="picture-card" href="/toolkits/risk-picture" aria-label="Risk tolerability — open in risk picture dashboard">
        <h3 class="picture-card__title">Risk tolerability</h3>
        <ul class="picture-card__bars" aria-label="Hazards by tolerability band">
          <li data-tolerability="INTOLERABLE">
            <span class="picture-card__band">Intolerable</span>
            <span class="picture-card__count ${INTOLERABLE > 0 ? 'picture-card__count--alert' : ''}">${INTOLERABLE}</span>
          </li>
          <li data-tolerability="TOLERABLE">
            <span class="picture-card__band">Tolerable</span>
            <span class="picture-card__count">${TOLERABLE}</span>
          </li>
          <li data-tolerability="ACCEPTABLE">
            <span class="picture-card__band">Acceptable</span>
            <span class="picture-card__count">${ACCEPTABLE}</span>
          </li>
        </ul>
        ${total === 0
          ? html`<p class="picture-card__note">No assessed hazards yet</p>`
          : html`<p class="picture-card__note">${total} assessed hazard${total === 1 ? '' : 's'}</p>`}
      </a>

      <a class="picture-card" href="/toolkits/risk-picture" aria-label="Open actions — open in risk picture dashboard">
        <h3 class="picture-card__title">Open actions</h3>
        <p class="picture-card__value ${actions.overdue > 0 ? 'picture-card__value--alert' : ''}">${actions.outstanding}</p>
        ${actions.overdue > 0
          ? html`<p class="picture-card__note picture-card__note--alert">${actions.overdue} overdue</p>`
          : html`<p class="picture-card__note">None overdue</p>`}
      </a>

      <a class="picture-card" href="/toolkits/risk-picture" aria-label="Time to close — open in risk picture dashboard">
        <h3 class="picture-card__title">Time to close</h3>
        ${avgDays !== null
          ? html`<p class="picture-card__value">${avgDays}</p>
              <p class="picture-card__note">days median</p>`
          : html`<p class="picture-card__note">Insufficient data</p>`}
      </a>
    </div>
  `;
}

/* ------------------------------------------------------------------
   What needs attention.

   RENDERED ONLY WHEN THERE IS SOMETHING, and every item names what to
   do rather than only what is wrong. "3 risks owned below their band"
   is a statistic; "3 risks are owned below the authority their band
   requires — open the register" is a next step.
   ------------------------------------------------------------------ */
function attention({ register, indicators, changes, reporting, actions }) {
  const items = [];

  /* OVERDUE ACTIONS FIRST. Everything else on this list is a state of
     the record; this one is a promise the operator made and has not
     kept, with a date attached. It is the item an auditor opens with. */
  if (actions.overdue > 0) {
    items.push(html`<li>
      <strong>${actions.overdue} corrective action${actions.overdue === 1 ? ' is' : 's are'} past their due date.</strong>
      <a href="#actions">See the actions below</a>.
    </li>`);
  }
  if (actions.undated > 0) {
    items.push(html`<li>
      <strong>${actions.undated} outstanding action${actions.undated === 1 ? ' has' : 's have'} no due date.</strong>
      An action with no date is not late and never will be — "by when?" is the
      question an auditor asks next. <a href="#actions">See the actions below</a>.
    </li>`);
  }
  if (actions.awaitingVerification > 0) {
    items.push(html`<li>
      <strong>${actions.awaitingVerification} action${actions.awaitingVerification === 1 ? ' is' : 's are'} done and not yet verified.</strong>
      Element 3.3's evidence is findings closed <em>and verified</em>, by somebody
      other than whoever did the work. <a href="#actions">See the actions below</a>.
    </li>`);
  }

  const below = register.holderGaps.filter((g) => g.verdict === 'below').length;
  if (below > 0) {
    items.push(html`<li>
      <strong>${below} risk${below === 1 ? ' is' : 's are'} owned below the authority
      their band requires.</strong> RA 1210's principle: how senior an owner must be
      is a function of how bad the risk is. <a href="/toolkits/register">Open the register</a>.
    </li>`);
  }
  if (register.open.by.INTOLERABLE > 0) {
    items.push(html`<li>
      <strong>${register.open.by.INTOLERABLE} intolerable risk${register.open.by.INTOLERABLE === 1 ? '' : 's'} open.</strong>
      An intolerable risk is not acceptable at any level of benefit.
      <a href="/toolkits/register">Open the register</a>.
    </li>`);
  }
  if (register.overdueReview > 0) {
    items.push(html`<li>
      <strong>${register.overdueReview} register entr${register.overdueReview === 1 ? 'y is' : 'ies are'} past their review date.</strong>
      <a href="/toolkits/register">Open the register</a>.
    </li>`);
  }
  if (indicators.alerting.length > 0) {
    items.push(html`<li>
      <strong>${indicators.alerting.length} indicator${indicators.alerting.length === 1 ? '' : 's'} over an alert level.</strong>
      Element 3.1 asks what was done the last time one crossed.
      <a href="/toolkits/spi">Open the indicators</a>.
    </li>`);
  }
  if (changes.inEffectUnreviewed > 0) {
    items.push(html`<li>
      <strong>${changes.inEffectUnreviewed} change${changes.inEffectUnreviewed === 1 ? ' has' : 's have'} taken effect without a review afterwards.</strong>
      Element 3.2 does not end when the change lands.
    </li>`);
  }
  if (reporting.queue.by.SUBMITTED > 0) {
    items.push(html`<li>
      <strong>${reporting.queue.by.SUBMITTED} report${reporting.queue.by.SUBMITTED === 1 ? '' : 's'} awaiting triage.</strong>
      <a href="/triage">Open the queue</a>.
    </li>`);
  }

  if (items.length === 0) return '';
  return html`
    <div class="picture-attention">
      <h2>What needs attention</h2>
      <ul class="picture-list">${items}</ul>
    </div>
  `;
}

/* ------------------------------------------------------------------
   Barrier health — the predictive layer.

   WHAT THIS IS FOR. Doc 9859 splits hazard identification into
   reactive, proactive and predictive. The incumbents do predictive with
   flight data, and an operator flying sub-27-tonne aircraft has no
   recorder to read. But prediction does not require flight data: it
   requires knowing which defences are currently down, and this operator
   already records every one of those as its own object in its own
   register. Read together they are a picture; read six registers apart
   they are six to-do lists nobody reads at once.

   HOW MANY OF THEM CAN BE PLACED AGAINST A HIGH-RISK CATEGORY IS
   PRINTED ON THE SCREEN, and that figure is the point of the section
   rather than a caveat under it. `hrcTags` lives on SafetyReport and on
   no other model, so a training lapse, an audit finding, an unclosed
   change and a crossing indicator have NO path to a category at all.
   Grouping regardless would print "Bird strike: 2 barriers down" when
   the honest answer is that two of nine could be placed and the rest
   could not — a confident number computed from a fraction of the
   evidence, which is exactly what the coverage page exists to prevent.

   THE LIST IS CAPPED BY THE SERVER AND THE REMAINDER IS COUNTED. A
   hundred rows is a register, and there are already four of those to
   open. The worst few by how late they are, and a sentence saying how
   many more there are, is a dashboard.

   The cap moved to the API after measurement: this file sliced to
   twelve while the route sent every finding it had, which on a
   neglected operator was 500 KB of a 564 KB response. Slicing on the
   screen hides the cost rather than paying it — the bytes had already
   crossed the reporter's connection by then.

   WHAT THIS CALLER WAS NOT SHOWN IS PRINTED, NOT DROPPED. A
   SAFETY_OFFICER may not read audit findings or anybody else's training
   currency, so their barrier picture is genuinely narrower than the
   operator's. Rendering that as a smaller number with no note is the
   understating twin of overstating: they would read four records out of
   six as the whole position.
   ------------------------------------------------------------------ */
function barrierPanel(b) {
  const withheldNote = (b.withheld ?? []).length
    ? html`<p class="notice">
        Your role does not include reading
        ${b.withheld.map((w) => w.source).join(' or ')}, so
        ${b.withheld.length === 1 ? 'that record is' : 'those records are'}
        not counted here. This is a narrower picture than the operator's,
        not a healthier one.
      </p>`
    : '';

  if (b.total === 0) {
    return html`${withheldNote}<p class="lede">
      Nothing recorded as degraded. That is a statement about six
      records — mitigations, register review dates, training currency,
      change closeout, audit findings and indicators — and it is only as
      good as what has been entered into them. An empty barrier picture
      on an empty record is not a healthy operation.
    </p>`;
  }

  const shown = b.degraded;
  const rest = b.total - shown.length;
  const placed = b.total - b.unattributed;

  return html`
    ${withheldNote}
    <p class="lede">
      ${b.total} defence${b.total === 1 ? ' is' : 's are'} currently down
      across six records the operator already keeps. This is the
      predictive question — which barriers are degraded now — rather
      than the reactive one, and it needs no flight data to answer.
    </p>

    ${b.truncated
      ? html`<p class="notice">
          Showing the first entries from at least one of these records.
          These counts are a floor, not a total.
        </p>`
      : ''}

    ${bars('By kind of barrier', b.byKind, b.kinds)}

    <h3>Against the national high-risk categories</h3>
    ${b.byHrc.length === 0
      ? html`<p class="picture-note">
          None of these ${b.total} can be placed against a high-risk
          category. A category is carried by the report a finding came
          from, and none of these came from one — so the categories are
          not empty, they are unknown.
        </p>`
      : html`
          <ul class="picture-bars">
            ${b.byHrc.map(
              (h) => html`<li class="picture-bar">
                <span class="picture-bar__label">${h.label}</span>
                <span class="picture-bar__track">
                  <span class="picture-bar__fill"
                    style="width: ${Math.round((h.count / Math.max(1, ...b.byHrc.map((x) => x.count))) * 100)}%"></span>
                </span>
                <span class="picture-bar__value">${h.count}</span>
              </li>`
            )}
          </ul>
          <p class="picture-note">
            ${placed} of ${b.total} could be placed against a category
            (${Math.round(b.attribution * 100)}%). The other
            ${b.unattributed} carry no path to one: a category is held on
            the report a finding came from, and a training lapse, an
            audit finding, an unclosed change and an indicator do not
            come from reports. They are counted above and left out here
            rather than distributed across the categories as a guess.
          </p>
        `}

    <h3>The worst of them</h3>
    <ul class="picture-list">
      ${shown.map(
        (d) => html`<li>
          <strong>${d.what}</strong>
          <span class="barrier__meta">
            ${b.kinds[d.kind] ?? d.kind}${d.daysLate === null
              ? ''
              : ` · ${d.daysLate} day${d.daysLate === 1 ? '' : 's'} past the date somebody set`}${d.ownerPost
              ? ` · ${POST_LABEL[d.ownerPost] ?? d.ownerPost}`
              : ''}${d.hrcs.length ? ` · ${d.hrcs.join(', ')}` : ''}
          </span>
        </li>`
      )}
    </ul>
    ${rest > 0
      ? html`<p class="picture-note">
          And ${rest} more. The registers themselves are the place to
          work through them: <a href="/picture#actions">the actions</a>,
          <a href="/toolkits/register">the register</a>,
          <a href="/sms">training, findings and changes</a>.
        </p>`
      : ''}
  `;
}

/* ------------------------------------------------------------------
   Who is carrying what.

   THE ONE THING ON THIS PAGE THE INCUMBENTS DO NOT HAVE. SMS Pro,
   Q-Pulse, Centrik and iQSMS all show a register by band; none asks
   whether the person in the owner box is senior enough to carry the
   row, because Doc 9859 does not ask it either. RA 1210 does.

   BELOW AND UNKNOWN ARE SHOWN SEPARATELY. Below is a finding. Unknown
   is a question — the owner field has a free-text escape because a
   small operator's real titles are not this product's enum, so "the
   Director" may genuinely be the accountable executive. Running them
   together would either accuse an operator of a gap it does not have,
   or bury a real one in a list of naming differences.
   ------------------------------------------------------------------ */
function holderPanel(gaps) {
  if (!gaps.length) return '';
  const below = gaps.filter((g) => g.verdict === 'below');
  const unknown = gaps.filter((g) => g.verdict === 'unknown');

  return html`
    <h3>Who is carrying what</h3>
    ${below.length
      ? html`
          <p class="picture-note">
            These are owned below the authority their band requires.
          </p>
          <ul class="picture-list">
            ${below.map(
              (g) => html`<li>
                <strong>${g.hazard}</strong> — ${BAND_LABEL[g.band] ?? g.band},
                owned by ${POST_LABEL[g.owner] ?? g.owner ?? 'nobody'},
                needs ${POST_LABEL[g.needs] ?? g.needs}.
              </li>`
            )}
          </ul>
        `
      : ''}
    ${unknown.length
      ? html`
          <p class="picture-note">
            These name an owner this product does not recognise as one of
            its posts. That is not a finding — your titles are your own —
            but it does mean the check above could not be made.
          </p>
          <ul class="picture-list">
            ${unknown.map(
              (g) => html`<li>
                <strong>${g.hazard}</strong> — ${BAND_LABEL[g.band] ?? g.band},
                owned by ${g.owner ?? 'nobody'}.
              </li>`
            )}
          </ul>
        `
      : ''}
  `;
}

/* ------------------------------------------------------------------
   THE ACTIONS THEMSELVES, and the two buttons that move them.

   COMPLETE AND VERIFY ARE SEPARATE BUTTONS ON SEPARATE ROWS OF THE
   PERMISSION MATRIX, and the screen shows only what this caller may
   press. The server refuses the rest and says why; showing a button
   that always fails would teach somebody to ignore the refusal.

   VERIFY IS ABSENT ON AN ACTION THIS PERSON COMPLETED. The server
   refuses it — an action verified by the person who did it has not been
   verified — and the sentence it returns explains that. Hiding the
   button as well means the common case never produces the refusal at
   all, and the refusal stays for the case the screen cannot see:
   somebody else's browser, an API client, a stale page.
   ------------------------------------------------------------------ */
function actionList(list) {
  if (!list?.actions?.length) {
    return html`<p class="notice">
      The actions could not be read, so only the counts above are shown.
      That is not the same as there being none.
    </p>`;
  }
  return html`
    <ul class="picture-list picture-actions">
      ${list.actions.map(
        (a) => html`<li class="picture-action" data-status="${a.status}">
          <p class="picture-action__what">${a.action}</p>
          <p class="picture-action__meta">
            <span class="badge" data-status="${ACTION_BADGE[a.status]}">
              <span class="badge__label">${ACTION_STATUS[a.status] ?? a.status}</span>
            </span>
            <span>${a.ownerPost}</span>
            <span>${a.dueOn ? `due ${a.dueOn}` : 'no due date'}</span>
            <span>${sourceOf(a)}</span>
          </p>
          ${a.completionNote
            ? html`<p class="picture-action__note"><strong>Done:</strong> ${a.completionNote}</p>`
            : ''}
          ${a.cancelledReason
            ? html`<p class="picture-action__note"><strong>Cancelled:</strong> ${a.cancelledReason}</p>`
            : ''}
          ${a.status === 'VERIFIED' || a.status === 'CANCELLED'
            ? ''
            : html`<p class="picture-action__do no-print">
                ${a.completedOn
                  ? html`<button type="button" class="btn btn-secondary btn-sm"
                      data-verify-action="${a.id}">Verify this</button>`
                  : html`<button type="button" class="btn btn-secondary btn-sm"
                      data-complete-action="${a.id}">Mark it done</button>`}
                <button type="button" class="btn btn-ghost btn-sm"
                  data-cancel-action="${a.id}">Cancel it</button>
              </p>`}
          ${/* THE HANDOFF, REACHED FROM THE RECORD IT IS COMPOSED FROM.
                An operator answering a KCAA request has the corrective
                action in front of them here; making them navigate to a
                toolkit and identify it again is exactly the retyping
                this feature exists to remove.

                NOT OFFERED FOR A CANCELLED ACTION. composeCap refuses
                one — "this action was cancelled, it is not an answer to
                a CAR" — so the link would lead somewhere that only says
                no. A verified action still gets it: implementation
                evidence is uploaded AFTER the inspector approves the
                CAP, which is the step that comes last. */ ''}
          ${a.status === 'CANCELLED'
            ? ''
            : html`<p class="picture-action__do no-print">
                <a href="/toolkits/icaas?action=${a.id}"
                  >Compose the KCAA pack</a>
              </p>`}
        </li>`
      )}
    </ul>
  `;
}

function figure(label, value, note) {
  return html`
    <div class="picture-figure">
      <span class="picture-figure__value">${value}</span>
      <span class="picture-figure__label">${label}</span>
      <span class="picture-figure__note">${note}</span>
    </div>
  `;
}

/* Proportional bars, with the number beside every one.

   THE WIDTH IS NOT THE MESSAGE. A bar with no printed number is a
   picture that cannot be read out loud, cannot be quoted in a
   submission, and cannot be checked. The bar is there to make the shape
   scannable; the figure is there because it is the actual answer. */
function bars(title, counts, labels) {
  const entries = Object.entries(counts);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return html`
    <h3>${title}</h3>
    <ul class="picture-bars">
      ${entries.map(
        ([key, n]) => html`<li class="picture-bar">
          <span class="picture-bar__label">${labels[key] ?? key}</span>
          <span class="picture-bar__track">
            <span class="picture-bar__fill" style="width: ${Math.round((n / max) * 100)}%"></span>
          </span>
          <span class="picture-bar__value">${n}</span>
        </li>`
      )}
    </ul>
  `;
}
