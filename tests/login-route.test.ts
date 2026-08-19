import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("the sign-in route", () => {
  it("registers /login as a working path to the sign-in screen", () => {
    const main = readFileSync(new URL("../apps/web/src/main.js", import.meta.url), "utf8");
    expect(main).toContain(".register('/login', (el) => renderLogin(el)");
    const prerender = readFileSync(new URL("../scripts/prerender.mjs", import.meta.url), "utf8");
    expect(prerender).toMatch(/'\/login':\s*'/);
  });
});
