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
import { isSignedIn, authFetch } from '../../shared/session.js';

/* The digest's four kinds in an operator's words, and the screen each
   one is answered on. Wording lives here rather than in digest.ts for
   the same reason mail.ts holds its own: the module holds a kind and a
   count, and how that reads to a person is presentation. */
const KIND = {
  DEADLINE: {
    one: 'reporting deadline needs attention',
    many: 'reporting deadlines need attention',
    act: 'Open the queue'
  },
  CURRENCY: {
    one: 'training currency is lapsing',
    many: 'training currencies are lapsing',
    act: 'Open the training matrix'
  },
  UNTRIAGED: {
    one: 'report is waiting to be triaged',
    many: 'reports are waiting to be triaged',
    act: 'Open the queue'
  },
  ACTION_OVERDUE: {
    one: 'corrective action is overdue',
    many: 'corrective actions are overdue',
    act: 'Open the register'
  }
};

/* The verdict, in the words somebody would use. NOW is deliberately
   blunt: an overdue regulatory obligation is the one thing on this
   screen that can end an AOC, and softening it here would undo the
   grading digest.ts is careful about. */
const VERDICT = {
  NOW: { line: 'Something needs you today', badge: 'ALERT' },
  TODAY: { line: 'Something needs you today', badge: 'CAUTION' },
  SOON: { line: 'Nothing urgent, some things are coming', badge: 'SAFE' }
};

/* Days rendered as something read without arithmetic. Shared shape with
   mail.ts's `when` deliberately — the same fact should not read
   differently depending on whether it arrived by email or on a screen. */
function when(days) {
  if (days === null || days === undefined) return '';
  if (days < 0) return `soonest overdue by ${Math.abs(days)} days`;
  if (days === 0) return 'soonest is today';
  if (days === 1) return 'soonest is tomorrow';
  return `soonest in ${days} days`;
}

function item(i) {
  const words = KIND[i.kind];
  if (!words) return '';
  const clock = when(i.soonestDays);
  return html`<article class="card">
    <div class="cov__head">
      <h3>${i.count} ${i.count === 1 ? words.one : words.many}</h3>
      <span class="badge" data-status="${i.urgency === 'NOW' ? 'ALERT' : i.urgency === 'TODAY' ? 'CAUTION' : 'SAFE'}">
        <span class="badge__label">${i.urgency.toLowerCase()}</span>
      </span>
    </div>
    ${clock ? html`<p class="hint">${clock}.</p>` : ''}
    <p class="mat-actions no-print">
      <a class="btn btn-secondary btn-sm" href="${i.href}">${words.act}</a>
    </p>
  </article>`;
}

export async function render(outlet) {
  if (!isSignedIn()) {
    outlet.innerHTML = html`
      <section class="band-dark">
        <div class="wrap">
          <span class="eyebrow">Today</span>
          <h1>What needs you today</h1>
          <p class="lede">
            This reads your operator's own record — the reporting deadlines, the
            training that is lapsing, the reports nobody has looked at yet. It needs a
            session, because it is the organisation's record rather than this handset's.
          </p>
        </div>
      </section>
      <section class="panel wrap">
        <p class="mat-actions no-print">
          <a class="btn btn-primary" href="/account">Sign in</a>
          <a class="btn btn-ghost" href="/report">File a report without signing in</a>
        </p>
      </section>
    `.toString();
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
            ? 'Your role does not include reading the operator&rsquo;s record. This is not the same as there being nothing to report.'
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

  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Today</span>
        <h1>${verdict ? verdict.line : 'Nothing needs you today'}</h1>
        <p class="lede">
          ${verdict
            ? `${digest.items.length} ${digest.items.length === 1 ? 'thing' : 'things'} in your operator's record are asking for attention.`
            : 'No reporting deadline is open, no currency is lapsing, nothing is waiting to be triaged and no corrective action is overdue.'}
        </p>
      </div>
    </section>

    <section class="panel wrap">
      ${digest.items.length
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
