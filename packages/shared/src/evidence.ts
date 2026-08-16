/* =====================================================================
   EVIDENCE ATTACHED TO A REPORT — a photograph of the damage, a scan
   of a completed form, the page of a techlog somebody wrote on.

   A narrative describes a dented cowling. A photograph of the dented
   cowling is what an investigator can assess. This is the difference
   between a report that asserts something and a report that shows it.

   ---------------------------------------------------------------
   THIS FILE IS THE RULE, AND IT RUNS ON BOTH SIDES. The report form
   calls it so a reporter at a strip is told before a bad link spends
   four minutes on a file that will be refused; the route calls it
   because the route is reachable with curl and a client-side check is
   a courtesy, never a control.

   ---------------------------------------------------------------
   WHY THE LIMITS ARE WHAT THEY ARE.

   Not the logo's limits. A logo is one small image per operator that
   rides in a printed page; evidence is several files per report,
   photographed on a handset, and the whole point is that somebody can
   see the damage. So it is megabytes rather than kilobytes, it lives
   in object storage rather than in a column, and it is downscaled on
   the device rather than refused for being camera-sized.

   PDF IS ACCEPTED and SVG is not, which looks inconsistent and is not.
   A scanned form arrives as a PDF and there is no substitute for it.
   A PDF is rendered by the browser's sandboxed viewer or downloaded;
   it is never parsed into the page's own DOM. An SVG rendered inline
   IS the page's DOM, which is why the logo refuses it — and evidence
   refuses it too, for the same reason plus one more: nothing that
   arrives as evidence should be a format whose whole nature is
   "executable markup that looks like a picture".
   ===================================================================== */

/** What may be attached. */
export const EVIDENCE_TYPES: ReadonlyArray<string> = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/**
 * PER FILE, in bytes, AFTER the device has downscaled it.
 *
 * A modern handset photograph is 3-8 MB straight off the sensor and
 * about 400 KB at 1600px on the longest edge, which is more than enough
 * to see a crack in a fairing.
 *
 * 3 MB IS SET BY THE TRANSPORT, NOT BY TASTE, and the transport is set
 * by the security posture. Every read and write in this product goes
 * through the API — there is no browser client talking to storage
 * directly, and no anon key for one to hold. So the bytes arrive
 * base64-encoded in a request to a Netlify Function, which caps a
 * payload at 6 MB; base64 inflates by a third, so 3 MB of file is
 * about 4 MB on the wire with room for the rest of the request.
 *
 * The alternative is a signed URL letting the browser PUT straight to
 * storage, which lifts the ceiling and costs the thing that makes this
 * evidence: the API would never see the bytes, so it could not hash
 * them, so `sha256` would be a number the CLIENT asserted about a file
 * nobody else read. A hash the uploader chose attests to nothing.
 *
 * 3 MB is a downscaled photograph several times over, and a scanned
 * form at a sane resolution. If a genuine need for larger files
 * appears, the answer is a signed URL PLUS a server-side hash pass
 * over the stored object — not raising this number.
 */
export const EVIDENCE_MAX_BYTES = 3 * 1024 * 1024;

/** The longest edge a photograph is reduced to on the device. */
export const EVIDENCE_MAX_EDGE = 1600;

/**
 * PER REPORT.
 *
 * Not a storage limit — it is a limit on what one person can attach in
 * one filing, which is the thing an unbounded loop or a stuck retry
 * would otherwise turn into a bill. Six covers the damage from four
 * angles plus the paperwork.
 */
export const EVIDENCE_MAX_FILES = 6;

/**
 * WHAT STRIPPING METADATA DOES NOT DO, said in the words the reporter
 * sees.
 *
 * The upload strips EXIF — GPS, device, timestamp — by re-encoding
 * through a canvas. It cannot do anything about what is IN the frame,
 * and this product's whole posture on de-identification would be a lie
 * if the screen implied otherwise. A face, a registration, a name on a
 * hi-vis vest, a document on a desk behind the subject: all of that
 * survives, and the only control is the person deciding what to
 * photograph.
 *
 * Held here rather than typed into the form so the privacy notice and
 * the upload control cannot drift apart.
 */
export const EVIDENCE_CAVEAT =
  "Location, device and timestamp are removed from photographs before they leave " +
  "this handset. What is IN the picture is not: a face, a registration or a name on " +
  "a document stays in it. Photograph the hazard, not the people.";

export interface EvidenceRejection {
  readonly ok: false;
  readonly message: string;
}
export interface EvidenceAcceptance {
  readonly ok: true;
  readonly type: string;
  readonly bytes: number;
}
export type EvidenceVerdict = EvidenceAcceptance | EvidenceRejection;

/**
 * Whether one file may be attached.
 *
 * `type` and `bytes` rather than the file itself, so this is callable
 * from the route — which has neither a File nor a DOM — against exactly
 * the same rule the form applied.
 */
export function checkEvidence(type: unknown, bytes: unknown): EvidenceVerdict {
  if (typeof type !== "string" || !EVIDENCE_TYPES.includes(type)) {
    const named = typeof type === "string" && type.length > 0 ? type : "That file";
    const why =
      type === "image/svg+xml"
        ? "SVG is markup that can carry script rather than a picture, and it is not " +
          "accepted anywhere in this product."
        : `${named} is not a kind of file this accepts.`;
    return {
      ok: false,
      message: `${why} Attach a JPEG, PNG or WebP photograph, or a PDF of a form.`,
    };
  }

  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return { ok: false, message: "That file appears to be empty." };
  }

  if (bytes > EVIDENCE_MAX_BYTES) {
    const mb = (bytes / 1024 / 1024).toFixed(1);
    const cap = Math.round(EVIDENCE_MAX_BYTES / 1024 / 1024);
    return {
      ok: false,
      message:
        `That file is ${mb} MB, against a ${cap} MB limit per attachment. A photograph ` +
        `is reduced automatically; a scan this large usually means it was made at a ` +
        `higher resolution than a form needs.`,
    };
  }

  return { ok: true, type, bytes };
}

/**
 * Whether another file may be added to a report that already has some.
 *
 * Separate from checkEvidence because it fails for a different reason
 * and has to say so: "this file is wrong" and "you have enough files"
 * are not the same sentence, and a reporter told the first when the
 * second is true will keep trying different photographs.
 */
export function checkEvidenceCount(existing: number): EvidenceVerdict {
  if (existing >= EVIDENCE_MAX_FILES) {
    return {
      ok: false,
      message:
        `A report carries up to ${EVIDENCE_MAX_FILES} attachments. Remove one before ` +
        `adding another, or file what is genuinely a second occurrence separately.`,
    };
  }
  return { ok: true, type: "", bytes: 0 };
}

/**
 * A storage key that cannot escape its own operator.
 *
 * TENANCY IN THE PATH AS WELL AS IN THE QUERY. The route already scopes
 * every read by orgId, and this makes a bug in that scoping insufficient
 * on its own: a key is `<orgId>/<reportId>/<id>`, so a caller who
 * somehow obtained another operator's attachment row still cannot use
 * its key against their own prefix.
 *
 * The pieces are UUIDs from the database, never anything a caller
 * supplied — no filename reaches this. A filename is attacker-chosen
 * text and `../` in one is how a storage path becomes somebody else's.
 */
export function evidenceKey(orgId: string, reportId: string, id: string): string {
  for (const part of [orgId, reportId, id]) {
    if (!/^[0-9a-f-]{36}$/i.test(part)) {
      throw new Error(
        "An evidence key is built from three UUIDs and nothing else. Something that " +
          "was not a UUID reached it, which means a caller-supplied value did.",
      );
    }
  }
  return `${orgId}/${reportId}/${id}`;
}
