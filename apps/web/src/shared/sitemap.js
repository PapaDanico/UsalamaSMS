/* ============================================================
   The information architecture, declared once.

   WHY IT IS A MODULE RATHER THAN MARKUP. The header menu and the
   footer columns are two renderings of one structure. When they were
   two lists, they drifted — the footer repeated the header's four
   destinations and told nobody anything, which is the defect the
   footer rebuild started from. A list written twice is a list that
   disagrees with itself eventually, and the half nobody is looking at
   is the half that goes stale.

   So: four sections, and each surface renders the parts of it that
   surface is for.

     HEADER  the sections marked `working: true` — what somebody uses
             the product to do, and the reference they reach for while
             doing it. Short labels; the header has room for four
             words, not four sentences.

     FOOTER  all four, as columns. A footer is a site index and a
             statement of what the numbers rest on. It is not the
             header drawn twice, and scripts/smoke.mjs holds that line
             by asserting the footer carries links the header does not.

   Every item carries a HINT. "Triage" means nothing to somebody on
   their first shift; "everything filed on this device, sent or not"
   does. The menu shows them, the footer does not — a hint under a
   footer link is a paragraph in a column eighty pixels wide.
   ============================================================ */

/* ------------------------------------------------------------
   THE TOOLKITS, declared here for the same reason the sections are.

   A toolkit that gets built and never named is a toolkit nobody
   opens. The safety risk assessment shipped, was linked from the
   coverage page, and was invisible to anyone navigating: the menu
   carried "Toolkits" with a hint listing the three instruments that
   happened to exist when the hint was typed. A hint typed once is a
   hint that goes stale the next time something is added, and the
   person it goes stale for is the one looking for the thing that was
   added.

   So the hint is COMPUTED from this list, and the toolkits page
   renders its hero and its contents from the same list. Adding a
   toolkit in one place adds it in all three.

   Three of them have their own route because they are long enough to
   need one. The rest are calculators on the index page — short enough
   to answer in place, and counted rather than listed so the hint stays
   the width of a menu.

   THE PROSE IS NOT HERE, and that is the one thing about this list
   worth explaining. Each toolkit's full label and its sentence of
   blurb are rendered by exactly one surface — the toolkits page — and
   this module is imported by main.js, so keeping them here put six
   sentences and six titles into the ENTRY chunk that only a
   lazily-loaded page ever reads. That is weight charged to a reporter
   at a strip who is filing a report and will never open the toolkits
   index. `short` stays, because the menu hint is computed from it and
   the menu IS the entry.

   So the LIST stays canonical here and the prose lives where it is
   printed. The guarantee that made this list single-source is kept by
   a test rather than by proximity: tests/sitemap.test.ts requires every
   entry to have a blurb, so adding a toolkit without copy still fails
   the build. Declared once, rendered where used.
   ------------------------------------------------------------ */
export const TOOLKITS = [
  {
    href: '/toolkits/sra',
    short: 'risk assessment',
    routed: true
  },
  {
    href: '/toolkits/register',
    short: 'risk register',
    routed: true
  },
  {
    href: '/toolkits/spi',
    short: 'performance indicators',
    routed: true
  },
  {
    href: '/toolkits/maturity',
    short: 'maturity assessment',
    routed: true
  },
  {
    href: '/toolkits#classifier',
    short: 'occurrence classifier'
  },
  {
    href: '/toolkits#risk',
    short: 'risk tolerability'
  }
];

/** The ones with a route of their own, named; the rest, counted. */
export const ROUTED_TOOLKITS = TOOLKITS.filter((t) => t.routed);
const CALCULATORS = TOOLKITS.length - ROUTED_TOOLKITS.length;

const TOOLKITS_HINT = `${ROUTED_TOOLKITS.map((t) => t.short).join(', ')} and ${CALCULATORS} calculators`.replace(
  /^./,
  (c) => c.toUpperCase()
);

/* ============================================================
   THE GROUPS ARE THE OPERATOR'S SEQUENCE, NOT OUR FILING SYSTEM.

   WHAT WAS WRONG, in the words it was reported in: "the
   functionalities seem to be all over the place with no logical
   sequence — a user would be confused where to start or get what,
   for instance the SRA."

   Both halves of that were true and they had one cause.

   The groups were called "The platform" and "Understand". Those name
   where we keep things. Nobody arrives at a safety tool wanting a
   platform; they arrive having had a bird strike, or with an audit in
   six weeks, or not knowing whether their SMS is any good. A menu
   organised by our storage is a menu you can only use once you
   already know the product.

   And six instruments — the risk assessment, the register, the
   indicators, the maturity assessment and two calculators — sat
   behind the single word "Toolkits", which is the most container-ish
   noun in the product.

   THE SRA IS THE PROOF, AND THIS IS THE SECOND TIME IT HAS BEEN THE
   PROOF. The first is on the record in scripts/smoke.mjs: the safety
   risk assessment "shipped, was routed, was linked from the coverage
   page, and was invisible to anybody navigating". The fix then was to
   COMPUTE the menu hint from this list, so a new toolkit could not be
   left out of the sentence. That was the right fix to the problem it
   was aimed at — a stale sentence — and it did not touch the real
   one. A name inside a hint is not a destination. You cannot click
   "risk assessment" in a sentence under a link called "Toolkits"; you
   click Toolkits and then go looking. Naming a thing in the label of
   the drawer it is in is still leaving it in the drawer.

   SO THE ORDER IS THE SEQUENCE AN OPERATOR ACTUALLY MOVES THROUGH,
   and it is not invented here — it is Annex 19's own four components,
   which is also the order regulation 9(4) of L.N. 32/2026 assumes
   when it requires a plan "to facilitate the implementation":

     Start here                  where do we stand, and who am I
     When something happens      file it, then see what is filed
     Assess and manage the risk  how bad, who owns it, when reviewed
     Show it is working          indicators, the record, the limits
     Reference                   what you reach for while doing any of it

   Every instrument with a route of its own now sits in the group that
   answers the question it exists to answer, under its own name. The
   toolkits index keeps an entry because the two calculators live
   there and are genuinely too short to route.

   THE HEADER PICKS ITS OWN ITEMS, DECLARED. It used to render
   `SECTIONS[0].items` plus `SECTIONS[1].items[0]` — positional, so
   the header's contents were a consequence of the order of this file.
   Reordering these groups, which is exactly what this change does,
   would have silently rewritten the header. `inHeader: true` says
   which five destinations earn a slot on a wide screen, and it says
   it here, where somebody adding a group can see it.
   ============================================================ */
export const SECTIONS = [
  {
    id: 'standing',
    title: 'Start here',
    working: true,
    items: [
      {
        href: '/toolkits/maturity',
        label: 'Where your SMS stands',
        short: 'Where you stand',
        inHeader: true,
        hint: 'Grade the twelve elements, and get the implementation plan that falls out of it'
      },
      {
        href: '/account',
        label: 'Account',
        short: 'Account',
        hint: 'Sign in so queued reports can reach the safety office'
      }
    ]
  },
  {
    id: 'occurrence',
    title: 'When something happens',
    working: true,
    items: [
      {
        href: '/report',
        label: 'File a report',
        short: 'Report',
        inHeader: true,
        hint: 'Three fields, thirty seconds, and it works with no signal'
      },
      {
        href: '/triage',
        label: 'Reports on this device',
        short: 'Triage',
        inHeader: true,
        hint: 'Everything filed on this handset, sent or not'
      }
    ]
  },
  {
    id: 'risk',
    title: 'Assess and manage the risk',
    working: true,
    items: [
      {
        href: '/toolkits/sra',
        label: 'Safety risk assessment',
        short: 'Risk assessment',
        inHeader: true,
        hint: "Doc 9859's five steps, from the hazard to a decision somebody signs"
      },
      {
        href: '/toolkits/register',
        label: 'Risk register',
        short: 'Register',
        hint: 'What you have accepted, who owns each one, and when it is next looked at'
      },
      {
        href: '/toolkits',
        label: 'Toolkits and calculators',
        short: 'Toolkits',
        hint: TOOLKITS_HINT
      }
    ]
  },
  {
    id: 'assurance',
    title: 'Show it is working',
    working: true,
    items: [
      {
        href: '/toolkits/spi',
        label: 'Safety performance indicators',
        short: 'Indicators',
        hint: 'What regulation 9(5) requires you to have, and to be able to produce'
      },
      {
        href: '/sms',
        label: 'The SMS record',
        short: 'SMS record',
        inHeader: true,
        hint: "Your operator's own evidence against all twelve elements"
      },
      {
        href: '/coverage',
        label: 'What this covers',
        short: 'Coverage',
        hint: 'Element by element, what this product does and exactly where it stops'
      }
    ]
  },
  {
    id: 'reference',
    title: 'Reference',
    working: true,
    items: [
      /* Toolkits is NOT repeated here. It sits in "Assess and manage
         the risk", which is what its two remaining calculators are
         for; a second entry would be the same destination twice in
         one menu, which is the fault this whole change is against. */
      {
        href: '/methodology',
        label: 'Methodology',
        short: 'Methodology',
        hint: 'How every deadline and risk index in this product is derived'
      },
      {
        href: '/tutorials',
        label: 'Tutorials',
        short: 'Tutorials',
        hint: 'From a first report to a record a regulator can audit'
      },
      {
        href: '/templates',
        label: 'Templates and source documents',
        short: 'Templates',
        hint: 'What the authorities publish, and what we already do for you'
      },
      {
        href: '/glossary',
        label: 'Glossary',
        short: 'Glossary',
        hint: 'The vocabulary, transcribed from the KCAA course glossary'
      },
      {
        href: '/faq',
        label: 'Questions, answered straight',
        short: 'Questions',
        hint: 'What operators actually ask, including what we cannot answer'
      }
    ]
  },
  {
    id: 'practice',
    title: 'The practice',
    items: [
      /* "What this covers" moved up into "Show it is working", where
         an operator asking what they can actually evidence will look
         for it. The footer renders every section, so leaving it here
         too would print it twice in one footer. */
      { href: '/about', label: 'About us' },
      { href: '/#deadlines', label: 'Regulatory basis' }
    ]
  },
  {
    id: 'legal',
    title: 'Legal',
    items: [
      { href: '/privacy', label: 'Privacy notice' },
      { href: '/terms', label: 'Terms of use' }
    ]
  }
];

/** The sections the header carries — what a person navigates with. */
export const WORKING_SECTIONS = SECTIONS.filter((s) => s.working);

/** Flat, for the router and for marking the current destination. */
export const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);
