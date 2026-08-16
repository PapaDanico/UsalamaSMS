/* ============================================================
   Controlled vocabularies.

   THE POINT IS NOT TIDINESS. Free text here is what makes aggregation
   impossible: "HKJK", "JKIA", "Nairobi", "Jomo Kenyatta" and "NBO" are
   one aerodrome to a human and five to a database. Every safety
   intelligence question worth asking — which aerodrome accumulates
   runway-excursion precursors, which type is over-represented in
   fatigue reports, does the wet season move the numbers — is a GROUP BY
   over a column that free text has already ruined.

   ICAO Annex 19 Amendment 2 makes this a compliance concern rather than
   an engineering preference: safety intelligence, as Doc 10159 frames
   it, is a pipeline from data to decision, and a pipeline over
   uncontrolled strings carries nothing.

   So these lists exist, every operational field that has a bounded
   vocabulary reads from one, and the UI renders them as dropdowns
   through ONE component so they look and behave identically everywhere.

   THIS LIVES IN THE SHARED PACKAGE, NOT IN THE WEB APP, and the reason
   is the difference between offering a vocabulary and enforcing one. A
   dropdown constrains the person using the form. It does not constrain
   the request: a future integration, a partner's own client, a replayed
   payload or a curl command can put "Nairobi" in the location column
   and the UI will never know. Standardisation that lives only in the
   presentation layer is a convention, and conventions decay silently in
   exactly the column that has to be clean for aggregation to work.

   The server validates against these lists (see LocationSchema and
   friends below), so the guarantee holds regardless of what produced
   the request.

   EVERY LIST CARRIES AN ESCAPE. A vocabulary with no "not listed"
   option does not eliminate free text — it makes people put the real
   answer in the narrative, where nothing can count it, and pick the
   nearest wrong entry from the dropdown. That is worse than free text,
   because it is free text plus a wrong number.
   ============================================================ */

/** Sentinel for "not in this list" — handled explicitly at every call site. */
export const OTHER = "__OTHER__";

/**
 * Aerodromes, by ICAO code.
 *
 * KENYA IN DEPTH, THEN THE EAST AFRICAN COMMUNITY AND SOMALIA.
 *
 * This list was scoped to Kenya alone, twice: once when it was written,
 * and once when a wider version was deliberately cut back. The argument
 * for cutting it was that a dropdown entry for Entebbe implies the
 * product knows Uganda's obligations, and that a list reaching past
 * what this product maintains a standard for claims a coverage it does
 * not have.
 *
 * That argument was right about the danger and wrong about this field.
 * WHERE something happened and WHOSE RULES govern it are separate
 * questions, and the report form asks them separately — this list fills
 * `location`, while "Which authority does this operation answer to?"
 * comes from JURISDICTION_OPTIONS and still admits only what
 * regulations.ts can actually compute. The implication the old note
 * feared has nowhere to attach.
 *
 * What the narrow list did cost is the reason dropdowns exist at all.
 * Every regional sector fell into the free-text escape hatch, so an
 * operator flying Nairobi–Entebbe–Kigali could not count occurrences by
 * place; no indicator keyed to an aerodrome and no line of the risk
 * picture could see them. That is the GROUP BY problem this whole
 * module is written against, applied to most of the route network.
 *
 * The escape hatch stays, and still carries the strip with no ICAO code
 * at all — which in this segment is most of them.
 */
export const AERODROMES = [
  { code: 'HKJK', label: 'Nairobi / Jomo Kenyatta (HKJK)', country: 'KE' },
  { code: 'HKNW', label: 'Nairobi / Wilson (HKNW)', country: 'KE' },
  { code: 'HKMO', label: 'Mombasa / Moi (HKMO)', country: 'KE' },
  { code: 'HKKI', label: 'Kisumu (HKKI)', country: 'KE' },
  { code: 'HKEL', label: 'Eldoret (HKEL)', country: 'KE' },
  { code: 'HKML', label: 'Malindi (HKML)', country: 'KE' },
  { code: 'HKLU', label: 'Lamu (HKLU)', country: 'KE' },
  { code: 'HKLO', label: 'Lodwar (HKLO)', country: 'KE' },
  { code: 'HKUK', label: 'Ukunda / Diani (HKUK)', country: 'KE' },
  { code: 'HKNI', label: 'Nyeri (HKNI)', country: 'KE' },
  /* THE NORTHERN NETWORK.
     Added after reading a real operator's Safety Risk Analysis for
     Wajir — the document names "Wajir International Airport (ICAO:
     HKWJ)" and this list did not contain it. An operator whose own SRA
     concerns an aerodrome the taxonomy cannot express is an operator
     whose reports all land in the free-text escape hatch, which is
     precisely the GROUP BY problem the dropdowns exist to prevent.

     HKWJ is evidenced by that document. The rest are the northern and
     northeastern fields the same network serves; verify each against
     the current AIP before a customer's compliance depends on it. */
  { code: 'HKWJ', label: 'Wajir (HKWJ)', country: 'KE' },
  { code: 'HKGA', label: 'Garissa (HKGA)', country: 'KE' },
  { code: 'HKMA', label: 'Mandera (HKMA)', country: 'KE' },
  { code: 'HKMB', label: 'Marsabit (HKMB)', country: 'KE' },
  { code: 'HKLK', label: 'Lokichogio (HKLK)', country: 'KE' },
  { code: 'HKKT', label: 'Kitale (HKKT)', country: 'KE' },
  { code: 'HKNY', label: 'Nanyuki (HKNY)', country: 'KE' },
  { code: 'HKAM', label: 'Amboseli (HKAM)', country: 'KE' },

  /* ==================================================================
     THE EAST AFRICAN COMMUNITY, AND SOMALIA.

     The note above this list argued that a Kenyan operator filing about
     a sector into Entebbe should type it, because a dropdown entry
     implies the product knows Uganda's obligations. That reasoning was
     sound about ONE thing and wrong about the field it was applied to.

     WHERE AN OCCURRENCE HAPPENED AND WHOSE RULES GOVERN IT ARE TWO
     SEPARATE QUESTIONS, and this form already asks them separately —
     `location` here, and "Which authority does this operation answer
     to?" from JURISDICTION_OPTIONS. An aerodrome in this list makes no
     claim about deadlines; the jurisdiction field does, and it still
     covers what regulations.ts can actually compute. So the coupling
     the old note feared does not exist in the markup.

     What the old arrangement DID cost is the thing dropdowns exist for.
     Every EAC sector landed in the free-text escape hatch, so an
     operator flying Nairobi–Entebbe–Kigali could not count events by
     place, and neither the risk picture nor an indicator keyed to an
     aerodrome could see them. Untaggable is uncountable — the same
     defect the ground-operations categories had.

     Somalia is included because it acceded to the EAC, and because the
     Kenyan charter and survey operators this product is built for fly
     there constantly.

     EVERY CODE BELOW WAS VERIFIED, not recalled, and the check earned
     its keep: Juba is HJJJ and recall said HSSJ; Bosaso is HCMF and
     recall said HCMV. Two wrong ICAO codes in an aviation product is
     precisely the class of error this repository refuses to ship.
     Verify against the current AIP before a customer's compliance
     depends on any of them.
     ================================================================== */
  { code: 'HUEN', label: 'Entebbe (HUEN)', country: 'UG' },

  { code: 'HTDA', label: 'Dar es Salaam / Julius Nyerere (HTDA)', country: 'TZ' },
  { code: 'HTKJ', label: 'Kilimanjaro (HTKJ)', country: 'TZ' },
  { code: 'HTZA', label: 'Zanzibar / Abeid Amani Karume (HTZA)', country: 'TZ' },
  { code: 'HTMW', label: 'Mwanza (HTMW)', country: 'TZ' },
  { code: 'HTAR', label: 'Arusha (HTAR)', country: 'TZ' },

  { code: 'HRYR', label: 'Kigali (HRYR)', country: 'RW' },

  { code: 'HBBA', label: 'Bujumbura (HBBA)', country: 'BI' },

  { code: 'HJJJ', label: 'Juba (HJJJ)', country: 'SS' },

  { code: 'FZAA', label: "Kinshasa / N'Djili (FZAA)", country: 'CD' },
  { code: 'FZNA', label: 'Goma (FZNA)', country: 'CD' },
  { code: 'FZQA', label: 'Lubumbashi (FZQA)', country: 'CD' },

  { code: 'HCMM', label: 'Mogadishu / Aden Adde (HCMM)', country: 'SO' },
  { code: 'HCMH', label: 'Hargeisa / Egal (HCMH)', country: 'SO' },
  { code: 'HCMI', label: 'Berbera (HCMI)', country: 'SO' },
  { code: 'HCMK', label: 'Kismayo (HCMK)', country: 'SO' },
  { code: 'HCMF', label: 'Bosaso (HCMF)', country: 'SO' }
];

/**
 * Aircraft types.
 *
 * Weighted to the AFI fleet rather than to a global type list: IATA's
 * 2025 report puts 71% of accidents involving AFI-based operators on
 * turboprops, so the turboprops come first and are not buried under
 * narrowbodies an operator here will never touch.
 */
export const AIRCRAFT_TYPES = [
  { code: 'DH8D', label: 'DHC-8-400 (Dash 8 Q400)', category: 'Turboprop' },
  { code: 'DH8C', label: 'DHC-8-300', category: 'Turboprop' },
  { code: 'AT76', label: 'ATR 72-600', category: 'Turboprop' },
  { code: 'AT75', label: 'ATR 72-500', category: 'Turboprop' },
  { code: 'AT46', label: 'ATR 42-600', category: 'Turboprop' },
  { code: 'C208', label: 'Cessna 208 Caravan', category: 'Turboprop' },
  { code: 'C20B', label: 'Cessna 208B Grand Caravan', category: 'Turboprop' },
  { code: 'BE20', label: 'Beechcraft King Air 200', category: 'Turboprop' },
  { code: 'DHC6', label: 'DHC-6 Twin Otter', category: 'Turboprop' },
  { code: 'L410', label: 'LET L-410', category: 'Turboprop' },
  { code: 'F406', label: 'Reims F406 Caravan II', category: 'Turboprop' },
  /* The Fokker 50 was missing while the Fokker 70 was here, which made
     the list unable to describe the commonest mid-tier East African
     fleet shape: 50s on the regional turboprop routes and 70s on the
     jet ones, from one operator. A type list that cannot name half a
     customer's fleet sends that half to the free-text escape, and free
     text is the half nobody can count. */
  { code: 'F50', label: 'Fokker 50', category: 'Turboprop' },
  /* THE 737 CLASSICS, and their absence was the same shape as the
     Fokker 50's. The list carried the NG and the MAX — the fleet a
     well-capitalised flag carrier buys — and neither of the two
     variants an East African operator is most likely to be flying. The
     -300 and -400 are the backbone of regional freight and charter
     across the continent: cheap to acquire, still certified, and
     over-represented in exactly the operations this product exists for.
     An operator whose whole jet fleet fell into the free-text escape
     hatch is an operator whose jet occurrences cannot be grouped. */
  { code: 'B733', label: 'Boeing 737-300', category: 'Jet' },
  { code: 'B734', label: 'Boeing 737-400', category: 'Jet' },
  { code: 'B738', label: 'Boeing 737-800', category: 'Jet' },
  { code: 'B38M', label: 'Boeing 737 MAX 8', category: 'Jet' },
  { code: 'B788', label: 'Boeing 787-8', category: 'Jet' },
  { code: 'E190', label: 'Embraer E190', category: 'Jet' },
  { code: 'CRJ9', label: 'Bombardier CRJ900', category: 'Jet' },
  /* Same source as HKWJ above: the SRA is written for an F70 fleet and
     this list could not name the aircraft it is about. */
  { code: 'F70', label: 'Fokker 70', category: 'Jet' },
  { code: 'F100', label: 'Fokker 100', category: 'Jet' },
  { code: 'A320', label: 'Airbus A320', category: 'Jet' },
  { code: 'C172', label: 'Cessna 172', category: 'Piston' },
  { code: 'C206', label: 'Cessna 206', category: 'Piston' },
  { code: 'BE58', label: 'Beechcraft Baron 58', category: 'Piston' },
  { code: 'R44', label: 'Robinson R44', category: 'Rotorcraft' },
  { code: 'AS50', label: 'Airbus AS350', category: 'Rotorcraft' },
  { code: 'B06', label: 'Bell 206', category: 'Rotorcraft' }
];

/** Report types. The label is what a frontline reporter reads. */
export const REPORT_TYPES = [
  { code: 'HAZARD', label: 'Hazard — something that could cause harm' },
  { code: 'NEAR_MISS', label: 'Near miss — it nearly happened' },
  { code: 'MOR', label: 'Occurrence — it happened, reportable to the regulator' },
  { code: 'VCR', label: 'Confidential report — voluntary and confidential' },
  { code: 'FATIGUE', label: 'Fatigue — duty, rest or alertness' },
  { code: 'SUGGESTION', label: 'Suggestion — a way to make this safer' }
];

/**
 * WHAT A REPORTER CAN TAG.
 *
 * ---------------------------------------------------------------
 * THE FIRST SIX WERE RIGHT, AND I NEARLY BROKE THEM.
 *
 * The original list was RE, RI, LOC_I, CFIT, MAC and BWI, and the
 * working assumption while extending it was that BWI was a typo for
 * CICTT's BIRD and should be migrated. Reading the primary document
 * says otherwise. Kenya's National Aviation Safety Plan, §5.1.1.1,
 * lists the national High-Risk Categories of Occurrences as:
 *
 *     (a) Controlled flight into terrain (CFIT)
 *     (b) Loss of control in-flight (LOC-I)
 *     (c) Mid-air collision (MAC)
 *     (d) Runway excursion (RE)
 *     (e) Runway incursion (RI)
 *     (f) Bird Strikes (BWI)
 *
 * SIX, INCLUDING BIRD STRIKES, AND `BWI` IS THE PLAN'S OWN CODE. It
 * appears again in the plan's indicator table as "BWI incidents per
 * quarter/per aerodrome". Whoever wrote this list was reading Kenya's
 * national plan, not guessing, and migrating BWI to BIRD would have
 * silently walked the product away from the vocabulary the regulator
 * publishes. Exactly one production report carries a tag and that tag
 * is BWI; the migration would have rewritten the only real datum here
 * to match a taxonomy the State does not use.
 *
 * `LOC_I` WAS genuinely wrong — the plan and CICTT both write LOC-I
 * with a hyphen — and that one is fixed.
 *
 * ---------------------------------------------------------------
 * THE GROUND WAS MISSING, AND THAT PART WAS REAL.
 *
 * All six national HRCs are airborne or on the runway. A ramp
 * collision, a tug into a fairing, a loading injury — among the most
 * frequent things a charter or survey operator actually files, with no
 * way to tag one. Untaggable is uncountable, so those events reached
 * neither an indicator nor the risk picture.
 *
 * So the list is the national six PLUS what this segment files, and
 * `nasp` marks which is which. That distinction is a fact about the
 * code rather than a display flag: an operator showing KCAA an
 * indicator against a national safety issue needs to know which of
 * these the State actually named.
 *
 * ---------------------------------------------------------------
 * `cictt` IS THE BRIDGE, and it exists only where the two disagree.
 * The plan says BWI, the ADREP/CICTT registry says BIRD, and both are
 * correct in their own document. A report tagged BWI must still reach
 * a CICTT-coded export, so the mapping is declared once here rather
 * than guessed at each call site. A test holds every entry to a real
 * registry code through this field.
 */
export const HRC_CATEGORIES = [
  { code: 'CFIT', label: 'Controlled flight into terrain', group: 'In flight', nasp: true },
  { code: 'LOC-I', label: 'Loss of control in flight', group: 'In flight', nasp: true },
  { code: 'MAC', label: 'Loss of separation or near mid-air', group: 'In flight', nasp: true },
  { code: 'BWI', label: 'Bird or wildlife strike', group: 'In flight', nasp: true, cictt: 'BIRD' },
  { code: 'TURB', label: 'Turbulence encounter', group: 'In flight', nasp: false },

  { code: 'RE', label: 'Runway excursion', group: 'Runway', nasp: true },
  { code: 'RI', label: 'Runway incursion', group: 'Runway', nasp: true },
  { code: 'ARC', label: 'Heavy, long or abnormal landing', group: 'Runway', nasp: false },

  { code: 'RAMP', label: 'Ground handling — loading, servicing, marshalling', group: 'On the ground', nasp: false },
  { code: 'GCOL', label: 'Ground collision', group: 'On the ground', nasp: false },
  { code: 'LOC-G', label: 'Loss of control while taxiing', group: 'On the ground', nasp: false },
  { code: 'GTOW', label: 'Towing or pushback', group: 'On the ground', nasp: false },

  { code: 'SCF-PP', label: 'Engine or propeller failure', group: 'Technical', nasp: false },
  { code: 'SCF-NP', label: 'Other system or component failure', group: 'Technical', nasp: false },
  { code: 'FUEL', label: 'Fuel — quantity, contamination or starvation', group: 'Technical', nasp: false }
];

/** The order the groups are shown in, and the only place it is stated. */
export const HRC_GROUPS = ['In flight', 'Runway', 'On the ground', 'Technical'];

/**
 * Kenya's six national High-Risk Categories, derived rather than
 * relisted — charter rule 10, so the set cannot drift from the chips.
 */
export const NASP_HIGH_RISK = HRC_CATEGORIES.filter((c) => c.nasp);

/** The CICTT code for a tag, which is the tag itself unless they differ. */
export const cicttFor = (tag: string): string =>
  HRC_CATEGORIES.find((c) => c.code === tag)?.cictt ?? tag;

/**
 * Phase of flight — ICAO/CAST taxonomy, trimmed.
 *
 * Not previously captured at all, and it is the single most useful
 * dimension for precursor analysis: "runway excursion" tells you what
 * happened, "landing roll" tells you where to look.
 */
export const FLIGHT_PHASES = [
  { code: 'STANDING', label: 'Standing / parked' },
  { code: 'PUSHBACK', label: 'Pushback or towing' },
  { code: 'TAXI', label: 'Taxi' },
  { code: 'TAKEOFF', label: 'Take-off' },
  { code: 'INITIAL_CLIMB', label: 'Initial climb' },
  { code: 'CLIMB', label: 'Climb' },
  { code: 'CRUISE', label: 'Cruise' },
  { code: 'DESCENT', label: 'Descent' },
  { code: 'APPROACH', label: 'Approach' },
  { code: 'LANDING', label: 'Landing' },
  { code: 'LANDING_ROLL', label: 'Landing roll' },
  { code: 'GO_AROUND', label: 'Go-around' },
  { code: 'GROUND_HANDLING', label: 'Ground handling' },
  { code: 'MAINTENANCE', label: 'Maintenance' }
];

/* Jurisdictions, labelled by authority rather than by code.

   Kenya first, because a reporting obligation follows the STATE OF
   REGISTRY and Kenya is the one whose standard this product maintains.
   ICAO second, carrying no hour figure, for every other State: Annex 13
   asks for notification with a minimum of delay and names no period.

   The list once held Uganda, Tanzania and Rwanda at 72 hours apiece,
   borrowed from the EU and labelled ICAO-common — it is neither common
   nor ICAO's — and then the EU itself, which was correct and cited and
   still implied a coverage that does not exist. Two entries is the
   honest width: one State done properly, and a baseline that declines
   to guess at the rest. */
export const JURISDICTION_OPTIONS = [
  { code: 'KE', label: 'Kenya — KCAA' },
  { code: 'ICAO', label: 'ICAO baseline — another State of Registry' }
];

/** Sync states, for the triage filter. */
export const SYNC_STATES = [
  { code: 'pending', label: 'Waiting to send' },
  { code: 'syncing', label: 'Sending' },
  { code: 'synced', label: 'Sent' },
  { code: 'conflict', label: 'Needs review' },
  { code: 'error', label: 'Rejected' }
];

/* --------------------- Server-side enforcement ---------------------
   The escape hatch means these cannot be plain enums: a vocabulary with
   no way out puts the real answer in the narrative and a wrong code in
   the column. So the rule is "a known code, OR free text that is
   clearly not pretending to be a code" — and the sentinel itself is
   rejected outright, because `__OTHER__` in a location column is a
   value that looks like a place and groups with nothing. */

const AERODROME_CODES = new Set(AERODROMES.map((a) => a.code));
const AIRCRAFT_CODES = new Set(AIRCRAFT_TYPES.map((a) => a.code));

/** True when a value is a code from the list, or acceptable free text. */
function isKnownOrFreeText(value: string, known: ReadonlySet<string>): boolean {
  if (value === OTHER) return false; // the sentinel must never be stored
  if (known.has(value)) return true;
  // Free text from the escape hatch. Bounded, and not a lookalike code:
  // a four-letter uppercase string that is NOT in the list is almost
  // always a typo of one that is, and letting it through creates the
  // second aerodrome the taxonomy exists to prevent.
  if (/^[A-Z0-9]{3,4}$/.test(value)) return false;
  return value.length > 0 && value.length <= 120;
}

export function isValidLocation(value: string): boolean {
  return isKnownOrFreeText(value, AERODROME_CODES);
}

export function isValidAircraftType(value: string): boolean {
  return isKnownOrFreeText(value, AIRCRAFT_CODES);
}

/** Turn a taxonomy row into the shape Select expects. */
export function toOptions(
  list: ReadonlyArray<Record<string, string | undefined>>,
  { valueKey = "code", labelKey = "label" }: { valueKey?: string; labelKey?: string } = {},
): Array<{ value: string; label: string; group?: string }> {
  return list.map((row) => ({
    value: row[valueKey] ?? "",
    label: row[labelKey] ?? "",
    group: row["category"],
  }));
}

/** Resolve a stored code back to its label, for display. */
export function labelFor(
  list: ReadonlyArray<{ code: string; label: string }>,
  code: string | null | undefined,
  fallback = "—",
): string {
  return list.find((row) => row.code === code)?.label ?? (code || fallback);
}
