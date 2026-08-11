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

/* ============================================================
   THE CRANE, drawn from the brand illustration rather than approximated.

   The previous version was three blobs — body, neck, head — which read
   as a duck at 512px and had no crest at all. The grey crowned crane is
   Uganda's national bird and the identity's whole centre; the crest is
   the single feature that makes it that bird rather than any bird, so
   it is drawn as a radiating fan and not as five stray ticks.

   Grid is 120 x 140, matching the shield. The bird stands ON the runway
   with the arcs crossing behind it.
   ============================================================ */

/* Body: an egg with the tail lifted to the left, as the illustration
   carries it. */
const CRANE_BODY =
  'M46 96 C42 88 47 80 56 78 C66 76 76 80 79 87 C82 94 78 101 70 103 L54 103 C49 103 47 100 46 96 Z';

/* The trailing wing, a second plane over the body so the silhouette is
   not a flat oval. */
const CRANE_WING =
  'M52 88 C58 82 68 81 75 85 C71 90 63 93 55 92 Z';

/* Neck: a long S from the shoulder up to the head, the posture the
   bird actually stands in. */
const CRANE_NECK =
  'M58 79 C53 71 53 62 58 56 C60 53 63 52 65 53 C67 54 67 57 66 59 C62 64 61 71 63 79 Z';

/* Head and beak. The beak points right, into the direction of flight. */
const CRANE_HEAD =
  'M60 54 C60 50 63 47 66 47 C69 47 71 49 71 52 L78 54 L71 56 C70 58 67 59 64 58 Z';

const CRANE_EYE = 'M66 51 m -1.4 0 a 1.4 1.4 0 1 0 2.8 0 a 1.4 1.4 0 1 0 -2.8 0';

/* Legs, with the toes the illustration shows. */
const CRANE_LEGS = 'M58 103 L57 114 M52 114 L62 114 M68 103 L70 113 M65 113 L75 113';

/* THE CREST: a fan of eleven rays from the back of the skull. This is
   the feature that names the bird. Below the detail threshold it is the
   first thing dropped, because at 32px a fan of 2px rays is a smudge
   that makes the head look twice its size. */
const CRANE_CREST = [
  'M63 47 L58 33',
  'M65 46 L62 31',
  'M67 46 L66 30',
  'M69 46 L71 30',
  'M70 47 L75 32',
  'M71 48 L79 35',
  'M61 48 L54 36',
  'M60 50 L51 41',
  'M72 50 L82 41',
].join(' ');

/* ============================================================
   THE TWO FLIGHT ARCS.

   They cross low and behind the bird, quartering the shield — which is
   what makes this a coat of arms rather than a picture in a frame. One
   climbs left-to-right and carries the aircraft; the other descends,
   and the two together read as a departure and an arrival over the same
   ground.
   ============================================================ */
const ARC_CLIMB = 'M14 112 C34 96 58 66 104 34';
const ARC_DESCEND = 'M106 112 C86 96 62 66 16 34';

/* Kept under its old name so build-icons.mjs and every doc reference
   still resolve: the climbing arc IS the arc the aircraft rides. */
const ARC = ARC_CLIMB;

/* The aircraft, riding the climbing arc off the upper right. Drawn as a
   swept silhouette rather than a triangle — a triangle at the end of a
   line is an arrowhead, and this is meant to read as an aeroplane. */
const AIRCRAFT =
  'M98 30 L112 36 L104 38 L106 45 L102 45 L98 39 L92 40 L94 36 L90 32 L94 32 Z';

/* Runway threshold — the ground the shield protects, in perspective. */
/* Runway threshold — the ground the shield protects, in perspective:
   NARROWEST at the top, because that is the end receding away. Bar
   widths are bounded by the shield outline at each y — the point of a
   heater shield narrows fast, and a bar wider than its own field is a
   bar sticking out of the crest. */
const RUNWAY_BARS = [
  'M48 116 L72 116',
  'M45 121 L75 121',
  'M42 126 L78 126'
];

/* The quarter fills. Each is the shield clipped to one region by the
   two arcs; drawing them as explicit wedges rather than with a clip
   path keeps the whole mark to paths, which is what lets
   scripts/build-icons.mjs rasterise it without a DOM. */
const QUARTER_TOP = 'M60 4 C60 4 96 12 112 14 C114 14 116 16 116 19 L116 34 C80 60 62 78 60 80 C58 78 40 60 4 34 L4 19 C4 16 6 14 8 14 C24 12 60 4 60 4 Z';
const QUARTER_LEFT = 'M4 36 C36 62 56 80 58 82 L58 84 C40 100 22 112 14 116 C8 108 4 92 4 68 Z';
const QUARTER_RIGHT = 'M116 36 L116 68 C116 92 112 108 106 116 C98 112 80 100 62 84 L62 82 C64 80 84 62 116 36 Z';

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
export function Mark({
  height = 40,
  tone = 'ink',
  shieldFill = false,
  title = 'UsalamaSMS',
  colour = false,
} = {}) {
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

  /* `colour` is the quartered version from the identity guidelines:
     terracotta, teal and gold behind a charcoal outline. It is the
     primary logo and it is used where there is room for it. The
     monochrome variants above are not a fallback — the guidelines list
     them as approved, and a 32px favicon has no room for three fills
     and a crest.

     On the coloured shield the bird and runway go charcoal regardless
     of `tone`, because gold on gold is the quarter disappearing. */
  const birdTone = colour ? 'var(--us-charcoal)' : stroke;
  const arcTone = colour ? 'var(--us-sand)' : accent;

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
      ${
        colour
          ? `<g stroke="none">
               <path d="${QUARTER_TOP}" fill="var(--us-terracotta)"/>
               <path d="${QUARTER_LEFT}" fill="var(--us-teal)"/>
               <path d="${QUARTER_RIGHT}" fill="var(--us-gold)"/>
             </g>`
          : ''
      }
      <path d="${SHIELD_PATH}" fill="${colour ? 'none' : field}" stroke="${stroke}" stroke-width="5"
            stroke-linejoin="round"/>
      ${
        detail
          ? `<g fill="none" stroke="${arcTone}" stroke-width="2.6" stroke-linecap="round" opacity="${colour ? 1 : 0.9}">
               <path d="${ARC_CLIMB}"/>
               <path d="${ARC_DESCEND}"/>
             </g>`
          : ''
      }
      <g fill="${birdTone}">
        <path d="${CRANE_BODY}"/>
        <path d="${CRANE_NECK}"/>
        <path d="${CRANE_HEAD}"/>
      </g>
      ${
        detail
          ? `<path d="${CRANE_WING}" fill="${colour ? 'var(--us-sand)' : field === 'none' ? accent : field}" opacity="0.55"/>
             <path d="${CRANE_EYE}" fill="${colour ? 'var(--us-sand)' : 'var(--us-sand)'}"/>
             <g stroke="${birdTone}" stroke-width="2.4" stroke-linecap="round" fill="none">
               <path d="${CRANE_LEGS}"/>
             </g>
             <g stroke="${accent}" stroke-width="1.9" stroke-linecap="round" fill="none">
               <path d="${CRANE_CREST}"/>
             </g>
             <g stroke="${birdTone}" stroke-width="3" stroke-linecap="round" fill="none">
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
export function Lockup({ height = 34, descriptor = 'Aviation Safety Management' } = {}) {
  return html`<a class="us-lockup" href="/">
    ${Mark({ height, tone: 'ink', title: '', colour: true })}
    <span class="us-lockup__text">
      <span class="us-logo__word">Usalama<span class="us-logo__word-sms">SMS</span></span>
      <span class="us-lockup__descriptor">${descriptor}</span>
    </span>
  </a>`;
}
