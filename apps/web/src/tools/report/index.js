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
import { Select, wireSelects } from '../../components/Select.js';
import {
  AERODROMES, AIRCRAFT_TYPES, REPORT_TYPES, HRC_CATEGORIES,
  FLIGHT_PHASES, JURISDICTION_OPTIONS, toOptions, OTHER
} from '../../../../../packages/shared/src/taxonomy.ts';
import { submitReportOffline } from '../../shared/offline.ts';
import {
  MOR_OBLIGATIONS,
  reportingDeadline,
  isProvisional
} from '../../../../../packages/shared/src/regulations.ts';

const DRAFT_KEY = 'usalamasms.reportDraft';

export function render(outlet) {
  const draft = loadDraft();

  outlet.innerHTML = html`
    <form class="report" id="report-form" novalidate>
      <h1>File a report</h1>

      <!-- REQUIRED AND UNANSWERED, which costs one tap on the fastest
           path and is worth it.

           This defaulted to HAZARD. That is the right guess for most
           unprompted reports, and the guess is silent: someone filing an
           actual occurrence who does not look at this control files it
           as a hazard, and an MOR classified as a hazard never gets a
           regulatory deadline computed for it. The operator then misses
           a 24-hour KCAA obligation without a single screen ever
           suggesting one existed.

           A missed deadline is the failure this whole product is
           organised against, so the classification is a conscious
           choice. Every other dropdown on this form stays optional. -->
      ${Select({
        name: 'type',
        label: 'What kind of report is this?',
        options: toOptions(REPORT_TYPES),
        value: draft.type ?? '',
        placeholder: 'Choose a report type',
        required: true,
        hint: 'An occurrence carries a reporting deadline; the others do not.'
      })}

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

        ${Select({
          name: 'location',
          label: 'Where did it happen?',
          options: toOptions(AERODROMES),
          value: draft.location ?? '',
          placeholder: 'Choose an aerodrome',
          otherValue: OTHER,
          otherLabel: 'Somewhere else…',
          otherText: draft.locationOther ?? '',
          otherPlaceholder: 'Aerodrome, strip or location',
          hint: 'Picking from the list is what lets the safety office count events by place.'
        })}

        ${Select({
          name: 'aircraftType',
          label: 'Aircraft type',
          options: toOptions(AIRCRAFT_TYPES),
          value: draft.aircraftType ?? '',
          placeholder: 'Choose a type (optional)',
          otherValue: OTHER,
          otherLabel: 'Another type…',
          otherText: draft.aircraftTypeOther ?? '',
          otherPlaceholder: 'Type designator'
        })}

        ${Select({
          name: 'phase',
          label: 'Phase of flight or operation',
          options: toOptions(FLIGHT_PHASES),
          value: draft.phase ?? '',
          placeholder: 'Choose a phase (optional)',
          hint: 'Runway excursion tells you what happened; landing roll tells you where to look.'
        })}

        ${Select({
          name: 'jurisdiction',
          label: 'Which authority does this operation answer to?',
          options: toOptions(JURISDICTION_OPTIONS),
          value: draft.jurisdiction ?? 'KE',
          placeholder: 'Choose an authority'
        })}

        <fieldset>
          <legend>Does this relate to any of these?</legend>
          <!-- The one control that is NOT a dropdown, and the reason is
               that this field is multi-select. A native <select multiple>
               on a touch device requires a long-press or a modifier key
               to pick a second item — most people never discover it, and
               the ones who do lose their first choice trying. Checkboxes
               styled as chips are the honest control for "choose any". -->
          <div class="chip-row">
            ${HRC_CATEGORIES.map(
              (c) => html`
                <label class="chip">
                  <input
                    type="checkbox"
                    name="hrcTags"
                    value="${c.code}"
                    ${(draft.hrcTags ?? []).includes(c.code) ? raw('checked') : ''}
                  />
                  <span>${c.label}</span>
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
  // One delegated listener for every dropdown on the screen, present or
  // future — see wireSelects().
  wireSelects(form);
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
    jurisdiction: String(data.get('jurisdiction') || 'KE'),
    // A dropdown value, or the free text behind "not listed". Resolved
    // here so the rest of the system only ever sees one shape — a code
    // from the taxonomy, or a string somebody typed, never a sentinel.
    location: resolve(data, 'location'),
    aircraftType: resolve(data, 'aircraftType'),
    phase: String(data.get('phase') ?? '') || undefined,
    hrcTags: data.getAll('hrcTags'),
    isAnonymous: data.get('isAnonymous') === 'on'
  };
}

/**
 * Read a dropdown, following the escape hatch when it was used.
 *
 * The sentinel must never reach the database: `__OTHER__` in a location
 * column is a value that looks like a place and groups with nothing.
 */
function resolve(data, name) {
  const value = String(data.get(name) ?? '');
  if (value === OTHER) {
    return String(data.get(`${name}Other`) ?? '').trim() || undefined;
  }
  return value || undefined;
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
    // Without this entry a ramp agent saw:
    //   "Invalid enum value. Expected 'MOR' | 'VCR' | 'HAZARD' | ..."
    // which is the raw Zod message, and is precisely what this function
    // exists to stop reaching a person standing on a ramp.
    type: 'Please choose what kind of report this is — the type decides whether a reporting deadline applies.',
    title: 'The one-line summary needs at least 3 characters.',
    narrative: 'Please write at least 10 characters describing what happened.',
    occurredAt: 'An occurrence report needs the time it happened, so the reporting deadline can be worked out.',
    awareAt: 'The time you became aware cannot be before the event itself.'
  };
  if (FRIENDLY[field]) return FRIENDLY[field];

  // Unmapped field. A Zod message is written for a developer reading a
  // stack trace — "Invalid enum value. Expected 'MOR' | 'VCR' | ..." is
  // not a sentence anyone on a ramp can act on. Name the field and stop;
  // the raw message goes to the console for whoever is debugging.
  console.warn('[usalamasms] unmapped validation issue', first);
  return field
    ? `Something is not right with the "${field}" field. Please check it and try again.`
    : 'Please check the form and try again.';
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
        locationOther: data.get('locationOther'),
        aircraftType: data.get('aircraftType'),
        aircraftTypeOther: data.get('aircraftTypeOther'),
        phase: data.get('phase'),
        jurisdiction: data.get('jurisdiction'),
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

