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
/* Relative, not through the barrel. The barrel is imported by the
   report form, and this module freezes a record at module scope — a
   side-effectful expression Rollup cannot tree-shake — so re-exporting
   it would put the authority ladder in the entry chunk a ramp agent
   downloads before they can file anything. Same reason permissions.ts
   was split out. */
import { refuseSignature } from "../../../packages/shared/src/signature";
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

/* ---------------------------------------------------------------
   ACCEPTED IS NOT A STATUS SOMEBODY TYPES.

   It was, and this is what that allowed: `hazard.manage` is held by the
   Safety Officer — correctly, they are the post that maintains the
   register — and this route took `status` from the body. So a safety
   officer could create an entry scored 5A, the reddest cell on the Doc
   9859 matrix, with status ACCEPTED. Nothing checked the acceptance
   permissions (no route read either of them), nothing recorded who
   accepted it (acceptedById has never been written by anything), and
   nothing consulted the authority rule.

   The register then reads "accepted" against a risk nobody with the
   standing to accept it ever saw. That is the exact failure the MAA's
   RA 1210 escalation exists to prevent, and this product had the rule
   written down in packages/shared/src/holder.ts while the act it
   governs went through a text field.

   So acceptance is its own verb below, with its own permission, its own
   signature and its own refusals. The status enum keeps the value —
   it is a real state and the screen renders it — but this route will
   not set it. */
const SETTABLE_ON_CREATE = ["OPEN", "MITIGATED", "CLOSED"] as const;

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
  status: z.enum(SETTABLE_ON_CREATE).default("OPEN"),
  /* ------------------------------------------------------------------
     THE REPORT THIS CAME OUT OF.

     `Hazard.reportId` and `Hazard.source` have been in the schema since
     the first migration and nothing has ever written the first one. So
     every hazard in every register was typed by hand, and the two
     halves of this product did not touch: reports arrived, were
     triaged, coded to ICAO's categories and dispositioned, while the
     register held whatever somebody remembered to write down again.

     That is the finding element 2.1 exists to prevent — hazard
     identification is meant to be FED by the reporting system — and
     /coverage has been saying so in element 2.2's `missing` field in
     the meantime.

     WHAT DOES NOT TRAVEL IS THE NARRATIVE, and that is the whole
     design of this field. A register is printed, taken to a meeting and
     shown to an inspector; a report narrative is protected, may be
     anonymous, and is de-identified before it goes anywhere wider. So
     the link is an ID and nothing else. The hazard's own words are
     written by the person raising it, which is also what an SMS
     actually asks for: a hazard is the general condition a safety
     officer abstracts from one or more reports, not a copy of one.
     ------------------------------------------------------------------ */
  fromReportId: z.string().uuid().optional(),
}).refine(
  (e) => Boolean(e.residualSeverity) === Boolean(e.residualLikelihood),
  { message: "A residual position needs both a severity and a likelihood, or neither." },
);

export async function registerRoutes(app: FastifyInstance): Promise<void> {
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
            acceptedById: true, acceptedAt: true, alarpJustification: true,
          },
        },
      },
    });

    /* WHO SIGNED, resolved in one query rather than joined.
       `acceptedById` is a plain column with no relation — adding one
       would be a foreign key and a migration for a name this screen
       renders and nothing else reads. An acceptance whose signatory
       cannot be named is the half-attributed record the print header
       already refuses, so it is worth the extra round trip. */
    const acceptorIds = [
      ...new Set(
        hazards.map((h) => h.assessments[0]?.acceptedById).filter((id): id is string => !!id),
      ),
    ];
    const acceptors = acceptorIds.length
      ? await prisma.user.findMany({
          where: { orgId: req.auth!.org, id: { in: acceptorIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameOf = new Map(acceptors.map((u) => [u.id, u.name]));

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
          /* WHERE IT CAME FROM, rendered rather than inferred. An
             operator asked "how much of your register came from your
             own people" has to be able to answer it, and a register
             that cannot tell a typed hazard from a reported one cannot.
             The report's ID travels; nothing of its content does. */
          source: h.source,
          fromReportId: h.reportId ?? undefined,
          consequence: a.consequence,
          severity: a.severity,
          likelihood: a.likelihood,
          controls: a.controls ?? "",
          residualSeverity: a.residualSeverity ?? undefined,
          residualLikelihood: a.residualLikelihood ?? undefined,
          owner: a.owner ?? "",
          reviewBy: a.reviewBy ? a.reviewBy.toISOString().slice(0, 10) : "",
          status: a.status,
          acceptedAt: a.acceptedAt ? a.acceptedAt.toISOString().slice(0, 10) : "",
          /* Empty rather than "Unknown" when the acceptor has since been
             offboarded: a name this product cannot verify is worse than
             a date and an audit trail that can be read. */
          acceptedBy: (a.acceptedById && nameOf.get(a.acceptedById)) || "",
          alarpJustification: a.alarpJustification ?? "",
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

    /* THE REPORT IS CHECKED IN THIS TENANT BEFORE IT IS LINKED, not
       trusted from the body. `reportId` is a foreign key, so a stranger's
       id would either be accepted — putting one operator's report id in
       another's register — or fail with a constraint error the caller
       cannot act on. Neither is an answer, so it is looked up under
       tenantWhere and refused by name. */
    if (e.fromReportId) {
      const report = await prisma.safetyReport.findFirst({
        where: { ...tenantWhere(req), id: e.fromReportId },
        select: { id: true },
      });
      if (!report) {
        return reply.code(404).send({
          error: "report_not_found",
          message:
            "That report is not one of this operator's. A register entry can only be " +
            "raised from a report the safety office actually holds.",
        });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const hazard = await tx.hazard.create({
        data: {
          orgId: req.auth!.org,
          title: e.hazard,
          description: e.consequence,
          /* Named so the register can tell a hazard somebody typed from
             one that arrived on a report — and so an operator can be
             asked the question an auditor actually asks, which is what
             proportion of its register came from its own people. */
          ...(e.fromReportId ? { reportId: e.fromReportId } : {}),
          source: e.fromReportId ? "REPORT" : "REGISTER",
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
        source: created.hazard.source,
        fromReportId: created.hazard.reportId ?? undefined,
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

  /* ==================================================================
     ACCEPTING A RISK — the act the authority rule governs.

     Four refusals, in this order, because each one makes the next
     question meaningful:

       1. the PERMISSION — may this role accept risks at all;
       2. the BAND — an intolerable risk is refused to everybody,
          including the accountable executive. Doc 9859's red is not
          "acceptable with a senior enough signature";
       3. the AUTHORITY — RA 1210. A tolerable risk is being accepted
          because reducing it further is not reasonably practicable,
          which is a judgement about money against safety, so it belongs
          with the post that can spend it;
       4. ALARP — a tolerable risk with no justification is an
          unaccepted risk wearing a signature. RiskAssessInputSchema has
          required this since the SRA was written; the register was
          created with its own schema and never inherited it.

     THE RESIDUAL POSITION GOVERNS where there is one, the same as the
     change route. What an operator is accepting is what the controls
     leave behind, not what it looked like before them.

     ACCEPTANCE IS NOT REVERSIBLE BY REPEATING IT. A second acceptance
     would overwrite who signed the first, which is the one field an
     auditor reads. Re-accepting after the controls change is a new
     assessment — that is what a register revision is for.
     ================================================================== */
  const AcceptSchema = z.object({
    alarpJustification: z.string().trim().max(4000).optional(),
  });

  app.post("/api/v1/register/:assessmentId/accept", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "risk.accept.tolerable")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = AcceptSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }

    const { assessmentId } = req.params as { assessmentId: string };
    const assessment = await prisma.riskAssessment.findFirst({
      where: { ...tenantWhere(req), id: assessmentId },
      select: {
        id: true, tolerability: true, residualTolerability: true,
        acceptedAt: true, alarpJustification: true,
      },
    });
    if (!assessment) return reply.code(404).send({ error: "not_found" });

    if (assessment.acceptedAt) {
      return reply.code(409).send({
        error: "already_accepted",
        message:
          "This risk has already been accepted. Accepting it twice would overwrite who " +
          "signed it — if the position has changed, assess it again.",
      });
    }

    const governing = assessment.residualTolerability ?? assessment.tolerability;
    const refusal = refuseSignature(governing, req.auth!.role);
    if (refusal) {
      return reply.code(refusal.error === "not_ownable" ? 409 : 403).send({
        error: refusal.error,
        requires: refusal.requires,
        message: refusal.message,
      });
    }

    const alarp = parsed.data.alarpJustification ?? assessment.alarpJustification ?? "";
    if (governing === "TOLERABLE" && !alarp.trim()) {
      return reply.code(400).send({
        error: "alarp_required",
        message:
          "A tolerable risk is only tolerable once it has been driven as low as " +
          "reasonably practicable. Say what was done and why going further is not " +
          "reasonably practicable — that statement is the acceptance.",
      });
    }

    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.riskAssessment.update({
        where: { id: assessment.id },
        data: {
          acceptedById: req.auth!.sub,
          acceptedAt: new Date(),
          status: "ACCEPTED",
          ...(alarp.trim() ? { alarpJustification: alarp.trim() } : {}),
        },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        /* Named for the band it was accepted in. An audit trail that
           says only "risk.accept" cannot answer the question an
           inspector actually asks, which is who accepted the amber
           ones. */
        action: `risk.accept.${governing.toLowerCase()}`,
        entityType: "RiskAssessment",
        entityId: row.id,
      });
      return row;
    });

    return reply.send({
      accepted: {
        assessmentId: saved.id,
        acceptedAt: saved.acceptedAt?.toISOString() ?? null,
        band: governing,
        status: saved.status,
      },
    });
  });
}
