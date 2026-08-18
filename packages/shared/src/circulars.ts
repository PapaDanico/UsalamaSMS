/* =====================================================================
   THE AUTHORITY'S OWN GUIDANCE, indexed against the twelve elements.

   -------------------------------------------------------------
   WHY THIS IS NOT templates.ts.

   That registry lists artefacts an operator can COPY — CASA's gap
   analysis tool, the SM ICG evaluation form — and it opens by saying,
   correctly and at length, that they are not Kenyan law. It had to say
   that because the shelf was Australian: the structure was worth
   borrowing and the authority behind it was the wrong one.

   These are a different kind of document. An Advisory Circular is not
   a template to copy; it is what the operator is MEASURED AGAINST, by
   the authority that issues its certificate. Filing the two in one list
   would flatten that distinction, and the distinction is the whole
   reason this list is more useful than that one.

   -------------------------------------------------------------
   NINE OF THEM, AND THEY WERE READ.

   `CICTT_VERIFIED_AGAINST_PRIMARY` is false in cictt.ts because
   WebSearch returns a search index's rendering of a document rather
   than the document, and the egress policy blocks every primary
   regulatory host. That reasoning stands and that flag stays false.

   It does not apply here. These nine were supplied as files and read,
   the same footing nasp.ts records — and reading them has already
   changed two answers rather than confirming them:

     · CAA-AC-SMS004A §3.3.6.1 Note 1 states what starts the reporting
       clock. regulations.ts had carried `clockStartUnstated: true` and
       three screens told the operator that awareness was OUR reading
       of an instrument that would not say. It is the Authority's
       reading, published, and the row now cites it.

     · CAA-AC-SMS001A §7.4 sets out the four-phase implementation model
       this product's onboarding is now built on, rather than a sequence
       invented here.

   -------------------------------------------------------------
   NO URL PER DOCUMENT, AND THAT IS DELIBERATE.

   templates.ts links every entry, and the note above it explains why we
   link rather than host: a copy taken today goes stale here and the
   operator will not know which. The same argument applies — but the
   link itself has to be one somebody verified, and this environment
   cannot reach kcaa.or.ke to check one. WebFetch is refused at the
   egress proxy for every primary regulatory host, which is recorded in
   CLAUDE.md.

   So each entry carries the exact reference and issue date printed on
   the document's own cover, which is what an operator searches with and
   what an inspector recognises. A plausible-looking URL nobody opened
   would be a fabricated citation in a file whose entire purpose is
   citation — the same class of act as publishing a deadline no
   instrument supports.

   The two service addresses below ARE quoted, from the circulars that
   print them, and are marked as such.
   ===================================================================== */

/**
 * Where an operator actually files, quoted from the circulars that
 * print these addresses rather than found by searching.
 */
/* ---------------------------------------------------------------
   WHAT eSERVICES ACTUALLY CARRIES, and the thing it does not.

   An open task asked whether this product's SPI export matched
   "KCAA's eServices submission shape". It does not need to, because
   THERE IS NO INDICATOR SERVICE ON eSERVICES. The portal's own quick
   links enumerate six:

     AAITS  Advanced Air Transport Information System
     AIMe   aeronautical information management
     AIP    Aeronautical Information Publication
     MOR    Mandatory Occurrence Reporting        <- cited below
     ROMS   RPAS/UAS Operations Management System
     VOR    Voluntary Reporting                   <- cited below

   Two of the six are the two this file already names, and they are
   both about individual OCCURRENCES. Safety performance indicators
   are submitted on Appendix II of CAA-AC-SMS009 — see spi.ts, which
   quotes that circular for §8.4 and §8.5 already.

   A NEGATIVE FINDING IS WORTH RECORDING PRECISELY BECAUSE NOTHING
   ELSE WILL. "We checked and the destination is not there" leaves no
   artefact unless somebody writes it down, and the next person to ask
   the question pays the same cost. The enumeration is what makes it
   checkable rather than an assertion that nothing was found.

   PROVENANCE: the search index's rendering of the portal's quick-links
   page, 18 August 2026, not the portal itself — it is behind a login
   and this environment's egress proxy refuses the host. So this is
   corroboration of the same standard as the CICTT list, and it is
   enough to rule a destination OUT while not enough to describe a form.
   --------------------------------------------------------------- */

/** The six services the portal's quick links enumerate. None is an indicator submission. */
export const ESERVICES_SERVICES: readonly string[] = Object.freeze([
  "AAITS — Advanced Air Transport Information System",
  "AIMe — aeronautical information management",
  "AIP — Aeronautical Information Publication",
  "MOR — Mandatory Occurrence Reporting",
  "ROMS — RPAS/UAS Operations Management System",
  "VOR — Voluntary Reporting",
]);

/**
 * FALSE, and it is the answer to a question that was open for days.
 * Indicators do not go through this portal.
 */
export const ESERVICES_CARRIES_INDICATORS = false;

export const KCAA_SERVICES = Object.freeze({
  /** CAA-AC-SMS004A §3.3.1.1 — the mandatory occurrence reporting system. */
  mandatoryOccurrence: "https://eservices.kcaa.or.ke",
  /** CAA-AC-SMS003A §5.1.1 — the voluntary and confidential reporting form. */
  voluntaryReport: "https://eservices.kcaa.or.ke/Pages/VORSY/VORSY_AppForm.aspx",
});

/**
 * The Authority's safety hazards mailbox.
 *
 * NOT IN KCAA_SERVICES, AND A TEST IS WHY. That map holds eServices
 * URLs and tests/circulars.test.ts asserts exactly that; the first
 * draft of this change put the mailbox inside it and the test caught
 * the category error within a minute of it existing. An email address
 * is a different kind of destination from a portal — no session, no
 * form, no receipt — and a screen that treats the two as one list
 * will eventually render a mailto: where a filing UI was promised.
 *
 * SUPPLIED BY THE OPERATOR OF THIS PRODUCT on 18 August 2026, NOT read
 * from a circular. Charter rule 12 in its smaller form: an address a
 * product routes a safety report toward is a fact with consequences,
 * and "somebody told us" is a different standing from "the instrument
 * prints it". The provenance below says which one this is.
 */
export const KCAA_SAFETY_MAILBOX = "safety@kcaa.or.ke";

/** What this product has read from an instrument, and what it has not. */
export const SERVICE_PROVENANCE = Object.freeze({
  mandatoryOccurrence: "CAA-AC-SMS004A §3.3.1.1",
  voluntaryReport: "CAA-AC-SMS003A §5.1.1",
  safetyMailbox:
    "supplied by the operator, 18 August 2026 — not printed in a circular this product has read",
});

/* ---------------------------------------------------------------
   WHAT VORSY IS CALLED, AND THE SENTENCE WORTH KNOWING.

   The repository held the URL and nothing else. The system's name is
   the VOLUNTARY REPORTING SYSTEM (VRS) — VORSY is only the path
   segment — and the Authority describes it as "a voluntary,
   non-punitive and confidential reporting system", aligned to ICAO
   Annexes 17 AND 19 rather than 19 alone. The security annex is there
   because the same channel takes security deficiencies.

   THE PART THAT MATTERS TO THIS PRODUCT: the Authority states that
   VRS administrators DE-IDENTIFY information before entering it into
   the VRS database. This product de-identifies before a narrative
   leaves the operator, and until now that was argued purely from L.N.
   32's safeguard and from first principles. The receiving system does
   the same thing at its end, which is the strongest kind of support a
   design decision can get — the other side of the handover already
   works that way.

   PROVENANCE: a search index's rendering of the VRS page, 18 August
   2026. The portal itself is behind a login and refused at this
   environment's egress proxy. So this is corroboration, not a reading
   — enough to name the system correctly and to record the alignment,
   not enough to describe the form's fields.
   --------------------------------------------------------------- */
export const VRS_NAME = "Voluntary Reporting System (VRS)";
export const VRS_CHARACTER =
  "A voluntary, non-punitive and confidential reporting system, aligned to ICAO Annexes 17 and 19, " +
  "whose administrators de-identify information before it enters the VRS database.";
export const VRS_VERIFIED_AGAINST_PRIMARY = false;

export interface AdvisoryCircular {
  /** The reference an inspector recognises, exactly as printed. */
  readonly reference: string;
  /** The title on the cover. */
  readonly title: string;
  /** Issue date, ISO. The precision claimed matches the precision printed. */
  readonly issued: string;
  /**
   * WHERE THE DOCUMENT CONTRADICTS ITSELF ABOUT ITS OWN DATE.
   *
   * Present only where it does. CAA-AC-SMS011's cover block says April
   * 2025 and its running header says March 2025 — a real discrepancy in
   * a published instrument, and the kind of thing a citation file must
   * not resolve by quietly choosing.
   *
   * The cover wins in `issued`, because a cover is the document's
   * statement of itself. The disagreement is recorded because an
   * operator searching the Authority's index may meet either month and
   * needs to know both name one document.
   */
  readonly issuedDateDisputed?: string;
  /** Annex 19 element ids it bears on. `ALL` where it spans the framework. */
  readonly elements: ReadonlyArray<string> | "ALL";
  /** What the circular is for, in one sentence, from the document. */
  readonly purpose: string;
  /**
   * WHAT THIS PRODUCT DOES ABOUT IT — never a claim to satisfy it.
   * A circular is guidance to an operator; software can hold a record
   * against it and compute what follows, and that is what this says.
   */
  readonly weHold: string;
  /**
   * THE PART THAT IS STILL THE OPERATOR'S. Never blank, for the reason
   * templates.ts gives about its own equivalent field: an entry listed
   * with nothing outstanding is a claim, and this registry makes none.
   */
  readonly youStillNeed: string;
  /** A circular this product has read and acted on, with what changed. */
  readonly changedOurAnswer?: string;
}

/**
 * IN THE AUTHORITY'S OWN NUMBERING ORDER, not ours and not by
 * importance. An operator holding a KCAA index reads down it; a list
 * reordered by what we think matters is a list they cannot follow.
 */
export const CIRCULARS: ReadonlyArray<AdvisoryCircular> = Object.freeze([
  {
    reference: "CAA-AC-SMS001A",
    title: "SMS Implementation Planning",
    issued: "2022-06-01",
    elements: "ALL",
    purpose:
      "How to develop an SMS implementation plan: the system description, the interfaces " +
      "it crosses, scalability to the size of the operation, and a four-phase approach to " +
      "getting there.",
    weHold:
      "The maturity assessment is the gap analysis §7.5.2 puts at the centre of Phase 1, " +
      "and it generates the implementation plan that paragraph names as the phase's " +
      "significant output — from the operator's own answers rather than a template.",
    youStillNeed:
      "The system description and the interface analysis. §4.1.4 is explicit that there " +
      "is no one-size-fits-all method and each organisation defines its own approach; " +
      "that is a document you write, not one a tool derives.",
    changedOurAnswer:
      "The onboarding protocol follows §7.4's four phases instead of a sequence invented " +
      "here, and §6.3's five-year horizon replaced an unstated assumption that " +
      "implementation is quick.",
  },
  {
    reference: "CAA-AC-SMS002A",
    title: "Guidance on Development of an SMS Manual",
    issued: "2022-06-01",
    elements: ["1.5"],
    purpose: "What an SMS manual has to contain and how it is structured and controlled.",
    weHold:
      "Document control — reference, version, approver, review date, and who has " +
      "acknowledged which revision. That is the discipline an audit checks.",
    youStillNeed:
      "The manual itself. Element 1.5 is graded PARTIAL for exactly this reason and the " +
      "coverage page says so: this product is not a document store and does not author " +
      "your words.",
  },
  {
    reference: "CAA-AC-SMS003A",
    title: "Voluntary and Confidential Reporting System",
    issued: "2026-04-01",
    elements: ["2.1"],
    purpose:
      "The Authority's own voluntary and confidential system — what it covers, who may " +
      "report, how a report is handled, and the principles a service provider's internal " +
      "system should rest on.",
    weHold:
      "The six definitions regulation 13(3) requires of an operator's own voluntary " +
      "system, and a report that stores no identifier at all when filed anonymously.",
    youStillNeed:
      "The non-punitive undertaking behind it. §6.1 puts trust first and says a positive " +
      "safety culture is the foundation of a successful reporting system — which is an " +
      "organisation's property, not a feature.",
    changedOurAnswer:
      "§4.1.5 states that confidential does not always mean anonymous: the Authority may " +
      "know a reporter's identity and withhold it from everyone else. Those are two " +
      "different protections and a product offering one must not imply the other.",
  },
  {
    reference: "CAA-AC-SMS004A",
    title: "Mandatory Occurrence Reporting",
    issued: "2023-01-01",
    elements: ["2.1", "3.1"],
    purpose:
      "What must be reported to the Authority, by whom, through which system, and inside " +
      "what period.",
    weHold:
      "The deadline computed per class on every read, and the separate immediate " +
      "notification to the AAID that §3.3.1.2 requires for accidents and serious " +
      "incidents — a duty distinct from the report window.",
    youStillNeed:
      "The classification judgement. Whether an occurrence is reportable is the " +
      "accountable manager's call and the Authority's to review; this computes the " +
      "window once that call is made.",
    changedOurAnswer:
      "§3.3.6.1 Note 1 states what starts the clock. The product had flagged awareness as " +
      "its own reading of a regulation that would not say; the row now cites the " +
      "circular instead of confessing an inference.",
  },
  {
    reference: "CAA-AC-SMS006A",
    title: "Emergency Response Planning",
    issued: "2026-04-01",
    elements: ["1.4"],
    purpose: "What an emergency response plan must cover and how it is exercised.",
    weHold:
      "The plan itself, its exercises with dates, and the contact directory with a " +
      "verification date against each entry — because a number nobody has rung this year " +
      "is not a contact.",
    youStillNeed:
      "The exercise. A plan that has never been run is a document, and no record of one " +
      "makes it otherwise.",
  },
  {
    reference: "CAA-AC-SMS007A",
    title: "Guidance on Safety Risk Management Processes",
    issued: "2020-07-01",
    elements: ["2.1", "2.2"],
    purpose:
      "Hazard identification, the hazard log, and the assessment of probability, severity " +
      "and tolerability that follows it.",
    weHold:
      "The five-point probability table and five-level severity table this circular " +
      "prints, on the register and the risk assessment, with the tolerability decision " +
      "recorded against the post the operator says may take it.",
    youStillNeed:
      "A matrix sized to your operation, if the standard one does not fit. §4.3.4 and " +
      "§4.4.2 both say the printed tables are an example only and should be adapted to " +
      "the complexity of the organisation — up to fifteen values. This product " +
      "implements the example, which is the right default and is not the only lawful " +
      "answer.",
  },
  {
    reference: "CAA-AC-SMS009",
    title: "Safety Performance Management",
    issued: "2023-01-01",
    elements: ["3.1"],
    purpose:
      "Safety performance indicators, targets and alert levels, and the acceptable level " +
      "of safety performance agreed with the Authority.",
    weHold:
      "Indicators with periods, targets and alert levels, and Kenya's National Aviation " +
      "Safety Plan measures offered as starting points so an operator's number and the " +
      "State's can be read in the same row.",
    youStillNeed:
      "The agreement itself. CAA-AC-SMS001A §7.7.1.3.4 requires reaching agreement with " +
      "the oversight authority on indicators and targets — a conversation between the " +
      "operator and KCAA that no tool conducts.",
  },
  {
    reference: "CAA-AC-SMS010",
    title: "Management of Change",
    issued: "2024-04-01",
    elements: ["3.2"],
    purpose:
      "How a service provider assesses the safety impact of change before the change " +
      "happens.",
    weHold:
      "The change assessment as its own record, with approval held against a named post " +
      "and the assessment dated before the change rather than after it.",
    youStillNeed:
      "Telling the system a change is coming. A management-of-change process entered " +
      "afterwards is a description of what happened, not a control.",
  },
  {
    reference: "CAA-AC-SMS011",
    title: "Safety Management Systems (SMS) Training",
    /* THE DOCUMENT DISAGREES WITH ITSELF. The cover block reads
       "CAA-AC-SMS011  April, 2025"; the running header on every page
       reads "March, 2025". The cover is the authoritative statement of
       issue and is what is recorded — but the discrepancy is written
       down rather than resolved silently, because an operator searching
       KCAA's index may find either month and needs to know the two
       refer to one document. */
    issued: "2025-04-01",
    issuedDateDisputed: "Cover states April 2025; the running header states March 2025.",
    elements: ["4.1"],
    purpose:
      "The SMS training an organisation's people need, by role, and how it is recorded.",
    weHold:
      "The training matrix — who was trained, in what, when, and when it lapses, with a " +
      "frontline reporter seeing their own row and nobody else's.",
    youStillNeed:
      "The training. Element 4.1 is graded PARTIAL because a record of currency is not " +
      "delivery of a course, and the coverage page says so rather than averaging it away.",
  },
]);

/** The ones that changed an answer here, rather than confirming one. */
export const CIRCULARS_THAT_CHANGED_AN_ANSWER = CIRCULARS.filter((c) => c.changedOurAnswer);

/**
 * Read from the documents, not from a search index — the distinction
 * nasp.ts draws and cictt.ts refuses to claim.
 */
export const CIRCULARS_VERIFIED_AGAINST_PRIMARY = true;

/**
 * The sentence a screen shows above this list.
 *
 * It has to do one thing the templates page does not: say that these
 * ARE the operator's own regulator, so nobody reads them as more
 * borrowed structure from somewhere else.
 */
export const CIRCULARS_CAVEAT =
  "These are the Kenya Civil Aviation Authority's own Advisory Circulars — the guidance " +
  "an operator certified in Kenya is measured against, rather than another State's " +
  "templates. Each was read to build what this product does about it. Where a circular " +
  "and this product differ, the circular governs.";
