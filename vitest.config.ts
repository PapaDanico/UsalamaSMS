import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@usalamasms/shared": path.resolve(__dirname, "packages/shared/src/index.ts") } },
  test: { include: ["tests/**/*.test.ts"] },
});
