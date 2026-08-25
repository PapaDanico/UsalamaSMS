/* ============================================================
   The menu's hint text, and the only reason it is not in sitemap.js
   beside the items it describes.

   THE MENU IS THE ENTRY CHUNK. sitemap.js is imported by main.js, so
   everything in it is parsed and executed before the app renders
   anything at all — before a reporter at a strip can begin filing.
   Fourteen sentences of help text is a small thing to carry, and it
   was being carried by every person on every cold start, including
   the one who taps "File a report" from the landing page and never
   opens the menu.

   This is the same argument, and the same resolution, as the toolkit
   blurbs recorded in sitemap.js: the LIST stays canonical there and
   the PROSE lives where it is printed. Declared once, rendered where
   used.

   WHAT IT DOES AND DOES NOT BUY, stated plainly because the number is
   modest and the mechanism is easy to overstate. The service worker
   precaches every hashed asset, so this chunk is fetched anyway — the
   TOTAL a device downloads is unchanged, and the total budget already
   counted it. What changes is WHEN. These bytes are off the critical
   path now: not parsed before first paint, not blocking the form.
   That is exactly the distinction the two budget numbers exist to
   draw, and it is the whole of the claim being made here.

   THE PANEL IS USABLE BEFORE THIS ARRIVES. main.js renders every
   destination's title immediately and fills the summaries in when this
   module lands. A hint is help text; the title is the navigation. If
   this never loaded at all the menu would still work, which is the
   property that makes deferring it honest rather than a gamble.

   scripts/check-claims.mjs asserts this prose is absent from the entry
   chunk of the BUILT bundle. Without that, the next hint written in
   sitemap.js — where it is the obvious place to write one — puts the
   weight straight back with nothing to notice.
   ============================================================ */

import { TOOLKITS, ROUTED_TOOLKITS } from './sitemap.js';

/* Computed, not typed, and moved here with the rest of the prose. The
   reasoning in sitemap.js still holds — a hint listing the toolkits
   that existed on the day somebody typed it goes stale for exactly
   the person hunting for the one added last — but the SENTENCE it
   builds is printed only by the menu, so it belongs where the other
   sentences are. `short` stays in sitemap.js because it is the list. */
const CALCULATORS = TOOLKITS.length - ROUTED_TOOLKITS.length;
const TOOLKITS_HINT = `${ROUTED_TOOLKITS.map((t) => t.short).join(', ')} and ${CALCULATORS} calculators`.replace(
  /^./,
  (c) => c.toUpperCase()
);

/**
 * Keyed by href, which is what the rendered menu already carries. A
 * map rather than a parallel array: an array would have to stay in the
 * same order as SECTIONS, and the two files would silently disagree
 * the first time a group was reordered — which is a thing that has
 * happened to this architecture once already.
 */
export const MENU_HINTS = {
  '/toolkits/maturity':
    'Grade the twelve elements, and get the implementation plan that falls out of it',
  '/account': 'Sign in so queued reports can reach the safety office',

  '/report': 'Three fields, thirty seconds, and it works with no signal',
  '/today': 'The reporting deadlines, lapsing training and untriaged reports asking for you now',
  '/triage': "Everything the operator has filed, and what has not left this handset",

  '/picture': 'Where the operator stands: reporting, register, indicators, in one page',
  '/toolkits/risk-picture':
    "Tolerability, severity and action closure in one operator-level risk dashboard",

  '/toolkits/sra': "Doc 9859's five steps, from the hazard to a decision somebody signs",
  '/toolkits/register':
    'What you have accepted, who owns each one, and when it is next looked at',
  '/toolkits': TOOLKITS_HINT,

  '/toolkits/spi': 'What regulation 9(5) requires you to have, and to be able to produce',
  '/fatigue': 'Whether the duty limits you declared are actually protecting anybody',
  '/sms': "Your operator's own evidence against all twelve elements",
  '/toolkits/icaas':
    'Answer a KCAA request with the plan composed from your own record, not retyped',
  '/amendment': 'Seven questions against the changes that apply from 26 November 2026',
  '/toolkits/culture': 'Will your people actually file? Fourteen questions, scored on the device',
  '/seti': 'Evidence-led CAA SET-I ratings, with accountable posts and review dates for every criterion',
  '/training': 'What the SMS course covers, who sits which version, and how long each runs',
  '/coverage': 'Element by element, what this product does and exactly where it stops',

  '/methodology': 'How every deadline and risk index in this product is derived',
  '/tutorials': 'From a first report to a record a regulator can audit',
  '/templates': 'What the authorities publish, and what we already do for you',
  '/glossary': 'The vocabulary, transcribed from the KCAA course glossary',
  '/faq': 'What operators actually ask, including what we cannot answer'
};

/**
 * WHAT A GROUP IS FOR, which is a different question from what it is
 * called.
 *
 * Kanda's menu sets a section eyebrow over a one-line purpose — "MOVE /
 * Operational diagnostics" — and it is the line that turns a list of
 * headings into a map. This product's headings are already phrases
 * rather than single words, so the purpose here says WHEN somebody is
 * in this group rather than restating the heading in other words. A
 * purpose that paraphrases its own title is furniture.
 *
 * Keyed by the section id rather than the title, for the reason above:
 * an id is four characters and a title is a sentence, and the entry
 * chunk pays for whichever one main.js writes into the markup.
 */
export const GROUP_PURPOSE = {
  standing: 'Before the first report, and after a change of post',
  occurrence: 'The hour after something happens, and the days that follow',
  risk: 'Standing hazards, and the decisions somebody signs',
  assurance: 'What an inspector asks for, and what you hand over',
  reference: 'The instruments behind every number on these screens'
};
