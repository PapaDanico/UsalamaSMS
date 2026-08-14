/* =====================================================================
   THE EMERGENCY CONTACT DIRECTORY — element 1.4's larger half.

   WHAT THE PRODUCT ALREADY HELD. The EXERCISE record: that one was
   held, what it found, and whether the plan changed as a result. That
   is the question an inspector asks, and it is genuinely the harder
   one to fake.

   WHAT IT DID NOT HOLD, and this is the half an operator actually uses
   at three in the morning: WHO TO CALL, IN WHAT ORDER, WITH WHAT
   AUTHORITY. Annex 19's element is "coordination of emergency response
   planning", and coordination is a list of people outside the
   organisation who have agreed to answer.

   SCOPED DELIBERATELY NARROW. This is not a document editor and does
   not try to be. An operator's ERP is a manual with call-out trees,
   checklists and diagrams, and building a place to type all that would
   produce a worse version of a Word file. The directory is the part
   that (a) goes stale fastest, (b) is needed fastest, and (c) a
   document cannot enforce.

   THE MECHANISM THAT MAKES IT WORTH HAVING IS `verifiedOn`.

   A contact directory is not wrong when it is written; it becomes wrong
   quietly, while nobody is looking. The KCAA duty officer's number
   changes, the handling agent is bought, the doctor retires — and none
   of that produces an event inside this product. A directory with no
   verification date is a list of numbers that were correct once, and
   the operator finds out which ones still work during the emergency.

   So staleness is COMPUTED against each contact's own last
   verification, on every read, and the screen sorts the stale ones to
   the top. Charter rule 6, and here it is the whole feature: a stored
   "current" flag would say current forever.

   THE INTERVAL IS OURS AND IS LABELLED AS SUCH. Neither Annex 19 nor
   Doc 9859 sets a re-verification period for an ERP contact list. See
   VERIFY_WITHIN_DAYS.
   ===================================================================== */

/**
 * How long a verified contact stays trusted, in days.
 *
 * SIX MONTHS, OURS, and stated as ours wherever it is shown — the same
 * discipline as spi.ts's six-point baseline floor and the maturity
 * descriptors. ICAO requires the ERP to be "periodically reviewed" and
 * names no period for the contact list.
 *
 * Chosen against the exercise cycle rather than arbitrarily: element
 * 1.4's own evidence is an exercise in the last twelve months, so a
 * directory checked twice per exercise cycle is checked once between
 * exercises — which is the point at which a number that changed after
 * the last exercise is found by somebody looking, rather than by
 * somebody dialling.
 */
export const VERIFY_WITHIN_DAYS = 182;

/** Warn this far before it lapses, so it can be fixed before it is stale. */
export const VERIFY_WARN_DAYS = 30;

export type ContactFreshness = "NEVER_VERIFIED" | "STALE" | "DUE_SOON" | "CURRENT";

export interface ContactRecord {
  readonly verifiedOn?: Date | string | null;
}

const at = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const DAY = 86_400_000;

/**
 * Whether this number can still be trusted.
 *
 * NEVER_VERIFIED IS ITS OWN ANSWER and is not folded into STALE. They
 * need different things from a person: a stale contact needs a call to
 * confirm it, and a never-verified one needs somebody to establish that
 * the contact exists and has agreed at all. An operator that has typed
 * fifty numbers out of an old manual has a directory that is entirely
 * NEVER_VERIFIED, and telling them it is "stale" implies it was once
 * checked.
 */
export function freshnessOf(c: ContactRecord, today: Date): ContactFreshness {
  const verified = at(c.verifiedOn);
  if (!verified) return "NEVER_VERIFIED";
  const age = Math.floor((today.getTime() - verified.getTime()) / DAY);
  if (age >= VERIFY_WITHIN_DAYS) return "STALE";
  if (age >= VERIFY_WITHIN_DAYS - VERIFY_WARN_DAYS) return "DUE_SOON";
  return "CURRENT";
}

/** Days until this contact needs re-verifying; negative once it is stale. */
export function daysUntilStale(c: ContactRecord, today: Date): number | null {
  const verified = at(c.verifiedOn);
  if (!verified) return null;
  const age = Math.floor((today.getTime() - verified.getTime()) / DAY);
  return VERIFY_WITHIN_DAYS - age;
}

export interface DirectoryVerdict {
  readonly total: number;
  readonly neverVerified: number;
  readonly stale: number;
  readonly dueSoon: number;
  /**
   * Whether this directory could actually be used tonight.
   *
   * FALSE FOR AN EMPTY DIRECTORY, and that is the point. Zero stale
   * contacts out of zero contacts is not a healthy directory; a summary
   * that reports "0 stale" against an empty list is the reassuring
   * answer and the wrong one — the same failure the coverage page had
   * when it understated the product, pointing the other way.
   */
  readonly usable: boolean;
  /** What to do, in words a screen can print. Null when nothing is wrong. */
  readonly concern: string | null;
}

export function assess(
  contacts: ReadonlyArray<ContactRecord>,
  today: Date,
): DirectoryVerdict {
  let never = 0, stale = 0, soon = 0;
  for (const c of contacts) {
    const f = freshnessOf(c, today);
    if (f === "NEVER_VERIFIED") never++;
    else if (f === "STALE") stale++;
    else if (f === "DUE_SOON") soon++;
  }

  const total = contacts.length;
  if (total === 0) {
    return {
      total: 0, neverVerified: 0, stale: 0, dueSoon: 0,
      usable: false,
      concern:
        "No emergency contacts recorded. Element 1.4 is about coordination — who you " +
        "call, in what order, and what they can authorise — and a plan that connects to " +
        "nobody is a document.",
    };
  }

  /* USABLE MEANS EVERY CONTACT IS TRUSTED, not most of them. A call-out
     tree is used in order, and the one number nobody checked is as
     likely to be the first as the last. "38 of 40 verified" reads as
     healthy and describes a directory that may fail at step one. */
  const untrusted = never + stale;
  return {
    total, neverVerified: never, stale, dueSoon: soon,
    usable: untrusted === 0,
    concern:
      untrusted === 0
        ? soon > 0
          ? `${soon} contact${soon === 1 ? "" : "s"} fall${soon === 1 ? "s" : ""} due for ` +
            "re-verification within the month."
          : null
        : describe(never, stale),
  };
}

function describe(never: number, stale: number): string {
  const parts: string[] = [];
  if (never > 0) {
    parts.push(
      `${never} ${never === 1 ? "contact has" : "contacts have"} never been verified`,
    );
  }
  if (stale > 0) {
    parts.push(
      `${stale} ${stale === 1 ? "is" : "are"} more than ${VERIFY_WITHIN_DAYS} days old`,
    );
  }
  return (
    `${parts.join(", and ")}. A number nobody has dialled is a number you find out ` +
    "about during the emergency."
  );
}

/**
 * Call order, then the ones with no order, then by name.
 *
 * A DIRECTORY IS READ IN ORDER OR IT IS NOT A CALL-OUT TREE. Contacts
 * with no order set go last rather than first — the opposite of what a
 * naive ascending sort on a nullable column does, and the same trap the
 * corrective actions' due dates carried.
 */
export function inCallOrder<T extends { readonly callOrder?: number | null; readonly name: string }>(
  contacts: ReadonlyArray<T>,
): ReadonlyArray<T> {
  return [...contacts].sort((a, b) => {
    const ao = a.callOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.callOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
}
