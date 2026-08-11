/* ============================================================
   The report form.

   THE ONE METRIC THIS SCREEN IS JUDGED BY: can a frontline person file
   in about thirty seconds, on a mid-range Android, with gloves on, in
   sunlight, with no signal?

   The research is unambiguous that report VOLUME is what kills an SMS,
   not report processing. Every incumbent optimises the safety manager's
   workflow; the documented failure spiral starts with frontline staff
   not filing, and ends with "the failed SMS becomes a self-fulfilling
   prophecy". So this screen gets the design attention, and the triage
   queue inherits whatever is left.

   What that buys, concretely:

     · TWO required fields. Title and narrative. Everything else is
       optional or inferred. A form with fourteen mandatory fields is a
       form that gets a hazard reported to a supervisor verbally
       instead, where it stops.
     · NO ACCOUNT SELECTION, no project picker, no category tree. Type
       defaults to HAZARD, which is what most unprompted reports are.
     · THE ANONYMOUS TOGGLE IS ON THE FIRST SCREEN, not in a submenu.
       Someone who needs it needs to see it before they start typing,
       or they will not start typing.
     · SAVES AS YOU TYPE. A report lost to a locked screen or a battery
       death is a report nobody files twice.
     · SUBMITS OFFLINE, always. There is no "try again later" state,
       because the outbox makes it unnecessary.
   ============================================================ */

import { html, raw } from '../../shared/html.js';
import { submitReportOffline, db } from '../../shared/offline.ts';
import {
  MOR_OBLIGATIONS,
  reportingDeadline,
  isProvisional
} from '../../../../../packages/shared/src/regulations.ts';

const DRAFT_KEY = 'usalamasms.reportDraft';

const TYPES = [
  ['HAZARD', 'Hazard', 'Something that could cause harm'],
  ['NEAR_MISS', 'Near miss', 'It nearly happened'],
  ['MOR', 'Occurrence', 'It happened — reportable to the regulator'],
  ['VCR', 'Confidential', 'Voluntary and confidential'],
  ['FATIGUE', 'Fatigue', 'Duty, rest or alertness'],
  ['SUGGESTION', 'Suggestion', 'A way to make this safer']
];

const HRC = [
  ['RE', 'Runway excursion'],
  ['RI', 'Runway incursion'],
  ['LOC_I', 'Loss of control'],
  ['CFIT', 'Terrain'],
  ['MAC', 'Mid-air conflict'],
  ['BWI', 'Bird / wildlife']
];

export function render(outlet) {
  const draft = loadDraft();

  outlet.innerHTML = html`
    <form class="report" id="report-form" novalidate>
      <h1>File a report</h1>

      <fieldset class="report__types">
        <legend>What kind of report is this?</legend>
        <div class="chip-row">
          ${TYPES.map(
            ([value, label, hint]) => html`
              <label class="chip" title="${hint}">
                <input
                  type="radio"
                  name="type"
                  value="${value}"
                  ${value === (draft.type ?? 'HAZARD') ? raw('checked') : ''}
                />
                <span>${label}</span>
              </label>
            `
          )}
        </div>
      </fieldset>

      <label class="field">
        <span class="field__label">In one line, what happened?</span>
        <input
          name="title"
          maxlength="200"
          required
          autocomplete="off"
          value="${draft.title ?? ''}"
          placeholder="Bird activity on short final, runway 06"
        />
      </label>

      <label class="field">
        <span class="field__label">Tell us more</span>
        <textarea
          name="narrative"
          rows="6"
          maxlength="20000"
          required
          placeholder="What you saw, when, and anything that made it more or less likely."
        >${draft.narrative ?? ''}</textarea>
        <span class="field__hint" id="narrative-count"></span>
      </label>

      <!-- Everything below the fold is optional and is marked as such,
           because an unmarked optional field reads as required and adds
           the hesitation this form exists to remove. -->
      <details class="report__more" ${draft.detailsOpen ? raw('open') : ''}>
        <summary>Add detail (optional)</summary>

        <label class="field">
          <span class="field__label">When did it happen?</span>
          <input type="datetime-local" name="occurredAt" value="${draft.occurredAt ?? ''}" />
          <span class="field__hint" id="deadline-hint"></span>
        </label>

        <label class="field">
          <span class="field__label">Where?</span>
          <input name="location" maxlength="200" value="${draft.location ?? ''}" placeholder="HKJK, stand 12" />
        </label>

        <label class="field">
          <span class="field__label">Aircraft type</span>
          <input name="aircraftType" maxlength="50" value="${draft.aircraftType ?? ''}" placeholder="DHC-8-400" />
        </label>

        <fieldset>
          <legend>Does this relate to any of these?</legend>
          <div class="chip-row">
            ${HRC.map(
              ([value, label]) => html`
                <label class="chip">
                  <input
                    type="checkbox"
                    name="hrcTags"
                    value="${value}"
                    ${(draft.hrcTags ?? []).includes(value) ? raw('checked') : ''}
                  />
                  <span>${label}</span>
                </label>
              `
            )}
          </div>
        </fieldset>
      </details>

      <!-- The anonymity control is the most consequential thing on this
           page and it is not hidden in the optional section. The label
           states the limit as well as the promise: over-promising here
           is how a reporter is identified by a colleague reading a
           bulletin, and the corollary belongs where the promise is made
           (charter rule 7), not two clicks away in a legal page. -->
      <label class="report__anon">
        <input type="checkbox" name="isAnonymous" ${draft.isAnonymous ? raw('checked') : ''} />
        <span>
          <strong>File this anonymously</strong>
          <small>
            Your name is not stored with the report and the safety office
            cannot see who filed it. Anything you write that only you
            could know may still identify you — a person reviews every
            report before it is shared outside the safety office.
          </small>
        </span>
      </label>

      <div class="report__actions">
        <button type="submit" class="btn btn--primary">Send report</button>
        <p class="report__status" id="report-status" role="status"></p>
      </div>
    </form>
  `.toString();

  wire(outlet);
}

function wire(outlet) {
  const form = outlet.querySelector('#report-form');
  const status = outlet.querySelector('#report-status');
  const count = outlet.querySelector('#narrative-count');
  const deadlineHint = outlet.querySelector('#deadline-hint');

  const narrative = form.elements.narrative;
  const occurredAt = form.elements.occurredAt;

  function renderCount() {
    const n = narrative.value.trim().length;
    // The floor is a schema rule (min 10). Saying so before submission
    // beats a rejection after it.
    count.textContent = n === 0 ? '' : n < 10 ? `${10 - n} more characters needed` : `${n} characters`;
  }

  // A deadline preview, computed live from the jurisdiction registry —
  // never stored, per charter rule 6. It exists because a reporter who
  // can see the clock is a reporter who files today rather than
  // tomorrow, and because a provisional row must never look like a
  // citation.
  function renderDeadline() {
    const type = form.elements.type.value;
    if (type !== 'MOR' || !occurredAt.value) {
      deadlineHint.textContent = '';
      return;
    }
    const occurred = new Date(occurredAt.value);
    if (Number.isNaN(occurred.getTime())) return;
    const now = new Date();
    const awareAt = now > occurred ? now : occurred;
    const jurisdiction = 'KE';
    const { due, obligation } = reportingDeadline(jurisdiction, { occurredAt: occurred, awareAt });
    const hours = obligation.hours;
    deadlineHint.textContent = isProvisional(jurisdiction)
      ? `Around ${hours} hours to report — this jurisdiction's rule is not yet verified.`
      : `${obligation.authority} expects this within ${hours} hours — by ${due.toUTCString()}.`;
  }

  narrative.addEventListener('input', () => {
    renderCount();
    saveDraft(form);
  });

  form.addEventListener('input', () => {
    renderDeadline();
    saveDraft(form);
  });

  // Ticking the box mid-report must remove what was already written to
  // disk, not merely stop adding to it.
  form.elements.isAnonymous.addEventListener('change', (event) => {
    if (event.target.checked) clearDraft();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    status.dataset.state = '';

    try {
      const input = collect(form);
      await submitReportOffline(input);
      clearDraft();
      status.dataset.state = 'ok';
      // Deliberately not "sent". It is queued, and on a strip with no
      // signal it will stay queued for hours. Telling someone their
      // report was sent when it is sitting in IndexedDB is the lie that
      // makes them stop trusting the sync strip.
      status.textContent = navigator.onLine
        ? 'Report saved and sending now.'
        : 'Report saved on this device. It will send itself when there is signal.';
      form.reset();
      renderCount();
      renderDeadline();
      // The shell owns the sync strip; the form does not import it.
      // A screen that reaches up into its container is a screen that
      // cannot be rendered anywhere else.
      window.dispatchEvent(new CustomEvent('usalamasms:report-filed'));
    } catch (err) {
      status.dataset.state = 'error';
      status.textContent = describeError(err);
    } finally {
      submit.disabled = false;
    }
  });

  renderCount();
  renderDeadline();
}

/** Build a CreateReportInput from the form. */
function collect(form) {
  const data = new FormData(form);
  const occurred = data.get('occurredAt');

  return {
    clientId: crypto.randomUUID(),
    type: data.get('type') ?? 'HAZARD',
    title: String(data.get('title') ?? '').trim(),
    narrative: String(data.get('narrative') ?? '').trim(),
    ...(occurred ? { occurredAt: new Date(String(occurred)) } : {}),
    // awareAt is NOT set from occurredAt. The reporter is aware now;
    // that is the only thing this device can honestly assert, and
    // conflating the two is the bug the regulatory engine exists to
    // prevent.
    awareAt: new Date(),
    jurisdiction: 'KE',
    location: String(data.get('location') ?? '').trim() || undefined,
    aircraftType: String(data.get('aircraftType') ?? '').trim() || undefined,
    hrcTags: data.getAll('hrcTags'),
    isAnonymous: data.get('isAnonymous') === 'on'
  };
}

/**
 * Turn a Zod error into something a ramp agent can act on.
 *
 * The default message is a path and a code. Someone standing on a ramp
 * needs a sentence.
 */
function describeError(err) {
  const issues = err?.issues;
  if (!Array.isArray(issues) || issues.length === 0) {
    return 'Could not save the report. Nothing has been lost — try sending again.';
  }
  const first = issues[0];
  const field = first.path?.[0];
  const FRIENDLY = {
    title: 'The one-line summary needs at least 3 characters.',
    narrative: 'Please write at least 10 characters describing what happened.',
    occurredAt: 'An occurrence report needs the time it happened, so the reporting deadline can be worked out.',
    awareAt: 'The time you became aware cannot be before the event itself.'
  };
  return FRIENDLY[field] ?? first.message ?? 'Please check the form and try again.';
}

/* ---------------------------- Drafting ----------------------------
   Charter rule 8 says a refused write is reported to the user. A draft
   is the other half: a write that never happened because the phone
   locked. Saved to localStorage on every keystroke — cheap, synchronous,
   and survives the tab being killed by Android's memory manager, which
   is the actual failure mode on the target device. */

function saveDraft(form) {
  try {
    const data = new FormData(form);

    // ==========================================================
    // AN ANONYMOUS REPORT IS NEVER DRAFTED TO DISK.
    //
    // Drafting is a kindness on a handset that locks or dies mid-report.
    // For an anonymous report it is a confidentiality hole: the draft
    // sits in localStorage, in clear, under this origin, on a device
    // that in practice is a shared crew-room tablet or a phone someone
    // borrows. A report abandoned halfway — which is exactly what
    // happens when the person changes their mind about filing — stays
    // there indefinitely, readable by the next user with no
    // authentication at all.
    //
    // The server goes to real lengths to make anonymity irreversible.
    // Leaving the narrative on the device would make all of that
    // irrelevant, and it would fail in the one case the reporter was
    // most afraid of.
    //
    // The cost is that an anonymous reporter who loses their phone
    // mid-report retypes it. That is the right trade, and the form
    // says so where they choose.
    // ==========================================================
    if (data.get('isAnonymous') === 'on') {
      clearDraft();
      return;
    }
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        type: data.get('type'),
        title: data.get('title'),
        narrative: data.get('narrative'),
        occurredAt: data.get('occurredAt'),
        location: data.get('location'),
        aircraftType: data.get('aircraftType'),
        hrcTags: data.getAll('hrcTags'),
        isAnonymous: data.get('isAnonymous') === 'on',
        detailsOpen: form.querySelector('.report__more')?.open ?? false
      })
    );
  } catch {
    // Quota or private mode. Not worth interrupting someone mid-report;
    // the submit path reports its own failures, and that is the write
    // that matters.
  }
}

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to do */
  }
}

