// =====================================================================
// CORRECTIVE ACTIONS — the loop, tracked rather than described.
//
// WHY THIS EXISTS. The product could already record that something was
// DONE: a note on a report's closure, a `correctiveAction` string on an
// audit finding, `controls` on a register entry. What it could not do
// was treat the action as an object with an owner, a date and a
// verification — so an undertaking lived as prose inside whichever
// record happened to mention it, and no screen could answer "what is
// outstanding".
//
// It is the second half of two elements this product already claims:
// 2.2's evidence is "mitigations tracked to closure", 3.3's is
// "findings closed AND VERIFIED".
//
// THE RULE THAT MAKES IT WORTH ANYTHING is that verification is by
// somebody else — see verificationRefusal() in capa.ts, and the route
// below, which refuses with that module's sentence rather than a status
// code on its own.
//
// NOTHING COMPUTES A STATUS HERE OR STORES ONE. The rows carry dates;
// statusOf() derives the state on every read. A stored "OPEN" is still
// OPEN the day after its due date passes, which is the one state an
// operator needs.
// =====================================================================
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { can } from "@usalamasms/shared";
import {
  statusOf, summarise, verificationRefusal,
} from "../../../packages/shared/src/capa";
import { prisma, authenticate, appendAuditTx, tenantWhere } from "./core";

const LIST_LIMIT = 500;

/* Exactly one source, enforced here as well as by the CHECK constraint
   in the migration. Not redundant: the constraint returns a Postgres
   error and an operator deserves a sentence — the same reasoning the
   SPI period uniqueness carries. */
const SOURCES = ["reportId", "findingId", "riskId", "changeId"] as const;

const CreateSchema = z
  .object({
    action: z.string().trim().min(1).max(2000),
    ownerPost: z.string().trim().min(1).max(160),
    dueOn: z.string().date().optional(),
    reportId: z.string().uuid().optional(),
    findingId: z.string().uuid().optional(),
    riskId: z.string().uuid().optional(),
    changeId: z.string().uuid().optional(),
  })
  .refine(
    (a) => SOURCES.filter((k) => a[k]).length === 1,
    {
      message:
        "An action belongs to exactly one thing — a report, an audit finding, a register " +
        "entry or a change. With none it appears in no list and nobody does it; with two " +
        "it is counted twice.",
    },
  );

const CompleteSchema = z.object({
  completionNote: z.string().trim().max(4000).optional(),
  /* The date the work was DONE, which is not the date it was recorded.
     Recording last month's work this morning is the ordinary case, and
     conflating the two dates every action to the day of data entry —
     the same distinction the SPI action record makes. */
  completedOn: z.string().date().optional(),
});

const VerifySchema = z.object({
  verificationNote: z.string().trim().max(4000).optional(),
  verifiedOn: z.string().date().optional(),
});

const CancelSchema = z.object({
  /* REQUIRED, unlike the notes above. Cancelling is a safety decision —
     an operator has decided against a control it had undertaken — and
     the reason is the part an auditor asks for. A cancellation with no
     reason is indistinguishable from a delete, which is why this is not
     a delete. */
  cancelledReason: z.string().trim().min(1).max(4000),
});

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

export async function actionRoutes(app: FastifyInstance): Promise<void> {
  const limited = {
    preHandler: [authenticate],
    config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
  };

  const shape = {
    id: true, action: true, ownerPost: true, dueOn: true,
    reportId: true, findingId: true, riskId: true, changeId: true,
    completedOn: true, completedById: true, completionNote: true,
    verifiedOn: true, verifiedById: true, verificationNote: true,
    cancelledOn: true, cancelledReason: true, createdAt: true,
  } as const;

  type Row = {
    id: string; action: string; ownerPost: string; dueOn: Date | null;
    completedOn: Date | null; completedById: string | null;
    verifiedOn: Date | null; verifiedById: string | null;
    cancelledOn: Date | null; createdAt: Date;
    [k: string]: unknown;
  };

  const present = (r: Row, today: Date) => ({
    ...r,
    dueOn: r.dueOn?.toISOString().slice(0, 10) ?? null,
    completedOn: r.completedOn?.toISOString() ?? null,
    verifiedOn: r.verifiedOn?.toISOString() ?? null,
    cancelledOn: r.cancelledOn?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    /* Derived on every read and sent alongside the dates rather than
       instead of them: the caller can check the arithmetic, which is
       the whole reason it is not stored. */
    status: statusOf(r, today),
  });

  app.get("/api/v1/actions", limited, async (req, reply) => {
    if (!can(req.auth!.role as never, "report.read.org")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const rows = await prisma.correctiveAction.findMany({
      where: tenantWhere(req),
      /* Nulls last: an action with no due date is not the most urgent
         thing in the list, and Postgres sorts NULL first ascending by
         default — which would put every undated action above every
         overdue one. */
      orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: LIST_LIMIT,
      select: shape,
    });
    const today = new Date();
    return reply.send({
      truncated: rows.length === LIST_LIMIT,
      actions: rows.map((r) => present(r as Row, today)),
      summary: summarise(rows as Row[], today),
    });
  });

  app.post("/api/v1/actions", limited, async (req, reply) => {
    /* hazard.manage rather than a new permission: an action is a
       control, and whoever may manage hazards and their controls is who
       raises one. A fresh permission would have to be granted to every
       existing role to preserve behaviour, which is how a matrix drifts
       into meaning nothing. */
    if (!can(req.auth!.role as never, "hazard.manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }
    const d = parsed.data;

    /* THE SOURCE MUST BE THIS OPERATOR'S. Without this, an action could
       be hung off another tenancy's report id — which would not leak
       that report's contents, but WOULD confirm the id exists and would
       put this operator's action in a list scoped by it. */
    const owns = await sourceBelongsToOrg(d, req);
    if (!owns) return reply.code(404).send({ error: "not_found" });

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.correctiveAction.create({
        data: {
          orgId: req.auth!.org,
          action: d.action,
          ownerPost: d.ownerPost,
          ...(d.dueOn ? { dueOn: day(d.dueOn) } : {}),
          ...(d.reportId ? { reportId: d.reportId } : {}),
          ...(d.findingId ? { findingId: d.findingId } : {}),
          ...(d.riskId ? { riskId: d.riskId } : {}),
          ...(d.changeId ? { changeId: d.changeId } : {}),
        },
        select: shape,
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub,
        action: "action.create", entityType: "CorrectiveAction", entityId: created.id,
      });
      return created;
    });

    return reply.code(201).send({ action: present(row as Row, new Date()) });
  });

  app.post("/api/v1/actions/:id/complete", limited, async (req, reply) => {
    if (!can(req.auth!.role as never, "hazard.manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = CompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }
    const existing = await find(req);
    if (!existing) return reply.code(404).send({ error: "not_found" });

    if (existing.cancelledOn) {
      return reply.code(409).send({
        error: "cancelled",
        message:
          "This action was cancelled. Completing it would record work against a decision " +
          "not to do it — raise a new action instead, so the record shows both.",
      });
    }

    const row = await prisma.$transaction(async (tx) => {
      const saved = await tx.correctiveAction.update({
        where: { id: existing.id },
        data: {
          completedOn: parsed.data.completedOn ? day(parsed.data.completedOn) : new Date(),
          completedById: req.auth!.sub,
          ...(parsed.data.completionNote ? { completionNote: parsed.data.completionNote } : {}),
        },
        select: shape,
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub,
        action: "action.complete", entityType: "CorrectiveAction", entityId: saved.id,
      });
      return saved;
    });

    return reply.send({ action: present(row as Row, new Date()) });
  });

  app.post("/api/v1/actions/:id/verify", limited, async (req, reply) => {
    /* audit.read is the closest thing this matrix has to "may confirm
       somebody else's work" — it is held by the safety manager and by
       key management and NOT by the safety officer or the investigator,
       which is the separation this rule needs. */
    if (!can(req.auth!.role as never, "audit.read")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = VerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }
    const existing = await find(req);
    if (!existing) return reply.code(404).send({ error: "not_found" });

    /* THE RULE, and it comes from the shared module rather than being
       restated here — the screen shows the same sentence beside the
       button, and a rule written twice is a rule that disagrees with
       itself the first time somebody edits one copy. */
    const refusal = verificationRefusal(existing, req.auth!.sub);
    if (refusal) {
      return reply.code(409).send({ error: "cannot_verify", message: refusal });
    }

    const row = await prisma.$transaction(async (tx) => {
      const saved = await tx.correctiveAction.update({
        where: { id: existing.id },
        data: {
          verifiedOn: parsed.data.verifiedOn ? day(parsed.data.verifiedOn) : new Date(),
          verifiedById: req.auth!.sub,
          ...(parsed.data.verificationNote
            ? { verificationNote: parsed.data.verificationNote } : {}),
        },
        select: shape,
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub,
        action: "action.verify", entityType: "CorrectiveAction", entityId: saved.id,
      });
      return saved;
    });

    return reply.send({ action: present(row as Row, new Date()) });
  });

  app.post("/api/v1/actions/:id/cancel", limited, async (req, reply) => {
    if (!can(req.auth!.role as never, "hazard.manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = CancelSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }
    const existing = await find(req);
    if (!existing) return reply.code(404).send({ error: "not_found" });

    const row = await prisma.$transaction(async (tx) => {
      const saved = await tx.correctiveAction.update({
        where: { id: existing.id },
        data: { cancelledOn: new Date(), cancelledReason: parsed.data.cancelledReason },
        select: shape,
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub,
        action: "action.cancel", entityType: "CorrectiveAction", entityId: saved.id,
      });
      return saved;
    });

    return reply.send({ action: present(row as Row, new Date()) });
  });

  /* Tenant-scoped in the WHERE clause, so another operator's action id
     answers not-found rather than forbidden — a refusal confirms the row
     exists. */
  function find(req: Parameters<typeof tenantWhere>[0]) {
    const { id } = req.params as { id: string };
    return prisma.correctiveAction.findFirst({
      where: { ...tenantWhere(req), id },
      select: { ...shape, completedById: true },
    });
  }

  async function sourceBelongsToOrg(
    d: { reportId?: string; findingId?: string; riskId?: string; changeId?: string },
    req: Parameters<typeof tenantWhere>[0],
  ): Promise<boolean> {
    const where = tenantWhere(req);
    if (d.reportId) {
      return !!(await prisma.safetyReport.findFirst({
        where: { ...where, id: d.reportId }, select: { id: true },
      }));
    }
    if (d.findingId) {
      return !!(await prisma.auditFinding.findFirst({
        where: { ...where, id: d.findingId }, select: { id: true },
      }));
    }
    if (d.riskId) {
      return !!(await prisma.riskAssessment.findFirst({
        where: { ...where, id: d.riskId }, select: { id: true },
      }));
    }
    if (d.changeId) {
      return !!(await prisma.changeAssessment.findFirst({
        where: { ...where, id: d.changeId }, select: { id: true },
      }));
    }
    return false;
  }
}
