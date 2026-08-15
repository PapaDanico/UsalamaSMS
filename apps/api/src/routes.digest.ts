// =====================================================================
// WHAT WOULD BE SENT, BEFORE ANYTHING IS SENT.
//
// digest.ts decides what an operator needs told; mail.ts hands it to a
// provider. Between them there was nothing anybody could look at, which
// is a capability with no reachable surface — the shape this repository
// already built a gate for, after /coverage claimed a CAPA loop that no
// screen could reach.
//
// SO THIS EXISTS BEFORE THE SCHEDULE DOES, and the order is deliberate.
// A notification that first becomes visible when it lands in somebody's
// inbox is one whose first reviewer is its audience. A safety manager
// can open this, see exactly what the daily message would say, and find
// out it says something wrong while it is still a screen.
//
// IT IS ALSO THE HONEST ANSWER TO A MISSING KEY. With no RESEND_API_KEY
// the product still computes and shows this; only transmission is
// absent. That is a real degradation and not a broken feature, and the
// difference is worth having.
//
// NOTHING IS STORED. Charter rule 6. The digest is computed from the
// same tables the screens read, on every request, so it cannot go stale
// against them and there is no digest row to disagree with the record.
// =====================================================================
import type { FastifyInstance } from "fastify";
import { can } from "@usalamasms/shared";
import { digestFor, isWorthSending } from "../../../packages/shared/src/digest";
import { currencyOf } from "../../../packages/shared/src/currency";
import {
  deadlineStatus,
  reportingDeadline,
  MOR_OBLIGATIONS,
} from "../../../packages/shared/src/regulations";
import { prisma, authenticate } from "./core";
import { mailConfigFromEnv } from "./mail";

/* Reports that have arrived and nobody has moved. SUBMITTED is the only
   state that means untouched — everything after it is somebody's
   decision, including a closure. */
const UNTRIAGED_STATE = "SUBMITTED";

/* How far back the deadline section looks. A quarter, which is the
   cadence an SMS review runs on and comfortably longer than any
   reporting window in the registry. See the query for why a bound is
   needed at all. */
const DEADLINE_LOOKBACK_DAYS = 90;

export async function digestRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/digest", {
    preHandler: [authenticate],
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const auth = req.auth!;
    /* THE SAME PERMISSION THE UNDERLYING SCREENS NEED, for the reason
       the risk picture gives: this is an aggregate of things this role
       can already read one at a time, and a dedicated permission would
       let an operator grant the summary while withholding the detail. */
    if (!can(auth.role as never, "report.read.org")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    /* ONE `now` FOR THE WHOLE REQUEST. Reading the clock separately per
       section lets a digest computed across a midnight boundary report
       a deadline against one day and a currency against the next — rare,
       untestable, and exactly the class of defect this repository keeps
       finding by injecting the clock instead of reading it. */
    const now = new Date();

    const org = await prisma.org.findUnique({
      where: { id: auth.org },
      select: { jurisdiction: true },
    });
    if (!org) return reply.code(404).send({ error: "not_found" });

    const [open, training, untriaged, overdue] = await Promise.all([
      /* OCCURRENCES THAT STILL OWE A NOTIFICATION. The predicate is
         `reportedToAuthorityAt: null`, which is the column that did not
         exist when this route was first written and is the whole reason
         the deadline section was empty. Indexed with orgId. */
      prisma.safetyReport.findMany({
        where: {
          orgId: auth.org,
          type: "MOR",
          reportedToAuthorityAt: null,
          /* CLOSED IS OUT. A report the safety office has finished with
             is not today's action, and leaving it in means an operator
             that closed an occurrence without recording the call gets
             told about it every morning for ever. That is the always-on
             signal this module exists to avoid — and the finding it
             deserves is a data-quality one on the record, not a daily
             email. */
          state: { not: "CLOSED" },
          /* AND BOUNDED IN TIME. Nothing was backfilled by the migration
             that added reportedToAuthorityAt, so EVERY occurrence filed
             before it has a null column and would otherwise be reported
             overdue for the rest of the product's life. A digest is a
             list of things to do today; an occurrence from two years ago
             is a record to correct, not a task. */
          createdAt: { gte: new Date(now.getTime() - DEADLINE_LOOKBACK_DAYS * 86_400_000) },
        },
        select: { occurredAt: true, awareAt: true, createdAt: true },
        /* OLDEST FIRST. The cap keeps whatever it reads, so taking the
           NEWEST would drop precisely the overdue ones this section is
           for. */
        orderBy: { createdAt: "asc" },
        take: 500,
      }),
      /* Bounded: a digest that has to read ten thousand rows to say
         "12" is a digest that times out on the day it matters most. */
      prisma.trainingRecord.findMany({
        where: { orgId: auth.org },
        select: { completedOn: true, expiresOn: true },
        take: 2000,
      }),
      prisma.safetyReport.count({ where: { orgId: auth.org, state: UNTRIAGED_STATE } }),
      /* Overdue means past its date and not yet CLOSED, and closure here
         is verification rather than completion — capa.ts is emphatic
         that "new signage installed" is not a closed action. An action
         completed but unverified is still owed. */
      /* THE DATES, NOT A COUNT. Padding a count with a placeholder
         daysLeft made a 195-day-old action read as "overdue by 1 days",
         which is a number the reader acts on and this route invented. */
      prisma.correctiveAction.findMany({
        where: { orgId: auth.org, verifiedOn: null, cancelledOn: null, dueOn: { lt: now } },
        select: { dueOn: true },
        orderBy: { dueOn: "asc" },
        take: 500,
      }),
    ]);

    const currencies = training.map((t) => {
      const verdict = currencyOf({ completedOn: t.completedOn, expiresOn: t.expiresOn }, now);
      return { state: verdict.state, daysLeft: verdict.daysLeft };
    });

    /* THE SECTION THAT USED TO BE EMPTY, and it is worth recording why
       it is safe to populate now.

       An occurrence the operator DID notify no longer appears here at
       all — it is excluded by the query, because notifying it writes
       the column. Before that column existed, every notified report
       would have read OVERDUE every day for ever, which is the
       always-on signal currency.ts argues against and this module was
       written to avoid. The fix was never a smarter filter here; it was
       having somewhere to record the discharge.

       `submittedAt` is deliberately NOT passed to deadlineStatus. That
       parameter means "the duty was discharged", and every row reaching
       this line is one where it demonstrably was not. */
    const obligation = MOR_OBLIGATIONS[org.jurisdiction];
    const deadlines = open.flatMap((r) => {
      /* reportingDeadline REFUSES an awareAt that precedes occurredAt,
         and a row can hold that pair — the report schema rejects it on
         the way in, but a sync from an older client or a hand-corrected
         date can leave one behind. One malformed row must not 500 the
         whole digest and take the other three sections with it. */
      let due: Date | null;
      try {
        ({ due } = reportingDeadline(org.jurisdiction, {
          occurredAt: r.occurredAt ?? r.createdAt,
          awareAt: r.awareAt ?? r.createdAt,
        }));
      } catch {
        return [];
      }
      return [{
        status: deadlineStatus(due, now, { obligation }),
        /* NULL, NOT ZERO, where the instrument sets no window. An
           obligation worded "without delay" has nothing to count down;
           zero rendered as "soonest is today", which is a deadline this
           route invented for an obligation deliberately left open. */
        daysLeft: due === null ? null : Math.ceil((due.getTime() - now.getTime()) / 86_400_000),
      }];
    });

    const digest = digestFor({
      deadlines,
      currencies,
      untriaged,
      overdueActions: overdue.map((a) => ({
        daysLeft: Math.ceil((a.dueOn!.getTime() - now.getTime()) / 86_400_000),
      })),
    });

    /* THE DELIVERY STATE IS REPORTED, NOT INFERRED FROM SILENCE. A
       screen that shows a digest and says nothing about whether it will
       ever be sent lets somebody assume it arrives. `configured` is the
       presence of a key and nothing about its validity — this route
       never contacts the provider, because a preview that sends mail to
       find out whether it can send mail is not a preview. */
    return reply.send({
      digest,
      wouldSend: isWorthSending(digest),
      delivery: mailConfigFromEnv().apiKey ? "CONFIGURED" : "NOT_CONFIGURED",
      computedAt: now.toISOString(),
    });
  });
}
