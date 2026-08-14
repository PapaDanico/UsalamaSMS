// =====================================================================
// WHAT HAPPENED TO THE REPORT — element 2.1's missing second half.
//
// WHY THIS ROUTE EXISTS. It is not a new feature so much as the removal
// of a dead end. `ReportState` has had five values since the first
// migration; four were unreachable, because nothing wrote the column.
// The sync handler mapped `safetyReport:UPDATE` to a `report.triage`
// permission and then fell through to `rejected` by design, and the
// /triage screen's `state` filter is `syncState` — queued or synced on
// the handset — a different column that happens to share the word. The
// PERMISSIONS were already there too: `report.investigate` and
// `report.close` were declared, granted to roles, and unreachable.
//
// So every report ever filed was SUBMITTED, permanently. Element 2.1's
// own evidence line asks for "a report rate per 1,000 hours or per
// departure THAT IS TRENDING", and a queue that only grows cannot
// trend. The disposition is upstream of the indicator, and the
// indicator is upstream of any dashboard.
//
// THE RULES LIVE IN packages/shared/src/disposition.ts, not here. The
// screen needs the same graph to know which buttons to show, and a
// state machine written twice is a state machine that disagrees with
// itself the first time somebody adds a state.
//
// WHY THIS IS NOT ON THE SYNC PATH. Offline filing is the promise;
// offline TRIAGE is not. Two devices moving one report through
// different branches while disconnected produces a conflict with no
// safe resolution — server-wins would silently discard a closure and
// its note. Disposition is a safety-office act, done connected, and
// refusing it offline is more honest than losing it later.
// =====================================================================
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { can, type Permission } from "@usalamasms/shared";
/* Imported by path rather than through the shared index, matching
   voluntary.ts, holder.ts and currency.ts. The index is what the web
   entry reaches for, and every module added to it is a module the
   offline bundle carries whether a reporter opens the triage queue or
   not. */
import {
  mayTransition,
  transitionsFrom,
  REPORT_STATES,
  type ReportState,
} from "../../../packages/shared/src/disposition";
import { prisma, authenticate, appendAuditTx, tenantWhere } from "./core";

const HISTORY_LIMIT = 200;

const TransitionSchema = z.object({
  to: z.enum(REPORT_STATES),
  /* Trimmed here so a note of three spaces is the same as no note by
     the time the state machine sees it — otherwise `requiresNote`
     passes on whitespace, which is the closure-with-no-statement this
     whole rule exists to refuse. */
  note: z.string().trim().max(4000).optional(),
  /* Optimistic concurrency, same shape as the sync path: two people in
     the safety office with the queue open should not silently overwrite
     one another's disposition. Optional, because a single-operator
     safety office should not have to send it. */
  fromState: z.enum(REPORT_STATES).optional(),
});

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  const limited = {
    preHandler: [authenticate],
    config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
  };

  /* ------------------------------------------------------------------
     What may be done to this report, by THIS caller.

     Returned rather than left to the client to work out, for the same
     reason the deadline is computed server-side: a screen that decides
     for itself which buttons a role may press is a second copy of the
     permission matrix, and it is the copy that goes stale.
     ------------------------------------------------------------------ */
  app.get("/api/v1/reports/:id/disposition", limited, async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = req.auth!;
    if (!can(auth.role as never, "report.read.org")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    /* Tenant-scoped in the WHERE clause, so another operator's report id
       answers not-found rather than forbidden — a refusal confirms the
       row exists. */
    const report = await prisma.safetyReport.findFirst({
      where: { ...tenantWhere(req), id },
      select: { id: true, state: true, createdAt: true },
    });
    if (!report) return reply.code(404).send({ error: "not_found" });

    const history = await prisma.reportTransition.findMany({
      where: { ...tenantWhere(req), reportId: report.id },
      orderBy: { at: "asc" },
      take: HISTORY_LIMIT,
      select: { fromState: true, toState: true, note: true, at: true, byUserId: true },
    });

    return reply.send({
      state: report.state,
      filedAt: report.createdAt.toISOString(),
      available: transitionsFrom(report.state as ReportState)
        .filter((t) => can(auth.role as never, t.needs))
        .map((t) => ({
          to: t.to,
          label: t.label,
          requiresNote: t.requiresNote,
          because: t.because,
        })),
      /* The moves this caller CANNOT make are named too, with the
         permission each needs. A button that is simply absent teaches a
         safety officer that the product cannot close a report; a button
         that says who can teaches them who to ask. */
      unavailable: transitionsFrom(report.state as ReportState)
        .filter((t) => !can(auth.role as never, t.needs))
        .map((t) => ({ to: t.to, label: t.label, needs: t.needs })),
      history: history.map((h) => ({
        from: h.fromState,
        to: h.toState,
        note: h.note,
        at: h.at.toISOString(),
        by: h.byUserId,
      })),
    });
  });

  /* ------------------------------------------------------------------
     Move it.
     ------------------------------------------------------------------ */
  app.post("/api/v1/reports/:id/disposition", limited, async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = req.auth!;
    const parsed = TransitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }

    const report = await prisma.safetyReport.findFirst({
      where: { ...tenantWhere(req), id },
      select: { id: true, state: true },
    });
    if (!report) return reply.code(404).send({ error: "not_found" });

    const from = report.state as ReportState;

    /* Checked BEFORE the state machine, because a stale client sending
       a move that is legal from where it thinks the report is would
       otherwise be applied from where the report actually is. That is
       the one way this route could lose somebody's work. */
    if (parsed.data.fromState && parsed.data.fromState !== from) {
      return reply.code(409).send({
        error: "conflict",
        message:
          `This report is now ${from}, not ${parsed.data.fromState}. Somebody else has ` +
          "moved it since this screen was loaded.",
        state: from,
      });
    }

    const verdict = mayTransition(
      from,
      parsed.data.to,
      (p: Permission) => can(auth.role as never, p),
      parsed.data.note,
    );
    if (!verdict.ok) {
      /* The three refusals map to three different status codes because
         they need three different things from the caller: fix the
         request, ask somebody else, or finish the form. Collapsing them
         to 400 would make "you are not allowed to close this" look like
         a bug in the screen. */
      const code =
        verdict.reason === "forbidden" ? 403 : verdict.reason === "illegal" ? 409 : 400;
      return reply.code(code).send({
        error: verdict.reason,
        message: verdict.message,
        state: from,
      });
    }

    const moved = await prisma.$transaction(async (tx) => {
      /* BOTH WRITES OR NEITHER. SafetyReport.state is the queue's
         indexed current position and ReportTransition is its history;
         a partial write leaves a report whose history does not explain
         where it is. */
      const row = await tx.reportTransition.create({
        data: {
          orgId: auth.org,
          reportId: report.id,
          fromState: from,
          toState: parsed.data.to,
          note: parsed.data.note ?? null,
          byUserId: auth.sub,
        },
      });
      await tx.safetyReport.update({
        where: { id: report.id },
        data: { state: parsed.data.to },
      });
      await appendAuditTx(tx, {
        orgId: auth.org,
        userId: auth.sub,
        action: "report.disposition",
        entityType: "SafetyReport",
        entityId: report.id,
        /* The note is NOT copied into the audit detail. It can quote a
           narrative, and the audit log is read by roles that hold no
           narrative permission — see NARRATIVE_PERMISSIONS. The move is
           the auditable fact; the note lives on the row that the same
           tenancy check already guards. */
        detail: { from, to: parsed.data.to },
      });
      return row;
    });

    return reply.code(201).send({
      state: parsed.data.to,
      transition: {
        from: moved.fromState,
        to: moved.toState,
        note: moved.note,
        at: moved.at.toISOString(),
      },
    });
  });
}
