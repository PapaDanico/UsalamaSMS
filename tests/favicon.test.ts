/* ============================================================
   THE TAB ICON IS THE MARK, AND THIS IS WHAT SAYS SO.

   THREE FAVICONS HAVE SHIPPED FROM THIS REPOSITORY AND THE FIRST TWO
   WERE BOTH WRONG. Each was found by a person looking at a browser tab,
   which is not a check — it is somebody noticing, and it only happened
   because somebody happened to look.

     1. CHARCOAL ON TRANSPARENT. Drawn by icon() with the ground set to
        `none`, so on a dark tab bar it was near-black on near-black and
        simply absent. It was also off-brand in the other direction: the
        identity is gold on dark, and this was the inverse.

     2. A FILLED SILHOUETTE of the shield, gold on charcoal. It fixed
        the visibility and threw the mark away — no crane, no contrail,
        no aircraft. A gold blob that could belong to any company with a
        shield in its logo.

   The third is cropped from docs/brand/lockup-wide.jpg by
   scripts/build-icons.mjs, which is the artwork itself rather than a
   drawing of it.

   WHAT THIS FILE GUARDS is that the shipped bytes still have the
   properties the third one has and the first two did not. It reads the
   COMMITTED PNG, because that is what a browser downloads — a check
   against the generator would pass while the committed file was stale,
   and the generator is skipped on Netlify where no Chromium exists.

   Every assertion below was mutation-checked by putting the defect back
   and confirming it goes red: the transparent ground, the silhouette,
   an unkeyed JPEG crop with the terracotta pattern still in it, and a
   second favicon.svg beside this one.
   ============================================================ */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { resolve } from "node:path";

const ICONS = resolve(__dirname, "../apps/web/public/icons");
const FAVICON = resolve(ICONS, "favicon-32.png");

/* The two brand tokens, read from the stylesheet rather than typed, so
   a palette change moves this with it instead of failing it. */
const CSS = readFileSync(resolve(__dirname, "../apps/web/src/style.css"), "utf8");
function token(name: string): [number, number, number] {
  const m = new RegExp(`--${name}\\s*:\\s*#([0-9a-f]{6})\\s*;`, "i").exec(CSS);
  if (!m) throw new Error(`--${name} not found in style.css`);
  const hex = m[1]!;
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
const GOLD = token("us-gold");
const INK = token("us-charcoal");

/**
 * ENOUGH OF A PNG DECODER TO READ ONE 32x32 RGBA FILE.
 *
 * No image library is added for this. `sharp` and friends are tens of
 * megabytes of native build to answer a question about 4096 pixels, and
 * the reason the icon suite rasterises through Playwright rather than
 * through an image library is the same one. zlib is in Node.
 *
 * 8-bit non-interlaced, colour type 6 (RGBA) or 2 (RGB). BOTH, and the
 * second one is here because leaving it out made this file lie about
 * what it checks. A fully opaque PNG has no need of an alpha channel
 * and several encoders drop it — Playwright's screenshot does. With
 * only type 6 accepted, such a file made the decoder throw at import,
 * which fails the suite loudly enough but runs NONE of the assertions
 * below. A gate that reports a decoder complaint where it should be
 * reporting "this is a silhouette" is not checking the thing it says
 * it checks. Type 2 pixels are opaque by definition, which is exactly
 * what the alpha assertion wants to know.
 *
 * Anything else still throws rather than being interpreted, because a
 * decoder that guesses at a form it does not understand produces pixels
 * that were never in the file — and every assertion below would then be
 * about those.
 */
function decodePng(buf: Buffer): { w: number; h: number; px: Buffer } {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("not a PNG");
  }
  let o = 8;
  let w = 0;
  let h = 0;
  let channels = 4;
  const idat: Buffer[] = [];
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.subarray(o + 4, o + 8).toString("latin1");
    if (type === "IHDR") {
      w = buf.readUInt32BE(o + 8);
      h = buf.readUInt32BE(o + 12);
      const [depth, colour, interlace] = [buf[o + 16], buf[o + 17], buf[o + 20]];
      if (depth !== 8 || (colour !== 6 && colour !== 2) || interlace !== 0) {
        throw new Error(
          `favicon-32.png is depth ${depth}, colour type ${colour}, interlace ${interlace}; ` +
            `this reader handles 8-bit RGB or RGBA, non-interlaced.`,
        );
      }
      channels = colour === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      idat.push(buf.subarray(o + 8, o + 8 + len));
    }
    o += 12 + len;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]!;
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp]! : 0;
      const v = row[x]!;
      px[y * stride + x] =
        (filter === 0
          ? v
          : filter === 1
            ? v + a
            : filter === 2
              ? v + b
              : filter === 3
                ? v + ((a + b) >> 1)
                : v + paeth(a, b, c)) & 255;
    }
  }
  /* NORMALISED TO RGBA before it leaves here, so nothing downstream has
     to know which form the file was in. A type-2 pixel has no alpha
     channel because it is opaque, which is 255. */
  if (channels === 4) return { w, h, px };
  const rgba = Buffer.alloc(w * h * 4);
  for (let n = 0; n < w * h; n++) {
    rgba[n * 4] = px[n * 3]!;
    rgba[n * 4 + 1] = px[n * 3 + 1]!;
    rgba[n * 4 + 2] = px[n * 3 + 2]!;
    rgba[n * 4 + 3] = 255;
  }
  return { w, h, px: rgba };
}

const { w, h, px } = decodePng(readFileSync(FAVICON));

/**
 * Where a pixel sits on the charcoal -> gold line, and how far off it.
 *
 * The generator keys every pixel to one of the two tokens at 4x and
 * then downscales, so a legitimate pixel is either token or an average
 * of them — which puts it ON the segment between the two. Anything with
 * a real distance from that line came from somewhere else: the
 * terracotta pattern behind the mark in the source JPEG is the specific
 * thing this catches.
 */
function place(r: number, g: number, b: number): { t: number; dev: number } {
  const d = [GOLD[0] - INK[0], GOLD[1] - INK[1], GOLD[2] - INK[2]];
  const len2 = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2;
  const raw = ((r - INK[0]) * d[0]! + (g - INK[1]) * d[1]! + (b - INK[2]) * d[2]!) / len2;
  const t = Math.max(0, Math.min(1, raw));
  const dev = Math.hypot(r - (INK[0] + d[0]! * t), g - (INK[1] + d[1]! * t), b - (INK[2] + d[2]! * t));
  return { t, dev };
}

const pixels = Array.from({ length: w * h }, (_, n) => {
  const i = n * 4;
  return {
    x: n % w,
    y: Math.floor(n / w),
    r: px[i]!,
    g: px[i + 1]!,
    b: px[i + 2]!,
    a: px[i + 3]!,
    ...place(px[i]!, px[i + 1]!, px[i + 2]!),
  };
});
const gold = pixels.filter((p) => p.t > 0.5);

describe("the browser tab icon", () => {
  it("is 32x32", () => {
    expect([w, h]).toEqual([32, 32]);
  });

  /* DEFECT 1. A transparent ground let the tab bar's own colour through,
     and on a dark one the mark disappeared into it. The icon has to
     bring its own contrast rather than borrow the browser's. */
  it("is opaque everywhere, so a dark tab bar cannot swallow it", () => {
    const clear = pixels.filter((p) => p.a !== 255);
    expect(
      clear.length,
      `${clear.length} pixels are not fully opaque. A transparent favicon takes the ` +
        `browser's ground, and on a dark tab bar this mark is near-black on near-black.`,
    ).toBe(0);
  });

  it("is gold on charcoal, which is the identity's own pairing", () => {
    const ground = pixels.filter((p) => p.t < 0.5).length;
    expect(gold.length, "no gold at all").toBeGreaterThan(0);
    expect(ground, "no ground at all").toBeGreaterThan(0);
  });

  /* The key is what removes the terracotta pattern the mark sits on in
     the source lockup. Unkeyed, that pattern is noise at 32px competing
     with the only thing worth seeing — and it would show up here as
     pixels a long way off the two-token line. */
  it("carries only the two brand colours and blends of them", () => {
    const stray = pixels.filter((p) => p.dev > 12);
    expect(
      stray.length,
      `${stray.length} pixels are off the charcoal-to-gold line, the worst by ` +
        `${Math.max(...pixels.map((p) => p.dev)).toFixed(1)}. The source lockup sits on a ` +
        `patterned ground; if it is leaking through, the key stopped keying.`,
    ).toBe(0);
  });

  /* DEFECT 2, and the reason this file exists at all. A filled
     silhouette of the shield is a little over half the canvas. Line art
     is a fifth of it. The band is wide enough for the mark to be
     redrawn and narrow enough that a solid shape cannot pass. */
  it("is line art rather than a solid shape", () => {
    const pct = (gold.length / (w * h)) * 100;
    expect(
      pct,
      `${pct.toFixed(1)}% of the icon is gold. Much above 30 and it is a silhouette ` +
        `rather than the mark — which is exactly what shipped once, and it is a gold ` +
        `blob that could belong to anybody with a shield in their logo.`,
    ).toBeLessThan(30);
    expect(pct, `${pct.toFixed(1)}% gold — the mark has mostly vanished`).toBeGreaterThan(8);
  });

  /* THE MARK IS IN FRAME, top to bottom. The shield holds three things
     stacked — the contrail arc and its aircraft across the top, the
     crane in the middle, the runway bars at the foot — and every
     assertion above is a quantity, which a mark half outside the crop
     window satisfies perfectly well. MARK_BOX is four numbers typed
     against a JPEG; getting one wrong slides the window off the
     artwork, and this is what notices.
     Mutation-checked at +120 and +200 on MARK_BOX.y: the foot drops to
     0.0% and 8.9% against the floor of 12.

     WHAT IT DOES NOT CATCH, recorded because the first draft of this
     comment claimed it did. Shrinking MARK_BOX.h from 425 to 300 cuts
     the runway out of the source window and still passes: what remains
     rescales to fill the canvas, and the crane's legs land in the foot
     band in its place. This checks that the mark FILLS the frame, not
     that all three of its parts are present — no statistic over 4096
     pixels can tell a runway bar from a crane's foot, and a check that
     claims to is worse than one that says what it does. The thing that
     actually caught that class of defect was rendering the icon at 16,
     32 and 64 and looking at it. */
  it("fills the frame top to bottom, so the crop window is on the mark", () => {
    const bands = [0, 0, 0];
    for (const p of gold) bands[Math.min(2, Math.floor((p.y / h) * 3))]!++;
    const share = bands.map((n) => (n / gold.length) * 100);
    const names = ["top (the contrail and its aircraft)", "middle (the crane)", "foot (the runway)"];
    share.forEach((s, i) => {
      expect(
        s,
        `only ${s.toFixed(1)}% of the mark's gold is in the ${names[i]}. Something in ` +
          `the mark has been dropped or cropped out.`,
      ).toBeGreaterThan(12);
    });
  });
});

/* ============================================================
   AND THERE IS EXACTLY ONE OF IT.

   A favicon.svg used to sit beside this file, drawn from Logo.js by
   icon(). Both were declared in index.html, so which logo a person saw
   depended on which format their browser preferred — and the two were
   not the same drawing. Logo.js's geometry has no contrail arc, the
   single most recognisable thing in the mark.

   That is not a cosmetic disagreement. It is the failure mode the whole
   generator was built to prevent, stated in its own header: two sources
   of a logo's geometry means two logos, eventually. It had one anyway,
   in the one place a person sees the logo most often.
   ============================================================ */
describe("only one tab icon exists", () => {
  it("ships no second favicon in another format", () => {
    const rivals = readdirSync(ICONS).filter(
      (f) => /^favicon/i.test(f) && f !== "favicon-32.png",
    );
    expect(
      rivals,
      `${rivals.join(", ")} sits beside favicon-32.png. A browser picks whichever ` +
        `format it prefers, so two favicons is two logos and nobody controls which one ` +
        `a given person sees.`,
    ).toEqual([]);
  });
});
