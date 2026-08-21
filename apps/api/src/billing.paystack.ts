/* =====================================================================
   PAYSTACK, AND THE THREE THINGS THAT MAKE A WEBHOOK EVIDENCE.

   Paystack was chosen over Daraja directly for one measured reason: the
   M-Pesa API is mobile money ONLY — it cannot take a Visa or Mastercard
   — while Paystack covers M-Pesa and cards through one integration.
   An operator in Nairobi pays by phone; a regional customer pays by
   card; this product should not need two rails to accept both.

   -------------------------------------------------------------------
   A WEBHOOK IS AN UNAUTHENTICATED STRANGER UNTIL PROVED OTHERWISE.

   `POST /api/v1/billing/webhook` has no session, no bearer token and no
   tenancy. Anybody on the internet can send it JSON that says a year
   was paid for. Three checks stand between that and a granted
   entitlement, and this module owns the first two:

     · `verifySignature` — HMAC-SHA512 of the RAW body, keyed with the
       secret, compared in constant time;
     · `verifyTransaction` — ask Paystack directly what it thinks the
       transaction was, rather than believing the payload.

   THE SECOND IS NOT REDUNDANT. Paystack's own documentation says to
   re-verify before granting value, and the reason is that a signature
   proves the message came from Paystack — not that the payload in front
   of you is the whole truth about the transaction. Re-verifying costs
   one request and removes an entire class of replay and tampering
   argument.

   -------------------------------------------------------------------
   SHA-512, NOT SHA-256, AND THE RAW BODY, NOT THE PARSED ONE.

   Two mistakes are easy here and both fail closed only by luck:

     · Most providers sign with SHA-256. Paystack signs with SHA-512.
       A copied-in verifier from another integration produces a hash
       that never matches, which reads as "Paystack is broken".

     · The signature is over the BYTES Paystack sent. Re-serialising the
       parsed object — `JSON.stringify(req.body)` — is the most common
       Paystack integration bug in the wild: it works in testing and
       fails whenever key order, unicode escaping or number formatting
       differs from the original. `server.ts` therefore keeps the raw
       string on the request, and this function takes that string.

   -------------------------------------------------------------------
   NO CREDENTIAL LIVES HERE. `paystackFromEnv` reads one variable and
   returns null when it is absent, so an unconfigured deployment answers
   NOT_CONFIGURED rather than throwing — the same shape `mail.ts` uses,
   for the same reason: a missing credential is an expected condition in
   development and in CI, and only a transport failure is a fault.
   ===================================================================== */

import { createHmac, timingSafeEqual } from "node:crypto";

/** What the rail knows about itself. Null when no key is configured. */
export interface PaystackConfig {
  readonly secretKey: string;
}

/**
 * The outcome of asking Paystack what a transaction really was.
 *
 * A discriminated union rather than a throw, for the reason mail.ts
 * gives: NOT_CONFIGURED and FAILED are different facts, and a caller
 * that logs them can tell which one it is looking at.
 */
export type VerifyResult =
  /** Paystack confirms it, and these are its numbers rather than the payload's. */
  | {
      readonly status: "CONFIRMED";
      readonly reference: string;
      readonly amountMinor: number;
      readonly currency: string;
      readonly paidAt: string | null;
    }
  /** Paystack answered, and the transaction is not a completed payment. */
  | { readonly status: "NOT_PAID"; readonly reason: string }
  /** No PAYSTACK_SECRET_KEY. Expected in development and in CI. */
  | { readonly status: "NOT_CONFIGURED" }
  /** Paystack refused or could not be reached. This one is a problem. */
  | { readonly status: "FAILED"; readonly reason: string };

/** The secret key, or null when this deployment cannot take money. */
export function paystackFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PaystackConfig | null {
  const secretKey = env["PAYSTACK_SECRET_KEY"];
  if (!secretKey) return null;
  return { secretKey };
}

/**
 * Does this raw body carry a signature only the secret could produce?
 *
 * CONSTANT TIME, because a byte-by-byte comparison that returns early
 * leaks the correct prefix to anybody willing to send a few thousand
 * requests and time the answers. `timingSafeEqual` throws when the two
 * buffers differ in length, so the length is checked first and a
 * mismatch is a plain false rather than an exception — a wrong-length
 * signature is a wrong signature, not a server error.
 *
 * @param rawBody the exact bytes received, NOT a re-serialised object
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | undefined,
  config: PaystackConfig,
): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha512", config.secretKey).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Ask Paystack what the transaction actually was.
 *
 * `fetchImpl` is injected so a test can assert what goes on the wire
 * and drive every branch without a network or a credential — the same
 * arrangement `mail.ts` uses.
 */
export async function verifyTransaction(
  reference: string,
  config: PaystackConfig | null,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifyResult> {
  if (!config) return { status: "NOT_CONFIGURED" };
  if (!reference) return { status: "FAILED", reason: "no reference" };

  try {
    const response = await fetchImpl(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { method: "GET", headers: { Authorization: "Bearer " + config.secretKey } },
    );

    if (!response.ok) {
      return { status: "FAILED", reason: `provider responded ${response.status}` };
    }

    const body = (await response.json()) as {
      status?: boolean;
      data?: {
        status?: string;
        reference?: string;
        amount?: number;
        currency?: string;
        paid_at?: string | null;
      };
    };

    if (!body?.status || !body.data) {
      return { status: "FAILED", reason: "provider returned no transaction" };
    }

    const d = body.data;
    if (d.status !== "success") {
      return { status: "NOT_PAID", reason: `transaction status ${d.status ?? "unknown"}` };
    }
    if (typeof d.amount !== "number" || !Number.isFinite(d.amount)) {
      return { status: "FAILED", reason: "provider returned no amount" };
    }

    return {
      status: "CONFIRMED",
      /* PAYSTACK'S REFERENCE, not the one we asked about. They should
         agree; if a provider ever answered about a different one, the
         caller must apply the entitlement to what was actually paid or
         to nothing, never to what it hoped to see. */
      reference: d.reference ?? reference,
      amountMinor: d.amount,
      currency: (d.currency ?? "").toUpperCase(),
      paidAt: d.paid_at ?? null,
    };
  } catch (error) {
    return {
      status: "FAILED",
      reason: error instanceof Error ? error.message : "unknown transport error",
    };
  }
}
