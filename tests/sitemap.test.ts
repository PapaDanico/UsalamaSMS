/* ============================================================
   The toolkit list is declared once and rendered by three surfaces —
   the menu hint, the toolkits page and its contents list. The defect
   it was built against is on the record: the safety risk assessment
   shipped and was invisible to anyone navigating, because the menu
   hint was a sentence somebody typed listing the three toolkits that
   existed at the time.

   THE PROSE HAS NOW MOVED OUT OF THE LIST, to keep six sentences only
   the lazily-loaded toolkits page prints out of the entry chunk a
   reporter at a strip downloads. That is a real saving and it costs
   the guarantee proximity used to give: a toolkit added to the list in
   sitemap.js no longer arrives beside the place its blurb is written.

   So the guarantee is a test now. Add a toolkit without copy and this
   goes red — which is the same failure the list was created to stop,
   one level up.
   ============================================================ */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const toolkitsPage = read('apps/web/src/tools/toolkits/index.js');
const sitemap = read('apps/web/src/shared/sitemap.js');
const hints = read('apps/web/src/shared/menu-hints.js');
const main = read('apps/web/src/main.js');
const account = read('packages/shared/src/account.ts');

/* sitemap.js is browser code with no type declarations, so it is read
   as source here rather than imported — the same way the pages are.
   Both lists below come out of the one declaration, so a stale copy is
   not possible; only a regex that stops matching is, and the first
   test in each block guards that. */
const hrefs = (): string[] => [...sitemap.matchAll(/href: '([^']+)'/g)].map((m) => m[1]!);
const toolkitHrefs = (): string[] => {
  const block = /export const TOOLKITS = \[([\s\S]*?)\n\];/.exec(sitemap);
  return block ? [...block[1]!.matchAll(/href: '([^']+)'/g)].map((m) => m[1]!) : [];
};

/** The blurb keys, read from the page rather than imported — the page
    is browser code and importing it here would drag the DOM in. */
function blurbKeys(): string[] {
  const block = /const BLURBS = \{([\s\S]*?)\n\};/.exec(toolkitsPage);
  if (!block) return [];
  return [...block[1]!.matchAll(/^  '([^']+)':/gm)].map((m) => m[1]!);
}

describe('the toolkit list', () => {
  it('finds the blurb block at all', () => {
    // A regex that stops matching passes every assertion under it.
    expect(blurbKeys().length).toBeGreaterThan(3);
  });

  it('GIVES EVERY TOOLKIT A TITLE AND A BLURB, so one cannot ship without copy', () => {
    const keys = blurbKeys();
    for (const href of toolkitHrefs()) {
      expect(keys, `${href} has no copy on the toolkits page`).toContain(href);
    }
    /* Both halves, not just the key. An entry with a title and an empty
       blurb renders a heading over a blank line, which is the same
       "added and invisible" failure in miniature. */
    const block = /const BLURBS = \{([\s\S]*?)\n\};/.exec(toolkitsPage)![1]!;
    const pairs = [...block.matchAll(/'[^']*',\s*\n?\s*'([^']{10,})'/g)];
    expect(pairs.length, 'no [title, blurb] pairs parsed').toBe(toolkitHrefs().length);
  });

  it('CARRIES NO BLURB FOR A TOOLKIT THAT NO LONGER EXISTS', () => {
    // The opposite sign of the same fault: prose for something removed
    // renders nothing and quietly rots.
    const known = toolkitHrefs();
    for (const key of blurbKeys()) {
      expect(known, `a blurb exists for ${key}, which is not a toolkit`).toContain(key);
    }
  });

  it('keeps the blurbs OUT of the sitemap, which the entry chunk loads', () => {
    /* The saving this move bought. If a blurb comes back to sitemap.js
       it lands in the entry bundle again, and the budget will only
       notice once it has accumulated enough to breach — by which time
       nobody remembers why it was moved. */
    expect(sitemap).not.toMatch(/blurb:/);
    /* And the full labels, moved for the same reason. `short` stays —
       the menu hint is computed from it and the menu is the entry. */
    const block = /export const TOOLKITS = \[([\s\S]*?)\n\];/.exec(sitemap)![1]!;
    expect(block).not.toMatch(/label:/);
    expect(block).toMatch(/short:/);
  });
});

describe('the information architecture', () => {
  it('finds the declarations at all', () => {
    expect(hrefs().length).toBeGreaterThan(10);
    expect(toolkitHrefs().length).toBeGreaterThan(3);
  });

  it('registers a route for every destination it advertises', () => {
    /* A menu item with no route is a dead link in the navigation, and
       the person who finds it is the one looking for the thing that was
       just added. In-page anchors are excluded — they resolve on a page
       that is itself registered. */
    for (const href of hrefs()) {
      const path = href.split('#')[0]!;
      if (path === '' || path === '/') continue;
      expect(main, `${href} is in the menu with no route registered`).toContain(`'${path}'`);
    }
  });

  /* THE INVERSE OF THE TEST ABOVE, AND THE ONE THAT WAS MISSING.
   *
   * That test asks whether every menu item leads somewhere. This asks
   * whether everywhere can be reached from the menu — and until it was
   * written the answer was no. /signup had been registered since
   * self-service accounts landed and appeared in NO section, so it was
   * reachable from exactly two in-page links. A safety manager who
   * arrived on /about and decided had no path to an account without
   * first finding /pricing, and the footer — which is this product's
   * site index — did not list the page where a customer starts.
   *
   * That is the same defect shape as the safety risk assessment
   * shipping invisible to anyone navigating, and as the CAPA loop
   * having no UI while /coverage claimed it. A capability with no
   * reachable surface is a capability nobody uses, and this repository
   * has now met it three times. The rule it keeps writing down is that
   * a claim is kept by a mechanism rather than by remembering, so this
   * is the mechanism for the navigation half of it.
   *
   * THE FOOTER COUNTS AS REACHABLE. An entry does not have to be in the
   * header — /signup is deliberately not, because the header carries
   * what somebody signed in uses the product to DO, and an
   * account-creation link there is entry-chunk weight charged to every
   * reporter who already has one. A footer is where a site index
   * belongs, and the footer renders every section. */
  it('advertises every route it registers, so nothing ships unreachable', () => {
    const advertised = new Set(hrefs().map((h) => h.split('#')[0]!));

    /* Read from main.js's register() calls rather than from a list
       typed here — a list typed here is a list that stops matching the
       router the first time somebody adds a screen, which is precisely
       the failure this test exists to catch one level down. */
    const registered = [...main.matchAll(/\.register\(\s*'(\/[^']*)'/g)].map((m) => m[1]!);
    expect(registered.length, 'no routes were read out of main.js').toBeGreaterThan(10);

    for (const path of registered) {
      /* The landing page is the lockup in every header rather than a
         menu item, and listing it would print "Home" in a site index
         that is already reached by the mark. */
      if (path === '/') continue;
      expect(
        advertised.has(path),
        `${path} is a registered route that no section of the sitemap advertises — ` +
          'it ships reachable only by whatever happens to link to it',
      ).toBe(true);
    }
  });

  /* WHICH SURFACE A SCREEN DECLARES ITSELF TO BE.
   *
   * The router stamps data-surface on the root and style.css answers it
   * — tool screens get 27px headings and tighter panels, document
   * pages keep the 52px hero. The default is 'document',
   * chosen so a screen that forgets to declare itself gets the
   * editorial treatment: wrong in a way somebody notices, rather than
   * wrong in a way that quietly under-sets a landing page.
   *
   * WHICH MAKES THE OMISSION SILENT IN THE OTHER DIRECTION. A new tool
   * screen that forgets `surface: 'tool'` renders with a marketing hero
   * over the queue and nothing fails — it just looks like the defect
   * this split was built to remove. So the two declarations are tied
   * together here: every destination the ACCOUNT AREA offers a
   * signed-in person is a screen they OPERATE, and must say so.
   *
   * account.ts is the right source for that list rather than a second
   * one typed here, because it is already the answer to "what does
   * somebody signed in reach". */
  it('declares every signed-in destination a tool surface', () => {
    const destinations = [...account.matchAll(/href: "(\/[^"]*)"/g)].map((m) => m[1]!);
    expect(
      destinations.length,
      'no destinations were read out of account.ts — this gate is blind',
    ).toBeGreaterThan(6);

    /* Each .register(...) call as its own chunk, so a path is matched
       against ITS OWN registration rather than against whatever meta
       happens to appear within N characters of it. */
    const registrations = main.split('.register(').slice(1);
    expect(registrations.length, 'no routes were read out of main.js').toBeGreaterThan(10);

    for (const href of destinations) {
      const own = registrations.find((chunk) => chunk.trimStart().startsWith(`'${href}'`));
      expect(own, `${href} is offered by the account area and has no route`).toBeTruthy();
      /* The chunk IS this one registration — the split ended it at the
         next .register( — so it is searched whole rather than sliced to
         a delimiter that may not appear in it. */
      expect(
        own,
        `${href} is a screen somebody OPERATES and does not declare surface: 'tool' — ` +
          'it will render with a 52px marketing hero over the work',
      ).toContain("surface: 'tool'");
    }
  });

  it('gives every item in a header section a hint, because the menu shows them', () => {
    /* An item with no hint renders an empty line under its label in the
       menu — the defect the hints were introduced to fix, back. Only
       the `working` sections are checked: the footer prints labels
       alone and a hint there would be a paragraph in a column eighty
       pixels wide.

       THE HINTS ARE NO LONGER BESIDE THE ITEMS. They moved to
       shared/menu-hints.js so fourteen sentences stop being parsed
       before first paint by a reporter who never opens a menu. That is
       a real saving and it costs exactly the guarantee proximity used
       to give: an item added to sitemap.js no longer arrives next to
       the place its sentence is written.

       So this now reads BOTH files and matches them by href, which is
       the key the rendered menu uses. Same trade, and the same
       resolution, as the toolkit blurbs above. */
    const working = /working: true,\n    items: \[([\s\S]*?)\n    \]/g;
    const blocks = [...sitemap.matchAll(working)];
    expect(blocks.length, 'no header sections found').toBeGreaterThan(1);

    const hinted = new Set(
      [...hints.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]!)
    );
    expect(hinted.size, 'no hints were read out of menu-hints.js').toBeGreaterThan(6);

    for (const block of blocks) {
      for (const item of block[1]!.split(/\},\s*\{/)) {
        const href = /href: '([^']+)'/.exec(item)?.[1];
        if (!href) continue;
        expect(hinted.has(href), `${href} is in the menu with no hint in menu-hints.js`).toBe(
          true
        );
      }
    }
  });

  it('WRITES NO HINT BACK INTO THE ENTRY CHUNK, which is the whole point of moving them', () => {
    /* sitemap.js is imported by main.js, so it IS the entry chunk.
       Adding `hint:` back to an item is the obvious thing to do —
       it is where the item lives and where the old ones used to be —
       and it would quietly undo the saving with nothing to notice.

       The build-level version of this is in check-claims.mjs, which
       greps the built entry asset for the prose itself. This one is
       here because it names the mistake at the file somebody is
       editing when they make it. */
    expect(sitemap, 'a hint was written back into sitemap.js').not.toMatch(/^\s*hint:/m);
  });

  it('leaves every menu destination with a summary element to write into', () => {
    /* The panel renders before the hints arrive, so the summary span
       must exist from the first frame and be addressable by href.
       Rendering it only once the module lands would reflow the panel
       under a thumb already moving. */
    expect(main).toMatch(/class="nav-item-summary"/);
    expect(main, 'nothing ever loads the hints').toMatch(
      /import\(['"]\.\/shared\/menu-hints\.js['"]\)/
    );
  });
});
