/* ============================================================
   THE EVIDENCE ON ONE REPORT: what is attached, and adding to it.

   Dynamically imported by the queue when somebody opens the disclosure,
   because it carries a canvas resizer that only ever runs when a
   photograph is chosen. A ramp agent who opens the queue to READ a
   report should not download it.

   -------------------------------------------------------------
   THE PHOTOGRAPH IS RE-ENCODED HERE, and that does two jobs.

   It strips EXIF — GPS, device, timestamp — because the bytes are new,
   so there is no metadata to carry. And it downscales to the longest
   edge the rule allows, so a reporter on one bar of signal is not
   sending eight megabytes off a sensor to show a cracked fairing.

   WHAT IT CANNOT DO IS SAID ON THE SCREEN. EVIDENCE_CAVEAT is imported
   rather than typed, so this control and the privacy notice cannot
   drift: a face, a registration or a name on a document IN THE FRAME
   survives everything software can do, and the only control is what
   somebody points a camera at.

   PDFs ARE NOT RE-ENCODED. There is no canvas pass for a document, so a
   scanned form goes as it is — which is why the caveat about metadata
   is written to cover photographs specifically rather than claiming
   more than is true.
   ============================================================ */

import { html } from './html.js';
import { authFetch } from './session.js';
import {
  checkEvidence,
  EVIDENCE_CAVEAT,
  EVIDENCE_MAX_EDGE,
  EVIDENCE_MAX_BYTES
} from '../../../../packages/shared/src/evidence.ts';

const kb = (n) => `${Math.round(n / 1024)} KB`;

/** A photograph, downscaled and re-encoded. PDFs pass through. */
async function prepare(file) {
  if (file.type === 'application/pdf') {
    const buf = await file.arrayBuffer();
    return { type: file.type, bytes: buf.byteLength, data: toBase64(buf) };
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    /* Never enlarged: a small photograph scaled up is the same
       photograph, softer, at several times the weight. */
    const scale = longest > EVIDENCE_MAX_EDGE ? EVIDENCE_MAX_EDGE / longest : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    /* JPEG at 0.85: this is a photograph of damage, not a logo, and PNG
       of a camera image is several times the size for no visible gain. */
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    const buf = await blob.arrayBuffer();
    return { type: 'image/jpeg', bytes: buf.byteLength, data: toBase64(buf) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  /* In chunks: String.fromCharCode(...bytes) on a three-megabyte array
     overflows the argument limit and throws, which would look like "the
     file is corrupt" to whoever chose it. */
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function mountEvidence(slot, reportId) {
  const paint = (items, note = '') => {
    slot.innerHTML = html`
      ${items.length
        ? html`<ul class="account-grid picture-grid" role="list">
            ${items.map(
              (a) => html`<li class="fact">
                <strong>${a.label || 'Attachment'}</strong>
                <span>${a.contentType} · ${kb(a.bytes)}</span>
                <span class="queue__code"
                      title="The hash recorded when this was attached. The server checks
                             the stored file against it on every download.">
                  <b>${a.sha256.slice(0, 16)}…</b>
                </span>
                <a href="/api/v1/attachments/${a.id}">Download</a>
              </li>`
            )}
          </ul>`
        : html`<p class="hint">Nothing attached to this report yet.</p>`}

      <label class="field">
        <span class="field-label">Attach a photograph or a scanned form</span>
        <input type="file" class="input-field" data-evidence-file
               accept="image/jpeg,image/png,image/webp,application/pdf" />
        <span class="field-hint">${EVIDENCE_CAVEAT}</span>
      </label>
      <p class="hint" data-evidence-status role="status">${note}</p>
    `.toString();

    slot.querySelector('[data-evidence-file]').addEventListener('change', onChoose);
  };

  async function onChoose(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const status = slot.querySelector('[data-evidence-status]');
    status.textContent = 'Preparing…';
    try {
      const ready = await prepare(file);
      /* THE SAME RULE THE ROUTE USES, applied before the upload so a bad
         link is not spent on a file that will be refused — and applied
         there again regardless, because this one is a courtesy. */
      const verdict = checkEvidence(ready.type, ready.bytes);
      if (!verdict.ok) {
        status.textContent = verdict.message;
        return;
      }
      status.textContent = `Sending ${kb(ready.bytes)}…`;
      const res = await authFetch(`/api/v1/reports/${reportId}/attachments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contentType: ready.type,
          data: ready.data,
          label: file.name.slice(0, 120)
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        /* Charter rule 8: a refused write is REPORTED, and the message
           says whether anything was stored. */
        status.textContent = body.message ?? 'That was not accepted, and nothing was attached.';
        return;
      }
      await load(`Attached. ${kb(verdict.bytes)}.`);
    } catch {
      status.textContent =
        'The safety office could not be reached, and nothing was attached.';
    }
  }

  async function load(note = '') {
    const res = await authFetch(`/api/v1/reports/${reportId}/attachments`);
    if (!res.ok) throw new Error('unreadable');
    const body = await res.json();
    paint(body.attachments ?? [], note);
  }

  await load();
}

/* The ceiling is exported for the report form to quote if it ever grows
   an attach step; naming it twice is how two numbers disagree. */
export { EVIDENCE_MAX_BYTES };
