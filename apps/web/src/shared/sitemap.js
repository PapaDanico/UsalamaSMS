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
        hint: 'Maturity assessment, occurrence classifier, risk tolerability'
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
