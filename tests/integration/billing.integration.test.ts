/* =====================================================================
   THE WEBHOOK, AGAINST A REAL DATABASE.

   tests/billing.test.ts pins the arithmetic and the signature in
   isolation. This asserts the thing that actually matters: that the
   four gates STOP AN ENTITLEMENT rather than merely returning a
   disapproving JSON body. A validator is perfect in a route that never
   calls it — this repository has that sentence twice already — so each
   case here reads `paidThrough` out of Postgres afterwards and fails
   if it moved.
   ===================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createHmac, randomUUID } from "node:crypto";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";
import { referenceFor, usdFor, usdToKesMinor } from "../../packages/shared/src/billing";
import { bandForFleet } from "../../packages/shared/src/pricing";

const SECRET = "sk_test_integration_key_0123456789";
const RATE = "129";

process.env["JWT_SECRET"] = "integration-test-secret-not-a-real-one";
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";
process.env["PAYSTACK_SECRET_KEY"] = SECRET;
process.env["BILLING_KES_PER_USD"] = RATE;

let app: FastifyInstance;

/** A charge.success body signed the way Paystack signs it. */
function delivery(reference: string) {
  const payload = JSON.stringify({ event: "charge.success", data: { reference } });
  return {
    payload,
    headers: {
      "content-type": "application/json",
      "x-paystack-signature": createHmac("sha512", SECRET).update(payload, "utf8").digest("hex"),
    },
  };
}

/** Paystack's verify endpoint, answering whatever the case needs. */
function paystackSays(amountMinor: number, status = "success", currency = "KES") {
  vi.stubGlobal("fetch", (async () =>
    new Response(
      JSON.stringify({ status: true, data: { status, reference: "echo", amount: amountMinor, currency } }),
      { status: 200 },
    )) as unknown as typeof fetch);
}

describe.skipIf(!hasDatabase)("the billing webhook", () => {
  let orgId: string;
  let expectedMinor: number;

  beforeAll(async () => {
    migrate();
    const { build } = await import("../../apps/api/src/server");
    app = await build();
    await app.ready();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app?.close();
    await disconnect();
  });

  beforeEach(async () => {
    await reset();
    const org = await prisma().org.create({
      data: {
        name: "Webhook Test Operator",
        jurisdiction: "KE",
        trialEndsOn: new Date("2026-01-01T00:00:00Z"), // long lapsed
        fleetSize: 3,
      },
      select: { id: true, fleetSize: true },
    });
    orgId = org.id;
    expectedMinor = usdToKesMinor(usdFor(bandForFleet(org.fleetSize ?? 1), "ANNUAL"), Number(RATE));
  });

  const paidThrough = async () =>
    (await prisma().org.findUnique({ where: { id: orgId }, select: { paidThrough: true } }))?.paidThrough ?? null;

  const post = (payload: string, headers: Record<string, string>) =>
    app.inject({ method: "POST", url: "/api/v1/billing/webhook", payload, headers });

  it("GRANTS on a signed, confirmed, sufficient payment", async () => {
    paystackSays(expectedMinor);
    const ref = referenceFor(orgId, "ANNUAL", randomUUID().replace(/-/g, ""));
    const d = delivery(ref);
    const res = await post(d.payload, d.headers);

    expect(res.statusCode).toBe(200);
    expect(res.json().applied).toBe(true);
    const after = await paidThrough();
    expect(after, "paidThrough did not move on a good payment").not.toBeNull();
    expect(after!.getTime()).toBeGreaterThan(Date.now());
  });

  it("REFUSES A BAD SIGNATURE, and nothing moves", async () => {
    paystackSays(expectedMinor);
    const ref = referenceFor(orgId, "ANNUAL", randomUUID().replace(/-/g, ""));
    const d = delivery(ref);
    const res = await post(d.payload, { ...d.headers, "x-paystack-signature": "0".repeat(128) });

    expect(res.statusCode).toBe(401);
    expect(await paidThrough(), "a forged signature granted entitlement").toBeNull();
  });

  it("REFUSES AN UNDERPAYMENT — one shilling must not buy a year", async () => {
    paystackSays(100); // one shilling
    const ref = referenceFor(orgId, "ANNUAL", randomUUID().replace(/-/g, ""));
    const d = delivery(ref);
    const res = await post(d.payload, d.headers);

    expect(res.statusCode).toBe(200);
    expect(res.json().reason).toBe("underpaid");
    expect(await paidThrough(), "an underpayment granted entitlement").toBeNull();
  });

  it("IS IDEMPOTENT — a retried delivery grants nothing further", async () => {
    /* Paystack retries for days. A rail that adds a year per delivery
       gives the product away to anybody patient enough to wait. */
    paystackSays(expectedMinor);
    const ref = referenceFor(orgId, "ANNUAL", randomUUID().replace(/-/g, ""));
    const d = delivery(ref);

    const first = await post(d.payload, d.headers);
    expect(first.json().applied).toBe(true);
    const afterFirst = await paidThrough();

    const second = await post(d.payload, d.headers);
    expect(second.statusCode).toBe(200);
    expect(second.json().reason).toBe("already_applied");
    expect((await paidThrough())!.getTime(), "a replay extended the subscription").toBe(afterFirst!.getTime());
  });

  it("does not treat an unsuccessful transaction as payment", async () => {
    paystackSays(expectedMinor, "abandoned");
    const ref = referenceFor(orgId, "ANNUAL", randomUUID().replace(/-/g, ""));
    const d = delivery(ref);
    const res = await post(d.payload, d.headers);

    expect(res.statusCode).toBe(200);
    expect(res.json().applied).toBe(false);
    /* THE REASON, NOT JUST THE OUTCOME. Asserting only `applied:false`
       let this test pass with the re-verify guard REMOVED: a NOT_PAID
       result carries no currency, so the currency check caught it and
       the outcome looked identical. The mutation matrix found that —
       the guard is pinned by naming which gate stopped it. */
    expect(res.json().reason).toBe("NOT_PAID");
    expect(await paidThrough()).toBeNull();
  });

  it("ignores a reference this product did not mint, without erroring", async () => {
    paystackSays(expectedMinor);
    const d = delivery("T1234567890");
    const res = await post(d.payload, d.headers);

    expect(res.statusCode, "a foreign reference must not make Paystack retry").toBe(200);
    expect(res.json().reason).toBe("not_our_reference");
    expect(await paidThrough()).toBeNull();
  });

  it("FAILS CLOSED when the FX rate is not configured", async () => {
    paystackSays(expectedMinor);
    const saved = process.env["BILLING_KES_PER_USD"];
    delete process.env["BILLING_KES_PER_USD"];
    try {
      const ref = referenceFor(orgId, "ANNUAL", randomUUID().replace(/-/g, ""));
      const d = delivery(ref);
      const res = await post(d.payload, d.headers);
      expect(res.json().reason).toBe("rate_not_configured");
      expect(await paidThrough(), "entitlement granted on an amount nothing could check").toBeNull();
    } finally {
      process.env["BILLING_KES_PER_USD"] = saved;
    }
  });

  it("writes the payment to the audit chain, both sides", async () => {
    paystackSays(expectedMinor);
    const ref = referenceFor(orgId, "ANNUAL", randomUUID().replace(/-/g, ""));
    const d = delivery(ref);
    await post(d.payload, d.headers);

    const row = await prisma().auditLog.findFirst({
      where: { orgId, entityType: "Payment" },
      select: { action: true, entityId: true, userId: true, detail: true },
    });
    expect(row).not.toBeNull();
    expect(row!.action).toBe("billing.payment.applied");
    /* NOBODY inside the operator did this. Attributing it to a person
       would put a payment in their name they did not make. */
    expect(row!.userId).toBeNull();
    const detail = row!.detail as Record<string, unknown>;
    expect(detail["paidThroughBefore"]).toBeNull();
    expect(detail["paidThroughAfter"]).toBeTruthy();
    expect(detail["amountMinor"]).toBe(expectedMinor);
  });
});
