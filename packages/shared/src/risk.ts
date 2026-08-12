// =====================================================================
// The 5x5 risk matrix — pure, zod-free, and separately importable.
//
// Split out of index.ts for two reasons, one architectural and one
// measured.
//
// ARCHITECTURAL: this is the third safety-critical calculation in this
// codebase (with deident.ts and audit-material.ts) and, like both of
// them, it is pure. Pure safety-critical code lives in its own module
// so it can be reasoned about, tested and imported without dragging a
// validation library, a Prisma client or an environment behind it.
//
// MEASURED: index.ts imports zod, so a client that wanted only
// `tolerability()` was paying ~47 kB of schema machinery for a lookup
// in a Set. The Phase 0 page dropped from 63.8 kB to a fraction of it
// by importing here instead. The stated design target is a mid-range
// Android at a remote strip; that is not a rounding error there.
//
// index.ts re-exports everything below, so existing imports are
// unaffected.
// =====================================================================

export type Severity =
  | "A_CATASTROPHIC" | "B_HAZARDOUS" | "C_MAJOR" | "D_MINOR" | "E_NEGLIGIBLE";
export type Likelihood =
  | "FREQUENT" | "OCCASIONAL" | "REMOTE" | "IMPROBABLE" | "EXTREMELY_IMPROBABLE";
export type Tolerability = "INTOLERABLE" | "TOLERABLE" | "ACCEPTABLE";

// ICAO Doc 9859 (4th Ed.) 5x5 matrix. Deterministic, auditable.
export const SEVERITY_VALUE: Record<Severity, 1 | 2 | 3 | 4 | 5> = {
  A_CATASTROPHIC: 5, B_HAZARDOUS: 4, C_MAJOR: 3, D_MINOR: 2, E_NEGLIGIBLE: 1,
};
export const LIKELIHOOD_VALUE: Record<Likelihood, 1 | 2 | 3 | 4 | 5> = {
  FREQUENT: 5, OCCASIONAL: 4, REMOTE: 3, IMPROBABLE: 2, EXTREMELY_IMPROBABLE: 1,
};

/* ---------------------------------------------------------------
   The scale, named once.

   The matrix, the assessor, the register and the methodology page all
   render the same five severities and five likelihoods. Until this
   existed they each carried their own copy of the labels, which is
   four places for the wording of a safety scale to drift apart —
   and a register whose severity reads differently from the matrix it
   was scored against is a register an auditor stops trusting.

   `code` is the manual's own notation: a letter for severity, a digit
   for likelihood, so "3A" in a Doc 9859 citation lands on the same
   cell here.
   --------------------------------------------------------------- */
export interface ScalePoint<K> { readonly key: K; readonly code: string; readonly label: string }

export const SEVERITY_SCALE: ReadonlyArray<ScalePoint<Severity>> = [
  { key: "A_CATASTROPHIC", code: "A", label: "Catastrophic" },
  { key: "B_HAZARDOUS", code: "B", label: "Hazardous" },
  { key: "C_MAJOR", code: "C", label: "Major" },
  { key: "D_MINOR", code: "D", label: "Minor" },
  { key: "E_NEGLIGIBLE", code: "E", label: "Negligible" },
];

export const LIKELIHOOD_SCALE: ReadonlyArray<ScalePoint<Likelihood>> = [
  { key: "FREQUENT", code: "5", label: "Frequent" },
  { key: "OCCASIONAL", code: "4", label: "Occasional" },
  { key: "REMOTE", code: "3", label: "Remote" },
  { key: "IMPROBABLE", code: "2", label: "Improbable" },
  { key: "EXTREMELY_IMPROBABLE", code: "1", label: "Extremely improbable" },
];

/* ---------------------------------------------------------------
   AN UNRECOGNISED VALUE MUST NOT GRADE AS GREEN.

   Both functions used to index the lookup tables directly. Given a
   severity that is not on the scale — a corrupted store, a renamed
   enum, a hand-built payload — `SEVERITY_VALUE[sev]` is `undefined`,
   the key becomes "undefinedx3", that key is in neither the red set
   nor the amber one, and tolerability() returned **ACCEPTABLE**.
   riskScore() returned NaN beside it.

   So a malformed severity read as green: the flattering direction, on
   the one calculation in this product whose whole job is to refuse to
   flatter.

   It survived because every caller wrapped these in a try/catch and a
   test asserted the result was "not intolerable" — which was true, and
   true for the wrong reason. Nothing threw. The guards were guarding
   an exception that could not happen.

   They throw now. Every caller already has the catch, so the change
   converts a silent green into an explicit unknown at each of them.
   --------------------------------------------------------------- */
function valueOf(sev: Severity, lik: Likelihood): { s: number; l: number } {
  const s = SEVERITY_VALUE[sev];
  const l = LIKELIHOOD_VALUE[lik];
  if (s === undefined || l === undefined) {
    throw new RangeError(
      `not on the Doc 9859 scale: severity ${JSON.stringify(sev)}, ` +
        `likelihood ${JSON.stringify(lik)}`,
    );
  }
  return { s, l };
}

/** Risk index score = severity × likelihood (1..25). */
export function riskScore(sev: Severity, lik: Likelihood): number {
  const { s, l } = valueOf(sev, lik);
  return s * l;
}

/**
 * Tolerability per the Doc 9859 index matrix.
 *
 * The canonical red set is 5A, 5B, 5C, 4A, 4B, 3A in the manual's own
 * notation, where the digit is likelihood and the letter is severity.
 * Encoded explicitly, cell by cell, rather than as a threshold on the
 * product: the score alone cannot separate these cases (5x3 and 3x5 are
 * both 15, and only one of them is red), so any threshold rule is wrong
 * for at least one cell. An explicit set is also auditable against the
 * manual by someone holding the manual, which a threshold is not.
 */
const RED = new Set(["5x5", "5x4", "5x3", "4x5", "4x4", "3x5"]);
const AMBER = new Set(["5x2", "5x1", "4x3", "4x2", "3x4", "3x3", "2x5", "2x4", "1x5"]);
export function tolerability(sev: Severity, lik: Likelihood): Tolerability {
  const { s, l } = valueOf(sev, lik);
  const key = `${s}x${l}`;
  if (RED.has(key)) return "INTOLERABLE";
  if (AMBER.has(key)) return "TOLERABLE";
  return "ACCEPTABLE";
}

