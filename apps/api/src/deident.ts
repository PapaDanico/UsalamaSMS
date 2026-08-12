// =====================================================================
// Pure de-identification module — no runtime deps, unit-testable alone.
//
// WHAT THIS IS, STATED HONESTLY BECAUSE THE PREVIOUS VERSION DID NOT:
// pattern scrubbing removes identifiers that MATCH A PATTERN. It is a
// strong first pass and it is not a guarantee. The original module
// carried six regexes and a function name that promised the world, and
// its test asserted the output did not contain "Otieno" — which passed
// only because the fixture happened to write "Capt. John Otieno". A
// narrative reading "Otieno was on the headset" survived untouched.
//
// That gap is not a cosmetic bug. A voluntary confidential report is
// filed by someone who has been promised the report cannot be traced to
// them, and ICAO Annex 19's protection provisions are the reason they
// believe it. A scrubber that misses a bare surname breaks that promise
// silently, and the reporter finds out when a colleague recognises them
// in a circulated bulletin.
//
// So this module does three things instead of one:
//   1. scrubs what it can match, across the East African registration
//      prefixes this product actually serves — not just Kenya's;
//   2. REPORTS what it changed and how confident it is;
//   3. flags residual risk so a human reviewer sees it before any
//      de-identified narrative is distributed. The review step is not
//      optional and the pipeline will not skip it.
// =====================================================================

import { SMS_ACRONYMS } from "@usalamasms/shared";

export type DeIdentCategory =
  | "REG" | "FLT" | "DATE" | "TIME" | "PHONE" | "EMAIL"
  | "CREW" | "NAME" | "ID" | "URL" | "COORD";

interface Pattern {
  readonly category: DeIdentCategory;
  readonly pattern: RegExp;
  readonly replacement: string;
  /**
   * Veto. Return true to LEAVE a match alone.
   *
   * Regex alone cannot express "two letters and some digits, unless
   * those letters are an aviation abbreviation", and the attempt to
   * force it into a lookahead produced something nobody could read or
   * change safely. A predicate is legible, unit-testable, and can
   * consult a set.
   */
  readonly keep?: (match: string) => boolean;
}

/**
 * Abbreviations that are followed by a number in ordinary aviation
 * prose and are NOT identifiers.
 *
 * This set is the whole reason the module is safe to run on a real
 * narrative. Before it existed, `\b[A-Z]{2,3}\s?\d{1,4}\b` — added to
 * widen flight-number coverage — turned this:
 *
 *   "During approach to RWY 06 the crew levelled at FL 100 with
 *    QNH 1013 ... and RVR 800."
 *
 * into this:
 *
 *   "During approach to [FLT] the crew levelled at [FLT] with
 *    [FLT] ... and [FLT]."
 *
 * Four false positives in three sentences. A de-identified bulletin is
 * circulated so other operators can learn from the occurrence; one that
 * has had its altitudes, runways and visibilities replaced by [FLT]
 * teaches nobody anything. Over-scrubbing does not fail safe — it
 * destroys the only reason the report was shared, while looking like
 * caution.
 */
const NOT_AN_IDENTIFIER = new Set([
  /* THE SAFETY-MANAGEMENT VOCABULARY, from the KCAA glossary.
     Read from packages/shared/src/glossary.ts rather than retyped, so
     the redactor and the interface cannot disagree about what a word is.

     These matter more than they look. "AOC", "SMS", "SPI", "FDA",
     "ERP", "CVR" and "FDR" are all two-to-three capital letters, which
     is exactly the shape of a flight-number prefix — so without this,
     "the AOC holder was notified" redacts to "the [FLT] holder was
     notified", and the sentence a safety office needs is gone. The
     de-identifier is supposed to remove who wrote it, not what it says.

     Spread FIRST so a duplicate below is harmless. */
  ...Object.keys(SMS_ACRONYMS),

  // Aerodrome and approach
  "RWY", "TWY", "SID", "STAR", "ILS", "LOC", "GS", "VOR", "NDB", "DME",
  "GP", "PAPI", "VASI", "ALS", "RCC", "PCN", "ACN", "TORA", "TODA", "ASDA", "LDA",
  // Altitude, pressure, performance
  "FL", "MSL", "AGL", "AAL", "QNH", "QFE", "QFF", "ISA", "OAT", "MDA",
  "DA", "DH", "MDH", "TAS", "IAS", "CAS", "GS", "MTOW", "MLW", "ZFW", "TOW", "LDW",
  "VR", "VI", "V1", "V2", "VREF", "VMO", "MMO", "ROC", "ROD",
  // Visibility and weather
  "RVR", "CAVOK", "TAF", "ATIS", "METAR", "SIGMET", "AIRMET", "CB", "TCU", "TS",
  // Systems and warnings
  "APU", "ECAM", "EICAS", "FMS", "FMC", "MCP", "TCAS", "RA", "TA", "GPWS",
  "EGPWS", "XPDR", "SSR", "ADS", "CPDLC", "IRS", "ADC", "AOA", "EGT", "ITT",
  "RPM", "N1", "N2", "EPR", "FF", "CG",
  // Documents and procedures
  "MEL", "CDL", "QRH", "SOP", "AFM", "FCOM", "AMM", "IPC", "SB", "AD", "EO",
  "ATA", "OM", "CAME", "MOE", "CAP", "AC", "AIC", "AIP",
  // Time and ops
  "ETA", "ETD", "ATD", "EOBT", "TOBT", "CTOT", "STD", "STA", "PAX", "ULD",
  "FOD", "PPE", "GSE", "PBB", "GPU", "ACU",
  // Regulatory
  "CAT", "LVP", "LVO", "RVSM", "RNP", "RNAV", "PBN", "MNPS", "ETOPS", "EDTO",
  // Units
  "KG", "LB", "FT", "NM", "KM", "KT", "KTS", "HPA", "INHG", "USG", "LTR", "DEG",
]);

/**
 * Registration prefixes that are digits-first.
 *
 * These need a hyphen to be recognised, because a bare `60` followed by
 * letters matches ordinary prose — "60 KTS" would have become "[REG]".
 * A hyphen is how registrations are written anyway.
 */
const NUMERIC_LEADING_PREFIXES = new Set(["60"]);

/**
 * Aircraft registration prefixes redacted from a narrative.
 *
 * SCOPED TO THE STATE OF REGISTRY, on instruction, alongside the same
 * narrowing applied to the jurisdictions and the aerodromes. Uganda
 * (5X), Tanzania (5H) and Rwanda (9XR) were removed here on 12 August
 * 2026.
 *
 * WHAT THAT MEANS, AND IT IS NOT THE SAME AS THE OTHER TWO NARROWINGS.
 * Removing a jurisdiction removes a claim; removing an aerodrome sends
 * one field to free text. Removing a prefix HERE means a narrative that
 * names 5X-DEF keeps that registration in a record labelled
 * de-identified. Whose law applies to an operator has nothing to do
 * with which aircraft its crews write about: a Kenyan operator on a
 * sector into Entebbe writes about Ugandan aircraft.
 *
 * This is the defect the module already had once. It originally matched
 * `5Y-[A-Z]{3}` alone, and every Ugandan, Tanzanian, Rwandan and
 * Ethiopian registration went through in clear. The prefixes below were
 * added to close that. Three of them are now open again by decision
 * rather than by accident, which is the only improvement available —
 * IDENTIFIED_CORPUS pins the behaviour so it stays visible, the privacy
 * notice states the scope, and docs/05-SWITCHES.md carries it as a
 * claim with an expiry.
 */
const REGISTRATION_PREFIXES = [
  "5Y",  // Kenya — the State of Registry
  "9U",  // Burundi
  "ET",  // Ethiopia
  "5Z",  // Kenya, earlier allocation — still on legacy records
  "9S",  // DR Congo
  "9Q",  // DR Congo
  "ST",  // Sudan
  "5A",  // Libya
  "60",  // Somalia
] as const;

const REG_ALTERNATION = REGISTRATION_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

const DEIDENT_PATTERNS: ReadonlyArray<Pattern> = [
  // Registrations: 5Y-ABC, 5YABC, 9XR-AB, 60-XYZ.
  //
  // A space separator is NOT accepted. "5Y ABC" is a rarer way to write
  // a registration than "60 KTS" is to write a speed, and the space form
  // cost more in false positives than it bought in coverage.
  {
    category: "REG",
    pattern: new RegExp(`\\b(?:${REG_ALTERNATION})-?[A-Z]{2,4}\\b`, "g"),
    replacement: "[REG]",
    keep: (m) => {
      // A digits-first prefix must be hyphenated to count.
      const prefix = REGISTRATION_PREFIXES.find((p) => m.startsWith(p));
      return prefix !== undefined && NUMERIC_LEADING_PREFIXES.has(prefix) && !m.includes("-");
    },
  },
  // Flight numbers: two or three letters then 1-4 digits.
  //
  // The letters must not be an aviation abbreviation — see
  // NOT_AN_IDENTIFIER above for what this guard is worth.
  {
    category: "FLT",
    pattern: /\b([A-Z]{2,3})\s?(\d{1,4})\b/g,
    replacement: "[FLT]",
    keep: (m) => {
      const letters = /^[A-Z]{2,3}/.exec(m)?.[0];
      return letters === undefined || NOT_AN_IDENTIFIER.has(letters);
    },
  },
  // ISO dates and common written forms.
  { category: "DATE", pattern: /\b\d{4}-\d{2}-\d{2}\b/g, replacement: "[DATE]" },
  { category: "DATE", pattern: /\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g, replacement: "[DATE]" },
  {
    category: "DATE",
    pattern:
      /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4}\b/gi,
    replacement: "[DATE]",
  },
  /* A WRITTEN DATE WITH NO YEAR. "on 14 March", "March 14".
     The pattern above required a year, so "I raised it with the Chief
     Pilot on 14 March" kept its date — and a date is one of the
     sharpest identifiers in a small operator, because it narrows a
     shift roster to the two or three people who were on it. Found by a
     test asserting a reporter's recommendation had been scrubbed and
     watching the name go while the date stayed.

     Both orders, because reporters write both. */
  {
    category: "DATE",
    pattern:
      /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?!\s+\d)/gi,
    replacement: "[DATE]",
  },
  {
    category: "DATE",
    pattern:
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?\b(?!\s*[:.]\d)/gi,
    replacement: "[DATE]",
  },
  /* A BARE WEEKDAY. "on Tuesday", "the Friday night shift".
     Weaker than a date and still a roster narrower on an operation with
     one aircraft and a six-person crew list.

     FULL NAMES ONLY, and this is the whole point of the rule. The first
     version accepted the three-letter abbreviations case-insensitively,
     which is how it managed to redact these:

       "The aircraft SAT on stand 4 for two hours."
       "The SUN was low and glare affected the approach."
       "SUN glare on short final made the PAPI hard to read."
       "The tug was WED to the nose gear."

     Sat, Sun, Wed and Mar are ordinary English words, and "sun glare on
     short final" is one of the most common sentences in an approach
     report. This module's own header says over-scrubbing does not fail
     safe — it destroys the only reason the report was shared, while
     looking like caution — and the abbreviation list did exactly that
     within an hour of being written.

     "Monday" is never another word. "Mon" is. So: full names, and a
     reporter who writes "Tue" keeps their Tuesday, which is the safe
     direction to be wrong in. */
  {
    category: "DATE",
    pattern: /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
    replacement: "[DAY]",
  },
  // Zulu / local times, which narrow a shift roster to one crew.
  { category: "TIME", pattern: /\b(?:[01]\d|2[0-3])[:.]?[0-5]\d\s?(?:Z|UTC|hrs?|L)\b/gi, replacement: "[TIME]" },
  // Phone numbers across the EAC country codes, not Kenya alone.
  {
    category: "PHONE",
    pattern: /(?:\+?(?:254|256|255|250|257|251)|\b0)\s?7\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g,
    replacement: "[PHONE]",
  },
  { category: "PHONE", pattern: /\+\d{1,3}[\s-]?\d[\d\s-]{6,13}\d\b/g, replacement: "[PHONE]" },
  { category: "EMAIL", pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g, replacement: "[EMAIL]" },
  { category: "URL", pattern: /\bhttps?:\/\/\S+/gi, replacement: "[URL]" },
  // Geographic coordinates — a lat/long fixes an event to one approach.
  {
    category: "COORD",
    pattern: /\b\d{1,3}[°º]\s?\d{1,2}['′]\s?\d{1,2}(?:\.\d+)?["″]?\s?[NSEW]\b/g,
    replacement: "[COORD]",
  },
  // Licence and staff numbers.
  { category: "ID", pattern: /\b(?:licen[cs]e|lic|staff|employee|emp|badge)[\s.#:-]*[A-Z0-9-]{3,}\b/gi, replacement: "[ID]" },
  // Titled names — the original pattern, widened.
  {
    category: "CREW",
    pattern:
      /\b(?:Capt(?:ain)?|F\/?O|First\s+Officer|S\/?O|Eng(?:ineer)?|Tech(?:nician)?|Mr|Mrs|Ms|Dr|Prof|AME|LAE|ATCO|Controller|Dispatcher|Purser|CSD|FA)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g,
    replacement: "[CREW]",
  },
  // Names introduced by a role phrase: "the captain, John Otieno".
  {
    category: "NAME",
    pattern:
      /\b(?:named|called|reported\s+by|filed\s+by|signed\s+by|operated\s+by|flown\s+by|handled\s+by)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g,
    replacement: "[NAME]",
  },
];

export interface DeIdentResult {
  /** The scrubbed narrative. */
  readonly text: string;
  /** How many substitutions were made, per category. */
  readonly removed: Readonly<Partial<Record<DeIdentCategory, number>>>;
  /**
   * Spans that look like identifiers the patterns did NOT remove.
   * This is the honest part: the module tells the reviewer where it is
   * probably still leaking rather than reporting a clean sweep.
   */
  readonly residual: ReadonlyArray<{ text: string; reason: string }>;
  /**
   * True when nothing suspicious remains. NOT a guarantee of anonymity —
   * a narrative can identify its author by content alone ("I was the
   * only engineer on shift"). No regex will ever catch that, which is
   * why review is mandatory and why this flag is named for what it
   * actually measures.
   */
  readonly cleanByPattern: boolean;
}

/**
 * Words that begin a sentence or are common enough that treating every
 * capitalised token as a name would flag the entire narrative and train
 * reviewers to click through the warning. A residual detector nobody
 * reads is worse than none.
 */
const COMMON_CAPITALISED = new Set([
  "The", "A", "An", "I", "We", "It", "He", "She", "They", "This", "That", "There",
  "On", "In", "At", "As", "After", "Before", "During", "When", "While", "Then",
  "Aircraft", "Airport", "Approach", "Tower", "Ground", "Apron", "Ramp", "Runway",
  "Taxiway", "Gate", "Stand", "Flight", "Crew", "Captain", "Engineer", "Officer",
  "Company", "Operations", "Maintenance", "Safety", "Security", "Cabin", "Cockpit",
  "ATC", "ATIS", "METAR", "NOTAM", "PIC", "MEL", "QRH", "SOP", "TCAS", "GPWS",
  "EGPWS", "FOD", "PPE", "VFR", "IFR", "VMC", "IMC", "RVR", "QNH", "QFE",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
  "REG", "FLT", "DATE", "TIME", "PHONE", "EMAIL", "CREW", "NAME", "ID", "URL", "COORD",
  // Weather, terrain and ops words that recur in narratives and are not
  // names. Without these the residual list fills with "Wind", "Rain",
  // "Left", "Right" — and a reviewer who scrolls past forty false
  // positives stops reading the one that matters.
  "Wind", "Rain", "Snow", "Ice", "Fog", "Mist", "Cloud", "Turbulence", "Windshear",
  "Left", "Right", "Centre", "Center", "North", "South", "East", "West",
  "Takeoff", "Landing", "Departure", "Arrival", "Descent", "Climb", "Cruise",
  "Taxi", "Pushback", "Boarding", "Turnaround", "Sector", "Stand", "Bay",
  "Engine", "Brake", "Brakes", "Flap", "Flaps", "Gear", "Rudder", "Aileron",
  "Elevator", "Spoiler", "Thrust", "Reverser", "Autopilot", "Autothrottle",
  "Checklist", "Briefing", "Clearance", "Handover", "Shift", "Roster", "Duty",
  "Fuel", "Cargo", "Baggage", "Freight", "Load", "Weight", "Balance",
  "Report", "Reported", "Incident", "Occurrence", "Hazard", "Event", "Finding",
  "Manual", "Procedure", "Policy", "Training", "Licence", "License", "Rating",
  "Company", "Operator", "Station", "Base", "Line", "Hangar", "Workshop",
]);

/**
 * De-identify a narrative, reporting what was removed and what may
 * remain.
 */
export function deIdentify(narrative: string): DeIdentResult {
  let text = narrative;
  const removed: Partial<Record<DeIdentCategory, number>> = {};

  for (const { category, pattern, replacement, keep } of DEIDENT_PATTERNS) {
    // Fresh lastIndex each pass; these are module-level /g regexes and
    // a shared lastIndex across calls is a classic intermittent miss.
    pattern.lastIndex = 0;
    let count = 0;
    text = text.replace(pattern, (match) => {
      if (keep?.(match)) return match; // vetoed — not an identifier
      count++;
      return replacement;
    });
    if (count > 0) removed[category] = (removed[category] ?? 0) + count;
  }

  const residual = findResidual(text);
  return { text, removed, residual, cleanByPattern: residual.length === 0 };
}

/**
 * Look for identifier-shaped spans the patterns missed.
 *
 * Deliberately noisy in one direction only: it would rather flag a
 * capitalised aerodrome name for a human to dismiss than stay quiet
 * about a surname. The cost of a false positive is one click; the cost
 * of a false negative is a named reporter.
 */
function findResidual(text: string): Array<{ text: string; reason: string }> {
  const found: Array<{ text: string; reason: string }> = [];
  const seen = new Set<string>();

  const push = (value: string, reason: string): void => {
    const key = `${reason}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ text: value, reason });
  };

  // Two or more consecutive capitalised words that are not known terms —
  // the shape of a full name the CREW/NAME patterns did not introduce.
  for (const m of text.matchAll(/\b([A-Z][a-z]{2,})\s+([A-Z][a-z]{2,})\b/g)) {
    // Groups are narrowed rather than asserted with `!`. Under
    // noUncheckedIndexedAccess these are `string | undefined`, and a
    // non-null assertion here would silence the compiler on the exact
    // code path that decides whether a reporter's name is flagged.
    const first = m[1];
    const second = m[2];
    if (!first || !second) continue;
    if (COMMON_CAPITALISED.has(first) || COMMON_CAPITALISED.has(second)) continue;
    push(m[0], "looks like a personal name");
  }

  // A lone capitalised word that is not a known aviation term. This is
  // the "Otieno was on the headset" case the old test could not see.
  //
  // NOTE ON SENTENCE-INITIAL WORDS. The first draft skipped anything at
  // the start of a sentence, on the theory that its capital is grammar
  // rather than significance. That silently reintroduced the exact bug
  // this detector exists for: narratives very often OPEN with the name
  // — "Otieno was on the headset" — and the skip meant the one position
  // a name is most likely to occupy was the one position never checked.
  //
  // So there is no positional exemption. Sentence-initial words are
  // filtered by COMMON_CAPITALISED like every other word, which already
  // holds the openers that actually recur ("The", "On", "We", "After").
  // An unusual word at the start of a sentence gets flagged, a reviewer
  // spends one click dismissing it, and no name gets through because of
  // where it happened to sit.
  for (const m of text.matchAll(/\b([A-Z][a-z]{3,})\b/g)) {
    const word = m[1];
    if (!word) continue;
    if (COMMON_CAPITALISED.has(word)) continue;
    if (found.some((f) => f.text.includes(word))) continue;
    push(word, "unrecognised capitalised word — may be a surname or place");
  }

  // Long digit runs the specific patterns did not claim.
  for (const m of text.matchAll(/\b\d{6,}\b/g)) {
    push(m[0], "long numeric string — may be a licence, staff or phone number");
  }

  // First-person singular detail that identifies by role rather than name.
  for (const m of text.matchAll(/\bI\s+was\s+the\s+only\s+\w+/gi)) {
    push(m[0], "self-identifying by uniqueness of role — no scrubber can fix this");
  }

  return found;
}

/**
 * Backwards-compatible wrapper.
 *
 * Kept because call sites exist, but it discards the residual report,
 * so it is the WRONG function for anything that distributes a
 * narrative. The VCR pipeline uses `deIdentify` and refuses to proceed
 * on residual findings without a reviewer decision.
 */
export function deIdentifyNarrative(narrative: string): string {
  return deIdentify(narrative).text;
}
