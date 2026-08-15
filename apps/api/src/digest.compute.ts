/* =====================================================================
   WHAT AN OPERATOR NEEDS TOLD, COMPUTED ONCE.

   This was inside the route handler, which was correct while a screen
   was the only thing that could ask for it. A schedule is the second
   caller, and the alternative to extracting it was a second copy of the
   query — including the 90-day bound, the CLOSED exclusion and the
   try/catch around a malformed occurrence, every one of which is a
   correction made after review. Two copies of that is one copy that
   silently loses a correction the next time somebody edits the other.

   IT TAKES `now`. Injected rather than read, for the reason this
   repository keeps rediscovering: a digest computed across a midnight
   boundary that reads the clock twice reports a deadline against one
   day and a currency against the next — rare, real, and untestable
   unless the clock is a parameter.

   IT DOES NOT DECIDE WHETHER TO SEND. digestFor returns what there is
   to say; isWorthSending is the rule about saying nothing. Keeping that
   out of here means the screen can show an empty digest — which is
   useful, it is the honest answer to "what would you send me" — while
   the schedule stays silent.
   ===================================================================== */
import type { PrismaClient } from "@prisma/client";
import { digestFor, type Digest } from "../../../packages/shared/src/digest";
import { currencyOf } from "../../../packages/shared/src/currency";
import {
  deadlineStatus,
  reportingDeadline,
  MOR_OBLIGATIONS,
} from "../../../packages/shared/src/regulations";

/* Reports that have arrived and nobody has moved. SUBMITTED is the only
   state that means untouched — everything after it is somebody's
   decision, including a closure. */
const UNTRIAGED_STATE = "SUBMITTED";

/* How far back the deadline section looks. A quarter, which is the
   cadence an SMS review runs on and comfortably longer than any
   reporting window in the registry.

   THE BOUND IS NOT AN OPTIMISATION. Nothing was backfilled by the
   migration that added reportedToAuthorityAt, so EVERY occurrence filed
   before it has a null column and would otherwise be reported overdue
   for the rest of the product's life. A digest is a list of things to
   do today; an occurrence from two years ago is a record to correct. */
const DEADLINE_LOOKBACK_DAYS = 90;

const ROW_LIMIT = 500;
const TRAINING_LIMIT = 2000;

/** Null when the org does not exist — the caller decides what that means. */
export async function computeDigest(
  prisma: PrismaClient,
  orgId: string,
  now: Date,
): Promise<Digest | null> {
  const org = await prisma.org.findUnique({
    where: { id: orgId },
    select: { jurisdiction: true },
  });
  if (!org) return null;

  const [open, training, untriaged, overdue] = await Promise.all([
    prisma.safetyReport.findMany({
      where: {
        orgId,
        type: "MOR",
        /* The column that did not exist when the deadline engine was
           written, and the whole reason the section was empty. */
        reportedToAuthorityAt: null,
        /* CLOSED IS OUT. A report the safety office has finished with is
           not today's action, and leaving it in means an operator that
           closed an occurrence without recording the call gets told
           about it every morning for ever. */
        state: { not: "CLOSED" },
        createdAt: { gte: new Date(now.getTime() - DEADLINE_LOOKBACK_DAYS * 86_400_000) },
      },
      select: { occurredAt: true, awareAt: true, createdAt: true },
      /* OLDEST FIRST. The cap keeps whatever it reads, so taking the
         NEWEST would drop precisely the overdue ones this is for. */
      orderBy: { createdAt: "asc" },
      take: ROW_LIMIT,
    }),
    prisma.trainingRecord.findMany({
      where: { orgId },
      select: { completedOn: true, expiresOn: true },
      take: TRAINING_LIMIT,
    }),
    prisma.safetyReport.count({ where: { orgId, state: UNTRIAGED_STATE } }),
    /* THE DATES, NOT A COUNT. Padding a count with a placeholder made a
       195-day-old action read as "overdue by 1 days" — a number the
       reader acts on and the caller invented. */
    prisma.correctiveAction.findMany({
      where: { orgId, verifiedOn: null, cancelledOn: null, dueOn: { lt: now } },
      select: { dueOn: true },
      orderBy: { dueOn: "asc" },
      take: ROW_LIMIT,
    }),
  ]);

  const obligation = MOR_OBLIGATIONS[org.jurisdiction];
  const deadlines = open.flatMap((r) => {
    /* reportingDeadline REFUSES an awareAt that precedes occurredAt, and
       a row can hold that pair — the schema rejects it on the way in,
       but a sync from an older client or a hand-corrected date can leave
       one behind. One malformed row must not take the other three
       sections down with it. */
    let due: Date | null;
    try {
      ({ due } = reportingDeadline(org.jurisdiction, {
        occurredAt: r.occurredAt ?? r.createdAt,
        awareAt: r.awareAt ?? r.createdAt,
      }));
    } catch {
      return [];
    }
    return [
      {
        /* `submittedAt` is deliberately NOT passed: it means "the duty
           was discharged", and every row reaching this line is one where
           it demonstrably was not. */
        status: deadlineStatus(due, now, { obligation }),
        /* NULL, NOT ZERO, where the instrument sets no window. Zero
           rendered as "soonest is today", which is a deadline invented
           for an obligation deliberately left open. */
        daysLeft: due === null ? null : Math.ceil((due.getTime() - now.getTime()) / 86_400_000),
      },
    ];
  });

  return digestFor({
    deadlines,
    currencies: training.map((t) => {
      const verdict = currencyOf({ completedOn: t.completedOn, expiresOn: t.expiresOn }, now);
      return { state: verdict.state, daysLeft: verdict.daysLeft };
    }),
    untriaged,
    overdueActions: overdue.map((a) => ({
      daysLeft: Math.ceil((a.dueOn!.getTime() - now.getTime()) / 86_400_000),
    })),
  });
}
