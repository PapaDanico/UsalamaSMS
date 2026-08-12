/* ============================================================
   Triage queue.

   Reads the LOCAL store, not the server. That is not a limitation of
   this build — it is what makes the screen usable on the same handset
   that filed the reports, with the same connectivity assumptions. A
   triage view that needs the network is a triage view that is blank
   exactly when someone is standing in a hangar wondering what came in
   overnight.

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
   ============================================================ */

import { html, raw } from '../../shared/html.js';
import { syncBadge, StatusBadge } from '../../components/Status.js';
import { Select, wireSelects } from '../../components/Select.js';
import {
  REPORT_TYPES, SYNC_STATES, AERODROMES, FLIGHT_PHASES,
  toOptions, labelFor
} from '../../../../../packages/shared/src/taxonomy.ts';
import { db, retryReport } from '../../shared/offline.ts';
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

/* The filter state lives at module scope so it survives a re-render
   after a filter changes. Kept deliberately small — three dimensions is
   what a queue of this size needs, and a filter bar with nine controls
   is one nobody uses. */
const filters = { type: '', state: '', location: '' };

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

  const now = new Date();
  const all = reports.map((r) => decorate(r, now)).sort(compare);
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
        <span class="eyebrow">This device</span>
        <h1>Reports on this device</h1>
        <p class="lede">
          Everything filed on this handset, sent or not. A report that has
          not reached the safety office has not been made, and the strip
          above is what says so.
        </p>
      </header>

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
  const rank = (r) =>
    r.deadline?.status === 'OVERDUE' ? 0
      : r.deadline?.status === 'DUE_SOON' || r.deadline?.status === 'WITHOUT_DELAY' ? 1
        : r.syncState !== 'synced' ? 2
          : 3;
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

