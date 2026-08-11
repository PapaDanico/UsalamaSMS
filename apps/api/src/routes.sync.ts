// =====================================================================
// UsalamaSMS API — /api/v1/sync/batch
// Idempotent apply of offline-created entities. Server-wins conflicts.
// =====================================================================
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import {
  SyncBatchSchema, CreateReportSchema, can,
  type Permission,
} from "@usalamasms/shared";
import { prisma, authenticate, appendAuditTx, hmac } from "./core";

type ItemResult = {
  clientId: string;
  status: "applied" | "duplicate" | "conflict" | "rejected" | "forbidden";
  serverUpdatedAt?: string;
};

/**
 * The permission each entity/op pair actually requires.
 *
 * The route previously ran a single `requirePermission("report.create")`
 * preHandler for the whole batch. A batch is not one operation — it is
 * up to a hundred, spanning three entity types — and authorising them
 * all against one permission is a guard that only appears to be one.
 * It happened not to be exploitable because every non-report branch fell
 * through to `rejected`, but that is a property of the handler's shape,
 * not of the check, and the next entity handler added would have
 * inherited an authorisation it was never granted.
 */
const REQUIRED_PERMISSION: Record<string, Permission> = {
  "safetyReport:CREATE": "report.create",
  "safetyReport:UPDATE": "report.triage",
  "hazard:CREATE": "hazard.manage",
  "hazard:UPDATE": "hazard.manage",
  "riskAssessment:CREATE": "risk.assess",
  "riskAssessment:UPDATE": "risk.assess",
};

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/sync/batch", {
    // Authentication only. Authorisation is per item, below.
    preHandler: [authenticate],
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const parsed = SyncBatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_batch" });
    const { deviceId, items } = parsed.data;
    const auth = req.auth!;
    const results: ItemResult[] = [];

    for (const item of items) {
      const needed = REQUIRED_PERMISSION[`${item.entityType}:${item.op}`];
      if (!needed || !can(auth.role, needed)) {
        results.push({ clientId: item.clientId, status: "forbidden" });
        continue;
      }

      // Idempotency. Scoped to the ORG as well as the clientId: the
      // receipt table is global and clientId is client-generated, so an
      // unscoped lookup answered "does this id exist anywhere?" for any
      // authenticated caller. That is a cross-tenant existence oracle —
      // small, but it leaks across exactly the boundary this product
      // promises to hold, and competitors share this platform.
      //
      // SCOPED BY OP AS WELL. It was not, and clientId identifies the
      // ENTITY rather than the operation — the client generates one per
      // report and reuses it for every op on that report. So once a
      // report had been created through sync, every later UPDATE for it
      // matched the CREATE's receipt and came back "duplicate". The
      // client reads that as "the server already has it", deletes the
      // outbox item and marks the report synced. The edit is discarded
      // silently, on the device, with a success indication.
      //
      // Currently masked: the UPDATE branch below has no field handler
      // yet, so it ends in "rejected" regardless. It would have become a
      // live data-loss bug the day someone implemented one, and the
      // symptom — an edit that vanishes with no error anywhere — is
      // close to undiagnosable from a support conversation.
      //
      // Note what this does NOT give: repeated UPDATEs for one entity
      // are not yet idempotent between themselves, because a successful
      // update writes no receipt. That is honest for a path that does
      // not exist; it must be closed with the first field handler.
      const existing = await prisma.syncReceipt.findFirst({
        where: { clientId: item.clientId, orgId: auth.org, op: item.op },
      });
      if (existing) { results.push({ clientId: item.clientId, status: "duplicate" }); continue; }

      if (item.entityType === "safetyReport" && item.op === "CREATE") {
        const body = CreateReportSchema.safeParse(item.payload);
        if (!body.success) { results.push({ clientId: item.clientId, status: "rejected" }); continue; }
        const d = body.data;

        // The whole item is one transaction. The report, its receipt and
        // its audit entry commit together or not at all — previously a
        // crash between the create and the audit left a safety report
        // with no record of how it arrived.
        const created = await prisma.$transaction(async (tx) => {
          const report = await tx.safetyReport.create({
            data: {
              orgId: auth.org,
              clientId: d.clientId,
              type: d.type,
              title: d.title,
              narrative: d.narrative,
              occurredAt: d.occurredAt,
              // When the obligation started running. Defaulted to receipt
              // time — the earliest moment the server can actually prove
              // — and never to occurredAt. See packages/shared/src/
              // regulations.ts for why that distinction is the difference
              // between a 24-hour window and no window at all.
              awareAt: d.awareAt ?? new Date(),
              jurisdiction: d.jurisdiction,
              location: d.location,
              aircraftType: d.aircraftType,
              phase: d.phase,
              hrcTags: d.hrcTags,
              isAnonymous: d.isAnonymous,
              reporterId: d.isAnonymous ? null : auth.sub,
              // NOTE: no regulatorDeadline column is written. Charter
              // rule 6 — regulatory status is computed from today's
              // date, never stored. A stored deadline is a deadline that
              // stays wrong after occurredAt is corrected, and after the
              // regulator changes the rule.
            },
          });

          // ==========================================================
          // THE ANONYMITY FIX.
          //
          // This receipt used to be written as:
          //
          //     data: { clientId, deviceId, userId: auth.sub, ... }
          //
          // unconditionally — including for reports filed anonymously.
          // safetyReport.clientId and syncReceipt.clientId hold the same
          // value, so:
          //
          //     SELECT r.narrative, s.userId
          //       FROM "SafetyReport" r
          //       JOIN "SyncReceipt"  s USING ("clientId")
          //      WHERE r."isAnonymous"
          //
          // re-identified every anonymous reporter in the system. The
          // de-identification pipeline nulls reporterId and refuses
          // reversible encryption; the sync path handed the name back
          // through the side door. deviceId is no better — a device maps
          // to a person as reliably as a staff number.
          //
          // For an anonymous report the receipt now stores neither. It
          // keeps only what idempotency actually needs: which org, and
          // whether this clientId has been seen. The device is recorded
          // as a keyed hash so repeated submissions from one handset can
          // still be recognised as duplicates without the handset being
          // identifiable from the row.
          //
          // ICAO Annex 19 protects the reporter, and a confidential
          // reporting system that can be un-anonymised by a join is not
          // a confidential reporting system. It is a list.
          // ==========================================================
          await tx.syncReceipt.create({
            data: {
              clientId: item.clientId,
              orgId: auth.org,
              entityType: "safetyReport",
              op: "CREATE",
              ...(d.isAnonymous
                ? { deviceHash: hmac(deviceId), userId: null, deviceId: null }
                : { deviceId, userId: auth.sub, deviceHash: null }),
            },
          });

          await appendAuditTx(tx, {
            orgId: auth.org,
            // Likewise: an audit entry naming the reporter of an
            // anonymous report defeats the anonymity it is meant to
            // protect. The action is recorded; the actor is not.
            userId: d.isAnonymous ? undefined : auth.sub,
            action: "report.create.sync",
            entityType: "SafetyReport",
            entityId: report.id,
            detail: d.isAnonymous
              ? { type: d.type, anonymous: true }
              : { deviceId, type: d.type, anonymous: false },
          });

          return report;
        });

        results.push({
          clientId: item.clientId,
          status: "applied",
          serverUpdatedAt: created.updatedAt.toISOString(),
        });
        continue;
      }

      if (item.op === "UPDATE") {
        // Optimistic concurrency: baseVersion must match current updatedAt.
        // Tenant-scoped in the WHERE clause rather than checked after the
        // read, so a cross-org row is never loaded into memory at all.
        const current = await prisma.safetyReport.findFirst({
          where: { clientId: item.clientId, orgId: auth.org },
        });
        if (!current) { results.push({ clientId: item.clientId, status: "rejected" }); continue; }

        if (item.baseVersion && item.baseVersion !== current.updatedAt.toISOString()) {
          try {
            await prisma.syncReceipt.create({
              data: {
                // A conflict receipt is a distinct event, not a second
                // receipt for the same clientId — suffixed so it cannot
                // collide with the idempotency key it describes.
                clientId: `${item.clientId}:conflict:${current.updatedAt.toISOString()}`,
                orgId: auth.org,
                deviceId,
                userId: auth.sub,
                entityType: item.entityType,
                op: "UPDATE",
                conflict: true,
                resolution: "server_wins",
              },
            });
          } catch (err) {
            // ==========================================================
            // A REPEATED CONFLICT IS NOT AN ERROR.
            //
            // The suffix is deterministic: clientId plus the server's
            // current updatedAt. So if the response to this batch is
            // lost — radio drops after the server commits, which is the
            // ordinary case this whole outbox exists for — the client
            // retries the same UPDATE, the server's updatedAt has not
            // moved, and the receipt insert violates
            // @@unique([orgId, clientId]).
            //
            // Uncaught, that threw out of the handler and returned 500
            // for the WHOLE batch. The client saw !res.ok, backed off
            // every item, retried, and hit it again. A permanently
            // poisoned outbox on a device nobody can reach, caused by a
            // dropped packet.
            //
            // The receipt already existing means this exact conflict is
            // already recorded, which is precisely the state the insert
            // was trying to reach. Idempotent, so: carry on and report
            // the conflict, which is what the client needs to hear.
            // ==========================================================
            if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
              throw err;
            }
            req.log.info(
              { clientId: item.clientId },
              "conflict receipt already recorded — retried batch after a lost response",
            );
          }
          results.push({
            clientId: item.clientId,
            status: "conflict",
            serverUpdatedAt: current.updatedAt.toISOString(),
          });
          continue;
        }

        // Field-level update handlers are added per entity. Until one
        // exists for this entity, the honest answer is "rejected" — not
        // a silent success that loses the client's edit.
        results.push({ clientId: item.clientId, status: "rejected" });
        continue;
      }

      results.push({ clientId: item.clientId, status: "rejected" });
    }

    // Every item gets exactly one result. The client's outbox matches
    // results back by clientId and leaves anything unmatched queued
    // forever, so a short response is a permanent stuck item on a
    // device nobody can reach.
    if (results.length !== items.length) {
      req.log.error(
        { sent: items.length, returned: results.length },
        "sync batch produced fewer results than items — client outbox would stall",
      );
      return reply.code(500).send({ error: "incomplete_batch" });
    }

    return reply.send({ results });
  });
}

export const __testing = { REQUIRED_PERMISSION };
export type { Prisma };
