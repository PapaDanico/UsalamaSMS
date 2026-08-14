/* =====================================================================
   THE CODES A STATE FILES TO ICAO.

   WHY THIS EXISTS. This product classifies a report with its own six
   types — MOR, VCR, hazard, suggestion, near miss, fatigue — which
   describe what KIND OF REPORT it is. That is a useful distinction and
   it is not the one an authority files under.

   ICAO's ADREP taxonomy, maintained in detail by EASA as the ECCAIRS
   taxonomy, is how every State classifies an OCCURRENCE when reporting
   to ICAO. The occurrence categories in it come from the CAST/ICAO
   Common Taxonomy Team (CICTT). An operator whose reports carry no
   CICTT code hands its State data that somebody has to re-code by
   hand, and hand-coding drifts.

   MULTIPLE CODING IS THE POINT, not a convenience. CICTT's own usage
   notes are explicit: a runway excursion that became a loss of control
   is coded as BOTH, because the taxonomy exists for accident
   PREVENTION and every pertinent element should be recorded. A schema
   that allowed one code per report would quietly discard the second
   half of exactly the occurrences worth learning from — so this is an
   array everywhere it appears.

   ============================================================
   WHAT IS VERIFIED HERE AND WHAT IS NOT. READ THIS BEFORE TRUSTING IT.

   THE CODES AND LABELS below were compiled from secondary sources —
   published summaries, State safety reviews and taxonomy references
   citing CICTT — and NOT read against the primary document, "Aviation
   Occurrence Categories: Definitions and Usage Notes", CICTT version
   4.8, May 2021.

   RE-CHECKED 14 AUGUST 2026, AND THE LIST GREW BY THIRTEEN. The first
   compilation carried twenty categories. A second pass across
   independent references — SKYbrary's ADREP taxonomy pages, the ATSB's
   occurrence terminology, NASA and State safety reports coding to
   CICTT, and search-level extracts of the primary itself — corroborated
   thirteen more: ADRM, AMAN, ATM, EVAC, FUEL, GTOW, LOC-G, LOLI, NAV,
   RI, UIMC, USOS and WSTRW.

   ONE OF THOSE WAS A SAFETY GAP AND NOT MERELY AN OMISSION. **RI,
   runway incursion**, is among the most consequential occurrence types
   in aviation, and it was absent. An operator classifying one found
   nothing that fitted; the conscientious answer was OTHR and the
   likely answer was something adjacent and wrong. A taxonomy missing
   its highest-frequency serious category does not fail loudly — it
   produces confidently mis-coded data, which is worse than none.

   THE PRIMARY STILL HAS NOT BEEN READ, and the flag below still says
   so. Network egress from this environment blocks icao.int,
   intlaviationstandards.org, ntsb.gov, enac.gov.it, cast-safety.org and
   faa.gov — every mirror of the document that was found. Corroboration
   across several independent sources is better than one summary and it
   is not the same as reading the document, so nothing here claims it
   is.

   WHAT READING IT WOULD SETTLE, when somebody can: the exact published
   wording of each title, the categories still missing from this list,
   and the definitions. The machine-readable form to check against is
   the ECCAIRS Aviation Data Definition Standard, attribute 430
   (Occurrence category) — which is also what an ECCAIRS-compatible
   export would have to satisfy.

   THE DEFINITIONS ARE DELIBERATELY ABSENT. A category's definition is
   the part that decides a borderline case, it runs to a paragraph with
   usage notes and exclusions, and paraphrasing one from a summary
   would produce something that looks authoritative and decides a
   marginal occurrence wrongly. So this module carries what an operator
   PICKS FROM — the code and its name — and points at the document for
   what each one means.

   THE LIST IS INCOMPLETE and says so on screen. CICTT 4.8 has more
   categories than are here. That is why OTHR exists and why the
   product keeps its own report type alongside: an occurrence that fits
   nothing in this list is still fully recorded, and the gap is visible
   rather than forced into a wrong code.

   This is the same discipline the twelve elements carry in
   maturity.ts, and the jurisdictions in regulations.ts: a figure an
   operator relies on and cannot check is worse than no figure.
   ============================================================ */

export const CICTT_VERSION = "4.8 (May 2021)";
export const CICTT_SOURCE =
  "CAST/ICAO Common Taxonomy Team, Aviation Occurrence Categories: " +
  "Definitions and Usage Notes. Published by ICAO and mirrored by EASA " +
  "as the ECCAIRS taxonomy.";

/**
 * Whether this product has read the primary document.
 *
 * FALSE, and shown as such wherever the codes appear. Flip it when
 * somebody has the PDF open beside this file and has checked every row
 * — and add the definitions in the same change, because that is the
 * work that verification actually consists of.
 */
export const CICTT_VERIFIED_AGAINST_PRIMARY = false;

export interface OccurrenceCategory {
  /** The code a State files. */
  readonly code: string;
  /** The category's name, as published. */
  readonly label: string;
  /**
   * Which phase of operation it usually arises in, for grouping on a
   * form. OURS, not CICTT's — the taxonomy does not group its
   * categories this way, and a list of twenty flat codes on a handset
   * is a list nobody reads to the bottom of.
   */
  readonly group: "In flight" | "Runway and landing" | "On the ground" | "Aircraft" | "Other";
}

export const OCCURRENCE_CATEGORIES: ReadonlyArray<OccurrenceCategory> = Object.freeze([
  // ---- In flight ----
  { code: "AMAN", label: "Abrupt manoeuvre", group: "In flight" },
  { code: "UIMC", label: "Unintended flight in instrument meteorological conditions", group: "In flight" },
  { code: "WSTRW", label: "Wind shear or thunderstorm", group: "In flight" },
  { code: "NAV", label: "Navigation errors", group: "In flight" },
  { code: "LOLI", label: "Loss of lifting conditions en route", group: "In flight" },
  { code: "LOC-I", label: "Loss of control — in flight", group: "In flight" },
  { code: "CFIT", label: "Controlled flight into or toward terrain", group: "In flight" },
  { code: "MAC", label: "Airprox, TCAS alert, loss of separation, near or actual mid-air collision", group: "In flight" },
  { code: "LALT", label: "Low altitude operations", group: "In flight" },
  { code: "TURB", label: "Turbulence encounter", group: "In flight" },
  { code: "ICE", label: "Icing", group: "In flight" },
  { code: "BIRD", label: "Birdstrike", group: "In flight" },
  { code: "CTOL", label: "Collision with obstacle(s) during take-off or landing, while airborne", group: "In flight" },

  // ---- Runway and landing ----
  { code: "RE", label: "Runway excursion", group: "Runway and landing" },
  { code: "ARC", label: "Abnormal runway contact", group: "Runway and landing" },
  /* THE ONE WHOSE ABSENCE WAS A SAFETY GAP RATHER THAN AN OMISSION. A
     runway incursion is among the most consequential occurrence types in
     aviation and an operator looking for it found nothing, so the honest
     ones coded OTHR and the rest picked something adjacent and wrong. */
  { code: "RI", label: "Runway incursion", group: "Runway and landing" },
  { code: "USOS", label: "Undershoot or overshoot", group: "Runway and landing" },

  // ---- On the ground ----
  { code: "GCOL", label: "Ground collision", group: "On the ground" },
  { code: "RAMP", label: "Ground handling", group: "On the ground" },
  { code: "LOC-G", label: "Loss of control — on the ground", group: "On the ground" },
  { code: "ADRM", label: "Aerodrome — design, service or functionality", group: "On the ground" },
  { code: "EVAC", label: "Evacuation", group: "On the ground" },
  { code: "GTOW", label: "Glider towing related events", group: "On the ground" },

  // ---- Aircraft ----
  { code: "SCF-PP", label: "System or component failure or malfunction — powerplant", group: "Aircraft" },
  { code: "SCF-NP", label: "System or component failure or malfunction — non-powerplant", group: "Aircraft" },
  { code: "F-NI", label: "Fire or smoke — non-impact", group: "Aircraft" },
  { code: "F-POST", label: "Fire or smoke — post-impact", group: "Aircraft" },
  { code: "CABIN", label: "Cabin safety events", group: "Aircraft" },
  { code: "FUEL", label: "Fuel related", group: "Aircraft" },

  // ---- Other ----
  { code: "SEC", label: "Security related", group: "Other" },
  { code: "ATM", label: "ATM or CNS — air traffic management and communication, navigation, surveillance", group: "Other" },
  {
    code: "OTHR",
    label: "Other — nothing in this list fits",
    group: "Other",
  },
  {
    code: "UNK",
    label: "Unknown or undetermined — not enough is known yet to categorise it",
    group: "Other",
  },
]);

const BY_CODE = new Map(OCCURRENCE_CATEGORIES.map((c) => [c.code, c]));

/** The category for a code, or null. Never throws on unknown input. */
export function categoryFor(code: string): OccurrenceCategory | null {
  return BY_CODE.get(code) ?? null;
}

/** Every declared group, in the order the form should show them. */
export const CATEGORY_GROUPS = Object.freeze([
  "In flight",
  "Runway and landing",
  "On the ground",
  "Aircraft",
  "Other",
] as const);

export function categoriesIn(group: string): ReadonlyArray<OccurrenceCategory> {
  return OCCURRENCE_CATEGORIES.filter((c) => c.group === group);
}

/**
 * Which of the submitted codes this product does not recognise.
 *
 * RETURNS THE UNKNOWNS RATHER THAN REFUSING, and the caller decides.
 * The list here is incomplete by admission, so an operator sending a
 * legitimate CICTT code this file has not got yet is a gap in this
 * file — not an error in their report. The route records what it was
 * given and reports what it could not resolve, which keeps the
 * occurrence intact and makes the gap visible.
 */
export function unrecognised(codes: ReadonlyArray<string>): ReadonlyArray<string> {
  return codes.filter((c) => !BY_CODE.has(c));
}

/**
 * The sentence shown wherever these codes are offered.
 *
 * A SINGLE DECLARATION so the caveat cannot be shown on one screen and
 * forgotten on another — the same reason the maturity descriptors are
 * labelled from one place.
 */
export const CICTT_CAVEAT =
  `Occurrence categories are ICAO's, from the CAST/ICAO Common Taxonomy Team, version ` +
  `${CICTT_VERSION}. This product carries the codes and their names, NOT their full ` +
  `definitions — a category's definition is what decides a borderline case, and it is ` +
  `in the published document rather than paraphrased here. The list is also not ` +
  `complete: if nothing fits, use OTHR and say so in the narrative rather than forcing ` +
  `a code that does not.`;
