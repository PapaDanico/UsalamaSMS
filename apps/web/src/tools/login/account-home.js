/* ============================================================
   THE ACCOUNT AREA — what this person is, and what they can open.

   WHAT WAS HERE BEFORE. A sign-out button and two slots. Signing in
   produced a banner saying "Signed in", and then the product offered a
   safety manager no page that answered "what can I do now". Eighteen
   destinations existed and the only way to find them was the menu — a
   list identical for a ramp agent and an accountable executive, so
   somebody opened a screen their role does not hold and met a refusal.

   That teaches a person the software is unreliable rather than that the
   permission belongs to somebody else, which is the same defect /today
   was built to end: it stopped showing a reporter a refusal on a page
   titled what needs YOU today, and showed them their own two facts
   instead.

   -------------------------------------------------------------
   THE SERVER SAYS WHAT THIS CALLER HOLDS. `/api/v1/auth/me` returns the
   permission set, and account.ts says what each destination needs. The
   screen intersects them and nothing here re-derives a role's rights —
   the same rule the triage queue follows when it returns which moves a
   caller may make rather than letting the screen work it out. A client
   that decides for itself what a role may do is a second copy of the
   permission table, and it is the copy that goes stale.

   -------------------------------------------------------------
   LAZY, AND THAT IS THE WHOLE REASON THIS IS ITS OWN MODULE. It sits
   beside admin-reset.js, export-panel.js and signup-panel.js for the
   reason all three were split out: the account screen is EAGER, because
   signing in is what sends a queued report, so anything added to it is
   parsed before first paint by a ramp agent at a remote strip who is
   filing a hazard and will never open an index of toolkits.

   -------------------------------------------------------------
   IT DOES NOT CACHE THE IDENTITY. getSession() already holds the role
   from the token, and the name and email come from the server on every
   open. A profile edited on another device would otherwise render stale
   here, and the one screen whose subject is "who you are" is the worst
   place to be confidently out of date.
   ============================================================ */

import { html } from '../../shared/html.js';
import { authFetch, getSession } from '../../shared/session.js';
import {
  ACCOUNT_GROUPS,
  ACCOUNT_DESTINATIONS
} from '../../../../../packages/shared/src/account.ts';

/**
 * WHAT THE SERVER SAYS ABOUT THE PERSON, or null when it could not be
 * asked.
 *
 * NULL IS NOT AN EMPTY PROFILE. A screen that renders a blank name
 * because a request failed is telling somebody their account has no
 * name — see the caller, which distinguishes the two rather than
 * flattening them.
 */
async function fetchMe() {
  try {
    const res = await authFetch('/api/v1/auth/me');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** A destination card. Whole card is the target, not just the label. */
const Card = (d) => html`
  <li class="account-card">
    <a href="${d.href}">
      <strong>${d.label}</strong>
      <span>${d.hint}</span>
    </a>
  </li>`;

/**
 * WHAT THIS CALLER CAN REACH, intersected here.
 *
 * The permission list is the SERVER'S answer. A destination needing
 * nothing is offered to anybody signed in; one needing a permission is
 * offered only when the server said the caller holds it. An unknown
 * permission name therefore hides the card rather than showing it,
 * which is the safe direction: a card that leads nowhere is worse than
 * a card that is missing, and a missing one is visible in this file.
 */
function reachable(permissions) {
  const held = new Set(permissions ?? []);
  return ACCOUNT_DESTINATIONS.filter((d) => d.needs === null || held.has(d.needs));
}

export async function mount(slot, session = getSession() ?? {}) {
  slot.innerHTML = html`<p class="hint">Loading your account…</p>`.toString();

  const me = await fetchMe();
  const open = reachable(me?.permissions);

  slot.innerHTML = html`
    <section class="panel wrap">
      <header class="page-head">
        <span class="eyebrow">Your account</span>
        <h2>${me?.name ?? 'Signed in'}</h2>
        ${me
          ? html`<p class="lede">
              ${me.email ?? ''}${me.orgName ? html` · ${me.orgName}` : ''}
            </p>`
          : /* THE REQUEST FAILED, AND THAT IS DIFFERENT FROM AN EMPTY
               PROFILE. Rendering a blank name here would tell somebody
               their account has none. */
            html`<p class="notice notice--error">
              Your profile could not be read from the safety office, so only what
              this device already knows is shown. That is not the same as the
              account being empty.
            </p>`}
      </header>

      <dl class="account-facts">
        <div>
          <dt>Your role</dt>
          <dd>${session.role ?? '—'}</dd>
        </div>
        ${me?.orgName
          ? html`<div>
              <dt>Operator</dt>
              <dd>${me.orgName}${me.aocNumber ? html` · AOC ${me.aocNumber}` : ''}</dd>
            </div>`
          : ''}
        ${me?.jurisdiction
          ? html`<div>
              <dt>Answers to</dt>
              <dd>${me.jurisdiction}</dd>
            </div>`
          : ''}
      </dl>

      <p class="hint">
        <a href="/account/profile">Change your name or password</a>
      </p>
    </section>

    ${ACCOUNT_GROUPS.map((group) => {
      const inGroup = open.filter((d) => d.group === group);
      if (!inGroup.length) return '';
      return html`
        <section class="panel wrap">
          <h3>${group}</h3>
          <ul class="account-grid picture-grid">${inGroup.map(Card)}</ul>
        </section>`;
    })}

    ${open.length
      ? ''
      : /* EVERY ROLE REACHES AT LEAST FOUR OF THESE, so an empty grid
           means the server sent a permission set this build does not
           recognise — a fault worth showing rather than an empty page
           worth rendering. */
        html`<section class="panel wrap">
          <p class="notice notice--error">
            Nothing could be listed for your role. That is a fault in this
            software rather than a limit on your account — every role reaches
            at least the day's summary and the toolkits. Tell your safety
            manager, and file reports as normal in the meantime.
          </p>
        </section>`}
  `.toString();
}
