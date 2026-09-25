// =====================================================================
// UsalamaSMS API — the other eight Annex 19 elements.
//
// /coverage has told operators for months that this product can SCORE
// elements 1.1 to 1.5, 3.3, 4.1 and 4.2 and cannot DO them. These
// routes are the difference, and they are deliberately boring: every
// one is org-scoped in the WHERE clause, permission-gated per action,
// and appends to the audit chain inside the same transaction as the
// write.
//
// WHAT IS NOT BORING, and is the reason each element has its own
// handler rather than one generic CRUD factory:
//
//   · a safety policy is SIGNED by the accountable executive and by
//     nobody else, and signing is a different act from drafting;
//   · a finding can be closed and still not verified, and an operator
//     who conflates the two ends up with a closed finding that never
//     worked;
//   · feedback to a reporter must never attach to an anonymous report,
//     because a row joining the two is the re-identification the sync
//     path was fixed to prevent;
//   · a superseded policy is not edited, it is superseded — the
//     question an auditor asks is what it said when the decision was
//     taken.
//
// A generic factory would have expressed none of those, and each one is
// the whole point of the element it belongs to.
// =====================================================================
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { can, type Permission } from "@usalamasms/shared";
import {
  requiredFor,
  gapsFor,
  unrecognisedIn,
  CURRICULUM_VERIFIED_AGAINST_PRIMARY,
  standingOf,
  daysUntilExpiry,
  TRAINING_DUE_SOON_DAYS,
  CURRICULUM_INSTRUMENT,
} from "../../../packages/shared/src/curriculum";
import { prisma, authenticate, appendAuditTx, tenantWhere } from "./core";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  checkEvidence, isBase64, EVIDENCE_MAX_BODY_BYTES,
} from "../../../packages/shared/src/evidence";
import {
  checkManual, MANUAL_KINDS, MANUAL_CHUNK_BYTES, MANUAL_MAX_BYTES,
  MANUAL_MAX_CHUNKS, MANUAL_TYPES, MANUAL_UPLOAD_TTL_MS, type ManualKind,
  searchManual, searchTerms,
} from "../../../packages/shared/src/manual";
import { parseManual } from "./manual-parse";

/* The file and the extracted text are never part of a list or a create
   response: one manual can be 25 MB of bytes and 2 MB of text, and the
   register is read on every visit to /sms. Downloaded and analysed
   through their own routes. */
const HEAVY = { data: true, extractedText: true } as const;

const LIST_LIMIT = 200;

/** Refuse an action the caller's role does not hold, before any work. */
function guard(role: string, permission: Permission): boolean {
  return can(role as never, permission);
}

const iso = z.string().datetime({ offset: true }).or(z.string().date());
const toDate = (s: string | undefined | null): Date | null => (s ? new Date(s) : null);

/* ------------------------------- schemas ------------------------------ */

/* Regulation 13's seven fields — the six of 13(3) plus how 13(2)'s
   protection is afforded. All optional: an operator part-way through
   defining its scheme is a real state, and a required set would invite
   placeholder text, which reads as answered where a blank reads as
   missing. Capped rather than unbounded because these are rendered. */
const VoluntaryInput = z
  .object({
    objective: z.string().trim().max(4000).optional(),
    scope: z.string().trim().max(4000).optional(),
    whoMayReport: z.string().trim().max(4000).optional(),
    whenToReport: z.string().trim().max(4000).optional(),
    howProcessed: z.string().trim().max(4000).optional(),
    contactPost: z.string().trim().max(4000).optional(),
    protection: z.string().trim().max(4000).optional(),
  })
  .refine((v) => Object.values(v).some((x) => typeof x === "string" && x.length > 0), {
    message: "Send at least one field. An empty write defines nothing and would still audit.",
  });

const PolicyDraft = z.object({
  statement: z.string().min(50).max(20000),
  effectiveFrom: iso.optional(),
});

const AccountabilityInput = z.object({
  post: z.string().min(2).max(120),
  responsibility: z.string().min(5).max(2000),
  elementId: z.string().max(8).optional(),
});

const AppointmentInput = z.object({
  post: z.string().min(2).max(120),
  userId: z.string().uuid(),
  appointedOn: iso,
  letterRef: z.string().max(120).optional(),
});

const ExerciseInput = z.object({
  scenario: z.string().min(10).max(4000),
  heldOn: iso,
  participants: z.string().min(2).max(2000),
  findings: z.string().min(5).max(8000),
  planUpdated: z.boolean().default(false),
});

const DocumentInput = z.object({
  title: z.string().min(3).max(200),
  reference: z.string().min(1).max(80),
  version: z.string().min(1).max(40),
  reviewBy: iso.optional(),
  /* THE DOCUMENT ITSELF, and it stays OPTIONAL. A register entry for a
     manual held elsewhere is still a true register entry, and refusing
     one would push an operator's real revisions out of the register
     rather than into it. The screen says which rows carry a file. */
  contentType: z.string().max(120).optional(),
  data: z.string().max(EVIDENCE_MAX_BODY_BYTES).optional(),
  filename: z.string().max(160).optional(),
  /* A MANUAL, uploaded in chunks first. When present the file comes from
     that upload rather than from `data`, and is parsed on the way in. */
  uploadId: z.string().uuid().optional(),
  kind: z.enum(MANUAL_KINDS.map((k) => k.id) as [ManualKind, ...ManualKind[]]).optional(),
});

const UploadStart = z.object({
  filename: z.string().min(1).max(160),
  contentType: z.string().max(120),
  totalBytes: z.number().int().positive().max(MANUAL_MAX_BYTES),
});

const FindingInput = z.object({
  auditRef: z.string().min(1).max(80),
  finding: z.string().min(10).max(8000),
  elementId: z.string().max(8).optional(),
  severity: z.enum(["NONCONFORMITY", "OBSERVATION", "IMPROVEMENT"]).default("OBSERVATION"),
  ownerPost: z.string().min(2).max(120),
  dueBy: iso.optional(),
});

const FindingClose = z.object({
  correctiveAction: z.string().min(10).max(8000),
});

const TrainingInput = z.object({
  userId: z.string().uuid(),
  course: z.string().min(2).max(200),
  completedOn: iso,
  expiresOn: iso.optional(),
});

const CommunicationInput = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(10).max(20000),
  reportId: z.string().uuid().optional(),
});

/* ------------------------------- routes ------------------------------- */

export async function smsRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };
  const limited = { ...auth, config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };

  /* =====================================================================
     ELEMENT 1.1 — the safety policy.
     ===================================================================== */

  /* =====================================================================
     REGULATION 13 — the voluntary reporting system's own definition.

     13(3) requires a service provider's voluntary system to DEFINE six
     things; 13(2) requires it to be non-punitive and to afford
     protection to its sources. The product has offered a "voluntary and
     confidential" report type since the reporting form was built and
     stated none of it. The requirement text lives in
     packages/shared/src/voluntary.ts and is quoted on /methodology;
     this is where an operator's own answers are kept.

     READ IS document.read, WRITE IS policy.draft. Deliberately not a
     new permission: defining the scheme is the same act as drafting the
     policy that describes it, by the same post, and inventing a
     permission for one table is how a matrix stops being reviewable.

     UPSERT RATHER THAN CREATE, because there is exactly one scheme per
     operator and the second POST is an edit, not a second scheme. The
     unique constraint on orgId enforces that in the database as well —
     a scheme defined twice and differently is what an inspector finds.

     PARTIAL WRITES ARE ACCEPTED. An operator part-way through defining
     its scheme is a real state, and refusing anything short of all six
     would either block them recording what they have or invite
     placeholder text. Which of the six are still undefined is computed
     by unanswered() from the values, never stored — so the count cannot
     disagree with the fields it describes.
     ===================================================================== */

  app.get("/api/v1/sms/voluntary", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "document.read")) return reply.code(403).send({ error: "forbidden" });
    const scheme = await prisma.voluntaryScheme.findFirst({ where: tenantWhere(req) });
    return reply.send({ scheme: scheme ?? null });
  });

  app.post("/api/v1/sms/voluntary", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "policy.draft")) return reply.code(403).send({ error: "forbidden" });
    const body = VoluntaryInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_voluntary_scheme" });

    /* Trimmed, and narrowed to strings.

       AN EARLIER COMMENT HERE CLAIMED THIS GUARDED AGAINST SPREADING
       THE PARSED BODY WHOLESALE — that editing the objective would
       otherwise erase the contacting manager. That is not true, and
       the mutation proved it: zod's `.optional()` OMITS an absent key
       rather than setting it to undefined, so the naive spread carries
       only the fields the caller actually sent and Prisma leaves the
       rest alone. The protection comes from the schema, not from this
       loop, and saying otherwise would have left the next person
       defending a line that does nothing.

       What the loop does do is trim, and refuse anything that is not a
       string. The property it was wrongly credited with is real and
       worth keeping — it is asserted in the integration suite against
       the ROUTE rather than against this loop, so it stays true however
       this is written. */
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.data)) {
      if (typeof v === "string") data[k] = v.trim();
    }

    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.voluntaryScheme.upsert({
        where: { orgId: req.auth!.org },
        create: { orgId: req.auth!.org, ...data },
        update: data,
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "voluntary.define",
        entityType: "VoluntaryScheme",
        entityId: row.id,
        detail: { defined: Object.keys(data) },
      });
      return row;
    });

    return reply.send({ scheme: saved });
  });

  app.get("/api/v1/sms/policy", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "document.read")) return reply.code(403).send({ error: "forbidden" });
    const rows = await prisma.safetyPolicy.findMany({
      where: tenantWhere(req),
      orderBy: { version: "desc" },
      take: LIST_LIMIT,
      include: { signedBy: { select: { name: true, role: true } }, _count: { select: { reads: true } } },
    });
    return reply.send({ policies: rows });
  });

  app.post("/api/v1/sms/policy", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "policy.draft")) return reply.code(403).send({ error: "forbidden" });
    const body = PolicyDraft.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_policy" });

    const created = await prisma.$transaction(async (tx) => {
      /* SUPERSEDED, NOT EDITED. A safety policy rewritten in place has no
         history, and the question an auditor asks is what it said when
         the decision was taken. The previous version keeps its signature
         and its dates; this one starts unsigned. */
      const current = await tx.safetyPolicy.findFirst({
        where: { orgId: req.auth!.org, supersededOn: null },
        orderBy: { version: "desc" },
      });
      if (current) {
        await tx.safetyPolicy.update({
          where: { id: current.id },
          data: { supersededOn: new Date() },
        });
      }
      const policy = await tx.safetyPolicy.create({
        data: {
          orgId: req.auth!.org,
          version: (current?.version ?? 0) + 1,
          statement: body.data.statement,
          effectiveFrom: toDate(body.data.effectiveFrom),
        },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "policy.draft",
        entityType: "SafetyPolicy",
        entityId: policy.id,
        detail: { version: policy.version, supersededVersion: current?.version ?? null },
      });
      return policy;
    });

    return reply.code(201).send({ policy: created });
  });

  app.post<{ Params: { id: string } }>("/api/v1/sms/policy/:id/sign", limited, async (req, reply) => {
    /* THE ACCOUNTABLE EXECUTIVE, AND NOBODY ELSE. Element 1.1 is not
       "there is a policy" — it is that the person who can move money and
       schedule has put their name to it. A safety manager signing on
       their behalf is the exact failure the element exists to detect.

       `policy.sign` is the only permission in the whole matrix held by
       exactly one role, which is the point: a role check here would be
       equally correct today and would sit outside the model everything
       else is authorised by, where nothing tests it and nothing lists
       it. As a permission it is visible in PERMISSIONS, asserted by the
       safety-critical suite alongside every other grant, and cannot be
       widened without that assertion moving. */
    if (!guard(req.auth!.role, "policy.sign")) {
      return reply.code(403).send({
        error: "only_accountable_executive",
        detail:
          "A safety policy is signed by the accountable executive. Anyone else signing it " +
          "is the finding, not the evidence.",
      });
    }

    const signed = await prisma.$transaction(async (tx) => {
      const policy = await tx.safetyPolicy.findFirst({
        where: { id: req.params.id, orgId: req.auth!.org },
      });
      if (!policy) return null;
      if (policy.signedOn) return policy;
      const updated = await tx.safetyPolicy.update({
        where: { id: policy.id },
        data: { signedById: req.auth!.sub, signedOn: new Date() },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "policy.sign",
        entityType: "SafetyPolicy",
        entityId: policy.id,
        detail: { version: policy.version },
      });
      return updated;
    });

    if (!signed) return reply.code(404).send({ error: "not_found" });
    return reply.send({ policy: signed });
  });

  app.post<{ Params: { id: string } }>("/api/v1/sms/policy/:id/read", limited, async (req, reply) => {
    /* Anybody signed in may acknowledge, because everybody is supposed
       to have read it — that is what the element asks for. */
    const ack = await prisma.$transaction(async (tx) => {
      const policy = await tx.safetyPolicy.findFirst({
        where: { id: req.params.id, orgId: req.auth!.org },
      });
      if (!policy) return null;
      return tx.policyAcknowledgement.upsert({
        where: { policyId_userId: { policyId: policy.id, userId: req.auth!.sub } },
        create: { orgId: req.auth!.org, policyId: policy.id, userId: req.auth!.sub },
        update: {},
      });
    });
    if (!ack) return reply.code(404).send({ error: "not_found" });
    return reply.send({ acknowledgedAt: ack.acknowledgedAt });
  });

  /* =====================================================================
     ELEMENT 1.2 — accountabilities.  ELEMENT 1.3 — appointments.
     ===================================================================== */

  app.get("/api/v1/sms/accountabilities", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "document.read")) return reply.code(403).send({ error: "forbidden" });
    /* The roster ships with this payload, and it is not a convenience.
       An appointment names a person, and so does a training record. A
       dropdown built from the appointments already made can never
       record the FIRST appointment — and until one exists, no training
       either. Two of the eight elements were unreachable from a cold
       start, which is the state every new operator begins in.

       Withheld from a role that holds neither post: a frontline
       reporter needs the reporting form, not the staff list. Inactive
       users are excluded — an appointment is a live post, and offering
       a leaver as the appointee is how a stale matrix gets made. */
    const roster =
      guard(req.auth!.role, "appointment.manage") || guard(req.auth!.role, "training.manage");
    const [accountabilities, appointments, people] = await Promise.all([
      prisma.accountability.findMany({
        where: tenantWhere(req), orderBy: [{ post: "asc" }], take: LIST_LIMIT,
      }),
      prisma.appointment.findMany({
        where: { ...tenantWhere(req), endedOn: null },
        orderBy: [{ post: "asc" }],
        take: LIST_LIMIT,
        include: { user: { select: { name: true, role: true } } },
      }),
      roster
        ? prisma.user.findMany({
            where: { ...tenantWhere(req), active: true },
            orderBy: [{ name: "asc" }],
            take: LIST_LIMIT,
            select: { id: true, name: true, role: true },
          })
        : Promise.resolve([]),
    ]);
    return reply.send({ accountabilities, appointments, people });
  });

  app.post("/api/v1/sms/accountabilities", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "accountability.manage")) return reply.code(403).send({ error: "forbidden" });
    const body = AccountabilityInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_accountability" });
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.accountability.create({
        data: { orgId: req.auth!.org, ...body.data },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub, action: "accountability.create",
        entityType: "Accountability", entityId: created.id,
        detail: { post: created.post, elementId: created.elementId },
      });
      return created;
    });
    return reply.code(201).send({ accountability: row });
  });

  app.post("/api/v1/sms/appointments", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "appointment.manage")) return reply.code(403).send({ error: "forbidden" });
    const body = AppointmentInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_appointment" });

    const row = await prisma.$transaction(async (tx) => {
      /* Scoped in the WHERE, so a userId from another tenancy is never
         loaded rather than loaded and then checked. */
      const appointee = await tx.user.findFirst({
        where: { id: body.data.userId, orgId: req.auth!.org },
        select: { id: true },
      });
      if (!appointee) return null;

      /* One holder per post. Appointing a successor ends the incumbent's
         appointment rather than leaving two people accountable for one
         thing, which is the ambiguity element 1.3 exists to remove. */
      await tx.appointment.updateMany({
        where: { orgId: req.auth!.org, post: body.data.post, endedOn: null },
        data: { endedOn: new Date(body.data.appointedOn) },
      });

      const created = await tx.appointment.create({
        data: {
          orgId: req.auth!.org,
          post: body.data.post,
          userId: body.data.userId,
          appointedOn: new Date(body.data.appointedOn),
          letterRef: body.data.letterRef ?? null,
        },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub, action: "appointment.create",
        entityType: "Appointment", entityId: created.id,
        detail: { post: created.post, appointee: created.userId },
      });
      return created;
    });

    if (!row) return reply.code(404).send({ error: "no_such_user" });
    return reply.code(201).send({ appointment: row });
  });

  /* =====================================================================
     ELEMENT 1.4 — emergency response exercises.
     ===================================================================== */

  app.get("/api/v1/sms/exercises", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "document.read")) return reply.code(403).send({ error: "forbidden" });
    const rows = await prisma.emergencyExercise.findMany({
      where: tenantWhere(req), orderBy: { heldOn: "desc" }, take: LIST_LIMIT,
    });
    return reply.send({ exercises: rows });
  });

  app.post("/api/v1/sms/exercises", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "erp.manage")) return reply.code(403).send({ error: "forbidden" });
    const body = ExerciseInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_exercise" });
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.emergencyExercise.create({
        data: {
          orgId: req.auth!.org,
          scenario: body.data.scenario,
          heldOn: new Date(body.data.heldOn),
          participants: body.data.participants,
          findings: body.data.findings,
          planUpdated: body.data.planUpdated,
        },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub, action: "erp.exercise",
        entityType: "EmergencyExercise", entityId: created.id,
        detail: { heldOn: created.heldOn.toISOString(), planUpdated: created.planUpdated },
      });
      return created;
    });
    return reply.code(201).send({ exercise: row });
  });

  /* =====================================================================
     ELEMENT 1.5 — controlled documents.
     ===================================================================== */

  app.get("/api/v1/sms/documents", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "document.read")) return reply.code(403).send({ error: "forbidden" });
    const rows = await prisma.controlledDocument.findMany({
      where: { ...tenantWhere(req), supersededOn: null },
      orderBy: [{ reference: "asc" }],
      take: LIST_LIMIT,
      omit: HEAVY,
      /* The count, and whether the CALLER has read it. Element 1.5 is
         about distribution, and both numbers are the distribution: how
         many have read the revision in force, and whether the person
         looking at the screen is one of them. Counted per revision,
         because that is what the row is. */
      include: {
        approvedBy: { select: { name: true, role: true } },
        _count: { select: { reads: true } },
        reads: { where: { userId: req.auth!.sub }, select: { acknowledgedAt: true }, take: 1 },
      },
    });
    return reply.send({ documents: rows });
  });

  /* WHO HAS READ THIS REVISION — the half that turns a register into a
     distribution record.

     document.read, not document.manage. The person acknowledging is the
     person who read it, and requiring a manager's permission to say "I
     have read the manual" would mean the safety office recording it on
     everybody's behalf, which is a record of what the safety office
     believes rather than of what happened.

     IDEMPOTENT. Reading twice is not two readings, and the unique
     constraint on (documentId, userId) says so in the database as well.
     A second acknowledgement returns the FIRST one's timestamp rather
     than moving it — when somebody read the revision is the fact, and
     re-opening a document should not rewrite it.
     ===================================================================== */
  app.post("/api/v1/sms/documents/:id/read", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "document.read")) return reply.code(403).send({ error: "forbidden" });
    const { id } = req.params as { id: string };

    const doc = await prisma.controlledDocument.findFirst({
      where: { ...tenantWhere(req), id },
      select: { id: true },
    });
    if (!doc) return reply.code(404).send({ error: "not_found" });

    const existing = await prisma.documentAcknowledgement.findFirst({
      where: { documentId: doc.id, userId: req.auth!.sub },
      select: { acknowledgedAt: true },
    });
    if (existing) {
      return reply.send({ acknowledgedAt: existing.acknowledgedAt, alreadyRead: true });
    }

    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.documentAcknowledgement.create({
        data: { orgId: req.auth!.org, documentId: doc.id, userId: req.auth!.sub },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "document.read",
        entityType: "ControlledDocument",
        entityId: doc.id,
      });
      return row;
    });

    return reply.code(201).send({ acknowledgedAt: saved.acknowledgedAt, alreadyRead: false });
  });

  /* THE DOCUMENT ITSELF, which is what element 1.5 was missing.

     GATED ON document.read, NOT document.manage. Everybody who has to
     ACKNOWLEDGE a revision has to be able to read it, and a register
     that let only its administrator open the manual would be a
     register nobody could comply with. Acknowledgement already works
     that way; this matches it.

     The hash is re-checked on the way out for the same reason evidence
     is: a stored hash that is never compared is decoration. */
  app.get("/api/v1/sms/documents/:id/file", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "document.read")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { id } = req.params as { id: string };
    const row = await prisma.controlledDocument.findFirst({
      /* Tenancy in the WHERE, never in a filter afterwards. */
      where: { id, ...tenantWhere(req) },
      /* `data` is selected ONLY here — no list, export or picture route
         touches it, which is what keeps a bytea in the row costing
         nothing anywhere else. */
      select: {
        data: true, contentType: true, sha256: true, filename: true,
        reference: true, version: true,
      },
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    if (!row.data || !row.sha256) {
      /* A register entry for a document held elsewhere. Said plainly,
         because "404" would suggest the entry itself is missing. */
      return reply.code(409).send({
        error: "no_file_held",
        message:
          "This revision is registered but the document itself is held elsewhere. " +
          "The register records its reference, revision, approver and review date.",
      });
    }
    const buf = Buffer.from(row.data);
    const actual = createHash("sha256").update(buf).digest("hex");
    if (actual !== row.sha256) {
      req.log.error({ id }, "controlled document hash mismatch");
      return reply.code(409).send({
        error: "hash_mismatch",
        message:
          "The stored document does not match the hash recorded when it was approved. " +
          "It has not been served.",
      });
    }
    /* attachment, and a filename built from the REFERENCE AND VERSION
       rather than from anything a caller supplied. */
    const safe = `${row.reference}-${row.version}`.replace(/[^A-Za-z0-9._-]+/g, "_");
    return reply
      .header("content-type", row.contentType ?? "application/octet-stream")
      .header("content-disposition", `attachment; filename="${safe}"`)
      .send(buf);
  });

  app.post("/api/v1/sms/documents", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "document.manage")) return reply.code(403).send({ error: "forbidden" });
    const body = DocumentInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_document" });

    /* THE FILE, IF ONE CAME. Checked by the same function evidence is
       checked by — the allowlist, the size, and the sniff that refuses
       a PDF wearing an image's content type. A document store that
       accepted whatever it was handed would be a file upload with a
       version number, and SVG in particular is markup that can carry
       script into the operator's own pages. */
    /* Typed as Prisma's own create input rather than a hand-written
       shape, so a column rename breaks here instead of at runtime. */
    let file: Partial<Prisma.ControlledDocumentUncheckedCreateInput> = {};
    let uploadToDelete: string | null = null;
    if (body.data.uploadId !== undefined) {
      /* THE MANUAL PATH. The chunks were appended in order by the upload
         route; here the whole file is checked, hashed and read. Only the
         person who started the upload, in their own operator, can use it. */
      const up = await prisma.documentUpload.findFirst({
        where: { id: body.data.uploadId, orgId: req.auth!.org, userId: req.auth!.sub },
      });
      if (!up) return reply.code(404).send({ error: "upload_not_found" });
      if (up.received !== up.totalBytes) {
        return reply.code(409).send({
          error: "upload_incomplete",
          message: `Only ${up.received} of ${up.totalBytes} bytes arrived. Upload the file again.`,
        });
      }
      const raw = Buffer.from(up.data);
      const verdict = checkManual(up.contentType, raw.subarray(0, 8), raw.length);
      if (!verdict.ok) return reply.code(400).send({ error: "rejected", message: verdict.message });
      const kind: ManualKind = body.data.kind ?? "OTHER";
      const parsed = await parseManual(raw, verdict.type, kind);
      file = {
        data: new Uint8Array(raw),
        contentType: verdict.type,
        bytes: raw.length,
        sha256: createHash("sha256").update(raw).digest("hex"),
        filename: up.filename.slice(0, 160),
        kind,
        extractedText: parsed.text || null,
        pageCount: parsed.pageCount || null,
        parsed: parsed.analysis as unknown as Prisma.InputJsonValue,
        parsedAt: new Date(),
        parserVersion: parsed.parserVersion,
      };
      uploadToDelete = up.id;
    } else if (body.data.data !== undefined) {
      /* isBase64 FIRST. Buffer.from(x, "base64") never throws — it
         silently drops anything it does not recognise — so a truncated
         upload would otherwise be stored as a shorter, valid-looking
         file with a hash over the wrong bytes. That exact catch-that-
         cannot-fire was fixed once already in routes.attachments.ts. */
      if (!isBase64(body.data.data)) {
        return reply.code(400).send({
          error: "rejected",
          message: "That file did not arrive intact, so nothing was stored. Attach it again.",
        });
      }
      const raw = Buffer.from(body.data.data, "base64");
      const verdict = checkEvidence(body.data.contentType, raw);
      if (!verdict.ok) {
        return reply.code(400).send({ error: "rejected", message: verdict.message });
      }
      file = {
        data: new Uint8Array(raw),
        contentType: verdict.type,
        bytes: verdict.bytes,
        /* THE SERVER'S HASH, over the bytes it is about to write —
           never one the client supplied. */
        sha256: createHash("sha256").update(raw).digest("hex"),
        filename: body.data.filename?.slice(0, 160),
      };
    }

    const row = await prisma.$transaction(async (tx) => {
      // A new version supersedes the old one under the same reference.
      await tx.controlledDocument.updateMany({
        where: { orgId: req.auth!.org, reference: body.data.reference, supersededOn: null },
        data: { supersededOn: new Date() },
      });
      const created = await tx.controlledDocument.create({
        data: {
          orgId: req.auth!.org,
          title: body.data.title,
          reference: body.data.reference,
          version: body.data.version,
          approvedById: req.auth!.sub,
          approvedOn: new Date(),
          reviewBy: toDate(body.data.reviewBy),
          ...file,
        },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub, action: "document.approve",
        entityType: "ControlledDocument", entityId: created.id,
        detail: { reference: created.reference, version: created.version, kind: created.kind },
      });
      if (uploadToDelete) await tx.documentUpload.delete({ where: { id: uploadToDelete } });
      const { data: _d, extractedText: _t, ...light } = created;
      return light;
    });
    return reply.code(201).send({ document: row });
  });

  /* =====================================================================
     MANUALS ARRIVE IN CHUNKS.

     A Netlify Function refuses a request body above about six megabytes,
     and an approved SMS manual or ERP is routinely larger. So the browser
     starts an upload, sends the file in two-megabyte pieces IN ORDER, and
     then registers the document against the finished upload, which is
     when it is checked, hashed and parsed.

     ORDER IS ENFORCED IN ONE STATEMENT. A chunk is appended only if its
     index equals the number already received — the UPDATE's WHERE clause
     — so a retried or reordered piece can never be appended twice or out
     of place, and a gap is refused rather than stitched over.
     ===================================================================== */
  app.post("/api/v1/sms/documents/uploads", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "document.manage")) return reply.code(403).send({ error: "forbidden" });
    const body = UploadStart.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({
        error: "invalid_upload",
        message: `Manuals are held up to ${MANUAL_MAX_BYTES / 1048576} MB, as PDF or Word (.docx).`,
      });
    }
    if (!MANUAL_TYPES.includes(body.data.contentType)) {
      return reply.code(400).send({
        error: "rejected",
        message: "Manuals are accepted as PDF or Word (.docx).",
      });
    }
    // Abandoned uploads are cleared as new ones start, so none outlive
    // their hour without needing a scheduler.
    await prisma.documentUpload.deleteMany({
      where: { orgId: req.auth!.org, expiresAt: { lt: new Date() } },
    });
    const up = await prisma.documentUpload.create({
      data: {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        filename: body.data.filename,
        contentType: body.data.contentType,
        totalBytes: body.data.totalBytes,
        expiresAt: new Date(Date.now() + MANUAL_UPLOAD_TTL_MS),
      },
      select: { id: true },
    });
    return reply.code(201).send({ upload: up, chunkBytes: MANUAL_CHUNK_BYTES });
  });

  app.put(
    "/api/v1/sms/documents/uploads/:id/chunks/:n",
    { ...limited, bodyLimit: Math.ceil((MANUAL_CHUNK_BYTES * 4) / 3) + 64 * 1024 },
    async (req, reply) => {
      if (!guard(req.auth!.role, "document.manage")) return reply.code(403).send({ error: "forbidden" });
      const { id, n } = req.params as { id: string; n: string };
      const index = Number(n);
      const data = (req.body as { data?: unknown } | undefined)?.data;
      if (!Number.isInteger(index) || index < 0 || index >= MANUAL_MAX_CHUNKS) {
        return reply.code(400).send({ error: "invalid_chunk" });
      }
      if (typeof data !== "string" || !isBase64(data)) {
        return reply.code(400).send({
          error: "rejected",
          message: "That piece of the file did not arrive intact. Upload the file again.",
        });
      }
      const piece = Buffer.from(data, "base64");
      if (piece.length === 0 || piece.length > MANUAL_CHUNK_BYTES) {
        return reply.code(400).send({ error: "invalid_chunk" });
      }
      const up = await prisma.documentUpload.findFirst({
        where: { id, orgId: req.auth!.org, userId: req.auth!.sub, expiresAt: { gt: new Date() } },
        select: { received: true, totalBytes: true, chunks: true },
      });
      if (!up) return reply.code(404).send({ error: "upload_not_found" });
      if (up.received + piece.length > up.totalBytes) {
        return reply.code(400).send({ error: "too_much", message: "More arrived than the file's size." });
      }
      const changed = await prisma.$executeRaw`
        UPDATE "DocumentUpload"
           SET "data" = "data" || ${piece}, "received" = "received" + ${piece.length}, "chunks" = "chunks" + 1
         WHERE "id" = ${id} AND "orgId" = ${req.auth!.org} AND "chunks" = ${index}`;
      if (changed !== 1) {
        return reply.code(409).send({
          error: "out_of_order",
          message: `Expected piece ${up.chunks}, received piece ${index}.`,
          expected: up.chunks,
        });
      }
      return reply.send({ received: up.received + piece.length, totalBytes: up.totalBytes });
    },
  );

  /* WHAT THE PARSER FOUND, read separately from the register so the list
     stays small. document.read: anybody who may read the manual may read
     what its own pages say. */
  /* SEARCH ACROSS THE OPERATOR'S MANUALS. The database narrows to the
     documents carrying every word; the page and the sentence come from
     searchManual, so "every word on ONE page" is decided in one place.
     Revisions in force only unless asked — an answer from a superseded
     ERP is the wrong answer given confidently. */
  app.get("/api/v1/sms/documents/search", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "document.read")) return reply.code(403).send({ error: "forbidden" });
    const q = req.query as { q?: unknown; all?: unknown };
    const terms = searchTerms(q.q);
    if (!terms.length) {
      return reply.code(400).send({ error: "invalid", message: "Search for at least one word of two letters or more." });
    }
    const docs = await prisma.controlledDocument.findMany({
      where: {
        ...tenantWhere(req),
        ...(q.all === "1" ? {} : { supersededOn: null }),
        AND: terms.map((t) => ({ extractedText: { contains: t, mode: "insensitive" as const } })),
      },
      select: { id: true, title: true, reference: true, version: true, kind: true, supersededOn: true, extractedText: true },
      orderBy: [{ reference: "asc" }, { version: "desc" }],
      take: 25,
    });
    const results = docs
      .map(({ extractedText, ...d }) => ({ ...d, hits: searchManual(extractedText ?? "", terms) }))
      .filter((d) => d.hits.length);
    return reply.send({ terms, results });
  });

  app.get("/api/v1/sms/documents/:id/analysis", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "document.read")) return reply.code(403).send({ error: "forbidden" });
    const { id } = req.params as { id: string };
    const row = await prisma.controlledDocument.findFirst({
      where: { ...tenantWhere(req), id },
      select: {
        id: true, title: true, reference: true, version: true, kind: true,
        pageCount: true, parsed: true, parsedAt: true, parserVersion: true, contentType: true,
      },
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return reply.send({ analysis: row });
  });

  /* =====================================================================
     ELEMENT 3.3 — internal audit findings and corrective action.
     ===================================================================== */

  app.get("/api/v1/sms/findings", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "audit.read")) return reply.code(403).send({ error: "forbidden" });
    const rows = await prisma.auditFinding.findMany({
      where: tenantWhere(req),
      orderBy: [{ closedOn: "asc" }, { dueBy: "asc" }],
      take: LIST_LIMIT,
      include: { verifiedBy: { select: { name: true } } },
    });
    return reply.send({ findings: rows });
  });

  app.post("/api/v1/sms/findings", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "sms.audit.conduct")) return reply.code(403).send({ error: "forbidden" });
    const body = FindingInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_finding" });
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.auditFinding.create({
        data: {
          orgId: req.auth!.org,
          auditRef: body.data.auditRef,
          finding: body.data.finding,
          elementId: body.data.elementId ?? null,
          severity: body.data.severity,
          ownerPost: body.data.ownerPost,
          dueBy: toDate(body.data.dueBy),
        },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub, action: "finding.raise",
        entityType: "AuditFinding", entityId: created.id,
        detail: { auditRef: created.auditRef, severity: created.severity },
      });
      return created;
    });
    return reply.code(201).send({ finding: row });
  });

  app.post<{ Params: { id: string } }>("/api/v1/sms/findings/:id/close", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "sms.audit.conduct")) return reply.code(403).send({ error: "forbidden" });
    const body = FindingClose.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "corrective_action_required" });
    const row = await prisma.$transaction(async (tx) => {
      const finding = await tx.auditFinding.findFirst({
        where: { id: req.params.id, orgId: req.auth!.org },
      });
      if (!finding) return null;
      const updated = await tx.auditFinding.update({
        where: { id: finding.id },
        data: { correctiveAction: body.data.correctiveAction, closedOn: new Date() },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub, action: "finding.close",
        entityType: "AuditFinding", entityId: finding.id, detail: { auditRef: finding.auditRef },
      });
      return updated;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return reply.send({ finding: row });
  });

  app.post<{ Params: { id: string } }>("/api/v1/sms/findings/:id/verify", limited, async (req, reply) => {
    /* CLOSURE IS NOT VERIFICATION. Closing says the action was taken;
       verifying says somebody went back and found that it worked. An
       operator who conflates them ends up with a closed finding that
       never worked, which is the commonest way an internal audit
       programme becomes paperwork. So a finding that is not closed
       cannot be verified, and the refusal says why. */
    if (!guard(req.auth!.role, "sms.audit.verify")) return reply.code(403).send({ error: "forbidden" });
    const outcome = await prisma.$transaction(async (tx) => {
      const finding = await tx.auditFinding.findFirst({
        where: { id: req.params.id, orgId: req.auth!.org },
      });
      if (!finding) return { code: 404 as const };
      if (!finding.closedOn) return { code: 409 as const };
      const updated = await tx.auditFinding.update({
        where: { id: finding.id },
        data: { verifiedById: req.auth!.sub, verifiedOn: new Date() },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub, action: "finding.verify",
        entityType: "AuditFinding", entityId: finding.id, detail: { auditRef: finding.auditRef },
      });
      return { code: 200 as const, finding: updated };
    });

    if (outcome.code === 404) return reply.code(404).send({ error: "not_found" });
    if (outcome.code === 409) {
      return reply.code(409).send({
        error: "not_closed",
        detail:
          "A finding is verified after the corrective action has been taken, not instead " +
          "of it. Close it with what was done first.",
      });
    }
    return reply.send({ finding: outcome.finding });
  });

  /* =====================================================================
     ELEMENT 4.1 — training records.
     ===================================================================== */

  app.get("/api/v1/sms/training", limited, async (req, reply) => {
    /* Everyone may read their OWN; the matrix needs training.manage.
       A frontline reporter checking whether their SMS refresher has
       lapsed is the ordinary case and should not need a manager. */
    const wide = guard(req.auth!.role, "training.manage");
    if (!wide && !guard(req.auth!.role, "training.read.own")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const rows = await prisma.trainingRecord.findMany({
      where: { ...tenantWhere(req), ...(wide ? {} : { userId: req.auth!.sub }) },
      orderBy: [{ expiresOn: "asc" }],
      take: LIST_LIMIT,
      include: { user: { select: { name: true, role: true } } },
    });

    /* WHERE EACH RECORD STANDS, computed rather than stored — the same
       reason the subscription state is. A stored standing is one that
       is wrong every morning until something rewrites it, and the
       thing that rewrites it is a nightly job whose failure is silent. */
    const now = new Date();
    const standing = rows.map((t: { id: string; expiresOn: Date | null }) => ({
      id: t.id,
      standing: standingOf(t.expiresOn, now),
      daysUntilExpiry: daysUntilExpiry(t.expiresOn, now),
    }));

    /* ------------------------------------------------------------------
       WHO IS MISSING TRAINING THEIR ROLE REQUIRES.

       A GAP IS NOT AN EXPIRY, and until now this route could only
       report the second. currency.ts answers "whose certificate has run
       out" — a person who was trained, visible as a dated row going
       amber. A GAP is a person who was never trained in something their
       role requires, and it is invisible by construction: there is no
       row to be amber, so a matrix built only from records shows a
       clean sheet for somebody who has had no training at all.

       Doc 9859's six initial topics are what makes the question
       answerable. The curriculum module has held them, unit-tested,
       since it was written, and 4.1's coverage entry has said in its
       own words that it was "wired to no route, so today the matrix
       still answers only what has expired". This is that route.

       COMPUTED, NEVER STORED. Charter rule 6. A gap is a function of a
       person's role and the records they hold, both of which change; a
       stored gap is a gap that disagrees with the record the first time
       somebody is promoted or files a certificate.

       ONLY FOR THE MATRIX. A frontline reporter reading their own
       records gets their own requirement and their own gaps and nobody
       else's — the same boundary the scope already draws, because a
       list of who has not been trained is a personnel matter.

       UNRECOGNISED KEYS TRAVEL WITH IT, and that is not tidiness.
       Every TrainingRecord predating this module carries free text in
       `course`, so on the day it ships an operator's whole matrix is
       unrecognised keys. Reporting gaps without ALSO reporting those
       would tell an operator that every person has six gaps while their
       certificates sit in the record unread. The product does not guess
       a mapping — a fuzzy match from "SMS refresher" to a curriculum
       key is the invented compliance this module exists to remove.
       ------------------------------------------------------------------ */
    const people = wide
      ? await prisma.user.findMany({
          where: { ...tenantWhere(req), active: true },
          select: { id: true, name: true, role: true },
          take: LIST_LIMIT,
        })
      : [{ id: req.auth!.sub, name: null, role: req.auth!.role }];

    const heldBy = new Map<string, string[]>();
    for (const r of rows) {
      const held = heldBy.get(r.userId) ?? [];
      held.push(r.course);
      heldBy.set(r.userId, held);
    }

    const curriculum = people.map((p) => {
      const held = heldBy.get(p.id) ?? [];
      return {
        userId: p.id,
        name: p.name,
        role: p.role,
        required: requiredFor(p.role as never),
        gaps: gapsFor(p.role as never, held),
        unrecognised: unrecognisedIn(held),
      };
    });

    return reply.send({
      training: rows,
      scope: wide ? "org" : "own",
      curriculum,
      /* STATED IN THE PAYLOAD, not only in a doc nobody fetches. A
         syllabus nobody has read the instrument for is the one kind of
         wrong this product cannot ship, and a consumer of this route is
         entitled to know which it is holding.

         THIS USED TO SAY THE TOPICS CAME FROM A SEARCH INDEX'S
         RENDERING OF DOC 9859, and that was true until somebody read
         CAA-AC-SMS011 itself. The comment outlived the fact by one
         commit, which is why the instrument now travels BESIDE the
         flag: a bare `true` tells a consumer that something was
         verified without telling them against what, and the next
         person to change the source has to change a value rather than
         a sentence. Both are read from curriculum.ts rather than
         written here, so this route cannot claim a provenance the
         shared module does not hold. */
      curriculumVerifiedAgainstPrimary: CURRICULUM_VERIFIED_AGAINST_PRIMARY,
      curriculumInstrument: CURRICULUM_INSTRUMENT.reference,
      /* ELEMENT 4.1's OTHER HALF. The matrix said what had EXPIRED;
         this says what is about to, which is the only version a safety
         manager can act on. Ninety days, because training is a course
         somebody has to find, book and travel to. */
      standing,
      dueSoonWindowDays: TRAINING_DUE_SOON_DAYS,
    });
  });

  app.post("/api/v1/sms/training", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "training.manage")) return reply.code(403).send({ error: "forbidden" });
    const body = TrainingInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_training_record" });
    const row = await prisma.$transaction(async (tx) => {
      const trainee = await tx.user.findFirst({
        where: { id: body.data.userId, orgId: req.auth!.org }, select: { id: true },
      });
      if (!trainee) return null;
      const created = await tx.trainingRecord.create({
        data: {
          orgId: req.auth!.org,
          userId: body.data.userId,
          course: body.data.course,
          completedOn: new Date(body.data.completedOn),
          expiresOn: toDate(body.data.expiresOn),
        },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub, action: "training.record",
        entityType: "TrainingRecord", entityId: created.id,
        detail: { course: created.course, trainee: created.userId },
      });
      return created;
    });
    if (!row) return reply.code(404).send({ error: "no_such_user" });
    return reply.code(201).send({ record: row });
  });

  /* =====================================================================
     ELEMENT 4.2 — safety communication, and the loop back to a reporter.
     ===================================================================== */

  app.get("/api/v1/sms/communications", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "document.read")) return reply.code(403).send({ error: "forbidden" });
    const rows = await prisma.safetyCommunication.findMany({
      where: tenantWhere(req), orderBy: { publishedOn: "desc" }, take: LIST_LIMIT,
      include: { publishedBy: { select: { name: true } } },
    });
    return reply.send({ communications: rows });
  });

  app.post("/api/v1/sms/communications", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "communication.publish")) return reply.code(403).send({ error: "forbidden" });
    const body = CommunicationInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_communication" });

    const outcome = await prisma.$transaction(async (tx) => {
      if (body.data.reportId) {
        const report = await tx.safetyReport.findFirst({
          where: { id: body.data.reportId, orgId: req.auth!.org },
          select: { id: true, isAnonymous: true },
        });
        if (!report) return { code: 404 as const };
        /* ============================================================
           NEVER AGAINST AN ANONYMOUS REPORT.

           Element 4.2 asks whether people who file hear what happened.
           For an anonymous report the honest answer is that there is
           nobody to tell — and a row joining feedback to that report,
           written by a named safety manager at a known time, is exactly
           the re-identification the sync path was fixed to prevent,
           arriving through a different door.

           The bulletin is the right instrument there: publish what
           changed to everybody, which is how a confidential reporter
           finds out their report mattered without anybody learning it
           was theirs.
           ============================================================ */
        if (report.isAnonymous) return { code: 422 as const };
      }

      const created = await tx.safetyCommunication.create({
        data: {
          orgId: req.auth!.org,
          title: body.data.title,
          body: body.data.body,
          publishedById: req.auth!.sub,
          reportId: body.data.reportId ?? null,
        },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub,
        action: body.data.reportId ? "communication.feedback" : "communication.publish",
        entityType: "SafetyCommunication", entityId: created.id,
        detail: { title: created.title, aboutReport: Boolean(created.reportId) },
      });
      return { code: 201 as const, communication: created };
    });

    if (outcome.code === 404) return reply.code(404).send({ error: "not_found" });
    if (outcome.code === 422) {
      return reply.code(422).send({
        error: "anonymous_report",
        detail:
          "There is nobody to tell, and a record joining feedback to an anonymous report " +
          "would identify its reporter. Publish a bulletin to the organisation instead.",
      });
    }
    return reply.code(201).send({ communication: outcome.communication });
  });
}
