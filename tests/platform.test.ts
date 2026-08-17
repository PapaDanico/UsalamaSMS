/* =====================================================================
   THE VENDOR'S REACH, ASSERTED RATHER THAN DESCRIBED.

   routes.admin.ts explains at length that a PLATFORM_ADMIN cannot read
   a safety record. A comment saying so is worth nothing the first time
   somebody adds a permission to that set in good faith — "just
   audit.read, so support can help" is exactly how it would happen, and
   it would be a reasonable-sounding change that quietly makes the
   privacy page false.

   So the boundary is a test. Not "the console does not show reports" —
   that is a rendering detail — but that the ROLE HOLDS NO PERMISSION
   THAT OPENS ONE, which is the only version that survives somebody
   writing a new route.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  PERMISSIONS, NARRATIVE_PERMISSIONS, can, type Permission,
} from "../packages/shared/src/permissions";
import { RoleEnum, type Role } from "../packages/shared/src/index";
import { TRIAL_DAYS } from "../packages/shared/src/pricing";
import { trialEndsFrom, stateOn } from "../packages/shared/src/subscription";

const VENDOR: Role = "PLATFORM_ADMIN";

describe("the vendor cannot read what it is selling somewhere to put", () => {
  it("HOLDS NO PERMISSION THAT REACHES A NARRATIVE", () => {
    /* The assertion the whole file exists for. NARRATIVE_PERMISSIONS is
       the set the confidentiality guarantees attach to, so this is the
       question stated in the product's own terms rather than by listing
       routes somebody will add to. */
    for (const p of NARRATIVE_PERMISSIONS) {
      expect(can(VENDOR, p), `PLATFORM_ADMIN must not hold ${p}`).toBe(false);
    }
  });

  it("holds exactly two permissions, and both are about running a business", () => {
    const held = [...PERMISSIONS[VENDOR]].sort();
    expect(held).toEqual(["platform.entitlement.manage", "platform.operator.provision"]);
  });

  it("cannot read a report, a hazard, an audit log or an export", () => {
    /* Named individually as well, because NARRATIVE_PERMISSIONS covers
       the narrative and these are the other four doors somebody would
       reach for when a support request arrives. */
    const forbidden: Permission[] = [
      "report.read.own", "report.read.org", "report.triage", "report.investigate",
      "hazard.manage", "risk.assess", "audit.read", "org.export",
      "document.read", "training.manage", "spi.read", "regulator.oversight",
    ];
    for (const p of forbidden) {
      expect(can(VENDOR, p), `PLATFORM_ADMIN must not hold ${p}`).toBe(false);
    }
  });

  it("cannot administer a tenant either — that is the operator's own job", () => {
    /* `org.manage` and `user.manage` are TENANT administration. A vendor
       that held them could add a user to somebody else's organisation,
       and that user could read everything. Provisioning creates the
       organisation; it does not join it. */
    expect(can(VENDOR, "org.manage")).toBe(false);
    expect(can(VENDOR, "user.manage")).toBe(false);
  });

  it("and NO OTHER ROLE holds the vendor's two permissions", () => {
    /* The reverse direction, which a one-sided check would miss: an
       operator role that picked up `platform.entitlement.manage` could
       mark its own subscription paid. */
    for (const role of RoleEnum.options as Role[]) {
      if (role === VENDOR) continue;
      expect(can(role, "platform.operator.provision"), role).toBe(false);
      expect(can(role, "platform.entitlement.manage"), role).toBe(false);
    }
  });
});

describe("the trial the console grants", () => {
  it("is 30 days, and the promise says the number the code uses", () => {
    expect(TRIAL_DAYS).toBe(30);
    const start = new Date("2026-03-01T00:00:00.000Z");
    const end = trialEndsFrom(start);
    expect(Math.round((end.getTime() - start.getTime()) / 86_400_000)).toBe(30);
  });

  it("still ends, and ending does not need anybody to write a state down", () => {
    const end = new Date("2026-04-01T00:00:00.000Z");
    expect(stateOn({ trialEndsOn: end, paidThrough: null },
      new Date("2026-03-31T00:00:00.000Z"))).toBe("TRIAL");
    expect(stateOn({ trialEndsOn: end, paidThrough: null },
      new Date("2026-04-02T00:00:00.000Z"))).toBe("LAPSED");
  });

  it("an operator granted nothing at all reads as LAPSED, not as a trial", () => {
    /* The admin console maps a null trial date to the epoch rather than
       inventing a grant. An account somebody created and never
       entitled must not be indistinguishable from one in trial. */
    expect(stateOn({ trialEndsOn: new Date(0), paidThrough: null }, new Date()))
      .toBe("LAPSED");
  });
});
