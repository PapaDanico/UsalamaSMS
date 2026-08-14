/* =====================================================================
   A GAP IS A ROW THAT DOES NOT EXIST.

   currency.test.ts covers the other half of element 4.1: a record that
   exists and is running out. These cover the half that has no row at
   all, which is the harder one to see and the one an auditor asks about
   first — "show me that everybody who needs this has had it."

   The assertions worth reading are the last three. Everything above
   them is arithmetic; those three are the module refusing to do
   something it could easily have done.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  ALL_COURSES,
  INITIAL_TOPICS,
  ROLE_ADDITIONS,
  CURRICULUM_VERIFIED_AGAINST_PRIMARY,
  requiredFor,
  courseFor,
  gapsFor,
  unrecognisedIn,
} from "../packages/shared/src/curriculum";
import { RoleEnum, type Role } from "../packages/shared/src/index";

const ROLES = RoleEnum.options as readonly Role[];

describe("the curriculum itself", () => {
  it("carries the six initial topics Doc 9859 sets as the minimum", () => {
    expect(INITIAL_TOPICS).toHaveLength(6);
  });

  it("has no duplicate keys across initial topics and role additions", () => {
    const keys = ALL_COURSES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every course a reason, not only a label", () => {
    for (const c of ALL_COURSES) {
      expect(c.why.length, `${c.key} has no why`).toBeGreaterThan(20);
    }
  });

  it("resolves every key a role requires to a real course", () => {
    for (const role of ROLES) {
      for (const key of requiredFor(role)) {
        expect(courseFor(key), `${role} requires unknown course ${key}`).toBeDefined();
      }
    }
  });

  /* Charter rule 11 from the other side: if a role is added to the enum
     and nobody adds it here, `requiredFor` would silently return the six
     with no additions and the matrix would look complete. */
  it("has an entry for every role in the enum", () => {
    for (const role of ROLES) {
      expect(() => requiredFor(role), `${role} is not handled`).not.toThrow();
    }
  });
});

describe("what each role is expected to hold", () => {
  it("gives the six to every role that is the operator's own personnel", () => {
    const personnel = ROLES.filter((r) => r !== "SYSTEM_ADMIN" && r !== "REGULATOR_INSPECTOR");
    for (const role of personnel) {
      for (const topic of INITIAL_TOPICS) {
        expect(requiredFor(role), `${role} is missing ${topic.key}`).toContain(topic.key);
      }
    }
  });

  /* An administrator manages accounts and configuration; an inspector
     reads the operator's record. Neither is personnel the operator
     trains, and listing them would put a permanent false gap on every
     matrix — a warning that is always on is one people learn to
     ignore, which is the argument currency.ts makes about windows. */
  it("expects nothing of a system administrator or a regulator inspector", () => {
    expect(requiredFor("SYSTEM_ADMIN")).toHaveLength(0);
    expect(requiredFor("REGULATOR_INSPECTOR")).toHaveLength(0);
  });

  it("gives the accountable executive the accountabilities briefing", () => {
    expect(requiredFor("ACCOUNTABLE_EXECUTIVE")).toContain("ACCOUNTABILITIES");
  });

  it("gives a frontline reporter hazard reporting, and not audit technique", () => {
    expect(requiredFor("FRONTLINE")).toContain("HAZARD_REPORTING");
    expect(requiredFor("FRONTLINE")).not.toContain("AUDIT_TECHNIQUE");
  });
});

describe("computing a gap", () => {
  it("reports every required course for somebody with no record at all", () => {
    expect(gapsFor("FRONTLINE", [])).toEqual(requiredFor("FRONTLINE"));
  });

  it("reports nothing for somebody holding everything their role needs", () => {
    expect(gapsFor("SAFETY_MANAGER", requiredFor("SAFETY_MANAGER"))).toHaveLength(0);
  });

  it("reports only what is absent", () => {
    const required = requiredFor("FRONTLINE");
    const held = required.slice(1);
    expect(gapsFor("FRONTLINE", held)).toEqual([required[0]]);
  });

  /* This one is kept for the behaviour, NOT as evidence about an
     implementation. It was written to prove a filter inside gapsFor
     rejected unrecognised keys, and putting that defect back left it
     GREEN — because an unrecognised key cannot equal a required key, so
     the filter was dead code and this was a check that could not fail.
     The filter is gone; the property is structural, and this says so.
     What an unrecognised key actually deserves is the block below. */
  it("cannot have its answer changed by a key that is not in the curriculum", () => {
    const required = requiredFor("FRONTLINE");
    expect(gapsFor("FRONTLINE", ["NOT_A_REAL_COURSE"])).toEqual(required);
    expect(gapsFor("FRONTLINE", [...required, "NOT_A_REAL_COURSE"])).toHaveLength(0);
  });

  it("surfaces a course key this build does not recognise, rather than dropping it", () => {
    expect(unrecognisedIn(["SMS refresher", "POLICY_OBJECTIVES"])).toEqual(["SMS refresher"]);
  });

  it("reports nothing unrecognised when every key is in the curriculum", () => {
    expect(unrecognisedIn(requiredFor("SAFETY_MANAGER"))).toHaveLength(0);
  });

  /* THE MIGRATION CASE, and the reason this function exists at all.
     Every TrainingRecord written before the curriculum carries free
     text. On the day this ships, an operator's whole matrix is
     unrecognised keys — and the wrong behaviour is to show them six
     gaps per person while their certificates sit in the record unread.
     They are reported so the operator can map them; they are never
     guessed at, because a fuzzy match from "SMS refresher" to a
     curriculum key is the invented compliance this module removes. */
  it("reports legacy free-text courses without matching them to anything", () => {
    const legacy = ["SMS", "SMS refresher", "Safety Management Systems (initial)"];
    expect(unrecognisedIn(legacy)).toEqual(legacy);
    expect(gapsFor("FRONTLINE", legacy)).toEqual(requiredFor("FRONTLINE"));
  });

  it("does not report the same unrecognised key twice", () => {
    expect(unrecognisedIn(["SMS", "SMS"])).toEqual(["SMS"]);
  });

  it("cannot report a gap against somebody the operator does not train", () => {
    expect(gapsFor("SYSTEM_ADMIN", [])).toHaveLength(0);
    expect(gapsFor("REGULATOR_INSPECTOR", [])).toHaveLength(0);
  });
});

describe("what this module refuses to assert", () => {
  /* THE EASIEST LINE IN THE FILE WOULD HAVE BEEN `recurrentMonths: 12`.
     Doc 9859 does not prescribe a recurrent interval. "Annual
     refresher" is widespread practice and a great deal of secondary
     material repeats it, and it is not a standard — the interval is set
     by the operator and its State, proportionate to the operation.

     If this ever gains an interval field, an operator will show an
     auditor a matrix computed from a number this product invented. So
     the shape is asserted, not just the intent: a course says WHAT,
     never HOW OFTEN. The expiry lives on the operator's own record. */
  it("states no recurrent interval anywhere in the curriculum", () => {
    for (const c of ALL_COURSES) {
      expect(Object.keys(c).sort()).toEqual(["key", "label", "why"]);
    }
    const serialised = JSON.stringify(ALL_COURSES);
    expect(serialised).not.toMatch(/month|annual|yearly|recurren|interval|validity/i);
  });

  /* Same sentence as cictt.ts, and it stays false for the same reason:
     every regulatory host this environment can reach returns 403 at the
     egress proxy, so the manual was read through a search index rather
     than opened. Good enough to structure a programme and prompt an
     operator; not good enough to tell somebody they are compliant. */
  it("does not claim to have been read against the primary document", () => {
    expect(CURRICULUM_VERIFIED_AGAINST_PRIMARY).toBe(false);
  });

  it("keeps role additions genuinely additional, never a replacement", () => {
    const additionKeys = ROLE_ADDITIONS.map((c) => c.key);
    const initialKeys = INITIAL_TOPICS.map((c) => c.key);
    for (const k of additionKeys) expect(initialKeys).not.toContain(k);
  });
});
