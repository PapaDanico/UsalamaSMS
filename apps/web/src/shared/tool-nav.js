/* ============================================================
   THE WAY BACK, AND THE WAY ACROSS.

   THE DEFECT, MEASURED RATHER THAN GUESSED AT. On a toolkit screen the
   only VISIBLE link to the toolkits index sat in the footer:

     /toolkits/sra        back-link at 2,643px   page 3,067px
     /toolkits/register   back-link at 1,836px   page 2,260px
     /toolkits/spi        back-link at 2,771px   page 3,195px
     /toolkits/maturity   back-link at 9,893px   page 10,317px

   Eleven screens of scrolling to leave the maturity assessment. Ten
   links to sibling toolkits existed in the DOM of each page and TWO
   were visible; the rest were inside the collapsed menu, present to a
   query selector and absent to a person.

   AND NOTHING SAID WHERE YOU WERE. `aria-current` was on the page —
   one node on /toolkits/spi — and zero of them were visible, because
   the header item it marks is not a toolkit. A screen reader was told;
   a sighted safety manager was not.

   THE FIRST TWO PROBES MISSED ALL OF THIS, and that is worth writing
   down. Both counted nodes matching a selector and filtered by
   bounding-box coordinates, so a collapsed menu panel positioned at
   y=400 counted as "above the fold". The measurement that found it
   checked `offsetParent`, `visibility`, `opacity` and box size — the
   difference between being in the document and being on the screen.
   Then a screenshot confirmed it, which is what a coordinate never
   would have.

   ------------------------------------------------------------
   WHAT THIS IS.

   One row, at the top of the working column on every toolkit screen:
   the way back to the index, then the toolkits themselves with the
   current one marked in a way you can SEE as well as announce.

   BUILT FROM THE REGISTRY, not from a list typed here. sitemap.js is
   already the single source for what the toolkits are — menu-hints
   builds its sentence from the same array — so a fifth toolkit appears
   here by existing rather than by somebody remembering this file.

   NOT STICKY, deliberately. There is already sticky chrome on these
   screens — the sync strip — and scripts/smoke.mjs checks that in-page
   anchors scroll clear of it. A second sticky layer is a second thing
   for an anchor to land under, and the fix for an eleven-screen scroll
   is a bar at the top rather than a bar that follows you. Somebody who
   wants it to follow can say so, and the check that anchors still
   clear the chrome is the one that would have to move with it.
   ============================================================ */

import { html, raw } from './html.js';
import { ROUTED_TOOLKITS } from './sitemap.js';

/**
 * The labels. Held here rather than in the registry because the
 * registry's `short` is a fragment for building a sentence — "risk
 * assessment", lowercase, meant to sit inside prose — and a navigation
 * item is a destination rather than a clause.
 *
 * Keyed by href so the registry stays the list and this stays the
 * wording, the same split sitemap.js already argues for about blurbs.
 * A toolkit with no entry here falls back to its `short`, so adding one
 * degrades to sentence case rather than to a blank chip.
 */
const LABEL = {
  '/toolkits/sra': 'Risk assessment',
  '/toolkits/register': 'Risk register',
  '/toolkits/spi': 'Indicators',
  '/toolkits/maturity': 'Maturity',
};

const sentenceCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Render the row.
 *
 * @param {string} current  The pathname of the screen rendering it, so
 *                          the current toolkit can be marked. Passing
 *                          nothing marks none, which is right for a
 *                          screen that is not itself a toolkit.
 */
export function ToolNav(current = '') {
  return html`
    <nav class="toolnav" aria-label="Toolkits">
      <a class="toolnav__back" href="/toolkits">
        <span aria-hidden="true">&larr;</span> All toolkits
      </a>
      <ul class="toolnav__list">
        ${ROUTED_TOOLKITS.map((t) => {
          const here = t.href === current;
          /* The class list is built HERE rather than interpolated into
             the attribute, and that is not style. check-css.mjs reads
             class attributes with a regex that stops at the first
             quote, so a ternary written inline inside the attribute
             handed it the fragment up to the first inner quote and it
             extracted a bare question mark as a class name. Its own
             comment says interpolated fragments are out of scope; a
             single value keeps that true.

             The gate then read the COUNTER-EXAMPLE this comment first
             contained and failed on that instead, which is the same
             defect one level out: the extractor scans comments, so a
             file explaining the trap must not spell it. */
          const cls = here ? 'toolnav__item is-here' : 'toolnav__item';
          return html`<li>
            <a class="${cls}" href="${t.href}" ${here ? raw('aria-current="page"') : ''}
              >${LABEL[t.href] ?? sentenceCase(t.short)}</a
            >
          </li>`;
        })}
      </ul>
    </nav>
  `;
}
