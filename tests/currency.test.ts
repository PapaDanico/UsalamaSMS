/* ============================================================
   ELEMENT 4.1 — the anticipation half.

   The coverage table said what was missing in its own words: "An
   expired row is visible to somebody who opens the screen; nothing
   tells an operator a currency is about to lapse." These checks are
   about the arithmetic that changes the first clause. The second —
   reaching somebody who never opens the screen — is not built and the
   coverage entry still says so.

   THE PROPERTY WORTH MOST HERE is that the warning window is
   PROPORTIONAL. A fixed thirty days is wrong in both directions at
   once, and the direction that does the damage is the short one: a
   30-day currency warned 30 days out is amber from the moment it is
   created, and a signal that is always on is one people learn to
   ignore. Several checks below exist only to hold that.
   ============================================================ */

import { describe, it, expect } from "vitest";
import {
  currencyOf,
  currencySummary,
  windowFor,
  DUE_SOON_FRACTION,
  MIN_WINDOW_DAYS,
  MAX_WINDOW_DAYS,
} from "../packages/shared/src/currency";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** A record completed on `from`, valid for `days`. */
const rec = (from: string, days: number) => ({
  completedOn: d(from),
  expiresOn: new Date(d(from).getTime() + days * 86_400_000),
});

describe("training currency", () => {
  it("says nothing about a record with no expiry", () => {
    // A one-off induction does not lapse. Reporting it as CURRENT would
    // put it in the denominator of a currency figure it is not part of.
    const v = currencyOf({ completedOn: d("2026-01-01") }, d("2030-01-01"));
    expect(v.state).toBe("NO_EXPIRY");
    expect(v.daysLeft).toBeNull();
  });

  it("IS STILL VALID ON THE DAY IT EXPIRES", () => {
    /* A currency runs to the END of its expiry date. Off by one here
       reports a licence as lapsed while the holder is legally current,
       which is the direction that grounds somebody who did not need
       grounding. */
    const r = rec("2026-01-01", 365);
    const v = currencyOf(r, r.expiresOn);
    expect(v.daysLeft).toBe(0);
    expect(v.state).not.toBe("LAPSED");
  });

  it("lapses the day after", () => {
    const r = rec("2026-01-01", 365);
    const after = new Date(r.expiresOn.getTime() + 86_400_000);
    expect(currencyOf(r, after).state).toBe("LAPSED");
    expect(currencyOf(r, after).daysLeft).toBe(-1);
  });

  it("SCALES THE WINDOW TO THE VALIDITY PERIOD, not to a fixed month", () => {
    /* The whole design decision, asserted against the exported
       fraction rather than against numbers typed here — so revising
       the fraction moves this check with it instead of breaking it.

       MEASURED BELOW THE CAP, and the first version of this check was
       written above it and failed: an annual recurrent is 365 * 0.25 =
       91 days, which clamps to the 90-day maximum, and a two-year
       certificate clamps there too. Asserting that a longer validity
       gets a longer window is therefore false at the top of the range
       — and finding that out is what the check was for.

       It is also the honest description of the design. The proportion
       does its work at the SHORT end, where a fixed month would leave
       a currency permanently amber. Above about a year every record
       gets a quarter's notice, because more notice than that is not
       something anybody acts on differently. */
    const halfYear = rec("2026-01-01", 180);
    const quarter = rec("2026-01-01", 90);
    expect(windowFor(halfYear)).toBe(Math.round(180 * DUE_SOON_FRACTION));
    expect(windowFor(quarter)).toBe(Math.round(90 * DUE_SOON_FRACTION));
    expect(windowFor(halfYear)!).toBeGreaterThan(windowFor(quarter)!);

    // And at the top of the range the cap governs, deliberately.
    expect(windowFor(rec("2026-01-01", 365))).toBe(MAX_WINDOW_DAYS);
    expect(windowFor(rec("2026-01-01", 730))).toBe(MAX_WINDOW_DAYS);
  });

  it("DOES NOT LEAVE A SHORT CURRENCY PERMANENTLY AMBER", () => {
    /* The failure mode that matters. A 30-day currency under a fixed
       30-day rule is DUE_SOON from the moment it is issued — the row
       is never green, so the colour stops carrying information and
       the one that matters is ignored with the rest. */
    const short = rec("2026-01-01", 30);
    const dayAfterIssue = d("2026-01-02");
    expect(currencyOf(short, dayAfterIssue).state).toBe("CURRENT");

    // And it still warns in time to act, rather than not at all.
    const nearEnd = new Date(short.expiresOn.getTime() - 3 * 86_400_000);
    expect(currencyOf(short, nearEnd).state).toBe("DUE_SOON");
  });

  it("DOES NOT WARN YEARS AHEAD ON A LONG CERTIFICATE", () => {
    /* The other extreme. Proportion alone would put a ten-year
       certificate amber two and a half years out, which is not a
       warning, it is furniture. */
    const tenYear = rec("2026-01-01", 3650);
    expect(windowFor(tenYear)).toBe(MAX_WINDOW_DAYS);
    expect(currencyOf(tenYear, d("2027-01-01")).state).toBe("CURRENT");
  });

  it("still gives a week's notice on a very short currency", () => {
    const week = rec("2026-01-01", 7);
    expect(windowFor(week)).toBe(MIN_WINDOW_DAYS);
  });

  it("treats an expiry before its completion as bad data, not a negative window", () => {
    // Hand-entered dates transpose. The row is lapsed either way; what
    // must not happen is a negative window making the comparison
    // meaningless and reporting it CURRENT.
    const backwards = { completedOn: d("2026-06-01"), expiresOn: d("2026-01-01") };
    expect(windowFor(backwards)).toBe(MIN_WINDOW_DAYS);
    expect(currencyOf(backwards, d("2026-07-01")).state).toBe("LAPSED");
  });

  it("COUNTS THE MATRIX, and asks for one number rather than a subtraction", () => {
    const today = d("2026-06-01");
    const rows = [
      rec("2025-01-01", 365), // lapsed
      rec("2026-01-01", 180), // expires 2026-06-30, window 45 -> due soon
      rec("2026-01-01", 730), // long -> current
      { completedOn: d("2026-01-01") }, // no expiry
    ];
    const s = currencySummary(rows, today);
    expect(s.lapsed).toBe(1);
    expect(s.dueSoon).toBe(1);
    expect(s.current).toBe(1);
    expect(s.noExpiry).toBe(1);
    expect(s.total).toBe(4);
    expect(s.needsAttention).toBe(2);
  });

  it("REPORTS THE SOONEST LAPSE STILL AHEAD, not the most overdue", () => {
    /* A lapsed row has already happened. Letting it win "soonest"
       would report a negative number as the next thing to plan for,
       which is the sort of figure a person stops reading. */
    const today = d("2026-06-01");
    const s = currencySummary(
      [rec("2020-01-01", 365), rec("2026-01-01", 180)],
      today,
    );
    expect(s.soonestDays).not.toBeNull();
    expect(s.soonestDays!).toBeGreaterThanOrEqual(0);
  });

  it("an empty matrix asks for nothing", () => {
    const s = currencySummary([], d("2026-06-01"));
    expect(s.total).toBe(0);
    expect(s.needsAttention).toBe(0);
    expect(s.soonestDays).toBeNull();
  });

  it("the bounds are ordered, or the clamp is inverted", () => {
    // Guards the constants themselves: MIN above MAX would make every
    // window MIN and the proportion decorative.
    expect(MIN_WINDOW_DAYS).toBeLessThan(MAX_WINDOW_DAYS);
    expect(DUE_SOON_FRACTION).toBeGreaterThan(0);
    expect(DUE_SOON_FRACTION).toBeLessThan(1);
  });
});
