import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@usalamasms/shared": path.resolve(__dirname, "packages/shared/src/index.ts") } },
  test: {
    include: ["tests/**/*.test.ts"],
    // The integration suites share one database and truncate between
    // tests, so they cannot run in parallel with each other — and they
    // need a DATABASE_URL this config does not promise. They have their
    // own config (vitest.integration.config.ts) with fileParallelism
    // off. Without this exclusion they were picked up here, raced, and
    // failed in ways that looked like product bugs.
    exclude: ["tests/integration/**", "node_modules/**"],
  },
});
