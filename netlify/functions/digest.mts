/* ============================================================
   THE DIGEST, ABLE TO ARRIVE.

   Element 4.1's coverage entry has said it plainly since the digest was
   built: it "can be looked at and cannot ARRIVE — no schedule, no
   address, no key — so a gap and a lapsing currency both still wait for
   somebody to open the screen." Two of those three are code and this is
   them. The key is a person's job and stays one.

   ------------------------------------------------------------
   IT SENDS NOTHING WHEN THERE IS NOTHING TO SAY, and that is the rule
   rather than an optimisation.

   digest.ts argues it at length and isWorthSending exists so a caller
   cannot forget: a daily message that usually says "nothing to report"
   is a message people stop opening, and the day it matters it is
   skimmed with the rest. sendDigest checks it again at the boundary, so
   this function forgetting would still not produce that mail.

   ------------------------------------------------------------
   WHO IT GOES TO, AND WHY NOT EVERYBODY.

   The people who can act on it — the roles holding report.read.org, the
   same permission the screen requires. A digest to a frontline reporter
   is a list of somebody else's work, and a safety office that CC's
   everybody is a safety office whose mail is filtered.

   Each operator is computed and sent separately. There is no cross-org
   query anywhere in this file: an aggregate over every tenant is one
   WHERE clause away from being a leak, and this runs unauthenticated by
   a scheduler rather than under a session.

   ------------------------------------------------------------
   ONE ORG'S FAILURE IS NOT THE RUN'S FAILURE.

   A malformed row, an unreachable provider or a missing jurisdiction
   for one operator must not stop the other operators being told. Each
   is caught, counted and reported in the response; the run reports what
   happened rather than throwing on the first problem, which is charter
   rule 8 applied to a job nobody is watching.

   ------------------------------------------------------------
   05:00 UTC is 08:00 in Nairobi — before the first wave of departures
   and after the night's reports have landed. A digest that arrives at
   midnight local is read at nine anyway, having lost the morning it was
   supposed to inform.
   ============================================================ */
import type { Config } from "@netlify/functions";
import { PrismaClient } from "@prisma/client";
import { computeDigest } from "../../apps/api/src/digest.compute.js";
import { sendDigest, mailConfigFromEnv } from "../../apps/api/src/mail.js";
import { isWorthSending } from "../../packages/shared/src/digest.js";
import { can } from "../../packages/shared/src/index.js";

const prisma = new PrismaClient();

/* A cap, because a scheduled function has a wall-clock limit and a run
   that dies half way through has told an arbitrary half of the
   operators. Reported in the response when it binds, so a truncated run
   is visible rather than looking like a complete one. */
const ORG_LIMIT = 200;
const RECIPIENT_LIMIT = 20;

export default async function handler(): Promise<Response> {
  /* ONE `now` FOR THE WHOLE RUN. Every operator's digest is computed
     against the same instant, so two operators processed either side of
     a minute boundary do not disagree about what "today" is. */
  const now = new Date();
  const config = mailConfigFromEnv();

  /* REPORTED, NOT SILENTLY SKIPPED. Charter rule 8. A scheduled job
     that quietly does nothing because a key is absent is a job that
     appears to work in every environment that has never sent an email —
     which is every environment, until the morning one was needed. */
  if (!config.apiKey) {
    return Response.json({
      ran: now.toISOString(),
      status: "NOT_CONFIGURED",
      detail: "No RESEND_API_KEY. Digests were computed for nobody and sent to nobody.",
    });
  }

  const orgs = await prisma.org.findMany({ select: { id: true }, take: ORG_LIMIT });

  let sent = 0;
  let silent = 0;
  const failures: { orgId: string; reason: string }[] = [];

  for (const org of orgs) {
    try {
      const digest = await computeDigest(prisma, org.id, now);
      if (!digest || !isWorthSending(digest)) {
        silent += 1;
        continue;
      }

      const people = await prisma.user.findMany({
        where: { orgId: org.id, active: true },
        select: { email: true, role: true },
        take: RECIPIENT_LIMIT,
      });
      const recipients = people
        .filter((p) => can(p.role as never, "report.read.org"))
        .map((p) => p.email);

      if (recipients.length === 0) {
        /* Not a failure. An operator with no one in a role that may read
           the org's reports has nobody this digest is for, and inventing
           a recipient would send somebody else's work to whoever was
           nearest. */
        silent += 1;
        continue;
      }

      for (const to of recipients) {
        const outcome = await sendDigest(digest, to, config);
        if (outcome.status === "SENT") sent += 1;
        else if (outcome.status === "FAILED") {
          failures.push({ orgId: org.id, reason: outcome.reason });
        }
      }
    } catch (error) {
      failures.push({
        orgId: org.id,
        reason: error instanceof Error ? error.message : "digest failed",
      });
    }
  }

  return Response.json({
    ran: now.toISOString(),
    status: failures.length ? "PARTIAL" : "OK",
    orgs: orgs.length,
    /* STATED, because a run that hit the cap looks exactly like a
       complete one from a count alone. */
    truncated: orgs.length === ORG_LIMIT,
    sent,
    nothingToSay: silent,
    failures,
  });
}

export const config: Config = {
  /* 05:00 UTC — 08:00 in Nairobi. See the note at the top. */
  schedule: "0 5 * * *",
};
