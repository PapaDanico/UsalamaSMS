// =====================================================================
// THE OPERATOR'S OWN VOCABULARY.
//
// What may be set here, and what may never be, is argued in
// packages/shared/src/tenant.ts. The short version: an operator sets
// what it calls things and where it flies; it does not set reporting
// deadlines, tolerability bands, de-identification, the audit chain, or
// what the twelve elements mean.
//
// THE VALIDATION IS THE ENFORCEMENT. `normaliseConfig()` reduces
// whatever arrives to the fields a tenant is allowed to say, keyed by
// the framework's own keys, and drops the rest — so this route cannot
// write a sixth severity even if a client sends one, and does not have
// to remember not to. A settings endpoint that trusts its body and
// filters on the way out is a settings endpoint that leaks the first
// time somebody adds a field to the response.
//
// WHY THE WHOLE OBJECT IS REPLACED RATHER THAN PATCHED. A tenant
// configuration is small, is edited by one person on one screen, and is
// read on every render. PATCH semantics over a partial label map need
// an answer to "how do I remove a rename" that is not "send an empty
// string", and an empty string is exactly the value that renders a
// blank where a severity should be. Sending the whole object makes
// removal the absence of a key, which is what it means.
// =====================================================================
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { can } from "@usalamasms/shared";
/* By path rather than through the shared index, matching the
   disposition and occurrence modules: the index is what the web entry
   reaches for, and every module added to it is one a reporter carries
   whether or not they ever open a settings screen. */
import { normaliseConfig } from "../../../packages/shared/src/tenant";
import { checkLogo } from "../../../packages/shared/src/logo";
import { prisma, authenticate, appendAudit, tenantWhere } from "./core";

export async function configRoutes(app: FastifyInstance): Promise<void> {
  const limited = {
    preHandler: [authenticate],
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  };

  /* READABLE BY ANY SIGNED-IN MEMBER OF THE OPERATOR, deliberately.
     These are labels — what this operator calls a Catastrophic, what it
     calls its accountable executive — and every screen that renders a
     scale needs them. Holding them behind the same permission that
     WRITES them would mean a frontline user's risk matrix said
     something different from the safety manager's, which is worse than
     any confidentiality this could protect. There is nothing sensitive
     in a vocabulary. */
  app.get("/api/v1/config", limited, async (req, reply) => {
    const row = await prisma.orgConfig.findFirst({ where: tenantWhere(req) });
    /* An operator that has never opened the screen and one that opened
       it and cleared everything are the same thing: they both get what
       the product ships. So the empty config is returned rather than a
       404, and no caller has to distinguish them. */
    /* The logo rides ALONGSIDE the config rather than inside it.
       normaliseConfig() replaces the whole object, so a logo held in
       there would be wiped by any client that saved a vocabulary
       without echoing the image back — which is every client that does
       not know about it yet. */
    return reply.send({
      config: normaliseConfig(row ?? {}),
      logo: row?.logo ?? null,
    });
  });

  app.put("/api/v1/config", limited, async (req, reply) => {
    const auth = req.auth!;
    /* The same authority that holds the SMS record. Renaming a severity
       point changes what every register in the operator reads as, and
       the org chart is the safety manager's to describe. */
    if (!can(auth.role as never, "config.manage")) {
      return reply.code(403).send({
        error: "forbidden",
        message:
          "What the operator calls its posts and its risk scales is held by the safety " +
          "manager and the accountable executive.",
      });
    }

    const config = normaliseConfig(req.body);

    const saved = await prisma.orgConfig.upsert({
      where: { orgId: auth.org },
      create: {
        orgId: auth.org,
        severityLabels: config.severityLabels ? (config.severityLabels as Prisma.InputJsonValue) : undefined,
        likelihoodLabels: config.likelihoodLabels ? (config.likelihoodLabels as Prisma.InputJsonValue) : undefined,
        postTitles: config.postTitles ? (config.postTitles as Prisma.InputJsonValue) : undefined,
        aerodromes: [...(config.aerodromes ?? [])],
        aircraftTypes: [...(config.aircraftTypes ?? [])],
        reviewDefaultDays: config.reviewDefaultDays ?? null,
        decisionLevels: config.decisionLevels
          ? (config.decisionLevels as Prisma.InputJsonValue)
          : undefined,
      },
      update: {
        /* `null` and not `undefined` on the update path. Prisma reads
           undefined as "leave this column alone", so a cleared rename
           sent as undefined would silently persist the old label — the
           operator would remove a word on screen, save, reload, and
           find it still there. The whole object is replaced, so absence
           means removal and must be written as such. */
        severityLabels: config.severityLabels ? (config.severityLabels as Prisma.InputJsonValue) : Prisma.DbNull,
        likelihoodLabels: config.likelihoodLabels ? (config.likelihoodLabels as Prisma.InputJsonValue) : Prisma.DbNull,
        postTitles: config.postTitles ? (config.postTitles as Prisma.InputJsonValue) : Prisma.DbNull,
        aerodromes: { set: [...(config.aerodromes ?? [])] },
        aircraftTypes: { set: [...(config.aircraftTypes ?? [])] },
        reviewDefaultDays: config.reviewDefaultDays ?? null,
        /* DbNull rather than undefined, for the reason the label maps
           give above: an operator clearing the declaration must see it
           cleared on reload, not silently keep the old one. */
        decisionLevels: config.decisionLevels
          ? (config.decisionLevels as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });

    /* WHAT AN OPERATOR CALLS A CATASTROPHIC IS AN AUDITABLE FACT. A
       register printed last quarter reads in last quarter's words, and
       an auditor asking why two documents word the same band
       differently is asking a question this entry answers. The values
       are labels, not narrative, so they travel in the detail — unlike
       a disposition note, which can quote a report. */
    await appendAudit({
      orgId: auth.org,
      userId: auth.sub,
      action: "org.config",
      entityType: "OrgConfig",
      entityId: saved.id,
      detail: {
        severityLabels: config.severityLabels ?? null,
        likelihoodLabels: config.likelihoodLabels ?? null,
        postTitles: config.postTitles ?? null,
        aerodromes: config.aerodromes?.length ?? 0,
        aircraftTypes: config.aircraftTypes?.length ?? 0,
        reviewDefaultDays: config.reviewDefaultDays ?? null,
      },
    });

    /* The NORMALISED object comes back, not the submitted one. A client
       that sent a sixth severity should see that it was not kept rather
       than render its own copy of what it hoped it had saved. */
    return reply.send({ config });
  });

  /* =====================================================================
     THE OPERATOR'S MARK, ON ITS OWN ROUTE.

     Not a field on PUT /config, and that is the point. normaliseConfig
     replaces the whole object, so a logo carried in there would be
     erased by any client that saved a vocabulary without echoing the
     image back — which is every client written before this existed,
     and the offline queue replaying an older payload. A separate route
     cannot be collateral damage of an unrelated save.

     SAME AUTHORITY AS THE REST OF THE CONFIG. The mark goes on every
     document the operator hands a regulator; that is the safety
     manager's and the accountable executive's to decide, not a
     reporter's.
     ===================================================================== */
  app.put("/api/v1/config/logo", limited, async (req, reply) => {
    const auth = req.auth!;
    if (!can(auth.role as never, "config.manage")) {
      return reply.code(403).send({
        error: "forbidden",
        message:
          "The mark on the operator's documents is held by the safety manager and the " +
          "accountable executive.",
      });
    }

    const supplied = (req.body as { logo?: unknown } | undefined)?.logo;

    /* CLEARING IS AN EXPLICIT null, not an omission. An absent key is a
       client that does not know about this field; treating that as
       "remove the logo" would let an old payload strip an operator's
       branding on its next save, which is the same class of defect as
       the config wipe this route exists to avoid. */
    if (supplied === null) {
      const cleared = await prisma.orgConfig.upsert({
        where: { orgId: auth.org },
        create: { orgId: auth.org, aerodromes: [], aircraftTypes: [] },
        update: { logo: null, logoUpdatedAt: null },
      });
      await appendAudit({
        orgId: auth.org,
        userId: auth.sub,
        action: "org.logo.clear",
        entityType: "OrgConfig",
        entityId: cleared.id,
        detail: { cleared: true },
      });
      return reply.send({ logo: null });
    }

    /* THE SERVER CHECKS TOO. The upload screen calls checkLogo() so
       somebody is told before a slow link carries the bytes, but this
       route is reachable with curl and a client-side check is a
       courtesy, never a control. */
    const verdict = checkLogo(supplied);
    if (!verdict.ok) {
      return reply.code(400).send({ error: "rejected", message: verdict.message });
    }

    const saved = await prisma.orgConfig.upsert({
      where: { orgId: auth.org },
      create: {
        orgId: auth.org,
        aerodromes: [],
        aircraftTypes: [],
        logo: supplied as string,
        logoUpdatedAt: new Date(),
      },
      update: { logo: supplied as string, logoUpdatedAt: new Date() },
    });

    /* THE IMAGE ITSELF NEVER REACHES THE AUDIT CHAIN. The chain is read
       by people looking for what changed and when; sixty kilobytes of
       base64 in a detail column would make every entry around it
       unreadable, and the bytes are already in the row this entry
       points at. What changed is that a mark was set, its type, and how
       big it was. */
    await appendAudit({
      orgId: auth.org,
      userId: auth.sub,
      action: "org.logo.set",
      entityType: "OrgConfig",
      entityId: saved.id,
      detail: { type: verdict.type, chars: verdict.chars },
    });

    return reply.send({ logo: supplied });
  });
}
