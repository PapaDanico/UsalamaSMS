/* ============================================================
   Status badges — the six medallions from the identity, as UI.

   The brand assets ship six: SAFE, CAUTION, ALERT, OFFLINE, SYNCING,
   PROTECTED. They are rendered there as gold-rimmed coins with a shield
   at the centre and a patterned ring. That is the right language for a
   brand sheet and the wrong one for a triage queue at 390px, where
   thirty of them would be thirty coins and no information.

   WHAT SURVIVES THE TRANSLATION, and what does not:

     · The six NAMES survive, and they are the vocabulary. A state this
       product can be in that is not one of these six is a state the
       identity did not anticipate, and that is worth noticing rather
       than papering over.
     · The shield survives, as a small glyph. It is what makes these
       read as this product's badges rather than as generic pills.
     · The COLOUR ASSIGNMENTS survive exactly: green for safe, gold for
       caution, ochre for alert, charcoal for offline, teal for syncing,
       terracotta for protected.
     · The gold rim, the patterned ring and the emboss do NOT. At the
       size a queue needs, a decorated ring is a smudge around a word,
       and every pixel spent on the ring is a pixel not spent on the
       word — which is the part that has to be readable in sunlight.

   COLOUR IS NEVER THE ONLY CHANNEL. Each badge carries its own glyph
   and its own word, so a reader with a red-green deficiency, a
   greyscale print and a regulator's fax all get the same six states.
   That is the same rule the risk scale follows, for the same reason.
   ============================================================ */

import { html, raw } from '../shared/html.js';

/**
 * The six, with the glyph each one carries in the brand artwork.
 *
 * Stroke glyphs at 14px, drawn inline: an icon font would be a request
 * on a cold start, and this is chrome that has to render offline.
 */
export const STATUSES = {
  SAFE: {
    label: 'Safe',
    glyph: '<path d="M4 8.4l3 3 5.5-6"/>',
  },
  CAUTION: {
    label: 'Caution',
    glyph: '<path d="M8 4v5"/><path d="M8 12h.01"/>',
  },
  ALERT: {
    label: 'Alert',
    // The raised hand from the artwork, reduced to a stop.
    glyph: '<path d="M8 3v6M5.2 5.2v3.6M10.8 5.2v3.6"/><path d="M4 9.4a4 4 0 0 0 8 0"/>',
  },
  OFFLINE: {
    label: 'Offline',
    glyph: '<path d="M2.5 6.2a8 8 0 0 1 11 0"/><path d="M5 8.8a4.5 4.5 0 0 1 6 0"/><path d="M8 11.6h.01"/><path d="M2.5 2.5l11 11"/>',
  },
  SYNCING: {
    label: 'Sending',
    glyph: '<path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.6V5h-2.4"/>',
  },
  PROTECTED: {
    label: 'Protected',
    glyph: '<path d="M8 2.6l4.4 1.5v3.6c0 2.6-1.8 4.6-4.4 5.7-2.6-1.1-4.4-3.1-4.4-5.7V4.1z"/>',
  },
};

/**
 * One badge.
 *
 * `status` must be one of the six. An unknown key is a hard failure
 * rather than a blank pill: a status badge that renders empty is a
 * report whose state nobody can read, and silence is the one thing this
 * component must never produce.
 */
export function StatusBadge(status, { label } = {}) {
  const spec = STATUSES[status];
  if (!spec) {
    throw new Error(
      `Unknown status "${status}". The identity defines six: ` +
        `${Object.keys(STATUSES).join(', ')}. Add it there deliberately ` +
        `rather than inventing a seventh at a call site.`
    );
  }

  return html`<span class="badge" data-status="${status}">
    <svg
      class="badge__glyph"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      ${raw(spec.glyph)}
    </svg>
    <span class="badge__label">${label ?? spec.label}</span>
  </span>`;
}

/**
 * The sync state of one queued report, as a badge.
 *
 * The mapping is here rather than at the call site so every screen that
 * shows a report agrees about what its state is called. `syncState`
 * comes from offline.ts and has five values; they do not map one to one
 * onto the identity's six, and the two that differ are the interesting
 * ones:
 *
 *   · `synced` is SAFE and not PROTECTED. The report reached the safety
 *     office; PROTECTED is about confidentiality, which is a different
 *     claim and belongs to the anonymous flag rather than to delivery.
 *   · `conflict` is CAUTION and not ALERT. Nothing failed — the server
 *     has a newer version and a person needs to look. ALERT is reserved
 *     for a report that will not send, because a badge that cries every
 *     time is a badge nobody reads.
 */
export function syncBadge(syncState) {
  switch (syncState) {
    case 'synced':
      return StatusBadge('SAFE', { label: 'Sent' });
    case 'syncing':
      return StatusBadge('SYNCING');
    case 'pending':
      return StatusBadge('OFFLINE', { label: 'Waiting to send' });
    case 'conflict':
      return StatusBadge('CAUTION', { label: 'Needs review' });
    case 'error':
      return StatusBadge('ALERT', { label: 'Could not send' });
    default:
      throw new Error(`Unmapped syncState "${syncState}" — every state a report can hold needs a badge.`);
  }
}
