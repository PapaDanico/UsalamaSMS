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
  /* ============================================================
     THE DEV SERVER COULD NOT REACH ITS OWN API.

     There was no proxy here, so `npm run dev` served the app and every
     fetch('/api/v1/...') hit Vite, which answered 404. Sign-in failed,
     the outbox never drained, and the strip said reports were waiting
     to send with nothing to send them to — locally, permanently, for
     anyone who tried to run this.

     That is also why the browser-to-API seam had never been driven:
     the smoke suite mocks /api/* with page.route and the integration
     suite posts to Fastify with a token it mints itself, so both
     halves passed while no running instance of this app had ever
     spoken to a running instance of its server.

     8080 is the API's own default (apps/api/src/server.ts). In
     production the same path is served by netlify/functions/api.mts,
     which declares config.path = "/api/*" — so the deployed shape and
     this one route identically and neither needs the app to know
     where the server is. */
  server: {
    proxy: {
      '/api': {
        target: process.env.API_ORIGIN ?? 'http://127.0.0.1:8080',
        changeOrigin: true
      }
    }
  },

  build: {
    outDir: path.resolve(repoRoot, 'dist'),
    emptyOutDir: true,
    target: 'es2020',

    /* ============================================================
       THE RBAC MATRIX IS NOT THE RAMP AGENT'S TO CARRY.

       permissions.ts was split out of the shared index precisely to
       keep it off the first paint: `new Set([...])` at module scope is
       a side-effectful expression Rollup cannot tree-shake, so the
       whole eight-role matrix rides along with whatever imports it.

       That split held while ONE lazy screen imported it. The moment a
       second did — /account, to decide whether to offer the export —
       Rollup did what it does with a module two lazy chunks share and
       hoisted it into the common parent, which is the entry. The
       matrix came back, 3.4 KB, charged to every person opening the
       report form at a strip, to answer a question two screens ask.

       Naming it here keeps it a chunk of its own: fetched by /sms and
       /account when somebody opens them, and never by anyone else. The
       fix is the chunk, not a bigger budget — the budget existed to
       catch exactly this, and raising it would have bought silence.
       ============================================================ */
    rollupOptions: {
      output: {
        manualChunks: {
          rbac: [path.resolve(repoRoot, 'packages/shared/src/permissions.ts')]
        }
      }
    }
  }
});
