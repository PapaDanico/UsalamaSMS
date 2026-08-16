/* =====================================================================
   KENYA'S NATIONAL AVIATION SAFETY PLAN, as it bears on one operator.

   ---------------------------------------------------------------
   THIS ONE WAS READ.

   `CICTT_VERIFIED_AGAINST_PRIMARY` is false in cictt.ts, and the
   reason given there is that WebSearch returns a search index's
   rendering of a document rather than the document, and the egress
   policy blocks every primary regulatory host. That reasoning stands
   and that flag stays false.

   It does not apply here. The National Aviation Safety Plan was
   supplied as a file and read — 72 pages of it — so the constant below
   is true, and it is true for a different reason than optimism.

   THE DIFFERENCE IS NOT PEDANTRY. Before reading it, the working model
   assembled from search results was "Kenya adopts GASP's five
   high-risk categories". The plan says six, and the sixth is bird
   strikes, and the plan's own code for it is BWI rather than CICTT's
   BIRD. A migration was about to be written on the strength of the
   search-derived model that would have rewritten the only tagged
   report in production and walked the product off the vocabulary its
   regulator publishes. Reading the document is what stopped it.

   ---------------------------------------------------------------
   WHY AN OPERATOR CARES.

   An operator's safety performance indicators are its own to choose —
   nothing here is a requirement placed on them, and this module never
   makes one. But an operator that files an indicator the State is
   already counting can hand a regulator a number that lands in the
   same row as the national one, and one that invents its own measure
   cannot. These are offered as starting points for exactly that
   reason, and every one is quoted rather than paraphrased.
   ===================================================================== */

/** The document, named so a reader can go and check. */
export const NASP_SOURCE =
  "Kenya National Aviation Safety Plan 2023–2025, Kenya Civil Aviation Authority";

/**
 * TRUE, unlike its sibling in cictt.ts, and the argument is above.
 * If this is ever set by somebody who has not opened the document, the
 * constant has stopped meaning anything and so has the one it is
 * modelled on.
 */
export const NASP_VERIFIED_AGAINST_PRIMARY = true;

/** Section 5.0 of the plan, quoted. */
export const NASP_ASPIRATIONAL_GOAL = "Zero fatalities by 2030 and beyond";

export interface NationalIndicator {
  /** The plan's own wording, not a paraphrase of it. */
  readonly measure: string;
  /** What the plan counts it against, where it says. */
  readonly per: string;
  /** The HRC tag this bears on, where one applies. */
  readonly hrc?: string;
  /** Whether a small operator can produce this from its own record. */
  readonly reachable: boolean;
  /** Said plainly where it is not. */
  readonly why?: string;
}

/**
 * GOAL 1, TARGET 1.1 — "Maintain a decreasing trend of national
 * accident rate" — and the indicators the plan lists beneath it.
 *
 * `reachable` is this product's judgement, not the plan's. Several of
 * these need recorded flight data or an avionics download that an
 * operator flying under 5,700 kg does not have, and offering a safety
 * manager an indicator they cannot populate is how a screen full of
 * empty rows teaches somebody the tool is not for them. The ones
 * marked false are still listed, because knowing the State counts
 * something you cannot yet count is itself worth knowing.
 */
export const NASP_INDICATORS: ReadonlyArray<NationalIndicator> = Object.freeze([
  Object.freeze({
    measure: "Go around due to unstable approach",
    per: "100 movements",
    hrc: "RE",
    reachable: true,
  }),
  Object.freeze({
    measure: "Rejected take-off",
    per: "100 movements",
    hrc: "RE",
    reachable: true,
  }),
  Object.freeze({
    measure: "Runway incursion incidents",
    per: "year",
    hrc: "RI",
    reachable: true,
  }),
  Object.freeze({
    measure: "BWI incidents",
    per: "quarter, per aerodrome",
    hrc: "BWI",
    reachable: true,
  }),
  Object.freeze({
    measure: "Loss of Control–In Flight (LOC-I) accidents",
    per: "year",
    hrc: "LOC-I",
    reachable: true,
  }),
  Object.freeze({
    measure: "Pilot incapacitation incidents",
    per: "year",
    reachable: true,
  }),
  Object.freeze({
    measure: "TCAS/RA incidents",
    per: "year",
    hrc: "MAC",
    reachable: false,
    why: "Needs TCAS II, which is not fitted below 5,700 kg or 19 seats.",
  }),
  Object.freeze({
    measure: "EGPWS trigger reports",
    per: "year",
    hrc: "CFIT",
    reachable: false,
    why: "Needs a TAWS download. Fitted on many types; readable on fewer.",
  }),
  Object.freeze({
    measure: "Upset prevention and recovery training (UPRT)",
    per: "year",
    hrc: "LOC-I",
    reachable: true,
    why: "A training record rather than an occurrence count — read it from the matrix.",
  }),
]);

/** The ones an operator can actually populate from its own record. */
export const REACHABLE_NASP_INDICATORS = NASP_INDICATORS.filter((i) => i.reachable);

/**
 * The sentence a screen shows beside a national indicator.
 *
 * Held here rather than typed into the SPI toolkit so the caveat and
 * the list cannot drift: an operator has to know this is an offer and
 * not an obligation, or the product has quietly invented a rule the
 * State did not make.
 */
export const NASP_CAVEAT =
  "These are the indicators Kenya's National Aviation Safety Plan lists under its own " +
  "goal of a decreasing national accident rate. Your indicators are yours to choose — " +
  "none of these is required of an operator. Measuring what the State measures simply " +
  "means your number and the national one can be read side by side.";
