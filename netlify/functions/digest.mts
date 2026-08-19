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
import { PrismaPg } from "@prisma/adapter-pg";
import { getConnectionString, MissingDatabaseConnectionError } from "@netlify/database";
import { computeDigest } from "../../apps/api/src/digest.compute.js";
import { sendDigest, sendTrialDigest, mailConfigFromEnv } from "../../apps/api/src/mail.js";
import { isWorthSending } from "../../packages/shared/src/digest.js";
import { can } from "../../packages/shared/src/index.js";
import { stateOn, trialEndsFrom, TRIAL_DAYS } from "../../packages/shared/src/subscription.js";

/* ============================================================
   A BARE `new PrismaClient()` THROWS, AND THIS FILE HAD ONE.

   Prisma 7 removed the `datasources` option: a direct connection goes
   through a driver adapter. `new PrismaClient()` is TYPE-VALID and
   fails at construction, so it typechecked, linted and passed every
   unit test — and core.ts carries a comment saying precisely that,
   about precisely this mistake, made once before in this repository.
   It was reproduced here anyway, and only running the function found
   it.

   ON A SCHEDULE THAT MATTERS MORE THAN ANYWHERE. Every other caller of
   Prisma is behind a request: it throws, somebody sees a 500. This one
   runs at 05:00 with no session, no screen and no reader — the module
   would have failed at IMPORT, the run would have produced nothing,
   and the first evidence would have been a safety manager not being
   told something.

   BUILT LAZILY, and that is the second half of the fix. At module
   scope a missing DATABASE_URL throws before the handler exists, so
   there is nothing left to report it. Inside the handler the same
   absence becomes a response that says which variable is missing —
   charter rule 8, applied to a job nobody is watching.
   ============================================================ */
let client: PrismaClient | null = null;

function connect(): PrismaClient {
  if (client) return client;
  let managed: string | undefined;
  try {
    managed = getConnectionString();
  } catch (error) {
    if (!(error instanceof MissingDatabaseConnectionError)) throw error;
  }
  // DATABASE_URL (Supabase pooler, set by hand) takes priority.
  // managed (Netlify Database / Neon) is a fallback so an operator can
  // migrate to Netlify Database by unsetting DATABASE_URL rather than
  // editing code. Same order as core.ts and api.mts.
  const url = process.env["DATABASE_URL"] ?? managed ?? process.env["SUPABASE_DATABASE_URL"];
  if (!url) throw new Error("no DATABASE_URL or Netlify Database connection");
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  return client;
}

/* A cap, because a scheduled function has a wall-clock limit and a run
   that dies half way through has told an arbitrary half of the
   operators. Reported in the response when it binds, so a truncated run
   is visible rather than looking like a complete one. */
const ORG_LIMIT = 200;
const RECIPIENT_LIMIT = 20;
const DAY = 86_400_000;

function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function trialDayFor(startedOn: Date, now: Date): number {
  return Math.floor((utcDay(now) - utcDay(startedOn)) / DAY) + 1;
}

function trialStageFor(day: number): 1 | 7 | 30 | 45 | 55 | 60 | null {
  switch (day) {
    case 1:
    case 7:
    case 30:
    case 45:
    case 55:
    case 60:
      return day;
    default:
      return null;
  }
}

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

  /* CONNECTED HERE, INSIDE THE HANDLER, so a missing connection string
     is a reported failure rather than an import that never completes. */
  let prisma: PrismaClient;
  try {
    prisma = connect();
  } catch (error) {
    return Response.json({
      ran: now.toISOString(),
      status: "FAILED",
      detail: error instanceof Error ? error.message : "no database connection",
    });
  }

  const orgs = await prisma.org.findMany({
    select: { id: true, createdAt: true, trialEndsOn: true, paidThrough: true },
    take: ORG_LIMIT,
  });

  let sent = 0;
  let trialSent = 0;
  let silent = 0;
  const failures: { orgId: string; reason: string }[] = [];

  for (const org of orgs) {
    try {
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

      const digest = await computeDigest(prisma, org.id, now);
      let saidSomething = false;
      if (digest && isWorthSending(digest)) {
        saidSomething = true;
        for (const to of recipients) {
          const outcome = await sendDigest(digest, to, config);
          if (outcome.status === "SENT") sent += 1;
          else if (outcome.status === "FAILED") {
            failures.push({ orgId: org.id, reason: outcome.reason });
          }
        }
      }

      const dates = {
        trialEndsOn: org.trialEndsOn ?? trialEndsFrom(org.createdAt),
        paidThrough: org.paidThrough,
      } as const;
      const trialState = stateOn(dates, now);
      const trialDay = trialDayFor(org.createdAt, now);
      const stage = trialState === "TRIAL" ? trialStageFor(trialDay) : null;

      if (stage) {
        saidSomething = true;
        const [reports, hazards, teamMembers, indicators, closedActions] = await Promise.all([
          prisma.safetyReport.count({ where: { orgId: org.id, retractedAt: null } }),
          prisma.hazard.count({ where: { orgId: org.id } }),
          prisma.user.count({ where: { orgId: org.id, active: true } }),
          prisma.spi.count({ where: { orgId: org.id } }),
          prisma.correctiveAction.count({ where: { orgId: org.id, verifiedOn: { not: null }, cancelledOn: null } }),
        ]);
        const onboardingComplete =
          Number(reports > 0) +
          Number(hazards > 0) +
          Number(indicators > 0) +
          Number(teamMembers >= 2);
        for (const to of recipients) {
          const outcome = await sendTrialDigest({
            stage,
            daysRemaining: Math.max(0, TRIAL_DAYS - trialDay),
            reports,
            hazards,
            closedActions,
            onboardingComplete,
          }, to, config);
          if (outcome.status === "SENT") trialSent += 1;
          else if (outcome.status === "FAILED") {
            failures.push({ orgId: org.id, reason: outcome.reason });
          }
        }
      }

      if (!saidSomething) silent += 1;
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
    trialSent,
    nothingToSay: silent,
    failures,
  });
}

export const config: Config = {
  /* 05:00 UTC — 08:00 in Nairobi. See the note at the top. */
  schedule: "0 5 * * *",
};
