// CAA SET-I evidence ledger. Ratings are stored only alongside evidence,
// source references, an accountable post, and a review date.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { can, SETI_BY_ID, SETI_CRITERIA, SETI_LEVELS } from "@usalamasms/shared";
import { authenticate, appendAuditTx, prisma, tenantWhere } from "./core";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const at = (value: string) => new Date(`${value}T00:00:00.000Z`);
const LIST_LIMIT = 100;

const CreateAssessment = z.object({
  title: z.string().trim().min(3).max(200),
  scope: z.string().trim().min(10).max(6000),
  assessedOn: date,
});

const UpdateItem = z.object({
  level: z.enum(SETI_LEVELS),
  evidence: z.string().trim().min(10).max(12000),
  sourceRefs: z.string().trim().min(3).max(4000),
  ownerPost: z.string().trim().min(2).max(160),
  reviewDueOn: date,
  assessorNotes: z.string().trim().max(8000).optional(),
});

function mayAssess(role: string): boolean {
  return can(role as never, "sms.audit.conduct") || can(role as never, "sms.audit.verify");
}

export async function setiRoutes(app: FastifyInstance): Promise<void> {
  const limited = { preHandler: [authenticate], config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

  app.get("/api/v1/seti", limited, async (req, reply) => {
    if (!mayAssess(req.auth!.role)) return reply.code(403).send({ error: "forbidden" });
    const assessments = await prisma.setiAssessment.findMany({
      where: tenantWhere(req),
      orderBy: { assessedOn: "desc" },
      take: LIST_LIMIT,
      include: { _count: { select: { items: true } } },
    });
    return reply.send({ truncated: assessments.length === LIST_LIMIT, assessments });
  });

  app.post("/api/v1/seti", limited, async (req, reply) => {
    if (!mayAssess(req.auth!.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = CreateAssessment.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });

    const assessment = await prisma.$transaction(async (tx) => {
      const created = await tx.setiAssessment.create({
        data: {
          orgId: req.auth!.org,
          assessorId: req.auth!.sub,
          title: parsed.data.title,
          scope: parsed.data.scope,
          assessedOn: at(parsed.data.assessedOn),
          items: { create: SETI_CRITERIA.map((criterion) => ({ criterionId: criterion.id })) },
        },
        include: { items: true },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "seti.assessment.create",
        entityType: "SetiAssessment",
        entityId: created.id,
        detail: { criteria: SETI_CRITERIA.length },
      });
      return created;
    });
    return reply.code(201).send({ assessment });
  });

  app.get("/api/v1/seti/:id", limited, async (req, reply) => {
    if (!mayAssess(req.auth!.role)) return reply.code(403).send({ error: "forbidden" });
    const id = (req.params as { id: string }).id;
    const assessment = await prisma.setiAssessment.findFirst({
      where: { ...tenantWhere(req), id },
      include: { items: { orderBy: { criterionId: "asc" } }, assessor: { select: { name: true, role: true } } },
    });
    if (!assessment) return reply.code(404).send({ error: "not_found" });
    return reply.send({ assessment, criteria: SETI_CRITERIA });
  });

  app.put("/api/v1/seti/:id/items/:criterionId", limited, async (req, reply) => {
    if (!mayAssess(req.auth!.role)) return reply.code(403).send({ error: "forbidden" });
    const { id, criterionId } = req.params as { id: string; criterionId: string };
    if (!SETI_BY_ID.has(criterionId)) return reply.code(404).send({ error: "unknown_criterion" });
    const parsed = UpdateItem.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });

    const assessment = await prisma.setiAssessment.findFirst({ where: { ...tenantWhere(req), id }, select: { id: true } });
    if (!assessment) return reply.code(404).send({ error: "not_found" });

    const item = await prisma.$transaction(async (tx) => {
      const saved = await tx.setiAssessmentItem.update({
        where: { assessmentId_criterionId: { assessmentId: assessment.id, criterionId } },
        data: {
          level: parsed.data.level,
          evidence: parsed.data.evidence,
          sourceRefs: parsed.data.sourceRefs,
          ownerPost: parsed.data.ownerPost,
          reviewDueOn: at(parsed.data.reviewDueOn),
          ...(parsed.data.assessorNotes ? { assessorNotes: parsed.data.assessorNotes } : {}),
        },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "seti.item.assess",
        entityType: "SetiAssessmentItem",
        entityId: saved.id,
        detail: { criterionId, level: parsed.data.level },
      });
      return saved;
    });
    return reply.send({ item });
  });
}
