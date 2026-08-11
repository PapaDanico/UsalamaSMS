import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@usalamasms/shared": path.resolve(__dirname, "packages/shared/src/index.ts") } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    // A shared database cannot take parallel files truncating each other.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
