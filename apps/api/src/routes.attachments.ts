/* =====================================================================
   EVIDENCE ON A REPORT — the upload, the fetch and the removal.

   THE API BROKERS EVERY BYTE. There is no browser client talking to
   storage and no anon key for one to hold; that is the posture the
   whole product is built on and this route does not make an exception
   for files. The service-role key lives in the Netlify environment,
   never in this repository, and the bucket is private.

   ---------------------------------------------------------------
   IT ATTACHES TO A REPORT THAT HAS BEEN SENT, and that is a promise
   being kept rather than a limitation.

   The thing this product is sold on is that a report is recorded on the
   handset before it is anywhere else — filing never waits for signal.
   Attaching a 3 MB photograph to the filing step would put a
   multi-megabyte upload in front of the one action that must work at a
   remote strip on one bar. So evidence is added afterwards, to a report
   the safety office already holds, from the queue.

   ---------------------------------------------------------------
   THE HASH IS COMPUTED HERE, over the exact bytes that are stored.

   That is the whole reason the file travels through this Function
   rather than going straight to storage from the browser on a signed
   URL. A hash the uploader supplied attests to nothing — it is the
   uploader's claim about their own file. This one is the server's
   claim about what it wrote, and the audit chain covers the row it
   sits in, so a file swapped in the bucket later no longer matches.
   ===================================================================== */
import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { can } from "@usalamasms/shared";
import {
  checkEvidence,
  checkEvidenceCount,
  evidenceKey,
  isBase64,
  EVIDENCE_MAX_FILES,
  EVIDENCE_MAX_BODY_BYTES,
} from "../../../packages/shared/src/evidence";
import { prisma, authenticate, appendAudit, tenantWhere } from "./core";

/** Where the files go. Names only — the key itself is an env var. */
const STORAGE_URL = process.env["SUPABASE_URL"] ?? "";
const STORAGE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const BUCKET = process.env["SUPABASE_EVIDENCE_BUCKET"] ?? "evidence";

/**
 * WHETHER THIS DEPLOY CAN STORE A FILE AT ALL.
 *
 * Checked before anything is written, and the refusal says which piece
 * is missing. A deploy with no storage configured must REFUSE rather
 * than record an attachment row pointing at a file that was never
 * written — charter rule 8: a refused write is reported. The opposite
 * failure, a ledger full of rows whose files do not exist, is the kind
 * that is discovered by an inspector asking for the photograph.
 */
function storageReady(): { ok: true } | { ok: false; missing: string } {
  if (!STORAGE_URL) return { ok: false, missing: "SUPABASE_URL" };
  if (!STORAGE_KEY) return { ok: false, missing: "SUPABASE_SERVICE_ROLE_KEY" };
  return { ok: true };
}

const objectUrl = (key: string): string =>
  `${STORAGE_URL.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${key}`;

export async function attachmentRoutes(app: FastifyInstance): Promise<void> {
  const limited = {
    preHandler: [authenticate],
    /* Tighter than the rest of the API on purpose: this is the only
       route that writes megabytes, so it is the only one where a stuck
       retry loop is a bill rather than a log line. */
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  };

  /* ------------------------------ list ------------------------------ */

  app.get("/api/v1/reports/:id/attachments", limited, async (req, reply) => {
    const auth = req.auth!;
    if (!can(auth.role as never, "report.read.org")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { id } = req.params as { id: string };
    const rows = await prisma.reportAttachment.findMany({
      /* tenantWhere FIRST, then the report. A caller who guesses another
         operator's report id gets an empty list rather than its
         evidence. */
      where: { ...tenantWhere(req), reportId: id },
      orderBy: [{ createdAt: "asc" }],
      /* The key is deliberately NOT returned. It is a storage path, and
         a client has no use for one it cannot fetch directly anyway —
         every fetch goes through the route below by row id. */
      select: {
        id: true,
        contentType: true,
        bytes: true,
        sha256: true,
        label: true,
        createdAt: true,
      },
    });
    return reply.send({ attachments: rows, max: EVIDENCE_MAX_FILES });
  });

  /* ----------------------------- upload ----------------------------- */

  app.post("/api/v1/reports/:id/attachments", {
    ...limited,
    /* THE ONLY ROUTE IN THIS PRODUCT THAT IS ALLOWED A BIG BODY, and
       it is sized from the rule rather than chosen.

       server.ts caps JSON at 1 MB for everything, which is right for a
       narrative and a sync batch and was silently wrong here: base64
       costs four characters per three bytes, so this route's own 3 MB
       ceiling needed about 4 MB of request and got a 1 MB one. The
       effective limit was 786 KB — announced as a Fastify parser error
       rather than as any of the sentences evidence.ts writes to explain
       a refusal, and never noticed because nothing ever posted a file
       larger than a few kilobytes.

       A route-level bodyLimit overrides the content-type parser's;
       confirmed by booting Fastify with this exact configuration and
       posting 4.2 MB, which the parser refuses at the default and this
       route accepts. Everything else keeps the 1 MB. */
    bodyLimit: EVIDENCE_MAX_BODY_BYTES,
  }, async (req, reply) => {
    const auth = req.auth!;
    /* The same permission that reads the operator's queue. Somebody who
       can see the report can add evidence to it; a frontline reporter
       who cannot see the queue is not attaching photographs to other
       people's reports. */
    if (!can(auth.role as never, "report.read.org")) {
      return reply.code(403).send({
        error: "forbidden",
        message: "Evidence is attached by the safety office.",
      });
    }

    const ready = storageReady();
    if (!ready.ok) {
      /* NAMES THE VARIABLE, NOT ITS VALUE. */
      return reply.code(503).send({
        error: "storage_unconfigured",
        message:
          `This deploy has no evidence storage configured (${ready.missing} is unset), ` +
          `so nothing was stored and no record was made.`,
      });
    }

    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      contentType?: unknown;
      data?: unknown;
      label?: unknown;
    };

    /* The report must be THIS operator's, and it must exist. Checked
       before anything is decoded, so a wrong id costs nothing. */
    const report = await prisma.safetyReport.findFirst({
      where: { ...tenantWhere(req), id },
      select: { id: true },
    });
    if (!report) return reply.code(404).send({ error: "not_found" });

    const existing = await prisma.reportAttachment.count({
      where: { ...tenantWhere(req), reportId: id },
    });
    const room = checkEvidenceCount(existing);
    if (!room.ok) return reply.code(409).send({ error: "too_many", message: room.message });

    if (typeof body.data !== "string" || body.data.length === 0) {
      return reply.code(400).send({ error: "rejected", message: "No file was supplied." });
    }

    /* CHECKED BEFORE IT IS DECODED, because decoding cannot refuse.
       Buffer.from(x, "base64") never throws — it drops whatever is not
       in the alphabet and returns the rest — so a truncated or mangled
       payload would be stored, hashed and chained as though it were the
       file the reporter chose. The argument is in evidence.ts; what
       matters here is that the refusal happens rather than the decode
       silently succeeding on the wrong bytes. */
    if (!isBase64(body.data)) {
      return reply.code(400).send({
        error: "rejected",
        message:
          "That file did not arrive intact, so nothing was stored. Attach it again — " +
          "if it keeps failing, the connection is dropping part of the upload.",
      });
    }

    /* Decoded before it is measured, because the size that matters is
       the size of the FILE rather than of its encoding. */
    const bytes = Buffer.from(body.data, "base64");

    const verdict = checkEvidence(body.contentType, bytes.byteLength);
    if (!verdict.ok) {
      return reply.code(400).send({ error: "rejected", message: verdict.message });
    }

    const attachmentId = crypto.randomUUID();
    const key = evidenceKey(auth.org, id, attachmentId);
    /* THE SERVER'S HASH, over the bytes it is about to write. */
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    const put = await fetch(objectUrl(key), {
      method: "POST",
      headers: {
        authorization: `Bearer ${STORAGE_KEY}`,
        "content-type": verdict.type,
        /* Never overwrite. A key is a fresh UUID every time, so a
           collision means something is wrong rather than something is
           being replaced, and failing loudly is the right answer. */
        "x-upsert": "false",
      },
      body: new Uint8Array(bytes),
    });

    if (!put.ok) {
      /* NO ROW IS WRITTEN. A ledger entry for a file that does not
         exist is worse than no entry: it is discovered by an inspector
         asking for the photograph. */
      req.log.error({ status: put.status }, "evidence upload failed");
      return reply.code(502).send({
        error: "storage_failed",
        message: "The file could not be stored, so nothing was recorded against the report.",
      });
    }

    const saved = await prisma.reportAttachment.create({
      data: {
        id: attachmentId,
        orgId: auth.org,
        reportId: id,
        key,
        contentType: verdict.type,
        bytes: verdict.bytes,
        sha256,
        /* Display only, and capped. Nothing is ever built from it. */
        label: typeof body.label === "string" ? body.label.slice(0, 120) : null,
        uploadedById: auth.sub,
      },
      select: { id: true, contentType: true, bytes: true, sha256: true, label: true, createdAt: true },
    });

    /* The HASH goes in the chain, never the file. That is what makes a
       later substitution detectable. */
    await appendAudit({
      orgId: auth.org,
      userId: auth.sub,
      action: "report.evidence.add",
      entityType: "ReportAttachment",
      entityId: saved.id,
      detail: { reportId: id, contentType: verdict.type, bytes: verdict.bytes, sha256 },
    });

    return reply.code(201).send({ attachment: saved });
  });

  /* ------------------------------ fetch ------------------------------ */

  app.get("/api/v1/attachments/:id", limited, async (req, reply) => {
    const auth = req.auth!;
    if (!can(auth.role as never, "report.read.org")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { id } = req.params as { id: string };
    const row = await prisma.reportAttachment.findFirst({
      where: { ...tenantWhere(req), id },
      select: { key: true, contentType: true, sha256: true },
    });
    if (!row) return reply.code(404).send({ error: "not_found" });

    const ready = storageReady();
    if (!ready.ok) return reply.code(503).send({ error: "storage_unconfigured" });

    const got = await fetch(objectUrl(row.key), {
      headers: { authorization: `Bearer ${STORAGE_KEY}` },
    });
    if (!got.ok) return reply.code(502).send({ error: "storage_failed" });

    const buf = Buffer.from(await got.arrayBuffer());

    /* THE HASH IS CHECKED ON THE WAY OUT, not only on the way in.
       Storage is a separate system with its own access path; if what
       comes back is not what the chain attests, saying so is the entire
       value of having stored a hash. Serving it silently would make the
       column decorative. */
    const actual = createHash("sha256").update(buf).digest("hex");
    if (actual !== row.sha256) {
      req.log.error({ id }, "evidence hash mismatch");
      return reply.code(409).send({
        error: "tampered",
        message:
          "The stored file does not match the hash recorded when it was attached. It has " +
          "not been served. Treat this as evidence of a change to the stored copy.",
      });
    }

    return reply
      .header("content-type", row.contentType)
      /* attachment, never inline: nothing uploaded by a user is
         rendered in this application's own origin. */
      .header("content-disposition", "attachment")
      .header("x-content-type-options", "nosniff")
      .send(buf);
  });
}
