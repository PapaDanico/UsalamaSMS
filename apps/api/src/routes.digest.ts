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
import { prisma, authenticate } from "./core";
import { mailConfigFromEnv } from "./mail";

/* Reports that have arrived and nobody has moved. SUBMITTED is the only
   state that means untouched — everything after it is somebody's
   decision, including a closure. */
const UNTRIAGED_STATE = "SUBMITTED";

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

    const [training, untriaged, overdue] = await Promise.all([
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
      prisma.correctiveAction.count({
        where: { orgId: auth.org, verifiedOn: null, cancelledOn: null, dueOn: { lt: now } },
      }),
    ]);

    const currencies = training.map((t) => {
      const verdict = currencyOf({ completedOn: t.completedOn, expiresOn: t.expiresOn }, now);
      return { state: verdict.state, daysLeft: verdict.daysLeft };
    });

    const digest = digestFor({
      /* EMPTY, AND THIS IS THE ONE THING ON THIS ROUTE WORTH ARGUING
         WITH. digest.ts supports a DEADLINE kind and the deadline
         engine is the most carefully tested thing in the repository.
         The DATA is not there: SafetyReport has no field recording that
         an occurrence was notified to the authority, and `deadlineStatus`
         is called nowhere in the API.

         Without a discharge field, an occurrence the operator DID
         notify — by telephone, which is how L.N. 32 expects the urgent
         classes to be reported — has a window that simply passes, and
         would be reported OVERDUE in this digest EVERY DAY FOREVER.
         That is the always-on signal currency.ts argues against and
         this module was written to avoid, so including it would make
         the feature actively worse than omitting it.

         The fix is a `reportedToAuthorityAt` on SafetyReport plus the
         triage action that sets it — a schema change and a screen, not
         a line here. Until then this section stays empty rather than
         wrong, and the coverage entry keeps saying what is missing. */
      deadlines: [],
      currencies,
      untriaged,
      overdueActions: Array.from({ length: overdue }, () => ({ daysLeft: -1 })),
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
