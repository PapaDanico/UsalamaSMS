/* =====================================================================
   WHO MAY PUT THEIR NAME TO A RISK.

   The enforced half of the RA 1210 escalation. Its sibling, holder.ts,
   computes the minimum post for a band and REPORTS whether a proposed
   owner clears it; this decides whether a signature is allowed and
   REFUSES it when it is not.

   ---------------------------------------------------------------
   WHY IT IS A SEPARATE FILE, which is a bundle argument and a design
   argument that happen to agree.

   The bundle argument came first and was measured. This module freezes
   a record at module scope — a side-effectful expression Rollup cannot
   tree-shake — so every chunk importing it carries the whole authority
   ladder. Two web chunks import holder.ts (the register and the risk
   picture) and neither needs any of this: the total budget went 1.9 KB
   over the moment it lived there, for code that runs on the server.

   The design argument is the better one. THE BROWSER MUST NOT DECIDE
   WHO MAY SIGN. A screen that hides the button from somebody it
   believes cannot sign teaches them nothing when it is wrong, and a
   screen that shows it to somebody who cannot is a refusal they only
   discover after pressing. Both are worse than sending the act and
   showing the server's answer, which names the post that has to sign
   instead. So the client asks and the server rules — and the ladder
   never reaches a device where it could be edited or believed.

   The two places a risk is signed for both call this: the register's
   acceptance route and the change assessment's approval route.
   ===================================================================== */

import type { Tolerability } from "./risk";
import { AUTHORITY_ORDER, requiredHolder, type AuthorityPost } from "./holder";

/**
 * What each role counts as when it signs.
 *
 * `null` means the role has no standing to hold a risk — not "junior",
 * but outside the question entirely. A regulator inspector reads an
 * operator's register; they do not own its risks. A system
 * administrator manages accounts. Neither is a level of safety
 * authority, and mapping them onto the bottom of the ladder would let
 * account administration accept an amber risk.
 */
const ROLE_AUTHORITY: Readonly<Record<string, AuthorityPost | null>> = Object.freeze({
  FRONTLINE: null,
  SAFETY_OFFICER: "SAFETY_OFFICER",
  INVESTIGATOR: "SAFETY_OFFICER",
  SAFETY_MANAGER: "SAFETY_MANAGER",
  /* The heads of department. Senior to the safety manager in an
     operator's structure — they hold the budget and the schedule for
     their own department — and below the accountable executive, who is
     the one post that answers for the whole operation. RA 1210's shape
     exactly: the Operating Duty Holder is not the Senior one. */
  KEY_MANAGEMENT: "SAFETY_MANAGER",
  ACCOUNTABLE_EXECUTIVE: "ACCOUNTABLE_EXECUTIVE",
  REGULATOR_INSPECTOR: null,
  SYSTEM_ADMIN: null,
});

/** What a role counts as when it signs, or null if it has no standing. */
export function authorityOf(role: string | undefined | null): AuthorityPost | null {
  return ROLE_AUTHORITY[role ?? ""] ?? null;
}

export interface SignatureRefusal {
  /** Machine-readable, for the route. */
  readonly error: "below_authority" | "not_ownable";
  /** The post that must sign instead. */
  readonly requires: AuthorityPost;
  /** What the person is told, in the words of the rule rather than of the code. */
  readonly message: string;
}

/**
 * May this role put its name to a risk in this band?
 *
 * Returns `null` when it may, and a refusal when it may not — the shape
 * every other refusal in this product uses, so a route states the
 * server's own sentence rather than inventing one.
 *
 * INTOLERABLE IS NOT A SENIORITY QUESTION. Doc 9859's red band is not
 * "acceptable with a sufficiently important signature"; it is not
 * acceptable at any level of benefit. Escalating it to the accountable
 * executive would turn a refusal into a queue. So red refuses everybody,
 * including the accountable executive, and says why — the controls have
 * to change, not the signature.
 */
export function refuseSignature(
  band: Tolerability,
  role: string | undefined | null,
): SignatureRefusal | null {
  const need = requiredHolder(band);

  if (band === "INTOLERABLE") {
    return {
      error: "not_ownable",
      requires: need.minimum,
      message:
        "This risk is intolerable as it stands. It cannot be accepted by anybody, at " +
        "any level — the controls have to change, not the signature.",
    };
  }

  const have = authorityOf(role);
  if (have === null || AUTHORITY_ORDER.indexOf(have) < AUTHORITY_ORDER.indexOf(need.minimum)) {
    return {
      error: "below_authority",
      requires: need.minimum,
      message: `${need.because} Somebody holding ${labelFor(need.minimum)} has to sign this one.`,
    };
  }
  return null;
}

/** The post in the words an operator uses, for a sentence rather than a log line. */
export function labelFor(post: AuthorityPost): string {
  return {
    SAFETY_OFFICER: "Safety Officer",
    SAFETY_MANAGER: "Safety Manager",
    ACCOUNTABLE_EXECUTIVE: "Accountable Executive",
  }[post];
}

/**
 * Every role that can sign for at least one band.
 *
 * READ BY A GATE, not by a screen. A permission granted to a role that
 * this rule then refuses on every band is a grant that cannot be
 * exercised — the matrix would be promising something the product
 * refuses, which is the same defect as a route with no screen, pointing
 * the other way.
 */
export function bandsSignableBy(role: string): ReadonlyArray<Tolerability> {
  return (["ACCEPTABLE", "TOLERABLE", "INTOLERABLE"] as const).filter(
    (band) => refuseSignature(band, role) === null,
  );
}
