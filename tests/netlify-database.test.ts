import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

describe("Netlify Database deployment", () => {
  it("uses the deploy-aware managed connection", () => {
    const core = readFileSync(resolve(root, "apps/api/src/core.ts"), "utf8");
    const handler = readFileSync(resolve(root, "netlify/functions/api.mts"), "utf8");
    expect(core).toContain("getConnectionString");
    expect(handler).toContain('Netlify.env.get("NETLIFY_DB_URL")');
  });

  it("ships every existing Prisma migration through Netlify", () => {
    const names = (path: string) =>
      readdirSync(resolve(root, path), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    expect(names("netlify/database/migrations")).toEqual(names("prisma/migrations"));
  });
});
