/* ============================================================
   THE NOTES ABOUT THE MARKUP, COLLECTED OUT OF THE TEMPLATE.

   An `<!-- -->` inside a tagged template literal is not a comment, it
   is STRING CONTENT: no minifier removes it, and a reporter at a
   remote strip downloads every word of it. Twelve notes on this screen
   came to 6.6 KB of somebody else's airtime spent explaining this
   file to a developer who was never going to read it here. A backtick
   in one of them also ends the literal and breaks the build at
   runtime, which is how tools/pricing/index.js shipped
   `scheme is not defined` three times.

   They read better collected anyway. In the order the markup reaches
   them:

   1. CHARTER RULE 8, ON THE SCREEN. Showing the handset's reports
      as though they were the operator's, when the safety office
      could not be reached, is the failure this whole product is
      built against. It says so instead.

   2. THE CLOCK, HANDED TO A CHANNEL THIS PRODUCT DOES NOT OWN.
      A reporting deadline is computed on this screen and reaches
      nobody who has not opened it. The real answer is SMS and it is
      blocked on credentials; this is the part that needs none — the
      product writes the sentence and the safety manager sends it
      from whatever they already have open, which here is WhatsApp.
      IT IS NOT ALERTING AND MUST NOT READ AS IT. The copy says
      "send" rather than "notify", because somebody who believes
      they are being alerted stops looking at the screen — and this
      only ever reaches a person who is already on it.
      COUNTS ONLY. The message carries how many and how soon. Never
      a title, never a name: a WhatsApp message is forwarded,
      backed up and read by people no permission matrix has heard
      of, and the title of a fatigue report is the sentence that
      identifies its author at a six-aircraft operator. The
      composer has no parameter that could carry one.

   3. COLLAPSED BY DEFAULT. Three stacked dropdowns are a full
      handset screen, and they were pushing every report below the
      fold — on the one screen whose job is to show reports. The
      summary carries the active count, so a filtered view can never
      be mistaken for an empty queue while the controls are shut.

   4. KIND on the left, STATE on the right, and nothing else on
      this line. Two badges plus a label wrapped onto three lines at
      390px, which is a card that has stopped being scannable.

   5. PROTECTED, from the identity's six. It is the badge that means
      confidentiality rather than delivery — which is what an
      anonymous report carries and what "sent" does not. It sits
      under the title because it describes the REPORT, where the
      badge above describes what has happened to it.

   6. THE ACTION THE STRIP HAS BEEN POINTING AT. It said "open
      Triage to review" and this screen had nothing to press.
      Copy sits beside Try again because some reports genuinely
      cannot send — a validation rejection will be rejected again,
      and a role that may not file this type still may not. The
      person standing there needs the words out of the device and
      into a phone call, and refusing them that is how an
      occurrence ends up unreported rather than merely unsent.

   7. WHAT HAPPENED TO IT, and what may happen next.
      Only on rows the server knows about: a report still in the
      outbox has no row to move, and offering to close it would be
      offering to lose it. The available moves come from the server
      rather than being worked out here, so buttons cannot disagree
      with the permission matrix — a second copy of that matrix in
      the browser is the copy that goes stale.

   8. RAISE AN ACTION FROM THE THING THAT PROMPTED IT.
      An action always has a source — that is a CHECK constraint in
      the migration, not a convention — and the natural place to
      raise one is the report it came out of. Raising it from a
      list of actions would ask somebody to pick a source from a
      dropdown of every report the operator has, which is how the
      wrong report gets attached.
      Only on rows the server knows about, like the disposition:
      an action against a report still in the outbox has nothing
      to hang off.

   9. WHAT THE STATE FILES IT UNDER.
      The report TYPE above says what kind of report arrived. This
      says what kind of OCCURRENCE it was, in ICAO's own categories
      — and those are what an authority files, not this product's
      six types. An operator whose reports carry no code hands its
      authority data somebody re-codes by hand.
      HERE AND NOT ON THE REPORT FORM. Coding to ADREP is a trained
      judgement made after reading the narrative; a reporter at a
      strip has not made it and must not be asked to, which is the
      same reason the form does not ask whether the event meets
      Annex 13's definition of an accident.
      The codes render as words, not only as codes: "RE" on its own
      is a badge only somebody who already knows the taxonomy can
      read, and this screen is read by people learning it.

   10. AN INLINE PANEL, NOT A PROMPT. Every other confirmation
      on this screen is a window.prompt, which is right for
      one line of free text and wrong for twenty grouped
      choices: a prompt cannot show a group, cannot show what
      is already selected, and cannot carry the caveat that
      has to travel with these codes. Details/summary rather
      than a modal — it keeps the choice next to the report it
      is about, and it works with a keyboard without any of
      the focus-trapping a modal would need.

   11. MORE THAN ONE IS THE TAXONOMY'S OWN RULE, said where
      somebody is choosing. CICTT codes a runway excursion
      that became a loss of control as BOTH, and a safety
      officer who assumes one code per occurrence records
      half of exactly the events worth learning from.

   12. RAISE A HAZARD FROM THE REPORT THAT REVEALED IT.
      The join this product did not have. Hazard.reportId has
      been in the schema since the first migration and nothing
      ever wrote it, so every register was a list of hazards
      somebody remembered to type — while the reports that
      should have produced them sat in this queue. Element 2.1
      asks for hazard identification FED by reporting, and
      /coverage has been saying so in 2.2's own words.
      IT CARRIES AN ID AND NOTHING ELSE. The register is
      printed and shown to an inspector; a narrative is
      protected and may be anonymous. So this link puts no
      content in the URL either — the register screen finds
      the report in the queue it already reads.
   ============================================================ */
/* ============================================================
   Triage queue.

   LOCAL FIRST, then the organisation on top of it. The device's own
   store is what renders, always and without waiting — a triage view
   that NEEDS the network is a triage view that is blank exactly when
   someone is standing in a hangar wondering what came in overnight.
   The safety office's queue is layered over that when it can be
   reached, and its absence is stated rather than hidden.

   (This paragraph read "reads the LOCAL store, not the server" until
   the organisation's queue landed. It is corrected here rather than
   left, because a file's opening comment is the first thing the next
   reader believes.)

   What it shows, and why each column earns its place:

     · SYNC STATE first. Charter rule 8: a report that has not reached
       anyone has not been made. The person reading this queue is the
       one who can act on that, and burying it behind a filter is how
       an unsent report sits for a week.
     · THE REGULATORY CLOCK, computed live, never stored (rule 6).
       Overdue sorts to the top regardless of age.
     · THE TYPE, because an MOR and a suggestion do not compete for the
       same attention.

   Anonymous reports render WITHOUT any reporter affordance at all — no
   greyed-out name, no "hidden" placeholder. A UI that shows a disabled
   field where a name would be is a UI that tells everyone a name exists
   somewhere, which is most of the way to asking for it.

   AND NOW THE ORGANISATION'S QUEUE TOO, merged in rather than swapped
   for. The device store stays the base and the server is layered on
   top, keyed on clientId — the same union-by-id the toolkits were
   corrected to after assigning the org's list straight over the
   device's would have destroyed unsent work for every existing user at
   once. Offline, this screen degrades to exactly what it was: the
   handset's own reports, with the sync strip that says so.

   THE DISPOSITION LIVES ON THE SERVER, so its buttons appear only on
   rows the server knows about. A report still in the outbox has no row
   to move, and offering to close it would be offering to lose it.
   ============================================================ */

import { html, raw } from '../../shared/html.js';
/* The occurrence taxonomy, imported HERE and nowhere in the entry
   chunk. Twenty categories with their names is a kilobyte a reporter at
   a strip would download to file a report they will never classify —
   and classification is the safety office's job, which is this screen.
   Imported by path rather than through the shared index for the same
   reason the disposition module is. */
import {
  CATEGORY_GROUPS,
  categoriesIn,
  categoryFor,
  CICTT_CAVEAT
} from '../../../../../packages/shared/src/cictt.ts';
/* The five attributes a State files beside the category, imported here
   for the same reason the categories are: a reporter who never opens
   this screen should not download the vocabulary for a judgement only
   the safety office makes. */
import { ADREP_FIELDS, adrepLabel, ADREP_CAVEAT } from '../../../../../packages/shared/src/adrep.ts';
import { syncBadge, StatusBadge } from '../../components/Status.js';
import { HandoffButton, wireHandoff } from '../../components/Handoff.js';
import { deadlinesHandoff } from '../../../../../packages/shared/src/handoff.ts';
import { Select, wireSelects } from '../../components/Select.js';
import {
  REPORT_TYPES, SYNC_STATES, AERODROMES, FLIGHT_PHASES,
  toOptions, labelFor
} from '../../../../../packages/shared/src/taxonomy.ts';
import { db, retryReport, retractReport } from '../../shared/offline.ts';
import { isSignedIn, authFetch } from '../../shared/session.js';
import {
  reportingDeadline,
  deadlineStatus,
  MOR_OBLIGATIONS
} from '../../../../../packages/shared/src/regulations.ts';

/* Labels come from the same taxonomy the report form writes with, so a
   type added there cannot render as a raw enum here. Two hand-kept label
   maps is how "NEAR_MISS" ends up on a safety manager's screen. */
const STATE_LABEL = Object.fromEntries(SYNC_STATES.map((s) => [s.code, s.label]));
const TYPE_LABEL = Object.fromEntries(
  REPORT_TYPES.map((t) => [t.code, t.label.split(' — ')[0]])
);

/* A code's published name, or the code itself when this build does not
   know it. NEVER a blank: the list here is incomplete by admission, and
   an operator who has coded an occurrence to a legitimate category this
   product has not got yet must still see their own classification on
   the screen rather than an empty chip. */
function labelForCode(code) {
  return categoryFor(code)?.label ?? 'not in this build\u2019s list';
}

/* The disposition states in an operator's words. Enumerated rather than
   prettified from the enum: "ACTIONS_OPEN" title-cased is "Actions
   Open", which is not what a safety manager would say and not what the
   state means. */
const DISPOSITION_LABEL = {
  SUBMITTED: 'Awaiting triage',
  TRIAGED: 'Triaged',
  UNDER_INVESTIGATION: 'Under investigation',
  ACTIONS_OPEN: 'Actions outstanding',
  CLOSED: 'Closed'
};

/* The filter state lives at module scope so it survives a re-render
   after a filter changes. Kept deliberately small — three dimensions is
   what a queue of this size needs, and a filter bar with nine controls
   is one nobody uses. */
const filters = { type: '', state: '', location: '' };

/* ============================================================
   THE ORGANISATION'S QUEUE, fetched alongside the device's.

   UNION, NOT ASSIGNMENT, and that distinction has already cost this
   product once: both server-backed toolkits assigned the org's list
   straight over the device's and persisted the result, which would have
   destroyed every existing user's unsent work the first time they
   opened the screen. The device store is the base here and is never
   written by this function.

   A FAILURE HERE IS NOT AN EMPTY ORGANISATION. It returns null, the
   screen says the safety office could not be reached, and the device's
   own reports still render. Silently showing the handset's queue as
   though it were the operator's would be the worse half of charter
   rule 8.
   ============================================================ */
async function fetchOrgQueue() {
  if (!isSignedIn() || !navigator.onLine) return null;
  try {
    const res = await authFetch('/api/v1/reports/queue');
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body.reports) ? body : null;
  } catch {
    // Offline, DNS, a proxy, a 500 — all the same to this screen, and
    // all of them mean "we do not know", not "there is nothing".
    return null;
  }
}

/* Merge, keyed on clientId. Device fields win for everything the device
   authored; the server contributes only what the device cannot know —
   its own id for the row, the disposition state, and which moves this
   person may make. A server row with no local counterpart is appended,
   because a report filed on somebody else's handset is still this
   operator's report and the old screen simply could not see it. */
/* The five, lifted off a server row into one object so the row shape
   does not sprout five siblings that have to be threaded individually
   through merge, render and submit. Reads from ADREP_FIELDS so a sixth
   attribute is one entry there rather than an edit here. */
function adrepOf(server) {
  const out = {};
  for (const f of ADREP_FIELDS) out[f.key] = server?.[f.key] ?? null;
  return out;
}

function merge(local, remote) {
  if (!remote) return local.map((r) => ({ ...r, origin: 'device' }));
  const byClientId = new Map(remote.reports.map((r) => [r.clientId, r]));
  const merged = local.map((r) => {
    const server = byClientId.get(r.clientId);
    byClientId.delete(r.clientId);
    return server
      ? {
          ...r,
          origin: 'both',
          serverId: server.id,
          state: server.state,
          available: server.available,
          cicttCodes: server.cicttCodes,
          /* The server's stored coding, not this browser's last
             submission — see the panel below, which renders what EXISTS
             so nobody re-determines what somebody already determined. */
          adrep: adrepOf(server)
        }
      : { ...r, origin: 'device' };
  });
  for (const server of byClientId.values()) {
    merged.push({
      ...server,
      adrep: adrepOf(server),
      // Reports that arrived from elsewhere are, by definition, sent.
      syncState: 'synced',
      createdAtLocal: server.createdAt,
      serverId: server.id,
      origin: 'server'
    });
  }
  return merged;
}

export async function render(outlet) {
  let reports;
  try {
    reports = await db.reports.toArray();
  } catch (err) {
    // A failed read of the local store is not an empty queue, and
    // showing the empty state here would tell a safety manager that
    // nothing was reported.
    outlet.innerHTML = html`
      <section class="panel">
        <h1>Triage</h1>
        <p class="notice notice--error">
          Could not read reports stored on this device. This is not the
          same as having no reports — do not treat the queue as empty.
        </p>
      </section>
    `.toString();
    console.error('[usalamasms] triage read failed', err);
    return;
  }

  const remote = await fetchOrgQueue();
  const now = new Date();
  const all = merge(reports, remote).map((r) => decorate(r, now)).sort(compare);
  const rows = all.filter(matchesFilters);

  /* Aerodrome options are drawn from what is actually in the queue
     rather than from the whole taxonomy: a filter listing nineteen
     aerodromes when reports exist for two is a filter that mostly
     produces empty results. */
  const presentLocations = [...new Set(all.map((r) => r.location).filter(Boolean))].map((code) => ({
    value: code,
    label: labelFor(AERODROMES, code)
  }));

  /* Counted, not typed — charter rule 10 applied to a UI number. */
  const activeFilters = Object.values(filters).filter(Boolean).length;

  outlet.innerHTML = html`
    <section class="panel">
      <header class="page-head">
        <span class="eyebrow">${remote ? 'This operator' : 'This device'}</span>
        <h1>${remote ? 'The reporting queue' : 'Reports on this device'}</h1>
        <p class="lede">
          ${remote
            ? html`Everything this operator has filed, wherever it was filed
                from, plus anything still waiting to leave this handset. A
                report that has not reached the safety office has not been
                made, and the strip on each card is what says so.`
            : html`Everything filed on this handset, sent or not. A report that
                has not reached the safety office has not been made, and the
                strip above is what says so.`}
        </p>
      </header>

      ${!remote
        ? html`<p class="notice">
            ${isSignedIn()
              ? 'Showing this device only — the safety office could not be reached. Reports filed elsewhere are not in this list, and a report cannot be triaged or closed until there is a connection.'
              : 'Showing this device only. Sign in to see the whole operator’s queue and to triage, investigate or close a report.'}
          </p>`
        : ''}
      ${remote?.truncated
        ? html`<p class="notice">
            Showing the most recent reports only. Older ones exist and are
            not in this list.
          </p>`
        : ''}

      ${(() => {
        const clocked = rows.filter((r) => r.deadline?.status);
        const overdue = clocked.filter((r) => r.deadline.status === 'OVERDUE').length;
        const soon = clocked.filter(
          (r) => r.deadline.status === 'DUE_SOON' || r.deadline.status === 'WITHOUT_DELAY'
        ).length;
        if (!overdue && !soon) return '';
        return html`<div class="notice notice--handoff" data-state="${overdue ? 'overdue' : 'soon'}">
          <p>
            ${overdue
              ? html`<strong>${overdue} past the reporting deadline</strong>${soon
                  ? html`, ${soon} approaching`
                  : ''}.`
              : html`<strong>${soon} approaching the reporting deadline</strong>.`}
          </p>
          ${HandoffButton(
            deadlinesHandoff({ count: soon + overdue, overdue }),
            'Send this to somebody'
          )}
          <p class="handoff__said"></p>
        </div>`;
      })()}

      <details class="filters-shell" ${activeFilters > 0 ? raw('open') : ''}>
        <summary>
          <span>Filter</span>
          ${activeFilters > 0
            ? html`<span class="filters-shell__count">${activeFilters} active</span>`
            : ''}
        </summary>
        <div class="filters" role="group" aria-label="Filter the queue">
        ${Select({
          name: 'filter-type',
          label: 'Report type',
          options: toOptions(REPORT_TYPES).map((o) => ({ ...o, label: o.label.split(' — ')[0] })),
          value: filters.type,
          placeholder: 'All types'
        })}
        ${Select({
          name: 'filter-state',
          label: 'Sync state',
          options: toOptions(SYNC_STATES),
          value: filters.state,
          placeholder: 'All states'
        })}
        ${Select({
          name: 'filter-location',
          label: 'Aerodrome',
          options: presentLocations,
          value: filters.location,
          placeholder: 'Anywhere'
        })}
        </div>
      </details>

      ${all.length > 0 && rows.length === 0
        ? html`<p class="lede">
            No reports match these filters. ${all.length} on this device in total.
          </p>`
        : ''}

      ${rows.length === 0
        ? html`<p class="lede">
            Nothing on this device yet. Reports filed here appear
            immediately, before they have been sent.
          </p>`
        : html`
            <p class="lede">
              ${rows.length} report${rows.length === 1 ? '' : 's'} on this device.
              ${rows.filter((r) => r.syncState !== 'synced').length} not yet sent.
            </p>
            <ul class="queue">
              ${rows.map(row)}
            </ul>
          `}
    </section>
  `.toString();

  wireSelects(outlet);
  bindOnce(outlet);
}

/* ============================================================
   BOUND ONCE PER OUTLET, and that qualifier is the fix.

   These two listeners used to be attached inside render(), and render()
   calls itself from inside both of them. The router clears the outlet's
   CHILDREN between routes — replaceChildren() — but never replaces the
   outlet itself, so nothing ever removed a listener from it. Every
   render added another pair, and every handler triggered another
   render. Measured in Chromium, renders per one filter change:

     change 1 ->  1      change 4 ->  8
     change 2 ->  2      change 5 -> 16
     change 3 ->  4      change 6 -> 32

   Each of those is a full read of the report store and a complete
   rebuild of the list. Twelve filter changes is a little over two
   thousand of them and the tab stops responding — on the screen a
   safety officer works a queue on. One tap of "Try again" fired the
   retry N times as well.

   The delegation itself was right and the comment defending it was
   right; what was wrong was doing it again on every pass. A WeakSet
   keyed on the node remembers, survives navigating away and back, and
   holds nothing alive on its own.
   ============================================================ */
const bound = new WeakSet();

function bindOnce(outlet) {
  if (bound.has(outlet)) return;
  bound.add(outlet);

  wireHandoff(outlet);

  outlet.addEventListener('change', (event) => {
    const name = event.target?.name;
    if (!name?.startsWith('filter-')) return;
    filters[name.slice('filter-'.length)] = event.target.value;
    void render(outlet);
  });

  /* THE CLASSIFICATION, on its own verb.

     Delegated like everything else here, and submit rather than click:
     the panel is a real form, so Enter works and the checkboxes are
     read from the form rather than from the DOM by hand.

     IT DOES NOT MOVE THE REPORT. Coding is not a state change — a
     report closed last month and coded wrongly has to be correctable
     without reopening it and closing it again, which would leave two
     transitions in the history describing an investigation that never
     happened. That is why there is a PUT for this and not a flag on the
     disposition. */
  /* WHAT THE PANEL SAYS, INCLUDING THE ABSENCES.
     Every field is sent on every submission — the empty option maps to
     null, which the route treats as a deliberate un-coding. Sending
     only the checked ones would make "clear this back to not-coded"
     unreachable from a form where the clear IS a checked radio. */
  function adrepFrom(form) {
    const out = {};
    for (const f of ADREP_FIELDS) {
      const chosen = form.querySelector(`input[name="${f.key}"]:checked`);
      out[f.key] = chosen && chosen.value ? chosen.value : null;
    }
    return out;
  }

  /* ============================================================
     EVIDENCE, LAZILY AND ONLY WHEN OPENED.

     The list is fetched when somebody expands the disclosure rather
     than for every row on load. A queue of forty reports would
     otherwise issue forty requests to render a count almost all of
     which are zero.

     The uploader itself is a dynamic import for the reason every other
     heavy thing here is: it carries a canvas resizer, and a ramp agent
     who opens the queue to read a report should not download it.
     ============================================================ */
  outlet.addEventListener('toggle', async (event) => {
    const box = event.target;
    if (!(box instanceof HTMLElement) || !box.hasAttribute('data-evidence-for')) return;
    if (!box.open || box.dataset.loaded === 'yes') return;
    box.dataset.loaded = 'yes';
    const id = box.getAttribute('data-evidence-for');
    const slot = box.querySelector('[data-evidence-list]');
    try {
      const { mountEvidence } = await import('../../shared/evidence-panel.js');
      await mountEvidence(slot, id);
    } catch {
      slot.innerHTML =
        '<p class="notice notice--error">The evidence for this report could not be ' +
        'loaded. Nothing has been changed.</p>';
    }
  }, true);

  outlet.addEventListener('submit', async (event) => {
    const form = event.target?.closest?.('form[data-classify]');
    if (!form) return;
    event.preventDefault();

    const codes = [...form.querySelectorAll('input[name="code"]:checked')].map((i) => i.value);
    const submit = form.querySelector('button[type="submit"]');
    const label = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Saving…';
    try {
      const res = await authFetch(`/api/v1/reports/${form.dataset.classify}/codes`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cicttCodes: codes, ...adrepFrom(form) })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        window.alert(
          body.message ?? 'The safety office could not be reached. Nothing was changed.'
        );
        return;
      }
      /* THE SERVER'S OWN VERDICT ON WHAT IT DID NOT RECOGNISE, shown
         rather than swallowed. The code list this build carries is
         incomplete by admission, so a code it does not know is stored
         and reported — and a safety officer who is told nothing would
         reasonably assume the product understood a category it has
         never heard of. */
      const body = await res.json().catch(() => ({}));
      if (body.unrecognisedCodes?.length) {
        window.alert(
          `Saved. This build does not recognise ${body.unrecognisedCodes.join(', ')} — ` +
            'the classification is recorded exactly as you entered it, and the missing ' +
            'category is a gap in this software rather than an error in your report.'
        );
      }
    } catch {
      window.alert('The safety office could not be reached. Nothing was changed.');
    } finally {
      submit.disabled = false;
      submit.textContent = label;
      await render(outlet);
    }
  });

  /* One delegated listener for every row, present and future. The rows
     are re-rendered on every filter change, so per-row listeners would
     be re-attached each time and the old ones would leak. */
  outlet.addEventListener('click', async (event) => {
    const retry = event.target.closest?.('[data-retry]');
    if (retry) {
      retry.disabled = true;
      retry.textContent = 'Sending…';
      try {
        await retryReport(retry.dataset.retry);
      } finally {
        // Re-render regardless: the report either moved state or did
        // not, and both are things this screen must show rather than
        // leave a button spinning on.
        await render(outlet);
      }
      return;
    }

    /* ------------------------------------------------------------
       Move a report.

       THE NOTE IS ASKED FOR BEFORE THE REQUEST, not after a 400. The
       server refuses a closure with no note and that refusal is the
       control; asking here as well is the difference between a form
       that helps and a form that scolds. Both still run — the browser
       one can be skipped, the server one cannot.

       prompt() rather than a modal, deliberately and for now. It is
       the one dialog that is always keyboard-reachable, always
       announced, and cannot be rendered behind the sticky chrome — and
       a hand-built modal that traps focus badly on the screen a safety
       manager works a queue on is worse than a plain one.
       ------------------------------------------------------------ */
    /* ------------------------------------------------------------
       RECORDING THAT THE AUTHORITY WAS TOLD.

       The route for this has existed since the previous commit and
       nothing could reach it, which is a capability with no surface —
       the exact shape /coverage was caught claiming about the CAPA
       loop, and the reason there is a gate for it.

       THE REFERENCE IS ASKED FOR AND MAY BE REFUSED. An authority that
       answers the telephone does not always give a reference on the
       call, and a field that must be filled to record a notification
       would either stop the record being made or invite a made-up
       number into it. Empty means "no reference", not "not notified".

       THE SERVER OWNS THE REFUSALS. A future date, a date before the
       occurrence, a second notification over the first — all four are
       enforced in one transaction there, and this screen shows the
       sentence it gets back rather than pre-judging any of them. A
       second copy of those rules in the browser is the copy that goes
       stale.
       ------------------------------------------------------------ */
    /* ------------------------------------------------------------
       WITHDRAWING A REPORT.

       CONFIRMED, unlike the acknowledgement on /sms, and the difference
       is whether the act is reversible. Recording that a document was
       read is idempotent and true; withdrawing a report removes it from
       the safety office's queue, and while the row survives on the
       server as a tombstone there is no screen that brings it back. An
       irreversible act gets a dialog.

       THE REASON IS ASKED FOR AND MAY BE REFUSED. "Filed twice" and
       "wrong aircraft" are the honest answers and both are worth having;
       a required field would produce "duplicate" typed a hundred times.
       ------------------------------------------------------------ */
    const retractor = event.target.closest?.('[data-retract]');
    if (retractor) {
      if (!window.confirm(
        'Withdraw this report?\n\nIt stops appearing in the safety office’s queue and stops counting towards the reporting rate. The record itself is kept — who withdrew it and when are recorded, and an export for an inspector still shows it.'
      )) return;
      const reason = window.prompt(
        'Why is it being withdrawn? Optional — "filed twice" or "wrong aircraft" is enough, and it tells the next reader more than a blank does.'
      );
      if (reason === null) return;
      try {
        await retractReport(retractor.dataset.retract, reason);
      } catch {
        window.alert('That could not be recorded on this device. Nothing was withdrawn.');
      }
      await render(outlet);
      return;
    }

    const teller = event.target.closest?.('[data-notified]');
    if (teller) {
      const reference = window.prompt(
        'Record that the authority was told.\n\nIf they gave you a reference, put it here. Leave it empty if they did not — the notification is recorded either way.'
      );
      if (reference === null) return;
      const label = teller.textContent;
      teller.disabled = true;
      teller.textContent = 'Saving…';
      try {
        const res = await authFetch(`/api/v1/reports/${teller.dataset.notified}/notified`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(reference.trim() ? { reference: reference.trim() } : {})
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          window.alert(body.message ?? 'The safety office could not be reached. Nothing was recorded.');
        }
      } catch {
        window.alert('The safety office could not be reached. Nothing was recorded.');
      } finally {
        teller.disabled = false;
        teller.textContent = label;
        await render(outlet);
      }
      return;
    }

    const mover = event.target.closest?.('[data-move]');
    if (mover) {
      let note;
      if (mover.dataset.note === 'yes') {
        note = window.prompt(
          `${mover.textContent.trim()}\n\nWhat was done? This is recorded against your name and is what the next person to read this report will see.`
        );
        // Cancelled. Not an empty note — the person changed their mind,
        // and sending a refusal they would then have to read is noise.
        if (note === null) return;
        if (!note.trim()) {
          window.alert('A note is needed. A closure with no statement of what was done tells the next reader nothing.');
          return;
        }
      }
      const label = mover.textContent;
      mover.disabled = true;
      mover.textContent = 'Saving…';
      try {
        const res = await authFetch(`/api/v1/reports/${mover.dataset.move}/disposition`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            to: mover.dataset.to,
            fromState: mover.dataset.from,
            ...(note ? { note } : {})
          })
        });
        if (!res.ok) {
          /* The server's own sentence, shown as written. It says which
             permission is needed, or which moves are legal, or that
             somebody else has moved the report — all three of which are
             more useful than "something went wrong". */
          const body = await res.json().catch(() => ({}));
          window.alert(body.message ?? 'The safety office could not be reached. Nothing was changed.');
        }
      } catch {
        window.alert('The safety office could not be reached. Nothing was changed.');
      } finally {
        mover.disabled = false;
        mover.textContent = label;
        // Re-render either way: the report moved or it did not, and both
        // are things this screen must show rather than leave a button
        // guessing about.
        await render(outlet);
      }
      return;
    }

    /* ------------------------------------------------------------
       Record a corrective action against this report.

       THREE PROMPTS RATHER THAN A FORM, deliberately and for now. The
       queue is worked on a handset, the three fields are short, and a
       hand-built inline form on a card that re-renders after every
       save is more ways to lose what somebody typed than it is worth.
       The server validates all three regardless.
       ------------------------------------------------------------ */
    const raise = event.target.closest?.('[data-raise-action]');
    if (raise) {
      const what = window.prompt(
        'What will be done about this report? One sentence — it becomes the action somebody is accountable for.'
      );
      if (what === null) return;
      if (!what.trim()) {
        window.alert('An action needs to say what will be done.');
        return;
      }
      const owner = window.prompt(
        'Which post owns it? SAFETY_MANAGER, SAFETY_OFFICER, ACCOUNTABLE_EXECUTIVE — or your own title.'
      );
      if (owner === null) return;
      if (!owner.trim()) {
        window.alert('An action with no owner is an action nobody does.');
        return;
      }
      const due = window.prompt(
        'By when? YYYY-MM-DD. Leave blank if there is genuinely no date — it is recorded as undated rather than guessed at.'
      );
      if (due === null) return;

      raise.disabled = true;
      const label = raise.textContent;
      raise.textContent = 'Saving…';
      try {
        const res = await authFetch('/api/v1/actions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: what,
            ownerPost: owner,
            reportId: raise.dataset.raiseAction,
            ...(due.trim() ? { dueOn: due.trim() } : {})
          })
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          window.alert(
            body.detail?.fieldErrors?.dueOn
              ? 'That date was not understood. Use YYYY-MM-DD, or leave it blank.'
              : (body.message ?? 'That was not accepted. Nothing was recorded.')
          );
        } else {
          window.alert('Recorded. It is now on the risk picture until it is done and verified.');
        }
      } catch {
        window.alert('The safety office could not be reached. Nothing was recorded.');
      } finally {
        raise.disabled = false;
        raise.textContent = label;
      }
      return;
    }

    const copy = event.target.closest?.('[data-copy]');
    if (copy) {
      const report = await db.reports.where('clientId').equals(copy.dataset.copy).first();
      if (!report) return;
      // Title, narrative and the recommendation — everything the person
      // typed, in the order they typed it, so it can be read down a
      // phone line.
      const text = [report.title, '', report.narrative, report.reporterRecommendation]
        .filter(Boolean)
        .join('\n');
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = 'Copied';
      } catch {
        // Clipboard access is refused in plenty of ordinary situations —
        // an insecure context, a permissions policy, an older WebView.
        // Selecting the text is the fallback that always works, and
        // saying nothing would look like the button is broken.
        copy.textContent = 'Cannot copy — select the text above';
      }
    }
  });
}

function matchesFilters(r) {
  if (filters.type && r.type !== filters.type) return false;
  if (filters.state && r.syncState !== filters.state) return false;
  if (filters.location && r.location !== filters.location) return false;
  return true;
}

function decorate(report, now) {
  let deadline = null;
  if (report.type === 'MOR' && report.awareAt) {
    try {
      const { due, obligation } = reportingDeadline(report.jurisdiction ?? 'KE', {
        occurredAt: new Date(report.occurredAt ?? report.awareAt),
        awareAt: new Date(report.awareAt)
      });
      /* THE PARAMETER THAT MEANS "THE DUTY WAS DISCHARGED", finally
         supplied. deadlineStatus has taken a submittedAt since it was
         written and this screen has never had one to give it, because
         no column held the fact — so every notified occurrence stayed
         OVERDUE and the most carefully tested function in the
         repository was answering a question nobody could complete. */
      const told = report.reportedToAuthorityAt ? new Date(report.reportedToAuthorityAt) : null;
      deadline = { due, status: deadlineStatus(due, now, { obligation, submittedAt: told }), obligation, told };
    } catch {
      // A malformed pair must not remove the report from the queue.
      // Losing a row is worse than losing its clock.
      deadline = null;
    }
  }
  return { ...report, deadline };
}

/** Overdue first, then unsent, then newest. */
function compare(a, b) {
  /* CLOSED SINKS, whatever else is true of it. A closed report with an
     overdue regulatory clock is a report whose deadline was missed and
     dealt with; leaving it at the top of the queue pushes live work
     below the fold, which is how the ranking stops being read at all.
     Everything above it keeps the order it had: the regulatory clock
     first, then unsent, then untriaged, then newest. */
  const rank = (r) =>
    r.state === 'CLOSED' ? 5
      : r.deadline?.status === 'OVERDUE' ? 0
        : r.deadline?.status === 'DUE_SOON' || r.deadline?.status === 'WITHOUT_DELAY' ? 1
          : r.syncState !== 'synced' ? 2
            : r.state === 'SUBMITTED' ? 3
              : 4;
  const d = rank(a) - rank(b);
  if (d !== 0) return d;
  return String(b.createdAtLocal).localeCompare(String(a.createdAtLocal));
}

function row(r) {
  return html`
    <li class="queue__item" data-sync="${r.syncState}">
      <div class="queue__head">
        <span class="queue__type">${TYPE_LABEL[r.type] ?? r.type}</span>
        ${syncBadge(r.syncState)}
      </div>

      <p class="queue__title">${r.title}</p>

      ${r.isAnonymous ? html`<p class="queue__meta">${StatusBadge('PROTECTED', { label: 'Anonymous' })}</p>` : ''}

      ${r.location || r.phase
        ? html`<p class="queue__where">
            ${r.location ? labelFor(AERODROMES, r.location) : ''}${r.location && r.phase ? ' · ' : ''}${r.phase ? labelFor(FLIGHT_PHASES, r.phase) : ''}
          </p>`
        : ''}

      ${r.deadline
        ? html`
            <p class="queue__deadline" data-status="${r.deadline.status}">
              ${deadlineText(r.deadline)}
            </p>
          `
        : ''}

      ${r.deadline && r.serverId
        ? r.deadline.told
          ? html`<p class="queue__where">
              Authority notified ${new Date(r.deadline.told).toLocaleString()}
            </p>`
          : html`<p class="queue__actions">
              <button type="button" class="btn btn-ghost btn-sm" data-notified="${r.serverId}">
                Record that the authority was told
              </button>
            </p>`
        : ''}

      ${
        /* WITHDRAWING A REPORT THIS DEVICE FILED.

           `origin` is the authority for whose report this is: 'device'
           and 'both' are rows this handset holds because it filed them,
           'server' is somebody else's. Offering the button on a
           'server' row would be offering an action the API refuses, and
           a button that always fails teaches people to ignore refusals
           — the same argument the change-approval buttons make.

           AN ANONYMOUS REPORT THE SERVER HAS ACKNOWLEDGED CANNOT BE
           WITHDRAWN, by anybody, and that is the anonymity working
           rather than a gap. There is no reporterId to match it to, and
           accepting a retraction from the device that filed it would
           mean the server held something joining a device to an
           anonymous filing. Before it syncs it is still local, and
           withdrawing it is purely local — so the button is offered
           exactly while that is true. */
        r.origin !== 'server' &&
        r.state !== 'CLOSED' &&
        (!r.isAnonymous || r.syncState !== 'synced')
          ? html`<p class="queue__actions">
              <button type="button" class="btn btn-ghost btn-sm" data-retract="${r.clientId}">
                Withdraw this report
              </button>
            </p>`
          : ''
      }

      ${r.syncState === 'error' && r.lastError
        ? html`<p class="queue__error">${r.lastError}</p>`
        : ''}

      ${r.state
        ? html`<p class="queue__state" data-state="${r.state}">
            <span class="queue__state-label">${DISPOSITION_LABEL[r.state] ?? r.state}</span>
          </p>`
        : ''}

      ${r.serverId
        ? html`<div class="queue__coding">
            ${r.cicttCodes?.length
              ? html`<ul class="queue__codes">
                  ${r.cicttCodes.map(
                    (c) => html`<li class="queue__code" title="${labelForCode(c)}">
                      <b>${c}</b> ${labelForCode(c)}
                    </li>`
                  )}
                </ul>`
              : html`<p class="queue__uncoded">Not yet classified to ICAO's categories.</p>`}
            ${ADREP_FIELDS.some((f) => r.adrep?.[f.key])
              ? html`<ul class="queue__codes">
                  ${ADREP_FIELDS.filter((f) => r.adrep?.[f.key]).map(
                    (f) => html`<li class="queue__code">
                      <b>${f.question}</b> ${adrepLabel(f.key, r.adrep[f.key])}
                    </li>`
                  )}
                </ul>`
              : ''}
            ${r.serverId
              ? html`<details class="queue__evidence" data-evidence-for="${r.serverId}">
                  <summary>Evidence</summary>
                  <div data-evidence-list="${r.serverId}">
                    <p class="hint">Loading…</p>
                  </div>
                </details>`
              : ''}
            <details class="queue__classify">
              <summary>
                ${r.cicttCodes?.length ? 'Change the classification' : 'Classify the occurrence'}
              </summary>
              <form data-classify="${r.serverId}">
                ${CATEGORY_GROUPS.map(
                  (g) => html`<fieldset class="queue__cat">
                    <legend>${g}</legend>
                    ${categoriesIn(g).map(
                      (c) => html`<label class="queue__cat-opt">
                        <input
                          type="checkbox"
                          name="code"
                          value="${c.code}"
                          ${r.cicttCodes?.includes(c.code) ? raw('checked') : ''}
                        />
                        <span><b>${c.code}</b> ${c.label}</span>
                      </label>`
                    )}
                  </fieldset>`
                )}
                <p class="queue__cat-note">
                  Pick every category that applies — a runway excursion that became a
                  loss of control is both, and recording one loses the other.
                </p>
                <p class="queue__cat-caveat">${CICTT_CAVEAT}</p>

                ${ADREP_FIELDS.map(
                  (f) => html`<fieldset class="queue__cat">
                    <legend>${f.question} — ${f.source}</legend>
                    ${f.options.map(
                      (o) => html`<label class="queue__cat-opt">
                        <input
                          type="radio"
                          name="${f.key}"
                          value="${o.code}"
                          ${r.adrep?.[f.key] === o.code ? raw('checked') : ''}
                        />
                        <span><b>${o.label}</b> ${o.hint}</span>
                      </label>`
                    )}
                    <label class="queue__cat-opt">
                      <input
                        type="radio"
                        name="${f.key}"
                        value=""
                        ${r.adrep?.[f.key] ? '' : raw('checked')}
                      />
                      <span><b>Not yet coded</b> Nobody has made this determination.</span>
                    </label>
                  </fieldset>`
                )}
                <p class="queue__cat-caveat">${ADREP_CAVEAT}</p>

                <button type="submit" class="btn btn-secondary btn-sm">
                  Save the classification
                </button>
              </form>
            </details>
          </div>`
        : ''}

      ${r.serverId
        ? html`<div class="queue__actions">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              data-raise-action="${r.serverId}"
            >
              Record an action
            </button>
            <a
              class="btn btn-ghost btn-sm"
              href="/toolkits/register?from=${r.serverId}"
            >
              Raise a hazard
            </a>
          </div>`
        : ''}

      ${r.available?.length
        ? html`<div class="queue__actions">
            ${r.available.map(
              (a) => html`<button
                type="button"
                class="btn btn-secondary btn-sm"
                data-move="${r.serverId}"
                data-to="${a.to}"
                data-from="${r.state}"
                data-note="${a.requiresNote ? 'yes' : 'no'}"
              >${a.label}</button>`
            )}
          </div>`
        : ''}

      ${r.syncState === 'error' || r.syncState === 'conflict'
        ? html`<div class="queue__actions">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              data-retry="${r.clientId}"
            >
              Try again
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              data-copy="${r.clientId}"
            >
              Copy text
            </button>
          </div>`
        : ''}
    </li>
  `;
}

function deadlineText(d) {
  /* WITHOUT_DELAY has no date to print. It is ranked with DUE_SOON
     rather than with the comfortable end of the queue, because an
     obligation with no window is not an obligation with a long one. */
  if (d.status === 'WITHOUT_DELAY' || !d.due) {
    return `Report without delay — ${d.obligation.authority} sets no fixed period`;
  }
  const when = d.due.toUTCString();
  switch (d.status) {
    case 'OVERDUE':
      return `Overdue — ${d.obligation.authority} expected this by ${when}`;
    case 'DUE_SOON':
      return `Due soon — by ${when}`;
    default:
      return `Reportable by ${when}`;
  }
}

