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

   Every item in a working section carries a HINT, and the hints are
   NOT IN THIS FILE. "Triage" means nothing to somebody on their first
   shift; "everything filed on this handset, sent or not" does — but
   this module is imported by main.js, so a sentence written here is a
   sentence parsed before the app renders, by every person on every
   cold start, including the one who taps "File a report" from the
   landing page and never opens a menu.

   So they live in shared/menu-hints.js, keyed by href, loaded when the
   menu is first opened. Same split, and the same reasoning, as the
   toolkit blurbs described below: the LIST is canonical here, the
   PROSE lives where it is printed, and a test rather than proximity
   keeps the two in step — tests/sitemap.test.ts fails when an item in
   a working section has no hint in that module.

   The footer prints labels alone and never hints. A hint under a
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

   So the hint is COMPUTED from this list — in shared/menu-hints.js,
   where the sentence it builds is printed — and the toolkits page
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
   index. `short` stays, because it is the list rather than the prose —
   menu-hints.js builds the Toolkits sentence out of it.

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
        inHeader: true
      },
      {
        href: '/account',
        label: 'Account',
        short: 'Account'
      }
    ]
  },
  {
    id: 'occurrence',
    title: 'When something happens',
    working: true,
    items: [
      /* FIRST IN THE SEQUENCE THAT STARTS AFTER SIGNING IN, and ahead
         of the report form deliberately. Filing is what a REPORTER
         does; opening the day's list is what the safety office does,
         and this section is read top to bottom by both. It sits inside
         "when something happens" rather than in its own group because
         it is the answer to that question, not a new subject. */
      {
        href: '/today',
        label: 'What needs you today',
        short: 'Today',
        inHeader: true
      },
      {
        href: '/report',
        label: 'File a report',
        short: 'Report',
        inHeader: true
      },
      {
        href: '/triage',
        label: 'The reporting queue',
        short: 'Triage',
        inHeader: true
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
        inHeader: true
      },
      {
        href: '/toolkits/register',
        label: 'Risk register',
        short: 'Register'
      },
      {
        href: '/toolkits',
        label: 'Toolkits and calculators',
        short: 'Toolkits'
      }
    ]
  },
  {
    id: 'assurance',
    title: 'Show it is working',
    working: true,
    items: [
      {
        /* FIRST IN THIS GROUP, and first is the argument. "Show it is
           working" is a question about the whole operator, and every
           other item here answers part of it — this is the one that
           answers it in one page. */
        href: '/picture',
        label: 'The risk picture',
        short: 'Risk picture',
        inHeader: true
      },
      {
        href: '/toolkits/spi',
        label: 'Safety performance indicators',
        short: 'Indicators'
      },
      {
        href: '/sms',
        label: 'The SMS record',
        short: 'SMS record',
        inHeader: true
      },
      {
        href: '/coverage',
        label: 'What this covers',
        short: 'Coverage'
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
        short: 'Methodology'
      },
      {
        href: '/tutorials',
        label: 'Tutorials',
        short: 'Tutorials'
      },
      {
        href: '/templates',
        label: 'Templates and source documents',
        short: 'Templates'
      },
      {
        href: '/glossary',
        label: 'Glossary',
        short: 'Glossary'
      },
      {
        href: '/faq',
        label: 'Questions, answered straight',
        short: 'Questions'
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
      /* WHAT IT COSTS, in the footer of every screen. A product whose
         price is only available by asking is a product an operator does
         not evaluate on a Sunday evening, which is when a safety
         manager at a six-aircraft charter actually does this. */
      { href: '/pricing', label: 'What it costs' },
      /* THE ONE ROUTE THE SITEMAP DID NOT KNOW ABOUT. /signup has been
         registered since self-service accounts landed and was reachable
         from exactly two in-page links — the sign-in screen and the
         pricing page. So a safety manager who arrived on /about, read
         it, and decided had no path to an account without first finding
         /pricing; and the footer, which is this product's site index,
         did not list the page where a customer starts.

         IN THE FOOTER AND NOT THE HEADER, deliberately. The header
         carries the operator's own sequence — what somebody signed in
         uses the product to DO — and an account-creation link there is
         weight in the entry chunk charged to every reporter who already
         has one. A footer is where a site index belongs. */
      { href: '/signup', label: 'Create an operator account' },
      /* IN THE FOOTER, NOT THE HEADER, for the same reason /signup is:
         the header carries the operator's SEQUENCE — what somebody
         signed in uses the product to do — and a profile link there is
         entry-chunk weight on every screen for a page opened once or
         twice in the life of an account. The account area itself links
         to it prominently, which is where somebody looks. */
      { href: '/account/profile', label: 'Your profile' },
      /* Listed here for the same reason as the profile: the gate that
         fails on a registered route nobody advertises is the reason
         this product has no invisible screens. The account area is
         where somebody actually reaches it. */
      { href: '/account/logo', label: 'Your operator’s mark' },
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
