/* ============================================================
   Web build. Root is src/, so index.html sits beside the code it
   loads and the public/ directory is copied verbatim.

   The alias mirrors vitest.config.ts. Two files naming the same path
   is a drift risk, and the mitigation is that the test suite imports
   through the alias — so if they disagree, the suite stops resolving
   rather than the build silently picking up a stale copy.
   ============================================================ */
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

export default defineConfig({
  root: path.resolve(here, 'src'),
  publicDir: path.resolve(here, 'public'),
  resolve: {
    alias: {
      '@usalamasms/shared': path.resolve(repoRoot, 'packages/shared/src/index.ts')
    }
  },
  build: {
    outDir: path.resolve(repoRoot, 'dist'),
    emptyOutDir: true,
    target: 'es2020'
  }
});
