/* ============================================================
   SIGNING UP — the panel, lazily imported.

   THE ROUTE THIS PRODUCT DID NOT HAVE. Nineteen screens, fifty-four
   routes and eleven of Annex 19's twelve elements, and the only way an
   operator could come into existence was a seed script run against the
   database by hand. That is what made it demonstrable and unsellable at
   the same time.

   IN ITS OWN MODULE, and the budget is why. It began inside the account
   screen, which is EAGER because signing in is what sends a queued
   report — and it put 5.6 KB into the first paint of the form a ramp
   agent opens at a remote strip, to carry a form an operator fills in
   once in its life. Entry went 214.9 -> 220.5. The same defect as the
   admin reset panel and the export panel, both of which live beside
   this file for the same reason.

   THE ACCOUNTABLE EXECUTIVE IS NAMED, not chosen. The copy says whose
   account this is, because the person filling it in IS the first user
   and Annex 19 makes that post personally answerable — somebody should
   know that before they type, not after they find they cannot change
   it.
   ============================================================ */

import { html } from '../../shared/html.js';
import { isSignedIn, getSession, adoptSession } from '../../shared/session.js';
import { Select } from '../../components/Select.js';
/* THE VOCABULARIES, IN THIS CHUNK AND NOT THE ENTRY ONE. Twenty-six
   aircraft types, eighteen aerodromes and seven operation types is
   about a kilobyte, and this module is already lazily imported for
   exactly that reason — a ramp agent filing a report never loads it.
   Imported by path rather than through the barrel, same as everywhere
   else that touches these lists. */
import { AIRCRAFT_TYPES, AERODROMES } from '../../../../../packages/shared/src/taxonomy.ts';
import { OPERATION_TYPES } from '../../../../../packages/shared/src/adrep.ts';
import { JURISDICTIONS } from '../../../../../packages/shared/src/regulations.ts';

const JURISDICTION_LABELS = {
  KE: 'Kenya (KCAA)',
  UG: 'Uganda (UCAA)',
  TZ: 'Tanzania (TCAA)',
  RW: 'Rwanda (RCAA)',
  BI: 'Burundi (AACB)',
  SS: 'South Sudan (SSCAA)',
  CD: 'DR Congo (AAC/RDC)',
  SO: 'Somalia (SCAA)'
};

const JURISDICTION_OPTIONS = JURISDICTIONS.map((code) => ({
  value: code,
  label: JURISDICTION_LABELS[code] ?? code
}));

/* A collapsed group of checkboxes. `details` rather than a multi-select
   because a native `select multiple` on a handset is a scroll region
   with no visible affordance for choosing more than one — the control
   people get wrong most reliably — and because collapsed keeps a form
   somebody fills in once from opening at four screens long. */
const CheckGroup = (name, legend, hint, options) => html`
  <details class="filters-shell">
    <summary><span>${legend}</span></summary>
    <p class="field-hint">${hint}</p>
    <fieldset class="queue__cat">
      <legend>${legend}</legend>
      ${options.map(
        (o) => html`<label class="queue__cat-opt">
          <input type="checkbox" name="${name}" value="${o.code}" />
          <span><b>${o.code}</b> ${o.label}</span>
        </label>`
      )}
    </fieldset>
  </details>`;

/* The ticked boxes for one group, or nothing at all. */
function picked(form, name) {
  const values = [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
  return values.length ? { [name]: values } : {};
}

const SHELL = html`<section class="band-dark"><div class="wrap"><span class="eyebrow">Account</span><h1>Create an operator</h1><p class="lede">This is how an operator comes to exist in the product. It takes a minute, and nobody has to call you.</p></div></section><section class="panel wrap">        <form id="signup-form" class="card" novalidate>
          <p class="lede lede--tight">
            This creates the operator and makes you its
            <strong>accountable executive</strong> — the post that signs the safety
            policy. Everyone else is added from inside, afterwards.
          </p>

          <label class="field">
            <span class="field-label">Operator name *</span>
            <input
              type="text" name="orgName" id="signup-org" required maxlength="160"
              autocomplete="organization" class="input-field"
            />
            <span class="field-hint">As it appears on the certificate.</span>
          </label>

          ${Select({
            name: 'jurisdiction',
            label: 'Jurisdiction',
            value: 'KE',
            options: JURISDICTION_OPTIONS,
            required: true,
            placeholder: 'Select jurisdiction…',
            hint: 'The civil aviation authority that issued your AOC or oversees operations.'
          })}

          <label class="field">
            <span class="field-label">AOC number</span>
            <input type="text" name="aocNumber" maxlength="60" class="input-field" />
            <span class="field-hint">
              Leave blank if you are still in certification — that is the point at
              which an SMS is worth the most.
            </span>
          </label>

          <label class="field">
            <span class="field-label">Aircraft</span>
            <input
              type="number" name="fleet" min="1" max="2000" inputmode="numeric"
              class="input-field"
            />
            <span class="field-hint">Decides the price band and nothing else.</span>
          </label>

          ${CheckGroup(
            'fleetTypes',
            'What you fly',
            'Optional, and it is the denominator. A count of occurrences means nothing without knowing what was flying — pick every type on the certificate.',
            AIRCRAFT_TYPES
          )}

          ${CheckGroup(
            'bases',
            'Where you fly from',
            'Optional. Which aerodrome accumulates precursors is the question this makes answerable.',
            AERODROMES
          )}

          ${CheckGroup(
            'operationTypes',
            'What kind of flying',
            'Optional. The same list an occurrence is coded against at triage, so your profile and your reports group together.',
            OPERATION_TYPES
          )}

          <label class="field">
            <span class="field-label">Your name *</span>
            <input
              type="text" name="name" required maxlength="120"
              autocomplete="name" class="input-field"
            />
          </label>

          <label class="field">
            <span class="field-label">Your email *</span>
            <input
              type="email" name="email" required autocomplete="email"
              inputmode="email" autocapitalize="off" spellcheck="false"
              class="input-field"
            />
          </label>

          <label class="field">
            <span class="field-label">Password *</span>
            <input
              type="password" name="password" required minlength="12"
              autocomplete="new-password" class="input-field"
            />
            <span class="field-hint">Twelve characters or more.</span>
          </label>

          <button type="submit" class="btn btn-primary btn-block">
            Create the operator
          </button>
          <p class="field-error" id="signup-status" role="status" aria-live="polite"></p>
        </form>
</section>`.toString();

/* ============================================================
   CREATING THE OPERATOR.

   Posts the form and then does exactly what signing in does, because
   that is what has just happened: the route returns tokens, so the
   person who typed their operator's name is signed in as its
   accountable executive without being asked to prove it a second time.

   THE SERVER'S REFUSAL IS SHOWN AS WRITTEN, and its wording matters
   more here than anywhere else on this screen. A duplicate address is
   refused WITHOUT saying the address exists — the login route goes to
   real trouble not to be an account-enumeration oracle, and a signup
   form answering "that email is taken" would hand back the oracle
   login closed. The sentence the server returns is true either way.
   ============================================================ */
export function render(slot) {
  if (!slot) return;
  if (isSignedIn()) {
    const session = getSession() ?? {};
    slot.innerHTML = html`
      <section class="band-dark">
        <div class="wrap">
          <span class="eyebrow">Account</span>
          <h1>Operator account</h1>
          <p class="lede">You are currently signed in.</p>
        </div>
      </section>
      <section class="panel wrap">
        <div class="card">
          <p class="lede lede--tight">
            You are signed in as <strong>${session.role ?? 'User'}</strong>.
          </p>
          <p>
            <a class="btn btn-primary" href="/account">Go to account overview</a>
          </p>
        </div>
      </section>
    `.toString();
    return;
  }

  slot.innerHTML = SHELL;
  const form = slot.querySelector('#signup-form');
  const status = slot.querySelector('#signup-status');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const f = form.elements;
    const button = form.querySelector('button[type=submit]');

    const fleetRaw = f.fleet.value.trim();
    const fleetNum = Number(fleetRaw);
    const jurisdiction = f.jurisdiction?.value || 'KE';

    const body = {
      orgName: f.orgName.value.trim(),
      jurisdiction,
      name: f.name.value.trim(),
      email: f.email.value.trim().toLowerCase(),
      password: f.password.value,
      ...(f.aocNumber.value.trim() ? { aocNumber: f.aocNumber.value.trim() } : {}),
      ...(fleetRaw && Number.isInteger(fleetNum) && fleetNum > 0 ? { fleet: fleetNum } : {}),
      /* Only sent when something was ticked. An empty array and an
         absent key mean the same thing to the route, and sending three
         empty arrays on every signup is three keys of noise in the one
         request this product cannot afford to have rejected. */
      ...picked(form, 'fleetTypes'),
      ...picked(form, 'bases'),
      ...picked(form, 'operationTypes')
    };

    if (!body.orgName || !body.name || !body.email || !body.password) {
      status.textContent = 'The operator, your name, your email and a password are all needed.';
      return;
    }
    if (body.password.length < 12) {
      status.textContent = 'The password needs twelve characters or more.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Creating…';

    try {
      const res = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        button.disabled = false;
        status.textContent =
          detail.message ??
          (res.status === 429
            ? 'Too many attempts from here. Try again in an hour.'
            : 'That could not be created. Check the details and try again.');
        return;
      }
      const session = await res.json();
      /* Stored the same way signIn() stores one, through the same
         module, so there is one place that knows what a session is. */
      adoptSession(session);
      form.elements.password.value = '';
      window.dispatchEvent(new CustomEvent('usalamasms:session-changed'));
      window.location.href = '/account';
    } catch {
      button.disabled = false;
      status.textContent =
        'No connection. The operator was not created — nothing was sent.';
    }
  });
}
