// =====================================================================
// ELEMENT 1.4 — the emergency contact directory.
//
// The exercise record answers what an inspector asks: was a plan
// exercised, what did it find, did the plan change. This answers what
// an operator needs at three in the morning — who to call, in what
// order, and what that person can actually authorise — and it is the
// half element 1.4's coverage entry has named as missing since it was
// written.
//
// THE VERIFICATION IS THE FEATURE. A contact directory is not wrong
// when it is written; it goes wrong quietly, while nobody is looking,
// and the operator finds out which numbers still work during the
// emergency. So `verifiedOn` is a first-class field, staleness is
// computed against it on every read, and there is no status column to
// go stale alongside the numbers.
//
// SCOPED NARROW, DELIBERATELY. This is not a document editor. An ERP is
// a manual with call-out trees, checklists and diagrams, and building
// somewhere to type all that would produce a worse version of a Word
// file. What is here is the part a document cannot enforce.
// =====================================================================
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { can } from "@usalamasms/shared";
import { freshnessOf, assess, inCallOrder } from "../../../packages/shared/src/erp";
import { prisma, authenticate, appendAuditTx, tenantWhere } from "./core";

const LIMIT = 300;

const ContactSchema = z.object({
  name: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(160),
  organisation: z.string().trim().max(160).optional(),
  /* Not validated as a phone number, on purpose. An operator's call
     list holds satellite numbers, radio frequencies, extensions and
     "ask for the duty engineer on the hangar line" — and a regex that
     refuses any of those pushes the real answer into the notes field,
     where nobody dials it from. */
  phone: z.string().trim().min(1).max(80),
  altPhone: z.string().trim().max(80).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  callOrder: z.number().int().min(1).max(999).optional(),
  authority: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function erpRoutes(app: FastifyInstance): Promise<void> {
  const limited = {
    preHandler: [authenticate],
    config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
  };

  const shape = {
    id: true, name: true, role: true, organisation: true,
    phone: true, altPhone: true, email: true, callOrder: true,
    authority: true, notes: true, verifiedOn: true, verifiedById: true,
  } as const;

  app.get("/api/v1/sms/contacts", limited, async (req, reply) => {
    /* erp.manage to write, but any signed-in member of the operator may
       READ the call list. A directory only the safety manager can open
       is a directory that is not available at three in the morning,
       which is the one time it matters. */
    const rows = await prisma.emergencyContact.findMany({
      where: tenantWhere(req), take: LIMIT, select: shape,
    });
    const today = new Date();

    return reply.send({
      truncated: rows.length === LIMIT,
      /* Ordered here rather than in SQL, because "no call order sorts
         LAST" is the rule and Postgres sorts NULL first ascending. The
         same trap the corrective actions carried, and the directory is
         the place it would matter most — a list whose entire meaning is
         the order, with the unordered entries at the top. */
      contacts: inCallOrder(rows).map((c) => ({
        ...c,
        verifiedOn: c.verifiedOn?.toISOString() ?? null,
        freshness: freshnessOf(c, today),
      })),
      directory: assess(rows, today),
    });
  });

  app.post("/api/v1/sms/contacts", limited, async (req, reply) => {
    if (!can(req.auth!.role as never, "erp.manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = ContactSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
    }
    const d = parsed.data;

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.emergencyContact.create({
        data: {
          orgId: req.auth!.org,
          name: d.name, role: d.role, phone: d.phone,
          ...(d.organisation ? { organisation: d.organisation } : {}),
          ...(d.altPhone ? { altPhone: d.altPhone } : {}),
          ...(d.email ? { email: d.email } : {}),
          ...(d.callOrder !== undefined ? { callOrder: d.callOrder } : {}),
          ...(d.authority ? { authority: d.authority } : {}),
          ...(d.notes ? { notes: d.notes } : {}),
          /* NOT VERIFIED ON CREATION, and this is the decision the whole
             feature turns on. Typing a number out of an old manual is
             not confirming it reaches anybody — and defaulting
             verifiedOn to now() would make every freshly-imported
             directory read as fully current on the day it is least
             trustworthy. Somebody has to dial. */
        },
        select: shape,
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub,
        action: "erp.contact.create", entityType: "EmergencyContact", entityId: created.id,
      });
      return created;
    });

    return reply.code(201).send({
      contact: { ...row, verifiedOn: null, freshness: freshnessOf(row, new Date()) },
    });
  });

  app.post("/api/v1/sms/contacts/:id/verify", limited, async (req, reply) => {
    if (!can(req.auth!.role as never, "erp.manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { id } = req.params as { id: string };

    /* Tenant-scoped in the WHERE clause, so another operator's contact
       answers not-found rather than forbidden. */
    const existing = await prisma.emergencyContact.findFirst({
      where: { ...tenantWhere(req), id }, select: { id: true },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    const row = await prisma.$transaction(async (tx) => {
      const saved = await tx.emergencyContact.update({
        where: { id: existing.id },
        /* Always now(), never a date the caller chooses. Every other
           date in this product accepts a backdate because recording
           last month's work this morning is ordinary — but "I confirmed
           this number" is a thing that happened when the call was made,
           and letting it be backdated is letting a stale directory be
           made current by typing. */
        data: { verifiedOn: new Date(), verifiedById: req.auth!.sub },
        select: shape,
      });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub,
        action: "erp.contact.verify", entityType: "EmergencyContact", entityId: saved.id,
      });
      return saved;
    });

    return reply.send({
      contact: {
        ...row,
        verifiedOn: row.verifiedOn?.toISOString() ?? null,
        freshness: freshnessOf(row, new Date()),
      },
    });
  });

  app.delete("/api/v1/sms/contacts/:id", limited, async (req, reply) => {
    if (!can(req.auth!.role as never, "erp.manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { id } = req.params as { id: string };
    const existing = await prisma.emergencyContact.findFirst({
      where: { ...tenantWhere(req), id }, select: { id: true },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    await prisma.$transaction(async (tx) => {
      await tx.emergencyContact.delete({ where: { id: existing.id } });
      await appendAuditTx(tx, {
        orgId: req.auth!.org, userId: req.auth!.sub,
        action: "erp.contact.delete", entityType: "EmergencyContact", entityId: existing.id,
      });
    });

    /* A REAL DELETE, unlike a cancelled corrective action. A contact who
       has left is not a decision to record — keeping them would put a
       wrong number in a call-out tree, which is the failure this whole
       table exists to prevent. The audit entry is the record that they
       were removed and by whom. */
    return reply.code(204).send();
  });
}
