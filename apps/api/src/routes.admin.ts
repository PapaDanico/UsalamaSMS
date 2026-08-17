/* =====================================================================
   THE VENDOR'S CONSOLE — provisioning and entitlement, and nothing else.

   WHY IT EXISTS. Operators do not self-serve into a working account.
   Somebody at the vendor creates the operator, issues the first
   credential, and confirms what has been paid for. Until this file
   there was no way to do any of that except by hand in SQL, which is
   the same as saying there was no way to take a customer.

   ---------------------------------------------------------------
   THE LINE THIS FILE IS ACTUALLY ABOUT.

   Every other route in this API is scoped by `orgId`, and that scoping
   is the product's tenancy guarantee. These routes are the ONLY ones
   that read across tenants, which makes them the only place the
   guarantee can be lost — so what they may touch is enumerated rather
   than left to the shape of a query.

   A PLATFORM_ADMIN READS: an operator's name, jurisdiction, AOC
   number, fleet size, the two subscription dates, and how many users
   it has. That is a customer record.

   A PLATFORM_ADMIN NEVER READS: a report, a narrative, a hazard, a
   risk assessment, an audit finding, a training record, an audit log,
   or an export. Not "is not shown" — CANNOT, because the role holds no
   permission that opens any of them, and `PERMISSIONS.PLATFORM_ADMIN`
   is two entries long.

   THAT IS NOT POLITENESS, IT IS THE PRODUCT'S OWN PROMISE. An operator
   is buying somewhere to put the thing their people are most reluctant
   to write down. A vendor account that could open one narrative could
   open every narrative in every tenant — a worse position than any
   single operator can put itself in — and the privacy page would be
   false however carefully it was worded.

   ---------------------------------------------------------------
   WHAT THE PASSWORD DOES AND DOES NOT DO.

   Provisioning returns a generated password ONCE, in the response, to
   the administrator who asked for it. It is never stored in plaintext,
   never logged, never emailed from here, and never returned again —
   the same discipline `seed:demo --rotate` follows, for the same
   reason: a credential that can be re-read is a credential that lives
   in whatever read it last.

   The audit entry records that an operator was provisioned and by
   whom. It does not record the password, and `detail` is built
   explicitly rather than by spreading the request body, so a future
   field cannot arrive in the log by accident.
   ===================================================================== */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { can } from "@usalamasms/shared";
import { bandForFleet } from "../../../packages/shared/src/pricing";
import { stateOn, trialEndsFrom } from "../../../packages/shared/src/subscription";
import { prisma, authenticate, appendAuditTx } from "./core";
import { sendInvitation, sendUpgradeRequest, mailConfigFromEnv } from "./mail";

function guard(role: string, permission: string): boolean {
  return can(role as never, permission as never);
}

/* Word-shaped rather than a hex blob: it is read aloud down a phone
   line to a safety manager at an airstrip at least once. Ambiguous
   glyphs are left out — no O/0, no l/1/I — because "was that an oh or a
   zero" is a support call, and a support call about a credential is
   the one where somebody reads it into a chat window. */
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789ACDEFGHJKLMNPQRSTUVWXYZ";
function issuePassword(): string {
  const bytes = randomBytes(20);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10, 15)}-${out.slice(15, 20)}`;
}

const ProvisionInput = z.object({
  orgName: z.string().trim().min(2).max(160),
  jurisdiction: z.enum(["KE"]),
  aocNumber: z.string().trim().max(64).optional(),
  fleetSize: z.number().int().min(0).max(2000).optional(),
  adminEmail: z.string().trim().email().max(254),
  adminName: z.string().trim().min(2).max(160),
  /* The first user is the OPERATOR'S own administrator, not ours, and
     not a reporter. Restricted to the two posts that can meaningfully
     receive an empty account: the person who administers it and the
     person accountable for it. */
  adminRole: z.enum(["SYSTEM_ADMIN", "ACCOUNTABLE_EXECUTIVE"]).default("SYSTEM_ADMIN"),
});

const EntitlementInput = z.object({
  /* Both nullable on purpose. Clearing `paidThrough` is how a wrongly
     confirmed payment is undone, and a console that can only ever
     extend is one where a mistake is permanent. */
  paidThrough: z.string().datetime().nullable().optional(),
  trialEndsOn: z.string().datetime().nullable().optional(),
  /* Free text, required, and it goes in the audit entry. "Why is this
     operator paid through December" is the question this console will
     be asked, and an entitlement change with no reason recorded cannot
     answer it. */
  reason: z.string().trim().min(3).max(500),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const limited = {
    preHandler: [authenticate],
    /* Tighter than the operational routes. Nothing here is used in a
       loop, and provisioning runs argon2 — an unthrottled endpoint that
       hashes a password on every call is a CPU exhaustion primitive as
       well as an account-creation one. */
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  };

  /* ---- the operators, as customer records ------------------------ */
  app.get("/api/v1/admin/operators", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "platform.operator.provision")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    /* THE SELECT IS EXPLICIT, and that is the tenancy control on this
       route. `include` or a bare findMany would carry whatever the Org
       model grows next, and the next thing it grows might be a
       relation to something a vendor must not read. Adding a field
       here is a deliberate act with this comment above it. */
    const orgs = await prisma.org.findMany({
      select: {
        id: true, name: true, jurisdiction: true, aocNumber: true,
        fleetSize: true, trialEndsOn: true, paidThrough: true, createdAt: true,
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const now = new Date();
    return reply.send({
      operators: orgs.map((o: any) => ({
        id: o.id,
        name: o.name,
        jurisdiction: o.jurisdiction,
        aocNumber: o.aocNumber,
        fleetSize: o.fleetSize,
        users: o._count.users,
        createdAt: o.createdAt,
        trialEndsOn: o.trialEndsOn,
        paidThrough: o.paidThrough,
        /* Computed here for the same reason it is computed everywhere:
           a stored state is one a failed webhook can leave lying. */
        state: stateOn(
          { trialEndsOn: o.trialEndsOn ?? new Date(0), paidThrough: o.paidThrough },
          now,
        ),
      })),
    });
  });

  /* ---- provision an operator and its first credential ------------- */
  app.post("/api/v1/admin/operators", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "platform.operator.provision")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const body = ProvisionInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_operator" });

    const email = body.data.adminEmail.toLowerCase();
    const existing = await prisma.user.findFirst({ where: { email }, select: { id: true } });
    /* Said plainly, because this is the vendor's own console and the
       enumeration concern that shapes the public login does not apply:
       the administrator needs to know why nothing happened. */
    if (existing) return reply.code(409).send({ error: "email_already_registered" });

    const password = issuePassword();
    const passwordHash = await argon2.hash(password);
    const now = new Date();

    const org = await prisma.$transaction(async (tx: any) => {
      const created = await tx.org.create({
        data: {
          name: body.data.orgName,
          jurisdiction: body.data.jurisdiction,
          aocNumber: body.data.aocNumber ?? null,
          fleetSize: body.data.fleetSize ?? null,
          /* The trial starts when the account is CREATED, not when
             somebody first signs in. An operator who is handed a
             credential and does not use it for three weeks has spent
             three weeks of trial, and that is the honest reading of a
             clock that starts on provisioning. */
          trialEndsOn: trialEndsFrom(now),
        },
      });
      await tx.user.create({
        data: {
          orgId: created.id,
          email,
          name: body.data.adminName,
          role: body.data.adminRole,
          passwordHash,
          active: true,
        },
      });
      return created;
    });

    await prisma.$transaction((tx: any) => appendAuditTx(tx, {
      orgId: org.id,
      userId: req.auth!.sub,
      action: "operator.provisioned",
      entityType: "Org",
      entityId: org.id,
      /* Built field by field. Spreading the request body here would put
         a password in the audit chain the first time this input grows a
         field somebody forgot about. */
      detail: {
        name: org.name,
        jurisdiction: org.jurisdiction,
        firstUserEmail: email,
        firstUserRole: body.data.adminRole,
        trialEndsOn: org.trialEndsOn?.toISOString() ?? null,
      },
    }));

    /* THE INVITATION, AFTER THE TRANSACTION AND OUTSIDE IT.

       Deliberately not inside: a provider timeout inside the
       transaction would roll back a created operator, and the failure
       mode of "the customer exists but the email did not go" is
       recoverable by a phone call while "the customer does not exist
       and the administrator thinks they do" is not.

       IT CARRIES NO PASSWORD. See mail.ts — the administrator hands
       that over by whatever channel they and the customer already
       trust, and the message says so before the reader goes hunting
       for it.

       THE OUTCOME IS REPORTED RATHER THAN SWALLOWED. The administrator
       is the only person who can act on a failure: they are holding
       the password and can pick up a phone. An invitation that
       silently did not arrive is worse than one never attempted,
       because it leaves somebody believing a customer is onboarded. */
    const invitation = await sendInvitation(
      email,
      org.name,
      org.trialEndsOn?.toISOString().slice(0, 10) ?? null,
      mailConfigFromEnv(),
    );

    return reply.code(201).send({
      id: org.id,
      name: org.name,
      trialEndsOn: org.trialEndsOn,
      adminEmail: email,
      /* ONCE. Not stored in plaintext, not logged, not returned again.
         The administrator who called this either passes it on now or
         issues a password reset. */
      password,
      passwordShownOnce: true,
      /* SENT / NOT_CONFIGURED / FAILED, never a boolean. "false" would
         collapse "this deployment has no mail key" into "the provider
         refused", and those need different actions from the person
         reading the screen. */
      invitation: invitation.status,
      invitationReason: invitation.status === "FAILED" ? invitation.reason : undefined,
    });
  });

  /* =====================================================================
     THE OPERATOR ASKS TO PAY.

     Provisioning and granting were both administrator actions, so the
     operator's own side of the transaction had no expression at all:
     somebody meeting the 402 wall could read what it cost and had no
     way to say yes except to find an email address. Three steps, each a
     place to give up, at the moment they were trying to work.

     NO PAYMENT RAIL, DELIBERATELY. This records an intention and tells
     the administrator. Money still arrives out of band and the
     administrator still grants the entitlement by hand, which is the
     right shape while every customer is one somebody spoke to — it
     keeps a person in the loop on every deal and it means no card data
     ever touches this product.

     IT DOES NOT GRANT ANYTHING. Worth stating because the obvious next
     commit is "and then set paidThrough", and an operator who could
     grant their own entitlement by asking for it is an operator with a
     free subscription. The audit entry records who asked; only
     `platform.entitlement.manage` can answer.

     ANY AUTHENTICATED MEMBER MAY ASK. Not gated on a permission,
     because the person who hits the wall is whoever was working — a
     safety officer recording an indicator period is exactly the caller
     this exists for, and making them fetch the accountable executive to
     press a button is the friction this removes. Asking twice is
     harmless; the rate limit bounds the noise.
     ===================================================================== */
  app.post("/api/v1/upgrade-request", limited, async (req, reply) => {
    const auth = req.auth!;
    const org = await prisma.org.findUnique({
      where: { id: auth.org },
      select: { name: true, fleetSize: true, trialEndsOn: true, paidThrough: true },
    });
    if (!org) return reply.code(401).send({ error: "invalid_token" });

    const who = await prisma.user.findUnique({
      where: { id: auth.sub },
      select: { email: true, name: true },
    });

    const band = typeof org.fleetSize === "number" && org.fleetSize > 0
      ? bandForFleet(org.fleetSize)
      : null;

    await prisma.$transaction(async (tx) => {
      await appendAuditTx(tx, {
        orgId: auth.org,
        userId: auth.sub,
        action: "platform.upgrade.requested",
        entityType: "Org",
        entityId: auth.org,
        /* Built field by field. Spreading the org would put whatever
           that table grows next into the audit chain, which is the
           trap routes.admin.ts already records about provisioning. */
        detail: {
          fleetSize: org.fleetSize ?? null,
          band: band?.id ?? null,
          usdMonthly: band?.usdMonthly ?? null,
        },
      });
    });

    /* THE ADMINISTRATOR IS TOLD, and the outcome is returned rather
       than swallowed — an operator who asked and reached nobody is
       waiting for an answer that is not coming. The screen says which
       of the two happened. */
    const notice = await sendUpgradeRequest(
      org.name,
      who?.email ?? "unknown",
      org.fleetSize ?? null,
      band ? { name: band.name, usdMonthly: band.usdMonthly } : null,
      mailConfigFromEnv(),
    );

    return reply.code(202).send({
      recorded: true,
      /* SENT / NOT_CONFIGURED / FAILED. The operator is told plainly if
         nothing reached us, so they can pick up a phone rather than
         wait. */
      notified: notice.status,
      band: band ? { name: band.name, usdMonthly: band.usdMonthly } : null,
    });
  });

  /* =====================================================================
     WHO HAS ASKED, READ BACK FROM THE CHAIN THAT ALREADY RECORDED IT.

     THE EMAIL WAS THE ONLY WAY TO LEARN OF A REQUEST, AND IT IS THE ONE
     PART OF THIS FEATURE THAT DEPENDS ON SOMETHING OUTSIDE THE PRODUCT.
     A deployment with no PLATFORM_NOTICE_EMAIL recorded every request
     faithfully and told nobody — so an operator pressed "ask to
     upgrade", was honestly informed that the notice had not gone, and
     the request sat in a table no screen read. That is a customer
     trying to pay and reaching nobody, which is the worst possible
     failure for the one route whose whole purpose is revenue.

     So the console reads them. The audit chain was already the record;
     this makes it the CHANNEL as well, and the email becomes a
     convenience rather than the mechanism.

     NO NEW TABLE, DELIBERATELY. A second store of the same fact is a
     second thing to keep in step, and this one would have to be written
     inside the transaction that writes the audit entry or drift from
     it. The chain is append-only and hash-linked, which makes it a
     better record of "who asked and when" than a mutable row would be.

     THE ORG'S CURRENT STATE COMES WITH IT, because the question an
     administrator actually has is not "who asked" but "who asked and
     has not been granted yet" — and answering the first while implying
     the second is how somebody gets billed twice or chased after they
     have already paid.
     ===================================================================== */
  app.get("/api/v1/admin/upgrade-requests", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "platform.entitlement.manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const rows = await prisma.auditLog.findMany({
      where: { action: "platform.upgrade.requested" },
      orderBy: [{ seq: "desc" }],
      take: 100,
      select: {
        createdAt: true, orgId: true, detail: true,
        org: { select: { name: true, fleetSize: true, trialEndsOn: true, paidThrough: true } },
      },
    });

    /* NOT tenantWhere. This route is the vendor's, and scoping it to the
       platform administrator's own org would return nothing — the
       requests belong to customers. That is the one place in this API
       where crossing the tenancy boundary is correct, and it is
       correct only because platform.entitlement.manage is held by
       nobody inside an operator. */
    const now = new Date();
    return reply.send({
      requests: rows.map((r) => {
        const state = stateOn(
          {
            trialEndsOn: r.org.trialEndsOn ?? trialEndsFrom(new Date()),
            paidThrough: r.org.paidThrough,
          },
          now,
        );
        return {
          askedOn: r.createdAt.toISOString(),
          orgId: r.orgId,
          orgName: r.org.name,
          fleetSize: r.org.fleetSize ?? null,
          detail: r.detail ?? null,
          /* ANSWERED means the operator is paid up now, whenever that
             happened. Derived rather than stored: a flag set when an
             entitlement was granted would be wrong the moment one
             lapsed again, and this list is read to decide who still
             needs chasing. */
          answered: state !== "LAPSED",
          state,
        };
      }),
    });
  });

  /* ---- confirm payment, or extend a trial ------------------------- */
  app.post("/api/v1/admin/operators/:id/entitlement", limited, async (req, reply) => {
    if (!guard(req.auth!.role, "platform.entitlement.manage")) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const body = EntitlementInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_entitlement" });
    if (body.data.paidThrough === undefined && body.data.trialEndsOn === undefined) {
      return reply.code(400).send({ error: "nothing_to_change" });
    }

    const id = (req.params as any).id as string;
    const before = await prisma.org.findUnique({
      where: { id },
      select: { id: true, name: true, trialEndsOn: true, paidThrough: true },
    });
    if (!before) return reply.code(404).send({ error: "not_found" });

    const data: { paidThrough?: Date | null; trialEndsOn?: Date | null } = {};
    if (body.data.paidThrough !== undefined) {
      data.paidThrough = body.data.paidThrough ? new Date(body.data.paidThrough) : null;
    }
    if (body.data.trialEndsOn !== undefined) {
      data.trialEndsOn = body.data.trialEndsOn ? new Date(body.data.trialEndsOn) : null;
    }

    const after = await prisma.org.update({
      where: { id },
      data,
      select: { id: true, name: true, trialEndsOn: true, paidThrough: true },
    });

    await prisma.$transaction((tx: any) => appendAuditTx(tx, {
      orgId: id,
      userId: req.auth!.sub,
      action: "entitlement.changed",
      entityType: "Org",
      entityId: id,
      /* BOTH SIDES, because "paid through December" tells you nothing
         about whether that was an extension, a correction or a
         reversal. The audit chain is what this console is answerable
         through, and a one-sided entry cannot answer for a mistake. */
      /* ISO strings rather than Dates: `detail` is a Json column, and a
         Date silently becomes something else on the way through. The
         audit chain is hashed over this value, so "something else" is
         not a cosmetic problem. */
      detail: {
        reason: body.data.reason,
        from: {
          trialEndsOn: before.trialEndsOn?.toISOString() ?? null,
          paidThrough: before.paidThrough?.toISOString() ?? null,
        },
        to: {
          trialEndsOn: after.trialEndsOn?.toISOString() ?? null,
          paidThrough: after.paidThrough?.toISOString() ?? null,
        },
      },
    }));

    return reply.send({
      id: after.id,
      name: after.name,
      trialEndsOn: after.trialEndsOn,
      paidThrough: after.paidThrough,
      /* An operator with no trial date and no payment has never been
         entitled to anything; stateOn wants a date, so the absence is
         mapped to the epoch rather than smuggled through as null. A
         trial that "ended in 1970" reads as LAPSED, which is the
         truthful answer for an account nobody has granted anything. */
      state: stateOn(
        {
          trialEndsOn: after.trialEndsOn ?? new Date(0),
          paidThrough: after.paidThrough,
        },
        new Date(),
      ),
    });
  });
}
