/* =====================================================================
   THE KCAA HANDOFF, GIVEN A DOOR.

   `packages/shared/src/icaas.ts` composes a corrective action into the
   pack the Authority's ICAAS portal asks for. It was written, it was
   documented, it was covered by a suite — and until this file existed
   NOTHING IMPORTED IT. Not a route, not a screen, not the barrel. A
   whole feature, correct and unreachable, while every gate in the
   repository stayed green because each was looking at a layer that did
   not include it. `check:claims` now asserts that a shared module with
   no product importer is a failure; this route is the other half of
   the answer.

   ---------------------------------------------------------------
   THIS ROUTE DOES NOT SUBMIT ANYTHING, and cannot be made to.

   There is no ICAAS API. `SUBMITS_TO_AUTHORITY` is false in the shared
   module and this file re-sends it on every response rather than
   letting a screen remember it, because the single worst outcome here
   is an operator believing a corrective action reached KCAA when it
   did not. They would stop chasing it. Everything below composes and
   hands over; the operator signs in and uploads, and knows they did.

   ---------------------------------------------------------------
   IT READS THREE MODELS, AND CHECKS THE PERMISSION OF EACH.

   CLAUDE.md records why, in the words of the defect that taught it:
   `/api/v1/picture` gated once at the door, and for one commit a
   SAFETY_OFFICER read from it the full text of an audit finding that
   `/api/v1/sms/findings` answers 403 for. An aggregate does not read
   like a read of the underlying table — it reads like arithmetic — so
   the permission is checked per collection.

     CorrectiveAction  `report.read.org`  — the gate /api/v1/actions
                                            uses to LIST them;
     AuditFinding      `audit.read`       — the gate /api/v1/sms/findings
                                            uses;
     ReportAttachment  `report.read.org`  — the gate
                                            /api/v1/reports/:id/attachments uses.

   And what a caller may not see is NAMED. That rule earns its keep
   here more than anywhere else it has been applied: a CAP is a
   document an operator signs and hands to their regulator. A pack
   silently missing its CAR reference is one they raise against the
   wrong finding.
   ===================================================================== */
import type { FastifyInstance } from "fastify";
import { can } from "@usalamasms/shared";
import {
  composeCap, SUBMITS_TO_AUTHORITY, ICAAS_PORTAL, ICAAS_SOURCE,
  CAP_STEPS, PREREQUISITES,
} from "../../../packages/shared/src/icaas";
import { prisma, authenticate, tenantWhere, requireEntitlement } from "./core";

export async function icaasRoutes(app: FastifyInstance): Promise<void> {
  /* GENERATE_DOCUMENT rather than a fresh capability. Composing a pack
     is document generation by any reading, and inventing a capability
     for it would put a new row in SURVIVES_LAPSE that somebody has to
     decide about for no gain. It does not survive lapse — a lapsed
     operator keeps FILE_REPORT, READ_OWN_RECORD and EXPORT_OWN_RECORD,
     so nothing they have already recorded becomes unreachable. */
  const composed = {
    preHandler: [authenticate, requireEntitlement("GENERATE_DOCUMENT")],
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  };

  app.get<{ Params: { id: string } }>(
    "/api/v1/icaas/cap/:id",
    composed,
    async (req, reply) => {
      const auth = req.auth!;

      /* 1. THE ACTION. Same permission /api/v1/actions lists them
            behind, so this discloses nothing that endpoint does not. */
      if (!can(auth.role as never, "report.read.org")) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const action = await prisma.correctiveAction.findFirst({
        /* tenantWhere FIRST, and the id as a further condition rather
           than a findUnique with a tenancy check after — one query that
           cannot return another operator's row is safer than two
           statements that must be read together to see that it cannot. */
        where: { ...tenantWhere(req), id: req.params.id },
        select: {
          id: true, action: true, ownerPost: true, dueOn: true,
          completedOn: true, verifiedOn: true, cancelledOn: true,
          findingId: true, reportId: true,
        },
      });
      if (!action) return reply.code(404).send({ error: "not_found" });

      /* 2. THE FINDING, behind its own permission.

            WITHHELD IS NOT ABSENT, and composeCap is told which. If
            this passed `finding: null` for a reader without
            `audit.read`, the pack would say "No audit finding is
            linked… pick the matching one yourself" about an action
            that HAS one — sending an operator to the portal to guess
            at a reference this product is holding. */
      const mayReadFindings = can(auth.role as never, "audit.read");
      const withheld: string[] = [];

      let finding: { finding: string; auditRef: string } | null = null;
      if (action.findingId && mayReadFindings) {
        const row = await prisma.auditFinding.findFirst({
          where: { ...tenantWhere(req), id: action.findingId },
          select: { finding: true, auditRef: true },
        });
        if (row) finding = row;
      }
      if (action.findingId && !mayReadFindings) {
        withheld.push(
          "The linked audit finding and its CAR reference — these need audit access.",
        );
      }

      /* 3. THE EVIDENCE, behind the permission its own endpoint uses.

            Attachments hang off the REPORT, and an action raised from a
            finding, a register entry or a change has no report — so an
            empty list here is usually a true empty list rather than a
            withholding. Both are possible, which is exactly why the
            two are reported separately below.

            The BYTES are never read: a hash and a label are what a pack
            needs to say which file to upload, and streaming evidence
            through a document composer would be a second copy of the
            photograph in a response nobody asked to carry it in. */
      const mayReadEvidence = can(auth.role as never, "report.read.org");
      let attachments: { label: string; sha256: string }[] = [];
      if (action.reportId && mayReadEvidence) {
        const rows = await prisma.reportAttachment.findMany({
          where: { ...tenantWhere(req), reportId: action.reportId },
          select: { label: true, sha256: true },
          take: 50,
        });
        attachments = rows.map((r) => ({
          label: r.label ?? "Untitled",
          sha256: r.sha256,
        }));
      }
      if (action.reportId && !mayReadEvidence) {
        withheld.push("Files attached to the originating report — these need report access.");
      }

      const pack = composeCap({
        ...action,
        finding,
        findingWithheld: Boolean(action.findingId) && !mayReadFindings,
        attachments,
      });

      return reply.send({
        /* Re-sent on every response rather than compiled into a screen.
           A constant a client caches is a constant a client can be
           wrong about, and this is the one fact in the feature that
           must never be wrong. */
        submitsToAuthority: SUBMITS_TO_AUTHORITY,
        portal: ICAAS_PORTAL,
        source: ICAAS_SOURCE,
        steps: CAP_STEPS,
        prerequisites: PREREQUISITES,
        pack,
        /* Named, not dropped. An empty array means nothing was hidden
           from this reader — which is a different statement from a
           pack that happens to look complete. */
        withheld,
      });
    },
  );
}
