/* ============================================================
   WHAT AN OPERATOR MAY CHANGE, AND WHAT IT MAY NEVER.

   Most of what is asserted here is about the SECOND half. The first is
   ordinary — a rename comes back as a rename — and the assertions that
   earn their place are the ones proving a tenant cannot reach past a
   label into the arithmetic, because that is the claim the whole
   product rests on: two operators' registers are comparable to a
   regulator holding both, and an entry cannot carry a band that
   disagrees with the scale.
   ============================================================ */
import { describe, it, expect } from "vitest";
import {
  normaliseConfig,
  severityScaleFor,
  likelihoodScaleFor,
  postsFor,
  withTenantOptions,
  SEVERITY_KEYS,
  LIKELIHOOD_KEYS,
  MAX_LABEL,
  ASSIGNABLE_BANDS,
  POST_CODES,
} from "../packages/shared/src/tenant";
import {
  SEVERITY_SCALE,
  LIKELIHOOD_SCALE,
  tolerability,
  riskScore,
} from "../packages/shared/src/risk";

describe("a rename is kept", () => {
  it("uses the operator's word and leaves the rest shipped", () => {
    const cfg = normaliseConfig({ severityLabels: { A_CATASTROPHIC: "Class 1 — Total loss" } });
    const scale = severityScaleFor(cfg);
    expect(scale[0]!.label).toBe("Class 1 — Total loss");
    expect(scale[1]!.label).toBe(SEVERITY_SCALE[1]!.label);
  });

  it("renames posts and likelihood points too", () => {
    const cfg = normaliseConfig({
      likelihoodLabels: { FREQUENT: "Weekly" },
      postTitles: { ACCOUNTABLE_EXECUTIVE: "Managing Director" },
    });
    expect(likelihoodScaleFor(cfg)[0]!.label).toBe("Weekly");
    expect(postsFor(cfg).find((p) => p.code === "ACCOUNTABLE_EXECUTIVE")?.label)
      .toBe("Managing Director");
  });

  it("falls back to the shipped words when there is no configuration at all", () => {
    for (const cfg of [null, undefined, {}]) {
      expect(severityScaleFor(cfg as never).map((p) => p.label))
        .toEqual(SEVERITY_SCALE.map((p) => p.label));
    }
  });
});

describe("THE SCALE IS RELABELLED, NEVER REDEFINED", () => {
  /* The single most important property in this file. If a tenant can
     add, remove or reorder a scale point, tolerability() indexes a
     matrix whose shape depends on whose database is being read, and
     "what band is this" stops having one answer. */
  it("keeps five points, in order, whatever is submitted", () => {
    const cfg = normaliseConfig({
      severityLabels: {
        A_CATASTROPHIC: "One",
        F_APOCALYPTIC: "Six",
        "": "Blank",
        __proto__: "nope",
      },
    });
    const scale = severityScaleFor(cfg);
    expect(scale).toHaveLength(SEVERITY_SCALE.length);
    expect(scale.map((p) => p.key)).toEqual(SEVERITY_SCALE.map((p) => p.key));
    expect(scale.map((p) => p.code)).toEqual(SEVERITY_SCALE.map((p) => p.code));
  });

  it("drops a key that is not on the scale rather than storing it", () => {
    const cfg = normaliseConfig({ severityLabels: { F_APOCALYPTIC: "Six" } });
    expect(cfg.severityLabels).toBeUndefined();
    expect(Object.keys(cfg.severityLabels ?? {})).not.toContain("F_APOCALYPTIC");
  });

  it("cannot change what a score or a band comes out as", () => {
    /* The arithmetic is asked the same question before and after a
       rename that touches every point on both scales. */
    const before = {
      score: riskScore("A_CATASTROPHIC", "FREQUENT"),
      band: tolerability("A_CATASTROPHIC", "FREQUENT"),
    };
    normaliseConfig({
      severityLabels: Object.fromEntries(SEVERITY_KEYS.map((k) => [k, "renamed"])),
      likelihoodLabels: Object.fromEntries(LIKELIHOOD_KEYS.map((k) => [k, "renamed"])),
    });
    expect(riskScore("A_CATASTROPHIC", "FREQUENT")).toBe(before.score);
    expect(tolerability("A_CATASTROPHIC", "FREQUENT")).toBe(before.band);
  });

  it("derives its allowed keys from the scales rather than a second list", () => {
    /* A hand-written key list is a second source of truth, and it goes
       stale the day a scale changes — at which point a tenant can name
       a point the matrix does not have. */
    expect(SEVERITY_KEYS).toEqual(SEVERITY_SCALE.map((p) => p.key));
    expect(LIKELIHOOD_KEYS).toEqual(LIKELIHOOD_SCALE.map((p) => p.key));
  });
});

describe("a tenant cannot say anything it is not allowed to say", () => {
  it("keeps no field that is not a preference", () => {
    const cfg = normaliseConfig({
      severityLabels: { A_CATASTROPHIC: "One" },
      // Everything below is law, not preference. None of it survives.
      reportingDeadlineHours: 999,
      tolerabilityBands: { INTOLERABLE: "fine, actually" },
      deIdentify: false,
      elementDefinitions: { "2.1": "whatever we like" },
      auditChain: "off",
      jurisdiction: "XX",
    });
    expect(Object.keys(cfg).filter((k) => cfg[k as keyof typeof cfg] !== undefined))
      .toEqual(["severityLabels"]);
  });

  it("refuses a review cycle that is not a review", () => {
    /* Zero marks everything overdue the moment it is created; ten years
       is a review that never happens wearing the clothes of one that
       does. */
    for (const bad of [0, -1, 99999, Number.NaN, "soon"]) {
      expect(normaliseConfig({ reviewDefaultDays: bad }).reviewDefaultDays).toBeUndefined();
    }
    expect(normaliseConfig({ reviewDefaultDays: 180 }).reviewDefaultDays).toBe(180);
  });

  it("bounds a label and a list rather than storing whatever arrives", () => {
    const long = "x".repeat(500);
    const cfg = normaliseConfig({
      severityLabels: { A_CATASTROPHIC: long },
      aerodromes: Array.from({ length: 900 }, (_, i) => `strip-${i}`),
    });
    expect(cfg.severityLabels?.A_CATASTROPHIC?.length).toBeLessThanOrEqual(MAX_LABEL);
    expect(cfg.aerodromes!.length).toBeLessThanOrEqual(200);
  });

  it("treats an empty rename as no rename, not as a blank label", () => {
    /* Storing "" would render nothing where a severity should be, which
       is worse than the default it replaced. */
    const cfg = normaliseConfig({ severityLabels: { A_CATASTROPHIC: "   " } });
    expect(cfg.severityLabels).toBeUndefined();
    expect(severityScaleFor(cfg)[0]!.label).toBe(SEVERITY_SCALE[0]!.label);
  });

  it("survives junk without throwing", () => {
    for (const junk of [null, undefined, 42, "config", [], { severityLabels: [] }]) {
      expect(() => normaliseConfig(junk)).not.toThrow();
    }
  });
});

describe("the operator's own list is ADDED, never substituted", () => {
  /* The triage merge learned this the hard way: replacing a shipped
     list with a tenant's means an operator who adds one strip loses
     every other aerodrome from a reporter's dropdown, and the first
     symptom is somebody unable to say where an occurrence happened. */
  const shipped = [
    { code: "HKJK", label: "Nairobi — Jomo Kenyatta" },
    { code: "HKNW", label: "Nairobi — Wilson" },
  ];

  it("keeps every shipped option and appends the operator's", () => {
    const merged = withTenantOptions(shipped, ["Kalokol strip"]);
    expect(merged).toHaveLength(3);
    expect(merged.map((o) => o.code)).toContain("HKJK");
    expect(merged.map((o) => o.label)).toContain("Kalokol strip");
  });

  it("does not duplicate one the product already ships", () => {
    const merged = withTenantOptions(shipped, ["nairobi — wilson"]);
    expect(merged).toHaveLength(shipped.length);
  });

  it("returns the shipped list untouched when there is no configuration", () => {
    expect(withTenantOptions(shipped, undefined)).toHaveLength(shipped.length);
    expect(withTenantOptions(shipped, [])).toHaveLength(shipped.length);
  });
});

/* =====================================================================
   WHO MAY DECIDE TOLERABILITY IS THE OPERATOR'S ANSWER, NOT OURS.

   L.N. 32, paragraph 1.2.1(e): a service provider shall "define the
   levels of management with authority to make decisions regarding
   safety risk tolerability."

   Found by benchmarking the MAA's Duty Holder construct — the level of
   the person must match the level of the risk — and then searching our
   own instrument rather than importing theirs. L.N. 32 contains ZERO
   occurrences of ALARP or "as low as reasonably practicable": that is
   UK health-and-safety law absorbed into UK military aviation
   regulation, and putting it on a Kenyan operator's register would
   invent a requirement this regulator never made.

   The same insight was already binding here, in one clause, and it is
   the operator's to discharge.
   ===================================================================== */
describe("the levels of management with authority over tolerability", () => {
  it("keeps a post an operator names against a band it may hold", () => {
    const cfg = normaliseConfig({
      decisionLevels: { TOLERABLE: POST_CODES[0], ACCEPTABLE: POST_CODES[1] },
    });
    expect(cfg.decisionLevels?.TOLERABLE).toBe(POST_CODES[0]);
    expect(cfg.decisionLevels?.ACCEPTABLE).toBe(POST_CODES[1]);
  });

  it("DROPS INTOLERABLE, whoever an operator names against it", () => {
    /* The reason `risk.accept.intolerable` was deleted from the
       permission union: Doc 9859's red band is not acceptable with a
       sufficiently senior signature, it is not acceptable at any level
       of benefit. A configuration that could name an authority over it
       is an invitation to believe otherwise — and it would be the
       flattering kind of wrong, because an operator reading their own
       settings would conclude somebody can sign. */
    const cfg = normaliseConfig({
      decisionLevels: { INTOLERABLE: POST_CODES[0], TOLERABLE: POST_CODES[0] },
    });
    expect(cfg.decisionLevels).not.toHaveProperty("INTOLERABLE");
    expect(cfg.decisionLevels?.TOLERABLE).toBe(POST_CODES[0]);
  });

  it("never lets INTOLERABLE become assignable by adding a band", () => {
    /* ASSIGNABLE_BANDS is derived as "every band except the red one"
       rather than typed as a two-item list, so a future band joins it
       automatically and the red one still cannot. */
    expect(ASSIGNABLE_BANDS).not.toContain("INTOLERABLE");
    expect(ASSIGNABLE_BANDS).toContain("TOLERABLE");
    expect(ASSIGNABLE_BANDS).toContain("ACCEPTABLE");
  });

  it("refuses a post code this product does not know", () => {
    /* An operator renames its posts through postTitles; it does not
       invent new ones here. A code nothing recognises would name an
       authority nobody holds. */
    const cfg = normaliseConfig({ decisionLevels: { TOLERABLE: "CHIEF_OF_VIBES" } });
    expect(cfg.decisionLevels).toBeUndefined();
  });

  it("treats absence as undeclared rather than as nobody", () => {
    /* Every other field here is a preference where absent means "use
       what the product ships". This one is an obligation, so absent
       means the operator has not yet discharged it — a different thing
       from having decided nobody may decide. */
    expect(normaliseConfig({}).decisionLevels).toBeUndefined();
    expect(normaliseConfig({ decisionLevels: {} }).decisionLevels).toBeUndefined();
  });
});
