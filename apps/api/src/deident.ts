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

export type DeIdentCategory =
  | "REG" | "FLT" | "DATE" | "TIME" | "PHONE" | "EMAIL"
  | "CREW" | "NAME" | "ID" | "URL" | "COORD";

interface Pattern {
  readonly category: DeIdentCategory;
  readonly pattern: RegExp;
  readonly replacement: string;
}

/**
 * Aircraft registration prefixes for the states this product serves,
 * plus the wider set an East African operator routinely encounters.
 *
 * The original module matched `5Y-[A-Z]{3}` alone. Every Ugandan,
 * Tanzanian, Rwandan and Ethiopian registration in a narrative went
 * through the pipeline in clear — on a platform whose stated market is
 * the East African corridor.
 */
const REGISTRATION_PREFIXES = [
  "5Y",  // Kenya
  "5X",  // Uganda
  "5H",  // Tanzania
  "9XR", // Rwanda
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
  // Registrations, hyphenated or not: 5Y-ABC, 5Y ABC, 5YABC, 9XR-XX.
  {
    category: "REG",
    pattern: new RegExp(`\\b(?:${REG_ALTERNATION})[\\s-]?[A-Z]{2,4}\\b`, "g"),
    replacement: "[REG]",
  },
  // Flight numbers. Two or three letters then 1-4 digits, optional space.
  { category: "FLT", pattern: /\b[A-Z]{2,3}\s?\d{1,4}\b/g, replacement: "[FLT]" },
  // ISO dates and common written forms.
  { category: "DATE", pattern: /\b\d{4}-\d{2}-\d{2}\b/g, replacement: "[DATE]" },
  { category: "DATE", pattern: /\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g, replacement: "[DATE]" },
  {
    category: "DATE",
    pattern:
      /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4}\b/gi,
    replacement: "[DATE]",
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
]);

/**
 * De-identify a narrative, reporting what was removed and what may
 * remain.
 */
export function deIdentify(narrative: string): DeIdentResult {
  let text = narrative;
  const removed: Partial<Record<DeIdentCategory, number>> = {};

  for (const { category, pattern, replacement } of DEIDENT_PATTERNS) {
    // Fresh lastIndex each pass; these are module-level /g regexes and
    // a shared lastIndex across calls is a classic intermittent miss.
    pattern.lastIndex = 0;
    let count = 0;
    text = text.replace(pattern, () => {
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
    if (COMMON_CAPITALISED.has(m[1]) || COMMON_CAPITALISED.has(m[2])) continue;
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
    if (COMMON_CAPITALISED.has(m[1])) continue;
    if (found.some((f) => f.text.includes(m[1]))) continue;
    push(m[1], "unrecognised capitalised word — may be a surname or place");
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
