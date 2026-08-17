/* ============================================================
   THE VENDOR'S CONSOLE.

   WHO THIS IS FOR, AND IT IS NOT THE OPERATOR. Every other screen in
   this product belongs to somebody in an aviation organisation. This
   one belongs to whoever sells it: provision an operator, hand over
   the first credential, confirm what has been paid for.

   WHY IT IS IN THE PRODUCT RATHER THAN A SPREADSHEET. Because the
   alternative was SQL. Until this screen the only way to take a
   customer was to write rows by hand into production — no audit entry,
   no reason recorded, and a password that existed in whatever terminal
   ran the INSERT.

   WHAT IT DELIBERATELY CANNOT SHOW. Any operator's safety record. Not
   because the screen filters it out — because PLATFORM_ADMIN holds no
   permission that opens one, and tests/platform.test.ts fails if that
   ever stops being true. A console that could show a narrative would
   make the privacy page false, and the person it would be false to is
   a reporter who never agreed to anything.

   THE PASSWORD APPEARS ONCE AND IS NOT RECOVERABLE. That is the point
   rather than a limitation: a credential a console can re-display is a
   credential that lives in the console. If it is lost, the operator
   uses password reset like anybody else. The screen says so at the
   moment it shows the password, not in a help page, because that is
   when somebody decides whether to write it down.

   THE ENTITLEMENT FORM ASKS FOR A REASON AND WILL NOT SUBMIT WITHOUT
   ONE. "Why is this operator paid through December" is the question
   this console exists to be able to answer, and an entitlement change
   with no reason recorded cannot answer it.
   ============================================================ */
import { html } from '../../shared/html.js';
import { authFetch } from '../../shared/session.js';

const STATE_TONE = {
  ACTIVE: 'SAFE',
  TRIAL: 'CAUTION',
  GRACE: 'CAUTION',
  LAPSED: 'ALERT',
};

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function Operator(o) {
  return html`<article class="rec" data-state="open">
    <div class="rec__head">
      <h3>${o.name}</h3>
      <span class="badge" data-status="${STATE_TONE[o.state] ?? 'OFFLINE'}">
        <span class="badge__label">${o.state.toLowerCase()}</span>
      </span>
    </div>
    <p class="rec__meta">
      ${o.jurisdiction}${o.aocNumber ? html` · AOC ${o.aocNumber}` : ''}
      ${typeof o.fleetSize === 'number' ? html` · ${o.fleetSize} aircraft` : ''}
      · ${o.users} ${o.users === 1 ? 'person' : 'people'}
    </p>
    <p class="rec__meta">
      Trial ends ${fmt(o.trialEndsOn)} · Paid through ${fmt(o.paidThrough)}
    </p>
    <details class="sms-add no-print">
      <summary>Confirm payment or extend the trial</summary>
      <form data-entitlement="${o.id}" novalidate>
        <label>
          <span>Paid through</span>
          <input type="date" name="paidThrough" />
        </label>
        <label>
          <span>Trial ends</span>
          <input type="date" name="trialEndsOn" />
        </label>
        <label>
          <span>Reason</span>
          <input type="text" name="reason" maxlength="500"
                 placeholder="Invoice 0042 settled by bank transfer" required />
        </label>
        <button type="submit" class="btn btn-primary btn-sm">Record it</button>
        <p class="field-error" data-err="${o.id}" role="status" aria-live="polite"></p>
      </form>
    </details>
  </article>`;
}

export async function render(outlet) {
  let payload = null;
  let denied = false;
  try {
    const res = await authFetch('/api/v1/admin/operators');
    /* 403 is the expected answer for everybody who is not the vendor,
       and it is not an error worth a stack trace — it is the boundary
       working. */
    if (res.ok) payload = await res.json();
    else denied = true;
  } catch {
    denied = true;
  }

  if (denied || !payload) {
    outlet.innerHTML = html`
      <section class="panel wrap">
        <header class="page-head">
          <span class="eyebrow">Platform administration</span>
          <h1>Not your console</h1>
          <p class="lede">
            This screen provisions operators and confirms what they have paid
            for. It belongs to whoever runs UsalamaSMS, not to an operator —
            and nothing on it can reach any organisation's safety record.
          </p>
        </header>
      </section>`.toString();
    return;
  }

  const ops = payload.operators ?? [];

  outlet.innerHTML = html`
    <section class="panel wrap">
      <header class="page-head">
        <span class="eyebrow">Platform administration</span>
        <h1>Operators</h1>
        <p class="lede">
          ${ops.length} ${ops.length === 1 ? 'operator' : 'operators'} provisioned.
          Subscription state is computed from two dates on every read, so nothing
          here can be left saying an operator is paid up when they are not.
        </p>
      </header>

      <p class="notice">
        <strong>This console cannot open a safety record.</strong> Not by policy —
        the platform role holds no permission that reaches a report, a hazard, an
        audit log or an export, and a test fails if that changes. An operator's
        own administrator is the only person who can see inside their organisation.
      </p>

      <h2>Provision an operator</h2>
      <p class="picture-note">
        Creates the organisation and its first user, starts the trial clock, and
        issues one password. The password is shown once and is not recoverable —
        pass it on, or the operator uses password reset.
      </p>
      <form data-provision novalidate class="card">
        <label><span>Operator name</span>
          <input type="text" name="orgName" maxlength="160" required /></label>
        <label><span>AOC number</span>
          <input type="text" name="aocNumber" maxlength="64" /></label>
        <label><span>Fleet size</span>
          <input type="number" name="fleetSize" min="0" max="2000" /></label>
        <label><span>First user's name</span>
          <input type="text" name="adminName" maxlength="160" required /></label>
        <label><span>First user's email</span>
          <input type="email" name="adminEmail" maxlength="254" required /></label>
        <label><span>First user's role</span>
          <select name="adminRole">
            <option value="SYSTEM_ADMIN">Account administrator</option>
            <option value="ACCOUNTABLE_EXECUTIVE">Accountable executive</option>
          </select></label>
        <button type="submit" class="btn btn-primary">Provision</button>
        <p class="field-error" data-err="provision" role="status" aria-live="polite"></p>
      </form>
      <div data-issued hidden></div>

      <h2>Provisioned operators</h2>
      ${ops.length
        ? html`<div class="rec-list">${ops.map(Operator)}</div>`
        : html`<p class="empty-state"><span>No operators provisioned yet.</span></p>`}
    </section>
  `.toString();

  const show = (sel, message) => {
    const el = outlet.querySelector(sel);
    if (el) el.textContent = message;
  };

  outlet.querySelector('form[data-provision]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const body = {
      orgName: f.orgName.value.trim(),
      jurisdiction: 'KE',
      adminName: f.adminName.value.trim(),
      adminEmail: f.adminEmail.value.trim(),
      adminRole: f.adminRole.value,
    };
    if (f.aocNumber.value.trim()) body.aocNumber = f.aocNumber.value.trim();
    if (f.fleetSize.value !== '') body.fleetSize = Number(f.fleetSize.value);
    show('[data-err="provision"]', '');
    try {
      const res = await authFetch('/api/v1/admin/operators', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('That was not accepted. Nothing was created.');
      const out = await res.json();
      const panel = outlet.querySelector('[data-issued]');
      /* THE CREDENTIAL IS RENDERED, NOT ALERTED, and the screen is not
         re-rendered afterwards — a refresh that wiped the only copy of
         a password the moment it appeared would be the cruellest
         possible interaction. */
      panel.hidden = false;
      panel.innerHTML = html`
        <div class="notice">
          <strong>${out.name} provisioned.</strong>
          Trial ends ${fmt(out.trialEndsOn)}.
          <p>Sign-in: <code>${out.adminEmail}</code></p>
          <p>Password: <code data-issued-password>${out.password}</code></p>
          <p>
            This is the only time this password is shown. It is not stored in a
            form anything can read back. If it is lost, the operator resets it.
          </p>
          <p data-invitation>
            ${out.invitation === 'SENT'
              ? 'An invitation has been emailed to them with the sign-in link. It does ' +
                'not contain the password — pass that on yourself.'
              : out.invitation === 'NOT_CONFIGURED'
                ? 'NO INVITATION WAS SENT: this deployment has no mail key set, so ' +
                  'nothing reached them. They do not know the account exists until you ' +
                  'tell them.'
                : 'THE INVITATION FAILED TO SEND' +
                  (out.invitationReason ? ` — ${out.invitationReason}` : '') +
                  '. They do not know the account exists. Contact them directly.'}
          </p>
        </div>`.toString();
      f.reset();
    } catch (err) {
      /* The form keeps what was typed. Re-rendering on failure is how a
         careful operator loses six fields to a typo in the seventh. */
      show('[data-err="provision"]',
        String(err?.message ?? 'That was not accepted. Nothing was created.'));
    }
  });

  for (const form of outlet.querySelectorAll('form[data-entitlement]')) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      const id = f.getAttribute('data-entitlement');
      const body = { reason: f.reason.value.trim() };
      if (f.paidThrough.value) body.paidThrough = new Date(f.paidThrough.value).toISOString();
      if (f.trialEndsOn.value) body.trialEndsOn = new Date(f.trialEndsOn.value).toISOString();
      show(`[data-err="${id}"]`, '');
      if (!body.reason) {
        show(`[data-err="${id}"]`, 'A reason is required — it is what the audit entry carries.');
        return;
      }
      try {
        const res = await authFetch(`/api/v1/admin/operators/${id}/entitlement`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('That was not accepted. Nothing was changed.');
        const out = await res.json();
        show(`[data-err="${id}"]`,
          `Recorded. ${out.name} is now ${String(out.state).toLowerCase()}.`);
      } catch (err) {
        show(`[data-err="${id}"]`,
          String(err?.message ?? 'That was not accepted. Nothing was changed.'));
      }
    });
  }
}
