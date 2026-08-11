// =====================================================================
// The guard on the guards.
//
// Every suite in this directory is `describe.skipIf(!hasDatabase)`. That
// is right for a laptop with no Postgres installed — and it is exactly
// how an integration suite dies: someone drops the database service from
// CI, every test skips, vitest reports green, and the strongest checks
// in the project stop running without a single red mark.
//
// So CI sets REQUIRE_DB=1, and this file fails when that promise is not
// kept. Charter rule 11: a check that stops checking must fail.
// =====================================================================
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { hasDatabase } from "./db.setup";

describe("the integration suite is actually running", () => {
  it("has a database when the environment promised one", () => {
    if (process.env["REQUIRE_DB"] !== "1") return; // local convenience
    expect(
      hasDatabase,
      "REQUIRE_DB=1 but DATABASE_URL is unset — every integration test " +
        "silently skipped and the run would have reported green",
    ).toBe(true);
  });

  it("still contains integration suites to run", () => {
    // If the files are gone, the skip guard above is guarding nothing.
    const here = resolve(__dirname);
    const suites = readdirSync(here).filter((f) => f.endsWith(".integration.test.ts"));
    expect(suites.length, "no *.integration.test.ts files found").toBeGreaterThanOrEqual(2);
  });
});
