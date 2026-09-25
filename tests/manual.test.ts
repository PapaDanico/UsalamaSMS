/* The manual analysers read text; they never judge it. Every assertion
   here is about what the text MENTIONS and where, and one test pins
   that an empty or scanned manual is reported as unreadable rather than
   as a manual that mentions nothing. */
import { describe, it, expect } from "vitest";
import {
  searchManual, searchTerms,
  checkManual, outline, smsCoverage, erpContacts, analyseManual,
  PDF_TYPE, DOCX_TYPE, MANUAL_MAX_BYTES,
} from "../packages/shared/src/manual";
import { SMS_ELEMENTS } from "../packages/shared/src/maturity";

const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const ZIP_HEAD = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

describe("checkManual — the bytes must be what the type says", () => {
  it("accepts a PDF that starts %PDF- and a DOCX that is a zip", () => {
    expect(checkManual(PDF_TYPE, PDF_HEAD, 1000).ok).toBe(true);
    expect(checkManual(DOCX_TYPE, ZIP_HEAD, 1000).ok).toBe(true);
  });
  it("refuses a PDF label on zip bytes, and the reverse", () => {
    expect(checkManual(PDF_TYPE, ZIP_HEAD, 1000).ok).toBe(false);
    expect(checkManual(DOCX_TYPE, PDF_HEAD, 1000).ok).toBe(false);
  });
  it("refuses other types, empty files and files over the ceiling", () => {
    expect(checkManual("image/png", PDF_HEAD, 1000).ok).toBe(false);
    expect(checkManual(PDF_TYPE, PDF_HEAD, 0).ok).toBe(false);
    expect(checkManual(PDF_TYPE, PDF_HEAD, MANUAL_MAX_BYTES + 1).ok).toBe(false);
  });
});

describe("outline", () => {
  it("finds numbered and named headings with their page, and skips contents-page lines", () => {
    const pages = [
      "Contents\n1 Safety policy ........ 3\n2 Risk management ........ 9",
      "CHAPTER 1 — SAFETY POLICY AND OBJECTIVES\n1.1 Management commitment\nThe accountable executive signs the policy.",
      "2.2 Risk assessment and mitigation\nRisks are assessed on the matrix.",
    ];
    const o = outline(pages);
    expect(o.map((e) => e.title)).toEqual([
      "SAFETY POLICY AND OBJECTIVES", "Management commitment", "Risk assessment and mitigation",
    ]);
    expect(o[1]).toMatchObject({ number: "1.1", page: 2 });
    expect(o.some((e) => /\.\.\./.test(e.title))).toBe(false);
  });
  it("does not take a sentence for a heading", () => {
    expect(outline(["3 Hazards are reported through the safety reporting system, and reviewed weekly."])).toEqual([]);
  });
});

describe("smsCoverage — one row per Annex 19 element, from the product's own registry", () => {
  it("reports every element, found or not, in registry order", () => {
    const rows = smsCoverage(["nothing relevant"]);
    expect(rows.map((r) => r.id)).toEqual(SMS_ELEMENTS.map((e) => e.id));
    expect(rows.every((r) => !r.found)).toBe(true);
  });
  it("gives the first page and an excerpt for a mention", () => {
    const rows = smsCoverage(["intro", "Section 5. Management of Change applies to new routes."]);
    const moc = rows.find((r) => r.id === "3.2")!;
    expect(moc).toMatchObject({ found: true, page: 2, term: "management of change" });
    expect(moc.excerpt).toContain("Management of Change");
  });
  it("does not count a contents-page line as a mention", () => {
    const rows = smsCoverage(["Contents\n3.2 Management of change ........ 14", "intro"]);
    expect(rows.find((r) => r.id === "3.2")!.found).toBe(false);
  });
  it("matches whole words only — 'erp' is not found inside 'interpret'", () => {
    const erp = smsCoverage(["We interpret the rules carefully."]).find((r) => r.id === "1.4")!;
    expect(erp.found).toBe(false);
  });
});

describe("erpContacts", () => {
  it("lists phone numbers and emails with their line, and ignores dates and section numbers", () => {
    const { contacts } = erpContacts([
      "Duty manager: +254 722 123 456\nKCAA duty officer 020 682 7470, email ops@kcaa.example\nRevised 2026-09-24, section 3.2.1",
    ]);
    const values = contacts.map((c) => c.value);
    expect(values).toContain("+254 722 123 456");
    expect(values).toContain("020 682 7470");
    expect(values).toContain("ops@kcaa.example");
    expect(values.some((v) => v.includes("2026"))).toBe(false);
    expect(contacts.find((c) => c.value === "+254 722 123 456")!.context).toContain("Duty manager");
  });
  it("says which expected parties are NOT named — the gap is the useful result", () => {
    const { parties } = erpContacts(["Notify the AAID and the police. Call the hospital."]);
    const by = Object.fromEntries(parties.map((p) => [p.party, p.found]));
    expect(by["Accident investigation authority"]).toBe(true);
    expect(by["Police"]).toBe(true);
    expect(by["Hospital / medical"]).toBe(true);
    expect(by["Insurer"]).toBe(false);
  });
});

describe("analyseManual", () => {
  it("adds the SMS coverage only to an SMS manual, and contacts only to an ERP", () => {
    const pages = ["1.1 Safety policy", "Call +254 722 000 111"];
    expect(analyseManual("SMS_MANUAL", pages).sms).toBeDefined();
    expect(analyseManual("SMS_MANUAL", pages).erp).toBeUndefined();
    expect(analyseManual("ERP", pages).erp).toBeDefined();
    expect(analyseManual("OTHER", pages).sms).toBeUndefined();
  });
  it("marks a manual with no text layer as unreadable rather than as mentioning nothing", () => {
    expect(analyseManual("SMS_MANUAL", ["", " ", ""]).noText).toBe(true);
    expect(analyseManual("SMS_MANUAL", ["1.1 Safety policy and objectives. ".repeat(20)]).noText).toBe(false);
  });
});

describe("searchManual", () => {
  const text = ["Fuel is stored in bowsers.", "A fuel spill is reported to the duty manager at once.", "Spill kits are checked weekly."].join("\n\f\n");
  it("answers only with a page carrying every word", () => {
    expect(searchManual(text, searchTerms("Fuel SPILL"))).toEqual([
      { page: 2, snippet: "A fuel spill is reported to the duty manager at once." },
    ]);
    expect(searchManual(text, searchTerms("bowsers weekly"))).toEqual([]);
  });
  it("drops one-letter words and repeats, and refuses nothing to search for", () => {
    expect(searchTerms("a fuel, FUEL spill!")).toEqual(["fuel", "spill"]);
    expect(searchTerms(undefined)).toEqual([]);
    expect(searchManual(text, [])).toEqual([]);
  });
  it("trims a long page to the words, marked as cut", () => {
    const long = "x ".repeat(200) + "next of kin" + " y".repeat(200);
    const [hit] = searchManual(long, searchTerms("kin"));
    expect(hit?.snippet.startsWith("…")).toBe(true);
    expect(hit?.snippet.endsWith("…")).toBe(true);
    expect(hit?.snippet).toContain("next of kin");
  });
});
