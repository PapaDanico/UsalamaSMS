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
import { prisma, authenticate, appendAuditTx, tenantWhere } from "./core";

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
      include: { approvedBy: { select: { name: true } } },
    });
    return reply.send({ documents: rows });
  });

  app.post("/api/v1/sms/documents", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "document.manage")) return reply.code(403).send({ error: "forbidden" });
    const body = DocumentInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_document" });
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
        },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub, action: "document.approve",
        entityType: "ControlledDocument", entityId: created.id,
        detail: { reference: created.reference, version: created.version },
      });
      return created;
    });
    return reply.code(201).send({ document: row });
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
    return reply.send({ training: rows, scope: wide ? "org" : "own" });
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
