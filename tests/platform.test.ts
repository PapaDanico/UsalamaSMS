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
import { invitationBody, invitationSubject } from "../apps/api/src/mail";
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
  it("is 60 days, and the promise says the number the code uses", () => {
    expect(TRIAL_DAYS).toBe(60);
    const start = new Date("2026-03-01T00:00:00.000Z");
    const end = trialEndsFrom(start);
    expect(Math.round((end.getTime() - start.getTime()) / 86_400_000)).toBe(60);
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

/* =====================================================================
   THE INVITATION, AND THE ONE THING IT MUST NEVER CONTAIN.

   Provisioning generates a password and returns it to the
   administrator ONCE. The invitation goes to the customer. If those two
   ever meet, a live credential is sitting in a mailbox — searchable,
   forwardable, backed up, and still valid long after the person has
   left. routes.admin.ts has said "never emailed from here" since it was
   written; this is the assertion that keeps it true when somebody helpful
   decides the onboarding would be smoother with the password in it.
   ===================================================================== */
describe("the provisioning invitation", () => {
  const body = () =>
    invitationBody("Strip Air", "m@strip.test", "https://usalamasms.com", "2026-09-16");

  it("NEVER CARRIES A PASSWORD, AND SAYS SO BEFORE THE READER LOOKS", () => {
    const text = body();
    expect(text).toMatch(/password is not in this email/i);
    /* Not merely "no password field" — no word that would let somebody
       add one and still pass. */
    expect(text).not.toMatch(/your password is\s*:/i);
    expect(text).not.toMatch(/temporary password/i);
  });

  it("tells them where the password IS, so they do not reset it", () => {
    /* The likeliest failure of this email is somebody hunting for a
       credential that is deliberately absent, deciding the message is
       broken, and requesting a reset — which invalidates the password
       the administrator is holding. */
    expect(body()).toMatch(/administrator has/i);
    expect(body()).toMatch(/ask them rather than requesting a reset/i);
  });

  it("names the organisation, the address and an absolute sign-in link", () => {
    const text = body();
    expect(text).toMatch(/Strip Air/);
    expect(text).toMatch(/m@strip\.test/);
    expect(text).toMatch(/https:\/\/usalamasms\.com\/login/);
    expect(invitationSubject("Strip Air")).toMatch(/Strip Air/);
  });

  it("states the trial end date when there is one, and omits the line when there is not", () => {
    expect(body()).toMatch(/2026-09-16/);
    const none = invitationBody("Strip Air", "m@strip.test", "https://usalamasms.com", null);
    expect(none).not.toMatch(/trial runs until/i);
  });

  it("AND IT STILL SAYS WHAT THE PRODUCT DOES NOT DO", () => {
    /* Charter rule 7 reaches the first thing a customer ever reads from
       us. An onboarding email is exactly where a vendor overclaims. */
    expect(body()).toMatch(/does not run your safety/i);
  });
});
