// =====================================================================
// ELEMENT 3.2 — the management of change.
//
// WHAT WAS ALREADY THERE. /toolkits/sra runs Doc 9859's five steps and
// refuses acceptance while a risk stays intolerable after controls.
// That is the assessment, and it lives in one browser — so an operator
// asked for "a change assessment for the most recent significant
// change" had to produce a particular handset, and nobody else in the
// organisation could see or approve it.
//
// THE ELEMENT'S EVIDENCE IS UNUSUALLY PRECISE, and it is the whole
// reason this route is shaped the way it is: "a change assessment for
// the most recent significant change, DATED BEFORE IT HAPPENED". An
// assessment written after the fleet arrived is a justification. Both
// dates are stored, neither is derived, and their ORDER is the thing an
// inspector reads.
//
// SO THE ROUTE REFUSES TO BACKDATE. A change may be assessed before it
// takes effect, or on the day; it may not be recorded as assessed
// AFTER its own effective date. That is not a validation nicety — it is
// the element. Accepting it would let the product manufacture the
// evidence the element exists to test for.
//
// APPROVAL IS A SEPARATE ACT, separately permissioned. moc.create
// writes the assessment; moc.approve signs it. Both permissions have
// been in the matrix since it was written and neither had a route.
// =====================================================================
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  can,
  riskScore,
  tolerability,
  type Permission,
  type Severity,
  type Likelihood,
} from "@usalamasms/shared";
/* Relative rather than through the barrel, for the reason set out in
   routes.register.ts: the barrel reaches the report form's entry
   chunk and this module cannot be tree-shaken. */
import { refuseSignature } from "../../../packages/shared/src/signature";
import { prisma, authenticate, appendAuditTx, tenantWhere } from "./core";

const LIST_LIMIT = 200;

function guard(role: string, permission: Permission): boolean {
  return can(role as never, permission);
}

const SEVERITIES = [
  "A_CATASTROPHIC", "B_HAZARDOUS", "C_MAJOR", "D_MINOR", "E_NEGLIGIBLE",
] as const;
const LIKELIHOODS = [
  "FREQUENT", "OCCASIONAL", "REMOTE", "IMPROBABLE", "EXTREMELY_IMPROBABLE",
] as const;
const TRIGGERS = [
  "FLEET", "ROUTE_OR_NETWORK", "ORGANISATION", "KEY_PERSONNEL",
  "EQUIPMENT_OR_SYSTEM", "PROCEDURE", "OTHER",
] as const;

const day = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

const ChangeInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(8000),
    trigger: z.enum(TRIGGERS),
    assessedOn: day,
    effectiveFrom: day.optional(),
    severity: z.enum(SEVERITIES),
    likelihood: z.enum(LIKELIHOODS),
    controls: z.string().trim().max(4000).optional(),
    residualSeverity: z.enum(SEVERITIES).optional(),
    residualLikelihood: z.enum(LIKELIHOODS).optional(),
    reviewDueOn: day.optional(),
  })
  .refine(
    (c) => Boolean(c.residualSeverity) === Boolean(c.residualLikelihood),
    { message: "A residual position needs both a severity and a likelihood, or neither." },
  )
  .refine(
    /* THE ELEMENT, AS A VALIDATION. "Dated before it happened" is what
       3.2's evidence asks for, so an assessment dated after its own
       change took effect is refused rather than stored and flagged.
       Storing it would put a row in the record that reads as evidence
       and is the opposite of it. */
    (c) => !c.effectiveFrom || at(c.assessedOn) <= at(c.effectiveFrom),
    {
      message:
        "This assessment is dated after the change took effect. Element 3.2 asks for " +
        "an assessment made before the change — a later one is a justification, and " +
        "recording it as an assessment would misstate the record.",
    },
  );

const ApprovalInput = z.object({
  /* Nothing to send. The approver is the caller and the moment is now:
     letting either be supplied would allow an approval attributed to
     somebody who did not give it, or dated to suit. */
});

const ReviewInput = z.object({
  reviewedOn: day,
  reviewNotes: z.string().trim().min(1).max(8000),
});

export async function changeRoutes(app: FastifyInstance): Promise<void> {
  const limited = {
    preHandler: authenticate,
    /* EVERY ROUTE IN THIS FILE WRITES ROWS, AND NONE OF THEM WAS LIMITED.

       Found by asking which route files declare no limit at all rather
       than by reading any one of them: this file, routes.register.ts and
       routes.spi.ts were the three, and all three accept POSTs that
       create records. Authentication bounds WHO can do it; it does not
       bound how often, so a stuck retry loop or a stolen token wrote
       until something else broke.

       60 a minute, matching routes.config.ts — this is a safety manager
       adding entries on a working screen, not a reporter at a strip, so
       the limit only has to be below "a script". The tighter number
       belongs on routes.attachments.ts, which is the one that writes
       megabytes. */
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  };

  app.get("/api/v1/changes", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "moc.create") && !guard(req.auth!.role, "moc.approve")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const rows = await prisma.changeAssessment.findMany({
      where: tenantWhere(req),
      orderBy: [{ assessedOn: "desc" }],
      take: LIST_LIMIT,
      include: { approvedBy: { select: { name: true, role: true } } },
    });
    return reply.send({ changes: rows });
  });

  app.post("/api/v1/changes", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "moc.create")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = ChangeInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }
    const c = parsed.data;

    /* Computed on write from the same module /methodology renders and
       the register scores against. Stored, for the reason set out on
       RiskAssessment: an assessment is a decision taken on a date under
       the matrix as it stood. */
    const score = riskScore(c.severity as Severity, c.likelihood as Likelihood);
    const band = tolerability(c.severity as Severity, c.likelihood as Likelihood);
    const residual =
      c.residualSeverity && c.residualLikelihood
        ? {
            residualSeverity: c.residualSeverity,
            residualLikelihood: c.residualLikelihood,
            residualScore: riskScore(
              c.residualSeverity as Severity,
              c.residualLikelihood as Likelihood,
            ),
            residualTolerability: tolerability(
              c.residualSeverity as Severity,
              c.residualLikelihood as Likelihood,
            ),
          }
        : {};

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.changeAssessment.create({
        data: {
          orgId: req.auth!.org,
          title: c.title,
          description: c.description,
          trigger: c.trigger,
          assessedOn: at(c.assessedOn),
          ...(c.effectiveFrom ? { effectiveFrom: at(c.effectiveFrom) } : {}),
          severity: c.severity,
          likelihood: c.likelihood,
          score,
          tolerability: band,
          ...(c.controls ? { controls: c.controls } : {}),
          ...residual,
          ...(c.reviewDueOn ? { reviewDueOn: at(c.reviewDueOn) } : {}),
          status: "ASSESSED",
        },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "change.assess",
        entityType: "ChangeAssessment",
        entityId: row.id,
      });
      return row;
    });

    return reply.code(201).send({ change: created });
  });

  app.post("/api/v1/changes/:id/approve", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "moc.approve")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { id } = req.params as { id: string };
    if (!ApprovalInput.safeParse(req.body ?? {}).success) {
      return reply.code(400).send({ error: "invalid" });
    }

    const change = await prisma.changeAssessment.findFirst({
      where: { ...tenantWhere(req), id },
      select: { id: true, approvedAt: true, residualTolerability: true, tolerability: true },
    });
    if (!change) return reply.code(404).send({ error: "not_found" });
    if (change.approvedAt) {
      return reply.code(409).send({
        error: "already_approved",
        message: "This change has already been approved. Approving twice would overwrite who signed it.",
      });
    }

    /* THE SAME REFUSAL THE SRA MAKES, and for the same reason. Doc
       9859's red band is not "acceptable with sign-off from somebody
       sufficiently senior" — it is not acceptable at any level of
       benefit. The position that governs is the residual one where
       there is one, because that is what the controls leave behind. */
    /* THE SAME RULE THE REGISTER ENFORCES, from the same module, so
       there is one answer in this product to "who is senior enough".

       This is where the red refusal now comes from too. It used to be
       written out here, correctly, and separately — two files agreeing
       by coincidence about the most consequential refusal either makes.
       `refuseSignature` returns `not_ownable` for INTOLERABLE with the
       same sentence, and `below_authority` for a tolerable change
       somebody below the accountable executive tried to sign, which is
       what this route could not see before: `moc.approve` is held by
       KEY_MANAGEMENT as well, so a head of department could sign for an
       amber change that RA 1210 puts a tier above them. */
    const governing = change.residualTolerability ?? change.tolerability;
    const refusal = refuseSignature(governing, req.auth!.role);
    if (refusal) {
      return reply.code(refusal.error === "not_ownable" ? 409 : 403).send({
        error: refusal.error === "not_ownable" ? "intolerable" : refusal.error,
        requires: refusal.requires,
        message:
          refusal.error === "not_ownable"
            ? "This change carries an intolerable risk after its controls. It cannot be " +
              "approved — the controls have to change, not the signature."
            : refusal.message,
      });
    }

    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.changeAssessment.update({
        where: { id: change.id },
        data: { approvedById: req.auth!.sub, approvedAt: new Date(), status: "APPROVED" },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "change.approve",
        entityType: "ChangeAssessment",
        entityId: row.id,
      });
      return row;
    });

    return reply.send({ change: saved });
  });

  app.post("/api/v1/changes/:id/review", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "moc.create")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { id } = req.params as { id: string };
    const parsed = ReviewInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }

    const change = await prisma.changeAssessment.findFirst({
      where: { ...tenantWhere(req), id },
      select: { id: true },
    });
    if (!change) return reply.code(404).send({ error: "not_found" });

    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.changeAssessment.update({
        where: { id: change.id },
        data: {
          reviewedOn: at(parsed.data.reviewedOn),
          reviewNotes: parsed.data.reviewNotes,
          status: "REVIEWED",
        },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "change.review",
        entityType: "ChangeAssessment",
        entityId: row.id,
      });
      return row;
    });

    return reply.send({ change: saved });
  });
}
