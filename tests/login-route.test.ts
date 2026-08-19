import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("the sign-in route", () => {
  it("registers /login as a working path to the sign-in screen", () => {
    const main = readFileSync("/home/runner/work/UsalamaSMS/UsalamaSMS/apps/web/src/main.js", "utf8");
    expect(main).toContain(".register('/login', (el) => renderLogin(el)");
  });
});
