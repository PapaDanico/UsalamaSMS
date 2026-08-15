/* ============================================================
   WHAT A ROLE IS OFFERED, AND WHAT IT IS NOT.

   The account area exists because the product had eighteen
   destinations and no page answering "what can I do here". A frontline
   reporter met the same menu as an accountable executive, opened
   something their role does not hold, and was refused — which teaches
   somebody the software is unreliable rather than that the permission
   belongs to somebody else.

   THE PROPERTY THESE GUARD is that the offer matches the permission.
   Two ways to get that wrong and they fail in opposite directions:

     OFFERED AND REFUSED   a card that leads to a 403. The defect the
                           page was built to end.
     HELD AND NOT OFFERED  a capability nobody can find, which is the
                           defect this repository has met four times —
                           the SRA shipping invisible, CAPA with no UI,
                           /signup advertised by no section, and an
                           SMS transport with no call site.
   ============================================================ */
import { describe, it, expect } from "vitest";
import {
  ACCOUNT_DESTINATIONS,
  ACCOUNT_GROUPS,
  reachableFor,
  reachableIn,
  hasAnything,
} from "../packages/shared/src/account";
import { PERMISSIONS } from "../packages/shared/src/permissions";
import type { Role } from "../packages/shared/src/index";

const ROLES = Object.keys(PERMISSIONS) as Role[];

describe("the destination table", () => {
  it("declares destinations at all", () => {
    expect(ACCOUNT_DESTINATIONS.length).toBeGreaterThan(6);
  });

  it("gives every destination an href, a label and a hint", () => {
    for (const d of ACCOUNT_DESTINATIONS) {
      expect(d.href, "href").toMatch(/^\//);
      expect(d.label, d.href).toBeTruthy();
      expect(d.hint, d.href).toBeTruthy();
    }
  });

  it("does not list the same destination twice", () => {
    const hrefs = ACCOUNT_DESTINATIONS.map((d) => d.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  /* A group nothing belongs to renders an empty heading; a destination
     in a group the page does not render is a destination nobody sees. */
  it("puts every destination in a group the page renders", () => {
    for (const d of ACCOUNT_DESTINATIONS) {
      expect(ACCOUNT_GROUPS, d.href).toContain(d.group);
    }
  });

  /* NAMES A PERMISSION THAT EXISTS. A typo here hides the card from
     every role rather than failing loudly — the safe direction, and
     silent, so it is checked. */
  it("needs only permissions some role actually holds", () => {
    const every = new Set(ROLES.flatMap((r) => [...PERMISSIONS[r]]));
    for (const d of ACCOUNT_DESTINATIONS) {
      if (d.needs === null) continue;
      expect(
        every.has(d.needs),
        `${d.href} needs "${d.needs}", which no role holds — the card is invisible to everybody`,
      ).toBe(true);
    }
  });
});

describe("what each role is offered", () => {
  /* THE FLOOR. Every role reaches the day's summary, the toolkits index,
     the coverage page and its own profile, because all four need
     nothing. A role that reaches none of them is a role PERMISSIONS
     does not know, which the page reports rather than rendering empty. */
  it("offers every role something", () => {
    for (const role of ROLES) {
      expect(hasAnything(role), role).toBe(true);
    }
  });

  it("offers every role its own profile, whatever else it holds", () => {
    for (const role of ROLES) {
      expect(
        reachableFor(role).map((d) => d.href),
        role,
      ).toContain("/account/profile");
    }
  });

  /* THE ASSERTION THE PAGE EXISTS FOR: nothing is offered that the
     server would refuse. */
  it("never offers a destination the role does not hold the permission for", () => {
    for (const role of ROLES) {
      for (const d of reachableFor(role)) {
        if (d.needs === null) continue;
        expect(
          PERMISSIONS[role].has(d.needs),
          `${role} is offered ${d.href}, which needs "${d.needs}" it does not hold`,
        ).toBe(true);
      }
    }
  });

  /* AND THE OTHER DIRECTION: a destination is offered to every role
     that DOES hold its permission. Filtering too hard hides a
     capability from somebody entitled to it, which is the same defect
     as an unreachable route and just as quiet. */
  it("offers a destination to every role that holds its permission", () => {
    for (const role of ROLES) {
      const offered = new Set(reachableFor(role).map((d) => d.href));
      for (const d of ACCOUNT_DESTINATIONS) {
        if (d.needs !== null && !PERMISSIONS[role].has(d.needs)) continue;
        expect(
          offered.has(d.href),
          `${role} holds what ${d.href} needs and is not offered it`,
        ).toBe(true);
      }
    }
  });

  /* A frontline reporter files and does not triage, so the two screens
     that read the whole operator's queue must not be on their page. */
  it("does not offer a frontline reporter the organisation's queue", () => {
    const offered = reachableFor("FRONTLINE" as Role).map((d) => d.href);
    expect(offered).not.toContain("/triage");
    expect(offered).not.toContain("/picture");
  });

  it("does offer a frontline reporter the form they file on", () => {
    expect(reachableFor("FRONTLINE" as Role).map((d) => d.href)).toContain("/report");
  });

  /* A safety manager holds more than a reporter. If these ever match,
     either the filter has stopped filtering or the roles have merged —
     both worth failing over. */
  it("gives the safety manager more than the frontline reporter", () => {
    expect(reachableFor("SAFETY_MANAGER" as Role).length).toBeGreaterThan(
      reachableFor("FRONTLINE" as Role).length,
    );
  });
});

describe("grouping for the page", () => {
  it("returns only destinations in the group asked for", () => {
    for (const group of ACCOUNT_GROUPS) {
      for (const d of reachableIn("SAFETY_MANAGER" as Role, group)) {
        expect(d.group).toBe(group);
      }
    }
  });

  /* The groups partition the reachable set — every card appears once,
     under exactly one heading, so nothing is rendered twice and nothing
     is dropped between headings. */
  it("puts every reachable destination under exactly one heading", () => {
    for (const role of ROLES) {
      const grouped = ACCOUNT_GROUPS.flatMap((g) => reachableIn(role, g));
      expect(grouped.length, role).toBe(reachableFor(role).length);
      expect(new Set(grouped.map((d) => d.href)).size, role).toBe(grouped.length);
    }
  });
});
