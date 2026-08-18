/* =====================================================================
   THE OPERATOR'S OWN RECORD, STUBBED, so the accessibility sweep can
   reach it.

   `check:a11y` rendered thirty-two screens SIGNED OUT and reported no
   violations, and that reads like the product is clean. Measured on
   18 August 2026, signed-out against signed-in node counts under
   `main *`:

     /sms              39 -> 522   (+483)
     /account          44 ->  98    (+54)
     /admin             5 ->  40    (+35)
     /account/profile   6 ->  32    (+26)
     /account/team      5 ->  21    (+16)

   Five hundred and eighty nodes of the record a safety manager works in
   every day, never once swept. That is not a theoretical gap: the 4.44
   contrast failure fixed this week was caught on /triage ONLY because
   that one zero-state happens to render signed out, and /fatigue's
   IDENTICAL link was invisible to the sweep for exactly this reason.

   WHY STUBS RATHER THAN A REAL API. The sweep runs against the built
   bundle and nothing else — no Postgres, no Fastify, no seed. Making it
   need those would move it out of `npm run verify` and into the
   integration suite, where it would run against a database instead of
   against the thing a browser loads.

   AND WHY A GROWTH GUARD IS NOT OPTIONAL. A stub whose shape is wrong
   renders an error state or nothing at all — the screen gets SMALLER,
   the sweep still says "ok", and the result is a gate reporting
   sixty-four screens while checking thirty-two. That is the exact
   failure this repository keeps meeting, so `MUST_GROW` below names
   every route whose signed-in render has to be strictly larger, and the
   gate fails naming the route when one is not.

   Three of them were measured SHRINKING under a bare `{}` — /today
   23->19, /fatigue 5->2, /picture 24->5 — which is how the shapes below
   were found rather than guessed.
   ===================================================================== */

/* One org, one person, enough record to render. Values are deliberately
   ordinary: a fixture with "Test Test" in it renders a width nothing
   real ever has, and column-width violations hide behind that. */
const ISO = "2026-08-18T05:00:00.000Z";

const DIGEST = {
  digest: {
    items: [
      { kind: "DEADLINE", urgency: "NOW", count: 1, soonestDays: 0 },
      { kind: "UNTRIAGED", urgency: "TODAY", count: 3, soonestDays: null },
      { kind: "CURRENCY", urgency: "SOON", count: 2, soonestDays: 21 },
      { kind: "ACTION_OVERDUE", urgency: "TODAY", count: 1, soonestDays: 4 },
    ],
    urgency: "NOW",
  },
  /* An operator well past day one. Without this the screen sees no
     scale at all and falls back to the pre-first-run behaviour, which
     is exactly what check:first-run must not be able to pass against. */
  scale: { reports: 7, indicators: 2, registerEntries: 4 },
  wouldSend: true,
  delivery: "NOT_CONFIGURED",
  computedAt: ISO,
};

const FATIGUE = {
  declared: true,
  limits: {
    maxFlightTimeHours: 8, maxDutyHours: 12, minRestHours: 10,
    maxFlightTime7DaysHours: 34, instrument: "OM-A 7.1", declaredOn: ISO,
  },
  caveat: "Compared against the figures this operator declared.",
  counts: { withinDeclared: 4, exceededDeclared: 1, incomplete: 2, impairmentReported: 3 },
  total: 7,
  truncated: false,
  reports: [
    { id: "f1", createdAt: ISO, occurredAt: ISO, title: "Third sector in a row on the Kisumu rotation",
      verdict: "EXCEEDED_DECLARED", samnPerelli: 6, touchesWocl: true,
      flightTimeHours: 9.5, dutyHours: 13, restHours: 8,
      exceeded: ["Flight time 9.5 h against a declared 8 h"],
      factors: ["Duty touched the window of circadian low"] },
    { id: "f2", createdAt: ISO, occurredAt: ISO, title: "Night positioning to Wilson",
      verdict: "WITHIN_DECLARED", samnPerelli: 3, touchesWocl: true,
      flightTimeHours: 4, dutyHours: 9, restHours: 12,
      exceeded: [], factors: ["Duty touched the window of circadian low"] },
  ],
};

const QUEUE = {
  reports: [
    { id: "r1", clientId: "c1", type: "HAZARD", title: "Loose ground handling equipment on stand 4",
      occurredAt: ISO, createdAt: ISO, state: "SUBMITTED", serverUpdatedAt: ISO },
    { id: "r2", clientId: "c2", type: "OCCURRENCE", title: "Bird activity on short final, runway 14",
      occurredAt: ISO, createdAt: ISO, state: "TRIAGED", serverUpdatedAt: ISO },
  ],
};

const band = { ACCEPTABLE: 2, TOLERABLE: 1, INTOLERABLE: 1 };

const PICTURE = {
  window: { from: ISO, to: ISO, days: 90 },
  reporting: {
    count: 7, perMonth: 2.3, days: 90,
    queue: { by: { SUBMITTED: 2, TRIAGED: 1, INVESTIGATING: 1, CLOSED: 3, REOPENED: 0 } },
    queueScope: "all", trend: "FLAT",
    months: [{ month: "2026-06", count: 2 }, { month: "2026-07", count: 3 },
             { month: "2026-08", count: 2 }],
    closure: { median: 9, n: 3, p: 90, note: "Median over three closed reports." },
    closureTruncated: false,
    note: "Seven reports over ninety days.",
  },
  register: { open: { total: 4, by: band }, truncated: false, overdueReview: 1, holderGaps: [] },
  indicators: {
    total: 2,
    alerting: [{ id: "i1", name: "Ground handling damage rate",
                 headline: "above the alert level for two periods" }],
  },
  changes: { total: 1, inEffectUnreviewed: 1,
             titles: ["Adding a second Caravan to the Lodwar rotation"] },
  actions: {
    total: 3, outstanding: 2, overdue: 1, awaitingVerification: 1, undated: 0, truncated: false,
  },
  /* Every field barrierPanel() reads. `withheld` is a list of OBJECTS
     with a `source`, not of strings — it renders `w.source`, and a list
     of strings prints "undefined or undefined" rather than throwing,
     which is the quieter half of why this fixture is written from the
     component rather than from memory. */
  barriers: {
    total: 2, truncated: false, unattributed: 1, attribution: 0.5,
    kinds: { MITIGATION: "Mitigations", TRAINING: "Training currency" },
    byKind: { MITIGATION: 1, TRAINING: 1 },
    byHrc: [{ hrc: "LOC-I", count: 1 }],
    degraded: [
      { id: "b1", kind: "MITIGATION", what: "Stand 4 barrier line unmarked",
        daysLate: 12, hrcs: ["Runway safety"], ownerPost: "Safety Officer" },
      { id: "b2", kind: "TRAINING", what: "SMS refresher lapsed for one crew member",
        daysLate: null, hrcs: [], ownerPost: "Accountable Executive" },
    ],
    withheld: [],
  },
};

/* /picture fetches this SEPARATELY from /api/v1/picture — the counts
   come from the aggregate and the list from here, so a fixture for one
   and not the other renders the counts over an undefined list. Found by
   the growth guard, not by reading the screen. */
const ACTIONS = {
  truncated: false,
  summary: { total: 3, outstanding: 2, overdue: 1, awaitingVerification: 1, undated: 0 },
  actions: [
    { id: "a1", title: "Re-brief ground crew on equipment stowage after each turnaround",
      dueOn: ISO, state: "OPEN", owner: "Joseph Otieno", reportId: "r1",
      createdAt: ISO, overdue: true },
    { id: "a2", title: "Fit reflective markers to the stand 4 barrier line",
      dueOn: ISO, state: "DONE", owner: "Grace Mwende", riskId: "k1",
      createdAt: ISO, completionNote: "Markers fitted and photographed.", overdue: false },
  ],
};

/* Keyed longest-prefix-first, because /api/v1/fatigue/limits must not be
   served the /api/v1/fatigue body. */
export const FIXTURES = [
  ["/api/v1/auth/refresh", { accessToken: "a", refreshToken: "b", role: "SAFETY_MANAGER", orgId: "org-1" }],
  ["/api/v1/auth/me", { name: "Wanjiru Kamau", email: "sm@strip.test", role: "SAFETY_MANAGER", orgName: "Strip Air" }],
  ["/api/v1/reports/queue", QUEUE],
  ["/api/v1/fatigue/limits", { declared: true, instrument: "OM-A 7.1" }],
  ["/api/v1/fatigue", FATIGUE],
  ["/api/v1/picture", PICTURE],
  ["/api/v1/actions", ACTIONS],
  ["/api/v1/digest", DIGEST],
];

/* Every route whose signed-in render MUST be strictly larger than its
   signed-out one. Measured, not assumed — each number in the header
   above came from a probe run before any of this existed.

   A public screen renders the same either way and is correctly absent
   here. A route added to the product that reads the operator's record
   belongs in this list; leaving it out means its signed-in state is
   swept but nothing proves the sweep reached anything. */
export const MUST_GROW = new Set([
  "/sms", "/account", "/account/profile", "/account/team", "/admin",
  "/today", "/fatigue", "/picture", "/triage",
]);

export const SESSION = { role: "SAFETY_MANAGER", orgId: "org-1" };

export function bodyFor(url) {
  for (const [prefix, body] of FIXTURES) if (url.includes(prefix)) return body;
  return {};
}

/* =====================================================================
   THE SAME OPERATOR, ON DAY ONE. Signed in, org exists, not one record
   anywhere. check:first-run renders /today against this and against the
   populated set above, and asserts the two do not read the same.

   The populated fixtures deliberately do NOT double as this: an empty
   record is the state the screen could not see, so a gate that only
   ever renders a full one is a gate that would never have found it. */
export const EMPTY_RECORD = {
  scale: { reports: 0, indicators: 0, registerEntries: 0 },
  digest: { items: [], urgency: null },
};

export function emptyBodyFor(url) {
  if (url.includes("/api/v1/auth/refresh")) return bodyFor(url);
  if (url.includes("/api/v1/auth/me")) return bodyFor(url);
  if (url.includes("/api/v1/digest")) {
    return {
      digest: EMPTY_RECORD.digest,
      scale: EMPTY_RECORD.scale,
      wouldSend: false,
      delivery: "NOT_CONFIGURED",
      computedAt: "2026-08-18T05:00:00.000Z",
    };
  }
  return {};
}

/* An operator well past day one with genuinely nothing wrong. The
   all-clear is CORRECT here and must survive — a first-run rule that
   suppressed it would have replaced one wrong answer with another. */
export function clearBodyFor(url) {
  if (url.includes("/api/v1/digest")) {
    return {
      digest: { items: [], urgency: null },
      scale: { reports: 7, indicators: 2, registerEntries: 4 },
      wouldSend: false,
      delivery: "NOT_CONFIGURED",
      computedAt: "2026-08-18T05:00:00.000Z",
    };
  }
  return bodyFor(url);
}
