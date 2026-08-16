/* =====================================================================
   THE OPERATOR'S OWN MARK, FOR THE DOCUMENTS THEY HAND OVER.

   A printed pack goes to a regulator, a board or an insurer, and until
   now every one of them went out under UsalamaSMS's identity. The
   document is the OPERATOR'S — their assessment, their register, their
   risk position — so their mark belongs at the top of it.

   ---------------------------------------------------------------
   STORED AS A DATA URI IN OrgConfig, AND THAT IS A DELIBERATE
   DEPARTURE from where evidence photos go.

   Evidence is many files, several megabytes each, attached to
   individual reports; that belongs in object storage. A logo is ONE
   small image per operator that has to render inside a printed page.
   A data URI in the row the print block already reads:

     · needs no second request while a page is being printed, and a
       print dialog does not wait politely for a network fetch;
     · works from the service worker's cache with no extra plumbing, so
       a pack prints at a remote strip with no signal;
     · is covered by the same tenancy predicate as every other column,
       with no bucket policy to get wrong separately.

   The cost is the row size, which is what the ceiling below is for.

   ---------------------------------------------------------------
   NO SVG. THIS IS THE SECURITY DECISION IN THIS FILE.

   SVG is the obvious format for a logo and it is executable markup. An
   SVG rendered into a page can carry <script>, event handlers and
   external references, and this one would be rendered into the
   operator's OWN pages and printed packs. Accepting it is stored XSS
   with a file picker in front of it, and "we sanitise it" is a claim
   about a parser that has been wrong many times in many products.

   Raster only. A logo that exists as SVG can be exported to PNG by
   whoever supplies it, which is a smaller ask than being confident
   about SVG sanitisation forever.
   ===================================================================== */

/**
 * What a logo may be.
 *
 * WebP is included because it is what a modern export produces and it
 * is a third the weight of the PNG; GIF is not, because an animated
 * logo in a safety document is not a thing anybody needs.
 */
export const LOGO_TYPES: ReadonlyArray<string> = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/**
 * THE CEILING, ON THE ENCODED STRING rather than on the decoded bytes.
 *
 * The encoded form is what is stored, transferred and — the part that
 * matters — parsed into every printed page. Base64 inflates by about a
 * third, so this is roughly 45 KB of image, which is generous for a
 * mark rendered at 90px tall and mean enough that nobody uploads a
 * photograph of their hangar by mistake.
 *
 * The asset budget exists because 3.7 MB of brand masters once began
 * being served to a reporter on one bar of signal. This is the same
 * failure available one tenant at a time, and the same answer: a
 * number, enforced, rather than a hope that people upload small files.
 */
export const LOGO_MAX_CHARS = 60_000;

/** The longest edge, after the client downscales. Print needs no more. */
export const LOGO_MAX_EDGE = 512;

export interface LogoRejection {
  readonly ok: false;
  /** Safe to show a person: says what to do, not what the parser saw. */
  readonly message: string;
}
export interface LogoAcceptance {
  readonly ok: true;
  readonly type: string;
  readonly chars: number;
}
export type LogoVerdict = LogoAcceptance | LogoRejection;

/* A data URI, split into the three things worth checking. Anchored at
   both ends: a pattern that merely FINDS this inside a longer string
   accepts `javascript:alert(1)//data:image/png;base64,AAA`. */
const DATA_URI = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Whether this string may be stored and rendered as an operator's logo.
 *
 * Called on BOTH sides. The client calls it to tell somebody their file
 * is too big before it spends thirty seconds uploading it on a bad
 * link; the server calls it because a client-side check is a courtesy
 * and never a control — the route is reachable with curl.
 */
export function checkLogo(value: unknown): LogoVerdict {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, message: "No image was supplied." };
  }
  if (value.length > LOGO_MAX_CHARS) {
    const kb = Math.round(value.length / 1024);
    return {
      ok: false,
      message:
        `That image is about ${kb} KB encoded, against a ${Math.round(LOGO_MAX_CHARS / 1024)} KB ` +
        `ceiling. It rides on every page this operator prints, so it is kept small on ` +
        `purpose — export it at ${LOGO_MAX_EDGE}px on the longest edge.`,
    };
  }

  const m = DATA_URI.exec(value);
  if (!m) {
    return {
      ok: false,
      message: "That did not arrive as a base64 image. Choose a PNG, JPEG or WebP file.",
    };
  }

  const type = m[1]!;
  if (!LOGO_TYPES.includes(type)) {
    /* SVG gets its own sentence. It is the format somebody is most
       likely to have and the refusal is not arbitrary, so it says why
       rather than listing what is allowed and leaving them guessing. */
    const why =
      type === "image/svg+xml"
        ? "SVG is not accepted anywhere in this product: it is markup that can carry script, " +
          "and this image is rendered into your own pages. Export it as a PNG."
        : `${type} is not accepted.`;
    return { ok: false, message: `${why} Use PNG, JPEG or WebP.` };
  }

  /* Base64 is four characters per three bytes, so a payload whose
     length is not a multiple of four is truncated — which decodes to a
     broken image that renders as nothing on a printed pack, silently. */
  if (m[2]!.length % 4 !== 0) {
    return {
      ok: false,
      message: "That image arrived incomplete. Try uploading it again.",
    };
  }

  return { ok: true, type, chars: value.length };
}
