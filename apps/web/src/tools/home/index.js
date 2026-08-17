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
import { Mark } from '../../components/Logo.js';
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

/* TWO DOORS IN THE HERO, BECAUSE TWO DIFFERENT PEOPLE ARRIVE HERE.

   The second action used to be "How the figures are derived", pointing
   at /methodology. That is a reference page; it is in the menu under
   Reference, and the section it summarises is eight hundred pixels
   below the button on this very page. The most valuable slot on the
   product's front door was spent sending a reader somewhere they were
   already going.

   What was missing was the answer to "where do I start" — the thing an
   operator actually arrives asking. A ramp agent who has just had a
   bird strike wants the form; a safety manager with an audit in six
   weeks wants to know where their SMS stands. One of those had a door
   and the other did not, and the one without it is the one paying for
   this product.

   Primary stays with the report: the occurrence is the time-critical
   arrival, because a reporting window is already running while
   somebody reads this. The other reader is not in a hurry.

   AND THIS NOTE IS A JS COMMENT, NOT AN HTML ONE. Written as
   `<!-- ... -->` inside the template literal below it is a STRING, not
   a comment — the minifier cannot remove what it cannot see is a
   comment, so every word ships to a handset on a rural link. Written
   here it costs nothing. It went in as HTML first and put the entry
   chunk 1.1 KB over budget, which is the only reason anybody noticed. */
/* ======================================================================
   THE REPORTING CLOCK, IN THE HERO — the product demonstrating itself
   rather than describing itself.

   Driven at 1440, the right half of this hero was EMPTY. The mark, the
   heading, the lede and the two buttons all sit in a 62-character
   measure on the left and roughly seven hundred pixels of the most
   valuable space on the front door were ground.

   Kanda fills the same slot with THE REGULATORY CLOCK: three real
   instruments, their status and their dates, live on the landing page.
   The effect is not decorative — a visitor sees the product working
   before they have clicked anything, which is a different claim from a
   paragraph saying that it works.

   THE FIGURES ARE THE SAME ONES THE PRODUCT RUNS ON. MOR_OBLIGATIONS
   is the registry every countdown in this application is computed
   from, and the deadline table further down this page is generated
   from it too. So this panel cannot drift from the product: there is
   nothing here to update when a period changes, and a jurisdiction
   added to the registry appears in the hero without anybody
   remembering to add it.

   THE SHORTEST PERIOD, where an instrument sets several by class. That
   is the honest summary of a multi-class rule in one line — the number
   that runs out first is the one an operator has to plan against, and
   the full table below carries every class.
   ====================================================================== */
function Clock() {
  const codes = Object.keys(MOR_OBLIGATIONS);
  return html`
    <aside class="hero-clock" aria-labelledby="hero-clock-title">
      <p class="hero-clock__title" id="hero-clock-title">The reporting clock</p>
      <ul class="hero-clock__list" role="list">
        ${codes.map((code) => {
          const o = MOR_OBLIGATIONS[code];
          const shortest = o.hoursByClass
            ? Math.min(...Object.values(o.hoursByClass))
            : o.hours;
          return html`<li class="hero-clock__row">
            <span class="hero-clock__who">
              ${o.authority}
              ${isProvisional(code)
                ? html`<span class="tag tag--provisional">Provisional</span>`
                : ''}
            </span>
            <span class="hero-clock__when">
              ${shortest === null
                ? 'Without delay'
                : html`<b>${shortest}</b> ${shortest === 1 ? 'hour' : 'hours'}`}
            </span>
            <span class="hero-clock__from">
              from ${o.clockStart === 'AWARENESS' ? 'awareness' : 'the occurrence'}
            </span>
          </li>`;
        })}
      </ul>
      <a class="hero-clock__more" href="#deadlines">Every period, and the instrument behind it</a>
    </aside>
  `;
}

function Hero() {
  return html`
    <section class="band-dark band-dark--hero">
      <div class="wrap">
        <div class="hero-copy">
        ${Mark({ height: 116, tone: 'gold', title: '' })}
        <span class="eyebrow">Aviation safety management</span>
        <h1>Safety intelligence for African skies</h1>
        <p class="tagline">Safety born of African soil</p>
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
          <a class="btn btn-ghost-lt" href="/toolkits/maturity">See where your SMS stands</a>
        </div>
        </div>

        ${Clock()}

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
                ${o.hours === null
                  ? html`<strong>Without delay</strong> &mdash; no fixed period is set`
                  : html`From
                      ${o.clockStart === 'AWARENESS' ? 'becoming aware' : 'the occurrence'}:
                      ${o.hoursByClass
                        ? CLASS_ORDER.map(
                            ([key, label], i) => html`${i ? ' · ' : ''}<strong
                                >${o.hoursByClass[key]} hours</strong
                              >
                              ${label}`
                          )
                        : html`<strong>${o.hours} hours</strong>`}`}
                <span class="reg-list__source">&middot; ${o.instrument}</span>
                ${isStale(o, new Date())
                  ? html`<span class="tag tag--stale">Past its review cycle</span>`
                  : ''}
                ${o.clockStartUnstated
                  ? html`<span class="cite__governs">
                      The instrument names the periods and not what starts them; awareness
                      is the reading applied here, because a clock anchored to the event can
                      run out before anybody knows it happened.
                    </span>`
                  : ''}
                ${o.clockStartInstrument
                  ? html`<span class="cite__governs">
                      The regulation names the periods and not what starts them. What starts
                      them is stated separately, by ${o.clockStartInstrument} &mdash; so the
                      anchor here is quoted rather than inferred.
                    </span>`
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
