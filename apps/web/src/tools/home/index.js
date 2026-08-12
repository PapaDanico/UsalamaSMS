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
  isProvisional
} from '../../../../../packages/shared/src/regulations.ts';

/* Four claims, and every one names a mechanism this repository can be
   pointed at rather than a sentiment. Charter rule 7: a claim printed
   on a surface a customer reads has to be kept by something. */
const TRUST = [
  {
    text: 'Files with no signal — the report is on the device before it is anywhere else',
    icon: '<path d="M5 12.5a7 7 0 0 1 14 0"/><path d="M8.5 16a3.5 3.5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/><path d="M3 3l18 18"/>'
  },
  {
    text: 'A name is attached only if the reporter says so — an anonymous report stores no identifier at all',
    icon: '<path d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6z"/><path d="M9 12l2 2 4-4"/>'
  },
  {
    text: 'Every deadline computed from today, never stored — so it cannot go stale',
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
    title: 'Someone files',
    body: `Three fields and a send. It works with the radio off, because the
           report is written to the handset first and the network is an
           afterthought rather than a precondition.`
  },
  {
    n: '02',
    title: 'The clock starts',
    body: `If it is an occurrence, the reporting deadline for the operator's
           authority is computed from the moment of awareness — and recomputed
           every time the screen is opened, so it is never a stale number.`
  },
  {
    n: '03',
    title: 'The safety office sees it',
    body: `It arrives tenant-scoped on an append-only record whose hash chain
           can be verified. Nothing is edited in place, which is the property
           that makes an SMS record evidence rather than a spreadsheet.`
  }
];

function Hero() {
  return html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Aviation safety management</span>
        <h1>Safety intelligence for African skies</h1>
        <p class="lede">
          The safety management system for operators the incumbents priced
          out. It files without signal, computes the reporting deadline your
          authority actually sets, and keeps every narrative inside your own
          organisation.
        </p>

        <div class="hero-actions">
          <a class="btn btn-primary" href="/report">File a report</a>
          <a class="btn btn-ghost-lt" href="/triage">See what is on this device</a>
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
      <h2>Three steps, and none of them need a connection</h2>
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
   ============================================================ */
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
                <strong>${o.hours} hours</strong> from
                ${o.clockStart === 'AWARENESS' ? 'becoming aware' : 'the occurrence'} ·
                <span class="reg-list__source">${o.instrument}</span>
              </dd>
            </div>`;
          })}
        </dl>

        <p class="footer-note">
          ${provisional.length
            ? `${provisional.join(', ')} carry the ICAO-common figure pending a read ` +
              `of the primary instrument, and are marked provisional wherever they appear.`
            : 'Every row above has been read against its primary instrument.'}
        </p>
      </div>
    </section>
  `;
}

function Standard() {
  return html`
    <section class="panel wrap">
      <span class="eyebrow">Standard</span>
      <h2>Built against the amendment that has not landed yet</h2>
      <p class="lede lede--tight">
        ICAO Annex 19 Amendment 2 is applicable
        <time datetime="2026-11-26">26 November 2026</time>. This product is
        built to it now, with Doc 10159 on safety intelligence and the Doc 9859
        risk classification behind the matrix — so an operator adopting it is
        not rebuilding in November.
      </p>
      <p>
        <a class="btn btn-secondary" href="/design">See the design system</a>
      </p>
    </section>
  `;
}

export function render(outlet) {
  outlet.innerHTML = html`
    ${Hero()} ${Steps()} ${Deadlines()} ${Standard()}
  `.toString();
}
