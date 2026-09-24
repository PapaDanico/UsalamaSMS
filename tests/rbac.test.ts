import { describe, it, expect } from "vitest";
import { RoleEnum, type Role } from "../packages/shared/src/index";
import {
  can, mayCreateRole, mayResetCredential, mayChangeRole, readsNarrative,
  NARRATIVE_PERMISSIONS,
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

/* =====================================================================
   AND WHO MAY RESET WHOM, which is the same escalation through a door
   that predates the rule above.

   These assertions are the CHEAP half. The expensive half — the one
   that actually catches a regression — is
   `tests/integration/reset-escalation.integration.test.ts`, which runs
   the four requests over HTTP. A predicate can be perfect and never be
   called: that is exactly what happened to `mayCreateRole`, which had
   six green unit tests against a route that did not invoke it.
   ===================================================================== */
describe("who may reset whose credential", () => {
  it("REFUSES AN ADMINISTRATOR THE ACCOUNTS THAT READ NARRATIVES", () => {
    /* The reset RETURNS the password, so this is not "may I help them
       back in" — it is "may I sign in as them". */
    for (const target of RoleEnum.options) {
      if (!readsNarrative(target)) continue;
      expect(
        mayResetCredential("SYSTEM_ADMIN", target),
        `SYSTEM_ADMIN could reset ${target}, which reads narratives`,
      ).toBe(false);
    }
  });

  it("AND SOME ROLE ACTUALLY READS ONE, so that is not a loop over nothing", () => {
    /* The assertion above is green if NARRATIVE_PERMISSIONS is ever
       emptied, or if no role holds any of them. */
    const readers = RoleEnum.options.filter(readsNarrative);
    expect(NARRATIVE_PERMISSIONS.size).toBeGreaterThan(0);
    expect(readers).toContain("SAFETY_MANAGER");
    expect(readers).toContain("ACCOUNTABLE_EXECUTIVE");
    expect(readers).not.toContain("SYSTEM_ADMIN");
  });

  it("but lets it reset the accounts that read none, so the role still works", () => {
    expect(mayResetCredential("SYSTEM_ADMIN", "SYSTEM_ADMIN")).toBe(true);
    expect(mayResetCredential("SYSTEM_ADMIN", "REGULATOR_INSPECTOR")).toBe(true);
  });

  it("and lets the accountable executive reset the safety office", () => {
    /* The path that keeps this from being a lockout. The executive
       reads org narratives already, so a credential for somebody who
       also reads them grants nothing new. */
    expect(mayResetCredential("ACCOUNTABLE_EXECUTIVE", "SAFETY_MANAGER")).toBe(true);
    expect(mayResetCredential("ACCOUNTABLE_EXECUTIVE", "SAFETY_OFFICER")).toBe(true);
    expect(mayResetCredential("ACCOUNTABLE_EXECUTIVE", "INVESTIGATOR")).toBe(true);
  });

  it("refuses PLATFORM_ADMIN as a target to everybody", () => {
    for (const r of RoleEnum.options) {
      expect(mayResetCredential(r, "PLATFORM_ADMIN"), `${r} could reset the supplier`).toBe(false);
    }
  });

  it("refuses every role that does not hold user.manage", () => {
    for (const r of RoleEnum.options) {
      if (can(r, "user.manage")) continue;
      expect(mayResetCredential(r, "FRONTLINE"), `${r} could reset a credential`).toBe(false);
    }
  });

  it("AGREES WITH mayCreateRole ON EVERY PAIR, because it is the same escalation", () => {
    /* The two doors share `readsNarrative` so they cannot drift apart
       about what a narrative role is. If somebody later adds a
       condition to one, this fails and makes them decide whether it
       belongs on both — rather than leaving the weaker door open,
       which is how this finding happened in the first place. */
    for (const actor of RoleEnum.options) {
      for (const target of RoleEnum.options) {
        expect(
          mayResetCredential(actor, target),
          `${actor} -> ${target} disagrees between creating and resetting`,
        ).toBe(mayCreateRole(actor, target));
      }
    }
  });
});


/* =====================================================================
   WHO MAY MOVE WHOM — the third door into the same room.

   `mayCreateRole` closes minting yourself an eye; `mayResetCredential`
   closes resetting one you did not mint. Both take four requests and a
   password handover. Moving an account takes ONE, and until the role
   picker existed nothing in this product could do it at all — so this
   is the widest of the three doors and the last one to get a lock.

   Every assertion below is derived from the enum rather than listed, so
   a tenth role arrives covered.
   ===================================================================== */
describe("mayChangeRole", () => {
  const narrative = (r: Role) =>
    [...NARRATIVE_PERMISSIONS].some((p) => can(r, p));
  const roles = RoleEnum.options as readonly Role[];

  it("REFUSES PLATFORM_ADMIN AS A DESTINATION, to every role without exception", () => {
    for (const actor of roles) {
      for (const from of roles) {
        expect(
          mayChangeRole(actor, from, "PLATFORM_ADMIN"),
          `${actor} could promote a ${from} to vendor`,
        ).toBe(false);
      }
    }
  });

  it("REFUSES PLATFORM_ADMIN AS AN ORIGIN — the vendor's account is not an operator's to reorganise", () => {
    for (const actor of roles) {
      for (const to of roles) {
        expect(
          mayChangeRole(actor, "PLATFORM_ADMIN", to),
          `${actor} could move the vendor account to ${to}`,
        ).toBe(false);
      }
    }
  });

  it("REFUSES EVERY ROLE THAT DOES NOT HOLD user.manage", () => {
    for (const actor of roles) {
      if (can(actor, "user.manage")) continue;
      for (const from of roles) {
        for (const to of roles) {
          expect(
            mayChangeRole(actor, from, to),
            `${actor} holds no user.manage and moved ${from} -> ${to}`,
          ).toBe(false);
        }
      }
    }
  });

  /* THE ASSERTION THIS FUNCTION EXISTS FOR. An administrator writing a
     different word into a row is the whole breach — no password is set
     and no account is created, so neither of the other two rules is
     even consulted along the way. */
  it("STOPS AN ADMINISTRATOR PROMOTING ANYBODY INTO THE SAFETY OFFICE", () => {
    expect(narrative("SYSTEM_ADMIN")).toBe(false);
    for (const from of roles) {
      for (const to of roles) {
        if (!narrative(to)) continue;
        expect(
          mayChangeRole("SYSTEM_ADMIN", from, to),
          `SYSTEM_ADMIN moved a ${from} to ${to}, which reads narratives`,
        ).toBe(false);
      }
    }
  });

  /* THE HALF A DESTINATION-ONLY RULE WOULD HAVE MISSED. Demoting the
     safety manager to FRONTLINE confers nothing on the administrator
     and is still an account it is deliberately held away from — and it
     is one step from a reset, which `mayResetCredential` refuses for
     the same reason. Guarding one end of a pair is guarding none. */
  it("STOPS AN ADMINISTRATOR MOVING ANYBODY *OUT* OF THE SAFETY OFFICE", () => {
    for (const from of roles) {
      if (!narrative(from)) continue;
      for (const to of roles) {
        expect(
          mayChangeRole("SYSTEM_ADMIN", from, to),
          `SYSTEM_ADMIN moved a ${from} — a narrative role — to ${to}`,
        ).toBe(false);
      }
    }
  });

  it("LETS AN ADMINISTRATOR REORGANISE THE ACCOUNTS THAT READ NOTHING", () => {
    /* Not a vacuous pass: the pair has to exist. SYSTEM_ADMIN and
       REGULATOR_INSPECTOR both read no narrative, so moving between
       them grants the administrator nothing it did not have. */
    expect(narrative("REGULATOR_INSPECTOR")).toBe(false);
    expect(mayChangeRole("SYSTEM_ADMIN", "REGULATOR_INSPECTOR", "SYSTEM_ADMIN")).toBe(true);
    expect(mayChangeRole("SYSTEM_ADMIN", "SYSTEM_ADMIN", "REGULATOR_INSPECTOR")).toBe(true);
  });

  /* THE PRODUCT HAS TO WORK. A subset rule would stop the person
     answerable for the safety management system appointing their own
     safety manager, which is the single most normal act of running one
     — the same objection `mayCreateRole` records. */
  it("LETS THE ACCOUNTABLE EXECUTIVE APPOINT AND REORGANISE THE SAFETY OFFICE", () => {
    expect(narrative("ACCOUNTABLE_EXECUTIVE")).toBe(true);
    expect(can("ACCOUNTABLE_EXECUTIVE", "user.manage")).toBe(true);
    for (const from of roles) {
      for (const to of roles) {
        if (from === "PLATFORM_ADMIN" || to === "PLATFORM_ADMIN") continue;
        expect(
          mayChangeRole("ACCOUNTABLE_EXECUTIVE", from, to),
          `the accountable executive could not move a ${from} to ${to}`,
        ).toBe(true);
      }
    }
  });

  /* A no-op has to be PERMITTED rather than refused, or the picker
     cannot render the role somebody already holds and the screen has to
     invent a state the matrix does not describe. Idempotence is the
     route's job, and it answers `changed: false`. */
  it("PERMITS THE ROLE SOMEBODY ALREADY HOLDS, so the picker can show it", () => {
    expect(mayChangeRole("ACCOUNTABLE_EXECUTIVE", "SAFETY_MANAGER", "SAFETY_MANAGER")).toBe(true);
    expect(mayChangeRole("SYSTEM_ADMIN", "SYSTEM_ADMIN", "SYSTEM_ADMIN")).toBe(true);
  });

  /* THE THREE DOORS AGREE ABOUT WHERE THE BOUNDARY IS. They share
     `readsNarrative` deliberately so they cannot drift, and this is the
     assertion that notices if one of them stops sharing it. */
  it("AGREES WITH mayCreateRole AND mayResetCredential ON THE NARRATIVE BOUNDARY", () => {
    for (const actor of roles) {
      for (const to of roles) {
        if (to === "PLATFORM_ADMIN") continue;
        /* Moving an account that reads nothing INTO a role is the same
           grant as creating one in it, so the two functions must answer
           identically. REGULATOR_INSPECTOR is the origin because it is
           a real role that reads no narrative — asserted, not assumed,
           since the whole comparison is vacuous if it does. */
        expect(narrative("REGULATOR_INSPECTOR")).toBe(false);
        expect(
          mayChangeRole(actor, "REGULATOR_INSPECTOR", to),
          `${actor} disagreed about ${to}`,
        ).toBe(mayCreateRole(actor, to));
      }
    }
  });
});

/* THE ACCOUNTABLE EXECUTIVE VERIFIES AND DOES NOT CONDUCT. Owner's
   decision, 24 September 2026: the post accountable for the SMS signs
   off the evaluation the safety manager runs. Both halves are asserted,
   because holding conduct as well would let one person run an
   assessment and sign it off. */
describe("SMS evaluation — who conducts and who verifies", () => {
  it("the accountable executive verifies", () => {
    expect(can("ACCOUNTABLE_EXECUTIVE", "sms.audit.verify")).toBe(true);
  });
  it("and does not conduct", () => {
    expect(can("ACCOUNTABLE_EXECUTIVE", "sms.audit.conduct")).toBe(false);
  });
  it("the safety manager still conducts", () => {
    expect(can("SAFETY_MANAGER", "sms.audit.conduct")).toBe(true);
  });
});
