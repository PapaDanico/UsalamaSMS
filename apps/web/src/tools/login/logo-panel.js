/* ============================================================
   THE OPERATOR'S MARK, ON THE DOCUMENTS THEY HAND OVER.

   Every printed pack — the SRA, the register, the indicator table, the
   SMS record — went out under UsalamaSMS's identity. The document is
   the operator's: their assessment, their risk position, their name on
   the line to a regulator. Their mark belongs at the top of it.

   -------------------------------------------------------------
   THE FILE IS RE-ENCODED HERE, NOT UPLOADED AS CHOSEN, and that does
   three jobs with one canvas pass:

     · IT STRIPS METADATA. A logo exported from a design tool carries
       author, software, sometimes a file path with somebody's name in
       it. Drawing to a canvas and reading it back keeps the pixels and
       nothing else — there is no metadata to carry because the bytes
       are new.
     · IT ENFORCES THE CEILING BEFORE THE UPLOAD. Somebody on one bar
       of signal should not spend thirty seconds sending a file the
       server is going to refuse.
     · IT NORMALISES THE FORMAT. Whatever was chosen becomes a PNG,
       which is one of the three the server accepts, so a TIFF or a
       BMP that the browser can decode still works rather than being
       rejected for a reason the person cannot act on.

   SVG IS REFUSED RATHER THAN CONVERTED. The browser could rasterise it,
   and the reason not to is not the pixels: accepting SVG anywhere
   teaches that SVG is acceptable, and the server refuses it because it
   is markup that can carry script into the operator's own pages. One
   answer in both places.

   -------------------------------------------------------------
   LAZY. It sits beside account-home.js and profile.js for the same
   reason: the account screen is EAGER, because signing in is what
   sends a queued report, and a canvas resizer is not something a ramp
   agent filing a hazard should parse before first paint.
   ============================================================ */

import { html } from '../../shared/html.js';
import { authFetch } from '../../shared/session.js';
import {
  checkLogo,
  LOGO_MAX_EDGE,
  LOGO_MAX_CHARS
} from '../../../../../packages/shared/src/logo.ts';

/** The identity cache print-id.js reads. Cleared when the mark changes. */
const ORG_KEY = 'usalamasms.org';

/**
 * A chosen file, as a capped PNG data URI.
 *
 * Rejects rather than rasterises SVG — see the note above. Everything
 * else the browser can decode is drawn to a canvas at no more than
 * LOGO_MAX_EDGE on its longest side, preserving aspect.
 */
async function toDataUri(file) {
  if (file.type === 'image/svg+xml' || /\.svgz?$/i.test(file.name)) {
    throw new Error(
      'SVG is not accepted: it is markup that can carry script, and this image is ' +
        'rendered into your own pages. Export it as a PNG.'
    );
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();

    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    /* Never scaled UP. A 90px logo enlarged to 512 is the same logo
       with soft edges and four times the bytes. */
    const scale = longest > LOGO_MAX_EDGE ? LOGO_MAX_EDGE / longest : 1;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    /* Revoked in `finally`, so a file the browser could not decode does
       not leak the object URL for the life of the tab. */
    URL.revokeObjectURL(url);
  }
}

export async function render(outlet) {
  let current = null;
  try {
    const res = await authFetch('/api/v1/config');
    if (res.ok) current = (await res.json()).logo ?? null;
  } catch {
    /* The upload still works with no signal to read the current one —
       and saying "could not load" above a control that functions would
       be noise. The preview simply starts empty. */
  }

  outlet.innerHTML = html`
    <section class="panel wrap">
      <header class="page-head">
        <span class="eyebrow">Your operator</span>
        <h1>The mark on your documents</h1>
        <p class="lede">
          Every pack this product prints — a risk assessment, the register, the
          indicator table — carries your operator's name. Add your mark and it
          carries that too, so what reaches a regulator is your document rather
          than ours.
        </p>
      </header>

      <div class="card">
        <p class="hint" id="logo-preview-wrap">
          ${current
            ? html`<img id="logo-preview" src="${current}" alt="The mark currently set"
                     style="max-height:64px;max-width:220px;display:block" />`
            : html`<span id="logo-preview-empty">No mark set. Packs print with your
                     operator's name alone.</span>`}
        </p>

        <label class="field">
          <span class="field-label">Choose an image</span>
          <input type="file" id="logo-file" class="input-field"
                 accept="image/png,image/jpeg,image/webp" />
          <span class="field-hint">
            PNG, JPEG or WebP. It is resized to ${LOGO_MAX_EDGE}px on the longest edge
            and re-encoded here, which also removes any metadata the file carried —
            so the author and software fields in a design export do not travel with
            it. ${Math.round(LOGO_MAX_CHARS / 1024)} KB ceiling once encoded, because
            it rides on every page you print.
          </span>
        </label>

        <p class="hint" id="logo-status" role="status"></p>
        <p class="mat-actions">
          <button type="button" class="btn btn-primary" id="logo-save">Save the mark</button>
          <button type="button" class="btn btn-ghost" id="logo-clear">Remove it</button>
        </p>
      </div>
    </section>
  `.toString();

  const status = outlet.querySelector('#logo-status');
  const file = outlet.querySelector('#logo-file');
  let pending = null;

  /* THE CACHE print-id.js READS. Without this a newly saved mark does
     not appear on a printed pack until that cache expires — and the
     person who just uploaded it is precisely the person about to
     print. */
  const forgetCachedOrg = () => {
    try {
      localStorage.removeItem(ORG_KEY);
    } catch {
      /* Private mode, or storage full. The mark is saved either way;
         it appears on the next load rather than this one. */
    }
  };

  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    status.textContent = 'Reading…';
    try {
      const uri = await toDataUri(chosen);
      /* THE SAME FUNCTION THE SERVER USES. Told here so somebody is not
         waiting on an upload to learn it is too big — and refused there
         regardless, because this one is a courtesy. */
      const verdict = checkLogo(uri);
      if (!verdict.ok) {
        pending = null;
        status.textContent = verdict.message;
        return;
      }
      pending = uri;
      const wrap = outlet.querySelector('#logo-preview-wrap');
      wrap.innerHTML =
        `<img id="logo-preview" alt="The mark about to be saved" ` +
        `style="max-height:64px;max-width:220px;display:block" src="${uri}">`;
      status.textContent = `Ready to save — ${Math.round(verdict.chars / 1024)} KB encoded.`;
    } catch (err) {
      pending = null;
      status.textContent = err?.message ?? 'That file could not be read as an image.';
    }
  });

  outlet.querySelector('#logo-save').addEventListener('click', async () => {
    if (!pending) {
      status.textContent = 'Choose an image first.';
      return;
    }
    status.textContent = 'Saving…';
    try {
      const res = await authFetch('/api/v1/config/logo', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ logo: pending })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        status.textContent = body.message ?? 'That was not accepted, and nothing changed.';
        return;
      }
      forgetCachedOrg();
      status.textContent = 'Saved. Packs you print from now on carry it.';
    } catch {
      status.textContent =
        'The safety office could not be reached, and the mark has not changed.';
    }
  });

  outlet.querySelector('#logo-clear').addEventListener('click', async () => {
    status.textContent = 'Removing…';
    try {
      /* EXPLICIT null, which is what the route requires to clear. An
         omitted key means "a client that does not know about this
         field" and leaves the mark alone. */
      const res = await authFetch('/api/v1/config/logo', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ logo: null })
      });
      if (!res.ok) {
        status.textContent = 'That was not accepted, and the mark has not changed.';
        return;
      }
      pending = null;
      forgetCachedOrg();
      outlet.querySelector('#logo-preview-wrap').textContent =
        'No mark set. Packs print with your operator’s name alone.';
      status.textContent = 'Removed.';
    } catch {
      status.textContent =
        'The safety office could not be reached, and the mark has not changed.';
    }
  });
}
