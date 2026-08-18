/* ============================================================
   IS EVERYTHING ALL RIGHT?

   THE QUESTION THIS PRODUCT COULD NOT ANSWER. It has a folder (/sms), a
   queue (/triage), a risk picture (/picture) and a maturity assessment
   — each answering a question somebody already knew to ask. What it had
   nowhere was the screen a safety manager opens first, which every
   benchmarked competitor leads with and which is the single structural
   difference between a set of tools and a product.

   IT COMPUTES NOTHING OF ITS OWN. Every number here comes from
   /api/v1/digest — the same computation the 05:00 schedule sends, which
   is the point rather than an economy. A dashboard that derives its own
   figures is a second opinion about the record, and the first thing it
   does is disagree with the screen it links to. Charter rule 6 twice
   over: computed on request, and computed ONCE.

   ------------------------------------------------------------
   THE HEADLINE IS A VERDICT, NOT A METRIC.

   The pattern this screen borrows is the one every serious operational
   dashboard uses: decide the ONE thing somebody must see, put it first
   and largest, size everything else down from it. What is unusual here
   is that the one thing is not a number. "14" is not an answer to "is
   everything all right" — 14 what, and does it matter? The digest
   already grades itself NOW / TODAY / SOON, and that grade IS the
   answer. The counts sit underneath as the reason for it.

   AND "NOTHING NEEDS YOU TODAY" IS A REAL ANSWER, stated plainly rather
   than as an empty list. An operator who opens this and sees nothing
   has learned something; an operator who sees a blank screen assumes it
   is broken. That distinction is the whole of digest.ts's argument
   about why an empty digest is never sent, applied to a screen where
   the opposite is true — the screen SHOULD say it, because somebody
   asked.

   ------------------------------------------------------------
   NO NEW CSS. NOT ONE RULE.

   The stylesheet is at 60.0 KB of 60.0 and the standing receipt says
   the next raise splits it — and splitting buys nothing, because the
   budget sums every stylesheet. So this screen is built from the
   vocabulary that already exists: the band, the card, the badge, the
   statement list. That is not a constraint reluctantly obeyed. A
   dashboard assembled from the product's own components looks like the
   product; one with its own bespoke treatment looks like a landing page
   bolted to it, which is exactly what a safety manager showing this to
   an inspector does not need.

   ------------------------------------------------------------
   IT NEEDS A SESSION AND SAYS SO. The digest is the organisation's
   record. A signed-out visitor gets the sentence and the way in, not an
   empty dashboard that implies there is nothing to see.
   ============================================================ */

import { html } from '../../shared/html.js';
import { isSignedIn, getSession, authFetch } from '../../shared/session.js';
import { syncStatus } from '../../shared/offline.ts';
import { can } from '../../../../../packages/shared/src/index.ts';
import { currencyOf } from '../../../../../packages/shared/src/currency.ts';
import { courseFor } from '../../../../../packages/shared/src/curriculum.ts';
import {
  VERDICT,
  whenText,
  viewFor,
  reporterIsClear,
  establishment,
  nextStep,
  FIRST_RUN
} from '../../../../../packages/shared/src/today.ts';

/* The digest's four kinds in an operator's words, and the screen each
   one is answered on. Wording lives here rather than in digest.ts for
   the same reason mail.ts holds its own: the module holds a kind and a
   count, and how that reads to a person is presentation. */
/* `watches` is the noun on its own, and it exists so the SIGNED-OUT
   screen can say what this one looks at without a second list.

   Signed out, /today was a heading, three sentences and two buttons on
   a page the sticky footer stretched to the full viewport — the same
   defect /picture had. The lede named three of these four in prose,
   which is both unscannable and a copy that goes stale the moment a
   fifth kind is added here.

   Reading the offer off KIND means it cannot: a kind added below
   appears on the signed-out screen in the same commit, and one removed
   stops being advertised. No gate needed, because there is nothing to
   disagree — which is why this is better than /picture's four, where
   the headings are prose in place and the agreement has to be
   asserted by a test instead. */
const KIND = {
  DEADLINE: {
    watches: 'Reporting deadlines',
    one: 'reporting deadline needs attention',
    many: 'reporting deadlines need attention',
    act: 'Open the queue'
  },
  CURRENCY: {
    watches: 'Training currency',
    one: 'training currency is lapsing',
    many: 'training currencies are lapsing',
    act: 'Open the training matrix'
  },
  UNTRIAGED: {
    watches: 'Untriaged reports',
    one: 'report is waiting to be triaged',
    many: 'reports are waiting to be triaged',
    act: 'Open the queue'
  },
  ACTION_OVERDUE: {
    watches: 'Overdue corrective actions',
    one: 'corrective action is overdue',
    many: 'corrective actions are overdue',
    act: 'Open the register'
  }
};

/* The judgement on this screen lives in packages/shared/src/today.ts,
   which is the split digest.ts and mail.ts already use: the module holds
   what to say, this holds how it looks. It is there rather than here
   because nothing executes this file — the accessibility sweep and the
   smoke suite both meet this screen SIGNED OUT, so every branch below
   ships untested and the decisions had to move somewhere a test can
   reach without a browser. */

function item(i) {
  const words = KIND[i.kind];
  if (!words) return '';
  const clock = whenText(i.soonestDays);
  return html`<article class="card">
    <div class="cov__head">
      <h3>${i.count} ${i.count === 1 ? words.one : words.many}</h3>
      <span class="badge" data-status="${VERDICT[i.urgency]?.badge ?? 'OFFLINE'}">
        <span class="badge__label">${VERDICT[i.urgency]?.word ?? i.urgency}</span>
      </span>
    </div>
    ${clock ? html`<p class="hint">${clock}.</p>` : ''}
    <p class="mat-actions no-print">
      <a class="btn btn-secondary btn-sm" href="${i.href}">${words.act}</a>
    </p>
  </article>`;
}

/* ============================================================
   A REPORTER'S TODAY, WHICH IS NOT THE SAFETY OFFICE'S.

   THIS SCREEN REFUSED THE MAJORITY OF ITS USERS. The digest needs
   report.read.org and a FRONTLINE reporter does not hold it, so the
   product's flagship screen answered a ramp agent with "your role does
   not include reading the operator's record" — on a page titled what
   needs YOU today. That is also the pricing page's argument turned
   inside out: every band includes unlimited reporters precisely so the
   line crew is inside the system, and the first screen they met told
   them they were not.

   THE ANSWER IS NOT TO WIDEN THE PERMISSION. A digest is the safety
   office's work — counts of other people's reports, other people's
   lapsing currencies — and showing it to everybody would be a
   disclosure dressed as a feature. The permission is right. What was
   wrong is that this screen had only one question.

   SO A REPORTER GETS THEIR OWN TWO FACTS, and both are genuinely
   theirs:

     · WHAT HAS NOT LEFT THIS HANDSET. Charter rule 8 and the whole
       reason the product is offline-first. A report still in the outbox
       has not been made, and only the person holding the phone can
       carry it to signal;
     · WHAT THEIR OWN TRAINING SAYS. /api/v1/sms/training already
       answers in "own" scope for exactly this role, and since the
       curriculum landed it carries the gaps as well as the expiries.

   NO NEW ROUTE AND NO NEW PERMISSION. Both come from surfaces that
   already exist and already draw the boundary in the right place.
   ============================================================ */
async function renderReporter(outlet) {
  let sync = { pending: 0, errored: 0 };
  try {
    sync = await syncStatus();
  } catch {
    /* The outbox is a local database. If it cannot be read, saying
       nothing about it is better than claiming zero — see below. */
    sync = null;
  }

  /* THE SAME REFUSAL THE OUTBOX GETS, and the first version of this did
     not give it. An unreadable outbox reported itself; an unreachable
     training route fell through to `null` and rendered as no lapsing
     certificates and no gaps — which reads as "your training is fine"
     to somebody whose training this screen could not see. That is the
     charter rule 8 failure the card below was written to avoid, made
     twice in one function because the second path was quieter. */
  let mine = null;
  let trainingFailed = null;
  try {
    const res = await authFetch('/api/v1/sms/training');
    if (res.ok) mine = await res.json();
    else trainingFailed = res.status === 403 ? 'forbidden' : 'unreachable';
  } catch {
    trainingFailed = 'unreachable';
  }

  const own = mine?.curriculum?.[0] ?? null;
  const records = mine?.training ?? [];
  const now = new Date();
  const lapsing = records
    .map((t) => ({
      row: t,
      verdict: currencyOf(
        { completedOn: new Date(t.completedOn), expiresOn: t.expiresOn ? new Date(t.expiresOn) : null },
        now
      )
    }))
    .filter((r) => r.verdict.state === 'LAPSED' || r.verdict.state === 'DUE_SOON');

  const unsent = sync ? sync.pending + sync.errored : 0;
  /* "NOTHING NEEDS YOU TODAY" REQUIRES HAVING LOOKED, and the rule lives
     in today.ts where a test can reach it. A null is UNKNOWN rather than
     zero: a screen whose job is to answer "is everything all right"
     saying the most reassuring thing at the moment it knows least is the
     failure this product exists to refuse. */
  const clear = reporterIsClear({
    unsent: sync ? unsent : null,
    lapsing: trainingFailed ? null : lapsing.length,
    gaps: trainingFailed ? null : (own?.gaps?.length ?? 0)
  });

  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Today</span>
        <h1>${clear ? 'Nothing needs you today' : 'What needs you today'}</h1>
        <p class="lede">
          ${clear
            ? 'Everything you have filed has reached the safety office, and your training is current.'
            : 'Your own reports and your own training. What the safety office is working on is theirs to see.'}
        </p>
      </div>
    </section>

    <section class="panel wrap">
      <div class="picture-grid">
        ${sync === null
          ? html`<article class="card">
              <div class="cov__head"><h3>Your outbox could not be read</h3></div>
              <p class="hint">
                This device could not open its own store, so it does not know whether
                anything is waiting. That is not the same as nothing waiting.
              </p>
            </article>`
          : unsent
            ? html`<article class="card">
                <div class="cov__head">
                  <h3>${unsent} ${unsent === 1 ? 'report has' : 'reports have'} not left this handset</h3>
                  <span class="badge" data-status="ALERT"><span class="badge__label">act now</span></span>
                </div>
                <p class="hint">
                  A report that has not reached anyone has not been made. Move somewhere with
                  signal and it will send itself.
                </p>
                <p class="mat-actions no-print">
                  <a class="btn btn-secondary btn-sm" href="/triage">See what is waiting</a>
                </p>
              </article>`
            : ''}

        ${trainingFailed
          ? html`<article class="card">
              <div class="cov__head"><h3>Your training record could not be read</h3></div>
              <p class="hint">
                ${trainingFailed === 'forbidden'
                  ? 'Your role does not include reading training records, so this screen cannot tell you whether yours are current.'
                  : 'The safety office could not be reached, so this screen does not know whether your certificates are current. That is not the same as them being current.'}
              </p>
            </article>`
          : ''}

        ${lapsing.length
          ? html`<article class="card">
              <div class="cov__head">
                <h3>${lapsing.length} of your ${lapsing.length === 1 ? 'certificates is' : 'certificates are'} running out</h3>
                <span class="badge" data-status="CAUTION"><span class="badge__label">today</span></span>
              </div>
              <p class="cov__has">${lapsing.map((r) => r.row.course).join(', ')}</p>
              <p class="hint">Your safety office books these — this is so you know to ask.</p>
            </article>`
          : ''}

        ${own?.gaps?.length
          ? html`<article class="card">
              <div class="cov__head">
                <h3>${own.gaps.length} ${own.gaps.length === 1 ? 'course your role needs' : 'courses your role needs'} with no record</h3>
                <span class="badge" data-status="CAUTION"><span class="badge__label">soon</span></span>
              </div>
              <p class="cov__has">${own.gaps.map((k) => courseFor(k)?.label ?? k).join(', ')}</p>
              <p class="hint">
                No record does not always mean no training — if you have done one of these,
                tell your safety office so the record catches up.
              </p>
            </article>`
          : ''}
      </div>

      <div class="sms-scheme">
        <h2 class="section-title">Where to go next</h2>
        <ul class="next-list">
          <li><a href="/report">File a report</a> — it works with no signal and sends itself later.</li>
          <li><a href="/triage">What you have filed</a>, and what has not left this handset.</li>
          <li><a href="/privacy">What happens to what you file</a>, including if you filed anonymously.</li>
        </ul>
      </div>
    </section>
  `.toString();
}

export async function render(outlet) {
  if (!isSignedIn()) {
    outlet.innerHTML = html`
      <section class="band-dark">
        <div class="wrap">
          <span class="eyebrow">Today</span>
          <h1>What needs you today</h1>
          <p class="lede">
            This reads your operator's own record rather than this handset's,
            which is why it needs a session.
          </p>
        </div>
      </section>
      <section class="panel wrap">
        <h2 class="section-title">What it watches</h2>
        <ul class="picture-grid" role="list">
          ${Object.values(KIND).map(
            (k) => html`<li class="fact">
              <strong>${k.watches}</strong>
              <span>${k.act}</span>
            </li>`
          )}
        </ul>
        <p class="mat-actions no-print">
          <a class="btn btn-primary" href="/account">Sign in</a>
          <a class="btn btn-ghost" href="/report">File a report without signing in</a>
        </p>
      </section>
    `.toString();
    return;
  }

  /* ASKED OF THE MATRIX, NOT GUESSED AT. The same permission the digest
     route enforces, read from the one declaration both sides share — so
     a role added later is routed by what it may READ rather than by a
     list in this file that goes stale. The server still refuses; this
     only decides which question is worth asking, so a reporter never
     meets a refusal on a screen titled what needs YOU today. */
  const role = getSession()?.role;
  if (viewFor(Boolean(role) && can(role, 'report.read.org')) === 'REPORTER') {
    await renderReporter(outlet);
    return;
  }

  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Today</span>
        <h1>What needs you today</h1>
      </div>
    </section>
    <section class="panel wrap"><p class="hint">Reading your operator's record…</p></section>
  `.toString();

  let payload = null;
  let failed = null;
  try {
    const res = await authFetch('/api/v1/digest');
    if (res.ok) payload = await res.json();
    else failed = res.status === 403 ? 'forbidden' : 'unreachable';
  } catch {
    failed = 'unreachable';
  }

  /* CHARTER RULE 8 ON THE SCREEN, and it matters more here than
     anywhere. Every other screen that cannot reach the server shows an
     empty list, which is wrong but obvious. On a screen whose entire
     job is to answer "is everything all right", an unreachable server
     rendering "nothing needs you today" is a product that says the
     safest possible thing at the moment it knows least. */
  if (failed) {
    outlet.innerHTML = html`
      <section class="band-dark">
        <div class="wrap">
          <span class="eyebrow">Today</span>
          <h1>What needs you today</h1>
        </div>
      </section>
      <section class="panel wrap">
        <p class="notice notice--error">
          ${failed === 'forbidden'
            ? 'Your role does not include reading the operator’s record. This is not the same as there being nothing to report.'
            : 'The safety office could not be reached, so this screen does not know what needs you. That is NOT the same as nothing needing you — do not read it as such.'}
        </p>
        <p class="mat-actions no-print">
          <a class="btn btn-secondary" href="/triage">Open the queue</a>
        </p>
      </section>
    `.toString();
    return;
  }

  const digest = payload.digest ?? { items: [], urgency: null };
  const verdict = digest.urgency ? VERDICT[digest.urgency] : null;

  /* AN EMPTY RECORD IS NOT A CLEAR ONE, and until this the screen could
     not tell them apart: the digest correctly finds nothing wrong with
     an operator that has done nothing, and "Nothing needs you today"
     was rendered over the top of it. The argument is in today.ts; the
     `scale` comes from the same route as the digest so the browser is
     not deriving a second opinion about the record. */
  const scale = payload.scale ?? null;
  const empty = scale ? establishment(scale) === 'EMPTY' : false;
  const step = scale ? nextStep(scale) : null;

  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Today</span>
        <h1>
          ${verdict ? verdict.line
            : empty ? 'Your safety management system is not running yet'
            : 'Nothing needs you today'}
        </h1>
        <p class="lede">
          ${verdict
            ? `${digest.items.length} ${digest.items.length === 1 ? 'thing' : 'things'} in your operator's record are asking for attention.`
            : empty
              ? html`Nothing has been filed, no indicator is defined and the register is
                  empty, so there is nothing yet for this screen to read. That is not the
                  same as a quiet week — it is the state before the first record.`
              : 'No reporting deadline is open, no currency is lapsing, nothing is waiting to be triaged and no corrective action is overdue.'}
        </p>
      </div>
    </section>

    <section class="panel wrap">
      ${empty
        ? html`
            <h2 class="section-title">The first fifteen minutes</h2>
            <ol class="next-list" data-first-run>
              ${FIRST_RUN.map(
                (s) => html`<li>
                  <strong>${s.does}</strong> — ${s.why}
                  ${step && step.key === s.key
                    ? html` <a class="btn btn-primary btn-sm" href="${s.where}">${s.action}</a>`
                    : html` <a href="${s.where}">${s.action}</a>`}
                </li>`
              )}
            </ol>
            <p class="hint">
              Three steps, in that order, because each one is what makes the next worth
              doing. Nothing here has to be read first.
            </p>`
        : digest.items.length
          ? html`<div class="picture-grid">${digest.items.map(item)}</div>`
          : html`<p class="hint">
              This is computed from the record every time you open it, so it cannot go
              stale against the screens it links to.
            </p>`}

      <div class="sms-scheme">
        <h2 class="section-title">Where to go next</h2>
        <ul class="next-list">
          <li><a href="/triage">The reporting queue</a> — what has arrived and what it owes an authority.</li>
          <li><a href="/sms">The SMS record</a> — the folder an auditor asks for.</li>
          <li><a href="/picture">The risk picture</a> — where the risk actually sits.</li>
          <li><a href="/coverage">What this product does and does not do</a>.</li>
        </ul>
        <p class="hint">
          ${payload.delivery === 'CONFIGURED'
            ? 'A summary of this is sent each morning to the people who may read the record.'
            : 'Nothing is sent by email yet — this arrives only when somebody opens it.'}
        </p>
      </div>
    </section>
  `.toString();
}
