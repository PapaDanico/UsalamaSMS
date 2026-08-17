/* =====================================================================
   THE SYMMETRY SWEEP.

   WHY IT EXISTS. A reporter told us the logo on the landing page was
   "sitting too high up above the statement below it". It was: the mark
   floated 112px above the eyebrow at 1440px, where every other gap in
   the same stack was 32px. Nothing in any stylesheet said 112. The
   margin under the mark was 12px and correct. Reading the CSS produced
   the wrong answer twice before the page was measured.

   THE CAUSE WAS A GRID ROW COUNT, WHICH IS NOT A THING SOURCE SHOWS
   YOU. The hero's clock panel spans `grid-row: 1 / -1`, and a spanning
   item's height is distributed across the AUTO rows it covers. With
   each line of hero copy its own row, the panel inflated the first one
   to 227.8px for a 116px mark. `grid-auto-rows: min-content` does not
   help — a min-content row still grows to take its share. The fix was
   to make the copy ONE row, so there is nothing to distribute into.

   That is a defect no stylesheet, and no reading of one, contains. It
   exists only in the composition, at widths where the grid applies,
   and it was reported by a human eye before any check saw it. Hence a
   sweep.

   ---------------------------------------------------------------
   THREE MEASUREMENTS, and every one of them was WRONG THE FIRST TIME
   in a way that made it pass. They are written down here because the
   failure mode is the point:

     GAP        the vertical distance between stacked siblings. The
                first version required all of a parent's children to
                be vertically disjoint before it measured anything —
                and the clock panel overlaps every row of the hero, so
                the one container holding the defect was skipped
                before a single gap was read. It reported ZERO against
                a build with the defect restored. Children are now
                grouped into COLUMNS by horizontal overlap first, so a
                spanning sibling forms its own group instead of
                disqualifying the parent.

     CENTRING   whether a constrained column sits evenly in the
                viewport. The first version selected `main .page` — a
                full-bleed element, so its insets were 0 and 0 and
                always would be. It passed against a build with the
                working column jammed against the left edge. Only
                containers NARROWER than the viewport are measured now.

     LEFT EDGES whether the top-level sections agree about where the
                column starts. Task B1 in this repository was "three
                left edges on every desktop screen"; sections that
                disagree read as broken even when each is internally
                correct.

   A FOURTH MEASUREMENT WAS DELETED RATHER THAN SHIPPED. It compared
   each block's left and right inset inside its own parent, and
   reported 255 findings that were all the same non-defect: a
   left-aligned paragraph capped at a readable measure sits at left 0
   with the remainder on the right. Narrowing it to "asymmetric AND
   nothing declared it should be narrow" then removed every candidate,
   because `img { max-width: 100% }` and `.page :is(p, li) { max-width:
   68ch }` between them cover the page — a funnel count showed 75
   candidates surviving every filter but that one, and 0 after it. A
   check over an empty set passes perfectly and means nothing, so it
   is gone rather than tuned.

   THE THRESHOLD IS A RATIO AND AN ABSOLUTE, BOTH. A 60px section
   break between other 60px section breaks is the design; a 112px gap
   between 32px gaps is not. Requiring more than 40px AND more than
   three times the median of its own stack is what separates them, and
   it is why this file does not fire on the deliberate breathing room
   between sections.

   STATES, NOT JUST THE DEFAULT RENDER. A collapsed <details>
   contributes no geometry, so a stack that is even when shut can be
   uneven when opened — and the CAPA panel, the FAQ answers and the
   toolkit steps all ship shut. The sweep opens them, and opens the
   menu, then measures again. The count of what it actually opened is
   asserted below, because a state pass that opened nothing would
   report the same clean zero as a page with no defects.
   ===================================================================== */
import { chromium } from 'playwright';
import { findChromium } from './lib/chromium.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = 4183;
const BASE = `http://localhost:${PORT}`;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain',
};

const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = join(DIST, pathname);
  if (pathname === '/' || !(existsSync(file) && !statSync(file).isDirectory())) {
    file = join(DIST, 'index.html');
  }
  let body;
  try {
    body = readFileSync(file);
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(body);
});

/* The widths the layout actually behaves differently at: the desktop
   grid, its first breakpoint, and a handset where that grid does not
   apply at all. The hero defect measured 112px at the first two and
   19px at the third, so a sweep at one width would have found either
   nothing or nothing surprising. */
const WIDTHS = [1440, 900, 390];

/* More than this many pixels AND more than this multiple of the
   stack's own median. Both, so section breaks survive. */
const GAP_FLOOR = 40;
const GAP_RATIO = 3;
/* A column whose two viewport insets differ by more than this is not
   centred. Eight absorbs a scrollbar and sub-pixel rounding. */
const INSET_SLOP = 8;

const MEASURE = ({ gapFloor, gapRatio, insetSlop }) => {
  const out = { gaps: [], insets: [] };
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const name = (el) => el.tagName.toLowerCase() +
    (el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');

  for (const parent of document.querySelectorAll('body *')) {
    const kids = [...parent.children].filter(vis);
    if (kids.length < 3) continue;
    const cs = getComputedStyle(parent);
    if (cs.display === 'inline' || cs.display === 'contents') continue;

    const boxes = kids.map((k) => ({ el: k, r: k.getBoundingClientRect() }))
      .sort((a, b) => a.r.top - b.r.top);

    /* Two boxes share a column when their horizontal ranges overlap by
       more than half the narrower one. */
    const cols = [];
    for (const b of boxes) {
      const hit = cols.find((c) => {
        const o = Math.min(c.right, b.r.right) - Math.max(c.left, b.r.left);
        return o > Math.min(c.right - c.left, b.r.width) * 0.5;
      });
      if (hit) {
        hit.items.push(b);
        hit.left = Math.min(hit.left, b.r.left);
        hit.right = Math.max(hit.right, b.r.right);
      } else cols.push({ left: b.r.left, right: b.r.right, items: [b] });
    }

    for (const col of cols) {
      if (col.items.length < 3) continue;
      const g = [];
      for (let i = 1; i < col.items.length; i++) {
        const gap = Math.round(col.items[i].r.top - col.items[i - 1].r.bottom);
        /* A negative gap means the two overlap, so this is not a stack
           and its "median gap" would be meaningless. */
        if (gap < 0) { g.length = 0; break; }
        g.push({ gap, above: name(col.items[i - 1].el), below: name(col.items[i].el) });
      }
      if (g.length < 2) continue;
      const vals = g.map((x) => x.gap).sort((a, b) => a - b);
      const median = vals[Math.floor(vals.length / 2)];
      for (const x of g) {
        if (x.gap > gapFloor && x.gap > Math.max(median, 8) * gapRatio) {
          out.gaps.push({ axis: 'gap', parent: name(parent), ...x, median });
        }
      }
    }
  }

  for (const col of document.querySelectorAll('main .wrap, main .page')) {
    if (!vis(col)) continue;
    const r = col.getBoundingClientRect();
    if (r.width >= window.innerWidth - 2) continue;
    const left = Math.round(r.left);
    const right = Math.round(window.innerWidth - r.right);
    if (Math.abs(left - right) > insetSlop) {
      out.insets.push({ axis: 'centring', el: name(col), left, right });
    }
  }

  const main = document.querySelector('main');
  if (main) {
    const edges = new Map();
    for (const sec of main.children) {
      if (!vis(sec)) continue;
      const cs = getComputedStyle(sec);
      if (cs.position === 'fixed' || cs.position === 'absolute') continue;
      /* A full-bleed band is meant to reach the viewport edge; it is
         the content inside it that lines up with its neighbours. */
      const inner = sec.querySelector(':scope > .wrap, :scope > .page') ?? sec;
      if (!vis(inner)) continue;
      edges.set(Math.round(inner.getBoundingClientRect().left), true);
    }
    if (edges.size > 1) {
      out.insets.push({
        axis: 'left-edges', el: 'main >',
        left: [...edges.keys()].sort((a, b) => a - b).join(' / '),
        right: edges.size,
      });
    }
  }
  return out;
};

await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch({ executablePath: findChromium() });

const findings = [];
let detailsOpened = 0;
let menusOpened = 0;
let measured = 0;
let routes = [];

try {
  /* Routes discovered from the product's own architecture, for the
     reason check:a11y gives: a hardcoded list stops covering the
     moment somebody adds a screen. */
  const first = await browser.newContext({ serviceWorkers: 'block' });
  const home = await first.newPage();
  await home.goto(BASE, { waitUntil: 'networkidle' });
  const declared = await home.evaluate(() =>
    [...document.querySelectorAll('.footer a, #menu-panel a, a[href^="/"]')]
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && h.startsWith('/') && !h.startsWith('//'))
      .map((h) => h.split('#')[0])
      .filter(Boolean)
  );
  await first.close();

  /* THE ONE ROUTE DISCOVERY CANNOT FIND, ADDED BACK BY NAME.

     Every route here comes from the product's own architecture, and
     that is deliberate — a hardcoded list stops covering the moment
     somebody adds a screen. /admin is the single exception, because it
     is deliberately absent from the menu and the footer: it is the
     vendor's console, and advertising it to operators would imply a
     presence inside their organisation.

     So the discovery is right and the sweep would have been wrong. A
     screen nobody advertises is still a screen somebody uses, and it
     shipped past both this gate and the symmetry sweep on its first
     build precisely because neither could see it. Named here, with the
     reason, rather than left silently uncovered. */
  const UNADVERTISED = ['/admin'];
  routes = [...new Set(['/', ...declared, ...UNADVERTISED])].sort();

  if (routes.length < 8) {
    console.error(
      `\ncheck:symmetry — only ${routes.length} route(s) discovered from the architecture. ` +
        'This gate asserts over every screen and cannot do that from a crawl that found ' +
        'almost nothing. Something changed in the menu or the footer markup.'
    );
    process.exit(1);
  }

  console.log(
    `check:symmetry — ${routes.length} screens x ${WIDTHS.length} widths x 3 states\n`
  );

  const opts = { gapFloor: GAP_FLOOR, gapRatio: GAP_RATIO, insetSlop: INSET_SLOP };

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 }, serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    /* The signed-in screens render nothing without a session, and a
       screen that renders nothing is a screen this gate does not
       cover. The API is stubbed rather than run. */
    await page.route('**/api/v1/auth/refresh', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 's', refreshToken: 's2', role: 'SAFETY_MANAGER', orgId: 'org-1',
      }),
    }));
    await page.route('**/api/v1/**', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: '{}',
    }));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('usalamasms.session',
        JSON.stringify({ role: 'SAFETY_MANAGER', orgId: 'org-1' }));
      localStorage.setItem('usalamasms.refresh', 'stub');
    });

    for (const route of routes) {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(300);
      const take = (r, state) => {
        measured++;
        for (const f of [...r.gaps, ...r.insets]) findings.push({ route, width, state, ...f });
      };
      take(await page.evaluate(MEASURE, opts), 'default');

      detailsOpened += await page.evaluate(() => {
        const shut = [...document.querySelectorAll('details')].filter((x) => !x.open);
        for (const x of shut) x.open = true;
        return shut.length;
      });
      await page.waitForTimeout(200);
      take(await page.evaluate(MEASURE, opts), 'expanded');

      const menu = page.locator('[aria-controls="menu-panel"], .menu-btn, .nav-toggle').first();
      if (await menu.count()) {
        try {
          await menu.click({ timeout: 2000 });
          await page.waitForTimeout(200);
          menusOpened++;
          take(await page.evaluate(MEASURE, opts), 'menu');
        } catch { /* no menu at this width on this route */ }
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

/* THE VACUOUS-PASS GUARD, and it is not decorative. An earlier driver
   in this repository asserted happily against a panel it had never
   rendered, because the fixture used the wrong id. A sweep that opens
   nothing measures the default render three times and calls it three
   states. */
if (detailsOpened === 0 || menusOpened === 0) {
  console.error(
    `\ncheck:symmetry — the state pass opened ${detailsOpened} <details> and ` +
      `${menusOpened} menus. Zero of either means this gate measured the default ` +
      'render and reported it as three states. The selectors have drifted.'
  );
  process.exit(1);
}

if (findings.length) {
  console.error(`\ncheck:symmetry FAILED — ${findings.length} finding(s)\n`);
  for (const f of findings) {
    const where = `${f.route} @${f.width} (${f.state})`;
    if (f.axis === 'gap') {
      console.error(
        `  ${where}\n    ${f.gap}px between ${f.above} and ${f.below} in ${f.parent}, ` +
          `against a median of ${f.median}px in the same stack.`
      );
    } else if (f.axis === 'centring') {
      console.error(`  ${where}\n    ${f.el} sits ${f.left}px from the left and ${f.right}px from the right.`);
    } else {
      console.error(`  ${where}\n    ${f.right} different left edges among the top-level sections: ${f.left}.`);
    }
  }
  console.error(
    '\nA gap far out of step with its own neighbours, an off-centre column, or sections ' +
      'that disagree about the left edge. If one of these is deliberate, it needs a reason ' +
      'written here rather than a wider threshold.\n'
  );
  process.exit(1);
}

console.log(
  `  symmetry ok      ${measured} measurements over ${routes.length} screens, ` +
    `${detailsOpened} panels and ${menusOpened} menus opened`
);
