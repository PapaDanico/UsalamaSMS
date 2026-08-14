/* ============================================================
   A HANDOFF CARRIES COUNTS. NEVER CONTENT.

   These messages leave the device through WhatsApp or a mail client —
   the least controlled channels this product will ever touch. A message
   lands in a group, is forwarded, is backed up to somebody's cloud, and
   is read by people no permission matrix has heard of.

   Everything else in this product is scoped by orgId and a role. This
   is scoped by whoever the sender taps. So the assertions that matter
   here are the ones proving nothing identifying can get into the text —
   and the strongest of them is structural: the composers take numbers,
   and there is no parameter on any of them that could carry a name.
   ============================================================ */
import { describe, it, expect } from "vitest";
import {
  trainingHandoff,
  contactsHandoff,
  deadlinesHandoff,
  actionsHandoff,
  mailtoFor,
  looksLikeContent,
} from "../packages/shared/src/handoff";

const ALL = [
  trainingHandoff({ count: 3, withinDays: 30, overdue: 1 }),
  contactsHandoff({ count: 2, withinDays: 182 }),
  deadlinesHandoff({ count: 4, overdue: 1 }),
  actionsHandoff({ count: 5, overdue: 5 }),
];

describe("nothing identifying can reach the message", () => {
  it("carries no registration, flight number, name, email or telephone", () => {
    for (const h of ALL) {
      expect(looksLikeContent(`${h.subject}\n${h.body}`)).toEqual([]);
    }
  });

  it("has no parameter that could carry one", () => {
    /* THE STRUCTURAL VERSION OF THE RULE, and the reason the others are
       unlikely ever to fail. A composer that accepted a `names` array
       would be one refactor away from putting a fatigue report's author
       into a WhatsApp group; these accept count, withinDays and overdue,
       so the mistake cannot be expressed. Asserted by handing every
       composer an object full of content and checking none of it
       survives. */
    const poisoned = {
      count: 2,
      withinDays: 30,
      overdue: 1,
      names: ["Capt. John Otieno"],
      titles: ["Fatigue on the 0500 to Lodwar"],
      registration: "5Y-ABC",
      email: "john@example.com",
      phone: "+254 20 272 9200",
    } as never;

    for (const compose of [trainingHandoff, contactsHandoff, deadlinesHandoff, actionsHandoff]) {
      const h = compose(poisoned);
      const text = `${h.subject}\n${h.body}`;
      expect(looksLikeContent(text)).toEqual([]);
      expect(text).not.toContain("Otieno");
      expect(text).not.toContain("Lodwar");
      expect(text).not.toContain("5Y-ABC");
    }
  });

  it("the detector it is checked with actually detects", () => {
    /* Rule 11. A guard that finds nothing in anything is a guard that
       proves nothing about the messages above. */
    expect(looksLikeContent("5Y-ABC went off the side")).toContain("a registration");
    expect(looksLikeContent("Capt. John Otieno signed it")).toContain("a titled name");
    expect(looksLikeContent("reach me on +254 20 272 9200")).toContain("a telephone number");
    expect(looksLikeContent("john@example.com")).toContain("an email address");
    expect(looksLikeContent("behind KQ431 on approach")).toContain("a flight number");
  });
});

describe("the message says something an operator can act on", () => {
  it("states the count and the window", () => {
    const h = trainingHandoff({ count: 3, withinDays: 30 });
    expect(h.body).toContain("3 training records");
    expect(h.body).toContain("30 days");
  });

  it("leads with what is already past rather than burying it", () => {
    /* A message that opens "four approaching" and mentions "one already
       late" at the end is a message read as comfortable. */
    const h = deadlinesHandoff({ count: 4, overdue: 1 });
    expect(h.body.indexOf("PAST")).toBeLessThan(h.body.indexOf("approaching"));
    expect(h.subject).toContain("1 past");
  });

  it("says nothing about overdue when nothing is", () => {
    const h = deadlinesHandoff({ count: 2, overdue: 0 });
    expect(h.body).not.toContain("PAST");
    expect(h.subject).not.toContain("past");
  });

  it("reads correctly for exactly one", () => {
    /* "1 training records lapses" is the sentence that tells a reader
       nobody checked this feature. */
    expect(trainingHandoff({ count: 1 }).body).toContain("1 training record lapses");
    expect(contactsHandoff({ count: 1 }).body).toContain("1 emergency contact has not been");
    expect(deadlinesHandoff({ count: 1 }).body).toContain("1 report is approaching");
  });

  it("says where the figure came from, and that it carries no detail", () => {
    /* A forwarded message has no context. A warning with no provenance
       is one somebody ignores, or acts on without knowing what it
       counted. */
    for (const h of ALL) {
      expect(h.body).toContain("UsalamaSMS");
      expect(h.body).toMatch(/carries none|deliberately carries/);
    }
  });
});

describe("the mail path", () => {
  it("names no recipient", () => {
    /* The product does not know who should receive this and must not
       guess. The safety manager picks from their own address book,
       which is also the only place a verified address lives. */
    const url = mailtoFor(ALL[0]!);
    expect(url.startsWith("mailto:?")).toBe(true);
  });

  it("encodes the subject and body rather than breaking on a newline", () => {
    const url = mailtoFor(deadlinesHandoff({ count: 4, overdue: 1 }));
    expect(url).toContain("subject=");
    expect(url).toContain("body=");
    expect(url).not.toContain("\n");
  });
});
