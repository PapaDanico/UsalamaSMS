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
import { isWorthSending } from "../../../packages/shared/src/digest";
import { daysUntilChange, stateOn, trialEndsFrom } from "../../../packages/shared/src/subscription";
import { computeDigest, computeRecordScale } from "./digest.compute";
import { prisma, authenticate } from "./core";
import { mailConfigFromEnv } from "./mail";

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

    const digest = await computeDigest(prisma, auth.org, now);
    if (!digest) return reply.code(404).send({ error: "not_found" });

    /* HOW MUCH RECORD THERE IS, which is not what the digest answers.
       The digest correctly finds nothing wrong with an empty operator,
       and the screen used to render that as a clean bill of health —
       "Nothing needs you today" to somebody who has done nothing at
       all. See packages/shared/src/today.ts for the argument; this is
       the number that lets the screen tell the two apart.

       Computed HERE rather than on the screen because everything on
       /today is computed once, server-side, by the same code the 05:00
       schedule runs. A browser deriving its own view of whether the
       record is empty is a second opinion about the record. */
    const [scale, org, teamCount] = await Promise.all([
      computeRecordScale(prisma, auth.org),
      prisma.org.findUnique({
        where: { id: auth.org },
        select: { createdAt: true, trialEndsOn: true, paidThrough: true },
      }),
      prisma.user.count({ where: { orgId: auth.org, active: true } }),
    ]);
    if (!org) return reply.code(404).send({ error: "not_found" });
    const dates = {
      trialEndsOn: org.trialEndsOn ?? trialEndsFrom(org.createdAt),
      paidThrough: org.paidThrough,
    } as const;
    const trialState = stateOn(dates, now);

    /* THE DELIVERY STATE IS REPORTED, NOT INFERRED FROM SILENCE. A
       screen that shows a digest and says nothing about whether it will
       ever be sent lets somebody assume it arrives. `configured` is the
       presence of a key and nothing about its validity — this route
       never contacts the provider, because a preview that sends mail to
       find out whether it can send mail is not a preview. */
    return reply.send({
      digest,
      scale,
      teamCount,
      trial: {
        state: trialState,
        daysRemaining: trialState === "TRIAL" ? Math.max(0, daysUntilChange(dates, now)) : null,
        endsOn: dates.trialEndsOn.toISOString(),
      },
      wouldSend: isWorthSending(digest),
      delivery: mailConfigFromEnv().apiKey ? "CONFIGURED" : "NOT_CONFIGURED",
      computedAt: now.toISOString(),
    });
  });
}
