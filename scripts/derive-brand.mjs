#!/usr/bin/env node
/* =====================================================================
   DERIVE A SHIPPED ASSET FROM A BRAND MASTER.

   IT RESAMPLES, IT NEVER REDRAWS. Every pixel out of this script came
   from docs/brand/. There is no path data here, no generated shape and
   no lookalike: an approximation of a brand asset is worse than a
   missing one, because it ships, nobody queries it, and the product
   ends up with two versions of its own identity.

   WHY IT IS NOT PART OF `npm run build`. It needs a browser to
   rasterise and the Netlify build image does not have one —
   build-icons.mjs already records that constraint. A person runs
   `npm run brand` when a master changes; the output is checked in, and
   check:assets holds its size.

   WHAT IT PRODUCES TODAY: the crowned crane, at the size the offline
   page displays it, inlined into that page as a data URI.

   THE OFFLINE PAGE IS THE ONE SURFACE THIS CAN REACH RIGHT NOW, and
   the reason is worth writing down rather than discovering again. CSS
   is at 59.9 KB of a 60 KB ceiling and the standing receipt says the
   next raise splits the stylesheet first — so every other identity
   surface (the hero, page grounds, the footer) is gated behind that
   split. offline.html is the exception: it carries its own inline
   styles and references style.css nowhere, because it is served when
   there is no network and cannot depend on a stylesheet that might not
   be cached. Its independence is what makes it reachable.

   IT IS ALSO THE RIGHT SURFACE ON THE MERITS. That page's own comment
   says it: "the page most likely to be seen by the person this product
   exists for, at the moment they most need to trust it — a ramp agent
   at a remote strip who has just typed a report." A grey crowned crane at a size
   somebody can see, rather than a browser error page with our colours
   on it.
   ===================================================================== */
import { chromium } from 'playwright';
import { findChromium } from './lib/chromium.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = resolve(ROOT, 'docs/brand/crane.png');
const OFFLINE = resolve(ROOT, 'apps/web/public/offline.html');

/* Rendered at 2x so it is not soft on the
   handset this product targets, which is the device that will see this
   page most often. Displayed at 150 CSS pixels. */
const DISPLAY_PX = 150;
const SCALE = 2;
/* 0.78 rather than 0.9. THE FIRST PASS CAME OUT AT 36 KB and that is
   the wrong answer on a page the service worker precaches: every user
   downloads it on install, over the connection this product exists to
   respect, for decoration. At 300px and 0.78 the bird is still crisp on
   a 2x handset and the page stays under twenty. Measured, not guessed —
   the script prints the figure and check:assets holds the ceiling. */
const QUALITY = 0.78;

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage();

const master = readFileSync(MASTER).toString('base64');

const out = await page.evaluate(
  async ({ dataUrl, px, quality }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();

    /* THE MASTER IS MOSTLY GROUND. The crane sits on a Warm Sand field
       with generous margins — right for a deck, wasteful for a data
       URI, and it would render the bird small inside its own box. So
       the crop is FOUND rather than assumed: scan for the bounding box
       of everything that is not the ground, which survives the designer
       re-exporting at another size. */
    const probe = document.createElement('canvas');
    probe.width = img.width;
    probe.height = img.height;
    const px2 = probe.getContext('2d', { willReadFrequently: true });
    px2.drawImage(img, 0, 0);
    const { data } = px2.getImageData(0, 0, probe.width, probe.height);

    const isGround = (i) =>
      Math.abs(data[i] - 0xf5) < 12 &&
      Math.abs(data[i + 1] - 0xf0) < 12 &&
      Math.abs(data[i + 2] - 0xe8) < 12;

    let top = probe.height, left = probe.width, right = 0, bottom = 0;
    for (let y = 0; y < probe.height; y++) {
      for (let x = 0; x < probe.width; x++) {
        if (isGround((y * probe.width + x) * 4)) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    const w = right - left + 1;
    const h = bottom - top + 1;

    /* Kept in proportion, then the GROUND IS MADE TRANSPARENT so the
       page's own shows through.

       THE FIRST VERSION CLAIMED THIS AND DID NOT DO IT. The crop is a
       rectangle, so it carries the master's Warm Sand with it — and the
       offline page paints Warm Sand with a faint cross pattern over it.
       Two nearly-identical sands, one patterned and one not, read as a
       rectangle around the bird. Visible in the first screenshot, and
       only in the screenshot: nothing measures it.

       FLOOD-FILLED FROM THE EDGES rather than keyed by colour, which
       matters on this particular bird. The crane's body is white, and
       white is close enough to Warm Sand that a colour key with a
       tolerance wide enough to clear the ground also eats the feathers.
       Filling only what is CONNECTED to the border cannot reach an
       interior pixel, so the plumage is safe by construction. */
    const height = Math.round((h / w) * px);
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = height;
    const cx = canvas.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, left, top, w, h, 0, 0, px, height);

    const frame = cx.getImageData(0, 0, canvas.width, canvas.height);
    const d = frame.data;
    const near = (i) =>
      Math.abs(d[i] - 0xf5) < 10 &&
      Math.abs(d[i + 1] - 0xf0) < 10 &&
      Math.abs(d[i + 2] - 0xe8) < 10;

    const stack = [];
    for (let x = 0; x < canvas.width; x++) {
      stack.push([x, 0], [x, canvas.height - 1]);
    }
    for (let y = 0; y < canvas.height; y++) {
      stack.push([0, y], [canvas.width - 1, y]);
    }
    const seen = new Uint8Array(canvas.width * canvas.height);
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
      const flat = y * canvas.width + x;
      if (seen[flat]) continue;
      seen[flat] = 1;
      const i = flat * 4;
      if (!near(i)) continue;
      d[i + 3] = 0;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    cx.putImageData(frame, 0, 0);

    return {
      dataUrl: canvas.toDataURL('image/webp', quality),
      found: { w, h },
      height,
    };
  },
  { dataUrl: `data:image/png;base64,${master}`, px: DISPLAY_PX * SCALE, quality: QUALITY },
);

await browser.close();

const kb = Math.round((out.dataUrl.length * 3) / 4 / 1024);
console.log(
  `  crane — found at ${out.found.w}x${out.found.h} in the master, ` +
    `rendered ${DISPLAY_PX * SCALE}px wide for a ${DISPLAY_PX}px display, ${kb} KB inline`,
);

/* Inlined rather than linked, and that is the offline page's own rule
   rather than a preference: it is served when there is no network, so
   it cannot reference an image that might not be cached. A data URI
   cannot miss. */
const html = readFileSync(OFFLINE, 'utf8');
const START = '<!--brand:crane-->';
const END = '<!--/brand:crane-->';
const from = html.indexOf(START);
const to = html.indexOf(END);
if (from < 0 || to < 0) {
  console.error(
    `derive-brand FAILED — ${OFFLINE} has no ${START} … ${END} block.\n` +
      'The markers are how this script finds what it owns; without them it would ' +
      'either overwrite a hand-written page or silently do nothing.',
  );
  process.exit(1);
}

writeFileSync(
  OFFLINE,
  html.slice(0, from + START.length) +
    `\n      <img class="crane" src="${out.dataUrl}" alt="" width="${DISPLAY_PX}" ` +
    `height="${Math.round(out.height / SCALE)}" />\n      ` +
    html.slice(to),
);
console.log(`  offline.html is now ${Math.round(readFileSync(OFFLINE).length / 1024)} KB`);
