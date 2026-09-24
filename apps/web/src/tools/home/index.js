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
import { ROUTED_TOOLKITS } from '../../shared/sitemap.js';
import { TRIAL_DAYS } from '../../../../../packages/shared/src/pricing.ts';
import {
  MOR_OBLIGATIONS,
  splitByIcaoBaseline,
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
   THE HERO PANEL SELLS THE PRODUCT, NOT THE METHOD.

   It carried the live ICAO Doc 9859 matrix. Correct and gated, and the
   owner's call was that a first-time visitor needs to see what they
   get rather than how risk is scored. The matrix still lives on
   /methodology, where the reader has asked how it works.

   Every line is a capability the product has today; nothing here is
   a count, so nothing here can drift from the registries.
   ====================================================================== */
const FEATURES = [
  ['Offline reporting', 'from the ramp, the hangar or a remote strip'],
  ['Confidential and anonymous', 'reporters choose whether a name is attached'],
  ['Authority deadlines', 'computed for every mandatory report'],
  ['Hazard and risk register', 'with owners, mitigations and reviews'],
  ['Safety indicators', 'alert and target levels from your own data'],
  ['Audits, findings and actions', 'tracked to closure'],
  ['Training and currency', 'lapses flagged before they bite'],
  ['Audit-ready documents', 'printed under your name and logo'],
];

function FeaturePanel() {
  return html`
    <aside class="hero-panel" aria-labelledby="hero-panel-title">
      <p class="hero-panel__title" id="hero-panel-title">Everything your safety office needs</p>
      <ul class="hero-panel__list" role="list">
        ${FEATURES.map(
          ([name, detail]) => html`<li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            <span><b>${name}</b> &mdash; ${detail}</span>
          </li>`
        )}
      </ul>
      <a class="hero-panel__more" href="/coverage">See everything it covers</a>
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
          The whole safety management system in one place &mdash; reporting,
          hazards, risk, indicators, audits and training, across all twelve of
          Annex 19&rsquo;s elements. Your crews report from the ramp, your
          safety office sees it the moment they do, and the auditor gets a
          record that proves itself.
        </p>

        <ul class="hero-proof" role="list">
          <li>Works with the radio off</li>
          <li>Every person on your operator can report</li>
          <li>Your record exports whole, any time</li>
        </ul>

        <div class="hero-actions">
          <a class="btn btn-primary" href="/signup">Start free for ${TRIAL_DAYS} days</a>
          <a class="btn btn-ghost-lt" href="/report">File a report</a>
        </div>
        <p class="hero-note">
          No card. Nothing to install.
          <a href="/toolkits/maturity">Check where your SMS stands</a> first.
        </p>
        </div>

        ${FeaturePanel()}

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
      <h2>From a bird strike to a filed record, in three steps</h2>
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
  /* SEVEN ROWS SAID ONE SENTENCE WITH THE COUNTRY NAME SWAPPED, and a
     line directly beneath them already grouped the same seven. The
     split is computed rather than listed, and `groupsAsIcaoBaseline`
     refuses to fold a row that carries a figure of its own — so a
     State graduating to a real period leaves the group by itself. */
  const { own, grouped } = splitByIcaoBaseline(codes);

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
          ${own.map((code) => {
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

          ${grouped.length
            ? html`<div class="reg-list__row">
                <dt>
                  ${grouped.map((code) => MOR_OBLIGATIONS[code].authority).join(' · ')}
                  <span class="tag tag--provisional">Provisional</span>
                </dt>
                <dd>
                  <strong>Without delay</strong> &mdash; no fixed period is set
                  <span class="reg-list__source"
                    >&middot; ICAO Annex 13, Chapter 4 &mdash; notification with a minimum of
                    delay, by the most suitable and quickest means available. These
                    ${grouped.length} States&rsquo; own civil aviation regulations have not
                    been read against this figure.</span
                  >
                  ${grouped.some((code) => isStale(MOR_OBLIGATIONS[code], new Date()))
                    ? html`<span class="tag tag--stale">Past its review cycle</span>`
                    : ''}
                  <span class="cite__governs">
                    Shown as one row because all ${grouped.length} carry the same ICAO floor
                    and no figure of their own. Any of them that gains a period read from its
                    own instrument leaves this row and gets its own. CASSOA is the regional
                    harmonisation framework, not the legal source of a deadline.
                  </span>
                </dd>
              </div>`
            : ''}
        </dl>

        <p class="footer-note">
          ${provisional.length
            ? ''
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

/* ============================================================
   WHAT AN OPERATOR ACTUALLY GETS, NAMED.

   THE PAGE HAD NO ANSWER TO "what do I get". It carried two claims
   and two regulatory tables, and a director deciding whether to adopt
   this could read the whole front door without learning that the
   product contains a risk register, an indicator set, a culture
   survey or a corrective action plan. Every one of those is built,
   routed and printable, and none of them was mentioned.

   THE LIST IS THE REGISTRY, NOT A LIST TYPED HERE. `ROUTED_TOOLKITS`
   is what the menu, the toolkits index and check:wiring all read, so
   a ninth instrument appears on the front door the day it is routed
   and a retired one leaves. The count is `.length` for the same
   reason — charter rule 10, and the one number on this page nobody
   has to remember to update.

   WHAT IT DOES NOT CLAIM is that all of them print. Nine documents
   are rendered and asserted by check:deliverables, and that set is
   not this set — /sms and /evaluation are in it and are not routed
   toolkits, and the training programme is routed and is not in it.
   Coupling the two counts here would be a claim no gate holds, so
   the printing sentence names the property that IS gated and leaves
   the arithmetic alone.
   ============================================================ */
function Instruments() {
  return html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">What you get</span>
        <h2>${ROUTED_TOOLKITS.length} instruments, open on the first day</h2>
        <p class="lede lede--tight">
          Not modules to be enabled or a tier to be upgraded into. Every one of
          these is routed, built and in the product now &mdash; and the ones
          that are documents print at A4 with the operator&rsquo;s own name and
          mark on every page.
        </p>
        <ul class="instrument-grid" role="list">
          ${ROUTED_TOOLKITS.map(
            (t) => html`<li class="instrument">
              <a href="${t.href}"><span>${t.short}</span></a>
            </li>`
          )}
        </ul>
      </div>
    </section>
  `;
}

/* ============================================================
   WHAT IT DOES FOR YOU.

   The owner's instruction was to take the price off the front door
   and sell on what the product does. /pricing still carries the
   bands, computed from BANDS; this section carries no figure at all,
   so there is nothing here for a price change to leave stale.

   Every card names a capability that exists and the benefit to the
   person using it. No card claims conformance or an outcome the
   product cannot keep — /coverage is where that argument lives.
   ============================================================ */
const BENEFITS = [
  {
    title: 'Reports that arrive',
    body: 'A crew member files from the ramp, the hangar or a remote strip with no signal. The report is safe on the device and sends itself when a connection returns. Anonymous means anonymous: no identifier is stored.',
  },
  {
    title: 'No missed deadline',
    body: 'Every mandatory report carries its authority deadline, computed live from the moment of the occurrence. The queue shows what is owed, to whom, and how long is left.',
  },
  {
    title: 'Risk you can defend',
    body: 'Hazards go into a register assessed on the ICAO Doc 9859 matrix, with mitigations, owners and review dates. Your risk picture shows where the risk actually sits, not where it was last quarter.',
  },
  {
    title: 'Indicators that warn early',
    body: 'Safety performance indicators with alert and target levels computed from your own data, so a trend is flagged while there is still time to act on it.',
  },
  {
    title: 'Audit-ready on demand',
    body: 'Findings, corrective actions, training records and change assessments in one place. The documents an inspector asks for print under your name and mark, ready to hand over.',
  },
  {
    title: 'A record that proves itself',
    body: 'Every change is written to a hash-chained audit trail, each operator sees only its own data, and your whole record exports at any time. It is yours.',
  },
];

function Benefits() {
  return html`
    <section class="panel wrap">
      <span class="eyebrow">What it does for you</span>
      <h2>Less paperwork, fewer surprises, a safer operation</h2>
      <p class="lede lede--tight">
        One system from the first report to the regulator&rsquo;s visit &mdash;
        built for operators who fly where the network doesn&rsquo;t reach.
      </p>
      <ul class="benefit-grid" role="list">
        ${BENEFITS.map(
          (b) => html`<li class="benefit-card">
            <h3 class="benefit-card__title">${b.title}</h3>
            <p class="benefit-card__body">${b.body}</p>
          </li>`
        )}
      </ul>
      <p class="doc-actions">
        <a class="btn btn-primary" href="/signup">Start free for ${TRIAL_DAYS} days</a>
        <a class="btn btn-ghost" href="/coverage">See everything it covers</a>
      </p>
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
    ${Hero()} ${Steps()} ${Instruments()} ${Benefits()} ${Deadlines()} ${Standard()}
  `.toString();
}
