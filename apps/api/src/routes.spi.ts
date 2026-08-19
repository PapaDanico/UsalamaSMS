// =====================================================================
// ELEMENT 3.1 — Safety performance monitoring and measurement.
//
// WHY THIS ROUTE EXISTS AT ALL. The indicators were already computed,
// correctly, by packages/shared/src/spi.ts — and stored in one
// browser's localStorage. Regulation 9(5) of Kenya's L.N. 32/2026
// requires a service provider's SMS to have "safety performance
// indicators and targets acceptable to the Authority". An operator
// asked to produce theirs had to produce a particular handset.
//
// So this is not new measurement. It is the same measurement, in a
// place the safety office can see and an inspector can be shown.
//
// WHAT IS DELIBERATELY NOT STORED. The alert level. alertLevels()
// derives it from the series, and a stored alert level is the same
// defect as a stored deadline: right on the day it was written and
// silently wrong once the next period lands. The API returns the
// periods; the caller computes. Charter rule 6.
//
// THE PERIOD IS THE APPEND, AND IT IS WHERE THE CARE GOES. A period
// added twice doubles a denominator and moves an alert level for a
// reason that did not happen — the C-07 finding, which was fixed in
// the browser and is enforced here in the schema and again in the
// route, because a uniqueness constraint returns a database error and
// an operator deserves a sentence.
// =====================================================================
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { can, HRC_CATEGORIES, type Permission } from "@usalamasms/shared";
import { rollUp, SSP_CAVEAT } from "../../../packages/shared/src/ssp";
import { NASP_INDICATORS, NASP_SOURCE } from "../../../packages/shared/src/nasp";
import { periodWindow } from "../../../packages/shared/src/spi";
import { SPI_STARTERS, startersFor } from "../../../packages/shared/src/spi-starters";
import type { OperatorKind } from "../../../packages/shared/src/pricing";
import { prisma, authenticate, appendAuditTx, tenantWhere , requireEntitlement } from "./core";

const LIST_LIMIT = 200;

function guard(role: string, permission: Permission): boolean {
  return can(role as never, permission);
}

/* The vocabulary is the shared module's, restated as a validator rather
   than imported as one: zod belongs at the edge, and spi.ts is kept
   free of it so a caller that needs only the arithmetic can have it. */
const KINDS = ["LOWER_CONSEQUENCE", "HIGHER_CONSEQUENCE"] as const;
const DIRECTIONS = ["LOWER_IS_BETTER", "HIGHER_IS_BETTER"] as const;

/* =====================================================================
   THE SUBMISSION HALF — Appendix II of CAA-AC-SMS009, §7.6.3.

   The Authority's form asks for an indicator's DEFINITION, not its
   numbers: description, rationale, limitations, terms, data custody.
   These are the operator's answers, stored so the form composes from
   the record instead of being retyped at a desk.

   EVERY FIELD OPTIONAL AND NULLABLE. Optional because the form fills
   over time; nullable because clearing an answer must be expressible —
   the same reasoning as `hrc` in IndicatorSchema below. A field absent
   from the body means "leave it alone"; null means "blank it".

   `indicatorType` IS VALIDATED AGAINST THE TWO ANSWERS AND NEVER
   COMPUTED. Field 3 (activity- against outcome-related) is a different
   axis from `kind` (how rare the events are); a route that defaulted
   one from the other would file leading indicators as lagging.

   `acceptance` RECORDS WHAT THE LETTER SAID. This product does not
   submit to the Authority and does not claim to — the icaas module
   draws that line and it is the same line here. Part E is transcribed
   by the operator from the acceptance letter, dated, and shown as
   theirs.
   ===================================================================== */
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(d)), "not a date")
  .nullable()
  .optional();
const SubmissionSchema = z
  .object({
    areaOfOperations: text(160),
    description: text(2000),
    indicatorType: z.enum(["ACTIVITY", "OUTCOME"]).nullable().optional(),
    rationale: text(2000),
    limitations: text(2000),
    definitionOfTerms: text(2000),
    dataSets: text(1000),
    dataProvider: text(160),
    dataCustodian: text(160),
    submittedOn: isoDay,
    acceptance: z.enum(["ACCEPTED", "NOT_ACCEPTED"]).nullable().optional(),
    acceptedOn: isoDay,
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "empty update" })
  .refine((b) => !(b.acceptedOn && b.acceptance === undefined), {
    message: "an acceptance date needs an acceptance",
  });

const IndicatorSchema = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.enum(KINDS),
  exposureUnit: z.string().trim().min(1).max(60),
  /* Positive and finite. A rate basis of zero divides by nothing, and a
     negative one inverts the indicator silently. */
  per: z.number().finite().positive(),
  direction: z.enum(DIRECTIONS),
  target: z.number().finite().optional(),
  owner: z.string().trim().max(160).default(""),
  /* WHICH NATIONAL HIGH-RISK CATEGORY THIS BEARS ON, if the operator
     says it bears on one.

     Validated against the taxonomy rather than accepted as free text,
     because the rollup groups by this value and a typo would silently
     put an indicator in a category of its own — a gap that reads as a
     gap in the operator's SMS rather than in their spelling.

     `.nullable()` as well as optional: clearing the tag on an existing
     indicator has to be expressible, and an absent key would read as
     "leave it alone". */
  hrc: z
    .string()
    .refine((c) => HRC_CATEGORIES.some((h) => h.code === c), {
      message: "hrc must be a category code from the taxonomy",
    })
    .nullable()
    .optional(),
});

/* The response, and when it was taken. actionOn is optional and
   separate from the row's createdAt: recording last quarter's response
   this morning is the ordinary case, and conflating the two would date
   every response to the day of data entry. */
const ActionSchema = z.object({
  actionTaken: z.string().trim().min(1).max(4000),
  actionOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const PeriodSchema = z.object({
  label: z.string().trim().min(1).max(40),
  /* Events are a count and exposure is a measure, so they are typed
     differently. Both refuse negatives: a negative count is not a
     correction, it is a data-entry error that would drag a rate below
     zero and read as an improvement. */
  events: z.number().int().min(0),
  exposure: z.number().finite().positive(),
});

export async function spiRoutes(app: FastifyInstance): Promise<void> {
  const limited = {
    preHandler: authenticate,
    /* EVERY ROUTE IN THIS FILE WRITES ROWS, AND NONE OF THEM WAS LIMITED.

       Found by asking which route files declare no limit at all rather
       than by reading any one of them: this file, routes.register.ts and
       routes.spi.ts were the three, and all three accept POSTs that
       create records. Authentication bounds WHO can do it; it does not
       bound how often, so a stuck retry loop or a stolen token wrote
       until something else broke.

       60 a minute, matching routes.config.ts — this is a safety manager
       adding entries on a working screen, not a reporter at a strip, so
       the limit only has to be below "a script". The tighter number
       belongs on routes.attachments.ts, which is the one that writes
       megabytes. */
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  };

  /* THE PAID SIDE OF THIS FILE. A lapsed subscription pauses the
     safety office's working surfaces and never touches filing,
     reading your own record or exporting the whole record — see
     requireEntitlement in core.ts for why those three are not
     negotiable. The capability is named here rather than in a
     central list, so the reason lives with the routes it gates. */
  const paid = {
    ...limited,
    preHandler: [authenticate, requireEntitlement("RECORD_INDICATOR_PERIOD")],
  };

  /* ==================================================================
     STARTERS — read-only, no entitlement gate.

     The blank-page problem this endpoint solves: an operator creating
     its first indicator has nothing to work from. The starters list
     offers pre-filled field values the operator edits rather than
     invents, at the same cost as browsing the templates registry.

     NO ENTITLEMENT GATE because the list is informational: reading it
     costs no database row, creates nothing, and an operator who reads
     it and decides not to use it has lost nothing. Requiring
     RECORD_INDICATOR_PERIOD to browse starters would keep the page
     empty for operators still on trial.

     OPTIONAL `kind` QUERY PARAM filters by operator kind ("AOC",
     "RPAS", "HELIPORT", "MRO"). Absent or unrecognised returns all.
     ================================================================== */
  app.get("/api/v1/spi/starters", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "spi.read")) return reply.code(403).send({ error: "forbidden" });
    const kind = String((req.query as { kind?: string }).kind ?? "").toUpperCase() as OperatorKind;
    const VALID_KINDS: ReadonlyArray<string> = ["AOC", "RPAS", "HELIPORT", "MRO"];
    const filtered = VALID_KINDS.includes(kind) ? startersFor(kind) : SPI_STARTERS;
    return reply.send({
      starters: filtered,
      caveat:
        "These are offered as starting points, not requirements. Each organisation " +
        "develops its own SPIs under Doc 9859 §9.1. Edit the pre-filled fields to " +
        "match your operations before submitting the form to the Authority.",
    });
  });

  app.get("/api/v1/spi", paid, async (req, reply) => {
    if (!guard(req.auth!.role, "spi.read")) return reply.code(403).send({ error: "forbidden" });

    const indicators = await prisma.spi.findMany({
      where: tenantWhere(req),
      orderBy: [{ name: "asc" }],
      take: LIST_LIMIT,
      include: {
        /* Ordered by insertion, not by label. A label is the
           operator's own cadence — "2026-Q1", "March", "Week 12" — and
           the server has no business parsing it into a calendar. The
           shared module has periodOrder() for the cases where it can
           be read; where it cannot, the order the operator entered
           them in is the only truth available. */
        periods: {
          orderBy: [{ createdAt: "asc" }],
          take: LIST_LIMIT,
          select: {
            id: true, label: true, events: true, exposure: true,
            /* Element 3.1's evidence: "a record of what happened the
               last time one was crossed". Returned with the series so
               the screen can show the response beside the period that
               prompted it, rather than in a list somewhere else. */
            actionTaken: true, actionOn: true,
          },
        },
      },
    });

    return reply.send({ indicators });
  });

  /* =====================================================================
     HOW THE OPERATOR'S INDICATORS ROLL UP TO KENYA'S NATIONAL PLAN.

     Annex 19 Amendment 2 turns the SSP-to-SMS indicator link from good
     practice into the substance of performance-based oversight. Kenya's
     NASP names six High-Risk Categories; this answers, from the
     operator's own record, which of the six they can currently speak
     to.

     TWO MODELS, TWO PERMISSIONS, AND CLAUDE.md RECORDS WHY. `/picture`
     gated once at the door and for one commit disclosed an audit
     finding to a role that its own endpoint answers 403 for. A rollup
     reads like arithmetic rather than like a read of the underlying
     table, which is exactly what makes it the easy place to lose the
     rule.

       Spi           `spi.read`         — the same gate /api/v1/spi uses
       SafetyReport  `report.read.org`  — the same gate /api/v1/reports uses

     AND A CALLER WHO MAY NOT READ REPORTS IS TOLD SO. Silently passing
     an empty tag count would render every category the operator is not
     measuring as UNSEEN — "nothing is tagged here" — when the tags
     exist and the reader simply cannot see them. On the one screen an
     operator shows to a regulator, that understates their position
     using their own product.
     ===================================================================== */
  app.get("/api/v1/ssp", limited, async (req, reply) => {
    const auth = req.auth!;
    if (!guard(auth.role, "spi.read")) return reply.code(403).send({ error: "forbidden" });

    const indicators = await prisma.spi.findMany({
      where: tenantWhere(req),
      take: LIST_LIMIT,
      select: { name: true, hrc: true, periods: { select: { id: true }, take: LIST_LIMIT } },
    });

    const withheld: string[] = [];
    const reportsByHrc: Record<string, number> = {};

    if (guard(auth.role, "report.read.org")) {
      /* THE TAGS ONLY — not the title, not the narrative. A rollup
         needs to know how many reports carry a category, and nothing
         about what any of them says. Selecting the narrative here and
         counting it would put confidential text into a response that
         had no use for it. */
      const tagged = await prisma.safetyReport.findMany({
        /* RETRACTED REPORTS DO NOT COUNT, and the gate caught this
           before it shipped. A retraction is a tombstone — the row
           stays so the audit chain is unbroken, and it stops counting.
           Including them here would tell a regulator that an operator
           is seeing events in a category on the strength of reports
           that operator has withdrawn, on the one screen built to be
           shown to that regulator. */
        where: { ...tenantWhere(req), retractedAt: null },
        take: LIST_LIMIT,
        select: { hrcTags: true },
      });
      for (const r of tagged) {
        for (const tag of r.hrcTags) {
          reportsByHrc[tag] = (reportsByHrc[tag] ?? 0) + 1;
        }
      }
    } else {
      withheld.push(
        "Counts of reports tagged against each category — these need report access. " +
          "A category shown as unseen may only be unseen by you.",
      );
    }

    return reply.send({
      ...rollUp(HRC_CATEGORIES, NASP_INDICATORS, indicators, reportsByHrc),
      caveat: SSP_CAVEAT,
      source: NASP_SOURCE,
      withheld,
    });
  });

  app.post("/api/v1/spi", paid, async (req, reply) => {
    if (!guard(req.auth!.role, "spi.configure")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = IndicatorSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }

    const existing = await prisma.spi.findFirst({
      where: { ...tenantWhere(req), name: parsed.data.name },
      select: { id: true },
    });
    if (existing) {
      /* Named rather than swallowed. Two indicators with one name and
         different series is a measurement nobody can act on, and the
         operator needs to know which of the two they are looking at. */
      return reply.code(409).send({
        error: "duplicate_name",
        message: "An indicator with that name already exists for this operator.",
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const spi = await tx.spi.create({
        data: { orgId: req.auth!.org, ...parsed.data },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "spi.configure",
        entityType: "Spi",
        entityId: spi.id,
      });
      return spi;
    });

    return reply.code(201).send({ indicator: { ...created, periods: [] } });
  });

  /* =====================================================================
     THE APPENDIX II ANSWERS, updated as the operator writes them.

     Behind `spi.configure`, the same permission that creates the
     indicator — the submission record IS configuration, and a second
     permission here would let an operator grant the arithmetic while
     withholding the paperwork, which is the /picture lesson inverted.

     PARTIAL ON PURPOSE. The form is filled across weeks; a route that
     demanded the whole thing at once would hold nine answers hostage
     to the tenth. Absent key = untouched, null = blanked — the hrc
     convention, applied to eleven more fields.
     ===================================================================== */
  app.put("/api/v1/spi/:id/submission", paid, async (req, reply) => {
    if (!guard(req.auth!.role, "spi.configure")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { id } = req.params as { id: string };
    const parsed = SubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }

    /* Tenancy first, as everywhere: the row must be this operator's
       before anything is written to it. updateMany carries the orgId
       into the WHERE, so a guessed id from another tenancy updates
       zero rows and answers 404 rather than leaking that it exists. */
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) data[k] = v === null ? null : v;
    }
    /* An ISO day becomes a Date at the edge, where zod proved its shape. */
    for (const k of ["submittedOn", "acceptedOn"]) {
      if (typeof data[k] === "string") data[k] = new Date(`${data[k]}T00:00:00.000Z`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.spi.updateMany({ where: { ...tenantWhere(req), id }, data });
      if (r.count === 0) return null;
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "spi.configure",
        entityType: "Spi",
        entityId: id,
      });
      return tx.spi.findFirst({ where: { ...tenantWhere(req), id } });
    });

    if (!updated) return reply.code(404).send({ error: "not_found" });
    return reply.send({ indicator: updated });
  });

  /* =====================================================================
     WHAT WAS DONE ABOUT IT — element 3.1's own evidence definition.

     The element asks for "indicators with a defined trigger, and a
     record of what happened the last time one was crossed". The trigger
     has been there since alertLevels() landed. This is the second half,
     and without it the element is a chart.

     RECORDED AGAINST THE PERIOD, NOT AGAINST AN ALERT LEVEL. The level
     is derived on every read and deliberately never stored — charter
     rule 6 — so attaching the response to it would mean either storing
     a level that can go stale or orphaning the note the moment a later
     period moved the baseline underneath it. The period is the fact;
     the level is an opinion about the series the period sits in.

     NOT REQUIRED, AND NOT ENFORCED WHEN A LEVEL IS CROSSED. A product
     that refuses to accept the numbers until somebody has written the
     response is a product whose numbers are kept in a spreadsheet
     instead. The screen asks; the API accepts either way.
     ===================================================================== */
  app.post("/api/v1/spi/:id/periods/:periodId/action", paid, async (req, reply) => {
    if (!guard(req.auth!.role, "spi.configure")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { id, periodId } = req.params as { id: string; periodId: string };
    const parsed = ActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }

    /* Scoped through the indicator AND by orgId, so a period id from
       another operator answers not-found rather than forbidden — a
       refusal confirms the row exists. Same reasoning as the period
       append above. */
    const period = await prisma.spiPeriod.findFirst({
      where: { ...tenantWhere(req), id: periodId, spiId: id },
      select: { id: true },
    });
    if (!period) return reply.code(404).send({ error: "not_found" });

    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.spiPeriod.update({
        where: { id: period.id },
        data: {
          actionTaken: parsed.data.actionTaken,
          ...(parsed.data.actionOn
            ? { actionOn: new Date(`${parsed.data.actionOn}T00:00:00.000Z`) }
            : {}),
        },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "spi.period.action",
        entityType: "SpiPeriod",
        entityId: row.id,
      });
      return row;
    });

    return reply.send({
      period: {
        id: saved.id,
        label: saved.label,
        events: saved.events,
        exposure: saved.exposure,
        actionTaken: saved.actionTaken,
        actionOn: saved.actionOn ? saved.actionOn.toISOString().slice(0, 10) : null,
      },
    });
  });

  /* ------------------------------------------------------------------
     HOW MANY REPORTS ACTUALLY ARRIVED IN THIS PERIOD.

     The debt this pays down has been recorded since the register was
     server-backed: "indicators are typed, not fed" — an operator types
     an event count while the reports it came from sit in the same
     database, so the indicator can disagree with the queue behind it
     and nobody finds out until an inspector adds them up.

     IT OFFERS, IT DOES NOT FILL IN. An indicator counts a PARTICULAR
     thing — unstable approaches, MEL deferrals, ground damage — and the
     number of reports filed in a quarter is not that thing unless the
     operator says it is. Filling the field in silently would replace a
     transcription error with a category error, which is worse because
     it looks right. So this answers the question and the screen puts
     the answer beside the field with the caveat attached.

     A LABEL WITH NO WINDOW IS REFUSED, not guessed at. "Winter ops" and
     "Rotation 4" are cadences an operator may legitimately use, and a
     product that quietly decided one of them meant a quarter would be
     confidently wrong about a number somebody reports to an authority.
     ------------------------------------------------------------------ */
  app.get("/api/v1/spi/observed", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "spi.read")) return reply.code(403).send({ error: "forbidden" });
    const label = String((req.query as { label?: string }).label ?? "");
    const window = periodWindow(label);
    if (!window) {
      return reply.code(422).send({
        error: "unrecognised_period",
        message:
          `"${label}" is not a period this product can turn into a date range, so it ` +
          "cannot count reports for it. Quarters (2026-Q1), months (2026-08), days and " +
          "years are understood; anything else is yours to count.",
      });
    }

    /* GROUPED IN POSTGRES rather than counted here, and filed BY
       createdAt rather than by occurredAt — an indicator period is a
       reporting period, and a report about something that happened last
       March still arrived this quarter. The distinction matters and the
       response names which one it used. */
    const rows = await prisma.safetyReport.groupBy({
      by: ["type"],
      /* An indicator counts what was REPORTED, and a withdrawn
         duplicate was not a second report. Counting it inflates the
         reporting rate this element is measured on — which is the one
         number an operator is tempted to like the look of. */
      where: { ...tenantWhere(req), retractedAt: null, createdAt: { gte: window.from, lt: window.to } },
      _count: { _all: true },
    });

    return reply.send({
      label,
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      countedBy: "createdAt",
      total: rows.reduce((n, r) => n + r._count._all, 0),
      byType: Object.fromEntries(rows.map((r) => [r.type, r._count._all])),
      caveat:
        "This is how many reports arrived in that window. It is this indicator's event " +
        "count only if this indicator counts reports — check before using it.",
    });
  });

  app.post("/api/v1/spi/:id/periods", paid, async (req, reply) => {
    if (!guard(req.auth!.role, "spi.configure")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { id } = req.params as { id: string };
    const parsed = PeriodSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }

    /* Scoped by orgId, not merely by id. An indicator id from another
       operator must answer not-found rather than forbidden — a refusal
       confirms the row exists, which is the same reasoning the report
       routes were built on. */
    const spi = await prisma.spi.findFirst({
      where: { ...tenantWhere(req), id },
      select: { id: true },
    });
    if (!spi) return reply.code(404).send({ error: "not_found" });

    const clash = await prisma.spiPeriod.findFirst({
      where: { spiId: spi.id, label: parsed.data.label },
      select: { id: true },
    });
    if (clash) {
      /* THE C-07 REFUSAL, on the server this time. The same period
         appended twice doubles the exposure it contributes and moves
         the alert level for a reason that did not happen. The unique
         constraint would also catch it, and would answer with a
         database error — an operator who has just typed "2026-Q1"
         twice deserves a sentence instead. */
      return reply.code(409).send({
        error: "duplicate_period",
        message: `This indicator already has a period labelled "${parsed.data.label}".`,
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const period = await tx.spiPeriod.create({
        data: { orgId: req.auth!.org, spiId: spi.id, ...parsed.data },
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org,
        userId: req.auth!.sub,
        action: "spi.period.append",
        entityType: "SpiPeriod",
        entityId: period.id,
      });
      return period;
    });

    return reply.code(201).send({
      period: {
        id: created.id,
        label: created.label,
        events: created.events,
        exposure: created.exposure,
      },
    });
  });
}
