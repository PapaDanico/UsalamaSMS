/* =====================================================================
   WHO IS SENIOR ENOUGH TO OWN THIS RISK.

   Taken from the UK Military Aviation Authority's RA 1210, "Ownership
   and Management of Operating Risk (Risk to Life)", which does
   something Doc 9859 does not: it makes the LEVEL OF AUTHORITY REQUIRED
   TO HOLD A RISK a function of how bad the risk is.

     High and Medium risks are managed by the Operating Duty Holder.
     Low risks are managed by the Delivery Duty Holder.

   Duty Holders assure themselves the risk is ALARP AND the exposure is
   Tolerable — both, not either — and RA 1210 requires the ownership and
   the referral protocol to be written into the Air Safety Management
   System rather than left to custom.

   WHY THIS IS WORTH BORROWING. Doc 9859 tells an operator what a risk
   IS. It is close to silent on who may carry it. In a three-aircraft
   operator that silence resolves the wrong way by default: whoever
   assessed the hazard writes their own name in the owner box, and an
   amber risk ends up owned by the person least able to spend money on
   it. The register then reads as managed and is not.

   WHAT THIS MODULE DOES AND DOES NOT DO. It computes the MINIMUM post
   for a band and reports whether a proposed owner clears it. It does
   not silently reassign, and it does not refuse — see the note on
   `meetsRequirement` for why that judgement sits with the caller.

   THE MAPPING IS OURS AND IS LABELLED AS SUCH. RA 1210 governs UK
   military aviation and its Duty Holder construct has no equivalent in
   Kenyan civil law. What transfers is the PRINCIPLE — authority scales
   with exposure — not the job titles. Presenting ODH and DDH to a
   Kenyan AOC would be inventing an authority, the same fault the
   maturity descriptors are labelled against.
   ===================================================================== */

import type { Tolerability } from "./risk";

/**
 * The post codes this product already uses, in ascending authority.
 *
 * Ordered, because the whole question is "is this post senior enough",
 * and an unordered set can only answer "is it this exact post" — which
 * would reject an accountable executive owning a low risk, and that is
 * not an escalation rule, it is a straitjacket.
 */
export const AUTHORITY_ORDER = [
  "SAFETY_OFFICER",
  "SAFETY_MANAGER",
  "ACCOUNTABLE_EXECUTIVE",
] as const;

export type AuthorityPost = (typeof AUTHORITY_ORDER)[number];

export interface HolderRequirement {
  /** The lowest post that may own a risk in this band. */
  readonly minimum: AuthorityPost;
  /** Why, in the words an operator would use in their own manual. */
  readonly because: string;
}

/**
 * The rule, stated once.
 *
 * INTOLERABLE has a minimum for completeness and it is close to
 * meaningless on its own: an intolerable risk is not ownable, it is
 * refusable, and both the SRA screen and the change route refuse
 * acceptance outright while one stands. The entry exists so a caller
 * asking about a red risk gets an answer rather than undefined — and
 * the answer is the most senior post there is, which is the honest
 * reading of "nobody junior may carry this".
 */
const REQUIREMENT: Readonly<Record<Tolerability, HolderRequirement>> = Object.freeze({
  INTOLERABLE: {
    minimum: "ACCOUNTABLE_EXECUTIVE",
    because:
      "An intolerable risk is not acceptable at any level of benefit. It is not owned " +
      "down the organisation — it is carried by the accountable executive until the " +
      "controls change, or it is not carried at all.",
  },
  TOLERABLE: {
    minimum: "ACCOUNTABLE_EXECUTIVE",
    because:
      "A tolerable risk is one being accepted because reducing it further is not " +
      "reasonably practicable. That is a judgement about cost against safety, so it " +
      "belongs with the post that can actually spend the money.",
  },
  ACCEPTABLE: {
    minimum: "SAFETY_MANAGER",
    because:
      "An acceptable risk is managed rather than accepted upward. The safety manager " +
      "owns it, reviews it, and escalates if the position changes.",
  },
});

/** The minimum post that may own a risk in this band. */
export function requiredHolder(band: Tolerability): HolderRequirement {
  return REQUIREMENT[band];
}

/**
 * Whether a proposed owner is senior enough.
 *
 * REPORTS RATHER THAN REFUSES, and that is deliberate. The owner field
 * on the register is a post code with a free-text escape, because a
 * small operator's real titles are not this product's enum — "the
 * Director" may genuinely be the accountable executive. Refusing an
 * unrecognised string would make the product argue with an operator
 * about its own org chart and push the answer into a name box, which
 * is how a register stops recording who owns anything.
 *
 * So: an unrecognised post returns `unknown`, and the caller decides.
 * The screen states the requirement beside the field; the CHANGE route,
 * where approval is a real permission and not free text, enforces it.
 */
export function meetsRequirement(
  band: Tolerability,
  post: string | undefined | null,
): "meets" | "below" | "unknown" {
  const need = AUTHORITY_ORDER.indexOf(requiredHolder(band).minimum);
  const have = AUTHORITY_ORDER.indexOf((post ?? "") as AuthorityPost);
  if (have < 0) return "unknown";
  return have >= need ? "meets" : "below";
}
