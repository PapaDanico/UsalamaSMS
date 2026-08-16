/* =====================================================================
   WHAT IT COSTS, DECLARED ONCE.

   A price is a claim, and this repository already knows what happens to
   claims that live in prose: the coverage page overstated for half a
   day, the switches document had an expiring statement of its own, and
   four gates could not fail. A price quoted on a screen, a second time
   in a proposal and a third time in an email is three prices, and the
   operator will hold you to the lowest one.

   So the bands are here, the screen renders them, and a claims
   assertion fails the build when the two disagree.

   ---------------------------------------------------------------
   THE RULE THAT IS STRUCTURAL RATHER THAN REMEMBERED:

       THERE IS NO PER-SEAT PRICE, AND NO FIELD THAT COULD HOLD ONE.

   Every incumbent charges per user. SMS Pro is about $100 per user per
   month; a ten-person safety office runs $640 to $920 a month across
   Baldwin, Q-Pulse, SMS Pro and Centrik — eight to eleven thousand
   dollars a year.

   In a safety management system that is perverse, and not merely
   expensive. The whole measure of a functioning SMS is how many of an
   operator's people file reports: Annex 19 element 2.1 asks for hazards
   reaching the safety office "from the frontline, in useful numbers".
   Per-seat pricing bills the operator for exactly that. Small operators
   respond rationally — they buy three licences for the safety office
   and leave the line crew outside the system, which is the failure the
   element exists to prevent.

   A vendor whose revenue rises when reporting rises is aligned with the
   regulator. A vendor whose revenue rises when reporting rises is also
   the one an operator stops trusting the moment money is tight. So the
   band is the fleet, which the operator cannot quietly shrink to save
   money, and every band carries UNLIMITED reporters.

   `Band` therefore has no `perUser`, no `seats`, no `includedUsers`.
   The mistake cannot be expressed, which is the same discipline the
   handoff composers use for names and the tenant configuration uses for
   deadlines.
   ===================================================================== */

export interface Band {
  readonly id: "single" | "small" | "fleet";
  readonly name: string;
  /** The fleet size this band covers, as an operator would say it. */
  readonly fleet: string;
  /** United States dollars per MONTH, billed to the operator. */
  readonly usdMonthly: number;
  /** Who it is for, in one line an operator recognises themselves in. */
  readonly who: string;
  /** What is in it beyond everything — used where a band adds something. */
  readonly adds?: string;
  /**
   * PER ADDITIONAL AOC, per month, where a band admits more than one.
   *
   * THE ONE PLACE COMPLEXITY IS PRICED SEPARATELY FROM FLEET SIZE, and
   * it is here because fleet size stopped describing the customer.
   *
   * A second air operator certificate is not more aircraft. It is a
   * second set of reporting deadlines, a second accountable executive, a
   * second safety policy to sign and review, a second audit chain a
   * regulator can ask to verify, and a second maturity assessment that
   * has to stand on its own. Ten aircraft under one AOC and ten under
   * three are the same fleet and nothing like the same operation.
   *
   * It used to be free — the fleet band's `adds` line handed multiple
   * AOCs over at no charge, so the most complex customer in the segment
   * paid exactly what the simplest one at the same fleet size paid.
   *
   * NOT PER SEAT, and it cannot become one: an operator cannot quietly
   * drop an AOC to save money the way it can decline to license its line
   * crew. That is the same test every band on this page has to pass.
   */
  readonly perExtraAocUsdMonthly?: number;
}

/* Priced against what the segment can actually pay rather than against
   the incumbents' list prices. A six-aircraft Kenyan charter operator
   spending $11,000 a year on safety software is not a price objection,
   it is a different company. The top band still undercuts the cheapest
   incumbent's ten-seat price, and the bottom band is inside what an
   operator already spends on one manual revision.

   ---------------------------------------------------------------
   REVISED UPWARD 16 AUGUST 2026, from 49 / 149 / 399.

   The old numbers were set against a product that held reports and
   classified them. It now carries eleven of Annex 19's twelve elements
   — the hazard register, the risk picture, the CAPA loop, the SPI set
   regulation 9(5) requires, the emergency response directory, the
   maturity assessment, the de-identification pipeline and an audit
   chain a regulator can verify by content. The price did not move while
   all of that arrived, so it had drifted from describing the product
   into describing an early version of it.

   Checked against what the segment is quoted elsewhere, August 2026:
   Centrik about $920 a month for ten users, Q-Pulse about $720,
   Baldwin about $640. Those are TEN SEATS. Every band here is the whole
   operator with unlimited reporters, so the fleet band at $549 is still
   under the cheapest incumbent's ten-seat price — which is the claim
   the paragraph above makes and the one that has to stay true.

   The shape of the raise is deliberate: it steepens rather than
   shifting. Complexity does not scale with fleet size in a straight
   line, and the single-aircraft band is the one most likely to be an
   operator choosing between this and nothing at all. */
export const BANDS: ReadonlyArray<Band> = Object.freeze([
  Object.freeze({
    id: "single",
    name: "Single aircraft",
    fleet: "1 aircraft",
    usdMonthly: 79,
    who: "An owner-operator, a flight school with one type, a survey outfit.",
  }),
  Object.freeze({
    id: "small",
    name: "Small operator",
    fleet: "2 to 9 aircraft",
    usdMonthly: 239,
    who: "The charter, medevac and survey operators this product was built for.",
  }),
  Object.freeze({
    id: "fleet",
    name: "Fleet",
    fleet: "10 or more aircraft",
    usdMonthly: 549,
    who: "A scheduled operator, or a group holding several AOCs.",
    adds: "The export in a scheduled batch, and a second AOC priced rather than assumed.",
    perExtraAocUsdMonthly: 149,
  }),
]);

/**
 * What every band includes, without exception.
 *
 * READ BY THE SCREEN AND BY A TEST. The first entry is the commercial
 * position and the others are consequences of it — an operator that
 * cannot add its line crew for free will not add them at all, and a
 * product that meters reports is measuring the wrong thing on purpose.
 */
export const EVERY_BAND_INCLUDES: ReadonlyArray<string> = Object.freeze([
  "Unlimited people filing reports — always, on every band.",
  "Unlimited reports, hazards, risk assessments and corrective actions.",
  "Offline filing on any handset, with the report held until there is signal.",
  "The operator's own copy of its whole record, exportable at any time.",
  "Every Annex 19 element the product covers, with no element behind a tier.",
]);

/**
 * The band an operator falls in, from its fleet size.
 *
 * Boundaries stated as code rather than left to a sales conversation:
 * "2 to 9" and "10 or more" have to mean the same thing on the pricing
 * page, in an invoice and in a renewal, or the first disagreement is
 * with a customer.
 */
export function bandForFleet(aircraft: number): Band {
  if (!Number.isFinite(aircraft) || aircraft < 1) return BANDS[0]!;
  if (aircraft === 1) return BANDS[0]!;
  if (aircraft <= 9) return BANDS[1]!;
  return BANDS[2]!;
}

/** Annual cost, with the two months a yearly commitment saves. */
export function annualUsd(band: Band): number {
  return band.usdMonthly * 10;
}

/* =====================================================================
   WHAT IS NOT DECIDED HERE, said plainly so nobody assumes it is.

   THE CURRENCY IS USD AND THE MARKET IS KENYAN. An operator in Nairobi
   pays in shillings, most likely by M-Pesa, and neither the collection
   rail nor the FX exposure is chosen yet. Naming a shilling figure
   before that is decided would be inventing a price that changes with
   the rate — worse than quoting the dollar and converting on the day.

   THERE IS NO FREE TIER, and that is deliberate rather than pending.
   A free tier in a compliance product attracts operators who want the
   evidence without the practice, and the support cost lands on the
   segment least able to absorb it. A trial with an end date is the
   right shape and is a commercial decision, not a code one.

   NOTHING HERE TAKES MONEY. Collection needs a payment provider and
   credentials, which is the same class of blocker as the SMS sender ID:
   a person's job, and one that must not travel through a chat log.
   ===================================================================== */
export const PRICING_NOT_DECIDED: ReadonlyArray<string> = Object.freeze([
  "The collection rail — M-Pesa, card, or invoice — and therefore the shilling price.",
  "Whether a trial has an end date or a report limit. It will not have a report limit.",
  "Discounting for a group holding several AOCs beyond the fleet band.",
]);
