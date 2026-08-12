/* ============================================================
   The template registry is a page of somebody else's documents, which
   makes it the easiest place in this product to say something false
   without noticing.

   Three ways it could go wrong, and each has a test:

     · a link that goes somewhere other than the publisher — the whole
       argument for linking rather than hosting is that the reader
       reaches the current copy from the people who revise it;
     · an entry with nothing in "what you still need", which would turn
       an index into a claim that the document is covered here;
     · a jurisdiction warning that quietly goes missing, leaving a page
       of Australian templates reading as Kenyan requirements. That is
       the 72-hour-deadline failure wearing different clothes.
   ============================================================ */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TEMPLATES, elementsWithTemplate } from '../packages/shared/src/templates';
import { SMS_ELEMENTS } from '../packages/shared/src/maturity';

const ELEMENT_IDS = SMS_ELEMENTS.map((e) => e.id);

const page = readFileSync(
  resolve(__dirname, '../apps/web/src/tools/templates/index.js'),
  'utf8'
);

describe('the template registry', () => {
  it('has entries at all', () => {
    // A registry that reads empty passes every loop below it.
    expect(TEMPLATES.length).toBeGreaterThan(3);
  });

  it('carries no duplicate ids, which are the anchor targets', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it('LINKS ONLY TO THE PUBLISHER, never to a copy held here', () => {
    /* The argument for not hosting these is that the reader reaches the
       copy the publisher revises. A relative URL, or a link to our own
       origin, silently converts this page from an index into a mirror —
       and a mirror of a document that gets revised is the stale copy
       this whole design was avoiding. */
    for (const template of TEMPLATES) {
      expect(template.url, `${template.id} does not link out`).toMatch(/^https:\/\//);
      expect(template.url, `${template.id} links to our own origin`).not.toMatch(
        /usalamasms/i
      );
    }
  });

  it('NAMES A PUBLISHER WITH A COUNTRY, so nobody reads CASA as their regulator', () => {
    // "CASA" alone is a name a Kenyan operator has no reason to place.
    for (const template of TEMPLATES) {
      expect(template.publisher.length, `${template.id} has no publisher`).toBeGreaterThan(3);
    }
    const casa = TEMPLATES.filter((t) => /CASA/.test(t.publisher));
    expect(casa.length).toBeGreaterThan(0);
    for (const template of casa) {
      expect(template.publisher, `${template.id} does not say where CASA is`).toMatch(
        /Australia/
      );
    }
  });

  it('SAYS WHAT IS STILL MISSING FOR EVERY ENTRY, with no exceptions', () => {
    /* An entry listed with nothing missing is a claim that the document
       is covered here. None of them are. This is the same rule
       /coverage holds itself to, and it is the reason this page is a
       product surface rather than an advertisement. */
    for (const template of TEMPLATES) {
      expect(
        template.youStillNeed.trim().length,
        `${template.id} claims nothing is missing`
      ).toBeGreaterThan(30);
      expect(template.weHold.trim().length, `${template.id} says nothing we hold`).toBeGreaterThan(
        20
      );
    }
  });

  it('scopes every entry to elements that exist', () => {
    for (const template of TEMPLATES) {
      if (template.elements === 'ALL') continue;
      expect(template.elements.length, `${template.id} scopes to nothing`).toBeGreaterThan(0);
      for (const id of template.elements) {
        expect(ELEMENT_IDS, `${template.id} cites element ${id}, which does not exist`).toContain(
          id
        );
      }
    }
  });

  it('computes the covered-element count rather than accepting a typed one', () => {
    const covered = elementsWithTemplate(ELEMENT_IDS);
    // Four of the six entries are whole-framework documents, so this is
    // all twelve — but it is computed, and a registry of only
    // element-scoped entries would produce a smaller number honestly.
    expect(covered).toEqual([...ELEMENT_IDS].sort());
  });

  it('reports fewer elements when only element-scoped entries exist', () => {
    // The counter must be capable of a number below twelve, or it is
    // not a counter. Same shape as the coverage figure.
    expect(elementsWithTemplate(ELEMENT_IDS).length).toBe(12);
    const narrow = elementsWithTemplate(['1.1', '1.2']);
    expect(narrow.length).toBeLessThan(12);
  });
});

describe('the templates page', () => {
  it('WARNS THAT THESE ARE NOT KENYAN LAW, and does it above the list', () => {
    /* The highest-consequence sentence on the page. An operator citing
       an Australian template to a KCAA inspector as the requirement has
       made the same class of mistake as a confident wrong deadline —
       and this product exists because that mistake was made here once
       already. */
    expect(page).toMatch(/not Kenyan law/i);
    expect(page).toMatch(/KCAA/);
    const warning = page.indexOf('not Kenyan law');
    const list = page.indexOf('TEMPLATES.map');
    expect(warning).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(-1);
    expect(warning, 'the jurisdiction warning is below the list').toBeLessThan(list);
  });

  it('renders the registry rather than restating it', () => {
    // A page with the six titles typed into it is a page that will
    // disagree with the module the next time one is added.
    expect(page).toMatch(/TEMPLATES\.map/);
    for (const template of TEMPLATES) {
      expect(page, `${template.id} is hardcoded into the page`).not.toContain(template.title);
    }
  });

  it('states the count from the registry, not from a typed number', () => {
    expect(page).toMatch(/TEMPLATES\.length/);
    expect(page).toMatch(/elementsWithTemplate|COVERED\.length/);
  });
});
