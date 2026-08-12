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
 * Scoped to the corridor this product serves rather than to the world:
 * a Kenyan operator's dropdown should not open on 40,000 entries. The
 * escape hatch covers everything else.
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
  { code: 'HUEN', label: 'Entebbe (HUEN)', country: 'UG' },
  { code: 'HTDA', label: 'Dar es Salaam / Julius Nyerere (HTDA)', country: 'TZ' },
  { code: 'HTKJ', label: 'Kilimanjaro (HTKJ)', country: 'TZ' },
  { code: 'HTZA', label: 'Zanzibar (HTZA)', country: 'TZ' },
  { code: 'HRYR', label: 'Kigali (HRYR)', country: 'RW' },
  { code: 'HBBA', label: 'Bujumbura (HBBA)', country: 'BI' },
  { code: 'HAAB', label: 'Addis Ababa / Bole (HAAB)', country: 'ET' },
  { code: 'HCMM', label: 'Mogadishu (HCMM)', country: 'SO' },
  { code: 'HSSJ', label: 'Juba (HSSJ)', country: 'SS' }
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

/** ICAO high-risk occurrence categories. */
export const HRC_CATEGORIES = [
  { code: 'RE', label: 'Runway excursion' },
  { code: 'RI', label: 'Runway incursion' },
  { code: 'LOC_I', label: 'Loss of control in flight' },
  { code: 'CFIT', label: 'Controlled flight into terrain' },
  { code: 'MAC', label: 'Mid-air collision / loss of separation' },
  { code: 'BWI', label: 'Bird or wildlife strike' }
];

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

   ICAO is first because it is the answer for every operator whose own
   authority is not one of the other two — and that is most of them.
   It carries no hour figure: Annex 13 asks for notification with a
   minimum of delay and names no period. The list once held Uganda,
   Tanzania and Rwanda at 72 hours apiece, borrowed from the EU and
   labelled ICAO-common. It is not common and it is not ICAO's. */
export const JURISDICTION_OPTIONS = [
  { code: 'ICAO', label: 'ICAO baseline — my authority is not listed' },
  { code: 'KE', label: 'Kenya — KCAA' },
  { code: 'EU', label: 'European Union — EASA' }
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
