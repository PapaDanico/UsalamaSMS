/* =====================================================================
   HOW A HAZARD WAS FOUND, which is a thing the record could not say.

   ICAO Annex 19 and Doc 9859 do not ask a service provider to identify
   hazards. They ask for a formal process "based on a COMBINATION of
   reactive, proactive and predictive methods of safety data
   collection". The word doing the work is combination: an operator that
   finds every hazard the same way has a process, and not the one the
   instrument describes.

   WHAT THIS PRODUCT COULD SHOW BEFORE THIS MODULE. `Hazard.source` is
   set to exactly two values, in routes.register.ts:

       source: e.fromReportId ? "REPORT" : "REGISTER"

   — "arrived on an occurrence report" against "somebody typed it in".
   That distinction is a real one and it answers a real question (what
   proportion of the register came from the operator's own people), but
   it is NOT the instrument's. REGISTER collapses a hazard found in a
   workshop, one raised by an audit finding, one noticed in an indicator
   trend and one identified while assessing a change — four different
   methods, two of them proactive and one predictive — into a single
   bucket meaning "not a report".

   So an operator asked at an audit to evidence its combination of the
   three could show reported against typed, and nothing else. The
   product held the hazards and could not answer the question the
   hazards exist to answer.

   ---------------------------------------------------------------
   WHAT IS AND IS NOT ASSERTED HERE.

   The three methods are the instrument's own division and are quoted
   above. What is NOT the instrument's is which of this product's
   surfaces belongs to which method — ICAO names methods, not features,
   and mapping a feature to a method is this product's judgement. Every
   route below therefore carries `why`, so the mapping is arguable
   rather than asserted, and an auditor who disagrees can see what was
   claimed and on what basis.

   AND UNKNOWN IS A VALUE. A hazard recorded before this existed, or
   typed by somebody who did not say where it came from, has an unknown
   method — not a proactive one. Backfilling those to PROACTIVE would
   have manufactured exactly the evidence the operator is being asked
   for, which is worse than having none.

   ---------------------------------------------------------------
   THE MAPPING, AND THE ARGUMENT FOR EACH ROW.

   This lives here rather than as a `why` field on every route, and the
   reason is measurable: the field was ~700 bytes shipped to every
   browser that opens the register, and NO SCREEN RENDERED IT. It is
   read by a developer or an auditor looking at the source, which is
   where it now is. `check:claims` asserts this table names every route.

     REPORT     REACTIVE    Somebody filed it because something
                            happened. That is the definition.
     AUDIT      PROACTIVE   An audit looks for what has not gone wrong
                            yet, which is what makes it proactive.
     WORKSHOP   PROACTIVE   Doc 9859 names brainstorming with a
                            cross-functional team as a hazard
                            identification technique. Nothing has
                            happened; people are asked what could.
     CHANGE     PROACTIVE   The change has not been made yet, so the
                            hazard is identified before the operation
                            it belongs to exists.
     INDICATOR  PREDICTIVE  Nothing happened and nobody looked for this
                            one: the system's own measurements moved,
                            and the hazard was inferred from movement.
     BARRIER    PREDICTIVE  A barrier this operator relies on is down.
                            The hazard is what that exposes, identified
                            from the state of the defences rather than
                            from an event.
   ===================================================================== */

/**
 * The three methods, in the instrument's own words.
 *
 * Quoted rather than paraphrased, because the whole point of this
 * module is that the operator is being measured against the
 * instrument's division and not against one this product invented.
 */
export type DiscoveryMethod = "REACTIVE" | "PROACTIVE" | "PREDICTIVE";

export interface MethodNote {
  readonly label: string;
  /** What the method is, in the words an auditor would recognise. */
  readonly means: string;
}

export const METHODS: Readonly<Record<DiscoveryMethod, MethodNote>> = Object.freeze({
  REACTIVE: Object.freeze({
    label: "Reactive",
    means:
      "Found because something already happened — an occurrence, an incident, " +
      "a report somebody filed.",
  }),
  PROACTIVE: Object.freeze({
    label: "Proactive",
    means:
      "Found by looking, before anything happened — an audit, a workshop, a " +
      "survey, an assessment of a change.",
  }),
  PREDICTIVE: Object.freeze({
    label: "Predictive",
    means:
      "Found by watching the system's own behaviour for where it is drifting — " +
      "indicator trends, degraded defences.",
  }),
});

/**
 * A way this product actually lets a hazard be found.
 *
 * `where` is the surface an operator uses, and it is why this list is
 * short: a route named here that no screen offers would be the
 * capability-with-no-surface defect check:claims already catches one
 * layer down.
 */
export interface DiscoveryRoute {
  readonly key: string;
  readonly method: DiscoveryMethod;
  readonly label: string;
  /** The screen it comes from, or null when it is recorded by hand. */
  readonly where: string | null;
}

export const ROUTES: readonly DiscoveryRoute[] = Object.freeze([
  Object.freeze({
    key: "REPORT",
    method: "REACTIVE" as const,
    label: "An occurrence report",
    where: "/triage",
  }),
  Object.freeze({
    key: "AUDIT",
    method: "PROACTIVE" as const,
    label: "An internal audit finding",
    where: "/sms",
  }),
  Object.freeze({
    key: "WORKSHOP",
    method: "PROACTIVE" as const,
    label: "A hazard identification workshop",
    where: null,
  }),
  Object.freeze({
    key: "CHANGE",
    method: "PROACTIVE" as const,
    label: "Assessing a change",
    where: "/sms",
  }),
  Object.freeze({
    key: "INDICATOR",
    method: "PREDICTIVE" as const,
    label: "An indicator trend",
    where: "/toolkits/spi",
  }),
  Object.freeze({
    key: "BARRIER",
    method: "PREDICTIVE" as const,
    label: "A degraded defence",
    where: "/picture",
  }),
]);

const BY_KEY: ReadonlyMap<string, DiscoveryRoute> = new Map(ROUTES.map((r) => [r.key, r]));

/**
 * The accepted keys, as a tuple a validator can be built from.
 *
 * DERIVED FROM ROUTES rather than typed beside it, so a route added
 * above is accepted by the API in the same commit. The alternative is
 * the shape charter rule 10 forbids: a list about the code, maintained
 * by hand next to the code it describes.
 */
export const DISCOVERY_KEYS = ROUTES.map((r) => r.key) as unknown as
  readonly [string, ...string[]];

/**
 * The method a stored discovery key belongs to, or null when unknown.
 *
 * NULL IS NOT A FAILURE AND MUST NOT BE COERCED. `Hazard.source` held
 * "REGISTER" for everything that was not a report, and "REGISTER" says
 * only that somebody typed it — which is true of a workshop finding and
 * of a note somebody made in a meeting alike. Mapping it to PROACTIVE
 * would manufacture the evidence the operator is being asked to
 * produce.
 */
export function methodOf(key: string | null | undefined): DiscoveryMethod | null {
  if (!key) return null;
  return BY_KEY.get(key)?.method ?? null;
}

export interface MethodBalance {
  readonly counts: Readonly<Record<DiscoveryMethod, number>>;
  /** Hazards whose method nobody recorded. */
  readonly unknown: number;
  /** Methods with no hazard against them at all. */
  readonly missing: readonly DiscoveryMethod[];
  readonly total: number;
}

/**
 * What the operator can evidence, and what it cannot.
 *
 * `missing` IS THE POINT, and the reason this returns more than counts.
 * A regulator's question is not "how many hazards" but "show me the
 * combination", and a bar chart with one bar answers it in the negative
 * without saying so. Naming the empty methods states the position the
 * operator is actually in.
 */
export function balance(keys: readonly (string | null | undefined)[]): MethodBalance {
  const counts: Record<DiscoveryMethod, number> = { REACTIVE: 0, PROACTIVE: 0, PREDICTIVE: 0 };
  let unknown = 0;
  for (const k of keys) {
    const m = methodOf(k);
    if (m) counts[m] += 1;
    else unknown += 1;
  }
  const missing = (Object.keys(counts) as DiscoveryMethod[]).filter((m) => counts[m] === 0);
  return {
    counts: Object.freeze(counts),
    unknown,
    missing: Object.freeze(missing),
    total: keys.length,
  };
}

/**
 * Whether the register evidences the combination the instrument asks
 * for.
 *
 * THIS READ `b.total > 0 && b.missing.length === 0` AND THE FIRST CLAUSE
 * COULD NEVER FIRE. Its mutation was written to prove that an empty
 * register does not vacuously satisfy the requirement — the empty-set
 * trap this repository keeps meeting — and deleting the clause left the
 * suite GREEN. An empty register has every count at zero, so `missing`
 * already lists all three methods and the second clause has decided it.
 *
 * The clause was removed rather than kept as belt-and-braces, because a
 * condition that looks load-bearing and cannot execute is the same
 * defect as a gate that cannot fail, one layer down: the next reader
 * treats it as the thing protecting them.
 *
 * THE PROPERTY IS STILL ASSERTED — tests/discovery.test.ts checks that
 * `balance([])` reports all three missing, and emptying `missing`
 * reddens three tests — it is just carried by `missing` rather than by
 * a count nobody reaches.
 */
export function evidencesCombination(b: MethodBalance): boolean {
  return b.missing.length === 0;
}
