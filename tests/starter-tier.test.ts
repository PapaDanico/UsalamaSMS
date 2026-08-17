/* =====================================================================
   THE STARTER TIER, AND THE TWO WAYS IT COULD COST MONEY.

   Amendment 2 captured three kinds of organisation that never held an
   SMS — certified RPAS operators in international operations, the
   maintenance organisations serving them, and certified heliports —
   and $39 exists for them.

   A cheaper band inserted at the top of a list indexed by POSITION is
   how an owner-operator quietly starts paying $39 instead of $79. And
   a band selected on scale alone is how a single-aircraft AOC holder
   lands on the drone rate. Both are silent, both are revenue, and
   neither shows up in a screenshot.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  BANDS, bandForFleet, bandFor, annualUsd, type OperatorKind,
} from "../packages/shared/src/pricing";
import { billableBand } from "../packages/shared/src/subscription";

describe("inserting a cheaper band did not move anybody", () => {
  it("A ONE-AIRCRAFT AOC HOLDER IS STILL $79, NOT $39", () => {
    /* The assertion this file exists for. bandForFleet read BANDS[0]
       for "one aircraft"; BANDS[0] is now `starter`. */
    const b = bandForFleet(1);
    expect(b.id).toBe("single");
    expect(b.usdMonthly).toBe(79);
  });

  it("and every other fleet size is where it was", () => {
    expect(bandForFleet(2).id).toBe("small");
    expect(bandForFleet(9).id).toBe("small");
    expect(bandForFleet(10).id).toBe("fleet");
    expect(bandForFleet(40).id).toBe("fleet");
  });

  it("including the clamped nonsense the pricing slider can produce", () => {
    /* bandForFleet clamps for a shopper dragging a slider. It must
       clamp to `single`, not to the cheapest band in the list. */
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const b = bandForFleet(bad);
      expect(["single", "fleet"], String(bad)).toContain(b.id);
      expect(b.id, String(bad)).not.toBe("starter");
    }
  });

  it("and billing still refuses to invoice from a fleet nobody stated", () => {
    /* billableBand returns null rather than a plausible number when the
       fleet size is absent — the distinction that stops a real charge
       coming from a missing fact. A new cheapest band must not turn
       that null into $39. */
    expect(billableBand(0)).toBeNull();
    expect(billableBand(-1)).toBeNull();
    expect(billableBand(1)?.usdMonthly).toBe(79);
  });
});

describe("who the starter tier is actually for", () => {
  it("gives it to the kinds Amendment 2 newly captured, when they are small", () => {
    for (const kind of ["RPAS", "HELIPORT", "MRO"] as OperatorKind[]) {
      expect(bandFor(kind, 1).id, kind).toBe("starter");
      expect(bandFor(kind, 2).id, kind).toBe("starter");
      expect(bandFor(kind, 1).usdMonthly).toBe(39);
    }
  });

  it("NEVER GIVES IT TO AN AOC HOLDER, whatever the fleet size", () => {
    /* A single-aircraft charter operator carries the same regulatory
       weight as a ten-aircraft one — an accountable executive, post
       holders, passenger operations. Pricing it at the drone rate
       underprices the customer this product was built for. */
    for (const n of [0, 1, 2, 5, 10, 50]) {
      expect(bandFor("AOC", n).id, `AOC with ${n}`).not.toBe("starter");
    }
    expect(bandFor("AOC", 1).usdMonthly).toBe(79);
  });

  it("and a LARGE RPAS operation grows out of it", () => {
    /* The tier is for organisations that are genuinely small, not for
       anything holding a drone. One running twenty aircraft has an
       operation to match. */
    expect(bandFor("RPAS", 3).id).toBe("small");
    expect(bandFor("RPAS", 20).id).toBe("fleet");
    expect(bandFor("HELIPORT", 12).id).toBe("fleet");
  });
});

describe("the tier promises what every other band promises", () => {
  it("carries no element the others carry, and drops none either", () => {
    /* The pricing page's own commitment is that no Annex 19 element
       sits behind a tier. A cheap band that quietly covered less would
       break the one promise the coverage page rests on. */
    const starter = BANDS.find((b) => b.id === "starter")!;
    expect(starter.adds).toMatch(/every annex 19 element/i);
    expect(starter.who).toMatch(/RPAS|drone/i);
  });

  it("is the cheapest, and the ladder still only goes up", () => {
    const prices = BANDS.map((b) => b.usdMonthly);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(Math.min(...prices)).toBe(39);
  });

  it("gets the same two free months a year as the rest", () => {
    const starter = BANDS.find((b) => b.id === "starter")!;
    expect(annualUsd(starter)).toBe(39 * 10);
  });
});
