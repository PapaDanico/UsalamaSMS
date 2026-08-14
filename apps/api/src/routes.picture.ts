// =====================================================================
// THE RISK PICTURE — the operator's position on one screen.
//
// WHERE THE IDEA COMES FROM. The UK Military Aviation Authority does
// not only require risks to be owned and occurrences reported; it
// aggregates what comes in into a RISK PICTURE and uses that to decide
// where to look next. RA 1210 requires risk decisions to be "recorded
// and communicated across all relevant stakeholders", and a decision
// communicated one row at a time has not been communicated.
//
// It is also the largest single gap against SMS Pro, Q-Pulse, Centrik
// and iQSMS, all four of which lead with a dashboard.
//
// NOTHING HERE IS STORED. Charter rule 6, and it matters more on this
// route than anywhere else in the product: a cached figure on a
// dashboard is a figure that will eventually disagree with the rows
// underneath it in front of an inspector. Every number below is
// computed from the tables on every request.
//
// THE ARITHMETIC IS IN packages/shared/src/picture.ts, not here, and it
// is unit-tested there. What this file does is the gathering: which
// queries, over what window, aggregated where.
//
// AGGREGATED IN POSTGRES WHERE IT CAN BE. The state counts and the
// monthly series are GROUP BYs, not rows pulled across the wire and
// counted in JavaScript — the P-01 shape, on the one screen that reads
// every table at once. The register is fetched as rows because the
// duty-holder check is per-row and cannot be expressed as a GROUP BY;
// it is bounded, and the bound is reported.
// =====================================================================
import type { FastifyInstance } from "fastify";
import { can } from "@usalamasms/shared";
import { spiVerdict } from "../../../packages/shared/src/spi";
import {
  tally, sampleOf, trendOf, holderGaps, reportCount,
} from "../../../packages/shared/src/picture";
import { prisma, authenticate, tenantWhere } from "./core";

/** Ninety days: a quarter, which is the cadence an SMS review runs on. */
const DEFAULT_WINDOW_DAYS = 90;
const MAX_WINDOW_DAYS = 730;
const REGISTER_LIMIT = 500;

const REPORT_STATES = [
  "SUBMITTED", "TRIAGED", "UNDER_INVESTIGATION", "ACTIONS_OPEN", "CLOSED",
] as const;
const BANDS = ["INTOLERABLE", "TOLERABLE", "ACCEPTABLE"] as const;

const DAY = 86_400_000;

export async function pictureRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/picture", {
    preHandler: [authenticate],
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const auth = req.auth!;
    /* report.read.org, not a dedicated permission. Everything here is an
       aggregate of records this role can already read one at a time, and
       a separate permission would let an operator grant the summary
       while withholding the detail — which is backwards. */
    if (!can(auth.role as never, "report.read.org")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const asked = Number((req.query as { days?: string }).days ?? DEFAULT_WINDOW_DAYS);
    const days = Number.isFinite(asked)
      ? Math.min(MAX_WINDOW_DAYS, Math.max(7, Math.trunc(asked)))
      : DEFAULT_WINDOW_DAYS;
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY);
    const where = tenantWhere(req);

    const [byState, filed, closures, monthly, register, indicators, changes] =
      await Promise.all([
        /* THE WHOLE QUEUE, not the window. "How many are open" is a
           question about now, and a report filed four months ago and
           still untriaged is exactly the one that must not fall out of
           the count because the window moved past it. */
        prisma.safetyReport.groupBy({
          by: ["state"], where, _count: { _all: true },
        }),
        prisma.safetyReport.count({ where: { ...where, createdAt: { gte: from } } }),

        /* Time to closure, from the transition history rather than from
           a column — and the FIRST closure per report, which is why the
           rows are ordered and de-duplicated below rather than
           aggregated in SQL. A report closed, reopened and closed again
           took as long as it took the first time; reporting the latest
           would describe reopening as slowness, and an indicator that
           punishes reopening is one that stops reports being reopened. */
        prisma.reportTransition.findMany({
          where: { ...where, toState: "CLOSED", at: { gte: from } },
          orderBy: { at: "asc" },
          select: { reportId: true, at: true, report: { select: { createdAt: true } } },
        }),

        /* The monthly series the trend reads. Grouped in Postgres: one
           row per month, not every report in two years pulled across to
           be counted here. */
        prisma.$queryRaw<Array<{ month: Date; n: bigint }>>`
          SELECT date_trunc('month', "createdAt") AS month, count(*) AS n
            FROM "SafetyReport"
           WHERE "orgId" = ${auth.org} AND "createdAt" >= ${from}
           GROUP BY 1 ORDER BY 1 ASC`,

        prisma.riskAssessment.findMany({
          where: { ...where, status: "OPEN" },
          take: REGISTER_LIMIT,
          select: {
            id: true, tolerability: true, residualTolerability: true,
            owner: true, reviewBy: true,
            hazard: { select: { title: true } },
          },
        }),

        prisma.spi.findMany({
          where,
          select: {
            id: true, name: true, kind: true, direction: true, per: true,
            target: true, exposureUnit: true,
            periods: { orderBy: { label: "asc" },
              select: { id: true, label: true, events: true, exposure: true } },
          },
        }),

        /* A change that took effect and was never reviewed afterwards is
           element 3.2's own loose end, and it is invisible on the change
           screen because that screen is a list of changes rather than a
           list of omissions. */
        prisma.changeAssessment.count({
          where: { ...where, status: "IN_EFFECT", reviewedOn: null },
        }),
      ]);

    /* FIRST closure per report. The query is ordered ascending, so the
       first row seen for a reportId is its earliest closure. */
    const seen = new Set<string>();
    const closureDays: number[] = [];
    for (const c of closures) {
      if (seen.has(c.reportId)) continue;
      seen.add(c.reportId);
      closureDays.push(
        Math.max(0, Math.round((c.at.getTime() - c.report.createdAt.getTime()) / DAY)),
      );
    }

    const gaps = holderGaps(
      register.map((r) => ({
        id: r.id,
        hazard: r.hazard.title,
        tolerability: r.tolerability,
        residualTolerability: r.residualTolerability,
        owner: r.owner,
      })),
    );

    const alerting = indicators
      .map((i) => ({ spi: i, verdict: spiVerdict(i as never) }))
      .filter((x) => x.verdict.headline.startsWith("Alert"))
      .map((x) => ({ id: x.spi.id, name: x.spi.name, headline: x.verdict.headline }));

    const overdueReview = register.filter(
      (r) => r.reviewBy !== null && r.reviewBy.getTime() < to.getTime(),
    ).length;

    return reply.send({
      window: { from: from.toISOString(), to: to.toISOString(), days },
      reporting: {
        ...reportCount(filed, days),
        /* The queue counts are over ALL time and say so, because mixing
           a windowed count with an all-time one under one heading is how
           two true numbers add up to a false impression. */
        queue: tally(
          REPORT_STATES,
          byState.map((r) => ({ key: r.state as never, count: r._count._all })),
        ),
        queueScope: "all",
        trend: trendOf(monthly.map((m) => Number(m.n))),
        months: monthly.map((m) => ({
          month: m.month.toISOString().slice(0, 7), count: Number(m.n),
        })),
        closure: sampleOf(closureDays),
      },
      register: {
        /* Open entries only — a closed risk is not part of the position
           being carried, and counting it makes a register that is being
           worked look identical to one that is growing. */
        open: tally(
          BANDS,
          BANDS.map((b) => ({
            key: b,
            count: register.filter((r) => (r.residualTolerability ?? r.tolerability) === b).length,
          })),
        ),
        overdueReview,
        truncated: register.length === REGISTER_LIMIT,
        holderGaps: gaps,
      },
      indicators: { total: indicators.length, alerting },
      changes: { inEffectUnreviewed: changes },
    });
  });
}
