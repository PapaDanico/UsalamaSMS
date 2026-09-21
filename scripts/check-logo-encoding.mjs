#!/usr/bin/env node
/* =====================================================================
   AN OPERATOR'S MARK ACTUALLY FITS UNDER THE CEILING.

   THE DEFECT THIS GATE EXISTS FOR. `logo-panel.js` re-encoded every
   chosen file with one line — `canvas.toDataURL('image/png')` at 512px
   — and `checkLogo()` then refused what came back. Measured in
   Chromium against a mark with a gradient and anti-aliased type, which
   is what an operator's logo actually is:

       PNG at 512px   431,818 characters   against a 60,000 ceiling
       PNG at 256px   130,294 characters   still refused

   Seven times over, and the refusal read "export it at 512px on the
   longest edge" — which the client had just done itself. An operator
   who followed the instruction exactly received the identical message
   with nothing left to try, which is how "we cannot upload our logo"
   arrives while every check in the repository is green.

   NOTHING COULD HAVE CAUGHT IT. `tests/logo.test.ts` asserts
   `checkLogo`, and checkLogo was correct the whole time — it is the
   ceiling, and the ceiling is load-bearing, because the mark rides on
   every page an operator prints. The defect was one layer up, in the
   half that has to MEET the ceiling, and that half needs a canvas and
   an image encoder. A validator is perfect in a client that cannot
   satisfy it; this repository already records the same shape one layer
   down, where a validator was perfect in a route that never called it.

   IT DRIVES THE SHIPPED SOURCE. The ladder is sliced out of
   `logo-panel.js` rather than retyped here, so a gate cannot go on
   passing over a module that has changed underneath it. The slice is
   guarded: if the markers move, this fails rather than silently
   measuring nothing.

   A REFUSAL IS A FAILURE, and that is the load-bearing line in this
   file. The first version of this measurement scored a refused mark as
   neither pass nor fail and printed it as information — so with the
   whole defect put back, two marks came back refused and the run still
   exited 0. A gate that reports the failure it exists to catch and
   then returns success is worse than no gate. Every mark below is one
   an operator may legitimately hold, so a refusal of any of them is
   red rather than informational.

   AND THREE MORE OF ITS ASSERTIONS WERE MASKED, each found the same
   way and each noted where it sits: the SVG case was refused by the
   image decoder rather than by the rule, "never scaled up" was
   measured against the ceiling instead of the source, and the
   silent-fallback guard could not fail on an engine that supports
   WebP. All three passed with their defect restored before they were
   fixed. A mutation that comes back green is the matrix reporting on
   the gate, not on the code.
   ===================================================================== */

import { chromium } from 'playwright';
import { findChromium } from './lib/chromium.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = resolve(ROOT, 'apps/web/src/tools/login/logo-panel.js');
const LOGO = resolve(ROOT, 'packages/shared/src/logo.ts');

/* The ceiling is read from the module that owns it, never typed here.
   A gate carrying its own copy of the number it guards is a gate that
   passes after somebody changes the number. */
const logoSrc = readFileSync(LOGO, 'utf8');
const readConst = (name) => {
  const m = new RegExp(`export const ${name} = ([0-9_]+)`).exec(logoSrc);
  if (!m) throw new Error(`could not read ${name} from packages/shared/src/logo.ts`);
  return Number(m[1].replace(/_/g, ''));
};
const LOGO_MAX_CHARS = readConst('LOGO_MAX_CHARS');
const LOGO_MAX_EDGE = readConst('LOGO_MAX_EDGE');

/* The slice of the real module: everything from the ladder's first
   declaration to the render function. */
const panelSrc = readFileSync(PANEL, 'utf8');
const from = panelSrc.indexOf('const EDGES = [');
const to = panelSrc.indexOf('export async function render');
if (from < 0 || to < 0 || to <= from) {
  console.error(
    'FATAL: could not find the encoding ladder in logo-panel.js.\n' +
      '  This gate slices `const EDGES = [` through `export async function render`.\n' +
      '  If that code moved, move this gate with it — do not delete the assertion.'
  );
  process.exit(1);
}
const ladder = panelSrc.slice(from, to);

/* A gate over an empty subject passes perfectly, so the subject is
   checked before anything is measured. */
if (!/toDataUri/.test(ladder) || !/RUNGS/.test(ladder)) {
  console.error('FATAL: the sliced ladder carries no toDataUri/RUNGS — the slice is wrong.');
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage();
await page.setContent('<!doctype html><title>logo</title><body></body>');

const results = await page.evaluate(
  async ({ ladder, LOGO_MAX_CHARS, LOGO_MAX_EDGE }) => {
    const mod = new Function(
      'LOGO_MAX_CHARS',
      'LOGO_MAX_EDGE',
      `${ladder}; return { toDataUri };`
    )(LOGO_MAX_CHARS, LOGO_MAX_EDGE);

    /* THE FIXTURES ARE PAINTED, not committed as binary files. A logo
       in the repository is a logo somebody has to license, and the
       property under test is about how an image COMPRESSES, which a
       gradient and a flat fill express better than any real mark. */
    const paint = (w, h, kind) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d');
      if (kind === 'transparent') {
        x.clearRect(0, 0, w, h);
        x.fillStyle = '#0b3d5c';
        x.beginPath();
        x.arc(w / 2, h / 2, w / 2.4, 0, Math.PI * 2);
        x.fill();
      } else if (kind === 'transparent-detailed') {
        /* TRANSPARENT *AND* TOO BIG FOR PNG, which the plain
           transparent fixture is not. That one encodes to 15,898
           characters losslessly, so the ladder returns at the very
           first rung and the JPEG rungs below are never reached —
           which meant deleting the rule that keeps JPEG away from a
           transparent mark changed nothing and the matrix came back
           green. Alpha plus detail is the only shape that gets far
           enough down the ladder for that rule to matter. */
        x.clearRect(0, 0, w, h);
        x.save();
        x.beginPath();
        x.arc(w / 2, h / 2, w / 2.2, 0, Math.PI * 2);
        x.clip();
        const gr = x.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, '#0b3d5c');
        gr.addColorStop(0.5, '#c8102e');
        gr.addColorStop(1, '#f4b223');
        x.fillStyle = gr;
        x.fillRect(0, 0, w, h);
        for (let i = 0; i < 9000; i++) {
          x.fillStyle = `rgba(${(i * 7) % 255},${(i * 13) % 255},${(i * 29) % 255},0.35)`;
          x.fillRect((i * 37) % w, (i * 53) % h, 6, 6);
        }
        x.restore();
      } else if (kind === 'flat') {
        x.fillStyle = '#0b3d5c';
        x.fillRect(0, 0, w, h);
        x.fillStyle = '#ffffff';
        x.font = `bold ${Math.round(w / 6)}px sans-serif`;
        x.fillText('FanJet', w / 12, h / 1.8);
      } else {
        const g = x.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#0b3d5c');
        g.addColorStop(0.5, '#c8102e');
        g.addColorStop(1, '#f4b223');
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
        /* Dithered noise: what an anti-aliased export looks like to a
           lossless encoder, and the reason PNG alone could not fit. */
        for (let i = 0; i < 9000; i++) {
          x.fillStyle = `rgba(${(i * 7) % 255},${(i * 13) % 255},${(i * 29) % 255},0.35)`;
          x.fillRect((i * 37) % w, (i * 53) % h, 6, 6);
        }
        x.fillStyle = '#ffffff';
        x.font = `bold ${Math.round(w / 6)}px sans-serif`;
        x.fillText('FanJet', w / 20, h / 1.9);
      }
      return c;
    };

    const asFile = (canvas, type, name) =>
      new Promise((res) =>
        canvas.toBlob((blob) => res(new File([blob], name, { type })), type)
      );

    /* EACH FIXTURE CARRIES ITS OWN LONGEST EDGE, because "never scaled
       up" cannot be asserted against the ceiling alone: a 90px mark
       blown up to 512 is still within a 512px ceiling, and the first
       version of this gate passed that mutation happily. The bound is
       the SOURCE size or the ceiling, whichever is smaller. */
    const FIXTURES = [
      ['a flat two-colour mark, 800px PNG', paint(800, 800, 'flat'), 'image/png', 'mark.png', 800],
      ['a gradient mark, 800px PNG — the one that was refused', paint(800, 800, 'gradient'), 'image/png', 'fanjet.png', 800],
      ['a mark on a transparent ground, 900x600 PNG', paint(900, 600, 'transparent'), 'image/png', 'alpha.png', 900],
      ['a 2000px photographic JPEG', paint(2000, 1400, 'gradient'), 'image/jpeg', 'photo.jpg', 2000],
      ['a detailed mark on a transparent ground, 800px PNG', paint(800, 800, 'transparent-detailed'), 'image/png', 'alpha-detail.png', 800],
      ['a mark already smaller than the ceiling edge, 90px', paint(90, 90, 'flat'), 'image/png', 'small.png', 90]
    ];

    /* Does the ENCODED result still carry transparency? Decoded and
       read back, because the only way to know a mark was flattened
       onto a background is to look at its pixels. */
    const encodedHasAlpha = async (uri) => {
      const im = new Image();
      im.src = uri;
      await im.decode();
      const c = document.createElement('canvas');
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      const { data } = x.getImageData(0, 0, c.width, c.height);
      for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
      return false;
    };

    const out = [];
    for (const [label, canvas, type, name, sourceEdge] of FIXTURES) {
      const file = await asFile(canvas, type, name);
      /* Read from the SOURCE canvas, not from the fixture's prose. A
         label deciding an assertion is an assertion that changes when
         somebody rewords a sentence. */
      const sourceTransparent = await encodedHasAlpha(canvas.toDataURL('image/png'));
      try {
        const r = await mod.toDataUri(file);
        out.push({
          label,
          refused: false,
          chars: r.uri.length,
          edge: r.edge,
          /* NOT AN ASSERTION ANY MORE, and it is worth saying why it
             is still printed. The ladder now reads the type off the
             returned URI rather than off the rung it asked for, so
             this is true by construction and a test of it could never
             fail. It is reported because the line below prints it,
             and a reader comparing formats wants to see it. */
          type: /^data:([^;]+);/.exec(r.uri)?.[1] ?? r.type,
          /* Never scaled UP: a 90px mark enlarged to 512 is the same
             logo with soft edges and four times the bytes. Bounded by
             the SOURCE, not only by the ceiling — see the note on the
             fixtures above. */
          edgeSane: r.edge <= Math.min(sourceEdge, LOGO_MAX_EDGE),
          sourceEdge,
          /* A TRANSPARENT MARK STAYS TRANSPARENT. JPEG cannot carry an
             alpha channel, so a ladder that reached for it would
             silently flatten an operator's logo onto black — and
             print it that way on every document they hand over. */
          alphaKept: sourceTransparent ? await encodedHasAlpha(r.uri) : true
        });
      } catch (e) {
        out.push({ label, refused: true, message: e.message });
      }
    }

    /* AN ENGINE WITH NO WEBP ENCODER, simulated, because Chromium has
       one and therefore cannot exercise this at all. The guard in the
       ladder exists for exactly the engines this gate will never run
       on, and with Chromium answering every WebP request honestly the
       assertion covering it could not fail — measured: deleting the
       guard left this gate green.

       `toDataURL` does not report an unsupported type. It silently
       returns a PNG, so a ladder that trusted the type it asked for
       would hand back a 431 KB PNG believing it was a 45 KB WebP, and
       be refused by checkLogo with nothing the operator can act on.
       Overriding the encoder here reproduces that engine, and the
       property is that the mark STILL arrives under the ceiling —
       on the JPEG rungs, since this fixture has no transparency to
       lose. An engine without WebP and a mark WITH transparency is
       the one combination that cannot be served, and the ladder is
       right to refuse it rather than flatten somebody's logo. */
    const nativeToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (type, quality) {
      if (type === 'image/webp') return nativeToDataURL.call(this, 'image/png');
      return nativeToDataURL.call(this, type, quality);
    };
    try {
      const noWebp = await asFile(paint(800, 800, 'gradient'), 'image/png', 'nowebp.png');
      const r = await mod.toDataUri(noWebp);
      out.push({
        label: 'the same gradient mark, on an engine with no WebP encoder',
        refused: false,
        chars: r.uri.length,
        type: /^data:([^;]+);/.exec(r.uri)?.[1] ?? r.type,
        edge: r.edge,
        edgeSane: r.edge <= LOGO_MAX_EDGE,
        sourceEdge: 800,
        /* The source here is an opaque gradient, so there is no alpha
           for the JPEG rungs to lose. */
        alphaKept: true
      });
    } catch (e) {
      out.push({
        label: 'the same gradient mark, on an engine with no WebP encoder',
        refused: true,
        message: e.message
      });
    }

    /* THE ONE COMBINATION THAT MAY LEGITIMATELY BE REFUSED, and the
       only case in which `opaqueOnly` decides anything at all.

       In Chromium the rule never fires: WebP keeps an alpha channel
       and always succeeds before a JPEG rung is reached, so deleting
       `opaqueOnly` changed nothing and the matrix came back green
       twice. Without a WebP encoder there is no lossy format left that
       carries transparency, and the choice is between refusing the
       mark and flattening somebody's logo onto black on every document
       they hand a regulator.

       SO BOTH OUTCOMES PASS HERE EXCEPT ONE: refused is fine, kept
       with its transparency is fine, and accepted-but-flattened is the
       failure. This is the only fixture in the file where a refusal is
       not itself red — `mayRefuse` says so, rather than the scoring
       quietly making an exception. */
    try {
      const hard = await asFile(
        paint(800, 800, 'transparent-detailed'),
        'image/png',
        'nowebp-alpha.png'
      );
      const r = await mod.toDataUri(hard);
      out.push({
        label: 'a transparent mark, on an engine with no WebP encoder',
        refused: false,
        mayRefuse: true,
        chars: r.uri.length,
        type: /^data:([^;]+);/.exec(r.uri)?.[1] ?? r.type,
        edge: r.edge,
        edgeSane: r.edge <= LOGO_MAX_EDGE,
        sourceEdge: 800,
        alphaKept: await encodedHasAlpha(r.uri)
      });
    } catch (e) {
      out.push({
        label: 'a transparent mark, on an engine with no WebP encoder',
        refused: true,
        mayRefuse: true,
        message: e.message
      });
    } finally {
      HTMLCanvasElement.prototype.toDataURL = nativeToDataURL;
    }

    /* SVG stays refused. The ladder must not have rasterised its way
       around the one security decision in this feature.

       THE SVG HAS TO BE ONE A BROWSER CAN ACTUALLY DRAW. The first
       version passed the string '<svg/>', which has no dimensions, so
       `img.decode()` rejected it and the refusal came from the image
       decoder rather than from the rule under test. With the rule
       deleted the gate still went green — a masked assertion. This one
       carries an xmlns and a size, so an engine WILL rasterise it, and
       the only thing that can refuse it is the branch this asserts. */
    const realSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
      '<rect width="64" height="64" fill="#0b3d5c"/></svg>';
    try {
      await mod.toDataUri(new File([realSvg], 'logo.svg', { type: 'image/svg+xml' }));
      out.push({ label: 'SVG', refused: false, svgAccepted: true, chars: 0 });
    } catch {
      out.push({ label: 'SVG', refused: true, svgRefused: true });
    }
    return out;
  },
  { ladder, LOGO_MAX_CHARS, LOGO_MAX_EDGE }
);

await browser.close();

const failures = [];
const svg = results.find((r) => r.label === 'SVG');
const marks = results.filter((r) => r.label !== 'SVG');

console.log(`check:logo-encoding — ceiling ${LOGO_MAX_CHARS.toLocaleString()} characters\n`);

for (const r of marks) {
  if (r.refused) {
    /* THE LINE THAT MAKES THIS GATE BITE — except for the one fixture
       that declares a refusal legitimate, which says so in its own
       comment rather than being special-cased silently here. */
    if (r.mayRefuse) {
      console.log(`  ok    ${r.label}\n        refused rather than flattened`);
      continue;
    }
    failures.push(`${r.label}\n      REFUSED: ${r.message}`);
    console.log(`  FAIL  ${r.label}\n        refused outright`);
    continue;
  }
  const problems = [];
  if (r.chars > LOGO_MAX_CHARS) problems.push(`${r.chars} characters is over the ceiling`);
  if (!r.alphaKept) problems.push('transparency was flattened away');
  if (!r.edgeSane) {
    problems.push(
      `${r.edge}px is past the ${Math.min(r.sourceEdge, LOGO_MAX_EDGE)}px this mark may reach ` +
        `(source ${r.sourceEdge}px, ceiling ${LOGO_MAX_EDGE}px)`
    );
  }
  if (problems.length) failures.push(`${r.label}\n      ${problems.join('\n      ')}`);
  console.log(
    `  ${problems.length ? 'FAIL' : 'ok  '}  ${r.label}\n` +
      `        ${String(r.chars).padStart(6)} chars, ${r.type} at ${r.edge}px`
  );
}

if (!svg?.svgRefused) {
  failures.push('SVG was accepted. It is markup that can carry script into the operator\'s own printed pages.');
  console.log('  FAIL  SVG was accepted');
} else {
  console.log('  ok    SVG is refused');
}

if (failures.length) {
  console.error(
    `\ncheck:logo-encoding FAILED — ${failures.length} of ${results.length}:\n\n  ` +
      failures.map((f) => `· ${f}`).join('\n\n  ') +
      '\n\nAn operator whose mark will not encode cannot brand the documents they\n' +
      'hand a regulator, and the message they get tells them to do what the\n' +
      'client already did. Fix the ladder in logo-panel.js, not the ceiling.\n'
  );
  process.exit(1);
}

console.log(`\ncheck:logo-encoding ok — ${marks.length} marks encode under the ceiling, SVG refused.`);
