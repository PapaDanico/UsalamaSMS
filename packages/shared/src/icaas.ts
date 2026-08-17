/* =====================================================================
   THE HANDOFF TO KCAA'S ICAAS PORTAL.

   WHAT ICAAS IS. The Authority's external portal at
   ecitizen.kcaa.or.ke, through which an operator initiates
   applications, uploads documents, pays invoices — and, the part that
   matters here, answers Corrective Action Requests.

   THE LOOP THE AUTHORITY RUNS, from the portal's own user manual: the
   Authority raises a CAR against the operator; the operator creates
   and submits a CAP; an inspector comments and either approves it or
   does not; and once approved the operator uploads IMPLEMENTATION
   EVIDENCE against it.

   THIS PRODUCT ALREADY HOLDS EVERY ONE OF THOSE OBJECTS. An audit
   finding is the CAR. A corrective action is the CAP. Attachments on
   the report are the implementation evidence. What has been missing is
   the last mile — an operator retyping, at the portal, what is already
   written down here.

   ---------------------------------------------------------------
   WHAT THIS IS NOT, AND THE PRODUCT MUST NEVER SAY OTHERWISE.

   THERE IS NO API. The manual describes a web portal a person signs
   into and uploads files through. No published endpoint, no
   credential exchange, no submission receipt.

   So this composes a PACK and hands over a LINK. It does not submit,
   it does not claim to have submitted, and `SUBMITS_TO_AUTHORITY` is
   false so no screen can drift into saying it does. An operator who
   believed a corrective action had reached the Authority because this
   product said "sent" — and then met an inspector who had never seen
   it — would be worse off than one who had never used this at all.

   That distinction is the whole design. The value is that everything
   is assembled, in the Authority's own order, with nothing to retype;
   the operator still signs in and uploads it, and knows they did.

   ---------------------------------------------------------------
   PROVENANCE. Read from the ICAAS External Portal User Manual (Kenya
   Civil Aviation Authority, 2023), 43 pages, supplied by the operator
   of this product. The portal's behaviour can change without the
   manual changing, so nothing here is a deadline and nothing here is
   asserted about what the Authority will accept — only about what this
   product hands over.
   ===================================================================== */

/** This product does not submit to the Authority. It never has. */
export const SUBMITS_TO_AUTHORITY = false;

export const ICAAS_PORTAL = "https://ecitizen.kcaa.or.ke";

export const ICAAS_SOURCE =
  "ICAAS External Portal User Manual, Kenya Civil Aviation Authority (2023). " +
  "The portal is a web application with no published API — this product prepares " +
  "the pack and links to it, and does not submit on the operator's behalf.";

/* The steps the manual describes, so the screen can tell an operator
   what they are about to do rather than only where to click. Written
   as the operator's actions, because every one of them is. */
export const CAP_STEPS: readonly string[] = Object.freeze([
  "Sign in at the portal as the organisation, or as a Representative authorised to transact for it.",
  "Open the operator's CARs and find the one this corrective action answers.",
  "Create or amend the CAP, pasting the action, the owner and the target date below.",
  "Submit it, and wait for the inspector's comments and approval status.",
  "Once the CAP is approved, upload the implementation evidence against it.",
]);

/** What an operator needs before any of the above will work. */
export const PREREQUISITES: readonly string[] = Object.freeze([
  "A KCAA customer account with a valid email address.",
  "A self-service transactional account, activated from the emailed link.",
  "Internal approval of the account, which the manual puts at up to one hour on a working day.",
]);

/** One corrective action, shaped for the portal's CAP form. */
export interface CapPack {
  readonly reference: string;
  /** What the Authority found, where this product holds it. */
  readonly finding: string | null;
  /** The corrective action itself — what the CAP field wants. */
  readonly action: string;
  /** The post accountable for it. Not a person: posts survive people. */
  readonly ownerPost: string;
  readonly targetDate: string | null;
  readonly completedOn: string | null;
  readonly verifiedOn: string | null;
  /** Files held here that would serve as implementation evidence. */
  readonly evidence: readonly { readonly label: string; readonly sha256: string }[];
  /**
   * WHAT IS NOT READY, named rather than left for the operator to
   * discover at the portal. A CAP submitted without a target date is
   * one an inspector sends back.
   */
  readonly missing: readonly string[];
  /** True only when nothing is missing. */
  readonly readyToSubmit: boolean;
}

interface ActionLike {
  id?: string;
  action?: string;
  ownerPost?: string;
  dueOn?: string | Date | null;
  completedOn?: string | Date | null;
  verifiedOn?: string | Date | null;
  cancelledOn?: string | Date | null;
  finding?: { finding?: string; auditRef?: string } | null;
  /**
   * THE CALLER MAY NOT READ THE LINKED FINDING — which is a different
   * fact from there not being one, and conflating them would put a
   * false sentence in front of an operator.
   *
   * An audit finding is gated on `audit.read`, and a SAFETY_OFFICER
   * does not hold it. Passing `finding: null` for that case makes this
   * function say "No audit finding is linked. The portal raises a CAP
   * against a CAR, so you will need to pick the matching one
   * yourself." Every clause of that is wrong when a finding IS linked:
   * the operator goes to the portal hunting for a CAR that this
   * product could have named, or raises the CAP against the wrong one.
   *
   * So the route sets this instead, and the pack says the reference is
   * withheld and who can supply it. Absent and forbidden are not the
   * same answer anywhere else in this product either.
   */
  findingWithheld?: boolean;
  attachments?: readonly { label?: string; sha256?: string }[];
}

const iso = (v: string | Date | null | undefined): string | null =>
  v == null ? null : (v instanceof Date ? v.toISOString() : String(v));

/**
 * Compose the pack for one corrective action.
 *
 * PURE, AND HONEST ABOUT GAPS. The temptation in a handoff is to fill
 * blanks with something plausible so the pack looks complete — a
 * target date of "30 days from now", an owner of "Safety Manager". An
 * operator would carry that invention to the Authority under their own
 * signature. Every absent field is NAMED instead.
 */
export function composeCap(a: ActionLike): CapPack {
  const missing: string[] = [];

  const action = (a.action ?? "").trim();
  if (!action) missing.push("The corrective action itself is empty.");

  const ownerPost = (a.ownerPost ?? "").trim();
  if (!ownerPost) missing.push("No post is accountable for it — a CAP with no owner is sent back.");

  const targetDate = iso(a.dueOn);
  if (!targetDate) {
    missing.push("No target date. The portal's CAP form expects one, and an inspector will ask.");
  }

  /* A cancelled action is not a CAP. Submitting one would tell the
     Authority the operator is acting on something they have stopped. */
  if (a.cancelledOn) {
    missing.push("This action was cancelled. It is not an answer to a CAR.");
  }

  const finding = a.finding?.finding?.trim() || null;
  if (a.findingWithheld) {
    /* There IS one, and this reader cannot see it. Saying so — and
       saying who can — is the difference between an operator asking a
       colleague for one reference and an operator guessing at the
       portal. */
    missing.push(
      "An audit finding is linked to this action and your role cannot read it. Ask the " +
        "safety manager or an auditor for the CAR reference before you raise the CAP.",
    );
  } else if (!finding) {
    /* Not fatal — an operator may raise a corrective action from their
       own hazard rather than from a CAR — but the portal's CAP is
       raised AGAINST a CAR, so this is worth saying. */
    missing.push(
      "No audit finding is linked. The portal raises a CAP against a CAR, so you will " +
        "need to pick the matching one yourself.",
    );
  }

  const evidence = Object.freeze(
    (a.attachments ?? [])
      .filter((f) => f?.sha256)
      .map((f) => Object.freeze({ label: f.label ?? "Untitled", sha256: f.sha256! })),
  );

  return Object.freeze({
    reference: a.finding?.auditRef?.trim() || a.id || "—",
    finding,
    action,
    ownerPost,
    targetDate,
    completedOn: iso(a.completedOn),
    verifiedOn: iso(a.verifiedOn),
    evidence,
    missing: Object.freeze(missing),
    readyToSubmit: missing.length === 0,
  });
}
