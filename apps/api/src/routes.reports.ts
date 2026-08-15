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
import { unrecognised } from "../../../packages/shared/src/cictt";
import { prisma, authenticate, appendAuditTx, tenantWhere } from "./core";

const HISTORY_LIMIT = 200;
const QUEUE_LIMIT = 500;

/* ONE DECLARATION, read by both routes below. De-duplicated so a client
   cannot write RE twice, bounded so it cannot write an unbounded array,
   and upper-cased because CICTT codes are published in upper case and
   `re` and `RE` are not two categories. */
const CicttCodes = z
  .array(z.string().trim().toUpperCase().min(1).max(16))
  .max(12)
  .transform((codes) => [...new Set(codes)]);

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
  /* THE ICAO OCCURRENCE CATEGORIES, set by the safety office as part of
     the disposition rather than by the reporter on the form.

     Coding an occurrence to ADREP is a trained judgement about what
     happened, made after somebody has read the narrative. Asking a
     reporter at a strip to pick from twenty categories would be the
     same mistake as asking them whether the event meets Annex 13's
     definition of an accident, and the form already refuses that one.

     NOT VALIDATED AGAINST THE LIST HERE. The list is incomplete by
     admission, so an unknown code is recorded and REPORTED back rather
     than rejected — see the response below. Bounded and de-duplicated
     so a client cannot write an unbounded array, and normalised to
     upper case because CICTT codes are published in upper case and
     `re` and `RE` are not two categories. */
  cicttCodes: CicttCodes.optional(),
});

/* The same field, REQUIRED, for the route that does nothing else.
   Both routes read one declaration: two copies of the bound and the
   upper-casing are two copies that come to disagree, and the one that
   drifts is whichever is edited second. */
const CodesSchema = z.object({ cicttCodes: CicttCodes });

/* RECORDING THAT THE AUTHORITY WAS NOTIFIED.
 *
 * `at` is optional and defaults to receipt on the server. That is the
 * same choice awareAt makes and for the same reason: the earliest
 * moment this system can PROVE is when it was told, and a required
 * field here would push somebody to guess rather than leave it. When it
 * is supplied it is the operator stating when the call was actually
 * made, which is usually earlier than when anybody sat down to record
 * it — and that gap is exactly what a deadline turns on.
 *
 * `reference` is what the authority issued back. Optional because not
 * every authority issues one on a telephone call, and a required field
 * that people cannot satisfy is a field people put "n/a" in. */
const NotifiedSchema = z.object({
  at: z.coerce.date().optional(),
  reference: z.string().max(120).optional(),
});

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  const limited = {
    preHandler: [authenticate],
    config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
  };

  /* ------------------------------------------------------------------
     THE ORGANISATION'S QUEUE, not this handset's.

     Two gaps close here at once, and they turned out to be the same
     gap. The triage screen read the device's own store, which the
     README has disclosed all along; and the device had no way to name a
     report to this route at all, because the sync response returns
     `serverUpdatedAt` and never the server's id. So the screen could
     not have driven the disposition even if it wanted to.

     ONE REQUEST, NOT ONE PER ROW. The screen merges this into what the
     device already holds, keyed on clientId. Fetching a disposition per
     visible report is the P-01 shape — work proportional to the queue
     on a screen whose whole job is to show a queue.

     NO NARRATIVE. The list needs to identify a report, not to reproduce
     it. Sending narratives for the whole org to render a list would put
     them in memory, in a cache and in a screenshot for every row nobody
     opened — and de-identification exists precisely because that text
     is the sensitive part.
     ------------------------------------------------------------------ */
  app.get("/api/v1/reports/queue", limited, async (req, reply) => {
    const auth = req.auth!;
    if (!can(auth.role as never, "report.read.org")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const rows = await prisma.safetyReport.findMany({
      where: tenantWhere(req),
      orderBy: { createdAt: "desc" },
      take: QUEUE_LIMIT,
      select: {
        id: true, clientId: true, state: true, type: true, title: true,
        createdAt: true, isAnonymous: true, jurisdiction: true, awareAt: true,
        occurredAt: true, location: true, phase: true, cicttCodes: true,
        /* WHETHER THE DUTY WAS DISCHARGED. The queue computes a
           reporting deadline per row and, until this column travelled
           with the row, had no way to know the call had been made — so
           the countdown counted down for ever and the screen could
           offer no way to stop it. The REFERENCE is deliberately not
           here: it is the operator's record to hand over, not a field
           to spray across every queue response. */
        reportedToAuthorityAt: true,
      },
    });

    return reply.send({
      /* Stated rather than left to be inferred from a round number. A
         truncated queue that looks complete is how a report at the
         bottom stops existing. */
      truncated: rows.length === QUEUE_LIMIT,
      reports: rows.map((r) => ({
        id: r.id,
        clientId: r.clientId,
        state: r.state,
        type: r.type,
        title: r.title,
        createdAt: r.createdAt.toISOString(),
        isAnonymous: r.isAnonymous,
        jurisdiction: r.jurisdiction,
        awareAt: r.awareAt?.toISOString() ?? null,
        occurredAt: r.occurredAt?.toISOString() ?? null,
        location: r.location,
        phase: r.phase,
        cicttCodes: r.cicttCodes,
        reportedToAuthorityAt: r.reportedToAuthorityAt?.toISOString() ?? null,
        available: transitionsFrom(r.state as ReportState)
          .filter((t) => can(auth.role as never, t.needs))
          .map((t) => ({ to: t.to, label: t.label, requiresNote: t.requiresNote })),
      })),
    });
  });

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
      select: { id: true, state: true, createdAt: true, cicttCodes: true },
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
      /* Read back so the screen renders the coding that EXISTS rather
         than the coding somebody last submitted from this browser. */
      cicttCodes: report.cicttCodes,
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
     CODE IT, WITHOUT MOVING IT.

     Codes ride the disposition below, because triage is the natural
     moment to classify: somebody has just read the narrative. That
     alone is not enough. A report closed last month and coded RE when
     it should have been RE and LOC-I has to be correctable, and the
     only route to the column was a state change — so fixing a
     classification would have meant reopening a closed report and
     closing it again, leaving two transitions in the history that
     describe an investigation that never happened.

     A classification is not a state change, so it gets its own verb.

     `report.triage` is the authority, not `report.close`: coding is the
     same judgement as triage — what kind of occurrence is this — and
     the person who does one is the person who does the other.
     ------------------------------------------------------------------ */
  app.put("/api/v1/reports/:id/codes", limited, async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = req.auth!;
    if (!can(auth.role as never, "report.triage")) {
      return reply.code(403).send({
        error: "forbidden",
        message:
          "Classifying an occurrence to ICAO's categories is held by the roles that " +
          "triage reports.",
      });
    }

    const parsed = CodesSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }

    const report = await prisma.safetyReport.findFirst({
      where: { ...tenantWhere(req), id },
      select: { id: true, cicttCodes: true },
    });
    if (!report) return reply.code(404).send({ error: "not_found" });

    const before = report.cicttCodes;
    await prisma.$transaction(async (tx) => {
      await tx.safetyReport.update({
        where: { id: report.id },
        data: { cicttCodes: { set: parsed.data.cicttCodes } },
      });
      await appendAuditTx(tx, {
        orgId: auth.org,
        userId: auth.sub,
        action: "report.classify",
        entityType: "SafetyReport",
        entityId: report.id,
        /* BOTH SIDES OF THE CHANGE. How an occurrence is coded decides
           what the State is told about it, so "was RE, is now RE and
           LOC-I" is the auditable fact — a record of the new value
           alone cannot answer whether a category was removed. */
        detail: { from: before, to: parsed.data.cicttCodes },
      });
    });

    const unknown = unrecognised(parsed.data.cicttCodes);
    return reply.send({
      cicttCodes: parsed.data.cicttCodes,
      ...(unknown.length ? { unrecognisedCodes: unknown } : {}),
    });
  });

  /* ------------------------------------------------------------------
     Say the authority was told.

     THE ACT HAPPENS OUTSIDE THIS SYSTEM. L.N. 32 expects the urgent
     occurrence classes by telephone, and nothing here places the call.
     So this records a CLAIM: when the operator says they notified, who
     recorded that, and the authority's own reference where one was
     given — which is the part that makes it evidence rather than an
     assertion, and the reason `reference` is stored even though it is
     never transmitted anywhere.

     Until this existed, `deadlineStatus` could not be called from
     anywhere in the API: it takes a `submittedAt` meaning discharged
     and no column held one, so an occurrence that WAS notified and one
     that was forgotten were the same row.
     ------------------------------------------------------------------ */
  app.post("/api/v1/reports/:id/notified", limited, async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = req.auth!;

    /* report.triage, not report.close. Telling the authority is part of
       handling a report, not the end of handling it — an occurrence is
       notified long before it is investigated, and requiring the
       closing permission would put the regulatory act behind the
       seniority the LAST act needs. */
    if (!can(auth.role as never, "report.triage")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const parsed = NotifiedSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }

    const report = await prisma.safetyReport.findFirst({
      where: { ...tenantWhere(req), id },
      select: {
        id: true, type: true, occurredAt: true, createdAt: true,
        reportedToAuthorityAt: true,
      },
    });
    if (!report) return reply.code(404).send({ error: "not_found" });

    /* ONLY AN OCCURRENCE OWES A NOTIFICATION. A hazard, a suggestion or
       a near miss has no authority to be told, and letting somebody
       stamp one notified would put a discharge on a duty that never
       existed — which reads, later, as evidence of a report that was
       never reportable. */
    if (report.type !== "MOR") {
      return reply.code(409).send({
        error: "not_reportable",
        message:
          "Only an occurrence carries a notification duty. This report has none, so " +
          "there is nothing for a notification to discharge.",
      });
    }

    const now = new Date();
    const at = parsed.data.at ?? now;

    /* NOT IN THE FUTURE. A notification dated tomorrow discharges a
       deadline that has not arrived, which is the one entry that would
       make an overdue report look compliant. */
    if (at.getTime() > now.getTime()) {
      return reply.code(400).send({
        error: "invalid",
        message: "A notification cannot be dated in the future.",
      });
    }

    /* NOT BEFORE THE OCCURRENCE. Telling an authority about something
       that has not happened is not a data-entry slip worth accepting
       quietly — it is a typed year, and it silently moves the record
       into a window it never belonged to. */
    const happened = report.occurredAt ?? report.createdAt;
    if (at.getTime() < happened.getTime()) {
      return reply.code(400).send({
        error: "invalid",
        message: "A notification cannot precede the occurrence it reports.",
      });
    }

    /* ALREADY RECORDED IS A CONFLICT, NOT AN OVERWRITE. The first entry
       is the one a deadline was judged against; letting a second
       silently replace it would let a late notification be re-dated
       into compliance, and the audit chain would carry the correction
       without anybody being asked to justify it. */
    if (report.reportedToAuthorityAt) {
      return reply.code(409).send({
        error: "already_recorded",
        message:
          "This occurrence is already recorded as notified. Correcting that date is a " +
          "change to a regulatory record and is not done by filing it again.",
        reportedToAuthorityAt: report.reportedToAuthorityAt.toISOString(),
      });
    }

    /* ONE TRANSACTION, AND THE WRITE IS ITSELF CONDITIONAL.
       
       The `already_recorded` check above is a READ, and a read followed
       by an unconditional update is a race: two notifications submitted
       together both pass the check and the second overwrites the first,
       which is precisely the re-dating this route refuses. So the
       update carries `reportedToAuthorityAt: null` in its own WHERE and
       reports how many rows it actually touched — zero means somebody
       else got there first, and the 409 is returned from the losing
       side rather than from a stale read.
       
       BOTH WRITES OR NEITHER, for the reason the /codes route beside
       this one gives: a regulatory discharge committed without its
       hash-chain entry is a record an inspector cannot date. */
    const saved = await prisma.$transaction(async (tx) => {
      const claimed = await tx.safetyReport.updateMany({
        where: { id: report.id, orgId: auth.org, reportedToAuthorityAt: null },
        data: {
          reportedToAuthorityAt: at,
          reportedToAuthorityById: auth.sub,
          authorityReference: parsed.data.reference ?? null,
        },
      });
      if (claimed.count === 0) return null;

      /* THE REFERENCE IS NOT IN THE AUDIT DETAIL. The chain is
         exportable and the detail travels with it; the authority's
         acknowledgement is the operator's record to hand over
         deliberately, not something duplicated into every export. */
      await appendAuditTx(tx, {
        orgId: auth.org,
        userId: auth.sub,
        action: "report.notified_authority",
        entityType: "SafetyReport",
        entityId: report.id,
        detail: { at: at.toISOString(), hasReference: Boolean(parsed.data.reference) },
      });

      return tx.safetyReport.findUniqueOrThrow({
        where: { id: report.id },
        select: { id: true, reportedToAuthorityAt: true, authorityReference: true },
      });
    });

    if (saved === null) {
      return reply.code(409).send({
        error: "already_recorded",
        message:
          "This occurrence was recorded as notified while this request was in flight. " +
          "Correcting that date is a change to a regulatory record and is not done by " +
          "filing it again.",
      });
    }

    return reply.send(saved);
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
      /* The codes ride the same transaction as the move, so a report
         cannot end up classified by a disposition that did not happen.

         `undefined` means the caller did not mention codes and the
         existing ones stand; an empty ARRAY means the safety office
         cleared them deliberately. Those are different intentions and
         Prisma already distinguishes them — collapsing both to "leave
         alone" would make removing a wrong code impossible, and
         collapsing both to "clear" would silently wipe the coding every
         time somebody added a note. */
      await tx.safetyReport.update({
        where: { id: report.id },
        data: {
          state: parsed.data.to,
          ...(parsed.data.cicttCodes === undefined
            ? {}
            : { cicttCodes: { set: parsed.data.cicttCodes } }),
        },
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
        detail: {
          from,
          to: parsed.data.to,
          /* The codes ARE in the audit detail where the note is not.
             The note can quote a narrative; a category code cannot —
             it is a classification, not content, and how an occurrence
             was coded for onward filing to the State is exactly the
             kind of decision an audit trail exists to hold. */
          ...(parsed.data.cicttCodes === undefined
            ? {}
            : { cicttCodes: parsed.data.cicttCodes }),
        },
      });
      return row;
    });

    /* WHAT THIS PRODUCT DID NOT RECOGNISE, reported rather than
       refused. The code list here is incomplete by admission, so an
       operator sending a legitimate CICTT code this build has not got
       yet has found a gap in the software — not made an error in their
       report. The occurrence is stored intact with the code they gave
       it, and the gap comes back in the response so a screen can say
       so instead of pretending the code was understood. */
    const unknown = parsed.data.cicttCodes ? unrecognised(parsed.data.cicttCodes) : [];

    return reply.code(201).send({
      state: parsed.data.to,
      transition: {
        from: moved.fromState,
        to: moved.toState,
        note: moved.note,
        at: moved.at.toISOString(),
      },
      ...(parsed.data.cicttCodes === undefined ? {} : { cicttCodes: parsed.data.cicttCodes }),
      ...(unknown.length ? { unrecognisedCodes: unknown } : {}),
    });
  });
}
