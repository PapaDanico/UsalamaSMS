/* =====================================================================
   WHERE CHROMIUM IS, answered once.

   Four scripts drive a real browser — the smoke suite, the two-version
   update gate, the accessibility sweep and the icon rasteriser — and
   until this file existed each of them answered this question its own
   way. One resolved it properly. One called `chromium.launch()` bare
   and worked by luck. And one carried a HARDCODED PATH to a directory
   that exists only inside the container this project happens to be
   developed in:

       executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'

   That fallback is not a default, it is one machine's layout. On a CI
   runner — where `playwright install` puts browsers under
   ~/.cache/ms-playwright — it names a file that is not there, and the
   gate dies before asserting anything.

   IT WAS INVISIBLE FOR AS LONG AS THE GATE DID NOT RUN. The workflow
   ended with `build` then `smoke` rather than `verify`, so the update
   gate had never executed in CI at all. The first run after that was
   corrected is the run that found it broken — which is the argument for
   the correction, made by the thing itself.

   THE FALLBACK IS `undefined`, DELIBERATELY. Handing Playwright no path
   makes it resolve the browser it installed, which is right on a CI
   runner, right on a laptop, and right in a container that sets
   PLAYWRIGHT_BROWSERS_PATH. A hardcoded guess is only ever right on the
   machine it was written on, and is wrong silently everywhere else.
   ===================================================================== */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function findChromium() {
  /* An explicit override wins. Both spellings are honoured: CHROME_PATH
     is Playwright's own, CHROMIUM_PATH is what the update gate used to
     read, and silently dropping the second would break anybody who has
     it set. */
  if (process.env['CHROME_PATH']) return process.env['CHROME_PATH'];
  if (process.env['CHROMIUM_PATH']) return process.env['CHROMIUM_PATH'];

  /* A browsers directory laid out the way `playwright install` does it,
     newest version first. */
  const base = process.env['PLAYWRIGHT_BROWSERS_PATH'];
  if (base && existsSync(base)) {
    const candidates = readdirSync(base)
      .filter((d) => d.startsWith('chromium-'))
      .sort()
      .reverse()
      .map((d) => join(base, d, 'chrome-linux', 'chrome'))
      .filter((p) => existsSync(p));
    if (candidates[0]) return candidates[0];

    /* Some images unpack a single browser directly rather than into a
       versioned directory. Checked because this project runs in one. */
    const flat = join(base, 'chromium');
    if (existsSync(flat)) return flat;
  }

  return undefined; // let Playwright resolve its own download
}
