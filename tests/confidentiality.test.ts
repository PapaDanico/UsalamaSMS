// =====================================================================
// Confidentiality — the guarantees this product would be dishonest
// without.
//
// ICAO Annex 19 protects the person who reports. A voluntary
// confidential report is filed by someone who has been told it cannot
// be traced back to them, and their willingness to file the next one
// depends entirely on that holding. So these are not "nice to have"
// tests; they are the ones whose failure means the product should not
// ship.
// =====================================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deIdentify, deIdentifyNarrative } from "../apps/api/src/deident";

const ROOT = resolve(__dirname, "..");
const read = (p: string): string => readFileSync(resolve(ROOT, p), "utf8");

describe("de-identification — pattern scrubbing", () => {
  it("removes registrations, flight numbers, dates, phones, emails, titled names", () => {
    const input =
      "On 2026-07-01 Capt. John Otieno operating KQ123 on 5Y-ABC called " +
      "+254712345678 and emailed j.otieno@ops.example about the event.";
    const { text } = deIdentify(input);
    expect(text).not.toContain("5Y-ABC");
    expect(text).not.toContain("KQ123");
    expect(text).not.toContain("2026-07-01");
    expect(text).not.toContain("0712345678");
    expect(text).not.toContain("@ops.example");
    expect(text).not.toContain("Otieno");
    expect(text).toContain("[REG]");
    expect(text).toContain("[CREW]");
  });

  it("covers East African registrations, not Kenya's alone", () => {
    // The original module matched 5Y- only, on a platform whose stated
    // market is the East African corridor. Every Ugandan, Tanzanian,
    // Rwandan and Ethiopian registration went through in clear.
    for (const reg of ["5X-ABC", "5H-MTZ", "9XR-AB", "ET-AXK", "9Q-CGA"]) {
      const { text } = deIdentify(`The aircraft ${reg} was on stand.`);
      expect(text, `${reg} survived de-identification`).not.toContain(reg);
      expect(text).toContain("[REG]");
    }
  });

  it("REPORTS the surname it cannot remove instead of pretending it did", () => {
    // The bug the old test could not see. Its fixture happened to write
    // "Capt. John Otieno", so the titled-name pattern fired and the
    // assertion passed. A narrative that names someone WITHOUT a title
    // was never scrubbed, and nothing said so.
    const input = "Otieno was on the headset when the clearance was misread.";
    const result = deIdentify(input);

    // Honest about the limit: the name is still there...
    expect(result.text).toContain("Otieno");
    // ...and the module says so, loudly, rather than reporting success.
    expect(result.cleanByPattern).toBe(false);
    expect(result.residual.some((r) => r.text.includes("Otieno"))).toBe(true);
  });

  it("flags self-identification by uniqueness of role", () => {
    // No regex will ever fix this one, and a scrubber that stays quiet
    // about it is teaching the reviewer to trust something it cannot do.
    const result = deIdentify("I was the only engineer on shift that night.");
    expect(result.cleanByPattern).toBe(false);
    expect(result.residual.some((r) => /uniqueness of role/.test(r.reason))).toBe(true);
  });

  it("reports a clean sweep only when nothing identifier-shaped remains", () => {
    const result = deIdentify(
      "The aircraft was pushed back and the crew reported a warning on the panel.",
    );
    expect(result.cleanByPattern).toBe(true);
    expect(result.residual).toHaveLength(0);
  });

  it("counts what it removed, per category", () => {
    const result = deIdentify("5Y-ABC and 5X-DEF were both on 2026-07-01.");
    expect(result.removed.REG).toBe(2);
    expect(result.removed.DATE).toBe(1);
  });

  it("is not stateful across calls", () => {
    // Module-level /g regexes share lastIndex. Without a reset, the
    // second call skips matches the first consumed — an intermittent
    // leak that only shows under load, which is the worst kind.
    const input = "Registration 5Y-ABC on stand.";
    const a = deIdentifyNarrative(input);
    const b = deIdentifyNarrative(input);
    const c = deIdentifyNarrative(input);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).not.toContain("5Y-ABC");
  });
});

// =====================================================================
// Source-level guards.
//
// These read the source rather than calling it. That is unusual and it
// is deliberate: the defects below were defects OF ABSENCE — a column
// written where it should not have been, a check not performed. You
// cannot unit-test the absence of a line without a live Postgres, and
// this suite must run in CI on a laptop with no database. The guards
// are narrow, they name what they look for, and they FAIL when the thing
// they examine is gone (charter rule 11) rather than passing silently.
// =====================================================================
describe("anonymous reporting cannot be reversed by a join", () => {
  const syncRoute = read("apps/api/src/routes.sync.ts");
  const schema = read("prisma/schema.prisma");

  it("guards a file that still exists", () => {
    // Rule 11. If routes.sync.ts is renamed, every assertion below would
    // otherwise vacuously pass against an empty string.
    expect(syncRoute.length).toBeGreaterThan(500);
    expect(syncRoute).toContain("/api/v1/sync/batch");
    expect(schema).toContain("model SyncReceipt");
  });

  it("never writes userId to a sync receipt unconditionally", () => {
    // The original line was:
    //   data: { clientId, deviceId, userId: auth.sub, entityType, op }
    // and safetyReport.clientId == syncReceipt.clientId, so
    //   JOIN "SyncReceipt" USING ("clientId")
    // re-identified every anonymous reporter in the system.
    // Slice forward FROM the receipt write. Anchoring the end on
    // "appendAuditTx" alone matched the import statement at the top of
    // the file, producing a backwards slice — an empty string, which
    // `toContain` would have reported as a genuine failure but which
    // could just as easily have been an empty string that vacuously
    // passed a `not.toContain`. Both ends are anchored deliberately.
    const receiptStart = syncRoute.indexOf("tx.syncReceipt.create");
    expect(receiptStart).toBeGreaterThan(0);
    const receiptBlock = syncRoute.slice(
      receiptStart,
      syncRoute.indexOf("await appendAuditTx", receiptStart),
    );
    expect(receiptBlock.length).toBeGreaterThan(50);
    expect(receiptBlock).toContain("isAnonymous");
    expect(receiptBlock).toContain("userId: null");
    expect(receiptBlock).toContain("deviceId: null");
  });

  it("keeps the receipt columns nullable so they CAN be null", () => {
    const model = schema.slice(schema.indexOf("model SyncReceipt"));
    expect(model).toMatch(/userId\s+String\?/);
    expect(model).toMatch(/deviceId\s+String\?/);
  });

  it("scopes the idempotency key to the org, not globally", () => {
    // A globally unique clientId let any authenticated caller probe
    // whether an id existed inside another operator's tenancy.
    const model = schema.slice(schema.indexOf("model SyncReceipt"));
    expect(model).toContain("@@unique([orgId, clientId])");
    expect(syncRoute).toContain("orgId: auth.org");
  });

  it("omits the actor from the audit entry for an anonymous report", () => {
    expect(syncRoute).toContain("d.isAnonymous ? undefined : auth.sub");
  });
});

describe("an anonymous report is never written to disk as a draft", () => {
  const form = read("apps/web/src/tools/report/index.js");

  it("guards a file that still exists", () => {
    expect(form).toContain("submitReportOffline");
    expect(form).toContain("saveDraft");
  });

  it("refuses to draft an anonymous report to localStorage", () => {
    // Drafting is a kindness on a handset that locks mid-report. For an
    // anonymous report it is a confidentiality hole: the narrative sits
    // in localStorage in clear, on what is in practice a shared
    // crew-room device, readable with no authentication. A report
    // abandoned halfway — which is exactly what happens when someone
    // changes their mind about filing — would stay there indefinitely.
    const draftFn = form.slice(form.indexOf("function saveDraft"), form.indexOf("function loadDraft"));
    expect(draftFn).toContain("isAnonymous");
    expect(draftFn).toContain("clearDraft()");
  });

  it("clears an existing draft the moment anonymity is ticked", () => {
    // Stopping future writes is not enough: whatever was typed before
    // the box was ticked is already on disk.
    expect(form).toMatch(/isAnonymous\.addEventListener\('change'[\s\S]{0,160}clearDraft\(\)/);
  });
});

describe("the audit chain verifies content, not just links", () => {
  const core = read("apps/api/src/core.ts");
  const material = read("apps/api/src/audit-material.ts");

  it("guards files that still exist", () => {
    expect(core).toContain("verifyAuditChain");
    expect(material).toContain("auditMaterial");
  });

  it("recomputes the hash rather than trusting the stored one", () => {
    const verifier = core.slice(core.indexOf("export async function verifyAuditChain"));
    // The old verifier compared r.prevHash to the previous r.hash and
    // stopped there — so editing `action` on any row left every link
    // intact and the function returned ok.
    expect(verifier).toContain("auditMaterial(");
    expect(verifier).toContain("contentAlteredAtSeq");
  });

  it("treats an empty chain as unverified, not as clean", () => {
    const verifier = core.slice(core.indexOf("export async function verifyAuditChain"));
    expect(verifier).toContain("rows.length === 0");
  });

  it("serialises appends per org so the chain cannot fork", () => {
    expect(core).toContain("pg_advisory_xact_lock");
  });

  it("stores no regulatory deadline column", () => {
    // Charter rule 6. A stored deadline survives a correction to the
    // times it was derived from, and survives the regulator changing
    // the rule.
    expect(read("prisma/schema.prisma")).not.toMatch(/^\s+regulatorDeadline\s/m);
  });
});
