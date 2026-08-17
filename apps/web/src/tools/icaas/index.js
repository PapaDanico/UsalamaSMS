/* ============================================================
   THE KCAA PACK — everything the portal asks for, with nothing to
   retype, and no claim that it has been sent.

   WHAT THIS SCREEN IS FOR. The Authority raises a Corrective Action
   Request against an operator. The operator answers it with a
   Corrective Action Plan, submitted at ecitizen.kcaa.or.ke, and once an
   inspector approves the CAP they upload implementation evidence
   against it. This product already holds every one of those objects —
   the finding is the CAR, the corrective action is the CAP, the report
   attachments are the evidence. What was missing was the last mile: a
   safety manager retyping, into a portal, what is already written down
   here, and hunting through a shared drive for the file whose hash
   they need to quote.

   ------------------------------------------------------------
   IT DOES NOT SUBMIT, AND THE SCREEN SAYS SO WHERE IT CANNOT BE
   MISSED.

   There is no ICAAS API — the manual describes a web portal a person
   signs into. The single worst outcome in this whole feature is an
   operator believing a CAP reached KCAA when it did not, because they
   would stop chasing it and find out from an inspector who never saw
   it. So `submitsToAuthority` comes back on every response and this
   screen renders the disclaimer from THAT rather than from a constant
   it compiled in — a screen cannot drift into "sent" without the
   server changing its mind first.

   The button therefore says "Open the KCAA portal", which is what it
   does. Not "Submit", not "Send to KCAA", not "File CAP".

   ------------------------------------------------------------
   NOTHING IS FILLED IN THAT THE RECORD DOES NOT HOLD.

   The temptation in a handoff is to make the pack look complete — a
   target date of "30 days from now", an owner of "Safety Manager". An
   operator would carry that invention to their regulator under their
   own signature. Every absent field is NAMED instead, above the portal
   link rather than below it.

   THE LINK IS NOT DISABLED WHEN SOMETHING IS MISSING, and that was a
   deliberate reversal. Greying it out would be this product refusing an
   operator access to their own regulator's website on the strength of a
   gap in OUR record — and the gap may be one they can answer from
   memory, or one they are opening the portal to go and check. Naming
   what is missing is help; blocking the door is a vendor deciding when
   somebody may talk to their Authority.

   AND WITHHELD IS NOT ABSENT. A SAFETY_OFFICER may read the corrective
   action and may not read the audit finding behind it. If that came
   back as "no CAR is linked", they would go to the portal to pick one
   — for an action whose CAR reference is sitting three feet away
   behind a permission. The server distinguishes the two; this screen
   renders both, differently.

   ------------------------------------------------------------
   IT IS BUILT TO BE PRINTED. A CAP gets read in a meeting, initialled,
   and filed. attachPrintId puts the operator's own name and mark at the
   head of it, because the document is theirs.
   ============================================================ */
import { html } from '../../shared/html.js';
import { ToolNav } from '../../shared/tool-nav.js';
import { attachPrintId } from '../../shared/print-id.js';
import { isSignedIn, authFetch } from '../../shared/session.js';

const longDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
      })
    : null;

/* The id of the action to compose, taken from the query string so the
   risk picture can link straight to a pack rather than making somebody
   choose from a list they have just come from. */
const actionId = () => new URLSearchParams(window.location.search).get('action');

function Field(label, value, absentNote) {
  return html`<div class="deflist__row">
    <dt>${label}</dt>
    <dd>${value ? value : html`<em>${absentNote}</em>`}</dd>
  </div>`;
}

function Missing(list) {
  if (!list.length) return '';
  return html`<div class="card" data-missing>
    <h3>Before you raise this at the portal</h3>
    <p class="hint">
      An inspector sends back a CAP with gaps in it. These are the ones
      in this record — this product does not fill them in, because an
      invented answer is one you would sign.
    </p>
    <ul>
      ${list.map((m) => html`<li>${m}</li>`)}
    </ul>
  </div>`;
}

function Withheld(list) {
  if (!list.length) return '';
  return html`<div class="card no-print" data-withheld>
    <h3>Not shown to your role</h3>
    <p class="hint">
      These exist on the record and your permissions do not open them.
      They are named rather than left out, so the pack you print is not
      quietly shorter than the pack somebody else would print.
    </p>
    <ul>
      ${list.map((w) => html`<li>${w}</li>`)}
    </ul>
  </div>`;
}

function Evidence(files) {
  if (!files.length) {
    return html`<p class="hint" data-evidence-empty>
      No files are attached to the record behind this action. Evidence is
      uploaded at the portal <strong>after</strong> the CAP is approved,
      so this does not stop you raising it.
    </p>`;
  }
  return html`<table class="oblig-table" data-evidence>
    <caption class="visually-hidden">Files held against this action</caption>
    <thead>
      <tr><th scope="col">File</th><th scope="col">SHA-256</th></tr>
    </thead>
    <tbody>
      ${files.map(
        (f) => html`<tr>
          <td>${f.label}</td>
          <td><code>${f.sha256}</code></td>
        </tr>`
      )}
    </tbody>
  </table>`;
}

function Pack(data) {
  const p = data.pack;
  return html`
    <div class="card" data-pack>
      <h2 class="section-title">Corrective action plan</h2>
      <dl class="deflist deflist--tight">
        ${Field('CAR reference', p.reference === '—' ? null : p.reference,
          'no reference — the portal will ask for one')}
        ${Field('The finding', p.finding,
          data.withheld.length ? 'withheld from your role' : 'no audit finding is linked')}
        ${Field('Corrective action', p.action, 'the action is empty')}
        ${Field('Accountable post', p.ownerPost, 'no post is accountable')}
        ${Field('Target date', longDate(p.targetDate), 'no target date')}
        ${Field('Completed', longDate(p.completedOn), 'not yet completed')}
        ${Field('Verified', longDate(p.verifiedOn), 'not yet verified')}
      </dl>

      <h3 class="section-title">Implementation evidence</h3>
      ${Evidence(p.evidence)}
    </div>

    ${Missing(p.missing)}
    ${Withheld(data.withheld)}

    <div class="card no-print">
      <h3>What you do next</h3>
      <ol class="next-list">
        ${data.steps.map((s) => html`<li>${s}</li>`)}
      </ol>
      <p class="hint">
        <strong>Before any of that will work:</strong>
        ${data.prerequisites.join(' ')}
      </p>
      <p class="mat-actions">
        <a
          class="btn btn-primary"
          href="${data.portal}"
          target="_blank"
          rel="noopener noreferrer"
          data-portal
        >Open the KCAA portal</a>
        <button type="button" class="btn btn-secondary btn-sm" id="cap-print">
          Print this pack
        </button>
      </p>
      <p class="hint" data-disclaimer>
        ${data.submitsToAuthority
          ? /* Unreachable while the server tells the truth, and present
               so that a server which stopped would not be rendered as
               though it had not changed. */
            'This product reports that it submits to the Authority.'
          : 'UsalamaSMS does not submit anything to KCAA. It assembles the pack ' +
            'and opens the portal; you sign in, submit the CAP, and know that you did.'}
      </p>
    </div>

    <p class="footnote">${data.source}</p>
  `;
}

/* THE HEADING BAND, ON EVERY PATH THIS SCREEN CAN TAKE.

   The smoke check that caught its absence asserts `#main h1` has text
   on every destination in the architecture, and it was right to fail:
   this screen shipped with an `h2` at the top and no `h1` at all. A
   page with no level-one heading gives a screen-reader user nothing to
   land on, and the three paths below — signed out, no action chosen,
   and the composed pack — are three separate chances to forget it.
   Rendering it from ONE function is what stops two of them drifting. */
function Header() {
  return html`<header class="page-head">
    <span class="eyebrow">Toolkit</span>
    <h1>KCAA corrective action plan</h1>
    <p class="lede">${LEDE}</p>
  </header>`;
}

function Empty(message) {
  return html`<div class="card" data-empty>
    <h2 class="section-title">Nothing to compose</h2>
    <p>${message}</p>
    <p class="mat-actions">
      <a class="btn btn-secondary btn-sm" href="/picture">Go to the risk picture</a>
    </p>
  </div>`;
}

/* The one sentence that is true on every path, including the ones that
   compose nothing. Held here so the disclaimer cannot be present on the
   pack and missing from the screen somebody reaches first. */
const LEDE =
  'A corrective action from your own record, composed into the plan the ' +
  'Authority’s ICAAS portal asks for. UsalamaSMS does not submit it — you ' +
  'sign in at the portal and raise the CAP yourself.';

export async function render(outlet) {
  const id = actionId();

  if (!isSignedIn()) {
    outlet.innerHTML = html`
      ${ToolNav('/toolkits/icaas')}
      <section class="panel wrap">
        ${Header()}
        ${Empty(
          'Sign in to compose a corrective action plan from a record your ' +
            'organisation already holds.'
        )}
      </section>
    `.toString();
    return;
  }

  if (!id) {
    outlet.innerHTML = html`
      ${ToolNav('/toolkits/icaas')}
      <section class="panel wrap">
        ${Header()}
        ${Empty(
          'A pack is composed from one corrective action. Open the risk picture ' +
            'and choose the action that answers the Authority’s request.'
        )}
      </section>
    `.toString();
    return;
  }

  let data = null;
  let problem = '';
  try {
    const res = await authFetch(`/api/v1/icaas/cap/${encodeURIComponent(id)}`);
    if (res.status === 402) {
      /* A bill, not a permission — core.ts draws that line deliberately
         and repeating it as "forbidden" here would tell a safety
         manager they are not allowed to do their job. */
      const answer = await res.json().catch(() => ({}));
      problem = answer.message ?? 'This is included once the subscription is active.';
    } else if (res.status === 404) {
      problem = 'That corrective action is not in your organisation’s record.';
    } else if (!res.ok) {
      problem = 'The safety office could not compose this pack.';
    } else {
      data = await res.json();
    }
  } catch {
    problem = 'The safety office could not be reached. Nothing was composed.';
  }

  if (!data) {
    outlet.innerHTML = html`${ToolNav('/toolkits/icaas')}
      <section class="panel wrap">${Header()}${Empty(problem)}</section>`.toString();
    return;
  }

  outlet.innerHTML = html`
    ${ToolNav('/toolkits/icaas')}
    <section class="panel wrap">
      ${Header()}
      <div class="print-id-slot"></div>
      ${Pack(data)}
    </section>
  `.toString();

  /* The reference goes in the title so a printed pack is filable
     without reading it — a stack of CAPs that all say "corrective
     action plan" is a stack somebody has to sort by hand. */
  void attachPrintId(
    outlet,
    `Corrective action plan — ${data.pack.reference}`
  );
  outlet.querySelector('#cap-print')?.addEventListener('click', () => window.print());
}
