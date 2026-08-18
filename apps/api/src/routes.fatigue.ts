/* =====================================================================
   FATIGUE — THE SECOND HALF OF THE PRESCRIPTIVE ROUTE.

   Annex 6 gives a State two ways to manage fatigue, and an operator is
   on one of them: stay inside prescriptive flight and duty limits AND
   manage fatigue hazards through the SMS, or run a State-approved FRMS.
   Every operator this product serves is on the first, and this file
   serves the half of it that is not a roster: the hazard management.

   packages/shared/src/fatigue.ts carries the full argument, including
   why no flight-time table for any State is shipped and why the
   operator declares its own limits.

   ---------------------------------------------------------------
   WHY THIS READS SafetyReport FROM OUTSIDE routes.reports.ts.

   `npm run check:authz` compares, for every model, the roles a route
   discloses it to against the roles admitted by the file that WRITES
   it. This file reads SafetyReport, so it is exactly the shape that
   gate exists to catch, and the answer is to be no wider rather than to
   be exempt: the list below is gated on `report.read.org`, which is the
   same permission /api/v1/reports/queue requires, and the same one
   /api/v1/picture uses for the reports it aggregates.

   NO NARRATIVE LEAVES THIS ROUTE. The queue's own comment explains the
   rule — a list needs to identify a report, not reproduce it — and it
   binds harder here. A fatigue narrative is somebody saying they were
   too tired to fly safely, which is the most career-sensitive sentence
   anybody files in this product. The duty figures are what the analysis
   needs; the words are not, and they stay behind the report itself.
   ===================================================================== */
import type { FastifyInstance } from "fastify";
import { can } from "@usalamasms/shared";
import {
  assess, hasDeclaredLimits, FATIGUE_CAVEAT, FATIGUE_SOURCES,
  SAMN_PERELLI, SAMN_PERELLI_SOURCE, FATIGUE_VERIFIED_AGAINST_PRIMARY,
} from "../../../packages/shared/src/fatigue";
import { prisma, appendAuditTx, authenticate, tenantWhere } from "./core";

/* Bounded like every other collection on a read route. An operator with
   more than this many fatigue reports in one window has a finding that
   listing all of them does not help with, and the truncation is
   reported rather than absorbed — /picture records why. */
const REPORT_LIMIT = 500;

/** The window, in days, and the same shape /api/v1/picture uses. */
const DEFAULT_WINDOW_DAYS = 365;
const MAX_WINDOW_DAYS = 1095;
const DAY = 86_400_000;

export async function fatigueRoutes(app: FastifyInstance): Promise<void> {
  const limited = {
    preHandler: [authenticate],
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  };

  /* ------------------------------------------------------------------
     WHAT THE OPERATOR IS BOUND BY.

     Readable by anybody signed in, and that is deliberate: the limits
     are what a crew member is rostered against, and a product that hid
     them from the people they protect would be an odd kind of safety
     tool. Nothing here is a narrative or a person.
     ------------------------------------------------------------------ */
  app.get("/api/v1/fatigue/limits", limited, async (req) => {
    const row = await prisma.fatigueLimit.findUnique({
      where: { orgId: req.auth!.org },
    });
    return {
      declared: hasDeclaredLimits(row ?? undefined),
      limits: row
        ? {
            maxFlightTimeHours: row.maxFlightTimeHours,
            maxDutyHours: row.maxDutyHours,
            minRestHours: row.minRestHours,
            maxFlightTime7DaysHours: row.maxFlightTime7DaysHours,
            instrument: row.instrument,
            declaredOn: row.declaredOn,
          }
        : null,
      caveat: FATIGUE_CAVEAT,
    };
  });

  /* ------------------------------------------------------------------
     DECLARING THEM.

     `config.manage`, which is the permission this product already uses
     for everything an operator DECLARES ABOUT ITSELF — including, since
     R5, who may accept an intolerable risk. Held by the safety manager
     and the accountable executive.

     IT WAS `org.manage` FOR ONE DRAFT AND THAT WAS WRONG. Only
     SYSTEM_ADMIN holds org.manage, so the technical administrator —
     the role that deliberately reads no safety narrative — would have
     been the only person in the operator able to state what duty limits
     bind it. That is a safety commitment wearing an IT setting's
     clothes, and the integration suite caught it by refusing the
     accountable executive.
     ------------------------------------------------------------------ */
  app.put<{ Body: Record<string, unknown> }>(
    "/api/v1/fatigue/limits",
    { preHandler: [authenticate], config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const auth = req.auth!;
      if (!can(auth.role as never, "config.manage")) {
        return reply.code(403).send({
          error: "forbidden",
          detail:
            "Declaring the duty limits this operator is bound by is held by the " +
            "accountable executive and the safety manager.",
        });
      }

      const b = req.body ?? {};
      const hours = (v: unknown, max: number): number | null => {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0 || n > max) return Number.NaN;
        return n;
      };
      const maxFlightTimeHours = hours(b["maxFlightTimeHours"], 24);
      const maxDutyHours = hours(b["maxDutyHours"], 48);
      const minRestHours = hours(b["minRestHours"], 168);
      const maxFlightTime7DaysHours = hours(b["maxFlightTime7DaysHours"], 168);
      if ([maxFlightTimeHours, maxDutyHours, minRestHours, maxFlightTime7DaysHours]
            .some((n) => Number.isNaN(n))) {
        return reply.code(400).send({ error: "limit_out_of_range" });
      }

      const instrument = String(b["instrument"] ?? "").trim();
      /* THE INSTRUMENT IS REQUIRED WHENEVER A NUMBER IS. A limit with no
         source is a number somebody typed, and the entire reason this
         product declines to ship a State's table is that an unsourced
         limit is indistinguishable from a wrong one. */
      const anyNumber = [maxFlightTimeHours, maxDutyHours, minRestHours, maxFlightTime7DaysHours]
        .some((n) => typeof n === "number" && n > 0);
      if (anyNumber && (instrument.length < 3 || instrument.length > 200)) {
        return reply.code(400).send({
          error: "instrument_required",
          message:
            "Name the instrument these limits come from — the regulation, the " +
            "operations manual section, or the AOC condition. A limit with no " +
            "source cannot be checked by anybody.",
        });
      }

      const data = {
        maxFlightTimeHours, maxDutyHours, minRestHours, maxFlightTime7DaysHours,
        instrument: instrument || "Not stated",
        declaredById: auth.sub,
        declaredOn: new Date(),
      };

      const saved = await prisma.$transaction(async (tx) => {
        const row = await tx.fatigueLimit.upsert({
          where: { orgId: auth.org },
          create: { orgId: auth.org, ...data },
          update: data,
        });
        await appendAuditTx(tx, {
          orgId: auth.org,
          userId: auth.sub,
          action: "fatigue.limits.declared",
          entityType: "FatigueLimit",
          entityId: row.id,
          /* The figures and their source, because a change to what an
             operator says binds it is exactly the kind of thing an
             auditor asks the date of. */
          detail: {
            instrument: row.instrument,
            maxFlightTimeHours: row.maxFlightTimeHours,
            maxDutyHours: row.maxDutyHours,
            minRestHours: row.minRestHours,
            maxFlightTime7DaysHours: row.maxFlightTime7DaysHours,
          },
        });
        return row;
      });

      return { declared: hasDeclaredLimits(saved), instrument: saved.instrument };
    },
  );

  /* ------------------------------------------------------------------
     THE PICTURE.

     What the reports say, read against what the operator declared. The
     figure worth the screen is `withinDeclared` — duties that stayed
     inside every limit and still produced a fatigue report, which is
     the finding the prescriptive approach cannot generate on its own.
     ------------------------------------------------------------------ */
  app.get("/api/v1/fatigue", limited, async (req, reply) => {
    const auth = req.auth!;
    if (!can(auth.role as never, "report.read.org")) {
      return reply.code(403).send({
        error: "forbidden",
        detail:
          "Reading the operator's fatigue reports is held by the roles that read " +
          "the reporting queue.",
      });
    }

    const asked = Number((req.query as { days?: string }).days ?? DEFAULT_WINDOW_DAYS);
    const days = Number.isFinite(asked)
      ? Math.min(MAX_WINDOW_DAYS, Math.max(7, Math.trunc(asked)))
      : DEFAULT_WINDOW_DAYS;
    const from = new Date(Date.now() - days * DAY);

    const [limitRow, rows] = await Promise.all([
      prisma.fatigueLimit.findUnique({ where: { orgId: auth.org } }),
      prisma.safetyReport.findMany({
        where: { ...tenantWhere(req), type: "FATIGUE", retractedAt: null, createdAt: { gte: from } },
        take: REPORT_LIMIT,
        orderBy: { createdAt: "desc" },
        /* NO NARRATIVE, and no reporter. See the header. */
        select: {
          id: true, clientId: true, title: true, createdAt: true, state: true,
          isAnonymous: true,
          fatigueFlightTimeHours: true, fatigueDutyHours: true,
          fatigueRestBeforeHours: true, fatigueSectors: true,
          fatigueSleepPrior24: true, fatigueStartLocalHour: true,
          fatigueEndLocalHour: true, fatigueSamnPerelli: true,
        },
      }),
    ]);

    const limits = limitRow
      ? {
          maxFlightTimeHours: limitRow.maxFlightTimeHours,
          maxDutyHours: limitRow.maxDutyHours,
          minRestHours: limitRow.minRestHours,
          maxFlightTime7DaysHours: limitRow.maxFlightTime7DaysHours,
          instrument: limitRow.instrument,
        }
      : null;

    const assessed = rows.map((r) => {
      const a = assess(
        {
          flightTimeHours: r.fatigueFlightTimeHours,
          dutyHours: r.fatigueDutyHours,
          restBeforeHours: r.fatigueRestBeforeHours,
          sectors: r.fatigueSectors,
          sleepPrior24Hours: r.fatigueSleepPrior24,
          startLocalHour: r.fatigueStartLocalHour,
          endLocalHour: r.fatigueEndLocalHour,
          samnPerelli: r.fatigueSamnPerelli,
        },
        limits,
      );
      return {
        id: r.id, clientId: r.clientId, title: r.title,
        createdAt: r.createdAt, state: r.state,
        verdict: a.verdict, exceeded: a.exceeded, factors: a.factors,
        impairmentReported: a.impairmentReported,
        samnPerelli: r.fatigueSamnPerelli,
      };
    });

    const count = (v: string) => assessed.filter((a) => a.verdict === v).length;

    return {
      windowDays: days,
      declared: hasDeclaredLimits(limitRow ?? undefined),
      limits,
      total: assessed.length,
      truncated: rows.length === REPORT_LIMIT,
      counts: {
        withinDeclared: count("WITHIN_DECLARED"),
        exceededDeclared: count("EXCEEDED_DECLARED"),
        incomplete: count("INCOMPLETE"),
        noLimitsDeclared: count("NO_LIMITS_DECLARED"),
        impairmentReported: assessed.filter((a) => a.impairmentReported).length,
      },
      reports: assessed,
      scale: SAMN_PERELLI,
      scaleSource: SAMN_PERELLI_SOURCE,
      sources: FATIGUE_SOURCES,
      verifiedAgainstPrimary: FATIGUE_VERIFIED_AGAINST_PRIMARY,
      caveat: FATIGUE_CAVEAT,
    };
  });
}
