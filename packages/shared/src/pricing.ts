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
  readonly id: "starter" | "single" | "small" | "fleet";
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
    id: "starter",
    name: "Starter",
    fleet: "1 or 2, RPAS or a single heliport",
    usdMonthly: 39,
    who:
      "A drone operator, a heliport, or a maintenance organisation serving one — " +
      "captured by Annex 19 Amendment 2 and building an SMS from nothing.",
    adds:
      "Every Annex 19 element, same as every other band. What is smaller is the " +
      "operation, not the obligation.",
  }),
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
/* WHAT KIND OF ORGANISATION THIS IS, which Amendment 2 made a pricing
   question for the first time.

   Until 26 November 2026 every customer of this product held an AOC,
   and fleet size described them completely. Amendment 2 extends the SMS
   obligation to certified RPAS operators in international operations,
   the maintenance organisations serving them, and certified heliports —
   organisations for which "how many aircraft" is either the wrong
   question or answers 2 and means something entirely different from a
   charter operator with two King Airs. */
export type OperatorKind = "AOC" | "RPAS" | "HELIPORT" | "MRO";

/** The kinds Amendment 2 newly captures, and which therefore start small. */
const NEWLY_CAPTURED: ReadonlySet<OperatorKind> = new Set<OperatorKind>([
  "RPAS", "HELIPORT", "MRO",
]);

export function bandForFleet(aircraft: number): Band {
  /* BANDS[0] IS NOW `starter`, SO THIS INDEXES BY ID RATHER THAN BY
     POSITION. It read BANDS[0] for "one aircraft" and would have
     silently started charging an owner-operator $39 instead of $79 the
     moment a cheaper band was inserted above it — the classic
     off-by-one that pays out in the wrong direction. */
  const byId = (id: Band["id"]) => BANDS.find((b) => b.id === id)!;
  if (!Number.isFinite(aircraft) || aircraft < 1) return byId("single");
  if (aircraft === 1) return byId("single");
  if (aircraft <= 9) return byId("small");
  return byId("fleet");
}

/**
 * The band for an organisation, given what kind it is and how big.
 *
 * AN AOC HOLDER NEVER LANDS ON STARTER, whatever its fleet size. A
 * single-aircraft charter operator carries the same regulatory weight
 * as a ten-aircraft one — scheduled or charter passenger operations,
 * an accountable executive, a post holder structure — and pricing it at
 * the drone rate would be underpricing the customer this product was
 * built for, not winning a new one.
 *
 * Equally, a large RPAS operation is not a Starter. The tier is for the
 * organisations Amendment 2 captured that are genuinely small; one
 * running twenty aircraft has an operation to match.
 */
export function bandFor(kind: OperatorKind, scale: number): Band {
  const byId = (id: Band["id"]) => BANDS.find((b) => b.id === id)!;
  if (NEWLY_CAPTURED.has(kind) && Number.isFinite(scale) && scale >= 0 && scale <= 2) {
    return byId("starter");
  }
  return bandForFleet(scale);
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
/**
 * WHAT AN OPERATOR IS PROMISED, on the screen where they decide.
 *
 * THIS USED TO BE A LIST OF WHAT WE HAD NOT WORKED OUT. Three bullets,
 * rendered to every visitor, itemising that the vendor had not chosen
 * how to take money, had not settled whether a trial ends, and had not
 * decided how to discount a group. Every word of it was true, and
 * putting it on the pricing page was a mistake: an operator comparing
 * this against Centrik does not read candour there, they read a company
 * that has not started. The honest internal position belongs in the
 * repository, not on the buying screen.
 *
 * EVERY LINE BELOW IS ENFORCED SOMEWHERE, and that is the rule for
 * adding one. This product's whole argument is that a claim on a screen
 * should be a claim a test can fail on — the coverage page names what
 * it does not do, the deadline table cites its instrument, and a
 * promise about billing is no different. Where the enforcement lives:
 *
 *   · unlimited reporters — `Band` has no seat field to hold a limit;
 *   · filing survives lapse — SURVIVES_LAPSE in subscription.ts, held
 *     by the compiler through Record<Capability, boolean>;
 *   · the record stays exportable — the same table, same enforcement;
 *   · no element behind a tier — EVERY_BAND_INCLUDES, above;
 *   · the trial length — TRIAL_DAYS, and tests/subscription.test.ts
 *     asserts the promise against the constant rather than against a
 *     number somebody retyped here. THIS LINE SAID "sixty days" for as
 *     long as TRIAL_DAYS said 30, which is the drift the sentence
 *     beneath it claims cannot happen — a comment is prose too.
 */
/* THE TRIAL LENGTH LIVES HERE, and subscription.ts re-exports it as
   TRIAL_DAYS rather than the other way round.

   subscription.ts already imports this module for `bandForFleet`, so
   declaring it there and importing it here would be a cycle. Putting
   it beside the sentence that SELLS it also means the promise and the
   number cannot drift: the string below is built from the constant,
   which is charter rule 10 applied to a sales claim rather than to a
   test count. */
export const TRIAL_DAYS = 30;

export const COMMITMENTS: ReadonlyArray<string> = Object.freeze([
  `${TRIAL_DAYS} days to try it, with no card and no limit on what you file — and ` +
    "extended on request if you are part way round your first hazard. Taking one all " +
    "the way round the loop is the only way to judge an SMS, and we would rather give " +
    "you the time than have you decide on half of it.",
  "Your people file for free, always. There is no seat to buy, so there is no version " +
    "of this where leaving the line crew out saves you money.",
  "If a subscription ever lapses, your people can still file and you can still export " +
    "your entire record. The safety office tools pause; the reporting never does.",
  "The record is yours on the way out as well as the way in — every report, hazard, " +
    "assessment and action, exportable at any time, in a format you can read without us.",
  "Every Annex 19 element this product covers is on every band. Nothing regulatory sits " +
    "behind a higher tier.",
]);

/**
 * STILL OPEN, and deliberately not rendered anywhere.
 *
 * The honesty this repository runs on is about not misleading a reader
 * — a regulator, an auditor, the next engineer. It was never a duty to
 * publish a roadmap to a prospect. These are commercial decisions with
 * a date on them, and they belong here where the next person to touch
 * pricing will find them.
 */
export const PRICING_STILL_OPEN: ReadonlyArray<string> = Object.freeze([
  "The collection rail, and therefore the shilling price. Nothing on the site takes " +
    "money yet; an operator starts a trial and is invoiced when the rail exists.",
]);
