/* ============================================================
   CORRECTIVE ACTIONS.

   The two checks worth most here are both about ORDER — which of
   several true things about an action decides what an operator is shown
   — and both would look fine if they were wrong:

     · a CANCELLED action past its due date must not read as overdue,
       or a decision recorded properly leaves a red row forever and the
       outstanding list stops being opened;
     · a COMPLETED action past its due date must not read as overdue
       either. It was late. Late is visible in the dates. What the list
       is for is what still needs doing.

   And the rule the whole loop rests on: an action verified by the
   person who completed it has not been verified.
   ============================================================ */

import { describe, it, expect } from "vitest";
import {
  statusOf,
  summarise,
  isOutstanding,
  verificationRefusal,
  daysBetween,
  DUE_SOON_DAYS,
} from "../packages/shared/src/capa";

const TODAY = new Date("2026-08-14T00:00:00.000Z");
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("what state an action is in", () => {
  it("is OPEN with a due date comfortably ahead", () => {
    expect(statusOf({ dueOn: d("2026-12-01") }, TODAY)).toBe("OPEN");
  });

  it("is DUE_SOON inside the window, and the window is the declared one", () => {
    const edge = new Date(TODAY.getTime() + DUE_SOON_DAYS * 86_400_000);
    expect(statusOf({ dueOn: edge }, TODAY)).toBe("DUE_SOON");
    const justOutside = new Date(TODAY.getTime() + (DUE_SOON_DAYS + 1) * 86_400_000);
    expect(statusOf({ dueOn: justOutside }, TODAY)).toBe("OPEN");
  });

  it("is OVERDUE the day after", () => {
    expect(statusOf({ dueOn: d("2026-08-13") }, TODAY)).toBe("OVERDUE");
  });

  it("IS OPEN WITH NO DUE DATE, not overdue", () => {
    /* An action with no date is a different failure — see `undated` in
       the summary — and calling it overdue would report a date that
       does not exist. */
    expect(statusOf({}, TODAY)).toBe("OPEN");
    expect(statusOf({ dueOn: null }, TODAY)).toBe("OPEN");
  });

  it("A CANCELLED ACTION IS NOT OVERDUE, however long ago it was due", () => {
    /* An operator that decided against a control and recorded why must
       not be shown a red row about it forever. That is how a list of
       outstanding work becomes a list nobody opens. */
    expect(
      statusOf({ dueOn: d("2025-01-01"), cancelledOn: d("2025-01-05") }, TODAY),
    ).toBe("CANCELLED");
  });

  it("A COMPLETED ACTION IS NOT OVERDUE EITHER — it was late", () => {
    /* Late and outstanding are different, and only one of them is
       something somebody still has to do. The lateness is not hidden:
       both dates are on the row. */
    expect(
      statusOf({ dueOn: d("2026-01-01"), completedOn: d("2026-06-01") }, TODAY),
    ).toBe("DONE");
  });

  it("prefers VERIFIED over DONE, because verified is done and checked", () => {
    expect(
      statusOf(
        { dueOn: d("2026-01-01"), completedOn: d("2026-02-01"), verifiedOn: d("2026-03-01") },
        TODAY,
      ),
    ).toBe("VERIFIED");
  });

  it("prefers CANCELLED over everything, so a reversal is not shown as progress", () => {
    expect(
      statusOf(
        { completedOn: d("2026-02-01"), cancelledOn: d("2026-03-01") },
        TODAY,
      ),
    ).toBe("CANCELLED");
  });

  it("reads a date string as readily as a Date, and ignores a malformed one", () => {
    // The API sends ISO strings; a screen must not need to parse before
    // it can ask. And one bad value must not throw on a whole list.
    expect(statusOf({ dueOn: "2026-08-13T00:00:00.000Z" }, TODAY)).toBe("OVERDUE");
    expect(statusOf({ dueOn: "not a date" }, TODAY)).toBe("OPEN");
  });

  it("counts only the states that still need somebody", () => {
    expect(isOutstanding("OPEN")).toBe(true);
    expect(isOutstanding("OVERDUE")).toBe(true);
    expect(isOutstanding("DUE_SOON")).toBe(true);
    // DONE is outstanding: it still awaits verification.
    expect(isOutstanding("DONE")).toBe(true);
    expect(isOutstanding("VERIFIED")).toBe(false);
    expect(isOutstanding("CANCELLED")).toBe(false);
  });
});

describe("the summary", () => {
  const actions = [
    { dueOn: d("2026-01-01") },                                    // overdue
    { dueOn: d("2026-08-16") },                                    // due soon
    { dueOn: d("2026-12-01") },                                    // open
    { },                                                            // open, undated
    { dueOn: d("2026-01-01"), completedOn: d("2026-02-01") },      // done
    { completedOn: d("2026-02-01"), verifiedOn: d("2026-03-01") }, // verified
    { dueOn: d("2020-01-01"), cancelledOn: d("2020-02-01") },      // cancelled
  ];

  it("counts each dimension without double-counting the finished ones", () => {
    const s = summarise(actions, TODAY);
    expect(s.total).toBe(7);
    expect(s.overdue).toBe(1);
    expect(s.dueSoon).toBe(1);
    expect(s.awaitingVerification).toBe(1);
    // open + due-soon + overdue + done. Verified and cancelled are finished.
    expect(s.outstanding).toBe(5);
  });

  it("REPORTS UNDATED SEPARATELY, because it is the question an auditor asks", () => {
    /* An action with no due date is not late and never will be. A list
       that shows it as merely open answers "by when?" with silence. */
    expect(summarise(actions, TODAY).undated).toBe(1);
  });

  it("does not count a finished action as undated just because it had no date", () => {
    const s = summarise([{ completedOn: d("2026-01-01"), verifiedOn: d("2026-02-01") }], TODAY);
    expect(s.undated).toBe(0);
    expect(s.outstanding).toBe(0);
  });

  it("survives an empty list without inventing a zero-shaped answer", () => {
    const s = summarise([], TODAY);
    expect(s.total).toBe(0);
    expect(s.outstanding).toBe(0);
  });
});

describe("who may verify", () => {
  it("REFUSES THE PERSON WHO COMPLETED IT — the rule the loop rests on", () => {
    /* An action verified by the person who did it has not been
       verified. It has been asserted twice by the same person, which is
       the same rule the audit findings already carry. */
    const refusal = verificationRefusal(
      { completedOn: d("2026-08-01"), completedById: "u1" },
      "u1",
    );
    expect(refusal).not.toBeNull();
    expect(refusal).toMatch(/cannot also verify|asserted twice/i);
  });

  it("allows anybody else", () => {
    expect(
      verificationRefusal({ completedOn: d("2026-08-01"), completedById: "u1" }, "u2"),
    ).toBeNull();
  });

  it("REFUSES A VERIFICATION BEFORE COMPLETION, and says why", () => {
    // Verifying first records a check of work nobody has reported doing.
    const refusal = verificationRefusal({ completedById: null }, "u2");
    expect(refusal).toMatch(/not been marked complete/i);
  });

  it("returns the sentence rather than a boolean, so every refusal reads differently", () => {
    const early = verificationRefusal({}, "u2");
    const same = verificationRefusal({ completedOn: d("2026-08-01"), completedById: "u1" }, "u1");
    expect(early).not.toBe(same);
    expect(early?.length).toBeGreaterThan(40);
    expect(same?.length).toBeGreaterThan(40);
  });

  it("does not refuse when the completer is unknown", () => {
    /* A row completed before this column existed, or by a route that
       did not record it. Refusing everybody would make those rows
       permanently unverifiable, which is worse than the check being
       unavailable on them. */
    expect(
      verificationRefusal({ completedOn: d("2026-08-01"), completedById: null }, "u2"),
    ).toBeNull();
  });
});

describe("daysBetween", () => {
  it("is negative into the past and positive into the future", () => {
    expect(daysBetween(TODAY, d("2026-08-21"))).toBe(7);
    expect(daysBetween(TODAY, d("2026-08-07"))).toBe(-7);
    expect(daysBetween(TODAY, TODAY)).toBe(0);
  });
});
