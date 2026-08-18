/* =====================================================================
   WHO MAY FILE A REPORT, PINNED — because nothing pinned it, and that
   is how the defect below survived.

   `ACCOUNTABLE_EXECUTIVE` did not hold `report.create`. No test
   anywhere asserted that it should not, so the exclusion was an
   unexamined default rather than a judgement, and it was found by
   walking the sequence a design partner walks rather than by reading
   the matrix.

   WHAT IT COST. Signup creates exactly one account and it is that one.
   So a new operator's first and only user filed a report, the sync
   answered `forbidden` per item, and the device said "your role cannot
   submit this report type" — inviting them to try another type, which
   fails identically. docs/02-STRATEGY.md sets Phase 1's gate as "a
   frontline user files a report offline and it arrives"; it could not
   be reached without first appointing a second person.

   THIS FILE IS THE DEFENCE THAT WAS MISSING. Every role's filing right
   is asserted in BOTH directions, so the next change to the matrix has
   to argue with a test rather than slip past one.

   ---------------------------------------------------------------
   AN OPEN QUESTION, LEFT OPEN DELIBERATELY.

   Writing this file surfaced two more roles that cannot file:
   INVESTIGATOR and KEY_MANAGEMENT. Both are plainly personnel under
   Annex 19, and the argument that won for the accountable executive
   applies to them on its face.

   They are NOT changed here, and the reason is the same discipline the
   fix itself rests on. The executive had a demonstrated failure — it is
   the only account signup creates, and it made Phase 1's gate
   unreachable. These two have no such forcing evidence, and widening a
   security-relevant matrix by inference from one case is how a
   permission model stops meaning anything.

   So they are asserted at their current value, and the question is on
   the record where the next reader meets it rather than in a commit
   message nobody re-reads. It is the owner's to settle.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import { can, PERMISSIONS } from "../packages/shared/src/permissions";

/* The instrument's position, and this product's reading of it.

   Annex 19's reporting system is for ALL personnel, so the default is
   that a person in the organisation may file. The two exceptions are
   posts rather than people: one technical, one belonging to the
   vendor. */
const MAY_FILE: Readonly<Record<string, string>> = Object.freeze({
  FRONTLINE: "the reporter the whole product exists for",
  SAFETY_OFFICER: "works the queue and files what they find",
  SAFETY_MANAGER: "runs the system and is still personnel",
  ACCOUNTABLE_EXECUTIVE:
    "personnel, and the post ACCOUNTABLE for the safety management system — " +
    "the one person who must not be structurally unable to use it",
});

const MAY_NOT_FILE: Readonly<Record<string, string>> = Object.freeze({
  /* THESE TWO ARE RECORDED, NOT ENDORSED — see the open question in the
     header. They are asserted at their current value so the matrix is
     fully pinned; changing them is a decision for the owner, not a
     side-effect of fixing the accountable executive. */
  INVESTIGATOR: "does not file today — OPEN QUESTION, see the header",
  KEY_MANAGEMENT: "does not file today — OPEN QUESTION, see the header",
  REGULATOR_INSPECTOR:
    "the authority looking in. An inspector filing INTO the operator's own " +
    "reporting system would put a regulatory observation among the operator's " +
    "voluntary reports, where L.N. 32's protections do not belong to it",
  SYSTEM_ADMIN:
    "a technical post held deliberately away from the safety record. The " +
    "escalation rule on /api/v1/auth/admin/reset-password rests on this role " +
    "not reaching narratives, and filing would be a way in",
  PLATFORM_ADMIN:
    "the vendor. A platform administrator writing into a tenant's safety " +
    "record is the thing the empty vendor org exists to make unthinkable",
});

describe("who may file a safety report", () => {
  it("EVERY ROLE IS ACCOUNTED FOR, so a new one cannot arrive unexamined", () => {
    /* Rule 11 applied to a matrix: two lists that between them miss a
       role would let that role's filing right go unasserted, which is
       precisely the state ACCOUNTABLE_EXECUTIVE was in. */
    /* DERIVED FROM THE MATRIX ITSELF rather than from a hand-kept list
       beside it — charter rule 10. A role added to PERMISSIONS with no
       entry in either table above fails here, in the same commit. */
    const declared = [...Object.keys(MAY_FILE), ...Object.keys(MAY_NOT_FILE)].sort();
    expect(declared).toEqual(Object.keys(PERMISSIONS).sort());
  });

  for (const [role, why] of Object.entries(MAY_FILE)) {
    it(`${role} MAY file — ${why}`, () => {
      expect(can(role as never, "report.create")).toBe(true);
    });
  }

  for (const [role, why] of Object.entries(MAY_NOT_FILE)) {
    it(`${role} may NOT file — ${why}`, () => {
      expect(can(role as never, "report.create")).toBe(false);
    });
  }

  it("AND THE ROLE SIGNUP CREATES CAN FILE, which is the whole finding", () => {
    /* Signup mints exactly one ACCOUNTABLE_EXECUTIVE. If that role ever
       loses report.create again, a new operator's only account cannot
       reach Phase 1's gate — and this is the assertion that says so in
       one line rather than through an end-to-end walk. */
    expect(
      can("ACCOUNTABLE_EXECUTIVE" as never, "report.create"),
      "signup creates this role and nothing else; it must be able to file",
    ).toBe(true);
  });

  it("and filing is not a way into reading everybody else's narratives", () => {
    /* The direction that keeps the fix honest. report.create is the
       right to ADD, and must not have carried a read with it. */
    expect(can("FRONTLINE" as never, "report.read.org")).toBe(false);
  });
});
