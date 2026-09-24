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

/* THE ENCODING LADDER, and the defect it exists to fix.

   This used to be one line — `canvas.toDataURL('image/png')` at 512px
   — and then checkLogo() refused what came back. Measured in Chromium
   with a logo carrying a gradient and anti-aliased type, which is what
   an operator's mark actually is:

     PNG at 512px   431,818 characters   against a 60,000 ceiling
     PNG at 256px   130,294 characters   still refused

   So a real logo was refused SEVEN TIMES OVER, and the refusal said
   "export it at 512px on the longest edge" — which is precisely what
   this function had just done. An operator who followed the advice
   exactly got the identical message, with nothing left to try. That is
   how "we cannot upload our logo" happens with every check passing:
   the ceiling was enforced, the client simply never tried to meet it.

   PNG IS LOSSLESS, AND A LOGO IS NOT ALWAYS FLAT. The format is right
   for a two-colour mark and catastrophic for a gradient, where it
   stores every dithered pixel exactly. WebP at the same 512px comes
   back at 45,395 characters — the same image, under the ceiling, with
   an alpha channel intact.

   So the ladder tries lossless first and only then gives ground, in
   this order, stopping at the first rung that fits:

     · PNG, because a flat mark encodes small and perfectly;
     · WebP down a short quality ramp, which keeps transparency;
     · JPEG, ONLY where the image has no transparency to lose;
     · and then the same ladder at a smaller edge.

   QUALITY IS SPENT BEFORE PIXELS, deliberately. A 512px mark at WebP
   0.8 prints better than a 256px lossless one, because print is where
   this image is going and 18mm of paper wants the pixels.

   AN UNSUPPORTED FORMAT IS SILENT, which is the trap in this API:
   `toDataURL('image/webp')` on an engine without a WebP encoder
   returns a PNG and does not say so. Every rung therefore checks the
   type it got back rather than the type it asked for. */
const EDGES = [LOGO_MAX_EDGE, 384, 320, 256];
const RUNGS = [
  { type: 'image/png' },
  { type: 'image/webp', quality: 0.92 },
  { type: 'image/webp', quality: 0.85 },
  { type: 'image/webp', quality: 0.75 },
  { type: 'image/webp', quality: 0.65 },
  { type: 'image/jpeg', quality: 0.9, opaqueOnly: true },
  { type: 'image/jpeg', quality: 0.8, opaqueOnly: true },
  { type: 'image/jpeg', quality: 0.7, opaqueOnly: true }
];

/** Whether any pixel is less than fully opaque. */
function hasAlpha(ctx, width, height) {
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
    return false;
  } catch {
    /* A browser that refuses getImageData tells us nothing, and the
       safe assumption is that transparency IS present: it costs a
       JPEG rung, and guessing the other way flattens a transparent
       mark onto white without being asked. */
    return true;
  }
}

/**
 * A chosen file, as a data URI that fits under the ceiling.
 *
 * Rejects rather than rasterises SVG — see the note above. Everything
 * else the browser can decode is drawn to a canvas at no more than
 * LOGO_MAX_EDGE on its longest side, preserving aspect, and then
 * encoded down the ladder above until it fits.
 *
 * Returns the URI and how it was reached, so the screen can say what
 * it did rather than silently handing back something other than what
 * was chosen.
 */
async function toDataUri(file) {
  if (file.type === 'image/svg+xml' || /\.svgz?$/i.test(file.name)) {
    throw new Error(
      'SVG is not accepted: it is markup that can carry script, and this image is ' +
        'rendered into your own pages. Export it as a PNG.'
    );
  }

  const url = URL.createObjectURL(file);
  let img;
  try {
    img = new Image();
    img.src = url;
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('That file could not be read as an image. Choose a PNG, JPEG or WebP.');
  }

  try {
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    let transparent = null;
    let lastEffective = null;

    for (const edge of EDGES) {
      /* THE SIZE THIS PASS ACTUALLY PRODUCES, which is not the edge
         when the source is smaller than it — a mark is never scaled
         UP, because a 90px logo enlarged to 512 is the same logo with
         soft edges and four times the bytes.

         SKIPPING A REPEAT IS WHAT REPLACED A `break`, and the break
         was wrong. It read `if (longest <= edge) break` at the BOTTOM
         of the first pass, where `edge` is still LOGO_MAX_EDGE — so
         any source at or under 512px left the loop after one pass and
         384, 320 and 256 were never tried. A 500px mark that missed
         every rung at native size was refused with a message saying it
         would not fit "even reduced and re-compressed", having never
         been reduced once. Measured: per-pixel noise at 500px misses
         every rung at native size and fits at 256.

         Comparing the EFFECTIVE size instead is correct in both
         directions: a 90px mark still encodes once, because every edge
         describes the same canvas, and a 500px one walks 500, 384, 320
         and 256 as it should. */
      const effective = Math.min(longest, edge);
      if (effective === lastEffective) continue;
      lastEffective = effective;
      const scale = effective / longest;

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      /* Read once, off the first canvas drawn. Transparency is a
         property of the source, not of the rung. */
      transparent ??= hasAlpha(ctx, canvas.width, canvas.height);

      for (const rung of RUNGS) {
        if (rung.opaqueOnly && transparent) continue;
        const uri = canvas.toDataURL(rung.type, rung.quality);
        if (uri.length <= LOGO_MAX_CHARS) {
          /* THE TYPE IS READ OFF THE RESULT, NOT OFF THE REQUEST, and
             that is the whole handling of the silent fallback rather
             than a guard beside it. `toDataURL` on an engine with no
             encoder for the type asked for returns a PNG and does not
             say so, so `rung.type` is a claim and the URI is the fact.
             Reported this way the claim cannot be wrong.

             THE GUARD THAT USED TO SIT HERE — skip any candidate whose
             type came back different — was UNREACHABLE, and the
             mutation matrix is what said so: deleting it changed
             nothing, because PNG is the first rung at every edge. A
             silently-substituted PNG is byte-identical to the PNG this
             loop has already tried and rejected at this size, so it is
             over the ceiling too and falls through on length alone.
             A condition that looks load-bearing and cannot execute is
             a check that cannot fail, which this repository has
             removed rather than kept before now. */
          const actual = /^data:([^;]+);/.exec(uri)?.[1] ?? rung.type;
          return { uri, type: actual, edge: Math.max(canvas.width, canvas.height) };
        }
      }

      /* Scaling down is the last thing tried and the only thing that
         loses detail irrecoverably, so it happens once per edge after
         every quality has been spent at that size. The loop ends when
         EDGES runs out; nothing breaks out of it early. */
    }

    throw new Error(
      `That image will not fit under the ${Math.round(LOGO_MAX_CHARS / 1024)} KB ceiling ` +
        'even reduced and re-compressed, which usually means it is a photograph rather ' +
        'than a mark. A logo on a plain or transparent background will fit easily.'
    );
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
      const { uri, type, edge } = await toDataUri(chosen);
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
      /* WHAT IT ACTUALLY DID, not what was chosen. The ladder may have
         changed the format and the size to fit the ceiling, and the
         preview above is the evidence it still looks right — so the
         line under it says which rung it landed on rather than leaving
         somebody to wonder why their PNG came back as WebP. */
      status.textContent =
        `Encoded — ${Math.round(verdict.chars / 1024)} KB, ` +
        `${type.replace('image/', '').toUpperCase()} at ${edge}px. Saving…`;
      await save();
    } catch (err) {
      pending = null;
      status.textContent = err?.message ?? 'That file could not be read as an image.';
    }
  });

  /* SAVED ON CHOICE, not on a second press. Production recorded no
     successful save from any operator, ever — three removals and nothing
     else — while every mark driven locally encoded and saved. The one
     step that separates the two is a button pressed after the preview,
     and a person who has just watched their logo appear reasonably
     believes it is done. Choosing a file now saves it; the button stays
     as the retry when the network drops. */
  const save = async () => {
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
      const wrap = outlet.querySelector('#logo-preview-wrap');
      const img = wrap.querySelector('img');
      if (img) img.alt = 'The mark currently set';
      status.textContent = 'Saved. Packs you print from now on carry it.';
    } catch {
      status.textContent =
        'The safety office could not be reached, and the mark has not changed. ' +
        'Press "Save the mark" to try again.';
    }
  };

  outlet.querySelector('#logo-save').addEventListener('click', () => void save());

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
