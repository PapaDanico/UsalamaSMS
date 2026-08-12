// =====================================================================
// UsalamaSMS API — the operator's own copy.
//
// The terms of use say: "Export exists so that an operator can hold its
// own copy, which is the only form of data ownership that survives a
// vendor." That sentence has been on a customer surface for weeks with
// nothing behind it. Charter rule 7 — a claim on a customer surface
// must be kept by a mechanism — and this is the mechanism.
//
// WHAT MAKES THIS MORE THAN A SELECT. Three things, and each is a way
// an export can quietly do harm:
//
//   · AN EXPORT MUST NOT UNDO DE-IDENTIFICATION. A voluntary report
//     that has been through the pipeline had its narrative replaced and
//     its reporter nulled in the row itself, so there is nothing left
//     to leak here — but that is a property of the schema, not of this
//     file, and a test asserts it from this endpoint rather than
//     trusting it.
//
//   · AN EXPORT MUST NOT RE-IDENTIFY AN ANONYMOUS REPORTER. The audit
//     entry for an anonymous filing already carries no actor, which is
//     the fix C-01 made for conflict receipts. The same join is
//     available here — audit entries are keyed to the report id — so
//     the property is asserted again against this payload.
//
//   · A COPY THAT CANNOT BE CHECKED IS NOT A RECORD. The whole value
//     of a hash-chained log is that a reader can verify it without
//     believing the vendor. The export therefore carries the chain
//     itself AND the verdict computed at the moment of export, so an
//     operator can re-derive the second from the first.
//
// WHAT IS DELIBERATELY LEFT OUT:
//
//   · sync receipts. They carry `deviceHash` — an HMAC of the device
//     id, kept so a duplicate filing can be detected. It is stable per
//     device, so a file containing it lets a reader CLUSTER anonymous
//     reports by handset, which is most of the way to identifying the
//     person at a six-aircraft operator. It is a delivery mechanism,
//     not a safety record, and it does not travel;
//   · password hashes, MFA secrets and refresh tokens. An export is a
//     file that leaves the building.
// =====================================================================
import type { FastifyInstance } from "fastify";
import { can, type Permission } from "@usalamasms/shared";
import { prisma, authenticate, appendAudit, tenantWhere, verifyAuditChain } from "./core";

/** The schema version of the payload, so a reader knows what it holds. */
const EXPORT_FORMAT = 1;

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  /* A tighter window than the SMS routes deliberately. This is the most
     expensive read in the product and the one whose output is worth the
     most to somebody who should not have it, so a leaked token buys
     fewer complete copies before the limit bites. */
  const limited = {
    preHandler: [authenticate],
    config: { rateLimit: { max: 6, timeWindow: "1 minute" } },
  };

  app.get(
    "/api/v1/export",
    limited,
    async (req, reply) => {
      if (!can(req.auth!.role as never, "org.export" as Permission)) {
        return reply.code(403).send({
          error: "forbidden",
          detail:
            "Taking a copy of the whole safety record is held by the safety manager " +
            "and the accountable executive.",
        });
      }

      const where = tenantWhere(req);

      /* Every one of these is scoped in the WHERE rather than filtered
         after loading. Ten collections is ten chances to forget, and an
         export is the single request where forgetting means another
         operator's narratives land in a file somebody emails. */
      const [
        org, users, reports, hazards, riskAssessments, policies, accountabilities,
        appointments, exercises, documents, findings, training, communications, auditLog,
      ] = await Promise.all([
        prisma.org.findUnique({
          where: { id: req.auth!.org },
          select: { id: true, name: true, jurisdiction: true, createdAt: true },
        }),
        prisma.user.findMany({
          where,
          orderBy: [{ name: "asc" }],
          // No passwordHash and no mfaSecret. Email stays: an operator
          // that cannot tell which account was whose has a copy of its
          // record and no way to stand it up again, which is the thing
          // the terms promise it will have.
          select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
        }),
        prisma.safetyReport.findMany({ where, orderBy: [{ createdAt: "asc" }] }),
        prisma.hazard.findMany({ where, orderBy: [{ createdAt: "asc" }] }),
        prisma.riskAssessment.findMany({ where, orderBy: [{ createdAt: "asc" }] }),
        prisma.safetyPolicy.findMany({ where, orderBy: [{ version: "asc" }] }),
        prisma.accountability.findMany({ where, orderBy: [{ post: "asc" }] }),
        prisma.appointment.findMany({ where, orderBy: [{ appointedOn: "asc" }] }),
        prisma.emergencyExercise.findMany({ where, orderBy: [{ heldOn: "asc" }] }),
        prisma.controlledDocument.findMany({ where, orderBy: [{ reference: "asc" }] }),
        prisma.auditFinding.findMany({ where, orderBy: [{ createdAt: "asc" }] }),
        prisma.trainingRecord.findMany({ where, orderBy: [{ completedOn: "asc" }] }),
        prisma.safetyCommunication.findMany({ where, orderBy: [{ publishedOn: "asc" }] }),
        prisma.auditLog.findMany({ where, orderBy: [{ seq: "asc" }] }),
      ]);

      /* Computed at the moment of export and shipped alongside the
         chain it describes, so the operator can re-derive it. A verdict
         with no chain is an assurance; a chain with no verdict is
         homework. Both, or it is not a record. */
      const chain = await verifyAuditChain(req.auth!.org);

      /* Taking a complete copy of an organisation's safety record is
         itself an event in that record. It is appended BEFORE the reply
         rather than after, so a failure to record it fails the export
         rather than producing an unrecorded one — and it lands in the
         chain the NEXT export will carry. */
      await appendAudit({
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "org.export",
        entityType: "Org",
        entityId: req.auth!.org,
        detail: {
          reports: reports.length,
          auditEntries: auditLog.length,
          chainOk: chain.ok,
        },
      });

      /* `seq` is a BigInt, and JSON.stringify throws on one rather than
         rendering it — so the whole export answered 500, on the success
         path, for every caller. Serialised as a decimal STRING rather
         than coerced to a number: the sequence is the thing a reader
         walks to verify the chain, and a number silently loses
         precision past 2^53 while a string never does. */
      const chainEntries = auditLog.map((e) => ({ ...e, seq: e.seq.toString() }));

      const filename = `usalamasms-export-${req.auth!.org}.json`;
      return reply
        .header("content-disposition", `attachment; filename="${filename}"`)
        .send({
          format: EXPORT_FORMAT,
          exportedAt: new Date().toISOString(),
          exportedBy: req.auth!.sub,
          org,
          /* The verdict describes the chain AS EXPORTED — the entry
             recording this export is appended above and so is not in
             `auditLog` below. That is stated rather than hidden: a
             reader who verifies this file and finds the last entry
             missing should know it is by construction. */
          /* THREE STATES, NOT TWO, and the third is why this is not
             just `ok`. verifyAuditChain() returns ok:false for an org
             with no entries at all — deliberately, under charter rule
             11: a wiped table must not pass as a clean bill of health.
             That is right for the verifier and wrong to hand an
             operator unexplained, because the first export a new
             operator takes has an empty log and `ok: false` reads as
             "your record is corrupt" at the exact moment they are
             deciding whether to trust it.

             So the verdict is passed through untouched — never
             softened — and `state` says which of the three situations
             produced it. */
          chain: {
            ok: chain.ok,
            entries: chainEntries.length,
            state: chainEntries.length === 0 ? "empty" : chain.ok ? "verified" : "broken",
            note:
              chainEntries.length === 0
                ? "This operator has no log entries yet, so there is nothing to verify. " +
                  "That is why ok is false: an empty chain is reported as unverified " +
                  "rather than as verified, so a wiped log cannot pass as a clean one."
                : chain.ok
                  ? "Every entry links to the one before it. The entry recording this " +
                    "export is appended before the file is built, so it appears in the " +
                    "NEXT export rather than this one."
                  : "The chain does not verify. Entries are present but at least one does " +
                    "not link to the one before it. Raise this before relying on the file.",
          },
          reports,
          hazards,
          riskAssessments,
          policies,
          accountabilities,
          appointments,
          exercises,
          documents,
          findings,
          training,
          communications,
          users,
          auditLog: chainEntries,
        });
    },
  );
}
