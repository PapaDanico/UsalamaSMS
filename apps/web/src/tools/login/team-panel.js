/* ============================================================
   THE PEOPLE, AND UNTIL NOW AN OPERATOR HAD ONE.

   Nine roles, a permission matrix, role-gated routes throughout — and
   nothing anywhere created a second user. Signup made one accountable
   executive; the vendor console made one administrator; and that was
   the whole organisation. Filing a report requires a session, so the
   FRONTLINE staff the entire reporting system exists for could not have
   accounts at all, the triage queue had nobody to staff it, and
   investigator assignment had nobody to assign to.

   ------------------------------------------------------------
   THE ROLE PICKER SHOWS ONLY WHAT THIS CALLER MAY CREATE.

   `mayCreateRole` is the same function the API refuses with, imported
   rather than re-implemented — a screen that offered a role the server
   rejects would teach an administrator that the product is broken, and
   a screen that offered MORE than the server allows would be the more
   dangerous half of the same bug.

   Two roles are absent from every caller's list:

     · PLATFORM_ADMIN, always. It belongs to whoever supplies this
       product, and a tenant that could mint one could read the other
       tenants;
     · anything that reads a safety narrative, when the caller reads
       none. A SYSTEM_ADMIN deliberately cannot open a report — and
       could otherwise create a safety manager, set its password, sign
       in, and read everything. Each step authorised; the sequence the
       breach. permissions.ts carries that argument in full.

   ------------------------------------------------------------
   THE PASSWORD IS SHOWN ONCE AND THE SCREEN IS NOT RE-RENDERED after
   it appears — the same interaction the vendor console uses, for the
   same reason: a refresh that wiped the only copy of a credential the
   moment it appeared would be the cruellest possible moment to lose it.
   ============================================================ */
import { html } from '../../shared/html.js';
import { authFetch, isSignedIn } from '../../shared/session.js';
import { RoleEnum } from '../../../../../packages/shared/src/index.ts';
import { mayCreateRole } from '../../../../../packages/shared/src/permissions.ts';

/* What each role is FOR, in the words an operator uses about their own
   people rather than the enum's. A picker that reads SAFETY_OFFICER
   asks somebody to translate; this one does not. */
const ROLE_LABEL = {
  FRONTLINE: 'Frontline — files reports, reads their own',
  SAFETY_OFFICER: 'Safety officer — triages the queue, assesses risk',
  SAFETY_MANAGER: 'Safety manager — runs the SMS',
  INVESTIGATOR: 'Investigator — investigates, cannot triage',
  KEY_MANAGEMENT: 'Key management — approves change, verifies audits',
  ACCOUNTABLE_EXECUTIVE: 'Accountable executive — signs the policy',
  REGULATOR_INSPECTOR: 'Regulator — verifies the chain, reads no narrative',
  SYSTEM_ADMIN: 'Account administrator — accounts only, no safety record',
  PLATFORM_ADMIN: '',
};

function Person(u, me) {
  /* NO BUTTON AGAINST YOURSELF. The server refuses it with a 409 and a
     sentence, and offering a control whose only outcome is a refusal
     teaches somebody that the product is unreliable. The refusal stays
     on the server because this screen is not the only caller. */
  const self = u.id === me;
  return html`<article class="rec" data-person>
    <h3>${u.name}</h3>
    <p class="rec__meta">
      <span>${u.email}</span>
      <span>${(ROLE_LABEL[u.role] ?? u.role).split(' — ')[0]}</span>
      ${u.active ? '' : html`<span>deactivated</span>`}
    </p>
    ${self
      ? ''
      : html`<button
          type="button"
          class="btn btn-ghost btn-sm"
          data-active-toggle="${u.id}"
          data-to="${u.active ? 'false' : 'true'}"
        >${u.active ? 'Deactivate' : 'Reactivate'}</button>`}
  </article>`;
}

export async function render(outlet) {
  if (!isSignedIn()) {
    outlet.innerHTML = html`
      <section class="panel wrap">
        <header class="page-head">
          <span class="eyebrow">Your organisation</span>
          <h1>The people</h1>
          <p class="lede">Sign in to see who has an account here.</p>
        </header>
      </section>`.toString();
    return;
  }

  let users = [];
  let role = '';
  let myId = '';
  let denied = false;
  try {
    const [me, list] = await Promise.all([
      authFetch('/api/v1/auth/me'),
      authFetch('/api/v1/users'),
    ]);
    if (me.ok) {
      const mine = await me.json();
      role = mine?.role ?? '';
      myId = mine?.userId ?? '';
    }
    if (list.status === 403) denied = true;
    else if (list.ok) users = (await list.json()).users ?? [];
  } catch {
    /* Rendered as an empty team below rather than as a blank screen. */
  }

  /* DERIVED FROM THE MATRIX, NOT LISTED. A role added to the enum
     appears here without anybody remembering to add it, and one the
     caller may not create cannot appear at all. */
  const creatable = role
    ? RoleEnum.options.filter((r) => mayCreateRole(role, r))
    : [];

  outlet.innerHTML = html`
    <section class="panel wrap">
      <header class="page-head">
        <span class="eyebrow">Your organisation</span>
        <h1>The people</h1>
        <p class="lede">
          Everybody who can sign in here, and what each of them may do. A
          reporting system with one account is a reporting system with one
          reporter.
        </p>
      </header>

      ${denied
        ? html`<div class="notice" data-denied>
            <strong>Your role cannot manage accounts.</strong>
            The accountable executive or an account administrator can add
            people. Nothing here is hidden from you by accident — reading who
            works here is a different question from reading what they filed.
          </div>`
        : html`
          <h2>Add somebody</h2>
          <form class="card" id="add-person" novalidate>
            <label>Their name
              <input name="name" type="text" required minlength="2" maxlength="160" /></label>
            <label>Their email
              <input name="email" type="email" required maxlength="254" /></label>
            <label>What they do
              <select name="role" required>
                <option value="">Choose a role</option>
                ${creatable.map(
                  (r) => html`<option value="${r}">${ROLE_LABEL[r] ?? r}</option>`
                )}
              </select></label>
            <button type="submit" class="btn btn-primary">Create the account</button>
            <p class="field-error" data-err="add" role="status" aria-live="polite"></p>
          </form>
          <div data-issued hidden></div>

          <h2>Who is here</h2>
          ${users.length
            ? html`<div class="rec-list">${users.map((u) => Person(u, myId))}</div>`
            : html`<p class="empty-state"><span>Only you, so far.</span></p>`}
          <p class="field-error" data-err="active" role="status" aria-live="polite"></p>
        `}
    </section>
  `.toString();

  /* DELEGATED AND ATTACHED EXACTLY ONCE.

     A successful toggle re-renders, and `render` runs this block again
     — so binding here unguarded stacks a second listener on the same
     outlet, and the third click fires four requests. The flag is on the
     DOM node rather than in module scope because the outlet is
     replaced when the router changes screens, and a module-level flag
     would leave the panel dead on the second visit.

     The error paragraph is re-queried INSIDE the handler for the same
     reason: `innerHTML` replaces it, so a reference captured out here
     points at a detached node after the first toggle and every message
     after that would be written somewhere nobody can see. */
  if (!outlet.dataset.teamBound) {
    outlet.dataset.teamBound = '1';
    outlet.addEventListener('click', onToggle);
  }

  async function onToggle(event) {
    const button = event.target.closest?.('[data-active-toggle]');
    if (!button) return;
    const activeError = outlet.querySelector('[data-err="active"]');
    if (!activeError) return;
    const id = button.dataset.activeToggle;
    const to = button.dataset.to === 'true';

    /* CONFIRMED, because it signs somebody out of every device and the
       button sits in a list of colleagues where a mis-tap is cheap to
       make and expensive to discover. Reactivating is not confirmed —
       it takes nothing away. */
    if (!to && !globalThis.confirm?.(
      'Deactivate this account? They will be signed out everywhere and cannot ' +
      'sign in again until somebody reactivates them. Their reports stay.'
    )) return;

    activeError.textContent = '';
    button.disabled = true;
    try {
      const res = await authFetch(`/api/v1/users/${id}/active`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: to }),
      });
      const answer = await res.json().catch(() => ({}));
      if (!res.ok) {
        /* THE SERVER'S SENTENCE. The two refusals — your own account,
           and the last accountable executive — each explain what to do
           instead, and "forbidden" would read as a malfunction. */
        activeError.textContent = answer.message ?? 'That was not accepted. Nothing changed.';
        button.disabled = false;
        return;
      }
      await render(outlet);
    } catch {
      activeError.textContent = 'The safety office could not be reached. Nothing changed.';
      button.disabled = false;
    }
  }

  const form = outlet.querySelector('#add-person');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    const body = {
      name: f.elements.name.value,
      email: f.elements.email.value,
      role: f.elements.role.value,
    };
    const err = outlet.querySelector('[data-err="add"]');
    err.textContent = '';
    try {
      const res = await authFetch('/api/v1/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const answer = await res.json().catch(() => ({}));
        /* THE SERVER'S OWN SENTENCE where it wrote one. The refusal for
           an escalation attempt explains which role to ask, and
           "forbidden" would read as a malfunction to somebody who can
           plainly see the role in a list. */
        err.textContent =
          answer.message ??
          (answer.error === 'email_already_registered'
            ? 'That address already has an account.'
            : 'That was not accepted. Nothing was created.');
        return;
      }
      const out = await res.json();
      const panel = outlet.querySelector('[data-issued]');
      panel.hidden = false;
      panel.innerHTML = html`
        <div class="notice">
          <strong>${out.name} can now sign in.</strong>
          <p>Sign-in: <code>${out.email}</code></p>
          <p>Password: <code data-issued-password>${out.password}</code></p>
          <p>
            Shown once, and not stored in a form anything can read back. Pass it
            on directly — an emailed password stays in a mailbox long after it
            should. If it is lost, reset it rather than making a second account.
          </p>
        </div>`.toString();
      f.reset();
    } catch {
      err.textContent = 'The safety office could not be reached. Nothing was created.';
    }
  });
}
