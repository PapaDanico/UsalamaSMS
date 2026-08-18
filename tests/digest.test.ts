/* =====================================================================
   A DIGEST IS THE FIRST THING THIS PRODUCT SENDS OUTSIDE ITS OWN ACCESS
   CONTROL, and these checks are mostly about that.

   The grouping and urgency arithmetic is the easy half. The half worth
   reading is the last block: a digest line has no field capable of
   carrying a narrative, a name, or anything a report said, and that is
   asserted over the emitted shape rather than trusted to a comment —
   because the day somebody adds a `summary` field to make an email read
   better is the day a report's contents reach an inbox.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import { digestFor, isWorthSending, type DigestInput } from "../packages/shared/src/digest";

const empty: DigestInput = {
  deadlines: [],
  currencies: [],
  untriaged: 0,
  overdueActions: [],
  contacts: [],
};

const of = (over: Partial<DigestInput>): DigestInput => ({ ...empty, ...over });

describe("saying nothing", () => {
  /* A daily message that usually says "nothing to report" is one people
     stop opening, and the day it matters it is skimmed with the rest.
     Same argument currency.ts makes about a permanently amber window. */
  it("produces no items when there is nothing to say", () => {
    const d = digestFor(empty);
    expect(d.items).toHaveLength(0);
    expect(d.urgency).toBeNull();
    expect(isWorthSending(d)).toBe(false);
  });

  it("stays silent about obligations that are merely outstanding", () => {
    const d = digestFor(of({ deadlines: [{ status: "PENDING", daysLeft: 5 }] }));
    expect(d.items).toHaveLength(0);
  });

  it("stays silent about a met obligation and a current record", () => {
    const d = digestFor(
      of({
        deadlines: [{ status: "MET", daysLeft: 3 }],
        currencies: [
          { state: "CURRENT", daysLeft: 200 },
          { state: "NO_EXPIRY", daysLeft: null },
        ],
        contacts: [{ state: "CURRENT", daysLeft: 120 }],
      })
    );
    expect(isWorthSending(d)).toBe(false);
  });

  /* Zero is not a line. "0 deadlines overdue" is reassurance, and
     reassurance in a channel meant for warnings is how the channel
     stops being read. */
  it("emits no item rather than an item with a count of zero", () => {
    const d = digestFor(of({ untriaged: 0 }));
    expect(d.items.find((i) => i.kind === "UNTRIAGED")).toBeUndefined();
  });
});

describe("grouping", () => {
  /* Eleven lapsing currencies are one line saying eleven. A digest long
     enough to scroll is one nobody finishes. */
  it("groups a kind into one line carrying the count", () => {
    const d = digestFor(
      of({
        currencies: Array.from({ length: 11 }, () => ({ state: "DUE_SOON" as const, daysLeft: 12 })),
      })
    );
    const currency = d.items.filter((i) => i.kind === "CURRENCY");
    expect(currency).toHaveLength(1);
    expect(currency[0]!.count).toBe(11);
  });

  it("groups contacts needing verification without naming them", () => {
    const d = digestFor(
      of({
        contacts: [
          { state: "NEVER_VERIFIED", daysLeft: null },
          { state: "STALE", daysLeft: -4 },
          { state: "DUE_SOON", daysLeft: 12 },
        ],
      })
    );
    expect(d.items).toEqual([
      {
        kind: "CONTACT",
        urgency: "TODAY",
        count: 3,
        soonestDays: -4,
        href: "/sms",
      },
    ]);
  });

  it("reports the soonest of a group, not the average or the last", () => {
    const d = digestFor(
      of({
        currencies: [
          { state: "DUE_SOON", daysLeft: 40 },
          { state: "DUE_SOON", daysLeft: 3 },
          { state: "DUE_SOON", daysLeft: 22 },
        ],
      })
    );
    expect(d.items[0]!.soonestDays).toBe(3);
  });

  it("carries a negative for something already past", () => {
    const d = digestFor(of({ deadlines: [{ status: "OVERDUE", daysLeft: -2 }] }));
    expect(d.items[0]!.soonestDays).toBe(-2);
  });

  it("has no clock for untriaged reports, and says so with null", () => {
    const d = digestFor(of({ untriaged: 4 }));
    expect(d.items[0]!.soonestDays).toBeNull();
  });
});

describe("urgency", () => {
  it("calls an overdue obligation NOW", () => {
    const d = digestFor(of({ deadlines: [{ status: "OVERDUE", daysLeft: -1 }] }));
    expect(d.items[0]!.urgency).toBe("NOW");
  });

  /* An obligation the instrument words as "without delay" has no
     computed window to be due soon within. */
  it("calls a without-delay obligation NOW", () => {
    const d = digestFor(of({ deadlines: [{ status: "WITHOUT_DELAY", daysLeft: 0 }] }));
    expect(d.items[0]!.urgency).toBe("NOW");
  });

  /* THE GAP BETWEEN THESE TWO IS DELIBERATE. Both are already late.
     Only one is a breach of an obligation owed to an authority whose
     clock has run out; the other is a person who needs a course booked.
     Grading them alike either cries wolf about training or understates
     a regulatory miss, and the second is the one that ends an AOC. */
  it("ranks an overdue deadline above a lapsed currency", () => {
    const deadline = digestFor(of({ deadlines: [{ status: "OVERDUE", daysLeft: -1 }] }));
    const currency = digestFor(of({ currencies: [{ state: "LAPSED", daysLeft: -1 }] }));
    expect(deadline.urgency).toBe("NOW");
    expect(currency.urgency).toBe("TODAY");
  });

  /* The reader acts on the worst thing in the group. */
  it("takes the worst status in a group, not the commonest", () => {
    const d = digestFor(
      of({
        deadlines: [
          { status: "DUE_SOON", daysLeft: 2 },
          { status: "DUE_SOON", daysLeft: 3 },
          { status: "OVERDUE", daysLeft: -1 },
          { status: "DUE_SOON", daysLeft: 4 },
        ],
      })
    );
    expect(d.items[0]!.urgency).toBe("NOW");
  });

  it("reports the highest urgency across every kind", () => {
    const d = digestFor(
      of({
        currencies: [{ state: "DUE_SOON", daysLeft: 30 }],
        untriaged: 2,
        deadlines: [{ status: "OVERDUE", daysLeft: -3 }],
      })
    );
    expect(d.urgency).toBe("NOW");
    expect(d.items).toHaveLength(3);
  });

  it("does not invent urgency from volume alone", () => {
    const d = digestFor(of({ untriaged: 500 }));
    expect(d.urgency).toBe("SOON");
  });
});

describe("what a digest may never carry", () => {
  /* THE BOUNDARY. Every screen in the product is behind a session, a
     role and an orgId. An inbox is behind none of them: it is stored by
     a mail provider, forwarded, read on a shared handset, and
     searchable by whoever holds the mailbox afterwards. The whole
     confidentiality posture — an administrator with no narrative
     permission, a de-identification pass before anything circulates, an
     anonymous report that stores no identifier to hide — is enforced at
     the API boundary and stops here.

     So this asserts over the EMITTED SHAPE rather than over the type:
     a type is erased at runtime and cannot stop a field being added,
     and the day somebody adds `summary` to make an email read better is
     the day a narrative reaches an inbox. */
  const populated = digestFor({
    deadlines: [{ status: "OVERDUE", daysLeft: -2 }],
    currencies: [{ state: "LAPSED", daysLeft: -30 }],
    untriaged: 7,
    overdueActions: [{ daysLeft: -5 }],
    contacts: [{ state: "STALE", daysLeft: -8 }],
  });

  it("emits only count, kind, urgency, days and a path — no free text", () => {
    expect(populated.items).toHaveLength(5);
    for (const item of populated.items) {
      expect(Object.keys(item).sort()).toEqual(
        ["count", "href", "kind", "soonestDays", "urgency"].sort()
      );
    }
  });

  it("has no field anywhere in a digest capable of holding a narrative", () => {
    const serialised = JSON.stringify(populated);
    expect(serialised).not.toMatch(/narrative|reporter|title|summary|detail|name|email/i);
  });

  /* A link is a path into the product, where the access control still
     applies. A link carrying a report id would put the identifier of a
     specific safety report into an inbox, and for an anonymous report
     that identifier is the only handle that exists. */
  it("links to a screen rather than to a record", () => {
    for (const item of populated.items) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.href).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
      expect(item.href).not.toContain("?");
    }
  });

  it("says how many, never which", () => {
    const item = populated.items.find((i) => i.kind === "UNTRIAGED")!;
    expect(item.count).toBe(7);
    expect(Object.values(item).every((v) => typeof v !== "object" || v === null)).toBe(true);
  });
});
