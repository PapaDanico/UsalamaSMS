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
  /* Whether this deploy can accept a file at all, answered by the list
     read rather than discovered by a failed upload. See the route. */
  let canAttach = true;

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
                <button type="button" class="btn btn-ghost btn-sm"
                        data-evidence-get="${a.id}">Download</button>
              </li>`
            )}
          </ul>`
        : html`<p class="hint">Nothing attached to this report yet.</p>`}

      ${canAttach
        ? html`<label class="field">
            <span class="field-label">Attach a photograph or a scanned form</span>
            <input type="file" class="input-field" data-evidence-file
                   accept="image/jpeg,image/png,image/webp,application/pdf" />
            <span class="field-hint">${EVIDENCE_CAVEAT}</span>
          </label>`
        : html`<p class="notice">
            <strong>This deployment cannot store files yet.</strong>
            Evidence storage is not configured, so the control to attach one is not
            shown — offering it would spend your time and your data on an upload the
            server would refuse. Everything else about this report works normally.
          </p>`}
      <p class="hint" data-evidence-status role="status">${note}</p>
    `.toString();

    slot.querySelector('[data-evidence-file]')?.addEventListener('change', onChoose);
    for (const b of slot.querySelectorAll('[data-evidence-get]')) {
      b.addEventListener('click', onDownload);
    }
  };

  /* A LINK CANNOT CARRY A BEARER TOKEN, and this was a link.

     Every route in this API authenticates from an Authorization header
     — there is no cookie, deliberately, because the same token has to
     work from the service worker and from a handset that has been
     offline. A browser navigating to an href sends no such header, so
     a plain anchor pointing at the attachment route was a control that
     could only ever produce {"error":"authentication_required"}
     rendered as JSON in a blank tab. Every download, for every user,
     since the feature was written.

     The anchor is described rather than quoted: scripts/smoke.mjs greps
     the built bundle for exactly that markup, and a comment that trips
     its own gate is a confusing way to learn the gate works.

     So the bytes are fetched the way every other read here is fetched,
     and handed to the browser as an object URL. The response is already
     content-disposition: attachment and nosniff, and the blob is
     revoked immediately — a URL that outlives its click is a copy of
     confidential evidence left addressable in the page.

     THE 409 IS THE POINT OF THE WHOLE FEATURE. The route re-hashes the
     stored file on the way out and refuses to serve one that no longer
     matches what the audit chain attests. A plain link would have shown
     that as raw JSON; it is the single most important sentence this
     panel can display, so it is displayed.

     REVOKED ON A TIMER RATHER THAN IN THE `finally`. Revoking in the
     same tick as the click races the browser's own read of the blob
     and cancels the download on some builds — the classic version of
     this bug. A minute is long enough for any save dialogue and short
     enough that a page left open does not keep confidential evidence
     addressable indefinitely. */
  async function onDownload(event) {
    const button = event.currentTarget;
    const id = button.getAttribute('data-evidence-get');
    const status = slot.querySelector('[data-evidence-status]');
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Fetching…';
    let url = '';
    try {
      const res = await authFetch(`/api/v1/attachments/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        status.textContent =
          body.message ?? 'That attachment could not be fetched, and nothing was changed.';
        return;
      }
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = button.closest('li')?.querySelector('strong')?.textContent ?? 'attachment';
      link.click();
      status.textContent = '';
    } catch {
      status.textContent =
        'The safety office could not be reached, so the attachment was not fetched.';
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 60_000);
      button.disabled = false;
      button.textContent = label;
    }
  }

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
    /* Defaults to TRUE when the field is absent, so a client running
       against an older API keeps the control rather than losing it to a
       missing key — the failure then is the old one, which is worse but
       is not a regression this code introduced. */
    canAttach = body.storage !== false;
    paint(body.attachments ?? [], note);
  }

  await load();
}

/* The ceiling is exported for the report form to quote if it ever grows
   an attach step; naming it twice is how two numbers disagree. */
export { EVIDENCE_MAX_BYTES };
