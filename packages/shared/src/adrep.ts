/* =====================================================================
   THE FIVE THINGS A STATE FILES BESIDE THE OCCURRENCE CATEGORY.

   cictt.ts answers WHAT HAPPENED — runway excursion, loss of control,
   birdstrike. It is the headline and it is not the record. An authority
   receiving an occurrence also files how badly it hurt somebody, what it
   did to the aircraft, whether it was dark, whether the crew could see,
   and what kind of flight it was. Those five turn a category into
   something that can be counted against a denominator.

   WHY THAT MATTERS HERE RATHER THAN AS A NICETY. "Eleven runway
   excursions" is a number nobody can act on. "Eleven runway excursions,
   nine of them at night, seven on non-scheduled sectors, two with
   substantial damage" is a finding with a control attached to it — and
   the difference between the two sentences is entirely these columns.
   Annex 19's safety data analysis, and Doc 10159's pipeline from data to
   decision, both assume the denominators exist. Free text cannot supply
   them; neither can their absence.

   HERE AND NOT ON THE REPORT FORM, which is the same line cictt.ts
   draws and for the same reason. Coding to ADREP is a trained judgement
   made after reading the narrative. A reporter at a remote strip has not
   made it, must not be asked to, and would be guessing — and a guess in
   one of these columns is worse than a null, because a null is visibly
   missing and a guess is silently counted. So all five are written from
   the triage panel by somebody holding `report.triage`, exactly as the
   occurrence categories are.

   ONE VALUE EACH, AND THAT IS THE DIFFERENCE FROM CICTT. The occurrence
   categories are an array because the taxonomy says a runway excursion
   that became a loss of control is BOTH. These are not: an occurrence
   has one worst injury, one worst damage state, one light condition, one
   meteorological condition, one type of operation. Where two would be
   arguable — a flight that changed operation type mid-sector — the
   convention every reporting system uses is the state at the time of the
   occurrence, and that is one value.

   NULL IS NOT "UNKNOWN", AND THE DISTINCTION IS LOAD-BEARING. Null means
   nobody has coded this yet. UNKNOWN means somebody trained looked at
   the narrative and could not determine it. A dashboard that conflates
   them reports an un-triaged backlog as a determination, which is the
   same shape of lie as a screen saying "your training is fine" about
   training it could not read. Every vocabulary here therefore carries an
   explicit UNKNOWN and the column stays nullable.

   ============================================================
   WHAT IS VERIFIED HERE AND WHAT IS NOT. READ THIS BEFORE TRUSTING IT.

   The injury and damage vocabularies below follow ICAO Annex 13's
   definitions, and the light, meteorological and operation vocabularies
   follow the ADREP taxonomy as EASA maintains it in ECCAIRS. NONE OF
   THEM WAS READ AGAINST THE PRIMARY INSTRUMENT. They were compiled from
   secondary sources — SKYbrary's taxonomy pages, State accident
   investigation bodies quoting Annex 13's Chapter 1 definitions, ICAO's
   own published safety reports, and search-level extracts of the
   Annex — and corroborated across several of them rather than read once.

   That is the same position cictt.ts is in, for the same cause: every
   primary host is refused at this environment's egress. It is recorded
   the same way rather than glossed, and the flag below says so.

   WHAT READING THE PRIMARY WOULD SETTLE. Annex 13 Chapter 1 gives
   "serious injury" a specific enumerated definition — hospitalisation
   beyond a stated period, particular fracture classes, haemorrhage and
   nerve damage, burns above a stated body-surface percentage, and
   exposure to infectious substances or harmful radiation. THOSE
   THRESHOLDS ARE NOT REPRODUCED BELOW, deliberately: a paraphrased
   threshold is what turns a borderline injury into a mis-coded
   occurrence, and the caveat sends the reader to the document instead.
   The same applies to "substantial damage", whose definition turns on
   adverse effect to structural strength, performance or flight
   characteristics — with an explicit list of exclusions that decides
   most real cases.

   The machine-readable form to check the other three against is the
   ECCAIRS Aviation Data Definition Standard.
   ===================================================================== */

/**
 * FALSE, and it means what it says.
 *
 * Set this true only after somebody has read Annex 13 Chapter 1 and the
 * ECCAIRS data definition standard and reconciled every value below
 * against them. Corroboration across secondary sources is better than
 * one summary; it is not the same thing, and this product does not get
 * to claim it is.
 */
export const ADREP_VERIFIED_AGAINST_PRIMARY = false;

export interface AdrepOption {
  /** The stored code. */
  readonly code: string;
  /** What the safety officer reads when choosing. */
  readonly label: string;
  /** One line on when this value is the right one. Never a threshold. */
  readonly hint: string;
}

export interface AdrepField {
  /** The column this writes, and the key in the route payload. */
  readonly key: AdrepKey;
  /** The question, as a person would ask it. */
  readonly question: string;
  /** Where the vocabulary comes from, shown beside the question. */
  readonly source: string;
  readonly options: ReadonlyArray<AdrepOption>;
}

export type AdrepKey =
  | "injuryLevel"
  | "aircraftDamage"
  | "lightCondition"
  | "metCondition"
  | "operationType";

/**
 * THE WORST INJURY ANYBODY SUSTAINED, not a count of the injured.
 *
 * Annex 13's accident definition turns on whether any person was
 * fatally or seriously injured, so the field that answers it is the
 * maximum rather than a tally. A tally is a different column and this
 * product does not have it; recording "3" here and losing whether they
 * were scratches or fatalities would be the worse of the two mistakes.
 *
 * FATAL follows the Annex's statistical convention — death within thirty
 * days of the occurrence — and the convention is named in the hint
 * because a death on day thirty-five is coded differently from a death
 * on day twenty-nine and nothing else on the screen would say so.
 */
export const INJURY_LEVELS: ReadonlyArray<AdrepOption> = Object.freeze([
  { code: "NONE", label: "None", hint: "Nobody was hurt." },
  {
    code: "MINOR",
    label: "Minor",
    hint: "Somebody was hurt, below Annex 13's serious-injury definition.",
  },
  {
    code: "SERIOUS",
    label: "Serious",
    hint: "Meets Annex 13's enumerated serious-injury definition — read it before coding this.",
  },
  {
    code: "FATAL",
    label: "Fatal",
    hint: "A death within thirty days of the occurrence, which is Annex 13's counting convention.",
  },
  {
    code: "UNKNOWN",
    label: "Not determined",
    hint: "Looked at and could not be established — which is not the same as not yet looked at.",
  },
]);

/**
 * WHAT IT DID TO THE AIRCRAFT.
 *
 * SUBSTANTIAL is the value that decides whether an occurrence is an
 * Annex 13 accident when nobody was hurt, and its definition carries an
 * explicit exclusion list — a failed single engine, a propeller, a wing
 * tip, an antenna, a tyre, a brake, a small skin dent. Those exclusions
 * decide most real cases and they are not reproduced here, because a
 * half-remembered exclusion list is how a substantial-damage event gets
 * coded MINOR by somebody being conscientious.
 */
export const AIRCRAFT_DAMAGE_LEVELS: ReadonlyArray<AdrepOption> = Object.freeze([
  { code: "NONE", label: "None", hint: "No damage to the aircraft." },
  {
    code: "MINOR",
    label: "Minor",
    hint: "Damage that Annex 13's exclusion list keeps out of 'substantial'.",
  },
  {
    code: "SUBSTANTIAL",
    label: "Substantial",
    hint: "Adversely affects structural strength, performance or flight characteristics — read the exclusions.",
  },
  {
    code: "DESTROYED",
    label: "Destroyed",
    hint: "Beyond repair, or the aircraft is missing and inaccessible.",
  },
  {
    code: "UNKNOWN",
    label: "Not determined",
    hint: "Looked at and could not be established.",
  },
]);

/**
 * LIGHT AT THE TIME, AND IT IS NOT A PROXY FOR THE CLOCK.
 *
 * An occurrence at 18:40 is daylight in June at Lodwar and night in June
 * at a strip further south, and the timestamp already stored cannot
 * answer it without a sunrise table this product does not carry and
 * should not invent. So it is coded rather than derived — the same
 * judgement charter rule 6 forbids storing where it CAN be computed, and
 * this one cannot.
 */
export const LIGHT_CONDITIONS: ReadonlyArray<AdrepOption> = Object.freeze([
  { code: "DAYLIGHT", label: "Daylight", hint: "Between sunrise and sunset." },
  {
    code: "TWILIGHT",
    label: "Twilight",
    hint: "Dawn or dusk — the transition either side of daylight.",
  },
  { code: "NIGHT", label: "Night", hint: "Between the end of dusk and the start of dawn." },
  {
    code: "UNKNOWN",
    label: "Not determined",
    hint: "Looked at and could not be established.",
  },
]);

/**
 * WHAT THE CREW COULD SEE.
 *
 * VMC and IMC are defined by visibility, distance from cloud and ceiling
 * against published minima, and the minima differ by airspace class and
 * altitude — so this records which side of them the flight was on, not
 * the figures. Paired with light condition it is the dimension that
 * makes CFIT and UIMC numbers mean anything: an unintended entry into
 * IMC at night is a different event from the same category in daylight.
 */
export const MET_CONDITIONS: ReadonlyArray<AdrepOption> = Object.freeze([
  {
    code: "VMC",
    label: "VMC — visual",
    hint: "Visibility, cloud distance and ceiling at or better than the published minima.",
  },
  {
    code: "IMC",
    label: "IMC — instrument",
    hint: "Below the minima specified for VMC.",
  },
  {
    code: "UNKNOWN",
    label: "Not determined",
    hint: "Looked at and could not be established.",
  },
]);

/**
 * WHAT KIND OF FLIGHT IT WAS — the denominator nothing else supplies.
 *
 * IATA's 2025 figures put most AFI accidents on turboprops, and this
 * product's aircraft list is weighted accordingly; but type tells you
 * what was flying and not what it was doing. A Caravan on a scheduled
 * sector, a Caravan on a charter and a Caravan on a survey flight carry
 * different exposures, different crews and different pressures, and
 * without this column all three are one line in every count.
 *
 * TRIMMED FROM ADREP'S FULL TREE, which distinguishes international from
 * domestic and passenger from cargo below the scheduled/non-scheduled
 * split. That detail is real and this product does not carry it yet:
 * offering seven half-remembered leaf codes would produce data that
 * looks like ADREP and does not reconcile with it. These are the parent
 * categories, coded correctly, and the finer split is a change with a
 * customer behind it rather than a guess ahead of one.
 */
export const OPERATION_TYPES: ReadonlyArray<AdrepOption> = Object.freeze([
  {
    code: "CAT_SCHEDULED",
    label: "Commercial air transport — scheduled",
    hint: "A published timetable, or a series regular enough to be one, open to public booking.",
  },
  {
    code: "CAT_NON_SCHEDULED",
    label: "Commercial air transport — non-scheduled",
    hint: "Charter and special flights for remuneration outside a timetable.",
  },
  {
    code: "AERIAL_WORK",
    label: "Aerial work",
    hint: "The flight is the job — survey, patrol, spraying, search, photography.",
  },
  {
    code: "TRAINING",
    label: "Flight instruction or training",
    hint: "Instructional flight, checking or a training detail.",
  },
  {
    code: "GENERAL_AVIATION",
    label: "General aviation",
    hint: "Private or corporate flying that is none of the above.",
  },
  {
    code: "STATE",
    label: "State flight",
    hint: "Military, customs, police or another State service.",
  },
  {
    code: "UNKNOWN",
    label: "Not determined",
    hint: "Looked at and could not be established.",
  },
]);

/**
 * THE FIVE, DECLARED ONCE.
 *
 * The route validates from this, the screen renders from this, and the
 * tests count this — so a sixth field is one entry rather than four
 * edits that can be made three of. The same reason the information
 * architecture is declared once and rendered into the header and the
 * footer.
 */
export const ADREP_FIELDS: ReadonlyArray<AdrepField> = Object.freeze([
  {
    key: "injuryLevel",
    question: "Worst injury to any person",
    source: "ICAO Annex 13",
    options: INJURY_LEVELS,
  },
  {
    key: "aircraftDamage",
    question: "Damage to the aircraft",
    source: "ICAO Annex 13",
    options: AIRCRAFT_DAMAGE_LEVELS,
  },
  {
    key: "lightCondition",
    question: "Light at the time",
    source: "ADREP / ECCAIRS",
    options: LIGHT_CONDITIONS,
  },
  {
    key: "metCondition",
    question: "Meteorological conditions",
    source: "ADREP / ECCAIRS",
    options: MET_CONDITIONS,
  },
  {
    key: "operationType",
    question: "Type of operation",
    source: "ADREP / ECCAIRS",
    options: OPERATION_TYPES,
  },
]);

const FIELD_BY_KEY = new Map(ADREP_FIELDS.map((f) => [f.key, f]));

/** The field for a key, or null. Never throws on unknown input. */
export function adrepField(key: string): AdrepField | null {
  return FIELD_BY_KEY.get(key as AdrepKey) ?? null;
}

/**
 * Whether a code is one this field accepts.
 *
 * UNLIKE THE AERODROME AND AIRCRAFT LISTS, THERE IS NO ESCAPE HATCH AND
 * THAT IS DELIBERATE. Those vocabularies are open-ended — the world
 * holds aerodromes this product has not listed, so a "not listed" option
 * is the honest answer. These five are closed: Annex 13 defines four
 * injury states and there is no fifth, and an occurrence is either in
 * VMC or in IMC. Free text here would not be an escape from an
 * incomplete list, it would be a refusal to make the determination —
 * which is what UNKNOWN is for, and UNKNOWN groups.
 */
export function isValidAdrepValue(key: string, code: string): boolean {
  const field = FIELD_BY_KEY.get(key as AdrepKey);
  if (!field) return false;
  return field.options.some((o) => o.code === code);
}

/** Resolve a stored code to its label, for display. */
export function adrepLabel(key: string, code: string | null | undefined): string {
  if (!code) return "Not yet coded";
  const field = FIELD_BY_KEY.get(key as AdrepKey);
  return field?.options.find((o) => o.code === code)?.label ?? code;
}

/**
 * HOW MUCH OF THE PICTURE EXISTS, counted rather than asserted.
 *
 * A safety office needs to know that eleven excursions have four coded
 * light conditions before it draws a conclusion about night operations
 * from them. This returns the count of fields actually determined —
 * UNKNOWN counts as coded, because somebody looked; null does not.
 */
export function adrepCompleteness(
  record: Partial<Record<AdrepKey, string | null | undefined>>,
): { coded: number; total: number } {
  const coded = ADREP_FIELDS.filter((f) => {
    const value = record[f.key];
    return typeof value === "string" && value.length > 0;
  }).length;
  return { coded, total: ADREP_FIELDS.length };
}

/**
 * The sentence shown wherever these five are offered.
 *
 * ONE DECLARATION, so the caveat cannot appear on the triage screen and
 * be forgotten on whatever reads these next — the same reason
 * CICTT_CAVEAT is a constant.
 */
export const ADREP_CAVEAT =
  "Injury and damage follow ICAO Annex 13; light, meteorological conditions and type " +
  "of operation follow the ADREP taxonomy EASA maintains as ECCAIRS. This product " +
  "carries the values and their names, NOT the definitions that decide a borderline " +
  "case — Annex 13 enumerates what makes an injury serious and what excludes damage " +
  "from substantial, and those thresholds are in the document rather than paraphrased " +
  "here. Where the narrative does not settle it, code it as not determined rather " +
  "than choosing the likeliest value.";
