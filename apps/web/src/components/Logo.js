/* ============================================================
   UsalamaSMS mark + wordmark lockup.

   THE MARK IS THE SUPPLIED ARTWORK. NOTHING HERE DRAWS IT.

   WHAT WAS HERE, AND WHY IT WENT. This file used to carry the geometry:
   a shield path, three quarter fills, a crane in five pieces, two arcs,
   three runway bars and an aircraft, all hand-built on a 120x140 grid —
   about 2 KB of path data in the entry chunk, read by this component
   AND by scripts/build-icons.mjs so that "the favicon cannot disagree
   with the header".

   That worked, and it was solving the wrong problem. One source kept
   the favicon and the header agreeing WITH EACH OTHER; it could not
   make either agree with the identity, and neither did. Put side by
   side with docs/brand/lockup-wide.jpg the drawing has straight
   crossing lines where the artwork has sweeping contrail arcs, an
   arrowhead where it has an airliner, and a spiked crest where it has a
   rounded one. It was a competent redrawing of the mark and it was
   visibly not the mark.

   So both now read the same JPEG. build-icons.mjs crops it into the
   icon suite; this renders the two transparent crops from that suite.
   The agreement is still one-source, and now the source is the
   designer's file rather than somebody's reconstruction of it.

   ---------------------------------------------------------------
   TWO FILES BECAUSE THERE ARE TWO GROUNDS, and neither is an invention.
   The guidelines list a monochrome variant for a light ground and one
   for a dark ground; these are those.

     mark-light-128.png   charcoal on transparent, for Warm Sand and
                          white — the header and footer lockup
     mark-dark-256.png    gold on transparent, for the dark hero band

   Gold on Warm Sand would be two light values against each other, which
   is why the light variant is not simply the same file.

   THE MARK IS NEVER RENDERED IN THE RISK-SCALE COLOURS. A logo that
   turns red is a logo that looks like an alert.

   ---------------------------------------------------------------
   NO DETAIL THRESHOLD ANY MORE, and its absence is the point. The old
   geometry dropped the crest, the runway and the arcs below 40px
   because sub-pixel strokes smear. A raster cannot do that and does not
   need to: build-icons.mjs keys and downscales at 4x, so the small
   sizes arrive antialiased rather than smeared. Where a size genuinely
   cannot carry the detail — the 32px tab icon — that is handled by
   cropping tighter, not by drawing less.

   WIDTH IS DERIVED FROM HEIGHT at the artwork's own 330:425 aspect, so
   a caller still asks for a height and gets a mark that is not
   squashed.
   ============================================================ */

import { html, raw } from '../shared/html.js';

/* The mark's aspect in docs/brand/lockup-wide.jpg — 330 wide by 425
   tall. Stated once here and in scripts/build-icons.mjs's MARK_BOX,
   which is the file that measured it. */
const MARK_ASPECT = 330 / 425;

let seq = 0;

/**
 * The mark on its own.
 *
 * @param {object} options
 * @param {number} options.height  Rendered height in px.
 * @param {string} options.tone    'gold' (on a dark ground) or 'ink' (on light).
 * @param {string} options.title   Accessible name. Pass '' when the mark is
 *                                 decorative and an adjacent element names it.
 */
export function Mark({ height = 40, tone = 'ink', title = 'UsalamaSMS' } = {}) {
  const width = Math.round(height * MARK_ASPECT);
  const id = `us-mark-${++seq}`;
  const src = tone === 'gold' ? '/icons/mark-dark-256.png' : '/icons/mark-light-128.png';

  /* An empty title means decorative: alt="" and aria-hidden, so a
     screen reader passes over it. A mark that announces "UsalamaSMS"
     immediately before a wordmark that also says "UsalamaSMS" is a
     screen reader saying it twice — which is the accessible-name defect
     a Lighthouse run found on the sibling product's own logo.

     alt="" is not the same as a missing alt. A missing one makes some
     screen readers read the FILENAME, so a decorative mark would
     announce "mark light 128 dot p n g". */
  const labelling = title
    ? `alt="${escapeHtml(title)}" id="${id}"`
    : 'alt="" aria-hidden="true"';

  /* WIDTH AND HEIGHT ARE ON THE ELEMENT, not only in CSS, so the header
     does not reflow when the image lands. A lockup that jumps on every
     cold start is the most visible layout shift the shell has, and it
     is one attribute pair to avoid.

     `decoding=async` keeps a cold start from blocking paint on it, and
     the mark is precached by the service worker, so after the first
     visit it is served from cache rather than the network. */
  return html`${raw(`
    <img class="us-mark" src="${src}" width="${width}" height="${height}"
         decoding="async" ${labelling}>
  `)}`;
}

/** HTML-escape for an attribute value. */
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

/**
 * Mark + wordmark. The wordmark is LIVE TEXT, not traced letterforms:
 * crisp at any size, reflows, selectable, searchable, and it inherits
 * the licensed face the day it replaces the stand-in.
 *
 * The accessible name covers the WHOLE lockup. The sibling product
 * shipped a logo whose accessible name omitted half its visible text
 * and only found it under Lighthouse; the mark here is explicitly
 * decorative and the text beside it does the naming.
 */
export function Logo({ height = 32, tone = 'ink', href = '/' } = {}) {
  return html`<a class="us-logo" href="${href}" data-tone="${tone}">
    ${Mark({ height, tone, title: '' })}
    <span class="us-logo__word"
      >Usalama<span class="us-logo__word-sms">SMS</span></span
    >
  </a>`;
}

/**
 * The lockup used in the app shell: mark, wordmark, and a descriptor
 * line beneath it.
 *
 * The descriptor is what stops a two-word wordmark reading as a login
 * screen for something unspecified. It is set in the gold text sibling
 * at 8px with wide tracking — small enough to be a signature rather
 * than a heading, and dark enough to actually be read, which flat
 * Savannah Gold at 2.16:1 would not be.
 */
/* THE TONE IS A PARAMETER BECAUSE THE FOOTER IS DARK, and it took a
   screenshot to notice. This used to pass `colour: true` and get the
   quartered mark — terracotta, teal and gold — which reads on any
   ground because it carries three of its own. The monochrome crop does
   not: charcoal ink on the footer's charcoal is a mark you cannot see,
   and that is exactly what shipped into the render before this line.

   Nothing caught it. The contrast gate reads colour TOKENS against the
   grounds they are declared on, and the accessibility sweep reads text;
   an <img> that happens to match the panel behind it is neither. The
   check that found it was looking at the page. */
export function Lockup({
  height = 34,
  tone = 'ink',
  descriptor = 'Aviation Safety Management',
} = {}) {
  return html`<a class="us-lockup" href="/">
    ${Mark({ height, tone, title: '' })}
    <span class="us-lockup__text">
      <span class="us-logo__word">Usalama<span class="us-logo__word-sms">SMS</span></span>
      <span class="us-lockup__descriptor">${descriptor}</span>
    </span>
  </a>`;
}
