/* =====================================================================
   THE ONE ROUTE IN THIS API THAT GRANTS ENTITLEMENT TO A STRANGER.

   Every other write here is behind a session and a tenancy check.
   This one is called by Paystack, which has no account in this
   product, carries no bearer token, and cannot be asked to log in. So
   the trust has to come from the message rather than the caller, and
   FOUR things are checked before `paidThrough` moves by a single day.
   Each has a mutation in tests/billing.test.ts or the integration
   suite that removes it and watches the gate go red:

     1. SIGNATURE — HMAC-SHA512 over the RAW body, constant time.
        Without it, anybody can POST themselves a year.
     2. PAYSTACK'S OWN ANSWER — the payload is not believed; the
        transaction is re-verified against the API before value moves.
     3. AMOUNT — at least what the band and term cost, in KES minor
        units. Without it, one shilling buys a year.
     4. IDEMPOTENCE — a reference already in the audit chain grants
        nothing further. Paystack retries failed deliveries for days;
        a rail that adds a year per delivery gives the product away to
        anybody patient enough to let it retry.

   -------------------------------------------------------------------
   IT ANSWERS 200 TO THINGS IT DELIBERATELY IGNORES, and that is not
   sloppiness. A webhook endpoint that returns an error for "not my
   reference" or "already applied" tells Paystack to retry forever, and
   the retry storm looks like an outage in the logs of whoever is on
   call. 200 means RECEIVED AND UNDERSTOOD, not "value granted" — the
   body says which, and the audit chain is where value is recorded.

   The exceptions are the two where retrying is the correct behaviour:
   a bad signature (401 — never process, and a real Paystack delivery
   will not produce one) and an unconfigured deployment (503 — the key
   is missing, retry once it is set).

   -------------------------------------------------------------------
   THE FX RATE IS NOT IN THE SOURCE, and the amount check FAILS CLOSED
   without it. A rate hardcoded here is wrong the day after it is
   written; `pricing.ts` already refuses to name a shilling figure for
   that reason. So `BILLING_KES_PER_USD` is read from the environment,
   and when it is absent this route records the payment and grants
   NOTHING, because an amount it cannot check is an amount it must not
   act on. That is the safe direction: an operator who paid and was not
   credited is a support conversation; a year granted for a shilling is
   a hole.
   ===================================================================== */

import type { FastifyInstance } from "fastify";
import { bandForFleet } from "../../../packages/shared/src/pricing";
import {
  CHARGE_CURRENCY,
  usdFor,
  usdToKesMinor,
  paidThroughAfter,
  parseReference,
} from "../../../packages/shared/src/billing";
import { prisma, appendAuditTx } from "./core";
import { paystackFromEnv, verifySignature, verifyTransaction } from "./billing.paystack";

/** How a payment is recorded in the audit chain — also the idempotence key. */
const PAYMENT_ENTITY = "Payment";
const PAYMENT_ACTION = "billing.payment.applied";

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  /* RATE LIMITED, AND THIS IS THE ROUTE WHERE IT MATTERS MOST. Every
     other write in this API sits behind `authenticate`; this one is
     open to the internet by necessity. Unthrottled it is an HMAC
     oracle — each call runs a SHA-512 over an attacker-sized body —
     and a way to make this deployment hammer Paystack's verify
     endpoint. Generous enough that a real retry storm from Paystack
     (which redelivers for days) is never throttled: their retries are
     minutes apart, not milliseconds. */
  const webhook = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

  app.post("/api/v1/billing/webhook", webhook, async (req, reply) => {
    const config = paystackFromEnv();
    if (!config) {
      /* 503 rather than 200: the deployment cannot take money yet, and
         Paystack should retry once the key is set rather than treat a
         real payment as delivered. */
      return reply.code(503).send({ error: "not_configured" });
    }

    /* THE RAW BYTES, not the parsed object — see billing.paystack.ts.
       server.ts keeps them on the request precisely for this. */
    const rawBody = (req as unknown as { rawBody?: string }).rawBody;
    if (typeof rawBody !== "string") {
      req.log.error("billing webhook: raw body missing — the content type parser is not keeping it");
      return reply.code(500).send({ error: "raw_body_unavailable" });
    }

    const signature = req.headers["x-paystack-signature"];
    if (!verifySignature(rawBody, typeof signature === "string" ? signature : undefined, config)) {
      /* Not logged with the body. An unsigned request is either a
         probe or a misconfiguration, and neither is worth storing
         attacker-controlled JSON for. */
      req.log.warn("billing webhook: signature rejected");
      return reply.code(401).send({ error: "bad_signature" });
    }

    let event: { event?: string; data?: { reference?: string } };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return reply.code(200).send({ received: true, applied: false, reason: "unparseable" });
    }

    if (event?.event !== "charge.success") {
      return reply.code(200).send({ received: true, applied: false, reason: "event_ignored" });
    }

    const reference = event.data?.reference ?? "";
    const parsed = parseReference(reference);
    if (!parsed) {
      /* A merchant account can carry charges this product did not
         mint. One it does not recognise routes nowhere rather than to
         a best guess. */
      return reply.code(200).send({ received: true, applied: false, reason: "not_our_reference" });
    }

    /* 2. PAYSTACK'S OWN ANSWER. The signature proves the message came
       from Paystack; it does not prove the payload is the whole truth
       about the transaction. Paystack's own guidance is to re-verify
       before granting value. */
    const verified = await verifyTransaction(reference, config);
    if (verified.status !== "CONFIRMED") {
      const retryable = verified.status === "FAILED";
      req.log.warn({ reference, status: verified.status }, "billing webhook: not confirmed");
      return reply
        .code(retryable ? 502 : 200)
        .send({ received: true, applied: false, reason: verified.status });
    }

    if (verified.currency !== CHARGE_CURRENCY) {
      req.log.warn({ reference, currency: verified.currency }, "billing webhook: unexpected currency");
      return reply.code(200).send({ received: true, applied: false, reason: "wrong_currency" });
    }

    const org = await prisma.org.findUnique({
      where: { id: parsed.orgId },
      select: { id: true, name: true, fleetSize: true, paidThrough: true },
    });
    if (!org) {
      return reply.code(200).send({ received: true, applied: false, reason: "unknown_org" });
    }

    /* 4. IDEMPOTENCE, checked before the amount so a retry is cheap and
       cannot be made to look like an underpayment. The audit chain is
       the record, so it is also the ledger this asks. */
    const already = await prisma.auditLog.findFirst({
      where: { orgId: org.id, entityType: PAYMENT_ENTITY, entityId: verified.reference },
      select: { id: true },
    });
    if (already) {
      return reply.code(200).send({ received: true, applied: false, reason: "already_applied" });
    }

    /* 3. AMOUNT. Fails closed when the rate is absent — see the header. */
    const rateRaw = process.env["BILLING_KES_PER_USD"];
    const rate = rateRaw ? Number(rateRaw) : Number.NaN;
    if (!Number.isFinite(rate) || rate <= 0) {
      req.log.error({ reference }, "billing webhook: BILLING_KES_PER_USD unset — payment NOT applied");
      return reply.code(200).send({ received: true, applied: false, reason: "rate_not_configured" });
    }

    const band = bandForFleet(org.fleetSize ?? 1);
    const expectedMinor = usdToKesMinor(usdFor(band, parsed.term), rate);
    if (verified.amountMinor < expectedMinor) {
      req.log.warn(
        { reference, paid: verified.amountMinor, expected: expectedMinor },
        "billing webhook: underpayment, entitlement NOT granted",
      );
      return reply.code(200).send({ received: true, applied: false, reason: "underpaid" });
    }

    const now = new Date();
    const next = paidThroughAfter(org.paidThrough, parsed.term, now);

    await prisma.$transaction(async (tx: any) => {
      await tx.org.update({ where: { id: org.id }, data: { paidThrough: next } });
      await appendAuditTx(tx, {
        orgId: org.id,
        /* NO userId. Nobody inside the operator did this, and
           attributing it to a person would put a payment in their
           name they did not make. */
        action: PAYMENT_ACTION,
        entityType: PAYMENT_ENTITY,
        entityId: verified.reference,
        /* BOTH SIDES, as the entitlement route does: "paid through
           December" says nothing about whether that was a renewal, a
           correction or a first payment. */
        detail: {
          term: parsed.term,
          amountMinor: verified.amountMinor,
          currency: verified.currency,
          expectedMinor,
          kesPerUsd: rate,
          paidAt: verified.paidAt,
          paidThroughBefore: org.paidThrough ? org.paidThrough.toISOString() : null,
          paidThroughAfter: next.toISOString(),
        },
      });
    });

    req.log.info({ reference, orgId: org.id, paidThrough: next.toISOString() }, "billing: entitlement granted");
    return reply.code(200).send({ received: true, applied: true, paidThrough: next.toISOString() });
  });
}
