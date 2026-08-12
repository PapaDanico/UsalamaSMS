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
const main = read('apps/web/src/main.js');

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

  it('gives every item in a header section a hint, because the header shows them', () => {
    /* An item with no hint renders an empty line under its label in the
       menu — the defect the hints were introduced to fix, back. Only
       the `working` sections are checked: the footer prints labels
       alone and a hint there would be a paragraph in a column eighty
       pixels wide. */
    const working = /working: true,\n    items: \[([\s\S]*?)\n    \]/g;
    const blocks = [...sitemap.matchAll(working)];
    expect(blocks.length, 'no header sections found').toBeGreaterThan(1);
    for (const block of blocks) {
      const items = block[1]!.split(/\},\s*\{/);
      for (const item of items) {
        const href = /href: '([^']+)'/.exec(item)?.[1] ?? '(unnamed)';
        expect(item, `${href} has no hint`).toMatch(/hint:/);
      }
    }
  });
});
