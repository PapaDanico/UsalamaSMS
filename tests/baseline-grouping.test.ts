import { describe, it, expect } from "vitest";
import {
  MOR_OBLIGATIONS,
  JURISDICTIONS,
  groupsAsIcaoBaseline,
  groupsAsIcaoBaselineObligation,
  splitByIcaoBaseline,
  isProvisional,
  type Jurisdiction,
  type ReportingObligation,
} from "../packages/shared/src/regulations";

/* The front page rendered nine authorities and seven of them carried one
   sentence with the country name swapped. Those seven are shown as one
   row now — and the whole value of this module is the REFUSAL to fold a
   row that has a figure of its own, because a State disappearing into a
   line that reads "no fixed period is set" is precisely the failure this
   product exists to prevent. */
describe("which rows may share one line", () => {
  const codes = JURISDICTIONS as readonly Jurisdiction[];

  it("groups exactly the provisional ICAO-baseline States", () => {
    const { own, grouped } = splitByIcaoBaseline(codes);
    expect(grouped).toEqual(["UG", "TZ", "RW", "BI", "SS", "CD", "SO"]);
    /* Kenya has real periods; ICAO is the floor itself and not provisional. */
    expect(own).toEqual(["ICAO", "KE"]);
    expect(own.length + grouped.length).toBe(codes.length);

    /* The code-level form is what the page calls, so it is asserted
       rather than assumed to agree with the obligation-level one. */
    for (const code of grouped) expect(groupsAsIcaoBaseline(code)).toBe(true);
    for (const code of own) expect(groupsAsIcaoBaseline(code)).toBe(false);
  });

  it("NEVER GROUPS A ROW THAT CARRIES A PERIOD OF ITS OWN", () => {
    /* The graduation case, which is the whole point. A State whose
       instrument has been read and which now has 24 hours must leave the
       group by itself — nobody should have to remember to take it out.

       Driven through the predicate itself. An earlier version of this
       test built the object and asserted its fields, which is a test of
       the arithmetic in the test rather than of the function. */
    expect(groupsAsIcaoBaselineObligation(MOR_OBLIGATIONS.UG)).toBe(true);

    const graduated: ReportingObligation = { ...MOR_OBLIGATIONS.UG, hours: 24 };
    expect(groupsAsIcaoBaselineObligation(graduated)).toBe(false);

    const byClass: ReportingObligation = {
      ...MOR_OBLIGATIONS.UG,
      hoursByClass: { ACCIDENT: 24, SERIOUS_INCIDENT: 48, INCIDENT: 72 },
    };
    expect(groupsAsIcaoBaselineObligation(byClass)).toBe(false);

    /* And a row read against its instrument stops being provisional,
       which alone disqualifies it however baseline-shaped it looks. */
    const read: ReportingObligation = { ...MOR_OBLIGATIONS.UG, note: "Read 2026-09-07 against the Act." };
    expect(groupsAsIcaoBaselineObligation(read)).toBe(false);
  });

  it("never groups a row that has something particular to say", () => {
    /* Each of these three renders its own explanatory line in the table.
       Folding such a row would drop that sentence silently. */
    for (const field of ["clockStartUnstated", "clockStartInstrument", "governedByUnread"] as const) {
      const special: ReportingObligation = {
        ...MOR_OBLIGATIONS.UG,
        [field]: field === "clockStartUnstated" ? true : "some instrument",
      };
      expect(groupsAsIcaoBaselineObligation(special)).toBe(false);
    }
  });

  it("keeps registry order, so the table reads the same either way", () => {
    const { own, grouped } = splitByIcaoBaseline(codes);
    const rebuilt = [...own, ...grouped];
    for (const list of [own, grouped]) {
      const positions = list.map((c) => codes.indexOf(c));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
    expect(new Set(rebuilt).size).toBe(codes.length);
  });

  it("every grouped row really is provisional", () => {
    /* Grouping is a statement about unread instruments. A row that HAS
       been read against its primary source must never be summarised
       away, however similar its figure looks. */
    const { grouped } = splitByIcaoBaseline(codes);
    for (const code of grouped) expect(isProvisional(code)).toBe(true);
  });
});
