import { describe, it, expect } from "vitest";
import { RoleEnum, type Role } from "../packages/shared/src/index";
import {
  can, mayCreateRole, NARRATIVE_PERMISSIONS,
} from "../packages/shared/src/permissions";


/* =====================================================================
   WHO MAY CREATE WHOM — and the escalation that user management opens.

   `SYSTEM_ADMIN` deliberately holds no narrative permission. Give it
   `user.manage` and the confidentiality guarantee can be walked around
   without violating a single check: create a SAFETY_MANAGER, set its
   password — the creator chooses it — sign in, read everything. Each
   step is authorised. The SEQUENCE is the breach, which is why no
   per-route test would ever have caught it.
   ===================================================================== */
describe("mayCreateRole", () => {
  const narrative = (r: Role) =>
    [...NARRATIVE_PERMISSIONS].some((p) => can(r, p));

  it("REFUSES PLATFORM_ADMIN AS A TARGET, to every role without exception", () => {
    /* Derived from the enum rather than listed, so a role added later is
       covered without anybody remembering to add it here. */
    for (const r of RoleEnum.options) {
      expect(mayCreateRole(r, "PLATFORM_ADMIN"), `${r} could mint a vendor`).toBe(false);
    }
  });

  it("STOPS AN ADMINISTRATOR MINTING ITSELF AN EYE", () => {
    /* The assertion this function exists for. SYSTEM_ADMIN reads no
       narrative and must not be able to create an account that does. */
    expect(narrative("SYSTEM_ADMIN")).toBe(false);
    for (const target of RoleEnum.options) {
      if (!narrative(target)) continue;
      expect(
        mayCreateRole("SYSTEM_ADMIN", target),
        `SYSTEM_ADMIN could create ${target}, which reads narratives`,
      ).toBe(false);
    }
  });

  it("and still lets it add another administrator or a regulator", () => {
    /* The other direction. A rule that refused everything would satisfy
       the assertion above and make the role useless. */
    expect(mayCreateRole("SYSTEM_ADMIN", "SYSTEM_ADMIN")).toBe(true);
    expect(mayCreateRole("SYSTEM_ADMIN", "REGULATOR_INSPECTOR")).toBe(true);
  });

  it("LETS THE ACCOUNTABLE EXECUTIVE APPOINT A SAFETY MANAGER", () => {
    /* A subset rule would have refused this — the executive holds
       report.read.org and not report.triage — and refusing it would stop
       the person answerable for the SMS from staffing it, which is the
       single most normal act of setting one up. */
    expect(mayCreateRole("ACCOUNTABLE_EXECUTIVE", "SAFETY_MANAGER")).toBe(true);
    expect(mayCreateRole("ACCOUNTABLE_EXECUTIVE", "SAFETY_OFFICER")).toBe(true);
    expect(mayCreateRole("ACCOUNTABLE_EXECUTIVE", "FRONTLINE")).toBe(true);
  });

  it("refuses every role that does not hold user.manage at all", () => {
    for (const r of RoleEnum.options) {
      if (can(r, "user.manage")) continue;
      expect(mayCreateRole(r, "FRONTLINE"), `${r} could create users`).toBe(false);
    }
  });

  it("AND SOMEBODY HOLDS IT, so this is not a rule over an empty set", () => {
    /* A gate over nothing passes perfectly. If user.manage were dropped
       from every role, every assertion above would still be green. */
    const holders = RoleEnum.options.filter((r) => can(r, "user.manage"));
    expect(holders.length).toBeGreaterThan(0);
    expect(holders).toContain("ACCOUNTABLE_EXECUTIVE");
  });
});
