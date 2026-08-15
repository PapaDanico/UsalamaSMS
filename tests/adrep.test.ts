/* ============================================================
   THE FIVE THINGS A STATE FILES BESIDE THE OCCURRENCE CATEGORY.

   These are vocabulary tests, and the thing they are actually guarding
   is the distinction between NULL and UNKNOWN. Every other property
   here is arithmetic; that one is the difference between a safety
   office knowing its backlog is un-triaged and a safety office reading
   an un-triaged backlog as a set of determinations.
   ============================================================ */
import { describe, it, expect } from "vitest";
import {
  ADREP_FIELDS,
  ADREP_CAVEAT,
  ADREP_VERIFIED_AGAINST_PRIMARY,
  INJURY_LEVELS,
  AIRCRAFT_DAMAGE_LEVELS,
  LIGHT_CONDITIONS,
  MET_CONDITIONS,
  OPERATION_TYPES,
  adrepField,
  adrepLabel,
  adrepCompleteness,
  isValidAdrepValue,
} from "../packages/shared/src/adrep";

describe("what this product admits about these vocabularies", () => {
  /* THE SAME SENTENCE cictt.ts CARRIES, and it stays false until
     somebody reads Annex 13 Chapter 1 and the ECCAIRS data definition
     standard. Corroboration across secondary sources is better than one
     summary and it is not the same as reading the document. */
  it("does not claim to have been verified against the primary", () => {
    expect(ADREP_VERIFIED_AGAINST_PRIMARY).toBe(false);
  });

  /* The caveat's job is to send a borderline case to the document
     rather than to a paraphrase, so it has to NAME the document. */
  it("sends a borderline case to Annex 13 rather than to a paraphrase", () => {
    expect(ADREP_CAVEAT).toContain("Annex 13");
    expect(ADREP_CAVEAT.toLowerCase()).toContain("not determined");
  });

  /* THE THRESHOLDS ARE THE ONE THING THAT MUST NOT BE HERE. Annex 13
     enumerates what makes an injury serious — a hospitalisation period,
     fracture classes, a burn percentage. A number in this file is a
     number somebody codes against instead of reading the instrument,
     and half-remembered thresholds are how a serious injury gets coded
     minor by somebody being careful. */
  it("paraphrases no numeric threshold from the definitions", () => {
    const hints = ADREP_FIELDS.flatMap((f) => f.options.map((o) => o.hint)).join(" ");
    expect(hints).not.toMatch(/\d+\s*(%|per\s?cent|hours?|days?)/i);
  });
});

describe("the shape of the five", () => {
  it("declares exactly five fields", () => {
    expect(ADREP_FIELDS).toHaveLength(5);
  });

  it("gives every field a distinct key", () => {
    const keys = ADREP_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /* EVERY VOCABULARY CARRIES ITS OWN UNKNOWN, and that is what makes
     null mean "nobody has looked". Without it the only way to record an
     undetermined injury is to leave the column null, which is
     indistinguishable from an un-triaged report — and then a count of
     coded reports counts determinations nobody made. */
  it("gives every field a way to say 'looked and could not establish it'", () => {
    for (const field of ADREP_FIELDS) {
      expect(
        field.options.some((o) => o.code === "UNKNOWN"),
        field.key,
      ).toBe(true);
    }
  });

  it("gives every option a code, a label and a hint", () => {
    for (const field of ADREP_FIELDS) {
      for (const option of field.options) {
        expect(option.code, `${field.key} code`).toBeTruthy();
        expect(option.label, `${field.key}.${option.code} label`).toBeTruthy();
        expect(option.hint, `${field.key}.${option.code} hint`).toBeTruthy();
      }
    }
  });

  it("does not repeat a code within a field", () => {
    for (const field of ADREP_FIELDS) {
      const codes = field.options.map((o) => o.code);
      expect(new Set(codes).size, field.key).toBe(codes.length);
    }
  });
});

describe("the vocabularies themselves", () => {
  /* Annex 13's accident definition turns on fatal or serious injury, so
     both have to be expressible or the field cannot answer the question
     it exists for. */
  it("can express the two injury levels Annex 13's accident definition turns on", () => {
    const codes = INJURY_LEVELS.map((o) => o.code);
    expect(codes).toContain("SERIOUS");
    expect(codes).toContain("FATAL");
  });

  /* SUBSTANTIAL is what makes an occurrence an accident when nobody was
     hurt. A damage vocabulary without it cannot answer Annex 13 either. */
  it("can express substantial damage, which decides an accident with no injuries", () => {
    expect(AIRCRAFT_DAMAGE_LEVELS.map((o) => o.code)).toContain("SUBSTANTIAL");
  });

  /* Twilight is a third state and not a rounding of the other two. Most
     of the value in this column is that a dusk approach is neither a
     daylight one nor a night one. */
  it("keeps twilight as its own state rather than rounding it to day or night", () => {
    const codes = LIGHT_CONDITIONS.map((o) => o.code);
    expect(codes).toContain("DAYLIGHT");
    expect(codes).toContain("TWILIGHT");
    expect(codes).toContain("NIGHT");
  });

  it("has both sides of the visual/instrument line", () => {
    const codes = MET_CONDITIONS.map((o) => o.code);
    expect(codes).toContain("VMC");
    expect(codes).toContain("IMC");
  });

  /* Scheduled and non-scheduled carry different exposures and different
     pressures, and collapsing them makes every commercial count one
     line. */
  it("separates scheduled from non-scheduled commercial air transport", () => {
    const codes = OPERATION_TYPES.map((o) => o.code);
    expect(codes).toContain("CAT_SCHEDULED");
    expect(codes).toContain("CAT_NON_SCHEDULED");
  });
});

describe("validating a submitted value", () => {
  it("accepts a code the field declares", () => {
    expect(isValidAdrepValue("injuryLevel", "FATAL")).toBe(true);
    expect(isValidAdrepValue("metCondition", "IMC")).toBe(true);
  });

  it("refuses a code from a different field", () => {
    expect(isValidAdrepValue("injuryLevel", "IMC")).toBe(false);
  });

  /* NO ESCAPE HATCH, UNLIKE THE AERODROME LIST, and the difference is
     that these vocabularies are closed. Annex 13 defines four injury
     states and there is no fifth, so free text here would not be an
     escape from an incomplete list — it would be a refusal to make the
     determination, which is what UNKNOWN is for. */
  it("refuses free text, because these vocabularies are closed", () => {
    expect(isValidAdrepValue("injuryLevel", "quite bad")).toBe(false);
    expect(isValidAdrepValue("lightCondition", "")).toBe(false);
  });

  it("refuses an unknown field rather than throwing", () => {
    expect(isValidAdrepValue("windSpeed", "NONE")).toBe(false);
    expect(adrepField("windSpeed")).toBeNull();
  });
});

describe("rendering a stored value", () => {
  it("resolves a code to the words somebody reads", () => {
    expect(adrepLabel("metCondition", "VMC")).toBe("VMC — visual");
  });

  /* NULL SAYS NOBODY HAS CODED IT, and it must not read like a
     determination. */
  it("says a null is not yet coded rather than inventing a value", () => {
    expect(adrepLabel("injuryLevel", null)).toBe("Not yet coded");
    expect(adrepLabel("injuryLevel", undefined)).toBe("Not yet coded");
  });

  /* An unrecognised stored code shows itself rather than disappearing —
     a value the screen cannot name is still a value somebody wrote, and
     rendering a blank would hide it. */
  it("shows a code it cannot name rather than blanking it", () => {
    expect(adrepLabel("injuryLevel", "WHATEVER")).toBe("WHATEVER");
  });
});

describe("how much of the picture exists", () => {
  it("counts nothing on a report nobody has coded", () => {
    expect(adrepCompleteness({})).toEqual({ coded: 0, total: 5 });
  });

  it("counts every field on a fully coded report", () => {
    expect(
      adrepCompleteness({
        injuryLevel: "NONE",
        aircraftDamage: "NONE",
        lightCondition: "NIGHT",
        metCondition: "VMC",
        operationType: "CAT_SCHEDULED",
      }),
    ).toEqual({ coded: 5, total: 5 });
  });

  /* THE ASSERTION THIS MODULE EXISTS FOR. Somebody read the narrative
     and could not establish the light condition; that is a
     determination and it counts. A dashboard that treats UNKNOWN as
     uncoded tells a safety office to re-triage work already done. */
  it("counts an explicit UNKNOWN as coded, because somebody looked", () => {
    expect(adrepCompleteness({ lightCondition: "UNKNOWN" }).coded).toBe(1);
  });

  /* AND THE OTHER HALF OF IT. Null is not a determination and must
     never count as one. */
  it("does not count a null, because nobody looked", () => {
    expect(adrepCompleteness({ lightCondition: null }).coded).toBe(0);
    expect(adrepCompleteness({ lightCondition: undefined }).coded).toBe(0);
  });

  it("distinguishes the two, which is the whole point of the column being nullable", () => {
    expect(adrepCompleteness({ metCondition: "UNKNOWN" }).coded).not.toBe(
      adrepCompleteness({ metCondition: null }).coded,
    );
  });
});
