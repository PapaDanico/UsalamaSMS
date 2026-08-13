/* =====================================================================
   THE VOLUNTARY REPORTING SYSTEM, and the six things Kenyan law
   requires one to define.

   THE GAP THIS CLOSES. The product has shipped a "Confidential report
   — voluntary and confidential" type since the reporting form was
   built. That is a label in a list. Regulation 13 of the Civil
   Aviation (Safety Management) Regulations, 2025 (L.N. 32 of 2026)
   does not describe a label; it describes a SYSTEM, and it says what
   that system must be and must define. The product asserted the
   category and stated none of the substance.

   WHAT THE REGULATION ACTUALLY SAYS, transcribed rather than
   paraphrased, because the paraphrase is where this kind of claim goes
   soft:

     13(2)  a voluntary reporting system "shall be non-punitive and
            shall afford protection to the sources".

     13(3)  the system shall define (a) its objective, (b) the scope of
            the sectors or areas it covers, (c) who can report, (d)
            when to report, (e) how reports are processed, and (f) the
            manager to be contacted.

   WHOSE STATEMENT THIS IS, and it is the distinction that decides the
   whole design. Regulation 13(3) binds the SERVICE PROVIDER's system,
   not this product. An operator's objective, scope and contacting
   manager are that operator's to state — a tool that filled them in
   would be inventing an answer and handing it to a regulator with the
   operator's name on it.

   So this module declares the SHAPE — what must be defined, in the
   regulation's own words, with the sub-paragraph each requirement
   comes from — and the product renders it as a checklist an operator
   answers. Same posture as the deadline registry: the instrument is
   quoted, the figure is computed, and nothing is invented.

   WHAT IS NOT HERE YET. Somewhere to record the operator's six
   answers. That needs a table and a migration, and it is the next
   slice rather than this one; /coverage says so rather than letting a
   rendered checklist imply that answering it is stored.
   ===================================================================== */

/** The instrument, cited once so every surface quotes the same thing. */
export const VOLUNTARY_INSTRUMENT =
  "Civil Aviation (Safety Management) Regulations, 2025 (L.N. 32 of 2026, " +
  "Kenya Gazette Supplement No. 43, 3 March 2026), regulation 13";

/**
 * Regulation 13(2). Stated as a property of the system rather than as
 * a reassurance in the interface: "we treat reports confidentially" is
 * a promise a product makes, and this is a requirement the operator's
 * system must meet.
 */
export const VOLUNTARY_PROTECTION = Object.freeze({
  cite: "regulation 13(2)",
  text:
    "A voluntary reporting system shall be non-punitive and shall afford protection " +
    "to the sources.",
});

export interface VoluntaryRequirement {
  /** The sub-paragraph, so an operator can find it in the gazette. */
  readonly cite: string;
  /** What must be defined, in the regulation's terms. */
  readonly requirement: string;
  /** The question an operator actually answers, in their own words. */
  readonly question: string;
  /** Why a thin answer fails, where that is not obvious. */
  readonly note?: string;
}

/**
 * The six of regulation 13(3), in the order the regulation lists them.
 *
 * Order is not cosmetic: it is the order a reader checks against the
 * gazette, and reordering them to suit a form layout would make that
 * check harder for the person who most needs to do it.
 */
export const VOLUNTARY_REQUIREMENTS: ReadonlyArray<VoluntaryRequirement> = Object.freeze([
  {
    cite: "13(3)(a)",
    requirement: "The objective of the voluntary reporting system.",
    question: "What is this system for, in one sentence an employee would recognise?",
    note:
      "An objective that reads as compliance rather than as safety tells a reporter " +
      "what the system is really for, and they answer accordingly.",
  },
  {
    cite: "13(3)(b)",
    requirement: "The scope of the sectors or areas the system covers.",
    question: "Which operations, departments and locations does it cover?",
    note:
      "Silence here is read as exclusion by whoever is not obviously included — " +
      "ground handling and contracted maintenance most often.",
  },
  {
    cite: "13(3)(c)",
    requirement: "Who can report.",
    question: "Who may file, including contractors and people outside the organisation?",
  },
  {
    cite: "13(3)(d)",
    requirement: "When to report.",
    question: "What prompts a voluntary report, and by when?",
    note:
      "Distinct from the mandatory windows: those are set by regulation 12 and " +
      "computed by this product. This one the operator sets.",
  },
  {
    cite: "13(3)(e)",
    requirement: "How reports are processed.",
    question: "What happens to a report, who sees it, and what does the reporter get back?",
    note:
      "The half operators most often leave out, and the half a reporter judges the " +
      "system by. A report that disappears teaches everyone watching not to file.",
  },
  {
    cite: "13(3)(f)",
    requirement: "The manager to be contacted.",
    question: "Which post — not which person — is contacted, and how?",
    note:
      "A post rather than a name, so the system survives the individual leaving. " +
      "The same reasoning the accountability matrix uses.",
  },
]);

/** How many the regulation requires. Computed, never typed. */
export const VOLUNTARY_REQUIREMENT_COUNT = VOLUNTARY_REQUIREMENTS.length;

/**
 * Which of the six an operator has answered, given their answers.
 *
 * Returns the UNANSWERED ones rather than a score. A count out of six
 * invites an operator to feel four-sixths compliant, and regulation
 * 13(3) is not scored — a system that does not define who may report
 * has not partly defined it.
 */
export function unanswered(
  answers: Readonly<Record<string, string | undefined>>,
): ReadonlyArray<VoluntaryRequirement> {
  return VOLUNTARY_REQUIREMENTS.filter((r) => !(answers[r.cite] ?? "").trim());
}
