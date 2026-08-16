/* ============================================================
   WHAT MAY BE STORED AND RENDERED AS AN OPERATOR'S MARK.

   This runs on both sides — the upload screen calls it so somebody is
   told before a slow link carries the bytes, the route calls it because
   the route is reachable with curl. So these assertions are the whole
   of the rule, and the two most important of them are refusals.

   SVG IS THE ONE THAT MATTERS. It is the format a designer is most
   likely to hand over, and it is markup: an SVG can carry <script>,
   event handlers and external references, and this image is rendered
   into the operator's OWN pages and printed packs. Accepting it is
   stored XSS with a file picker in front of it. Sanitising it is a
   claim about a parser that has been wrong in many products, so it is
   refused outright and the person is told to export a PNG.

   THE CEILING IS THE OTHER. The asset budget exists because 3.7 MB of
   brand masters once began being served to a reporter on one bar of
   signal. A logo rides on every page an operator prints; unbounded, it
   is that failure again, one tenant at a time.
   ============================================================ */
import { describe, it, expect } from "vitest";
import { checkLogo, LOGO_TYPES, LOGO_MAX_CHARS } from "../packages/shared/src/logo";

/** A minimal valid payload of a given type, padded to a wanted length. */
const uri = (type: string, chars = 40): string =>
  `data:${type};base64,${"A".repeat(Math.ceil(chars / 4) * 4)}`;

describe("what is accepted", () => {
  it("accepts every type on the allowlist", () => {
    for (const type of LOGO_TYPES) {
      const v = checkLogo(uri(type));
      expect(v.ok, `${type} was refused`).toBe(true);
    }
  });

  it("reports the type and the size it accepted", () => {
    const v = checkLogo(uri("image/png"));
    expect(v.ok && v.type).toBe("image/png");
    expect(v.ok && v.chars).toBeGreaterThan(0);
  });
});

describe("what is refused", () => {
  /* THE SECURITY ONE. */
  it("REFUSES SVG, and says why rather than listing what is allowed", () => {
    const v = checkLogo(uri("image/svg+xml"));
    expect(v.ok).toBe(false);
    /* The message has to be actionable: somebody holding an SVG needs
       to know to export a PNG, not that their file "is not accepted". */
    expect(!v.ok && v.message).toMatch(/script/i);
    expect(!v.ok && v.message).toMatch(/PNG/);
  });

  it("refuses other image types not on the allowlist", () => {
    for (const type of ["image/gif", "image/tiff", "image/bmp", "image/avif"]) {
      expect(checkLogo(uri(type)).ok, `${type} was accepted`).toBe(false);
    }
  });

  it("refuses anything that is not an image type at all", () => {
    for (const type of ["text/html", "application/javascript", "text/plain"]) {
      expect(checkLogo(uri(type)).ok, `${type} was accepted`).toBe(false);
    }
  });

  /* THE BUDGET ONE. */
  it("refuses a payload over the ceiling, and says how far over", () => {
    const v = checkLogo(uri("image/png", LOGO_MAX_CHARS + 400));
    expect(v.ok).toBe(false);
    expect(!v.ok && v.message).toMatch(/KB/);
  });

  it("accepts one just under the ceiling", () => {
    expect(checkLogo(uri("image/png", LOGO_MAX_CHARS - 100)).ok).toBe(true);
  });

  it("refuses nothing, empty and non-strings", () => {
    for (const bad of [undefined, null, "", 42, {}, []]) {
      expect(checkLogo(bad).ok, `${JSON.stringify(bad)} was accepted`).toBe(false);
    }
  });

  /* A TRUNCATED PAYLOAD DECODES TO A BROKEN IMAGE, which renders as
     nothing on a printed pack — silently, which is the problem. */
  it("refuses a base64 body that is not a whole number of groups", () => {
    expect(checkLogo("data:image/png;base64,AAAAA").ok).toBe(false);
  });
});

/* ============================================================
   THE PATTERN IS ANCHORED, and this is the assertion that proves it.

   A check that merely FINDS a data URI inside a longer string accepts
   a payload with anything in front of it. These are the shapes that
   would slip past an unanchored test, and each is a string that would
   end up in a `src` attribute on the operator's own page.
   ============================================================ */
describe("nothing gets in front of or behind the payload", () => {
  const valid = uri("image/png");

  it("refuses a scheme smuggled in front", () => {
    for (const prefix of ["javascript:alert(1)//", " ", "\n", "x"]) {
      expect(
        checkLogo(prefix + valid).ok,
        `accepted with ${JSON.stringify(prefix)} in front`,
      ).toBe(false);
    }
  });

  it("refuses anything appended after the payload", () => {
    for (const suffix of ['"><script>alert(1)</script>', " onerror=alert(1)", "\n<img>"]) {
      expect(
        checkLogo(valid + suffix).ok,
        `accepted with ${JSON.stringify(suffix)} appended`,
      ).toBe(false);
    }
  });

  it("refuses a non-base64 payload dressed as one", () => {
    expect(checkLogo("data:image/png;base64,<svg onload=alert(1)>").ok).toBe(false);
    expect(checkLogo("data:image/png;utf8,<svg onload=alert(1)>").ok).toBe(false);
  });
});
