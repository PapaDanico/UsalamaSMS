/* ============================================================
   THE COLLECTION RAIL, PINNED.

   Money is the one place in this product where a wrong number is not
   a rendering bug. Two properties carry the weight:

     · the AMOUNT is computed, not assembled inside a network call, so
       it can be pinned here rather than observed in production;
     · the SIGNATURE check is the only thing standing between an
       unauthenticated stranger and a granted entitlement.

   The signature tests include the two mistakes the module's header
   warns about — SHA-256 instead of SHA-512, and a re-serialised body
   instead of the raw one — because a verifier that accepts either is
   a verifier that accepts anything.
   ============================================================ */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  CHARGE_CURRENCY,
  MINOR_UNITS,
  usdFor,
  usdToKesMinor,
  daysFor,
  paidThroughAfter,
  referenceFor,
  parseReference,
} from "../packages/shared/src/billing";
import { BANDS, annualUsd } from "../packages/shared/src/pricing";
import {
  paystackFromEnv,
  verifySignature,
  verifyTransaction,
} from "../apps/api/src/billing.paystack";

const ORG = "3f2a1c4e-9b8d-4f7a-a1b2-c3d4e5f60718";
const NONCE = "a1b2c3d4e5";
const SECRET = "sk_test_not_a_real_key_0123456789";

describe("what a term costs", () => {
  it("prices a year at ten months, which is pricing.ts's discount not a new one", () => {
    for (const b of BANDS) {
      expect(usdFor(b, "ANNUAL")).toBe(annualUsd(b));
      expect(usdFor(b, "ANNUAL")).toBe(b.usdMonthly * 10);
      expect(usdFor(b, "MONTHLY")).toBe(b.usdMonthly);
    }
  });

  it("charges in the currency an operator actually holds", () => {
    expect(CHARGE_CURRENCY).toBe("KES");
    expect(MINOR_UNITS).toBe(100);
  });

  it("ROUNDS UP, so a charge is never a cent short of what is expected", () => {
    /* The direction is the decision. Rounding down produces a payment
       the amount check then refuses — money taken and no entitlement
       granted, the worst outcome available. */
    expect(usdToKesMinor(1, 129.005)).toBe(12901); // 12900.5 -> up
    expect(usdToKesMinor(390, 129)).toBe(390 * 129 * 100);
  });

  it("refuses a rate or an amount that is not a positive number", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => usdToKesMinor(bad, 129)).toThrow();
      expect(() => usdToKesMinor(390, bad)).toThrow();
    }
  });

  it("buys 365 days for a year and 31 for a month", () => {
    expect(daysFor("ANNUAL")).toBe(365);
    expect(daysFor("MONTHLY")).toBe(31);
  });
});

describe("where paidThrough lands", () => {
  const now = new Date("2026-08-21T00:00:00.000Z");

  it("EXTENDS an unexpired subscription rather than truncating it", () => {
    // Renewing early must not forfeit the remainder already bought.
    const future = new Date("2026-12-01T00:00:00.000Z");
    const after = paidThroughAfter(future, "ANNUAL", now);
    expect(after.getTime()).toBe(future.getTime() + 365 * 86_400_000);
  });

  it("runs from today when the old date has passed, because lapsed days are not owed", () => {
    const past = new Date("2026-01-01T00:00:00.000Z");
    expect(paidThroughAfter(past, "ANNUAL", now).getTime()).toBe(now.getTime() + 365 * 86_400_000);
    expect(paidThroughAfter(null, "ANNUAL", now).getTime()).toBe(now.getTime() + 365 * 86_400_000);
  });
});

describe("the reference a charge travels under", () => {
  it("round-trips the org and the term", () => {
    for (const term of ["ANNUAL", "MONTHLY"] as const) {
      const ref = referenceFor(ORG, term, NONCE);
      expect(parseReference(ref)).toEqual({ orgId: ORG, term });
    }
  });

  it("refuses a nonce too short to make two payments distinguishable", () => {
    expect(() => referenceFor(ORG, "ANNUAL", "short")).toThrow();
    expect(() => referenceFor("", "ANNUAL", NONCE)).toThrow();
  });

  it("does not recognise a reference that is not ours", () => {
    /* A webhook can arrive for anything in the merchant account. A
       reference this product did not mint must route nowhere rather
       than to a best guess. */
    for (const foreign of ["", "T123456789", "usms_annual_not-a-uuid_a1b2c3d4", `usms_weekly_${ORG}_${NONCE}`]) {
      expect(parseReference(foreign)).toBeNull();
    }
  });
});

describe("the signature, which is the whole of the trust", () => {
  const config = { secretKey: SECRET };
  const body = JSON.stringify({ event: "charge.success", data: { reference: "r" } });
  const good = createHmac("sha512", SECRET).update(body, "utf8").digest("hex");

  it("accepts a signature the secret could have produced", () => {
    expect(verifySignature(body, good, config)).toBe(true);
  });

  it("REFUSES SHA-256, the algorithm most other providers use", () => {
    /* Named because it is the likeliest way this gets broken: a
       verifier copied from a Stripe integration hashes with 256 and
       never matches, which reads as "Paystack is broken". */
    const sha256 = createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
    expect(verifySignature(body, sha256, config)).toBe(false);
  });

  it("REFUSES A RE-SERIALISED BODY, the commonest Paystack bug in the wild", () => {
    /* The signature is over the bytes Paystack sent. Re-stringifying
       the parsed object changes key order or escaping and the hash
       stops matching — it passes in testing and fails in production. */
    const reserialised = JSON.stringify(JSON.parse(body), ["data", "event"]);
    expect(reserialised).not.toBe(body);
    expect(verifySignature(reserialised, good, config)).toBe(false);
  });

  it("refuses a missing, empty, wrong or wrong-length signature without throwing", () => {
    expect(verifySignature(body, undefined, config)).toBe(false);
    expect(verifySignature(body, "", config)).toBe(false);
    expect(verifySignature(body, "0".repeat(good.length), config)).toBe(false);
    // Different length: timingSafeEqual throws on this, so it is guarded.
    expect(() => verifySignature(body, "abc", config)).not.toThrow();
    expect(verifySignature(body, "abc", config)).toBe(false);
  });

  it("refuses a signature made with a different secret", () => {
    const other = createHmac("sha512", "sk_test_someone_elses_key").update(body, "utf8").digest("hex");
    expect(verifySignature(body, other, config)).toBe(false);
  });

  it("refuses when the body has been altered by a single character", () => {
    expect(verifySignature(body.replace('"r"', '"s"'), good, config)).toBe(false);
  });
});

describe("asking Paystack what the transaction really was", () => {
  const config = { secretKey: SECRET };
  const ok = (data: unknown) =>
    (async () => new Response(JSON.stringify({ status: true, data }), { status: 200 })) as unknown as typeof fetch;

  it("answers NOT_CONFIGURED without a key, rather than throwing", async () => {
    expect((await verifyTransaction("r", null)).status).toBe("NOT_CONFIGURED");
    expect(paystackFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(paystackFromEnv({ PAYSTACK_SECRET_KEY: SECRET } as NodeJS.ProcessEnv)).toEqual({ secretKey: SECRET });
  });

  it("returns PAYSTACK'S numbers, not the caller's hopes", async () => {
    const r = await verifyTransaction(
      "usms_annual_x",
      config,
      ok({ status: "success", reference: "usms_annual_x", amount: 5_031_000, currency: "kes", paid_at: "2026-08-21T00:00:00Z" }),
    );
    expect(r).toEqual({
      status: "CONFIRMED",
      reference: "usms_annual_x",
      amountMinor: 5_031_000,
      currency: "KES",
      paidAt: "2026-08-21T00:00:00Z",
    });
  });

  it("does not treat an abandoned or failed transaction as payment", async () => {
    for (const status of ["abandoned", "failed", "reversed", undefined]) {
      const r = await verifyTransaction("r", config, ok({ status, amount: 1000 }));
      expect(r.status).toBe("NOT_PAID");
    }
  });

  it("reports a refusal, a bad shape and a transport failure as FAILED", async () => {
    const refused = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    expect((await verifyTransaction("r", config, refused)).status).toBe("FAILED");

    const empty = (async () => new Response(JSON.stringify({ status: false }), { status: 200 })) as unknown as typeof fetch;
    expect((await verifyTransaction("r", config, empty)).status).toBe("FAILED");

    const noAmount = await verifyTransaction("r", config, ok({ status: "success", currency: "KES" }));
    expect(noAmount.status).toBe("FAILED");

    const threw = (async () => { throw new Error("socket hang up"); }) as unknown as typeof fetch;
    const t = await verifyTransaction("r", config, threw);
    expect(t.status).toBe("FAILED");
    expect(t.status === "FAILED" && t.reason).toContain("socket hang up");
  });

  it("sends the key as a bearer token and asks about the right reference", async () => {
    let seenUrl = "", seenAuth = "";
    const spy = (async (url: string, init: RequestInit) => {
      seenUrl = String(url);
      seenAuth = String((init.headers as Record<string, string>)["Authorization"]);
      return new Response(JSON.stringify({ status: true, data: { status: "success", amount: 1, currency: "KES" } }), { status: 200 });
    }) as unknown as typeof fetch;
    await verifyTransaction("usms_annual_a b", config, spy);
    expect(seenUrl).toBe("https://api.paystack.co/transaction/verify/usms_annual_a%20b");
    expect(seenAuth).toBe("Bearer " + SECRET);
  });
});
