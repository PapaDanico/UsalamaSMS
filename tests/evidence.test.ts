/* =====================================================================
   THE EVIDENCE RULE.

   This file exists because the feature it covers had NO TESTS AT ALL,
   and three separate defects shipped inside that gap — one of which
   made the whole upload path unusable above 786 KB while every file in
   the repository said 3 MB. The route brokers megabytes, hashes them,
   builds a storage key out of tenant identifiers and puts the hash in
   an append-only chain. It was the least-covered module in the product
   and the one doing the most.

   What is asserted here is the RULE. Whether the route applies it is
   tests/integration/attachments.route.integration.test.ts, against a
   real database and a real body limit, because a rule stated correctly
   in a module nothing enforces is the shape of defect this whole
   repository keeps finding.
   ===================================================================== */
import { describe, it, expect } from "vitest";
import {
  checkEvidence,
  checkEvidenceCount,
  evidenceKey,
  isBase64,
  EVIDENCE_TYPES,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_BODY_BYTES,
  EVIDENCE_MAX_FILES,
  EVIDENCE_CAVEAT,
} from "../packages/shared/src/evidence";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("what may be attached", () => {
  it("accepts every type the bucket accepts, and nothing else", () => {
    for (const type of EVIDENCE_TYPES) {
      expect(checkEvidence(type, 1024).ok).toBe(true);
    }
    expect(checkEvidence("application/zip", 1024).ok).toBe(false);
    expect(checkEvidence("text/html", 1024).ok).toBe(false);
  });

  it("refuses SVG by name, because it is markup rather than a picture", () => {
    const verdict = checkEvidence("image/svg+xml", 1024);
    expect(verdict.ok).toBe(false);
    /* The reporter is told WHY rather than that the format is wrong —
       an SVG looks like a picture in every file browser, so "not
       accepted" without the reason reads as an arbitrary restriction. */
    if (!verdict.ok) expect(verdict.message).toMatch(/script/i);
  });

  it("refuses a file at the ceiling plus one byte, and accepts it at the ceiling", () => {
    expect(checkEvidence("image/jpeg", EVIDENCE_MAX_BYTES).ok).toBe(true);
    expect(checkEvidence("image/jpeg", EVIDENCE_MAX_BYTES + 1).ok).toBe(false);
  });

  it("refuses an empty file rather than storing nothing under a hash", () => {
    expect(checkEvidence("image/jpeg", 0).ok).toBe(false);
    expect(checkEvidence("image/jpeg", -1).ok).toBe(false);
    expect(checkEvidence("image/jpeg", Number.NaN).ok).toBe(false);
    expect(checkEvidence("image/jpeg", "1024").ok).toBe(false);
  });

  it("says how many files a report holds when it is full, not that the file is wrong", () => {
    expect(checkEvidenceCount(0).ok).toBe(true);
    expect(checkEvidenceCount(EVIDENCE_MAX_FILES - 1).ok).toBe(true);
    const full = checkEvidenceCount(EVIDENCE_MAX_FILES);
    expect(full.ok).toBe(false);
    /* Two different refusals need two different sentences: a reporter
       told "that file is wrong" when the truth is "this report is full"
       will keep trying different photographs. */
    if (!full.ok) expect(full.message).toContain(String(EVIDENCE_MAX_FILES));
  });

  it("promises only what stripping metadata actually does", () => {
    /* The upload re-encodes through a canvas, which removes EXIF and
       cannot touch what is in the frame. The screen has to say the
       second half or the product's de-identification posture is a lie. */
    expect(EVIDENCE_CAVEAT).toMatch(/face|registration/i);
  });
});

describe("the request body a max-sized attachment needs", () => {
  /* ==================================================================
     THE REGRESSION THAT COST THE FEATURE.

     server.ts caps JSON at 1 MB — right for a narrative and a sync
     batch — and the attachment route inherited it. Base64 costs four
     characters per three bytes, so a 3 MB photograph needed about 4 MB
     of request and was refused with FST_ERR_CTP_BODY_TOO_LARGE. The
     real ceiling was 786 KB: under the number this module states, under
     the number the form quotes to the reporter, and announced in none
     of the sentences written to explain a refusal.
     ================================================================== */
  it("is large enough to carry a file at the ceiling, base64 and all", () => {
    const encoded = Buffer.alloc(EVIDENCE_MAX_BYTES).toString("base64");
    expect(encoded.length).toBeLessThanOrEqual(EVIDENCE_MAX_BODY_BYTES);
    /* And the JSON around it: the content type, the label, the braces. */
    const envelope = JSON.stringify({
      contentType: "application/pdf",
      label: "x".repeat(120),
      data: "",
    }).length;
    expect(encoded.length + envelope).toBeLessThanOrEqual(EVIDENCE_MAX_BODY_BYTES);
  });

  it("stays inside the 6 MB a Netlify Function will accept", () => {
    /* The reason the file ceiling is 3 MB rather than larger, argued in
       evidence.ts. If this ever fails, the fix is a signed URL plus a
       server-side hash pass — not a bigger number. */
    expect(EVIDENCE_MAX_BODY_BYTES).toBeLessThan(6 * 1024 * 1024);
  });

  it("is computed from the file ceiling rather than typed beside it", () => {
    /* Charter rule 10. Two numbers describing one decision is how they
       come to disagree, and they did, for the whole life of the
       feature. */
    expect(EVIDENCE_MAX_BODY_BYTES).toBe(Math.ceil(EVIDENCE_MAX_BYTES / 3) * 4 + 4096);
  });
});

describe("whether a string is actually base64", () => {
  /* ==================================================================
     Buffer.from(x, "base64") NEVER THROWS. It discards whatever is not
     in the alphabet and returns the rest, so the route's try/catch
     could not fire — and a truncated upload would have been stored,
     hashed, and put in the audit chain as though it were the file the
     reporter chose. The chain would have attested to the corruption
     rather than detected it.
     ================================================================== */
  it("proves the decode this replaces could not refuse anything", () => {
    /* The defect itself, asserted, so nobody reintroduces the catch
       believing it does something. */
    expect(() => Buffer.from("!!!! not base64 at all ????", "base64")).not.toThrow();
    expect(Buffer.from("!!!!", "base64").byteLength).toBe(0);
  });

  it("accepts what btoa emits, at every padding length", () => {
    for (const n of [1, 2, 3, 4, 5, 300]) {
      expect(isBase64(Buffer.alloc(n, 7).toString("base64"))).toBe(true);
    }
  });

  it("refuses a truncated payload, which is the failure it exists for", () => {
    const good = Buffer.from("hello there").toString("base64");
    expect(isBase64(good)).toBe(true);
    expect(isBase64(good.slice(0, good.length - 1))).toBe(false);
  });

  it("refuses whitespace, newlines and the URL-safe alphabet", () => {
    /* The only producer is btoa() in evidence-panel.js, which emits
       none of these. Anything carrying them did not come from this
       product's upload path. */
    expect(isBase64("aGVs bG8=")).toBe(false);
    expect(isBase64("aGVs\nbG8=")).toBe(false);
    expect(isBase64("aGVsbG8_")).toBe(false);
    expect(isBase64("-_-_")).toBe(false);
  });

  it("refuses padding that is not at the end, or too much of it", () => {
    expect(isBase64("====")).toBe(false);
    expect(isBase64("aG=s")).toBe(false);
    expect(isBase64("a===")).toBe(false);
  });

  it("refuses anything that is not a non-empty string", () => {
    for (const value of ["", null, undefined, 0, 42, {}, [], true]) {
      expect(isBase64(value)).toBe(false);
    }
  });
});

describe("the storage key", () => {
  it("puts tenancy in the path as well as in the query", () => {
    const org = "11111111-1111-4111-8111-111111111111";
    const report = "22222222-2222-4222-8222-222222222222";
    expect(evidenceKey(org, report, UUID)).toBe(`${org}/${report}/${UUID}`);
  });

  it("refuses anything that is not a UUID, because that means a caller supplied it", () => {
    /* A filename is attacker-chosen text and `../` in one is how a
       storage path becomes somebody else's. Nothing a caller sends ever
       reaches this function; the throw is what keeps that true if a
       future change forgets. */
    expect(() => evidenceKey("../../etc", UUID, UUID)).toThrow();
    expect(() => evidenceKey(UUID, "..", UUID)).toThrow();
    expect(() => evidenceKey(UUID, UUID, `${UUID}/../other`)).toThrow();
    expect(() => evidenceKey("", UUID, UUID)).toThrow();
  });
});
