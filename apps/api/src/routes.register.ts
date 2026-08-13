// =====================================================================
// ELEMENTS 2.1 and 2.2 — the standing risk register.
//
// WHAT THIS IS NOT. It is not a second risk assessment. The matrix, the
// score and the tolerability are computed by packages/shared/src/risk.ts
// and always were; /toolkits/sra already drives them through Doc 9859's
// five steps. What was missing is the REGISTER: the same hazards held
// somewhere the safety office can see, with an owner, a review date and
// a status.
//
// The distinction matters because it is the audit finding. An
// assessment answers "how bad is this". A register answers "what are we
// doing about it, who owns it, and when do we look again" — and a
// hazard with no owner and no review date has been assessed and not
// managed.
//
// THE SCORE IS STORED HERE, AND THAT IS NOT A CHARTER RULE 6 BREACH.
// A deadline is a property of law and changes underneath you, so it is
// computed on every read. An assessment is a decision taken on a date,
// under the matrix as it stood. If the matrix is ever revised, historic
// entries must keep the classification they were accepted under —
// recomputing them would rewrite decisions people signed. The schema
// has carried that reasoning since the model was written; this route
// honours it by computing on write and never on read.
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
import { prisma, authenticate, appendAuditTx, tenantWhere } from "./core";

const LIST_LIMIT = 200;

function guard(role: string, permission: Permission): boolean {
  return can(role as never, permission);
}

/* The Prisma enum's own spelling, prefixed A_ to E_ so the database
   orders them by severity rather than alphabetically. Restated here
   rather than imported because zod needs literals; the typecheck is
   what keeps the two in step, and it caught this the first time. */
const SEVERITIES = [
  "A_CATASTROPHIC", "B_HAZARDOUS", "C_MAJOR", "D_MINOR", "E_NEGLIGIBLE",
] as const;
const LIKELIHOODS = [
  "FREQUENT", "OCCASIONAL", "REMOTE", "IMPROBABLE", "EXTREMELY_IMPROBABLE",
] as const;
const STATUSES = ["OPEN", "MITIGATED", "ACCEPTED", "CLOSED"] as const;

const EntrySchema = z.object({
  hazard: z.string().trim().min(1).max(200),
  consequence: z.string().trim().min(1).max(4000),
  severity: z.enum(SEVERITIES),
  likelihood: z.enum(LIKELIHOODS),
  controls: z.string().trim().max(4000).optional(),
  /* The residual pair travels together or not at all. Half of it is a
     control whose effect nobody stated, and it would render as a
     residual position the entry does not have. */
  residualSeverity: z.enum(SEVERITIES).optional(),
  residualLikelihood: z.enum(LIKELIHOODS).optional(),
  owner: z.string().trim().max(160).optional(),
  reviewBy: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(STATUSES).default("OPEN"),
}).refine(
  (e) => Boolean(e.residualSeverity) === Boolean(e.residualLikelihood),
  { message: "A residual position needs both a severity and a likelihood, or neither." },
);

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const limited = { preHandler: authenticate };

  app.get("/api/v1/register", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "hazard.manage") && !guard(req.auth!.role, "report.read.org")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const hazards = await prisma.hazard.findMany({
      where: tenantWhere(req),
      orderBy: [{ createdAt: "desc" }],
      take: LIST_LIMIT,
      include: {
        assessments: {
          orderBy: [{ createdAt: "desc" }],
          take: 1,
          select: {
            id: true, consequence: true, severity: true, likelihood: true,
            score: true, tolerability: true, controls: true,
            residualSeverity: true, residualLikelihood: true,
            residualScore: true, residualTolerability: true,
            owner: true, reviewBy: true, status: true,
          },
        },
      },
    });

    /* Flattened to what the register screen works in. A hazard with no
       assessment is dropped rather than returned half-formed: the
       register is a list of assessed hazards, and one without an
       assessment belongs to whatever created it. */
    const entries = hazards
      .filter((h) => h.assessments[0])
      .map((h) => {
        const a = h.assessments[0]!;
        return {
          id: h.id,
          assessmentId: a.id,
          hazard: h.title,
          consequence: a.consequence,
          severity: a.severity,
          likelihood: a.likelihood,
          controls: a.controls ?? "",
          residualSeverity: a.residualSeverity ?? undefined,
          residualLikelihood: a.residualLikelihood ?? undefined,
          owner: a.owner ?? "",
          reviewBy: a.reviewBy ? a.reviewBy.toISOString().slice(0, 10) : "",
          status: a.status,
        };
      });

    return reply.send({ entries });
  });

  app.post("/api/v1/register", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "hazard.manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = EntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }
    const e = parsed.data;

    /* COMPUTED ON WRITE, from the same module the matrix on
       /methodology renders and the SRA scores against. An entry whose
       stored band disagrees with the scale it was scored on is a
       register an auditor stops trusting, and the only way to guarantee
       they agree is for one function to produce both. */
    const score = riskScore(e.severity as Severity, e.likelihood as Likelihood);
    const band = tolerability(e.severity as Severity, e.likelihood as Likelihood);
    const residual =
      e.residualSeverity && e.residualLikelihood
        ? {
            residualSeverity: e.residualSeverity,
            residualLikelihood: e.residualLikelihood,
            residualScore: riskScore(
              e.residualSeverity as Severity,
              e.residualLikelihood as Likelihood,
            ),
            residualTolerability: tolerability(
              e.residualSeverity as Severity,
              e.residualLikelihood as Likelihood,
            ),
          }
        : {};

    const created = await prisma.$transaction(async (tx) => {
      const hazard = await tx.hazard.create({
        data: {
          orgId: req.auth!.org,
          title: e.hazard,
          description: e.consequence,
          /* Named so the register can tell a hazard somebody typed from
             one that arrived on a report. The reporting queue is not
             wired into this yet, and /coverage says so. */
          source: "REGISTER",
        },
      });
      const assessment = await tx.riskAssessment.create({
        data: {
          orgId: req.auth!.org,
          hazardId: hazard.id,
          consequence: e.consequence,
          severity: e.severity,
          likelihood: e.likelihood,
          score,
          tolerability: band,
          ...(e.controls ? { controls: e.controls } : {}),
          ...residual,
          ...(e.owner ? { owner: e.owner } : {}),
          ...(e.reviewBy ? { reviewBy: new Date(`${e.reviewBy}T00:00:00.000Z`) } : {}),
          status: e.status,
        },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "risk.register.entry",
        entityType: "RiskAssessment",
        entityId: assessment.id,
      });
      return { hazard, assessment };
    });

    return reply.code(201).send({
      entry: {
        id: created.hazard.id,
        assessmentId: created.assessment.id,
        hazard: created.hazard.title,
        consequence: created.assessment.consequence,
        severity: created.assessment.severity,
        likelihood: created.assessment.likelihood,
        controls: created.assessment.controls ?? "",
        residualSeverity: created.assessment.residualSeverity ?? undefined,
        residualLikelihood: created.assessment.residualLikelihood ?? undefined,
        owner: created.assessment.owner ?? "",
        reviewBy: created.assessment.reviewBy
          ? created.assessment.reviewBy.toISOString().slice(0, 10)
          : "",
        status: created.assessment.status,
      },
    });
  });
}
