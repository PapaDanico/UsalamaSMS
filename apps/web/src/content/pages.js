/* ============================================================
   The prose pages, as data.

   REGISTER. This is written for a safety manager who will paste a
   sentence of it into a board paper, and for a regulator who will read
   it looking for the thing it declines to say. So: statements rather
   than exhortations, a source and a date beside every figure, and the
   limits named in the same voice as the capabilities. Where the honest
   answer is "we cannot tell you that yet", it says so — a page that
   answers everything is a page nobody trusts on the answer that
   matters.

   WHAT IS NOT HERE, deliberately: no price, no address, no named
   individual, no claim about where data is stored beyond what the
   repository can be pointed at. Each of those is a fact this codebase
   does not hold, and inventing one to fill a column is the failure the
   whole charter is written against.

   Every figure below that also exists in code — the number of
   jurisdictions, the KCAA window, the applicability date — is stated
   here in prose because a sentence cannot be interpolated from a
   registry without becoming unreadable. They are covered instead by
   scripts/check-claims.mjs, which fails when the prose and the module
   disagree.
   ============================================================ */

export const ABOUT = {
  eyebrow: 'About us',
  title: 'Safety reporting for the operators the incumbents priced out',
  lede: `The reporting and risk-classification layer of an SMS, built for the
         3-to-15 aircraft operator in East and Central Africa — the one running an
         SMS on paper because the software market starts above what the operation
         earns. It is not a complete SMS, and it says which parts it is not.`,
  sections: [
    {
      id: 'publisher',
      title: 'Who publishes this',
      body: `
        <p><strong>UsalamaSMS is a product of JK &amp; Associates</strong>, and
        operates under that corporate banner. The consultancy practice is the
        reason this product exists in the shape it does: the questions it
        answers are the ones operators bring to an advisory engagement, and the
        instruments it cites are the ones that engagement works from.</p>
        <p>That relationship is stated here, on the
        <a href="/privacy">privacy notice</a> and in the
        <a href="/terms">terms of use</a> rather than left to be inferred,
        because an operator entrusting its safety reports to a product is
        entitled to know which organisation stands behind it before it files
        the first one.</p>`
    },
    {
      id: 'what',
      title: 'What this is',
      body: `
        <p>UsalamaSMS is the <strong>reporting and risk-classification layer of
        an SMS</strong>, not a whole one — and the distinction matters enough to
        make on the first screen rather than in a footnote. What it does is take
        a frontline report, classify it, give it the regulatory clock its
        jurisdiction actually sets, put it against the ICAO Doc 9859 scale, and
        hold it on a record an auditor can verify. It is built around one
        observation about small operators, which
        is that the binding constraint is not analysis but <em>report
        volume</em> — an SMS with no reports is a folder, and every hour of
        friction between a person on a ramp and a filed report costs more than
        any feature downstream can recover.</p>

        <p>So the product is organised around that constraint rather than around
        the feature list. Filing takes three fields and works with the radio
        off. Nothing about reporting is gated behind a password. The reporting
        deadline is computed rather than remembered. What a competitor would put
        on a dashboard, this puts on the one strip that is always on screen.</p>`
    },
    {
      id: 'who',
      title: 'Who it is for',
      body: `
        <p><strong>The part-time safety manager</strong> at an operator with
        three to fifteen aircraft, who holds the SMS alongside another full
        role and needs the regulatory position to be legible without a day of
        assembly.</p>

        <p><strong>The person on the ramp, in the hangar or in the right-hand
        seat</strong> — who is the design target that actually decides things.
        Every trade-off in this product was settled by asking what it costs
        somebody with thirty seconds, gloves on and no signal.</p>

        <p><strong>The regulator, the lessor and the insurer</strong>, who will
        at some point ask an operator to demonstrate that its safety record is
        complete and has not been edited after the fact. That question is why
        the audit chain exists.</p>`
    },
    {
      id: 'standard',
      title: 'The standard it is built to',
      body: `
        <p>ICAO Annex 19 Amendment 2 becomes applicable on
        <time datetime="2026-11-26">26 November 2026</time>. It introduces
        safety intelligence as a formal provision, with Doc 10159 behind it.
        Every established product in this market predates that amendment and
        will add it later; this one is built to it now, which is a real
        advantage and a decaying one.</p>

        <p>Alongside it: Doc 9859 (Safety Management Manual, fourth edition) for
        the risk classification, and each jurisdiction's own mandatory
        occurrence reporting instrument for the deadline. Kenya's is KCAA
        Advisory Circular CAA-AC-SMS004A, which sets <strong>24 hours from
        awareness</strong> — not the 72 hours that the ICAO-common figure would
        suggest, and not from the occurrence.</p>`
    },
    {
      id: 'notyet',
      title: 'What it is not, and what you still need',
      body: `
        <p>ICAO Annex 19 defines a safety management system as four components
        and twelve elements. This product substantially covers <strong>one and a
        half of them</strong>: hazard identification through reporting, and risk
        classification. It also assesses all twelve, which is a different thing
        from managing them.</p>

        <p>An operator adopting it still needs, and will not find here: a signed
        safety policy and accountability structure; an appointed safety manager
        with documented authority; an emergency response plan and its exercises;
        a controlled SMS manual; a risk register with mitigations tracked to
        closure; safety performance indicators with targets and alert levels; a
        management-of-change process; internal audit and corrective action; SMS
        training records; and a safety communication loop back to the people who
        file reports.</p>

        <p><a href="/coverage">The coverage page</a> states every element, its
        status, and what is missing from it — computed from the same declaration
        the figure above comes from, so the two cannot drift apart.</p>

        <p>Several of those are on the way and some are closer than they look —
        the data model already carries hazards, risk assessments and performance
        indicators. But a page that let an operator believe its regulatory
        position was covered by an app that files reports would be doing the
        opposite of what a safety product is for. The
        <a href="/toolkits/maturity">maturity assessment</a> is the honest
        instrument here: it will tell you where the other ten and a half
        elements stand in your operation, including the ones no software can
        stand in for.</p>`
    },
    {
      id: 'position',
      title: 'What we will not claim',
      body: `
        <p>This product does not decide whether an occurrence is reportable.
        That is the accountable manager's judgement and a regulator's to
        review; what it does is compute the window once the classification is
        made, and show it before it closes.</p>

        <p>Three of the five jurisdictions in the registry carry a
        <strong>provisional</strong> figure — the ICAO-common 72 hours, pending
        a reading of the primary instrument. They are marked provisional
        everywhere they appear, including inside the countdown, because a
        deadline an operator relies on and cannot check is worse than no
        deadline at all.</p>

        <p>It is also not a replacement for an SMS manual, a safety committee
        or a competent safety manager. It is the instrument those three use.</p>`
    }
  ]
};

export const TUTORIALS = {
  eyebrow: 'Tutorials',
  title: 'From a first report to a record an auditor can read',
  lede: `The order that makes the parts compound. Each step names what you need in
         front of you, what it produces, and the mistake most operators make at it.`,
  stats: [
    { value: '~40 min', label: 'End to end' },
    { value: '5', label: 'Steps' },
    { value: '0', label: 'Signups to read this' },
    { value: '1', label: 'Auditable record out' }
  ],
  sections: [
    {
      id: 'before',
      title: 'Before you start',
      body: `
        <p>Know which authority the operation answers to. It sets the reporting
        window, and the window is the one figure in this product with a
        consequence attached: an operator under the Kenya Civil Aviation
        Authority has <strong>24 hours from becoming aware</strong> of a
        reportable occurrence, where the regional default is 72. Getting that
        wrong at step one invalidates every clock after it.</p>

        <p>Nothing below requires an account until step four. Filing has never
        required one and is not going to.</p>`
    },
    {
      id: 'steps',
      title: 'The five steps',
      kind: 'steps',
      items: [
        {
          title: 'File one real report, with the phone in flight mode',
          body: `<p>Open the report form and file something that actually
                 happened this week. Turn the radio off first — the point of
                 the exercise is to see the report land in the queue rather
                 than disappear into a spinner. It takes three fields: what
                 kind of report it is, one line of what happened, and the
                 narrative.</p>`,
          pitfall: `Choosing a report type without reading the hint. An
                    <em>occurrence</em> carries a regulatory deadline; a hazard
                    and a near miss do not. That single control is the
                    difference between a countdown starting and not.`
        },
        {
          title: 'Read the deadline the form gives back',
          body: `<p>If the report is an occurrence, the form states the window
                 and the moment it closes, computed from when the operator
                 became aware rather than from when the event happened. Those
                 are usually different dates and the gap is the whole risk —
                 an event discovered three days later has already spent three
                 days of nothing.</p>`,
          pitfall: `Reading the deadline as advice. It is the instrument's
                    figure, cited on the page, with the date it was last
                    checked against the primary source.`
        },
        {
          title: 'Look at the queue on the device',
          body: `<p>Every report filed on a handset stays visible on it, sent
                 or not. Filter by status and read what the badge says: a
                 report that is waiting, a report that failed, and a report
                 the server refused are three different states with three
                 different actions.</p>`,
          pitfall: `Assuming an empty queue means everything arrived. It means
                    everything <em>left</em>. The strip at the top of every
                    screen is the one that speaks for the whole device.`
        },
        {
          title: 'Sign in once, and watch the queue drain',
          body: `<p>Signing in is what tells the system which operator the
                 reports belong to. Until somebody does, they sit on the
                 device — safe, visible and unsent — and the strip says so in
                 those words rather than calling them pending.</p>`,
          pitfall: `Signing in on a shared crew-room handset and leaving it.
                    Signing out clears the session and the cached reads;
                    it does not delete anything already filed.`
        },
        {
          title: 'Establish who reviews, and how often',
          body: `<p>The software will not do this part. Decide who opens the
                 queue, on what cadence, and what happens to a report that has
                 been sitting for a week. An SMS is a management system with a
                 tool attached, and this is the management.</p>`,
          pitfall: `Treating the 24-hour window as the review cadence. It is
                    the regulatory floor for notifying an authority, not a
                    substitute for reading what your own people filed.`
        }
      ]
    },
    {
      id: 'anonymous',
      title: 'On anonymous reporting',
      body: `
        <p>A report can be filed with no identifier attached at all. That is
        not a checkbox that hides a name from a screen — nothing is stored to
        hide. It exists because the reports an operator most needs are the ones
        somebody is afraid to put their name on, and a just culture that only
        works when people trust it is not yet a mechanism.</p>

        <p>The honest caveat, which the form itself states: a narrative
        specific enough to be useful may identify its author to a small
        operator regardless. A person reviews every report before it is shared
        beyond the safety office, and the de-identification pass is available
        before anything circulates.</p>`
    }
  ]
};

export const FAQ = {
  eyebrow: 'Questions',
  title: 'Questions, answered straight',
  lede: `What operators actually ask. Where the honest answer is "it depends" or
         "we cannot tell you that yet", it says so.`,
  sections: [
    {
      id: 'product',
      title: 'The product',
      items: [
        {
          q: 'What is this, precisely?',
          a: `<p>The reporting and risk-classification layer of an SMS, for
              small and mid-sized aircraft operators: occurrence and hazard
              reporting, a computed regulatory deadline per jurisdiction, ICAO
              Doc 9859 risk classification, and an append-only record with a
              verifiable hash chain. It installs as an app on a phone and works
              with the network off.</p>
              <p>It is deliberately <strong>not</strong> a complete SMS. Annex 19
              defines twelve elements; this substantially covers one and a half.
              <a href="/about#notyet">What it is not, and what you still
              need</a> lists the rest, and the
              <a href="/toolkits/maturity">maturity assessment</a> measures where
              your operation stands on them.</p>`
        },
        {
          q: 'Who is it for?',
          a: `<p>Operators of roughly three to fifteen aircraft with a
              part-time safety manager — the segment the established products
              price out — and the frontline people who file the reports. It is
              not built for a flag carrier's safety department, and it would be
              a poor fit for one.</p>`
        },
        {
          q: 'What does it cost?',
          a: `<p>Pricing is not set, and this page will not invent a number to
              look complete. The market position it is built for is below the
              roughly $300 a month at which the cheapest established product
              starts, because above that figure a six-turboprop operator in the
              region is not a price-sensitive customer — it is a non-customer
              running its SMS on paper.</p>`
        },
        {
          q: 'Is it certified or approved by a civil aviation authority?',
          a: `<p>No, and no SMS software is. Authorities approve an operator's
              safety management system — its manual, its accountable manager,
              its processes — not the tool it keeps records in. What software
              can do is make the records complete, dated and hard to alter,
              which is what an inspector asks for. That is the claim being
              made here and it is the only one.</p>`
        }
      ]
    },
    {
      id: 'data',
      title: 'Your data',
      items: [
        {
          q: 'Who can read a report we file?',
          a: `<p>The safety office of the operator that filed it. Every query
              is scoped to the organisation on the record, and a report
              belonging to another operator returns a not-found rather than a
              refusal — a refusal would confirm the record exists.</p>`
        },
        {
          q: 'Does anything leave the device before we sign in?',
          a: `<p>No. A report is written to the handset's own storage first and
              queued. Until somebody signs in, the system does not know which
              operator it belongs to and has nowhere to send it — which is
              exactly what the strip at the top of the screen says, in those
              words, rather than calling it pending.</p>`
        },
        {
          q: 'Does this page load anything from a third party?',
          a: `<p>No. The content security policy names this origin and nothing
              else: no font CDN, no analytics, no tag manager, no embedded
              player. The typefaces are served from here. A dependency that
              started calling home would fail visibly rather than quietly,
              which is the point of stating the policy as a mechanism instead
              of as an intention.</p>`
        },
        {
          q: 'Can a report be edited or deleted after the fact?',
          a: `<p>Records are appended, not overwritten, and each entry carries
              a hash of the one before it. Changing or removing an entry breaks
              the chain from that point forward, and the verification pass says
              where. That is what makes the record evidence rather than a
              spreadsheet.</p>`
        },
        {
          q: 'What happens to identifying detail in a narrative?',
          a: `<p>A de-identification pass runs before anything circulates
              outside the safety office: names, contact details, registrations,
              dates and crew identifiers are removed and the result is checked
              for residuals before it is accepted. It is not magic — a
              narrative can still identify its author by circumstance — and the
              product says so on the form rather than in a footnote.</p>`
        }
      ]
    },
    {
      id: 'regulatory',
      title: 'Regulatory basis',
      items: [
        {
          q: 'Where do the reporting deadlines come from?',
          a: `<p>Each is read from that jurisdiction's own instrument and
              recorded with the date it was checked. Kenya's is KCAA Advisory
              Circular CAA-AC-SMS004A, which sets 24 hours from awareness. The
              European figure is Regulation (EU) No 376/2014, Article 4(6), at
              72 hours from awareness. Every figure and its source is on the
              <a href="/#deadlines">regulatory basis</a> section.</p>`
        },
        {
          q: 'My authority is not listed. What does the product tell me?',
          a: `<p>The ICAO baseline, which is the honest answer rather than a
              placeholder: notify without delay, by the quickest means
              available, and obtain the reporting window from your own
              authority. No countdown is shown, because ICAO Annex 13 names no
              period and Annex 19 leaves it to the State.</p>
              <p>Three jurisdictions were once listed at 72 hours as an
              &ldquo;ICAO-common&rdquo; figure. There is no such figure &mdash;
              72 hours is the EU&rsquo;s own, from Regulation (EU) No 376/2014.
              Those rows were removed rather than relabelled, because a
              deadline no document supports is worse than none: an operator
              without the tool at least knows it does not know.</p>`
        },
        {
          q: 'The clock starts from awareness, not from the occurrence. Why?',
          a: `<p>Because that is what the instruments say, and because the two
              are usually different dates. An event discovered three days later
              has, under an occurrence-anchored clock, already missed a
              deadline nobody knew had started. Anchoring to awareness is both
              correct and the only version that can be acted on.</p>`
        },
        {
          q: 'Are the deadlines stored anywhere?',
          a: `<p>No, they are computed on every read. A stored deadline is a
              deadline that goes stale the moment an instrument changes, and
              the operator finds out from an inspector rather than from the
              screen.</p>`
        }
      ]
    },
    {
      id: 'operating',
      title: 'Running it',
      items: [
        {
          q: 'What happens to a report filed with no signal?',
          a: `<p>It is stored on the device and queued. When the device is back
              in coverage and a session is available, it sends, with retries
              spaced out so a bad link does not become a flat battery. The
              count of what is waiting is on screen at all times.</p>`
        },
        {
          q: 'The same report sent twice — is that possible?',
          a: `<p>No. Each report carries a client-generated identifier and the
              server treats a repeat of the same identifier as the same report.
              A retry after a timeout is safe, which matters because a timeout
              is precisely when a person presses send again.</p>`
        },
        {
          q: 'What does the product do when it cannot send at all?',
          a: `<p>It says so, names the reason, and offers two actions: try
              again, and copy the text out. The second exists because some
              reports genuinely cannot send, and the person standing there
              needs the words out of the device and into a phone call.</p>`
        },
        {
          q: 'Does it work on an old Android phone?',
          a: `<p>That is the design target, not an afterthought. The whole
              first screen is budgeted in kilobytes and the build fails when it
              exceeds the budget, because parse time on a mid-range handset is
              charged on bytes and that handset is the one at the remote
              strip.</p>`
        }
      ]
    }
  ]
};

export const PRIVACY = {
  eyebrow: 'Privacy notice',
  title: 'What this product collects, and what it refuses to',
  lede: `Written to be checked rather than agreed to. Every statement below
         corresponds to a mechanism in the software.`,
  sections: [
    {
      id: 'who',
      title: 'Who this notice is given by',
      body: `
        <p>UsalamaSMS is a product of <strong>JK &amp; Associates</strong> and is
        operated under that corporate banner. Where this notice says what the
        product does with information, JK &amp; Associates is the organisation
        answerable for it.</p>
        <p>An operator using UsalamaSMS remains responsible for the safety
        information of its own people: the reports in a tenant belong to that
        operator, are readable by that operator's safety office, and are not
        aggregated across operators or shared between them.</p>`
    },
    {
      id: 'reports',
      title: 'Safety reports',
      body: `
        <p>A report contains what the person filing it typed: a classification,
        a one-line title, a narrative, an optional suggested action, and
        optional context such as aerodrome and flight phase. If it is filed
        anonymously, no identifier is recorded — there is nothing stored to
        conceal.</p>
        <p>Reports are held on the filing device until a session exists to send
        them, and thereafter on the operator's own tenant. They are readable by
        that operator's safety office. They are not aggregated across
        operators, sold, or used to train anything.</p>`
    },
    {
      id: 'accounts',
      title: 'Accounts',
      body: `
        <p>An account holds an email address, a password hash, an organisation
        and a role. Passwords are hashed with Argon2 and are not recoverable —
        including by us.</p>
        <p>Sign-in issues a short-lived access token held in memory and a
        refresh token stored in this browser. Refresh tokens rotate on every
        use, and presenting one that has already been spent is treated as theft
        and revokes every session for that account. That is a deliberate
        trade: it will occasionally sign somebody out, and the alternative is a
        stolen token that works quietly for thirty days.</p>`
    },
    {
      id: 'thirdparties',
      title: 'Third parties',
      body: `
        <p>This page requests nothing from any other origin. The content
        security policy permits this origin only — scripts, styles, images,
        fonts, connections and workers — so there is no analytics vendor, no
        font CDN, no tag manager and no embedded media. A dependency that began
        contacting a third party would fail rather than succeed silently.</p>`
    },
    {
      id: 'devices',
      title: 'On the device',
      body: `
        <p>The app stores queued reports, a draft of an in-progress report, and
        session metadata in this browser's own storage. An anonymous draft is
        never left behind: it is cleared as soon as the report is filed or
        abandoned, because a shared crew-room handset makes a forgotten draft
        readable by whoever picks it up next.</p>
        <p>Signing out clears the session and instructs the service worker to
        drop cached responses. Reports already queued on the device stay — they
        belong to the operator, and deleting somebody's unsent safety report
        because they logged off would be the worst possible reading of
        privacy.</p>`
    }
  ]
};

export const TERMS = {
  eyebrow: 'Terms of use',
  title: 'Terms of use',
  lede: `The short version: this is a tool for recording and managing safety
         information. The judgement stays with the operator.`,
  sections: [
    {
      id: 'parties',
      title: 'Who these terms are with',
      body: `
        <p>UsalamaSMS is a product of <strong>JK &amp; Associates</strong> and is
        supplied under that corporate banner. These terms describe how the
        product may be used; where an operator holds a written agreement with
        JK &amp; Associates, that agreement governs and these terms do not
        displace it.</p>`
    },
    {
      id: 'purpose',
      title: 'What the product does and does not decide',
      body: `
        <p>UsalamaSMS records safety reports, computes reporting windows from
        published instruments, and classifies risk against ICAO Doc 9859. It
        does not determine whether an occurrence is reportable, whether a
        hazard is acceptable, or whether an operator is compliant. Those are
        the accountable manager's decisions and the authority's to review.</p>
        <p>Regulatory figures are recorded with the date they were checked
        against their primary instrument. The product maintains the reporting
        standard of one State of Registry &mdash; Kenya &mdash; and offers the
        ICAO baseline for every other: notification without delay, with no
        period stated, because ICAO states none. An operator relying on any
        figure here remains responsible for its own regulatory position.</p>`
    },
    {
      id: 'availability',
      title: 'Availability',
      body: `
        <p>Filing works without a connection by design; sending does not. No
        uptime commitment is made on this page, and one printed here without a
        contract behind it would be decoration. Where an operator needs a
        stated availability, it belongs in that operator's agreement.</p>`
    },
    {
      id: 'acceptable',
      title: 'Use of the service',
      body: `
        <p>Accounts are issued to an organisation and are not to be shared
        outside it. Attempting to reach another operator's records, to
        circumvent tenancy scoping, or to interfere with the audit chain is
        a misuse of the service and will end access to it.</p>
        <p>Anonymous reporting exists to protect a reporter, not to enable
        abuse. Reports remain subject to the operator's own just-culture policy
        and to applicable law.</p>`
    },
    {
      id: 'records',
      title: 'Records and export',
      body: `
        <p>An operator's safety records belong to that operator. The record is
        append-only and hash-chained: entries are added, never rewritten, and
        the chain can be verified independently of any assurance given here.
        Export exists so that an operator can hold its own copy, which is the
        only form of data ownership that survives a vendor.</p>`
    }
  ]
};

export const PAGES = {
  '/about': ABOUT,
  '/tutorials': TUTORIALS,
  '/faq': FAQ,
  '/privacy': PRIVACY,
  '/terms': TERMS
};
