/* ============================================================
   WHAT IT COSTS.

   RENDERED FROM packages/shared/src/pricing.ts, never typed here. A
   price written on a screen, again in a proposal and a third time in an
   email is three prices, and an operator will hold you to the lowest
   one. This repository already knows what happens to claims kept in
   prose — the coverage page overstated for half a day and no gate had
   an opinion, because `state` and `missing` are strings.

   So there is one declaration, this screen reads it, and a claims
   assertion fails the build when a figure appears here that the module
   does not hold.

   THE PAGE ARGUES THE MODEL, not the number. A price list that only
   lists prices invites a comparison on price, which is the one
   comparison this product should never lead with — the incumbents can
   discount faster than a startup can build. What it leads with instead
   is the thing they structurally cannot copy without repricing their
   whole book: unlimited reporters, because charging per seat in a
   safety management system bills an operator for the exact behaviour
   that makes it safer.

   ------------------------------------------------------------
   EVERY NOTE ABOUT THE MARKUP LIVES UP HERE, OUTSIDE THE TEMPLATE,
   and that placement is load-bearing twice over.

   IT IS WEIGHT. An `<!-- -->` inside a template literal is not a
   comment, it is STRING CONTENT — the minifier cannot touch it, so it
   is downloaded by every reporter who opens this page. Five explanatory
   notes sat inside the literal and cost about 2 KB of somebody's
   airtime to explain the code to somebody who was never going to read
   it there. They pushed the total bundle 0.1 KB over budget, which is
   how they were found.

   IT IS ALSO THE BUG. A backtick inside one of those comments ends the
   tagged template early and the rest of the line parses as JavaScript.
   This file shipped `scheme is not defined` to three smoke checks that
   way — the THIRD breakage on this file from exactly that, after two
   earlier ones during its first build. A prose note outside the literal
   can hold a backtick safely, so moving them out removes the hazard
   rather than asking the next person to remember it.

   THE NOTES, in the order the markup below reaches them:

   1. THE ARGUMENT BEFORE THE PRICES. Somebody who reads the bands
      first compares them to a competitor's bands; somebody who reads
      the paragraph first understands why the comparison does not
      apply.

   2. NO NEW CLASSES ON THIS PAGE, and that is the standing rule rather
      than laziness. CSS is at 59.9 KB of 60 and the receipt from three
      changes ago says the next raise splits the stylesheet first. Four
      rules were written for this page — a grid, a price, and two list
      treatments — and every one already existed under another name:
      the risk picture's cards and grid, the stat treatment its figures
      use, and the plain statement list under "what to do next".
      Reusing them costs nothing and makes the pricing page look like
      the product rather than a landing page bolted to it.

   3. THE PRICE IS NOT THE STAT TREATMENT, and the accessibility sweep
      is why. Reusing it here put Savannah Gold on a white card at
      2.16:1 and its label at 1.09:1 — not low contrast but INVISIBLE.
      That treatment is written for the dark band, where gold on
      charcoal is the identity; on a white card it is the exact defect
      the sweep exists to catch.

      It is `.price` instead — the ONE new rule on this page, and note 2
      is why that needed an argument. The first version dodged it by
      rendering the price through `.cov__has`, the coverage list's
      13.5px, which made the most important line on the card the
      smallest thing on it and put the hint about the annual figure at a
      LARGER size than the price it annotates. That is the defect a
      handset photograph of this page showed. Both of `.price`'s sizes
      are rungs of the existing ladder, so it adds a rule and not a
      scale.

   4. THE HEADINGS NEEDED AIR. Rendered on a handset the two lists ran
      into each other: "In every band…" sat directly above "Not decided
      yet…" with no gap, so the second heading read as another bullet.
      `.sms-scheme` is the existing rule for "a new subject starts
      here" — a top border and space — and it costs no new CSS on a
      sheet with 0.1 KB left.

   5. WHAT IS NOT DECIDED GOES ON THE PAGE, not in a footnote. An
      operator asking "can I pay by M-Pesa" deserves the honest answer
      on the pricing page, and a product that has spent this much
      effort refusing to overstate its COVERAGE cannot start
      overstating its commercial readiness.
   ============================================================ */

import { html } from '../../shared/html.js';
import {
  BANDS,
  EVERY_BAND_INCLUDES,
  PRICING_NOT_DECIDED,
  annualUsd
} from '../../../../../packages/shared/src/pricing.ts';

export function render(outlet) {
  outlet.innerHTML = html`
    <section class="band-dark">
      <div class="wrap">
        <span class="eyebrow">Pricing</span>
        <h1>Priced by fleet, never by person</h1>
        <p class="lede">
          Every band includes unlimited people filing reports. That is not a
          promotion — it is the whole design, and it is why the number below is
          the fleet rather than the headcount.
        </p>
      </div>
    </section>

    <section class="panel wrap">
      <p class="lede lede--tight">
        An SMS works when the people who see hazards report them. Annex 19's
        element 2.1 asks for hazards reaching the safety office
        <strong>from the frontline, in useful numbers</strong> — so a system that
        charges by the seat bills an operator for exactly the behaviour that makes
        it safer. Small operators respond sensibly: they buy three licences for the
        safety office and leave the line crew outside the system, which is the
        failure the element exists to prevent.
      </p>

      <h2 class="section-title">What each band costs</h2>
      <div class="picture-grid">
        ${BANDS.map(
          (b) => html`<article class="card">
            <div class="cov__head">
              <h3>${b.name}</h3>
              <span class="badge" data-status="SAFE">
                <span class="badge__label">${b.fleet}</span>
              </span>
            </div>
            <p class="price">$${b.usdMonthly}<small> a month, whole operator</small></p>
            <p class="hint">$${annualUsd(b)} a year — two months saved on an annual commitment.</p>
            <p class="cov__has">${b.who}</p>
            ${b.adds ? html`<p class="cov__missing">${b.adds}</p>` : ''}
            ${b.perExtraAocUsdMonthly
              ? html`<p class="cov__missing">
                  $${b.perExtraAocUsdMonthly} a month for each AOC beyond the first — a second
                  certificate is a second set of deadlines, a second accountable executive and a
                  second audit chain, not more aircraft.
                </p>`
              : ''}
          </article>`
        )}
      </div>

      <div class="sms-scheme">
        <h2 class="section-title">In every band, without exception</h2>
        <ul class="next-list">
          ${EVERY_BAND_INCLUDES.map((line) => html`<li>${line}</li>`)}
        </ul>
      </div>

      <div class="sms-scheme">
        <h2 class="section-title">Not decided yet, and stated rather than implied</h2>
        <ul class="next-list">
          ${PRICING_NOT_DECIDED.map((line) => html`<li>${line}</li>`)}
        </ul>
        <p class="hint">
          Prices are in United States dollars. Nothing on this page takes payment
          yet — an operator can create an account and use the product today, and
          billing arrives when the collection rail is chosen.
        </p>
      </div>

      <p class="mat-actions no-print">
        <a class="btn btn-primary" href="/signup">Create an operator account</a>
      </p>
    </section>
  `.toString();
}
