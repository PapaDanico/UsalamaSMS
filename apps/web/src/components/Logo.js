/* ============================================================
   UsalamaSMS mark + wordmark lockup.

   Built from the supplied identity: a shield of protection carrying a
   grey crowned crane, an aircraft on a climbing arc, and a runway
   threshold below. Three ideas, one silhouette — safety, flight, and
   the ground the whole thing rests on.

   GEOMETRY LIVES HERE AND ONLY HERE. `SHIELD_PATH` and the element
   paths below are read by the in-app mark AND by scripts/build-icons.mjs,
   so the favicon cannot disagree with the header. Kanda learned this by
   having two sources; never hand-edit a generated icon.

   COLOUR. The mark is Savannah Gold on a dark ground, or Dusty Charcoal
   on a light one. It is NEVER rendered in the risk-scale colours — a
   logo that turns red is a logo that looks like an alert. "Do not alter
   brand colours" applies to the six fills; the two-tone treatment here
   selects between them, it does not invent a seventh.

   DETAIL THRESHOLD. The crane's crest, the runway centreline and the
   contrail dashes are drawn only above 40px. Below that they collapse
   into a smudge and cost legibility — the 32px favicon relies on the
   shield silhouette and the crane's body alone. This is the same
   threshold Kanda applies to its topographic texture, for the same
   reason, and it was measured rather than assumed.
   ============================================================ */

import { html, raw } from '../shared/html.js';

/* The shield, on a 120 x 140 grid. A rounded-shoulder heater shield:
   flat top with soft corners, straight flanks, and a point that is
   eased rather than sharp so it survives a 16px raster. */
export const SHIELD_PATH = [
  'M60 4',
  'C60 4 96 12 112 14',
  'C114 14 116 16 116 19',
  'L116 68',
  'C116 104 92 126 62 136',
  'C61 136.5 59 136.5 58 136',
  'C28 126 4 104 4 68',
  'L4 19',
  'C4 16 6 14 8 14',
  'C24 12 60 4 60 4',
  'Z'
].join(' ');

/* The crowned crane, reduced to the three strokes that make it
   recognisable at small size: body, arched neck, and head. The crest is
   separate so it can be dropped below the detail threshold. */
const CRANE_BODY =
  'M44 96 C44 84 54 78 64 78 C74 78 82 84 82 92 C82 100 74 106 64 106 L50 106 C46 106 44 102 44 96 Z';
const CRANE_NECK = 'M64 78 C60 70 58 62 62 56 C64 53 68 52 71 54 C74 56 74 60 72 62 C69 66 68 72 70 78 Z';
const CRANE_HEAD = 'M68 52 C68 48 71 45 75 45 C79 45 82 48 82 52 C82 55 79 57 76 57 L70 57 Z';
const CRANE_LEGS = 'M56 106 L56 118 M68 106 L68 118';
const CRANE_CREST = 'M74 45 L70 33 M77 45 L77 32 M80 45 L84 33 M71 46 L64 36 M83 47 L90 37';

/* The climbing arc and the aircraft riding it. */
const ARC = 'M18 74 C30 44 62 26 100 30';
const AIRCRAFT = 'M96 22 L110 30 L96 38 L99 30 Z';

/* Runway threshold — five bars in perspective, the ground the shield
   protects. */
const RUNWAY_BARS = [
  'M46 122 L74 122',
  'M44 126 L76 126',
  'M42 130 L78 130'
];

const DETAIL_MIN_HEIGHT = 40;

let seq = 0;

/**
 * The mark on its own.
 *
 * @param {object} options
 * @param {number} options.height   Rendered height in px. Drives the detail threshold.
 * @param {string} options.tone     'gold' (on dark) or 'ink' (on light).
 * @param {boolean} options.shieldFill  Draw the shield as a solid field rather than an outline.
 * @param {string} options.title    Accessible name. Pass '' when the mark is decorative
 *                                  and an adjacent element already names it.
 */
export function Mark({ height = 40, tone = 'ink', shieldFill = false, title = 'UsalamaSMS' } = {}) {
  const width = Math.round((height * 120) / 140);
  const detail = height >= DETAIL_MIN_HEIGHT;
  const id = `us-mark-${++seq}`;

  /* The two-tone selection. Neither branch introduces a colour: both
     pick from the six. On a dark ground the shield is a gold outline
     with gold contents; on light it is charcoal with a gold aircraft,
     so the one moving element keeps its accent. */
  const stroke = tone === 'gold' ? 'var(--us-gold)' : 'var(--us-charcoal)';
  const accent = 'var(--us-gold)';
  const field = shieldFill ? (tone === 'gold' ? 'var(--us-charcoal)' : 'var(--us-sand)') : 'none';

  /* An empty title means decorative: aria-hidden, no <title> element,
     and no role. A mark that announces "UsalamaSMS" immediately before
     a wordmark that also says "UsalamaSMS" is a screen reader saying it
     twice — which is the accessible-name defect Kanda's Lighthouse run
     found on its own logo. */
  const labelling = title
    ? `role="img" aria-labelledby="${id}-t"`
    : 'aria-hidden="true" focusable="false"';

  return html`${raw(`
    <svg class="us-mark" width="${width}" height="${height}" viewBox="0 0 120 140"
         xmlns="http://www.w3.org/2000/svg" ${labelling}>
      ${title ? `<title id="${id}-t">${escapeXml(title)}</title>` : ''}
      <path d="${SHIELD_PATH}" fill="${field}" stroke="${stroke}" stroke-width="5"
            stroke-linejoin="round"/>
      <g fill="${stroke}">
        <path d="${CRANE_BODY}"/>
        <path d="${CRANE_NECK}"/>
        <path d="${CRANE_HEAD}"/>
      </g>
      ${
        detail
          ? `<g stroke="${stroke}" stroke-width="2.4" stroke-linecap="round" fill="none">
               <path d="${CRANE_LEGS}"/>
               <path d="${CRANE_CREST}" stroke="${accent}" stroke-width="2"/>
             </g>
             <path d="${ARC}" fill="none" stroke="${accent}" stroke-width="3"
                   stroke-linecap="round" stroke-dasharray="1 7"/>
             <g stroke="${stroke}" stroke-width="3" stroke-linecap="round">
               ${RUNWAY_BARS.map((d) => `<path d="${d}"/>`).join('')}
             </g>`
          : ''
      }
      <path d="${AIRCRAFT}" fill="${accent}"/>
    </svg>
  `)}`;
}

/**
 * Mark + wordmark. The wordmark is LIVE TEXT, not traced letterforms:
 * crisp at any size, reflows, selectable, searchable, and it inherits
 * the licensed face the day it replaces the stand-in.
 *
 * The accessible name covers the WHOLE lockup. Kanda shipped a logo
 * whose accessible name omitted half its visible text and only found it
 * under Lighthouse; the mark here is explicitly decorative and the text
 * beside it does the naming.
 */
export function Logo({ height = 32, tone = 'ink', href = '/' } = {}) {
  return html`<a class="us-logo" href="${href}" data-tone="${tone}">
    ${Mark({ height, tone, title: '' })}
    <span class="us-logo__word"
      >Usalama<span class="us-logo__word-sms">SMS</span></span
    >
  </a>`;
}

/** XML-escape for the <title> element inside the raw SVG string. */
function escapeXml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]
  );
}
