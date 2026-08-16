/* ============================================================
   NOTES ABOUT THE MARKUP, COLLECTED OUT OF THE TEMPLATE.

   An `<!-- -->` inside a tagged template literal is string content:
   no minifier removes it and every reporter downloads it. In the order
   the markup reaches them:

   1. HOW MANY REPORTS ACTUALLY ARRIVED, on request.
      The debt this pays down is "indicators are typed, not fed": an
      operator types an event count while the reports it came from
      sit in the same database, so the indicator can disagree with
      the queue behind it and nobody finds out until an inspector
      adds them up.
      IT OFFERS, IT DOES NOT FILL IN, and it is a button rather
      than something that happens on blur for exactly that reason.
      An indicator counts a PARTICULAR thing, and the number of
      reports filed in a quarter is not that thing unless the
      operator says it is. Silently filling the field would replace
      a transcription error with a category error, which is worse
      because it looks right.

   2. The error belongs to THIS form. It used to be written into the
      one live region at the bottom of the page, inside "Add an
      indicator" — so a bad period on the first indicator reported
      itself in a different section, usually off screen, and so did
      the refused-write message, which is the one that most needs
      to be seen.
   ============================================================ */
/* ============================================================
   Safety performance indicators — Annex 19 element 3.1.

   THE ELEMENT THE COVERAGE TABLE HAS ALWAYS MARKED "SCORED, NOT BUILT".
   A reporting system that produces no trend is a filing cabinet, and
   "safety performance monitoring and measurement" is the element an
   auditor reaches for immediately after the reporting queue: indicators
   with targets and alert levels, reviewed on a cadence, and a record of
   what happened the last time one was crossed.

   THE ARITHMETIC IS IN packages/shared/src/spi.ts and nothing on this
   screen restates it. Rates, averages, standard deviations, alert
   levels and every crossing are computed on each repaint from the
   counts an operator typed — charter rule 6. What is stored is the two
   numbers a person actually knows: how many occurrences, and how much
   flying. An indicator that stored its own alert level would eventually
   carry one that disagreed with its data, and an alert level nobody
   trusts is an alert level nobody acts on.

   COLOUR IS NEVER THE ONLY CHANNEL. The chart is decoration with
   aria-hidden on it; the periods are underneath as a table with the
   band named in words, which is also what prints and what a screen
   reader reads.

   ON THIS DEVICE, like the register, the SRA and the maturity
   assessment, and the page says so rather than implying the safety
   office can see it.
   ============================================================ */

import { html, raw } from '../../shared/html.js';
import { attachPrintId } from '../../shared/print-id.js';
import { Select, wireSelects } from '../../components/Select.js';
import {
  INDICATOR_KINDS,
  ALERT_CRITERIA,
  MIN_BASELINE,
  spiVerdict,
  canAppendPeriod,
  periodOrder,
  rate
} from '../../../../../packages/shared/src/spi.ts';
import { SAFETY_ROLES } from '../../../../../packages/shared/src/posts.ts';
import {
  REACHABLE_NASP_INDICATORS,
  NASP_CAVEAT,
  NASP_SOURCE
} from '../../../../../packages/shared/src/nasp.ts';
import { isSignedIn, authFetch } from '../../shared/session.js';

const STORE = 'usalamasms.spi';
const OTHER = '__other__';

const num = (n, dp = 2) =>
  Number.isFinite(n) ? n.toFixed(dp).replace(/\.?0+$/, '') || '0' : '—';

function blank() {
  return { indicators: [] };
}

function normalise(raw_) {
  return {
    id: String(raw_.id ?? `spi-${Date.now()}`),
    name: String(raw_.name ?? '').trim() || 'Unnamed indicator',
    kind: INDICATOR_KINDS.some((k) => k.key === raw_.kind) ? raw_.kind : 'LOWER_CONSEQUENCE',
    exposureUnit: String(raw_.exposureUnit ?? 'sectors'),
    per: Number.isFinite(Number(raw_.per)) && Number(raw_.per) > 0 ? Number(raw_.per) : 1000,
    direction: raw_.direction === 'HIGHER_IS_BETTER' ? 'HIGHER_IS_BETTER' : 'LOWER_IS_BETTER',
    target: Number.isFinite(Number(raw_.target)) ? Number(raw_.target) : undefined,
    owner: String(raw_.owner ?? ''),
    periods: Array.isArray(raw_.periods)
      ? raw_.periods
          .filter((p) => p && typeof p === 'object')
          .map((p) => ({
            label: String(p.label ?? ''),
            events: Number(p.events),
            exposure: Number(p.exposure)
          }))
      : []
  };
}

/* Whatever comes back from localStorage is not trusted — another tab,
   another version, or anyone with the dev tools open wrote it. The
   register learned this the hard way: one malformed row threw inside
   the arithmetic, killed the repaint and took every other entry down
   with it, permanently, because the bad row was saved. */
function load() {
  try {
    const raw_ = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (!raw_ || typeof raw_ !== 'object' || !Array.isArray(raw_.indicators)) return blank();
    return { indicators: raw_.indicators.filter(Boolean).map(normalise) };
  } catch {
    return blank();
  }
}

/* Charter rule 8: a refused write is reported, never swallowed. */
function save(state) {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/* ---- the chart -----------------------------------------------------
   Decoration, and marked as such. Every number it draws is in the table
   below it, which is what prints, what a screen reader reads, and what
   somebody looking at a monochrome printout has. A trend line is worth
   having; a trend line that is the ONLY place the trend exists is a
   chart that excludes people. */
/* =====================================================================
   THE SERVER IS THE RECORD; THE BROWSER IS THE CACHE.

   Regulation 9(5) of L.N. 32/2026 requires an SMS to have safety
   performance indicators and targets "acceptable to the Authority".
   Indicators held in one handset's localStorage are not: the safety
   office cannot see them and an inspector cannot be shown them.

   So when there is a session, this screen reads and writes
   /api/v1/spi. Without one it keeps working exactly as it did — the
   arithmetic is local and always was, and an indicator sketched out
   before anybody signs in is better than an indicator not written
   down. What changes is that the screen SAYS which of the two it is
   looking at, because "my indicators are safe" is a belief a person
   forms from a screen and not from a schema.

   The alert levels are never fetched. They are derived by spiVerdict()
   from the series, here, on every paint — the API does not return one
   and could not be trusted if it did. Charter rule 6.
   ===================================================================== */

/** Server shape -> the shape this screen already works in. */
const fromServer = (indicators) =>
  indicators.map((i) =>
    normalise({
      id: i.id,
      name: i.name,
      kind: i.kind,
      exposureUnit: i.exposureUnit,
      per: i.per,
      direction: i.direction,
      target: i.target ?? undefined,
      owner: i.owner,
      periods: i.periods ?? []
    })
  );

function Chart(verdict) {
  const series = verdict.rates;
  if (series.length < 2) return '';
  const levels = verdict.levels;
  const W = 320;
  const H = 110;
  const PAD = 6;

  const candidates = [...series];
  if (levels) candidates.push(levels.average, levels.one, levels.two, levels.three);
  const lo = Math.min(...candidates, 0);
  const hi = Math.max(...candidates);
  const span = hi - lo || 1;
  const x = (i) => PAD + (i * (W - PAD * 2)) / Math.max(1, series.length - 1);
  const y = (v) => H - PAD - ((v - lo) / span) * (H - PAD * 2);

  const line = (v, cls) =>
    v >= lo && v <= hi
      ? `<line class="${cls}" x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" />`
      : '';

  const sigmaAt = new Map(verdict.watched.map((p) => [p.index, p.sigma]));

  return `<svg class="spi-chart" viewBox="0 0 ${W} ${H}" role="presentation" aria-hidden="true" focusable="false">
    ${levels ? line(levels.average, 'spi-chart__avg') : ''}
    ${levels ? line(levels.one, 'spi-chart__sd') : ''}
    ${levels ? line(levels.two, 'spi-chart__sd') : ''}
    ${levels ? line(levels.three, 'spi-chart__sd') : ''}
    <polyline class="spi-chart__line" points="${series
      .map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(' ')}" />
    ${series
      .map(
        (v, i) =>
          `<circle class="spi-chart__pt" data-sigma="${sigmaAt.get(i) ?? 0}" cx="${x(i).toFixed(
            1
          )}" cy="${y(v).toFixed(1)}" r="3" />`
      )
      .join('')}
  </svg>`;
}

/* SD rather than σ, and not for brevity. Greek sigma is outside both
   unicode ranges DM Sans ships here, so it rendered in the system
   fallback in the middle of a label — the exact defect the subset
   split exists to prevent, introduced by the label that described the
   arithmetic. SD is also what State guidance writes. */
const BAND_WORD = ['inside', 'beyond 1 SD', 'beyond 2 SD', 'beyond 3 SD'];

function PeriodTable(ind, verdict) {
  const sigmaAt = new Map(verdict.watched.map((p) => [p.index, p.sigma]));
  let rated = -1;
  const rows = ind.periods.map((p) => {
    const r = rate(p, ind.per);
    if (r !== null) rated += 1;
    const sigma = r === null ? null : (sigmaAt.get(rated) ?? 0);
    const judged = r !== null && sigmaAt.has(rated);
    return html`<tr>
      <td>${p.label || '—'}</td>
      <td>${p.events}</td>
      <td>${p.exposure}</td>
      <td>${r === null ? 'no rate' : num(r)}</td>
      <td>
        ${r === null
          ? 'no exposure recorded'
          : judged
            ? BAND_WORD[sigma]
            : 'baseline'}
      </td>
    </tr>`;
  });

  return html`<div class="table-scroll">
    <table class="oblig-table">
      <caption class="visually-hidden">
        Periods for ${ind.name}, with the rate per ${ind.per} ${ind.exposureUnit} and
        the alert band each period falls in
      </caption>
      <thead>
        <tr>
          <th scope="col">Period</th>
          <th scope="col">Events</th>
          <th scope="col">${ind.exposureUnit}</th>
          <th scope="col">Rate</th>
          <th scope="col">Band</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>`;
}

function IndicatorCard(ind) {
  const verdict = spiVerdict(ind);
  const kind = INDICATOR_KINDS.find((k) => k.key === ind.kind);
  const alerting = verdict.headline.startsWith('Alert');
  const live = verdict.breaches.filter((b) => b.at === verdict.rates.length - 1);

  return html`<article class="card cov reg-entry" data-spi="${ind.id}">
    <div class="cov__head">
      <h3>${ind.name}</h3>
      <span class="badge" data-status="${alerting ? 'ALERT' : 'SAFE'}">
        <span class="badge__label">${alerting ? 'alert' : 'watching'}</span>
      </span>
    </div>

    <p class="cov__has">
      <strong>${verdict.headline}</strong>
      — ${kind?.label ?? ''} · per ${ind.per} ${ind.exposureUnit} ·
      ${ind.direction === 'LOWER_IS_BETTER' ? 'lower is better' : 'higher is better'}
    </p>

    ${verdict.levels
      ? html`<p class="reg-entry__risk">
          <span class="risk-chip" data-tolerability="ACCEPTABLE"
            >average ${num(verdict.levels.average)}</span
          >
          <span class="risk-chip" data-tolerability="TOLERABLE"
            >1 SD ${num(verdict.levels.one)}</span
          >
          <span class="risk-chip" data-tolerability="TOLERABLE"
            >2 SD ${num(verdict.levels.two)}</span
          >
          <span class="risk-chip" data-tolerability="INTOLERABLE"
            >3 SD ${num(verdict.levels.three)}</span
          >
        </p>`
      : html`<p class="cov__missing">
          <strong>No alert levels yet.</strong> ${verdict.reason}
        </p>`}

    ${raw(Chart(verdict))} ${PeriodTable(ind, verdict)}

    ${live.length
      ? html`<p class="reg-entry__flag">
          ${live.map((b) => b.criterion.label).join(' · ')}. ${live[0].criterion.meaning}
          Element 3.1 asks for a record of what happened the last time an alert level
          was crossed — this is that moment, and the record is made elsewhere.
        </p>`
      : ''}

    <p class="reg-entry__meta">
      <span>${ind.owner || 'No owner'}</span>
      <span
        >${ind.target === undefined
          ? 'no target set'
          : `target ${num(ind.target)} · ${
              verdict.target === 'MET' ? 'met' : verdict.target === 'MISSED' ? 'missed' : 'no reading'
            }`}</span
      >
    </p>

    <form class="spi-period no-print" data-add-period="${ind.id}" novalidate>
      <label class="field">
        <span class="field-label">Period</span>
        <input class="input-field" name="label" placeholder="2026-Q3" required />
      </label>
      <label class="field">
        <span class="field-label">Events</span>
        <input class="input-field" name="events" type="number" min="0" step="1" required />
      </label>
      <label class="field">
        <span class="field-label">${ind.exposureUnit}</span>
        <input class="input-field" name="exposure" type="number" min="0" step="1" required />
      </label>
      <button type="submit" class="btn btn-secondary btn-sm">Add period</button>
      <button type="button" class="btn btn-ghost btn-sm" data-observed="${ind.id}">
        How many reports?
      </button>
      <button type="button" class="btn btn-ghost btn-sm" data-remove="${ind.id}">Remove</button>
      <p class="field-error spi-period__error" data-error="${ind.id}"
        role="status" aria-live="polite"></p>
    </form>
  </article>`;
}

export function render(outlet) {
  let state = load();

  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Toolkit</span>
        <h1>Safety performance indicators</h1>
      <div class="print-id-slot"></div>
        <p class="lede">
          Annex 19 element 3.1 asks for indicators with targets and alert levels,
          reviewed on a cadence. This computes the alert levels from your own
          history rather than asking you to pick a number that feels right, and
          judges every period against the periods that came before it.
        </p>
        <dl class="stat-strip" id="spi-strip"></dl>
      </div>
    </section>

    <div class="panel wrap doc">
      <nav class="toc" aria-labelledby="toc-title">
        <h2 class="section-title" id="toc-title">When it alerts</h2>
        <ol>
          ${ALERT_CRITERIA.map(
            (c) => html`<li>
              <strong>${c.label}</strong>
              <span class="toc-summary">${c.meaning}</span>
            </li>`
          )}
        </ol>
        <p class="mat-actions no-print">
          <button type="button" class="btn btn-secondary btn-sm" id="spi-print">
            Print or save as PDF
          </button>
        </p>
      </nav>

      <div class="doc__body">
        <section class="doc-section" id="indicators">
          <h2>Your indicators</h2>
          <p class="lede lede--tight">
            Two numbers per period — how many occurrences, and how much flying.
            Everything else on this page is computed from them and none of it is
            stored, so an indicator cannot carry a level that disagrees with its
            own data.
          </p>
          <div id="spi-list"></div>
        </section>

        <section class="doc-section" id="new">
          <h2>Add an indicator</h2>

          <div class="card no-print" id="nasp-starters">
            <h3>Start from what the State already counts</h3>
            <p class="hint">${NASP_CAVEAT}</p>
            <div class="chip-row">
              ${REACHABLE_NASP_INDICATORS.map(
                (i) => html`
                  <button type="button" class="btn btn-ghost btn-sm"
                          data-nasp="${i.measure}"
                          data-unit="${i.rate?.unit ?? ''}"
                          data-per="${i.rate?.per ?? ''}">
                    ${i.measure} <small>· per ${i.per}</small>
                  </button>
                `
              )}
            </div>
            <p class="hint">
              Two of these carry a rate basis the plan states outright — per 100 movements —
              and those fill it in for you. The rest the plan counts per year or per quarter,
              which says how often to count and not what to count against, so you choose the
              exposure. ${NASP_SOURCE}.
            </p>
          </div>

          <form class="card no-print" id="spi-new" novalidate>
            <label class="field">
              <span class="field-label">What is being measured? *</span>
              <input class="input-field" name="name" required
                placeholder="Unstable approaches" />
            </label>

            ${Select({
              name: 'kind',
              label: 'Consequence class',
              value: 'LOWER_CONSEQUENCE',
              placeholder: 'Choose a class',
              options: INDICATOR_KINDS.map((k) => ({ value: k.key, label: k.label }))
            })}

            <label class="field">
              <span class="field-label">What does the exposure count? *</span>
              <input class="input-field" name="exposureUnit" required
                placeholder="approaches, sectors, flight hours, turnarounds" />
            </label>

            <label class="field">
              <span class="field-label">Rate basis — events per how many? *</span>
              <input class="input-field" name="per" type="number" min="1" step="1" value="1000" required />
            </label>

            ${Select({
              name: 'direction',
              label: 'Which way is good?',
              value: 'LOWER_IS_BETTER',
              placeholder: 'Choose a direction',
              options: [
                { value: 'LOWER_IS_BETTER', label: 'Lower is better — an adverse indicator' },
                { value: 'HIGHER_IS_BETTER', label: 'Higher is better — a collapse is the alert' }
              ]
            })}

            <label class="field">
              <span class="field-label">Safety performance target</span>
              <input class="input-field" name="target" type="number" step="any"
                placeholder="Optional — the rate you committed to" />
              <span class="field-hint">
                A target is a different question from an alert level. The alert level
                asks whether this has changed; the target asks whether it is where
                the organisation said it should be.
              </span>
            </label>

            ${Select({
              name: 'owner',
              label: 'Owner *',
              placeholder: 'Choose the post that owns this',
              options: SAFETY_ROLES.map((r) => ({ value: r.code, label: r.label })),
              otherValue: OTHER,
              otherLabel: 'Another post…',
              otherPlaceholder: 'The post, as your organisation names it'
            })}

            <button type="submit" class="btn btn-primary btn-block">Add the indicator</button>
            <p class="field-error" id="spi-error" role="status" aria-live="polite"></p>
          </form>
        </section>

        <section class="doc-section" id="method">
          <h2>Where the numbers come from</h2>
          <p>
            The alert levels are the average of the preceding periods plus one, two
            and three standard deviations — below the average instead, where higher
            is better. Each period is judged against the periods before it and never
            against a baseline that includes itself: fold a bad quarter into the
            baseline that judges it and the average rises, the level rises with it,
            and the tool reports that nothing happened.
          </p>
          <p>
            The first ${MIN_BASELINE} periods set the baseline and are not judged.
            That floor is this product's judgement, not ICAO's: a standard deviation
            from three points is whichever point was unusual, and an alert level set
            that way fires on the next ordinary period and is disbelieved after that.
          </p>
          <p class="note">
            <b>What is ICAO's, and what is not</b>
            The vocabulary is Doc 9859's — a safety performance indicator, a safety
            performance target, and the split between high-consequence and
            lower-consequence indicators. The standard-deviation method and the three
            crossing criteria are the basic statistical trending method that State
            and industry guidance builds on; this product has not read the primary
            instrument's own wording of it, and says so here rather than citing a
            provision number nobody opened. The
            <a href="/methodology">methodology page</a> keeps the same distinction for
            every other figure.
          </p>
          <p class="note">
            <b>On this device only</b>
            These indicators live in this browser. They are not sent anywhere and the
            safety office cannot see them — print the page to take it to a review.
            <a href="/coverage#c-3">Coverage</a> says what that means for element 3.1
            rather than claiming it.
          </p>
        </section>
      </div>
    </div>
  `.toString();

  const list = outlet.querySelector('#spi-list');
  const strip = outlet.querySelector('#spi-strip');
  const form = outlet.querySelector('#spi-new');
  const error = outlet.querySelector('#spi-error');

  /* 'server' once a session has answered, 'device' otherwise. Not a
     cosmetic label: it is the difference between an indicator the
     safety office can see and one that exists on a handset. */
  let source = 'device';

  const persist = () => {
    if (!save(state)) {
      error.textContent =
        'These indicators could not be saved to the browser — private browsing, or ' +
        'the storage is full. Print the page before you leave it.';
    }
  };

  /* A write that failed on the server has NOT been made, whatever the
     screen shows. The local copy is rolled back to what the server
     last confirmed rather than left holding an optimistic row — an
     indicator that looks saved and is not is the failure this whole
     move was meant to end. */
  const send = async (url, body) => {
    if (source !== 'server') return { ok: true, offline: true };
    try {
      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) return { ok: true, data: await res.json() };
      const detail = await res.json().catch(() => ({}));
      return { ok: false, message: detail.message ?? 'The safety office could not be reached.' };
    } catch {
      return { ok: false, message: 'No connection — this is on the device only for now.' };
    }
  };

  const repaint = () => {
    const verdicts = state.indicators.map(spiVerdict);
    const alerting = verdicts.filter((v) => v.headline.startsWith('Alert')).length;
    const withLevels = verdicts.filter((v) => v.levels).length;

    strip.innerHTML = html`
      <div class="stat">
        <dt class="stat__value">${state.indicators.length}</dt>
        <dd class="stat__label">Indicators</dd>
      </div>
      <div class="stat">
        <dt class="stat__value">${withLevels}</dt>
        <dd class="stat__label">With alert levels</dd>
      </div>
      <div class="stat" data-tone="${alerting ? 'alert' : ''}">
        <dt class="stat__value">${alerting}</dt>
        <dd class="stat__label">Alerting now</dd>
      </div>
      <div class="stat" data-tone="note">
        <dt class="stat__value">${source === 'server' ? 'Safety office' : 'This device'}</dt>
        <dd class="stat__label">
          ${source === 'server'
            ? 'Held for the operator — an inspector can be shown these'
            : 'Sign in and these reach the safety office'}
        </dd>
      </div>
    `.toString();

    list.innerHTML = state.indicators.length
      ? state.indicators.map(IndicatorCard).join('')
      : html`<p class="empty-state">
          <span>No indicators yet. The first one is usually the occurrence type
          your last three safety meetings kept coming back to.</span>
        </p>`.toString();
  };

  wireSelects(form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const f = form.elements;
    const ownerPicked = f.owner.value;
    const owner =
      ownerPicked === OTHER
        ? (f.ownerOther?.value ?? '').trim()
        : (SAFETY_ROLES.find((r) => r.code === ownerPicked)?.label ?? '');
    const per = Number(f.per.value);

    if (!f.name.value.trim() || !f.exposureUnit.value.trim() || !owner) {
      error.textContent = 'An indicator needs a name, what its exposure counts, and an owner.';
      return;
    }
    if (!Number.isFinite(per) || per <= 0) {
      error.textContent = 'The rate basis has to be a positive number — events per 1,000 sectors, say.';
      return;
    }
    error.textContent = '';

    const target = f.target.value.trim();
    state = {
      indicators: [
        ...state.indicators,
        normalise({
          id: `spi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: f.name.value.trim(),
          kind: f.kind.value,
          exposureUnit: f.exposureUnit.value.trim(),
          per,
          direction: f.direction.value,
          target: target === '' ? undefined : Number(target),
          owner,
          periods: []
        })
      ]
    };
    form.reset();
    persist();
    repaint();

    const added = state.indicators[state.indicators.length - 1];
    send('/api/v1/spi', {
      name: added.name,
      kind: added.kind,
      exposureUnit: added.exposureUnit,
      per: added.per,
      direction: added.direction,
      ...(added.target === undefined ? {} : { target: added.target }),
      owner: added.owner
    }).then((r) => {
      if (r.ok && r.data?.indicator?.id) {
        /* Adopt the server's id. The local one was minted from a clock
           and a random suffix so the screen had something to key on;
           every period appended after this has to address the row the
           server actually holds. */
        state = {
          indicators: state.indicators.map((i) =>
            i.id === added.id ? { ...i, id: r.data.indicator.id } : i
          )
        };
        persist();
        repaint();
      } else if (!r.ok) {
        state = { indicators: state.indicators.filter((i) => i.id !== added.id) };
        persist();
        repaint();
        error.textContent = r.message;
      }
    });
  });

  /* ------------------------------------------------------------------
     "How many reports?" — the answer, beside the field, never in it.

     One delegated listener on the list, like every other control here:
     the indicators re-render on every save, so per-button listeners
     would be re-attached each time. That is the P-01 shape the triage
     queue was fixed for.

     THE CAVEAT IS SHOWN WITH THE NUMBER, from the server rather than
     restated here. A count that appears with no qualification is a
     count somebody types straight in.
     ------------------------------------------------------------------ */
  list.addEventListener('click', async (event) => {
    const btn = event.target.closest?.('[data-observed]');
    if (!btn) return;
    const id = btn.dataset.observed;
    const form = list.querySelector(`[data-add-period="${CSS.escape(id)}"]`);
    const out = list.querySelector(`[data-error="${CSS.escape(id)}"]`);
    if (!form || !out) return;

    const label = form.elements.label.value.trim();
    if (!label) {
      out.textContent = 'Type the period first — the count is for a date range, and the label is what names it.';
      return;
    }

    const was = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Counting…';
    try {
      const res = await authFetch(`/api/v1/spi/observed?label=${encodeURIComponent(label)}`);
      const body = await res.json().catch(() => ({}));
      if (res.status === 422) {
        out.textContent = body.message ?? 'That period cannot be turned into a date range.';
      } else if (!res.ok) {
        out.textContent = 'The safety office could not be reached, so nothing was counted.';
      } else {
        out.textContent = `${body.total} report${body.total === 1 ? '' : 's'} arrived in ${label}. ${body.caveat}`;
      }
    } catch {
      out.textContent = 'The safety office could not be reached, so nothing was counted.';
    } finally {
      btn.disabled = false;
      btn.textContent = was;
    }
  });

  list.addEventListener('submit', (event) => {
    const id = event.target?.dataset?.addPeriod;
    if (!id) return;
    event.preventDefault();
    const f = event.target.elements;
    const say = (message) => {
      const region = list.querySelector(`[data-error="${id}"]`);
      if (region) region.textContent = message;
      else error.textContent = message;
    };
    const events = Number(f.events.value);
    const exposure = Number(f.exposure.value);
    if (!Number.isFinite(events) || !Number.isFinite(exposure)) {
      say('A period needs a count of events and the exposure it happened over.');
      return;
    }

    /* ============================================================
       THE ORDER IS THE METHOD, so it is checked before the write.

       Every alert level is set from the periods BEFORE the one being
       judged. Entry order was the only definition of "before", and
       nothing enforced it: back-fill last year's quarters after this
       year's, or type one twice, and every level, every band and the
       alerting count come out of the wrong baseline — shown with
       exactly the same confidence as a right one.

       canAppendPeriod() refuses a duplicate always, and refuses an
       out-of-sequence period only where both labels have a position it
       can actually read. An operator whose periods are "Monsoon" and
       "Winter" gets the duplicate guard and no opinion about order,
       because a guard that rejects a real cadence is worse than the
       defect it replaces.
       ============================================================ */
    const target = state.indicators.find((i) => i.id === id);
    const verdict = canAppendPeriod(target?.periods ?? [], f.label.value);
    if (!verdict.ok) {
      say(verdict.reason);
      return;
    }
    say('');

    const period = { label: f.label.value.trim(), events, exposure };
    state = {
      indicators: state.indicators.map((ind) =>
        ind.id === id ? { ...ind, periods: [...ind.periods, period] } : ind
      )
    };
    persist();
    repaint();

    send(`/api/v1/spi/${id}/periods`, period).then((r) => {
      if (r.ok) return;
      /* The server refused — most likely the same period label twice,
         which it checks as well as this screen does. Take the row back
         out rather than leave a period on screen that the record does
         not have, and say which one. */
      state = {
        indicators: state.indicators.map((ind) =>
          ind.id === id
            ? { ...ind, periods: ind.periods.filter((p) => p.label !== period.label) }
            : ind
        )
      };
      persist();
      repaint();
      say(r.message);
    });
  });

  list.addEventListener('click', (event) => {
    const id = event.target.closest?.('[data-remove]')?.dataset.remove;
    if (!id) return;
    if (!window.confirm('Remove this indicator and every period on it?')) return;
    state = { indicators: state.indicators.filter((i) => i.id !== id) };
    persist();
    repaint();
    const next = list.querySelector('[data-remove]');
    if (next) next.focus();
  });

  /* ============================================================
     THE NATIONAL INDICATORS, as a starting point rather than a rule.

     An operator that measures what the State measures can hand a
     regulator a number that lands in the same row as the national one.
     One that invents its own measure cannot — the number is not wrong,
     it is simply not comparable to anything.

     PREFILLS ONLY WHAT THE PLAN STATES. Two of these carry a rate
     basis outright ("per 100 movements") and it is filled in. The rest
     the plan counts per year or per quarter, which says how often to
     count rather than what to count against, so the exposure field is
     left for the operator. Guessing one would be this product putting
     words in the plan's mouth, and an indicator's whole value is that
     its denominator is honest. */
  outlet.querySelector('#nasp-starters')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-nasp]');
    if (!button) return;
    const form = outlet.querySelector('#spi-new');
    form.querySelector('[name="name"]').value = button.getAttribute('data-nasp');
    const unit = button.getAttribute('data-unit');
    const per = button.getAttribute('data-per');
    if (unit) form.querySelector('[name="exposureUnit"]').value = unit;
    if (per) form.querySelector('[name="per"]').value = per;
    /* Focus the first field the operator still has to answer, rather
       than the top of a form that is now partly filled. */
    (unit ? form.querySelector('[name="target"]') : form.querySelector('[name="exposureUnit"]'))?.focus();
  });

  outlet.querySelector('#spi-print').addEventListener('click', () => window.print());

  /* THE PACK IS ATTRIBUTED, or it carries no header at all. Not awaited:
     this screen renders instantly and must keep doing so, and an
     identity block that only matters on paper is not worth a network
     round trip in front of it. If the name never arrives the slot stays
     empty, which is the refusal printId() already implements. */
  void attachPrintId(outlet, 'Safety performance indicators — regulation 9(5)', {
    /* The only one of the four that is already fetching on this render:
       the series is held for the operator, not the device, so the screen
       has a session and one more round trip changes nothing about what
       it does. The three device-local toolkits take the cache or
       nothing. */
    allowFetch: true,
  });

  repaint();

  /* THE SERVER READ, last and asynchronously, so the screen is usable
     before it answers. An operator at a strip on a bad link gets their
     own device's copy immediately and the organisation's a moment
     later; the alternative is a spinner in front of a safety record.

     A failure here is not an error state. It means this device is
     working offline, which is a supported way to use this product —
     the strip says so and the indicators still compute. */
  /* AND IT MUST NOT DELETE INDICATORS THAT ONLY EXIST HERE. This
     assigned the server list straight over `state` and persisted it,
     so a signed-in safety manager whose organisation had no
     server-side indicators yet opened the screen and watched an empty
     list overwrite their own — every indicator, and every period of
     history under it. No click, no confirmation, no undo.

     That is worse here than anywhere else in the product. An indicator
     is not one fact; it is a series, and the series is the whole
     value. Six quarters of exposure cannot be reconstructed from
     memory the way a hazard description can, and alertLevels() has
     nothing to judge against once they are gone.

     Unioned by id, server first, for the reasons written out at length
     on the register screen — including the honest cost, which is that
     with no delete synchronisation an indicator removed elsewhere can
     reappear. A reappearing indicator is visible and can be removed
     again; six quarters silently deleted are not noticed at all. */
  if (isSignedIn()) {
    authFetch('/api/v1/spi')
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        const held = fromServer(body.indicators ?? []);
        const known = new Set(held.map((i) => i.id));
        const deviceOnly = state.indicators.filter((i) => !known.has(i.id));
        source = 'server';
        state = { indicators: [...held, ...deviceOnly] };
        persist();
        repaint();
      })
      .catch(() => {
        /* Left on the device copy deliberately. */
      });
  }

  void raw;
}
