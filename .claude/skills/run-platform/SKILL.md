---
name: run-platform
description: Launch and drive the real UsalamaSMS product locally — the Fastify API and the built bundle on one origin, against a real Postgres with seeded data — and steer it with Playwright/Chromium. Use when asked to run the app, screenshot a screen, reproduce a UI defect, measure layout, or confirm a change works in the product rather than in a test. `npm run dev` serves the FRONTEND ONLY and every /api/* call 404s, so it cannot answer any of those.
---

# Running the platform

`npm run dev` is Vite over `apps/web` and **serves no API**. Every
`/api/*` call from a screen 404s under it, so a signed-in render is
impossible and any question about real data is unanswerable.

`npm run platform` mounts the real Fastify app on `/api/*` and serves
`dist/` for everything else, on one port.

## The whole sequence

```bash
bash scripts/local-db.sh
export DATABASE_URL='postgresql://postgres@localhost:5433/usalamasms?host=/tmp'
npx prisma migrate deploy
node scripts/seed-demo.mjs            # prints logins ONCE — capture them
npm run build                         # platform refuses without dist/
npm run platform &                    # http://127.0.0.1:4500
```

`seed-demo.mjs` is idempotent by email and will say "every demo account
already exists" on a second run, printing nothing. Use `--rotate` to
re-issue and print.

## Signed out is not the product

This repository has the scar: `check:a11y` reported "32 screens, no
violations" for weeks having never held a session, and missed 522 nodes
on `/sms` alone. Nearly six hundred nodes of the record a safety
manager works in every day.

Always sign in before concluding anything about a screen:

```js
await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
await page.fill('input[type=email], input[name=email]', EMAIL);
await page.fill('input[type=password], input[name=password]', PASSWORD);
await page.click('button[type=submit], button:has-text("Sign in")');
await page.waitForTimeout(1500);
```

Then assert the render GREW. A fixture whose shape is wrong renders an
error state, axe finds no violation in the emptiness, and the sweep
reports success over nothing.

## Driving it

Chromium is pre-installed. Resolve it through the repo's own helper —
do not call `playwright install`:

```js
import { chromium } from 'playwright';
import { findChromium } from './scripts/lib/chromium.mjs';
const browser = await chromium.launch({ executablePath: findChromium() });
```

## Four traps, each met for real

**Run driver scripts from inside the repo.** `playwright` and
`@prisma/client` resolve from `node_modules`; a script in `/tmp` dies
with `ERR_MODULE_NOT_FOUND`. Write `./.probe.mjs`, run it, delete it.

**Port 4500, never 4321.** `smoke.mjs` binds 4321. Two harnesses on one
port and the second dies with `EADDRINUSE` — or reads the first one's
`dist` mid-rebuild, which is worse because it looks like a result.

**Never run two `verify`/`build` jobs at once.** They share `dist/`.
One wipes it while the other reads, and the failure surfaces as
`ENOENT: dist/index.html` in a gate that has nothing to do with the
change.

**Measure, do not eyeball.** "The footer is too big" is a complaint;
`getBoundingClientRect().height` against `documentElement.scrollHeight`
at 390x844 is a finding. That is how a footer at 1.35 viewports and 64%
of `/triage` was found — and how a fix that recovered only 28px was
caught as insufficient rather than declared done.

## Prisma 7

The connection lives in `prisma.config.ts`, not `schema.prisma`.
`new PrismaClient()` without an adapter throws; use
`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`.
