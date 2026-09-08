import { describe, it, expect } from "vitest";
import {
  postureFrom, isBroken, postureBody, postureSubject,
  type PostureFacts,
} from "../apps/api/src/posture";

const HEALTHY: PostureFacts = {
  tables: 32,
  rlsDisabled: [], withoutDenyAll: [], permissivePolicies: [], forced: [], notOwnedByApi: [],
  dataApiGrants: 0,
  supabaseRolesPresent: ["anon", "authenticated", "service_role"],
  connectedAs: "usalama_api",
};

describe("the posture check that can actually run", () => {
  it("holds on production's measured shape", () => {
    const v = postureFrom(HEALTHY);
    expect(v.kind).toBe("HOLDS");
    expect(isBroken(v)).toBe(false);
  });

  it("CATCHES THE DEFECT THAT SHIPPED ON 7 SEPTEMBER", () => {
    /* The SET-I migration enabled row security and stopped. This is the
       exact shape it reached main in, and nothing failed at the time. */
    const v = postureFrom({ ...HEALTHY, withoutDenyAll: ["SetiAssessment", "SetiAssessmentItem"] });
    expect(isBroken(v)).toBe(true);
    if (!isBroken(v)) throw new Error("unreachable");
    expect(v.failures.join(' ')).toMatch(/SetiAssessment/);
  });

  it("CATCHES THE ONE THE INTEGRATION SUITE NEVER COULD", () => {
    /* A grant to service_role. Mutation-proved against production on 21
       August: one SELECT on one table read every report straight through
       the RESTRICTIVE policy. The local suite cannot assert this because
       a bare Postgres has no such role. */
    const v = postureFrom({ ...HEALTHY, dataApiGrants: 1 });
    expect(isBroken(v)).toBe(true);
    if (!isBroken(v)) throw new Error("unreachable");
    expect(v.failures.join(' ')).toMatch(/BYPASSES RLS/);
  });

  it("does not report a grant failure where the roles do not exist", () => {
    /* Against a bare Postgres the count is zero because the roles are
       absent, not because anything was revoked. Reporting either way
       would be reporting the absence of the roles. */
    const bare = { ...HEALTHY, supabaseRolesPresent: [], dataApiGrants: 0 };
    expect(postureFrom(bare).kind).toBe("HOLDS");
  });

  it("catches a permissive policy, forced RLS, and a foreign owner", () => {
    expect(isBroken(postureFrom({ ...HEALTHY, permissivePolicies: ["SafetyReport"] }))).toBe(true);
    expect(isBroken(postureFrom({ ...HEALTHY, forced: ["Org"] }))).toBe(true);
    expect(isBroken(postureFrom({ ...HEALTHY, notOwnedByApi: ["X -> postgres"] }))).toBe(true);
    expect(isBroken(postureFrom({ ...HEALTHY, rlsDisabled: ["Org"] }))).toBe(true);
  });

  it("IS UNKNOWN RATHER THAN HOLDING WHEN IT HAS LOST ITS SUBJECT", () => {
    /* A query that found no tables reports a perfect posture over
       nothing. That is the failure this repository has met four times. */
    expect(postureFrom({ ...HEALTHY, tables: 0 }).kind).toBe("UNKNOWN");
    expect(postureFrom(null).kind).toBe("UNKNOWN");
    expect(isBroken(postureFrom(null))).toBe(false);
  });

  it("names the table and says the site may be perfectly healthy", () => {
    const v = postureFrom({ ...HEALTHY, withoutDenyAll: ["SetiAssessment"] });
    if (!isBroken(v)) throw new Error("unreachable");
    const body = postureBody(v);
    expect(body).toContain("SetiAssessment");
    expect(body).toMatch(/perfectly healthy while/);
    expect(postureSubject()).toMatch(/posture/i);
  });
});
