/* ============================================================
   THE IDENTITY BLOCK ON A PRINTED DOCUMENT.

   SIX SCREENS CARRY A PRINT BUTTON. This block was on two of them.

   The four without it were the risk register, the safety performance
   indicators, the safety risk assessment and the maturity assessment —
   which is to say, the four documents an auditor is most likely to be
   handed. The reasoning below was written for /sms and /picture and
   applies unchanged to all six; it simply was not carried across as
   each screen gained its button. A smoke check now discovers the print
   buttons rather than naming them, so the seventh screen to gain one
   fails the build until it is attributed too.

   An operator prints these, hands them over, and lets somebody read
   them as loose paper. A pack with no operator name on it is a pack an
   auditor cannot attribute, and the org id in the token is a uuid,
   which is useless on paper.

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
      jurisdiction: body.jurisdiction ?? null,
      /* CACHED WITH THE REST OF THE IDENTITY, so a pack prints the
         operator's mark with no signal. The upload screen clears this
         cache on save — otherwise a newly set logo would not appear on
         a printed document until the cache expired, and the person who
         just uploaded it is exactly the person about to print. */
      logo: body.logo ?? null
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
      ${org.logo
        ? /* THE OPERATOR'S MARK, WHERE THEY HAVE SET ONE. The pack is
             their document — their assessment, their register — and it
             went out under UsalamaSMS's identity until now.

             alt is empty ON PURPOSE. The operator's name is the very
             next line as live text, so a screen reader announcing the
             logo would say it twice; that is the accessible-name defect
             a Lighthouse run found on the sibling product's logo. The
             attribution line below still says what produced it. */
          html`<img class="print-id__logo" src="${org.logo}" alt="" />`
        : ''}
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

/**
 * The operator's name IF IT IS ALREADY KNOWN. Never a request.
 *
 * `loadOrg()` reads this cache and falls back to the network. That is
 * right for /sms and /picture, which need a session to show anything at
 * all. It is WRONG for the device-local toolkits, and a smoke check
 * says so out loud: the maturity assessment asserts it sends NOTHING,
 * and wiring loadOrg() into it made the screen issue two GETs to
 * /api/v1/auth/me and turned that check red.
 *
 * The assertion is not fussiness. An operator fills in the maturity
 * assessment while deciding whether to trust this product — before
 * there is an account, and often before there is any intention of
 * creating one. A screen that phones home during that is a screen that
 * has answered the question being asked of it, in the wrong direction.
 * Element 2.2's register and the risk assessment are on the device for
 * the same reason.
 *
 * So attribution on those screens is opportunistic: if the safety
 * manager has been to /sms in this browser the name is in hand and the
 * pack is attributed; if not, nothing renders. That is the same refusal
 * printId() already implements, arrived at without a request.
 */
function cachedOrg() {
  try {
    const held = localStorage.getItem(ORG_KEY);
    if (!held) return null;
    const parsed = JSON.parse(held);
    return parsed?.orgName ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Fill a screen's `.print-id-slot` with the identity block.
 *
 * WHY A SLOT RATHER THAN AN AWAIT. /sms and /picture render
 * asynchronously and can await `loadOrg()` before building their
 * markup. The register, the indicators, the risk assessment and the
 * maturity assessment all render SYNCHRONOUSLY and instantly, and three
 * of the four work with no session at all. Making them await anything
 * to print a header would trade a real property — the screen is there
 * the moment you open it — for one that only matters on paper.
 *
 * DEFAULTS TO THE CACHE AND NOTHING ELSE. `allowFetch` is opt-in and is
 * for screens that are already talking to the server on this render, so
 * that one more round trip changes nothing about what the screen does.
 * Passing it on a device-local toolkit would undo the property above.
 */
export async function attachPrintId(outlet, what, { allowFetch = false, fetcher = fetch } = {}) {
  const slot = outlet.querySelector('.print-id-slot');
  if (!slot) return;
  const org = allowFetch ? await loadOrg(fetcher) : cachedOrg();
  slot.innerHTML = printId(org, what).toString();
}
