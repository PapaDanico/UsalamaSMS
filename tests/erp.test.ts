/* ============================================================
   THE EMERGENCY CONTACT DIRECTORY.

   A contact directory is not wrong when it is written. It goes wrong
   quietly — the duty officer's number changes, the handling agent is
   bought, the doctor retires — and none of that produces an event
   inside this product. So the checks here are mostly about what the
   directory refuses to call healthy:

     · an EMPTY directory is not a clean directory, and reporting "0
       stale" against no contacts at all is the reassuring answer;
     · NEVER VERIFIED is not the same as STALE, because the two need
       different things from a person;
     · USABLE means every contact is trusted, not most — a call-out
       tree is used in order, and the one number nobody checked is as
       likely to be the first as the last.
   ============================================================ */

import { describe, it, expect } from "vitest";
import {
  freshnessOf,
  daysUntilStale,
  assess,
  inCallOrder,
  VERIFY_WITHIN_DAYS,
  VERIFY_WARN_DAYS,
} from "../packages/shared/src/erp";

const TODAY = new Date("2026-08-14T00:00:00.000Z");
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * 86_400_000);

describe("whether a number can still be trusted", () => {
  it("is CURRENT when recently confirmed", () => {
    expect(freshnessOf({ verifiedOn: daysAgo(10) }, TODAY)).toBe("CURRENT");
  });

  it("is STALE past the declared interval, and the interval is the declared one", () => {
    expect(freshnessOf({ verifiedOn: daysAgo(VERIFY_WITHIN_DAYS) }, TODAY)).toBe("STALE");
    expect(freshnessOf({ verifiedOn: daysAgo(VERIFY_WITHIN_DAYS - 1) }, TODAY)).not.toBe("STALE");
  });

  it("warns before it lapses, so it can be fixed rather than reported", () => {
    const inWindow = daysAgo(VERIFY_WITHIN_DAYS - VERIFY_WARN_DAYS);
    expect(freshnessOf({ verifiedOn: inWindow }, TODAY)).toBe("DUE_SOON");
  });

  it("NEVER_VERIFIED IS ITS OWN ANSWER, not a kind of stale", () => {
    /* They need different things from a person. A stale contact needs a
       call to confirm it; a never-verified one needs somebody to
       establish the contact exists and has agreed at all. An operator
       who typed fifty numbers out of an old manual has a directory that
       is entirely never-verified, and calling it "stale" implies it was
       once checked. */
    expect(freshnessOf({}, TODAY)).toBe("NEVER_VERIFIED");
    expect(freshnessOf({ verifiedOn: null }, TODAY)).toBe("NEVER_VERIFIED");
  });

  it("treats a malformed date as never verified rather than as current", () => {
    // The safe direction: an unreadable date must not read as confirmed.
    expect(freshnessOf({ verifiedOn: "not a date" }, TODAY)).toBe("NEVER_VERIFIED");
  });

  it("counts down, and past zero", () => {
    expect(daysUntilStale({ verifiedOn: daysAgo(0) }, TODAY)).toBe(VERIFY_WITHIN_DAYS);
    expect(daysUntilStale({ verifiedOn: daysAgo(VERIFY_WITHIN_DAYS + 10) }, TODAY)).toBe(-10);
    expect(daysUntilStale({}, TODAY)).toBeNull();
  });
});

describe("whether the directory could be used tonight", () => {
  it("AN EMPTY DIRECTORY IS NOT A CLEAN ONE", () => {
    /* Zero stale contacts out of zero contacts is the reassuring answer
       and the wrong one. A summary that reports "0 stale" against an
       empty list describes a directory that cannot be used at all as
       though nothing were wrong with it. */
    const v = assess([], TODAY);
    expect(v.usable).toBe(false);
    expect(v.stale).toBe(0);
    expect(v.concern).toMatch(/no emergency contacts/i);
  });

  it("IS UNUSABLE IF ONE CONTACT IS UNTRUSTED, not most of them", () => {
    /* A call-out tree is used in order, and the one number nobody
       checked is as likely to be the first as the last. "38 of 40
       verified" reads as healthy and describes a directory that may
       fail at step one. */
    const contacts = [
      ...Array(39).fill({ verifiedOn: daysAgo(5) }),
      { verifiedOn: null },
    ];
    const v = assess(contacts, TODAY);
    expect(v.total).toBe(40);
    expect(v.neverVerified).toBe(1);
    expect(v.usable).toBe(false);
  });

  it("is usable when every contact is trusted", () => {
    const v = assess([{ verifiedOn: daysAgo(5) }, { verifiedOn: daysAgo(30) }], TODAY);
    expect(v.usable).toBe(true);
    expect(v.concern).toBeNull();
  });

  it("still raises a concern for a due-soon contact without calling it unusable", () => {
    const v = assess(
      [{ verifiedOn: daysAgo(VERIFY_WITHIN_DAYS - 5) }],
      TODAY,
    );
    expect(v.usable).toBe(true);
    expect(v.dueSoon).toBe(1);
    expect(v.concern).toMatch(/re-verification/i);
  });

  it("SAYS WHICH PROBLEM IT IS, and names both when there are both", () => {
    const v = assess(
      [
        { verifiedOn: null },
        { verifiedOn: null },
        { verifiedOn: daysAgo(VERIFY_WITHIN_DAYS + 40) },
      ],
      TODAY,
    );
    expect(v.neverVerified).toBe(2);
    expect(v.stale).toBe(1);
    expect(v.concern).toMatch(/never been verified/i);
    expect(v.concern).toMatch(new RegExp(`${VERIFY_WITHIN_DAYS} days old`));
  });

  it("gets the singular right — a directory that says '1 contacts' is not read twice", () => {
    expect(assess([{ verifiedOn: null }], TODAY).concern).toMatch(/1 contact has never/);
    expect(assess([{ verifiedOn: null }, { verifiedOn: null }], TODAY).concern)
      .toMatch(/2 contacts have never/);
  });
});

describe("the call order", () => {
  const c = (name: string, callOrder: number | null) => ({ name, callOrder });

  it("SORTS UNORDERED CONTACTS LAST, not first", () => {
    /* The rule, and the trap: an ascending sort on a nullable column
       puts the entries nobody has placed at the TOP of a list whose
       entire meaning is the order. */
    const sorted = inCallOrder([
      c("Unplaced", null),
      c("Second", 2),
      c("First", 1),
    ]);
    expect(sorted.map((x) => x.name)).toEqual(["First", "Second", "Unplaced"]);
  });

  it("falls back to the name so the order is stable between reads", () => {
    // Two contacts at the same step must not swap places on refresh —
    // a call list that reorders itself is one nobody trusts.
    const sorted = inCallOrder([c("Zawadi", 1), c("Amina", 1), c("Mwangi", 1)]);
    expect(sorted.map((x) => x.name)).toEqual(["Amina", "Mwangi", "Zawadi"]);
  });

  it("handles a directory with no order set at all", () => {
    const sorted = inCallOrder([c("Bee", null), c("Ay", null)]);
    expect(sorted.map((x) => x.name)).toEqual(["Ay", "Bee"]);
  });

  it("does not mutate what it was given", () => {
    const input = [c("Second", 2), c("First", 1)];
    inCallOrder(input);
    expect(input.map((x) => x.name)).toEqual(["Second", "First"]);
  });
});
