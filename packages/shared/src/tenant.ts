/* =====================================================================
   WHAT AN OPERATOR MAY CHANGE, AND WHAT IT MAY NEVER.

   Every operator using this product currently gets the same aerodromes,
   the same aircraft types, the same post titles and the same words on
   the risk matrix. That is wrong in an ordinary way: a six-aircraft
   Kenyan AOC does not fly to the strips in this file's default list,
   and its accountable executive is called whatever its own manual calls
   them. Every incumbent lets an operator set these without a vendor
   change order, and the benchmark is right that it should.

   THAT IS NOT THE INTERESTING QUESTION. The interesting question is
   what must NEVER be configurable, and it has to be answered
   structurally rather than left to whoever builds the settings screen.

   ---------------------------------------------------------------
   THE LINE.

   PREFERENCE — the operator's own vocabulary and estate. Configurable:

     · the aerodromes it operates to;
     · the aircraft types it operates;
     · what it calls each post on its own org chart;
     · what its manual calls each point on the severity and likelihood
       scales;
     · how long its own review cycle is by default.

   LAW AND FRAMEWORK — not the operator's to decide. Never configurable:

     · the reporting deadlines. They come from the instrument, computed
       per jurisdiction and per occurrence class. An operator that could
       set its own MOR deadline has bought a compliance tool that cannot
       be relied on for compliance;
     · the risk ARITHMETIC and the tolerability bands. Doc 9859's 5x5,
       computed on every read and never stored, so an entry cannot carry
       a band that disagrees with the scale;
     · de-identification. A safeguard an operator can weaken is not a
       safeguard, and L.N. 32's Third Schedule names it;
     · the audit chain;
     · what the twelve Annex 19 elements mean, and what evidence each
       one asks for;
     · the report state machine.

   ---------------------------------------------------------------
   HOW THE LINE IS HELD, rather than merely stated.

   A LABEL MAP IS KEYED BY THE FRAMEWORK'S OWN KEYS, and unknown keys
   are DROPPED. That single decision is what makes the scales
   relabellable and not redefinable: an operator can call
   `A_CATASTROPHIC` whatever its manual calls it, and cannot add a sixth
   severity, cannot reorder the five, and cannot change what A x 5
   scores. The configuration is a rename, structurally — there is no
   representation in it for anything else.

   Compare the shape that would have been easy and wrong: storing the
   scale itself as rows. Then a tenant with four severities produces a
   4x5 matrix, `tolerability()` indexes past the end, and the honest
   answer to "what band is this" becomes "it depends whose database you
   are reading". The arithmetic is the product's central claim and it
   only holds if it is the same arithmetic everywhere.

   NOTHING IN THIS FILE READS A DEADLINE, A BAND OR AN ELEMENT. A claims
   gate asserts that, over this module's field names and over the Prisma
   model behind it, because the way this line gets crossed is not
   somebody deciding to cross it — it is a settings screen growing one
   more field that seemed harmless.
   ===================================================================== */

import { SEVERITY_SCALE, LIKELIHOOD_SCALE, type Severity, type Likelihood, type Tolerability } from "./risk";
import { SAFETY_ROLES } from "./posts";

/** Bounds, so a tenant cannot write an unbounded document. */
export const MAX_LABEL = 60;
export const MAX_LIST = 200;
export const MAX_ITEM = 80;

/**
 * An operator's own vocabulary and estate.
 *
 * EVERY FIELD IS OPTIONAL AND EVERY FIELD IS A PREFERENCE. Absent means
 * "use what the product ships", never "this operator has none" — the
 * distinction the emergency contact directory gets wrong at its peril
 * and this does not, because there is no state here where absence is a
 * finding.
 */
export interface TenantConfig {
  /** Renames for the five severity points. Keyed by the framework's keys. */
  readonly severityLabels?: Readonly<Partial<Record<Severity, string>>>;
  /** Renames for the five likelihood points. */
  readonly likelihoodLabels?: Readonly<Partial<Record<Likelihood, string>>>;
  /** What this operator calls each post on its own org chart. */
  readonly postTitles?: Readonly<Record<string, string>>;
  /** Strips and aerodromes this operator actually flies to. */
  readonly aerodromes?: ReadonlyArray<string>;
  /** The fleet. */
  readonly aircraftTypes?: ReadonlyArray<string>;
  /** The operator's own default review cycle, in days. */
  readonly reviewDefaultDays?: number;
  /**
   * WHICH POST MAY DECIDE A GIVEN TOLERABILITY BAND.
   *
   * The one field here that is not a preference. L.N. 32, paragraph
   * 1.2.1(e), obliges a service provider to "define the levels of
   * management with authority to make decisions regarding safety risk
   * tolerability" — so this is an OBLIGATION the operator discharges,
   * and the reason it belongs in tenant configuration rather than in
   * permissions.ts is that the regulation assigns the decision to them
   * and not to us.
   *
   * Until this existed the product answered it for every operator
   * through a fixed role permission. That answer was defensible and it
   * was still the wrong party's answer: an auditor asking to see the
   * operator's own definition had nothing to be shown, because the
   * operator had never made one.
   *
   * NAMED AFTER THE LEVELS, NOT AFTER THE BAND, and a build gate is
   * why. It was `tolerabilityAuthority` first, and check-claims refused
   * it: no tenant-configurable field may be named after a tolerability
   * band, a deadline, an element or a chain, because an operator who
   * can edit what those MEAN has bought a compliance tool that cannot
   * be relied on for compliance.
   *
   * The gate was right and the name was wrong. L.N. 32's own subject is
   * "the LEVELS OF MANAGEMENT with authority to make decisions
   * regarding safety risk tolerability" — the thing an operator
   * declares is the levels. The band is what the levels have authority
   * over, and it stays Doc 9859's. Renaming to the instrument's own
   * noun made the field more accurate, not merely permitted.
   *
   * INTOLERABLE IS NEVER A KEY. normaliseConfig drops it, and the
   * reason is the same one that deleted `risk.accept.intolerable` from
   * the permission union: Doc 9859's red band is not "acceptable with
   * a sufficiently senior signature", it is not acceptable at any
   * level of benefit. A field that could name somebody with authority
   * over it is an invitation to believe otherwise, and this product
   * has already removed one of those.
   */
  readonly decisionLevels?: Readonly<Partial<Record<Tolerability, string>>>;
}

/**
 * The keys a label map may carry. Anything else is dropped.
 *
 * EXPORTED SO THE GATE CAN READ THEM, and derived from the scales
 * themselves rather than retyped — a second list of severity keys is a
 * second list that goes stale the day a scale changes.
 */
export const SEVERITY_KEYS: ReadonlyArray<string> = SEVERITY_SCALE.map((p) => p.key);
export const LIKELIHOOD_KEYS: ReadonlyArray<string> = LIKELIHOOD_SCALE.map((p) => p.key);
export const POST_CODES: ReadonlyArray<string> = SAFETY_ROLES.map((r) => r.code);

function cleanLabels(
  raw: unknown,
  allowed: ReadonlyArray<string>,
): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const key of allowed) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim().slice(0, MAX_LABEL);
    /* An empty rename is not a rename. Storing "" would render a blank
       where a severity should be, which is worse than the default. */
    if (trimmed) out[key] = trimmed;
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanList(raw: unknown): ReadonlyArray<string> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().slice(0, MAX_ITEM);
    if (trimmed) seen.add(trimmed);
    if (seen.size >= MAX_LIST) break;
  }
  return seen.size ? [...seen] : undefined;
}

/**
 * Everything an operator submitted, reduced to what it is allowed to say.
 *
 * THE DROP IS SILENT AND THAT IS DELIBERATE HERE, unlike the occurrence
 * codes next door which report what they did not recognise. The
 * difference is what an unknown key MEANS in each case. An unknown
 * CICTT code is probably a real category this build has not got yet, so
 * refusing it would lose a legitimate classification. An unknown
 * severity key cannot be a real severity — the five are the framework's,
 * not this build's — so it is either a typo or an attempt to add a
 * point to the scale, and neither should round-trip.
 */
/**
 * The bands a post may be named against — TOLERABLE and ACCEPTABLE,
 * and never INTOLERABLE.
 *
 * Derived as "every band except the red one" rather than typed as a
 * two-item list, so adding a band to the scale cannot silently leave
 * this one behind.
 */
export const ASSIGNABLE_BANDS: ReadonlyArray<Tolerability> = Object.freeze(
  (["INTOLERABLE", "TOLERABLE", "ACCEPTABLE"] as const).filter((b) => b !== "INTOLERABLE"),
);

/** Keeps the bands a post may hold, against the posts that exist. */
function cleanAuthority(raw: unknown): TenantConfig["decisionLevels"] {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: Partial<Record<Tolerability, string>> = {};
  for (const band of ASSIGNABLE_BANDS) {
    const post = r[band];
    /* The post must be one this product knows. An operator renames its
       posts through `postTitles`; it does not invent new ones here, and
       a code nothing recognises would name an authority nobody holds. */
    if (typeof post === "string" && POST_CODES.includes(post)) out[band] = post;
  }
  return Object.keys(out).length ? Object.freeze(out) : undefined;
}

export function normaliseConfig(raw: unknown): TenantConfig {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;

  const days = Number(r.reviewDefaultDays);
  return {
    severityLabels: cleanLabels(r.severityLabels, SEVERITY_KEYS),
    likelihoodLabels: cleanLabels(r.likelihoodLabels, LIKELIHOOD_KEYS),
    postTitles: cleanLabels(r.postTitles, POST_CODES),
    aerodromes: cleanList(r.aerodromes),
    aircraftTypes: cleanList(r.aircraftTypes),
    /* Bounded to something a review cycle can plausibly be. A zero-day
       cycle marks everything overdue on creation; a ten-year one is a
       review that never happens, dressed as one that does. */
    reviewDefaultDays: Number.isFinite(days) && days >= 1 && days <= 1825 ? Math.round(days) : undefined,
    decisionLevels: cleanAuthority(r.decisionLevels),
  };
}

/**
 * The severity scale as THIS operator words it.
 *
 * RETURNS THE SAME FIVE POINTS IN THE SAME ORDER, ALWAYS. Only `label`
 * can differ, and `key` and `code` never do — they are what
 * `tolerability()` indexes and what a stored assessment carries, so an
 * operator's renaming cannot change the band an old entry grades to,
 * and two operators' registers stay comparable to a regulator reading
 * both.
 */
export function severityScaleFor(config: TenantConfig | null | undefined) {
  const labels = config?.severityLabels ?? {};
  return SEVERITY_SCALE.map((p) => ({ ...p, label: labels[p.key] ?? p.label }));
}

export function likelihoodScaleFor(config: TenantConfig | null | undefined) {
  const labels = config?.likelihoodLabels ?? {};
  return LIKELIHOOD_SCALE.map((p) => ({ ...p, label: labels[p.key] ?? p.label }));
}

/** The operator's own title for each post, falling back to the default. */
export function postsFor(config: TenantConfig | null | undefined) {
  const titles = config?.postTitles ?? {};
  return SAFETY_ROLES.map((r) => ({ ...r, label: titles[r.code] ?? r.label }));
}

/**
 * The operator's own entries ADDED to what the product ships, never
 * replacing them.
 *
 * A union rather than an override, for the reason the triage merge
 * learned the hard way: replacing a shipped list with a tenant's means
 * an operator who adds one strip loses every other aerodrome from their
 * dropdown, and the first symptom is a reporter unable to say where
 * something happened. Additive is the safe direction, and the escape
 * hatch for "not listed" already exists on every one of these fields.
 */
export function withTenantOptions<T extends { code: string; label: string }>(
  shipped: ReadonlyArray<T>,
  extra: ReadonlyArray<string> | undefined,
): ReadonlyArray<{ code: string; label: string }> {
  const out: Array<{ code: string; label: string }> = shipped.map((o) => ({
    code: o.code,
    label: o.label,
  }));
  const known = new Set(out.map((o) => o.label.toLowerCase()));
  for (const item of extra ?? []) {
    if (known.has(item.toLowerCase())) continue;
    known.add(item.toLowerCase());
    out.push({ code: item, label: item });
  }
  return out;
}
