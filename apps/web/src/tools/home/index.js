/* ============================================================
   The landing page.

   WHY IT EXISTS. This app had none. `/` was the report form, and the
   form is the right thing for the person it was designed for — a ramp
   agent with thirty seconds and gloves on — but it is the wrong thing
   for everyone else who arrives at the URL. A safety manager sent a
   link, an operator's director deciding whether to adopt this, a
   regulator checking what it claims: all three landed on a blank text
   field asking them what happened.

   So the two audiences get two doors, and the constraint that made the
   form come first is kept by a different mechanism:

     /          this page — what the product is, and what it is built on
     /report    the form, unchanged and still ungated

   The MANIFEST's start_url is /report. An installed app is an app
   somebody chose to install, and they installed it to file. They open
   on the form; a browser visitor opens here. Nobody who wants to file
   is made to read a page first, and nobody who wants to understand is
   handed a form.

   WHAT MOVED HERE. The regulatory deadline rows used to be the footer.
   They are the basis of every countdown this product computes and the
   single most consequential thing on the site, and they were set in
   footnote type below the fold of every screen. They are a section now,
   with a heading and an anchor a person can be sent to.
   ============================================================ */

import { html, raw } from '../../shared/html.js';
import {
  MOR_OBLIGATIONS,
  isStale,
  isProvisional
} from '../../../../../packages/shared/src/regulations.ts';

/* Four claims, and every one names a mechanism this repository can be
   pointed at rather than a sentiment. Charter rule 7: a claim printed
   on a surface a customer reads has to be kept by something. */
const TRUST = [
  {
    text: 'Records without a connection — the report is on the device before it is anywhere else',
    icon: '<path d="M5 12.5a7 7 0 0 1 14 0"/><path d="M8.5 16a3.5 3.5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/><path d="M3 3l18 18"/>'
  },
  {
    text: 'A name is attached only if the reporter chooses — an anonymous report stores no identifier at all',
    icon: '<path d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6z"/><path d="M9 12l2 2 4-4"/>'
  },
  {
    text: 'Every deadline computed on each read, never stored — so no figure can go stale',
    icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
  },
  {
    text: 'Reaches the safety office and nobody else — tenant-scoped, on a hash-chained record',
    icon: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'
  }
];

/* The three steps, in the order they happen to a report. Written as
   what the SOFTWARE does, not as what the operator should do — a
   marketing page that tells a safety office to "build a reporting
   culture" is telling them the problem they already have. */
const STEPS = [
  {
    n: '01',
    title: 'A report is filed',
    body: `Three fields and a send. It works with the radio off: the report is
           written to the handset first, and the network is a consequence
           rather than a precondition.`
  },
  {
    n: '02',
    title: 'The clock starts',
    body: `If the report is an occurrence, the window set by the operator's own
           authority is computed from the moment of awareness, and recomputed on
           every read. There is no stored deadline to go stale.`
  },
  {
    n: '03',
    title: 'The safety office receives it',
    body: `It arrives scoped to that operator alone, on an append-only record
           whose hash chain can be verified independently. Nothing is edited in
           place — which is what makes a safety record evidence rather than a
           spreadsheet.`
  }
];

function Hero() {
  return html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Aviation safety management</span>
        <h1>Safety intelligence for African skies</h1>
        <p class="lede">
          The reporting and risk-classification layer of an SMS, for operators
          of three to fifteen aircraft. It records a report without a
          connection, computes the reporting window the operator's own authority
          sets, and keeps every narrative inside that operator's organisation.
          It is not a complete safety management system, and
          <a href="/about#notyet">says what it is not</a>.
        </p>

        <div class="hero-actions">
          <a class="btn btn-primary" href="/report">File a report</a>
          <a class="btn btn-ghost-lt" href="/methodology">How the figures are derived</a>
        </div>

        <ul class="trust-strip">
          ${TRUST.map(
            (t) => html`<li class="trust-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                ${raw(t.icon)}
              </svg>
              <span>${t.text}</span>
            </li>`
          )}
        </ul>
      </div>
    </section>
  `;
}

function Steps() {
  return html`
    <section class="panel wrap">
      <span class="eyebrow">How it works</span>
      <h2>Three steps, none of which require a connection</h2>
      <div class="step-grid">
        ${STEPS.map(
          (s) => html`<article class="card step">
            <span class="step__n">${s.n}</span>
            <h3>${s.title}</h3>
            <p>${s.body}</p>
          </article>`
        )}
      </div>
    </section>
  `;
}

/* ============================================================
   THE DEADLINES, COMPUTED.

   Charter rule 10: claims about the product are derived, not typed. A
   page that stated "Kenya: 24 hours" as prose would be a fifth place
   the number lives and the one nobody would think to update — which is
   exactly how the original 72-hour error survived for most of this
   project's life. These rows read MOR_OBLIGATIONS, the same registry
   the countdown on the report form reads.

   AND THEY RENDER THE INSTRUMENT'S AGE, which for a while only
   /methodology did. That was the same defect four times over in one
   week: a field added to the registry, travelling correctly through
   the code, and printed by one surface while the surface people
   actually land on showed the old picture. Here it was the worst
   version of it — the footer routes the reader to this section by
   name as "the regulatory basis", and this section cited a January
   2023 advisory circular without mentioning that a gazetted regulation
   now sits above it.

   A reader is owed the figure, where it comes from, and whether that
   source is still the top of the stack. Two of three is the one that
   misleads.
   ============================================================ */
/* The order regulation 12(1) states them in, which is also strictest
   first — the one a reader should see before the others. */
const CLASS_ORDER = [
  ['ACCIDENT', 'for an accident'],
  ['SERIOUS_INCIDENT', 'for a serious incident'],
  ['INCIDENT', 'for an incident']
];

function Deadlines() {
  const codes = Object.keys(MOR_OBLIGATIONS);
  const provisional = codes.filter(isProvisional);

  return html`
    <section class="band-parchment" id="deadlines">
      <div class="wrap">
        <span class="eyebrow">The basis</span>
        <h2>Reporting deadlines in force</h2>
        <p class="lede lede--tight">
          Every countdown in this product is computed from these figures, and
          this list is generated from the registry that computes them.
        </p>

        <dl class="reg-list">
          ${codes.map((code) => {
            const o = MOR_OBLIGATIONS[code];
            return html`<div class="reg-list__row">
              <dt>
                ${o.authority}
                ${isProvisional(code)
                  ? html`<span class="tag tag--provisional">Provisional</span>`
                  : ''}
              </dt>
              <dd>
                <!-- ONE ROW CAN CARRY THREE PERIODS. Kenya's regulation
                     12(1) sets 24 hours for an accident, 48 for a
                     serious incident and 72 for an incident. Printing
                     the row's single figure here would state a quarter
                     of the instrument as the whole of it — on the
                     section the footer names as the regulatory basis. -->
                ${o.hours === null
                  ? html`<strong>Without delay</strong> — no fixed period is set ·`
                  : o.hoursByClass
                    ? html`${CLASS_ORDER.map(
                        ([key, label], i) => html`${i ? ' · ' : ''}<strong
                            >${o.hoursByClass[key]} hours</strong
                          >
                          ${label}`
                      )}
                      from
                      ${o.clockStart === 'AWARENESS' ? 'becoming aware' : 'the occurrence'} ·`
                    : html`<strong>${o.hours} hours</strong> from
                        ${o.clockStart === 'AWARENESS' ? 'becoming aware' : 'the occurrence'} ·`}
                ${o.clockStartUnstated
                  ? html`<span class="cite__governs">
                      The instrument names the periods and not what starts them; awareness
                      is the reading applied here, because a clock anchored to the event can
                      run out before anybody knows it happened.
                    </span>`
                  : ''}
                <span class="reg-list__source">${o.instrument}</span>
                ${isStale(o, new Date())
                  ? html`<span class="tag tag--stale">Past its review cycle</span>`
                  : ''}
                ${o.governedByUnread
                  ? html`<span class="cite__governs">
                      Now governed by ${o.governedByUnread}, not yet read against this
                      figure &mdash; confirm with your authority.
                    </span>`
                  : ''}
              </dd>
            </div>`;
          })}
        </dl>

        <p class="footer-note">
          ${provisional.length
            ? `${provisional.join(', ')} carry a figure from a secondary source pending a ` +
              `read of the primary instrument, and are marked provisional wherever they appear.`
            : html`Every row above has been read against its primary instrument. Where an
                operator&rsquo;s own authority is not listed, the ICAO baseline applies:
                <strong>notify without delay</strong>. ICAO Annex 13 names no period and
                Annex 19 leaves it to the State, so no countdown is shown rather than a
                borrowed one &mdash; three authorities were once listed here at 72 hours,
                which is the EU&rsquo;s figure and not a common one.`}
        </p>
      </div>
    </section>
  `;
}

function Standard() {
  return html`
    <section class="panel wrap">
      <span class="eyebrow">The standard</span>
      <h2>Built to the amendment before it becomes applicable</h2>
      <p class="lede lede--tight">
        ICAO Annex 19 Amendment 2 becomes applicable on
        <time datetime="2026-11-26">26 November 2026</time> and introduces
        safety intelligence as a formal provision, with Doc 10159 behind it.
        Every established product in this market predates that amendment and
        will add it later. An operator adopting this one is not rebuilding in
        November.
      </p>
      <p class="doc-actions">
        <a class="btn btn-secondary" href="/methodology">Read the methodology</a>
        <a class="btn btn-ghost" href="/about">About the practice</a>
      </p>
    </section>
  `;
}

export function render(outlet) {
  outlet.innerHTML = html`
    ${Hero()} ${Steps()} ${Deadlines()} ${Standard()}
  `.toString();
}
