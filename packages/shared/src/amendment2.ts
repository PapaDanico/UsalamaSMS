/* =====================================================================
   ANNEX 19 AMENDMENT 2 — what changed, who is newly in scope, and how
   far an operator has actually got.

   WHY THIS IS ITS OWN MODULE. The twelve elements have been stable
   since 2013 and live in maturity.ts. Amendment 2 does not add an
   element; it changes what several of them are ASKED FOR — a static
   acceptable level replaced by measured performance, safety
   intelligence introduced as a chapter of its own, and the SMS
   obligation extended to organisations that never had one. Folding
   that into the element list would lose the thing that makes it
   urgent, which is that it has a date.

   THE DATE IS THE PRODUCT. Adopted 23 June 2025, effective 4 November
   2025, APPLICABLE 26 NOVEMBER 2026. Effective binds the State;
   applicable is when an operator is audited against it. Operators who
   have not started are not early — they are late, and most do not know
   it.

   ---------------------------------------------------------------
   WHAT THIS SCORES AND WHAT IT REFUSES TO SCORE.

   Each change carries what an operator must be able to SHOW, and
   which of this product's own surfaces holds it. That mapping is the
   honest part: where UsalamaSMS already carries the evidence it says
   so, and where it does not it says that too, rather than scoring a
   gap as a feature.

   IT DOES NOT PRODUCE A PERCENTAGE. A single number would be read as
   "83% compliant", which is not a thing an auditor recognises and not
   a claim anybody here can make on an operator's behalf. It returns
   counts and a list of what is not yet in place, which is what somebody
   with fourteen weeks actually needs.

   ---------------------------------------------------------------
   PROVENANCE, STATED THE WAY THIS REPOSITORY STATES IT.

   Compiled from ICAO's published summaries of Amendment 2 and from a
   research brief prepared for this product, NOT from the amended Annex
   itself — icao.int is unreachable from the build environment. That is
   sufficient for a readiness CONVERSATION and is why nothing in this
   module feeds the deadline engine: reporting deadlines come from
   L.N. 32 read as an instrument, and they stay that way.
   ===================================================================== */

export const AMENDMENT2_VERIFIED_AGAINST_PRIMARY = false;

export const AMENDMENT2_SOURCE =
  "ICAO Annex 19 Amendment 2 (3rd Edition), adopted 23 June 2025. Compiled from " +
  "ICAO's published summaries and supporting guidance, not from the amended Annex " +
  "itself. Nothing here feeds a reporting deadline — those come from L.N. 32 of 2026, " +
  "read as an instrument.";

/** The three dates, and what each one actually binds. */
export const AMENDMENT2_DATES = Object.freeze({
  adopted: "2025-06-23",
  /** Binds the State: national regulations must transpose it. */
  effective: "2025-11-04",
  /** Binds the operator: this is the date an audit is against. */
  applicable: "2026-11-26",
});

/** Whole days from `asOf` until an operator is audited against it. */
export function daysUntilApplicable(asOf: Date): number {
  const due = Date.parse(`${AMENDMENT2_DATES.applicable}T00:00:00.000Z`);
  /* Ceil rather than floor, and not clamped at zero. "0 days" and "12
     days overdue" are different sentences, and clamping here would
     push that distinction into every caller. */
  return Math.ceil((due - asOf.getTime()) / 86_400_000);
}

export interface Change {
  readonly key: string;
  readonly title: string;
  /** What an operator has to be able to show for it. */
  readonly show: string;
  /** Where in THIS product the evidence lives, or null if it does not. */
  readonly surface: string | null;
  /** Said plainly when the product does not carry it. */
  readonly notHere?: string;
}

/* The seven structural changes. Ordered by how much work they are for
   an operator that has done nothing, not by ICAO's numbering — this
   list is read by somebody deciding what to do on Monday. */
export const CHANGES: readonly Change[] = Object.freeze([
  {
    key: "PERFORMANCE",
    title: "Measured safety performance, not a stated acceptable level",
    show:
      "Indicators with targets, periods recorded against them over time, and an action " +
      "taken when one crossed its alert level.",
    surface: "/toolkits/spi — indicators, periods and computed alert levels",
  },
  {
    key: "INTELLIGENCE",
    title: "Safety intelligence as a discipline of its own",
    show:
      "Evidence that safety data is collected, processed, analysed and APPLIED to a " +
      "decision — not merely filed and counted.",
    surface: "/picture and barrier health — the aggregate position and which barriers are degrading",
  },
  {
    key: "SDCPS",
    title: "A structured safety data collection and processing system",
    show:
      "One system that receives reports, holds them, and produces analysis — rather than " +
      "a spreadsheet, a mailbox and a filing cabinet that disagree.",
    surface: "The product itself — offline capture, sync, and one record per occurrence",
  },
  {
    key: "SSP_LINK",
    title: "Safety performance aligned to national priorities",
    show:
      "That the operator's own indicators relate to the State's safety plan rather than " +
      "being chosen in isolation.",
    surface: "/toolkits/spi — Kenya's NASP high-risk categories offered as starters",
  },
  {
    key: "DATA_GOVERNANCE",
    title: "Stronger protection of safety data and its sources",
    show:
      "A confidential reporting route, de-identification before wider circulation, and a " +
      "written statement of how reports are protected from inappropriate use.",
    surface: "The voluntary scheme definition and automatic de-identification",
  },
  {
    key: "SHARING",
    title: "Safety information shared beyond the organisation",
    show:
      "That lessons leave the operator — to the Authority, to an industry group, or to " +
      "peers — rather than stopping at the safety office door.",
    surface: null,
    notHere:
      "This product records and exports, and does not yet share. Pooled anonymous " +
      "benchmarking across operators is designed and not built, and saying so is more " +
      "use to you than a page claiming otherwise.",
  },
  {
    key: "APPLICABILITY",
    title: "SMS extended to organisations that never had one",
    show:
      "If you are a certified RPAS operator in international operations, a maintenance " +
      "organisation serving one, or a certified heliport — an SMS, from a standing start.",
    surface: "/toolkits/maturity — the implementation plan, generated from your own answers",
  },
]);

/** The populations Amendment 2 newly captures. */
export const NEWLY_IN_SCOPE: readonly { readonly who: string; readonly note: string }[] =
  Object.freeze([
    {
      who: "Certified RPAS operators authorised for international operations",
      note: "Most have no SMS, no safety manager, and no prior obligation to either.",
    },
    {
      who: "Approved maintenance organisations serving those RPAS operators",
      note: "An existing AMO may already hold an SMS; one that grew up around drones will not.",
    },
    {
      who: "Certified heliports",
      note: "Medevac, survey and offshore heliports across East Africa are captured for the first time.",
    },
  ]);

export interface Readiness {
  readonly daysRemaining: number;
  readonly overdue: boolean;
  /** Changes the operator says they can show. */
  readonly ready: readonly string[];
  /** Changes they cannot — the list worth working. */
  readonly outstanding: readonly Change[];
  /** Of the outstanding, the ones this product already carries a surface for. */
  readonly weCanHelpWith: readonly Change[];
}

/**
 * Score an operator's own answers.
 *
 * TAKES WHAT THEY SAY THEY CAN SHOW, not what the database holds.
 * A readiness check that read their records would only ever describe
 * operators who are already customers, and this one exists to be
 * useful to somebody who is not — the whole point of publishing it.
 */
export function assessReadiness(
  canShow: readonly string[],
  asOf: Date,
  changes: readonly Change[] = CHANGES,
): Readiness {
  const claimed = new Set(canShow);
  const outstanding = changes.filter((c) => !claimed.has(c.key));
  const days = daysUntilApplicable(asOf);
  return Object.freeze({
    daysRemaining: days,
    overdue: days < 0,
    ready: Object.freeze(changes.filter((c) => claimed.has(c.key)).map((c) => c.key)),
    outstanding: Object.freeze(outstanding),
    /* Named separately so the honest half stays visible: an operator
       reading this should be able to see which of their gaps this
       product closes and which it does not. */
    weCanHelpWith: Object.freeze(outstanding.filter((c) => c.surface !== null)),
  });
}
