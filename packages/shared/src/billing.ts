/* =====================================================================
   THE COLLECTION RAIL, AND WHY IT IS SHAPED THIS WAY.

   `pricing.ts` decided the money and said plainly what it did not
   decide: "NOTHING HERE TAKES MONEY. Collection needs a payment
   provider and credentials." This module is the half of that which is
   not a credential — the arithmetic, the terms, and the rules a rail
   has to satisfy before a day of entitlement is granted.

   IT HOLDS NO SECRET AND MAKES NO REQUEST. Everything here is pure, so
   the amount an operator is charged is a value a test can pin rather
   than a number assembled inside a network call.

   -------------------------------------------------------------------
   ANNUAL IS THE DEFAULT, AND THAT IS A KENYAN CONSTRAINT RATHER THAN A
   DISCOUNT PREFERENCE.

   M-Pesa has no direct-debit equivalent. A card can be tokenised and
   charged again; an M-Pesa customer must approve every single charge
   through an STK push on their handset. Monthly billing against that
   rail is not twelve payments, it is twelve chances to forget, twelve
   support conversations, and twelve moments where a safety record
   lapses because somebody was in the air when the prompt arrived.

   Annual billing turns that into one. `pricing.ts` already prices a
   year at ten months — the discount was there before this module, and
   it is the right discount for the wrong-looking reason: it is not
   generosity, it is the difference between one authorisation and
   twelve.

   MONTHLY IS STILL OFFERED, because an operator who cannot commit a
   year up front is exactly the operator this product exists for. It is
   simply not the default, and a card is the better rail for it.

   -------------------------------------------------------------------
   THE THREE THINGS A RAIL MUST PROVE BEFORE ENTITLEMENT MOVES.

   A webhook that says "paid" is an assertion by an unauthenticated
   stranger until all three hold. Each is enforced in
   `routes.billing.ts`, and each has a test that removes it:

     1. AUTHENTICITY — the request carries a signature this vendor's
        secret could have produced, compared in constant time.
     2. AMOUNT — the minor units received are at least what the band
        and term cost. Without this, one shilling buys a year.
     3. IDEMPOTENCE — a reference already applied grants nothing more.
        Providers retry; Paystack retries for days. A rail that adds a
        year per delivery is a rail that gives the product away to
        anybody patient enough to let it retry.
   ===================================================================== */

import { annualUsd, type Band } from "./pricing";

/** How a subscription is billed. Annual is the default — see above. */
export type BillingTerm = "ANNUAL" | "MONTHLY";

/**
 * The currency an operator is actually charged in.
 *
 * `pricing.ts` quotes USD and explains why: the shilling figure moves
 * with the rate, and quoting one before a rail existed would have been
 * inventing a price. The rail exists now, so the charge is raised in
 * KES — the currency an operator in Nairobi holds — and the USD figure
 * on the pricing screen remains the quote it always was.
 *
 * THE RATE IS NOT HARDCODED HERE, and that is deliberate. A constant in
 * a source file is a rate that is wrong the day after it is written.
 * `usdToKesMinor` takes the rate as an argument so the caller has to
 * have got it from somewhere it can name.
 */
export const CHARGE_CURRENCY = "KES" as const;

/**
 * Minor units per major unit. KES subdivides into 100 cents, and
 * Paystack — like most rails — moves integers to avoid float money.
 */
export const MINOR_UNITS = 100;

/** What a term costs in USD, before conversion. */
export function usdFor(band: Band, term: BillingTerm): number {
  return term === "ANNUAL" ? annualUsd(band) : band.usdMonthly;
}

/**
 * USD to KES minor units, at a rate the caller supplies.
 *
 * ROUNDS UP, and the direction is the decision. Rounding down means a
 * charge that is a cent short of the expected amount, which the amount
 * check in `routes.billing.ts` would then refuse — a payment taken from
 * an operator and no entitlement granted, which is the worst outcome
 * available. Up by at most one cent costs nobody anything.
 */
export function usdToKesMinor(usd: number, kesPerUsd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("usd must be a positive number");
  if (!Number.isFinite(kesPerUsd) || kesPerUsd <= 0) throw new Error("kesPerUsd must be a positive number");
  return Math.ceil(usd * kesPerUsd * MINOR_UNITS);
}

/** Days of entitlement a term buys. */
export function daysFor(term: BillingTerm): number {
  return term === "ANNUAL" ? 365 : 31;
}

/**
 * Where `paidThrough` lands when a payment for `term` is applied.
 *
 * EXTENDS FROM THE EXISTING DATE WHEN IT IS STILL IN THE FUTURE, so an
 * operator who renews early is not punished for it by losing the
 * remainder they already bought. From today when it has passed, because
 * days spent lapsed are not days owed.
 */
export function paidThroughAfter(
  current: Date | null | undefined,
  term: BillingTerm,
  now: Date,
): Date {
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + daysFor(term) * 24 * 60 * 60 * 1000);
}

/**
 * The reference a charge travels under.
 *
 * CARRIES THE ORG AND THE TERM, because a webhook arrives with nothing
 * else this product recognises. It is not a secret and must not be
 * treated as one — anybody can construct a well-formed reference. It is
 * a routing label; the signature is what makes the message trustworthy.
 *
 * The random tail exists so a second payment for the same org and term
 * is a different reference, which is what makes the idempotence check
 * mean "this payment" rather than "any payment like it".
 */
export function referenceFor(orgId: string, term: BillingTerm, nonce: string): string {
  if (!orgId) throw new Error("orgId is required");
  if (!/^[A-Za-z0-9]{8,}$/.test(nonce)) throw new Error("nonce must be at least 8 alphanumerics");
  return `usms_${term.toLowerCase()}_${orgId}_${nonce}`;
}

/** The org and term a reference was minted for, or null if it is not ours. */
export function parseReference(
  reference: string,
): { orgId: string; term: BillingTerm } | null {
  const m = /^usms_(annual|monthly)_([0-9a-fA-F-]{36})_[A-Za-z0-9]{8,}$/.exec(reference ?? "");
  if (!m) return null;
  return { orgId: m[2]!, term: m[1]!.toUpperCase() as BillingTerm };
}
