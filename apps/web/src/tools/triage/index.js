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
import { syncBadge, StatusBadge } from '../../components/Status.js';
import { Select, wireSelects } from '../../components/Select.js';
import {
  REPORT_TYPES, SYNC_STATES, AERODROMES, FLIGHT_PHASES,
  toOptions, labelFor
} from '../../../../../packages/shared/src/taxonomy.ts';
import { db, retryReport } from '../../shared/offline.ts';
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
function merge(local, remote) {
  if (!remote) return local.map((r) => ({ ...r, origin: 'device' }));
  const byClientId = new Map(remote.reports.map((r) => [r.clientId, r]));
  const merged = local.map((r) => {
    const server = byClientId.get(r.clientId);
    byClientId.delete(r.clientId);
    return server
      ? { ...r, origin: 'both', serverId: server.id, state: server.state, available: server.available }
      : { ...r, origin: 'device' };
  });
  for (const server of byClientId.values()) {
    merged.push({
      ...server,
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

      <!-- CHARTER RULE 8, ON THE SCREEN. Showing the handset's reports
           as though they were the operator's, when the safety office
           could not be reached, is the failure this whole product is
           built against. It says so instead. -->
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

      <!-- COLLAPSED BY DEFAULT. Three stacked dropdowns are a full
           handset screen, and they were pushing every report below the
           fold — on the one screen whose job is to show reports. The
           summary carries the active count, so a filtered view can never
           be mistaken for an empty queue while the controls are shut. -->
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

  outlet.addEventListener('change', (event) => {
    const name = event.target?.name;
    if (!name?.startsWith('filter-')) return;
    filters[name.slice('filter-'.length)] = event.target.value;
    void render(outlet);
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
      deadline = { due, status: deadlineStatus(due, now, { obligation }), obligation };
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
      <!-- KIND on the left, STATE on the right, and nothing else on
           this line. Two badges plus a label wrapped onto three lines at
           390px, which is a card that has stopped being scannable. -->
      <div class="queue__head">
        <span class="queue__type">${TYPE_LABEL[r.type] ?? r.type}</span>
        ${syncBadge(r.syncState)}
      </div>

      <p class="queue__title">${r.title}</p>

      <!-- PROTECTED, from the identity's six. It is the badge that means
           confidentiality rather than delivery — which is what an
           anonymous report carries and what "sent" does not. It sits
           under the title because it describes the REPORT, where the
           badge above describes what has happened to it. -->
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

      ${r.syncState === 'error' && r.lastError
        ? html`<p class="queue__error">${r.lastError}</p>`
        : ''}

      <!-- THE ACTION THE STRIP HAS BEEN POINTING AT. It said "open
           Triage to review" and this screen had nothing to press.

           Copy sits beside Try again because some reports genuinely
           cannot send — a validation rejection will be rejected again,
           and a role that may not file this type still may not. The
           person standing there needs the words out of the device and
           into a phone call, and refusing them that is how an
           occurrence ends up unreported rather than merely unsent. -->
      <!-- WHAT HAPPENED TO IT, and what may happen next.

           Only on rows the server knows about: a report still in the
           outbox has no row to move, and offering to close it would be
           offering to lose it. The available moves come from the server
           rather than being worked out here, so buttons cannot disagree
           with the permission matrix — a second copy of that matrix in
           the browser is the copy that goes stale. -->
      ${r.state
        ? html`<p class="queue__state" data-state="${r.state}">
            <span class="queue__state-label">${DISPOSITION_LABEL[r.state] ?? r.state}</span>
          </p>`
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

