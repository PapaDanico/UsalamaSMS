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
import { can, HRC_CATEGORIES } from "@usalamasms/shared";
import { spiVerdict } from "../../../packages/shared/src/spi";
import {
  tally, sampleOf, trendOf, holderGaps, reportCount,
} from "../../../packages/shared/src/picture";
import { summarise as summariseActions } from "../../../packages/shared/src/capa";
import { barrierHealth, BARRIER_KINDS } from "../../../packages/shared/src/barriers";
import { prisma, authenticate, tenantWhere } from "./core";

/** Ninety days: a quarter, which is the cadence an SMS review runs on. */
const DEFAULT_WINDOW_DAYS = 90;
const MAX_WINDOW_DAYS = 730;
const REGISTER_LIMIT = 500;
/* Closure transitions read to compute a median. Generous, because the
   median gets less trustworthy as the sample is cut and this is a
   figure somebody reads out to an authority — but bounded, because a
   two-year window on a busy operator is otherwise unbounded. */
const CLOSURE_LIMIT = 5000;
const ACTION_LIMIT = 1000;
/* The barrier reads are each already NARROWED to the degraded subset —
   past a date, not closed — so this is a backstop rather than a working
   bound. An operator with 300 expired training records has a problem
   this screen cannot fix by listing all of them. Truncation is reported
   like every other cap on this route. */
const BARRIER_LIMIT = 300;

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
    /* RETRACTED REPORTS ARE OUT OF THE PICTURE — and this is a SECOND
       clause rather than a narrowing of the one above, which is a
       correction worth recording.

       The first attempt added `retractedAt: null` to the shared `where`.
       That clause is spread across SEVEN models on this screen —
       transitions, hazards, risk assessments, changes, actions — and
       none of them has the column, so every one of those queries became
       a Prisma validation error. Six integration tests went red at once,
       which is the only reason it was caught before review.

       A shared clause is the right shape for TENANCY, because every
       model has orgId and forgetting it is a breach. It is the wrong
       shape for a column only one model carries. */
    const reportWhere = { ...where, retractedAt: null };

    const [
      byState, filed, closures, monthly, register, indicators, changes, actions,
      lateActions, lapsedTraining, openFindings, unreviewedChanges,
    ] = await Promise.all([
        /* THE WHOLE QUEUE, not the window. "How many are open" is a
           question about now, and a report filed four months ago and
           still untriaged is exactly the one that must not fall out of
           the count because the window moved past it. */
        prisma.safetyReport.groupBy({
          by: ["state"], where: reportWhere, _count: { _all: true },
        }),
        prisma.safetyReport.count({ where: { ...reportWhere, createdAt: { gte: from } } }),

        /* Time to closure, from the transition history rather than from
           a column — and the FIRST closure per report, which is why the
           rows are ordered and de-duplicated below rather than
           aggregated in SQL. A report closed, reopened and closed again
           took as long as it took the first time; reporting the latest
           would describe reopening as slowness, and an indicator that
           punishes reopening is one that stops reports being reopened. */
        /* CAPPED, LIKE EVERY OTHER READ IN THIS BLOCK. It was the one
           that was not: the register takes REGISTER_LIMIT, the monthly
           series is grouped in Postgres precisely so two years of
           reports are not pulled across to be counted here, and this
           sat between them reading every closure in a window the caller
           can set to two years.

           OLDEST FIRST AND THE CAP KEEPS WHAT IT READS, which is the
           right direction for a median: taking the newest would compute
           closure time from the most recent transitions and call it the
           window's. Truncation is reported below rather than absorbed,
           because a median over a capped sample is a median of a sample
           and the screen has to say so. */
        prisma.reportTransition.findMany({
          where: { ...where, toState: "CLOSED", at: { gte: from } },
          orderBy: { at: "asc" },
          take: CLOSURE_LIMIT,
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
            /* THE REPORT BEHIND THE HAZARD, for its HRC tags and nothing
               else. `hrcTags` exists on SafetyReport and on no other
               model, so this two-hop join is the ONLY path from a
               register entry to a national high-risk category — and it
               is null for a hazard raised any other way. That is why
               barrier health below reports how much of itself it could
               attribute rather than grouping regardless. */
            hazard: {
              select: { title: true, report: { select: { hrcTags: true } } },
            },
          },
        }),

        prisma.spi.findMany({
          where,
          select: {
            id: true, name: true, kind: true, direction: true, per: true,
            target: true, exposureUnit: true, owner: true,
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

        /* THE CAPA LOOP'S OWN QUESTION: what did we undertake to do, and
           is it done. Fetched as rows rather than counted in SQL because
           overdue is DERIVED from the due date against today — there is
           no status column to GROUP BY, deliberately, since a stored one
           would still say OPEN the day after the date passed. */
        prisma.correctiveAction.findMany({
          where,
          take: ACTION_LIMIT,
          select: { dueOn: true, completedOn: true, verifiedOn: true, cancelledOn: true },
        }),

        /* ------------------------------------------------------------
           THE FOUR READS BARRIER HEALTH ADDS.

           Each is NARROWED IN POSTGRES to the degraded subset rather
           than fetched whole and filtered here — `dueOn < now AND not
           closed` is an index-hittable predicate on every one of them,
           and the alternative is pulling an operator's entire training
           history across the wire to discard the current records.

           They are separate from the reads above rather than widenings
           of them. `actions` fetches dates for a summary and is capped
           at a thousand; this one fetches the TEXT of the overdue ones
           only, because barrier health names the barrier and a summary
           does not. Widening the first read to serve both would pull a
           thousand rows of db.Text to display at most a few dozen.
           ------------------------------------------------------------ */

        /* The overdue mitigations, with the report behind them — the
           only one of the four that can reach an HRC at all. */
        prisma.correctiveAction.findMany({
          where: {
            ...where,
            completedOn: null,
            cancelledOn: null,
            dueOn: { lt: to },
          },
          take: BARRIER_LIMIT,
          orderBy: { dueOn: "asc" },
          select: {
            id: true, action: true, ownerPost: true, dueOn: true,
            report: { select: { hrcTags: true } },
          },
        }),

        prisma.trainingRecord.findMany({
          where: { ...where, expiresOn: { lt: to } },
          take: BARRIER_LIMIT,
          orderBy: { expiresOn: "asc" },
          select: {
            id: true, course: true, expiresOn: true,
            user: { select: { name: true } },
          },
        }),

        prisma.auditFinding.findMany({
          where: { ...where, closedOn: null, dueBy: { lt: to } },
          take: BARRIER_LIMIT,
          orderBy: { dueBy: "asc" },
          select: { id: true, auditRef: true, finding: true, dueBy: true },
        }),

        /* The overdue-review subset of the count above, as rows. The
           count stays a COUNT — it is exact, it appears in "what needs
           attention", and turning it into `rows.length` would silently
           convert an exact figure into a capped one. */
        prisma.changeAssessment.findMany({
          where: {
            ...where,
            status: "IN_EFFECT",
            reviewedOn: null,
            reviewDueOn: { lt: to },
          },
          take: BARRIER_LIMIT,
          orderBy: { reviewDueOn: "asc" },
          select: { id: true, title: true, reviewDueOn: true },
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
      .map((x) => ({
        id: x.spi.id, name: x.spi.name, headline: x.verdict.headline,
        owner: x.spi.owner,
      }));

    const overdueReview = register.filter(
      (r) => r.reviewBy !== null && r.reviewBy.getTime() < to.getTime(),
    ).length;

    /* ----------------------------------------------------------------
       BARRIER HEALTH. Doc 9859's predictive layer, assembled from six
       records this operator already keeps rather than from flight data
       it has no recorder to produce.

       THE ARITHMETIC AND THE REFUSAL ARE BOTH IN barriers.ts. What is
       decided here is only which rows feed it — and the one decision
       worth naming is that `alerting` is passed through verbatim as the
       PERFORMANCE input rather than re-derived. There is exactly one
       definition of "over an alert level" in this product, it is
       spi.ts's, and the indicators panel below renders the same list.
       ---------------------------------------------------------------- */
    const barriers = barrierHealth(
      {
        actions: lateActions.map((a) => ({
          id: a.id,
          action: a.action,
          ownerPost: a.ownerPost,
          dueOn: a.dueOn,
          hrcs: a.report?.hrcTags ?? [],
        })),
        assessments: register
          .filter((r) => r.reviewBy !== null)
          .map((r) => ({
            id: r.id,
            hazardTitle: r.hazard.title,
            reviewBy: r.reviewBy,
            hrcs: r.hazard.report?.hrcTags ?? [],
          })),
        training: lapsedTraining.map((t) => ({
          id: t.id, who: t.user.name, course: t.course, expiresOn: t.expiresOn,
        })),
        changes: unreviewedChanges.map((c) => ({
          id: c.id, title: c.title, reviewDueOn: c.reviewDueOn,
        })),
        findings: openFindings.map((f) => ({
          id: f.id, auditRef: f.auditRef, finding: f.finding, dueBy: f.dueBy,
        })),
        crossing: alerting,
      },
      to,
    );

    /* Counted by kind here rather than in barriers.ts: the module
       returns findings, and how a screen chooses to aggregate them is
       not a safety judgement. */
    const byKind = Object.fromEntries(
      Object.keys(BARRIER_KINDS).map((k) => [
        k, barriers.degraded.filter((d) => d.kind === k).length,
      ]),
    );

    /* The label beside the code, taken from the taxonomy rather than
       copied onto the screen. A second copy of the six national
       categories on the web side is a copy that goes stale in the
       direction nobody notices — the register renames a category and
       the dashboard keeps the old word. */
    const hrcLabel = new Map(HRC_CATEGORIES.map((c) => [c.code, c.label]));
    const byHrc = Object.entries(barriers.byHrc)
      .map(([code, items]) => ({
        code, label: hrcLabel.get(code) ?? code, count: items.length,
      }))
      .sort((a, b) => b.count - a.count);

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
        /* SAID, NOT ABSORBED. A median computed over a capped sample is
           a median of a sample, and this is a figure somebody reads out
           to an authority. The register beside it already reports its
           own truncation for the same reason. */
        closureTruncated: closures.length === CLOSURE_LIMIT,
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
      actions: {
        ...summariseActions(actions, to),
        truncated: actions.length === ACTION_LIMIT,
      },
      barriers: {
        total: barriers.degraded.length,
        byKind,
        /* The six sentences, sent rather than held on the screen. They
           are the meaning of each kind, they belong beside the module
           that decides what a degradation of it is, and a copy in the
           web bundle is a copy that drifts from it. */
        kinds: BARRIER_KINDS,
        byHrc,
        attribution: barriers.attribution,
        unattributed: barriers.unattributed.length,
        /* The whole ranked list. Bounded by the four BARRIER_LIMITs
           above and by the register's own cap, all of which are
           reported — a barrier picture that silently stopped at a
           ceiling would read as a shorter list of problems. */
        degraded: barriers.degraded,
        truncated:
          lateActions.length === BARRIER_LIMIT ||
          lapsedTraining.length === BARRIER_LIMIT ||
          openFindings.length === BARRIER_LIMIT ||
          unreviewedChanges.length === BARRIER_LIMIT ||
          register.length === REGISTER_LIMIT,
      },
    });
  });
}
