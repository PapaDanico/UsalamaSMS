/* ============================================================
   THE SAFETY CULTURE SURVEY — will your people actually file?

   Everything else in this product assumes reports arrive. An operator
   with a perfect installation and a workforce that will not report has
   an empty system that passes every check in this repository.

   The instrument, the scoring and the three refusals live in
   packages/shared/src/culture.ts, argued there. This screen is the
   surface, and it makes one of those refusals structural rather than
   promised:

   NOTHING LEAVES THE DEVICE. There is no fetch on this screen. The
   responses are held in localStorage under one key, scored in the
   browser, and cleared by a button. That is not a claim about our
   servers — it is the absence of a request, which is the only version
   of the claim that cannot be quietly broken later.

   WHY localStorage RATHER THAN MEMORY. The realistic way a nine-person
   operator runs this is one tablet passed around the crew room over a
   shift. In memory, one accidental refresh loses every answer and
   nobody runs it twice. On the device, it survives the refresh and
   still never travels.
   ============================================================ */
import { html } from '../../shared/html.js';
import { ToolNav } from '../../shared/tool-nav.js';
import { attachPrintId } from '../../shared/print-id.js';
import {
  CULTURE_ITEMS, CULTURE_SCALE, CULTURE_MIN_RESPONSES,
  score, bandFor, leadFinding, dimensionsOf,
} from '../../../../../packages/shared/src/culture.ts';

const KEY = 'usalama.culture.responses.v1';

/** What each dimension is called on the page, in the operator's words. */
const LABEL = {
  WILL_REPORT: 'Will people report',
  CONSEQUENCE: 'Freedom from consequence',
  CONFIDENTIALITY: 'Trust in confidentiality',
  FEEDBACK: 'Feedback to the reporter',
  ACTION: 'Visible action',
};

/** What to do about it — the reason a dimension is worth measuring. */
const REMEDY = {
  WILL_REPORT:
    'Nothing downstream works without this. Before anything else, ask the people who ' +
    'said no what would change their answer.',
  CONSEQUENCE:
    'The measured barrier in small operators. A written just-culture position, applied ' +
    'visibly the first time it is tested, is what moves it.',
  CONFIDENTIALITY:
    'The anonymous path being sound is not the same as being believed. Show people what ' +
    'is stored — the privacy notice names it.',
  FEEDBACK:
    'The cheapest to fix and the fastest to show. The daily digest exists for this; ' +
    'telling a reporter what happened costs one sentence.',
  ACTION:
    'Feedback without action teaches people that reporting is a formality. Close one ' +
    'corrective action visibly and say which report it came from.',
};

const load = () => {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    /* A corrupt or unavailable store is an empty one. It must never
       throw here: the screen's whole job is to be usable on a borrowed
       tablet with unknown browser settings. */
    return [];
  }
};

const save = (rows) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* Private browsing, or a full quota. The answers stay in memory for
       this session rather than the page breaking mid-survey. */
  }
};

const oneDecimal = (n) => (Math.round(n * 10) / 10).toFixed(1);

function results(rows) {
  const v = score(rows);

  if (v.kind === 'SUPPRESSED') {
    return html`
      <div class="panel wrap" data-surface="tool">
        <h2 class="section-title">No results yet</h2>
        <p><strong>${v.responses} of ${v.needed}</strong> responses collected.</p>
        <p>
          Results stay hidden until ${v.needed} people have answered, and that is a
          privacy decision rather than a statistical one. At a nine-person operator a
          score computed from four responses is a score a safety manager can often put
          names to. The threshold is not adjustable, because an operator who could lower
          it would lower it on the day the answers were interesting.
        </p>
      </div>`;
  }

  const lead = leadFinding(v);
  const byName = new Map(v.dimensions.map((d) => [d.dimension, d]));

  return html`
    <div class="panel wrap" data-surface="tool">
      <h2 class="section-title">What ${v.responses} people said</h2>

      ${lead
        ? html`<p class="lede">
            <strong>Start with ${LABEL[lead].toLowerCase()}.</strong> ${REMEDY[lead]}
          </p>`
        : ''}

      <dl class="culture-results">
        ${dimensionsOf()
          .map((d) => {
            const r = byName.get(d);
            if (!r || r.answered === 0) {
              return html`<div class="culture-row">
                <dt>${LABEL[d]}</dt>
                <dd><span class="badge">Not answered</span></dd>
              </div>`;
            }
            const band = bandFor(r.mean);
            return html`<div class="culture-row">
              <dt>${LABEL[d]}</dt>
              <dd>
                <strong>${oneDecimal(r.mean)}</strong> of 5
                <span class="badge badge--${band.toLowerCase()}">${band}</span>
                <p class="culture-remedy">${REMEDY[d]}</p>
              </dd>
            </div>`;
          })}
      </dl>

      <p>
        Five figures and deliberately no sixth. There is no overall culture score here,
        because a single number is the one thing that reaches a board paper and it cannot
        say which condition is missing. An operator scoring 3.4 learns nothing; an
        operator whose people will report but expect consequences knows exactly what to
        fix on Monday.
      </p>
      <div class="print-id-slot"></div>
    </div>`;
}

export async function render(outlet) {
  let rows = load();
  let answers = {};

  const draw = () => {
    outlet.innerHTML = html`
      <section class="panel">
        ${ToolNav('/toolkits/culture')}
        <header class="page-head">
          <span class="eyebrow">Proactive — safety culture</span>
          <h1>Will your people actually file?</h1>
          <p class="lede">
            Fourteen questions, about five minutes. Pass one device around the crew room;
            each person answers and taps Add. <strong>Nothing leaves this device</strong> —
            the answers are held here and scored here, and this screen makes no network
            request at all.
          </p>
        </header>

        <div class="panel wrap" data-surface="tool">
          <h2 class="section-title">Add a response</h2>
          <form id="culture-form">
            <ol class="culture-items">
              ${CULTURE_ITEMS.map(
                (item) => html`<li class="culture-item">
                  <fieldset>
                    <legend>${item.text}</legend>
                    ${CULTURE_SCALE.map(
                      (s) => html`<label class="culture-choice">
                        <input type="radio" name="${item.id}" value="${s.value}" />
                        <span>${s.label}</span>
                      </label>`,
                    )}
                  </fieldset>
                </li>`,
              )}
            </ol>
            <button type="submit" class="btn btn-primary">Add this response</button>
            <p class="culture-count">${rows.length} collected on this device.</p>
          </form>
        </div>

        ${results(rows)}

        <div class="panel wrap" data-surface="tool">
          <h2 class="section-title">When you are finished</h2>
          <p>
            Print this page for the record, then clear the answers from the device. The
            printed sheet carries the operator's name and the date; the individual
            responses are not on it and are not recoverable once cleared.
          </p>
          <button type="button" class="btn" id="culture-clear">
            Clear every response from this device
          </button>
        </div>
      </section>`;

    const form = outlet.querySelector('#culture-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      answers = {};
      for (const item of CULTURE_ITEMS) {
        const v = Number(data.get(item.id));
        if (Number.isFinite(v) && v > 0) answers[item.id] = v;
      }
      /* An empty submission is a mis-tap, not a response. Counting it
         would drag every mean toward whatever the unanswered items do
         and, worse, move the response count toward the threshold on
         nothing. */
      if (Object.keys(answers).length === 0) return;
      rows = [...rows, answers];
      save(rows);
      draw();
    });

    outlet.querySelector('#culture-clear')?.addEventListener('click', () => {
      rows = [];
      save(rows);
      draw();
    });

    void attachPrintId(outlet, 'Safety culture survey');
  };

  draw();
}
