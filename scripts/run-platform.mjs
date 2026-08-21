/* =====================================================================
   THE WHOLE PRODUCT, ON ONE ORIGIN, AGAINST A REAL DATABASE.

   `npm run dev` serves the FRONTEND through Vite and nothing else, so
   every `/api/*` call from a screen 404s. That is fine for laying out a
   page and useless for the question that actually matters — does this
   screen work when the record behind it is real? Every finding worth
   having in this repository came from a signed-in render against real
   rows: the a11y sweep that had never held a session and missed 522
   nodes on /sms, and the footer that measured 1.35 viewports on a
   handset and 64% of /triage.

   So this mounts the REAL Fastify app for `/api/*` and serves the BUILT
   bundle for everything else, on a single port. Same origin, because
   the frontend calls `/api/*` relatively and two servers pretending to
   be one is how a CORS problem gets invented that production does not
   have.

   -------------------------------------------------------------------
   IT SERVES dist/, NOT SOURCE, and that is deliberate — `smoke.mjs`
   makes the same choice and says why: a test against source is a test
   of something nobody ships. Run `npm run build` first; this refuses
   rather than serving a stale bundle silently.

   THE PORT IS 4500 AND NOT 4321. `smoke.mjs` binds 4321. Two harnesses
   on one port means whichever starts second dies with EADDRINUSE, or
   worse, the first one's `dist` is read by the second one's browser
   halfway through a rebuild. They are deliberately different.

   -------------------------------------------------------------------
   Usage:

     bash scripts/local-db.sh                  # throwaway Postgres
     export DATABASE_URL='postgresql://postgres@localhost:5433/usalamasms?host=/tmp'
     npx prisma migrate deploy
     node scripts/seed-demo.mjs                # prints logins once
     npm run build
     npm run platform                          # http://127.0.0.1:4500

   Then drive it with Playwright — see .claude/skills/run-platform.
   ===================================================================== */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(ROOT, 'dist');
const PORT = Number(process.env['PLATFORM_PORT'] || 4500);

if (!existsSync(join(DIST, 'index.html'))) {
  console.error(
    '\n  ✗ dist/index.html is missing.\n\n' +
      '    This serves what ships, not what compiles. Run `npm run build` first.\n',
  );
  process.exit(1);
}

if (!process.env['DATABASE_URL']) {
  console.error(
    '\n  ✗ DATABASE_URL is not set.\n\n' +
      '    bash scripts/local-db.sh   then export the URL it prints.\n',
  );
  process.exit(1);
}

/* The API signs its own tokens and de-identifies with these. Absent,
   `build()` throws — and a harness that dies on a missing secret is
   better than one that invents a value and diverges from production. */
process.env['JWT_SECRET'] ||= 'run-platform-local-only-not-a-real-secret';
process.env['DEIDENT_SALT'] ||= 'run-platform-local-only-not-a-real-salt';
process.env['LOG_LEVEL'] ||= 'warn';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const { build } = await import(resolve(ROOT, 'apps/api/src/server.ts'));
const app = await build();

/* Anything the API does not claim is a static asset or the shell.

   200 ON THE FALLBACK, NOT 301, and an existing file wins — this is
   `netlify.toml`'s redirect rule, and the reason it exists there is
   recorded in that file: the URL must stay what the person asked for or
   the router has nothing to route on. A harness whose fallback differs
   from production's is a harness that passes deep links production 404s,
   which is exactly how this project once shipped a 404 on every route
   but the root. */
app.setNotFoundHandler((req, reply) => {
  const url = (req.raw.url || '/').split('?')[0];
  if (url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });

  const candidate = join(DIST, url);
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return reply
      .type(TYPES[extname(candidate)] || 'application/octet-stream')
      .send(readFileSync(candidate));
  }
  return reply.type('text/html; charset=utf-8').send(readFileSync(join(DIST, 'index.html')));
});

await app.listen({ port: PORT, host: '127.0.0.1' });

console.log(`
  the platform is up — http://127.0.0.1:${PORT}

    frontend   dist/ (what ships), with netlify.toml's SPA fallback
    api        the real Fastify app on /api/*
    database   ${process.env['DATABASE_URL'].replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@')}

  /api/health and /api/ready answer. Sign in with an account from
  \`node scripts/seed-demo.mjs\` — it prints them once.
`);
