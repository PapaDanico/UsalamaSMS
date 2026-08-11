// =====================================================================
// De-identification corpus.
//
// Two properties, and the second one is the one that was missing.
//
//   1. Identifiers are removed.
//   2. EVERYTHING ELSE SURVIVES.
//
// Property 2 has no natural test unless someone writes narratives that
// contain no identifiers at all and asserts they come out unchanged.
// Nobody does that by accident, which is why the module shipped
// replacing RWY 06, FL 100, QNH 1013 and RVR 800 with [FLT] and every
// existing test passed.
//
// A de-identified bulletin exists so other operators can learn from the
// occurrence. Over-scrubbing does not fail safe: it destroys the reason
// the report was circulated while looking like caution.
//
// THESE FRAGMENTS ARE SYNTHETIC. They are written to the phrasing of
// real occurrence reports but they are invented, which means this suite
// proves the module handles aviation VOCABULARY and not that it handles
// how any particular operator's staff actually write. Replace with
// anonymised fragments from a design partner when they exist — see
// docs/05-SWITCHES.md.
// =====================================================================
import { describe, it, expect } from "vitest";
import { deIdentify } from "../apps/api/src/deident";

/** Narratives containing NO identifiers. Must emerge byte-identical. */
const CLEAN_CORPUS = [
  "During approach to RWY 06 the crew levelled at FL 100 with QNH 1013 set.",
  "RVR was reported as 800 metres and the approach was flown to CAT 1 minima.",
  "The MEL allowed dispatch with the APU inoperative for 10 days.",
  "EGT rose above limits and N1 fluctuated during the takeoff roll.",
  "TCAS issued an RA and the crew followed it; ATC was advised.",
  "GPWS mode 2 activated on short final and a go-around was flown.",
  "The QRH drift-down procedure was actioned and the aircraft levelled at FL 240.",
  "TORA 2400 m, TODA 2600 m, ASDA 2400 m and LDA 2280 m were used for the performance calculation.",
  "Wind was 250 degrees at 15 knots gusting 25, with moderate turbulence below 3000 ft AGL.",
  "The ATIS reported CAVOK with OAT 24 and QNH 1015.",
  "Fuel on board was 4200 KG against a planned 4000 KG, within the MEL tolerance.",
  "Pushback was delayed 20 minutes while GSE was repositioned off the stand.",
  "The FOD walk found a fragment of PBB rubber seal on the apron.",
  "Flap 15 was selected late and the crew elected to continue with the briefed procedure.",
  "An ILS 06 approach was flown with the autopilot engaged to DA.",
  "Cargo weight of 1800 KG exceeded the ULD limit and was redistributed.",
  "The engineer raised an AD compliance query against ATA 32.",
  "LVP were in force and the aircraft held short of TWY B.",
  "RNP approach minima were not available so the crew requested the VOR approach.",
  "Brakes reached 380 degrees and the turnaround was extended for cooling.",
];

/** Narratives that DO contain identifiers. Each must lose them. */
const IDENTIFIED_CORPUS: Array<{ text: string; gone: string[]; token: string }> = [
  { text: "Aircraft 5Y-ABC was on stand 12.", gone: ["5Y-ABC"], token: "[REG]" },
  { text: "5X-DEF diverted after the event.", gone: ["5X-DEF"], token: "[REG]" },
  { text: "The crew of 5H-MTZ reported the defect.", gone: ["5H-MTZ"], token: "[REG]" },
  { text: "9XR-AB was parked overnight.", gone: ["9XR-AB"], token: "[REG]" },
  { text: "ET-AXK operated the rotation.", gone: ["ET-AXK"], token: "[REG]" },
  { text: "We were number two behind KQ431 on the approach.", gone: ["KQ431"], token: "[FLT]" },
  { text: "Capt. John Otieno signed the technical log.", gone: ["Otieno"], token: "[CREW]" },
  { text: "Contact was made on +254712345678 after the event.", gone: ["712345678"], token: "[PHONE]" },
  { text: "The report was emailed to j.otieno@ops.example the same day.", gone: ["@ops.example"], token: "[EMAIL]" },
  { text: "The occurrence happened on 2026-07-01 during the morning bank.", gone: ["2026-07-01"], token: "[DATE]" },
];

describe("de-identification corpus — nothing but identifiers is touched", () => {
  it.each(CLEAN_CORPUS)("leaves clean aviation prose byte-identical: %s", (narrative) => {
    const { text, removed } = deIdentify(narrative);
    expect(text, `scrubbed something in: ${narrative}`).toBe(narrative);
    expect(removed, `claimed a removal in: ${narrative}`).toEqual({});
  });

  it("does not turn a whole narrative into placeholders", () => {
    // The exact input from the pre-flight audit, which produced four
    // false positives and zero true ones.
    const n =
      "During approach to RWY 06 the crew levelled at FL 100 with QNH 1013. " +
      "ATC cleared us to descend. The FO called GPWS alert. We were number 2 " +
      "behind a Q400. Wind was 250/15 and RVR 800. The PIC elected to go around.";
    const { text } = deIdentify(n);
    expect(text).toBe(n);
    expect(text).not.toContain("[FLT]");
  });

  it("does not read a speed as a Somali registration", () => {
    // "60 KTS" matched the digits-first prefix before it required a hyphen.
    const { text } = deIdentify("Groundspeed decayed to 60 KTS on the rollout.");
    expect(text).toContain("60 KTS");
    expect(text).not.toContain("[REG]");
  });
});

describe("de-identification corpus — identifiers still go", () => {
  it.each(IDENTIFIED_CORPUS)("removes the identifier from: $text", ({ text, gone, token }) => {
    const result = deIdentify(text);
    for (const g of gone) {
      expect(result.text, `${g} survived`).not.toContain(g);
    }
    expect(result.text).toContain(token);
  });
});

describe("the residual detector stays readable", () => {
  it("does not flag ordinary aviation vocabulary as a possible name", () => {
    // A reviewer who scrolls past forty false positives stops reading
    // the one that matters, which disables the review control that the
    // whole de-identification promise rests on.
    for (const narrative of CLEAN_CORPUS) {
      const { residual } = deIdentify(narrative);
      expect(residual, `flagged in: ${narrative}\n  ${residual.map((r) => r.text).join(", ")}`)
        .toHaveLength(0);
    }
  });

  it("still flags a bare surname", () => {
    const { residual, cleanByPattern } = deIdentify("Otieno was on the headset.");
    expect(cleanByPattern).toBe(false);
    expect(residual.some((r) => r.text.includes("Otieno"))).toBe(true);
  });

  describe("the safety-management vocabulary survives", () => {
    // Added when the KCAA glossary arrived — and the FIRST version of
    // this block tested the wrong shape. Bare "AOC" was never at risk:
    // the flight-number pattern is two-to-three capitals FOLLOWED BY
    // DIGITS, so it never matched an acronym on its own, and the tests
    // passed with the glossary removed. A guard that passes with the
    // thing it guards deleted is not a guard.
    //
    // This is the shape that was actually breaking. Without the
    // glossary wired in, "SPI 12 was exceeded and SRB 4 reviewed it"
    // redacts to "[FLT] was exceeded and [FLT] reviewed it" — the
    // reporter is protected and the finding is gone.
    const SENTENCES = [
      "SPI 12 was exceeded and SRB 4 reviewed it.",
      "The ERP 2 checklist was used during the drill.",
      "The SAG 2 meeting accepted the mitigation.",
      "SMS 3 training was completed by the whole section.",
      "The AOC holder was notified and the SRM process was followed.",
      "FDA data showed the same exceedance on three sectors.",
      "KCAA were told within 24 hours as the SSP requires.",
    ];

    for (const sentence of SENTENCES) {
      it(`keeps every term in: "${sentence.slice(0, 40)}…"`, () => {
        const result = deIdentify(sentence);
        expect(result.text).toBe(sentence);
        // `removed` is a per-category COUNT MAP, not a list — an empty
        // object is the assertion, and toHaveLength(0) passes on
        // neither an object nor a mistake.
        expect(result.removed, `claimed a removal in: ${sentence}`).toEqual({});
      });
    }

    it("DOES NOT redact ordinary English that looks like a weekday", () => {
      // The regression this exists for. A weekday pattern accepting the
      // three-letter abbreviations case-insensitively redacted "sat",
      // "sun" and "wed" — and "sun glare on short final" is one of the
      // most common sentences in an approach report.
      for (const sentence of [
        "The aircraft sat on stand 4 for two hours.",
        "The sun was low and glare affected the approach.",
        "Sun glare on short final made the PAPI hard to read.",
        "The tug was wed to the nose gear.",
      ]) {
        expect(deIdentify(sentence).text, `over-scrubbed: ${sentence}`).toBe(sentence);
      }
    });

    it("still redacts a written weekday", () => {
      // And the counter-test, so narrowing the pattern cannot quietly
      // become deleting it.
      const result = deIdentify("It happened on Tuesday during the night shift.");
      expect(result.text).not.toContain("Tuesday");
      expect(result.text).toContain("[DAY]");
    });

    it("still redacts a REAL flight number beside a glossary term", () => {
      // The counter-test. A safe-list that swallowed every capitalised
      // token would pass all of the above and remove nothing at all,
      // which is the failure mode a growing exception list really has.
      const result = deIdentify("The AOC holder was notified after KQ 310 diverted.");
      expect(result.text).toContain("AOC");
      expect(result.text).not.toContain("KQ 310");
      expect(Object.keys(result.removed).length).toBeGreaterThan(0);
    });
  });
});
