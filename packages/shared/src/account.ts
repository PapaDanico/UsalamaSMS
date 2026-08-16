/* =====================================================================
   WHAT THIS PERSON CAN REACH, DECLARED ONCE.

   The product had eighteen destinations and no page that answered "what
   can I do here". A frontline reporter met the same menu as an
   accountable executive, opened something their role does not hold, and
   was refused — which teaches somebody that the software is unreliable
   rather than that the permission is not theirs.

   THE SERVER SAYS WHAT THE CALLER HOLDS; THIS SAYS WHAT EACH
   DESTINATION NEEDS. Those are deliberately two different files in two
   different places. `/api/v1/auth/me` returns the caller's permission
   set out of PERMISSIONS, so the account page never re-derives it —
   the same rule the triage queue follows when it returns which moves a
   caller may make rather than letting the screen work it out. A client
   that decides for itself what a role may do is a second copy of the
   permission table, and it is the copy that goes stale.

   What the client legitimately owns is the mapping from a SCREEN to the
   permission that screen needs, because that is a fact about the
   screens rather than about the roles. It lives here rather than in
   sitemap.js for one reason: sitemap.js is imported by main.js and
   rides in the entry chunk a reporter downloads at a remote strip
   before they can file anything. An index of what an accountable
   executive may open is weight charged to somebody who will never open
   any of it.

   NULL MEANS "ANY SIGNED-IN MEMBER", and it is not the same as a
   missing entry. A destination absent from this table is a destination
   this module does not know about, which `reachableFor` reports rather
   than silently including — the same distinction the ADREP columns draw
   between an explicit UNKNOWN and a null.
   ===================================================================== */
import { can, type Permission } from "./permissions";
/* TYPE-ONLY, so the barrel is erased at compile time rather than
   imported at runtime — the same line permissions.ts uses, and the
   reason this file can name Role without dragging the index in. */
import type { Role } from "./index";

export interface AccountDestination {
  readonly href: string;
  /** What the card says. Shorter than the menu label — this is a grid. */
  readonly label: string;
  /** One line on what it is for. */
  readonly hint: string;
  /**
   * The permission required to get anything out of it, or null for
   * "any signed-in member of the operator".
   *
   * NOT AN ACCESS CONTROL. The server refuses regardless; this decides
   * whether the card is worth showing, so nobody is invited to open a
   * door that will be shut in their face.
   */
  readonly needs: Permission | null;
  /** Which band of the operator's work this belongs to. */
  readonly group: AccountGroup;
}

export type AccountGroup =
  | "When something happens"
  | "Assess and manage the risk"
  | "Show it is working"
  | "Your account";

export const ACCOUNT_GROUPS: ReadonlyArray<AccountGroup> = Object.freeze([
  "When something happens",
  "Assess and manage the risk",
  "Show it is working",
  "Your account",
]);

/**
 * EVERY TOOLKIT AND SCREEN A SIGNED-IN PERSON CAN OPEN.
 *
 * Ordered by the operator's own sequence — what happens, then what is
 * done about it, then what is shown for it — which is the order the
 * navigation was rebuilt around and the order somebody reads a menu
 * top to bottom.
 */
export const ACCOUNT_DESTINATIONS: ReadonlyArray<AccountDestination> = Object.freeze([
  {
    href: "/today",
    label: "What needs you today",
    hint: "The one screen that answers whether anything is waiting on you.",
    needs: null,
    group: "When something happens",
  },
  {
    href: "/report",
    label: "File a report",
    hint: "Works with no signal. It sends itself when the handset finds one.",
    needs: "report.create",
    group: "When something happens",
  },
  {
    href: "/triage",
    label: "The reporting queue",
    hint: "Everything filed, its disposition, and what the State files it under.",
    needs: "report.read.org",
    group: "When something happens",
  },
  {
    href: "/toolkits/sra",
    label: "Safety risk assessment",
    hint: "Work a hazard through severity, likelihood and the controls that move it.",
    needs: "risk.assess",
    group: "Assess and manage the risk",
  },
  {
    href: "/toolkits/register",
    label: "Risk register",
    hint: "The position the operator is carrying, with an owner and a review date on each entry.",
    needs: "risk.assess",
    group: "Assess and manage the risk",
  },
  {
    href: "/toolkits",
    label: "Toolkits and calculators",
    hint: "The instruments, and the short calculators that answer in place.",
    needs: null,
    group: "Assess and manage the risk",
  },
  {
    href: "/picture",
    label: "The risk picture",
    hint: "The aggregate an accountable executive is asked for, computed on every load.",
    needs: "report.read.org",
    group: "Show it is working",
  },
  {
    href: "/toolkits/spi",
    label: "Safety performance indicators",
    hint: "The indicators regulation 9(5) asks for, against targets somebody set.",
    needs: "spi.read",
    group: "Show it is working",
  },
  {
    href: "/sms",
    label: "The SMS record",
    hint: "The twelve elements, the org chart, the emergency directory and the operator's own words.",
    needs: "audit.read",
    group: "Show it is working",
  },
  {
    href: "/coverage",
    label: "What this covers",
    hint: "Which of Annex 19's twelve elements are built, and which are not.",
    needs: null,
    group: "Show it is working",
  },
  {
    href: "/account/profile",
    label: "Your profile",
    hint: "Your name, and the password for this account.",
    needs: null,
    group: "Your account",
  },
  {
    href: "/account/logo",
    label: "Your operator's mark",
    hint: "The logo on every pack this operator prints for a regulator.",
    /* Same authority as the rest of the operator's configuration: what
       goes on a document handed to an authority is the safety
       manager's, not a reporter's. */
    needs: "config.manage",
    group: "Your account",
  },
]);

/**
 * The destinations this role should be offered.
 *
 * A CARD THAT LEADS TO A REFUSAL IS WORSE THAN NO CARD. Somebody who
 * opens a screen and is told their role does not include it learns that
 * the product is unreliable, not that the permission is somebody
 * else's — the same reasoning that put a reporter's own view on /today
 * instead of a refusal on a page titled what needs YOU today.
 */
export function reachableFor(role: Role): ReadonlyArray<AccountDestination> {
  return ACCOUNT_DESTINATIONS.filter((d) => d.needs === null || can(role, d.needs));
}

/** The reachable destinations in one group, for rendering a section. */
export function reachableIn(
  role: Role,
  group: AccountGroup,
): ReadonlyArray<AccountDestination> {
  return reachableFor(role).filter((d) => d.group === group);
}

/**
 * WHETHER THE ACCOUNT PAGE HAS ANYTHING TO SAY.
 *
 * Every role reaches at least /today, /toolkits, /coverage and their own
 * profile, so an empty account page means the role is unknown to
 * PERMISSIONS rather than that it holds nothing — which is a fault
 * worth showing rather than an empty grid worth rendering.
 */
export function hasAnything(role: Role): boolean {
  return reachableFor(role).length > 0;
}
