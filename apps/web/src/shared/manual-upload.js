/* =====================================================================
   SENDING A MANUAL IN PIECES.

   The API takes a manual in two-megabyte pieces, in order, because a
   Netlify Function refuses a body above about six megabytes and an
   approved SMS manual is routinely bigger. This starts the upload,
   sends each piece — retrying a piece that fails on a bad connection,
   since the server refuses a duplicate or out-of-order piece rather than
   stitching it in twice — and returns the upload id the register entry
   is then created against.

   The file is read a piece at a time with Blob.slice, so a 25 MB manual
   is never held as one base64 string in a phone's memory.
   ===================================================================== */
import { authFetch } from './session.js';
import { MANUAL_TYPES, MANUAL_MAX_BYTES, DOCX_TYPE } from '../../../../packages/shared/src/manual.ts';

const RETRIES = 3;

/** The type the server expects. Some browsers leave a .docx untyped. */
export function manualType(file) {
  if (MANUAL_TYPES.includes(file.type)) return file.type;
  if (/\.docx$/i.test(file.name)) return DOCX_TYPE;
  if (/\.pdf$/i.test(file.name)) return 'application/pdf';
  return file.type || '';
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * @param {File} file
 * @param {(sent: number, total: number) => void} onProgress
 * @returns {Promise<string>} the upload id
 */
export async function uploadManual(file, onProgress = () => {}) {
  const contentType = manualType(file);
  if (!MANUAL_TYPES.includes(contentType)) {
    throw new Error('Manuals are accepted as PDF or Word (.docx).');
  }
  if (file.size > MANUAL_MAX_BYTES) {
    throw new Error(
      `That file is ${(file.size / 1048576).toFixed(1)} MB; manuals are held up to ` +
        `${MANUAL_MAX_BYTES / 1048576} MB.`
    );
  }
  const start = await authFetch('/api/v1/sms/documents/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType, totalBytes: file.size })
  });
  const started = await start.json().catch(() => ({}));
  if (!start.ok) {
    throw new Error(
      started.message ??
        (start.status === 403
          ? 'Your role does not include adding controlled documents.'
          : 'The upload could not be started.')
    );
  }
  const id = started.upload.id;
  const size = started.chunkBytes;
  onProgress(0, file.size);
  for (let at = 0, n = 0; at < file.size; at += size, n++) {
    const data = await toBase64(file.slice(at, at + size));
    let ok = false;
    for (let attempt = 0; attempt < RETRIES && !ok; attempt++) {
      try {
        const res = await authFetch(`/api/v1/sms/documents/uploads/${id}/chunks/${n}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ data })
        });
        // 409 on a retry means the piece DID arrive the first time and
        // only the answer was lost; the server says which piece it wants.
        if (res.ok) ok = true;
        else if (res.status === 409) {
          const body = await res.json().catch(() => ({}));
          ok = body.expected === n + 1;
          if (!ok) throw new Error(body.message ?? 'A piece arrived out of order.');
        } else {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? 'A piece of the file was refused.');
        }
      } catch (err) {
        if (attempt === RETRIES - 1) throw err;
      }
    }
    onProgress(Math.min(at + size, file.size), file.size);
  }
  return id;
}
