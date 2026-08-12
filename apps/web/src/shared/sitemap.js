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

export const SECTIONS = [
  {
    id: 'platform',
    title: 'The platform',
    working: true,
    items: [
      {
        href: '/report',
        label: 'File a report',
        short: 'Report',
        hint: 'Three fields, thirty seconds, and it works with no signal'
      },
      {
        href: '/triage',
        label: 'Reports on this device',
        short: 'Triage',
        hint: 'Everything filed on this handset, sent or not'
      },
      {
        href: '/sms',
        label: 'The SMS record',
        short: 'SMS record',
        hint: "Your operator's own evidence against all twelve elements"
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
    id: 'understand',
    title: 'Understand',
    working: true,
    items: [
      {
        href: '/toolkits',
        label: 'Toolkits',
        short: 'Toolkits',
        hint: TOOLKITS_HINT
      },
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
      { href: '/coverage', label: 'What this covers' },
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
