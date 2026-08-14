/* ============================================================
   THE IDENTITY BLOCK ON A PRINTED DOCUMENT.

   /sms and /picture are the two screens an operator prints, hands over,
   and lets somebody read as loose paper. A pack with no operator name
   on it is a pack an auditor cannot attribute, and the org id in the
   token is a uuid, which is useless on paper.

   IT RENDERS NOTHING WHEN THE NAME IS UNKNOWN. A header saying
   "UsalamaSMS operator" over somebody's audit pack is worse than no
   header: a document is attributed or it is not, and half-attributed is
   the version that gets filed under the wrong operator.

   THE PRINT DATE IS STAMPED, and it is the date of PRINTING rather than
   of any record inside. An auditor asks how current a pack is, and the
   honest answer is when it came off the printer — every record it
   contains carries its own dates already.

   Hidden on screen by .print-id in the stylesheet, so this costs a
   reader nothing.
   ============================================================ */

import { html } from './html.js';
import { authFetch } from './session.js';

/* ============================================================
   THE ORGANISATION'S NAME, LOADED HERE AND NOT IN THE SHELL.

   This lived in session.js for one build and pushed the ENTRY chunk to
   214.2 KB against a 214 KB budget — the first time entry has broken
   its budget, and exactly the moment two previous receipts said to take
   something out rather than buy more.

   It did not belong there. session.js is in the entry chunk because the
   shell needs authentication on every screen; the operator's NAME is
   needed by two lazily-loaded documents and nowhere else. Moving it
   here costs a reporter at a strip nothing and costs the safety manager
   printing an audit pack the same round trip either way.

   Only the storage key stays in the shell, because signing out has to
   clear it.

   FETCHED FROM /api/v1/auth/me rather than read out of the token,
   deliberately: a token is a credential and should carry claims, not
   display strings that go stale the day an operator renames itself.
   ============================================================ */
const ORG_KEY = 'usalamasms.org';

export async function loadOrg(fetcher = fetch) {
  try {
    const held = localStorage.getItem(ORG_KEY);
    if (held) {
      const parsed = JSON.parse(held);
      if (parsed?.orgName) return parsed;
    }
  } catch {
    // A corrupt cache is not a reason to skip the fetch.
  }
  try {
    const res = await authFetch('/api/v1/auth/me', {}, fetcher);
    if (!res.ok) return null;
    const body = await res.json();
    if (!body.orgName) return null;
    const org = {
      orgName: body.orgName,
      aocNumber: body.aocNumber ?? null,
      jurisdiction: body.jurisdiction ?? null
    };
    localStorage.setItem(ORG_KEY, JSON.stringify(org));
    return org;
  } catch {
    return null;
  }
}

export function printId(org, what) {
  if (!org?.orgName) return '';
  const printed = new Date().toISOString().slice(0, 10);
  return html`
    <div class="print-id">
      <p class="print-id__org">${org.orgName}</p>
      <p class="print-id__what">${what}</p>
      <p class="print-id__meta">
        ${org.aocNumber ? `AOC ${org.aocNumber} · ` : ''}Printed ${printed} ·
        Produced with UsalamaSMS
      </p>
      <hr class="print-id__rule" />
    </div>
  `;
}
