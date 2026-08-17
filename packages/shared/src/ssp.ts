/* =====================================================================
   HOW ONE OPERATOR'S INDICATORS ROLL UP TO KENYA'S NATIONAL PLAN.

   ---------------------------------------------------------------
   WHY THIS EXISTS, AND WHY IT IS NOT A SCORE.

   Annex 19 Amendment 2 makes the link between an operator's SMS and the
   State Safety Programme the substance of performance-based oversight
   rather than a courtesy: an ALoSP stated as words becomes an ALoSP
   demonstrated by indicators, and the State's own plan is what those
   indicators are read against. Kenya's National Aviation Safety Plan
   names six High-Risk Categories and lists what it counts under each.

   So the question an operator can now be asked — and could not answer
   from this product an hour ago — is: OF THE SIX THINGS YOUR STATE IS
   COUNTING, WHICH CAN YOU SEE?

   ---------------------------------------------------------------
   THREE STANDINGS, AND THE THIRD IS THE ONE THAT MATTERS.

     MEASURED — an indicator is filed against this category and has
                periods behind it. The operator can put a number beside
                the national one.

     REPORTED — nothing is being measured, but reports have been tagged
                with this category. The operator is SEEING events here
                and has not turned them into an indicator. This is the
                actionable middle: the data already exists.

     UNSEEN   — no indicator, no tagged report.

   `UNSEEN` DOES NOT MEAN SAFE, AND THIS MODULE REFUSES TO LET A SCREEN
   IMPLY IT DOES. Zero tagged CFIT reports is not evidence of no CFIT
   risk; it is evidence that nothing has been tagged CFIT. That
   distinction is the whole of `/picture`'s design rule — an absence is
   stated, never rendered as a zero — and it is more dangerous here,
   because this page is the one an operator shows to a regulator.
   `UNSEEN` therefore carries `meaning`, and every consumer prints it.

   ---------------------------------------------------------------
   NO PERCENTAGE, NO GRADE, NO "4 OF 6".

   The temptation is a completeness score, and it would be wrong in a
   way that costs an operator money. Not every HRC applies to every
   operator: a Wilson-based charter with no night operations and no
   turboprop over 5,700 kg has a genuine, defensible reason to measure
   four of the six, and a product that renders that as "67%" has told
   their regulator they are a third non-compliant. `amendment2.ts`
   refuses a percentage for the same reason and says so.

   What comes back is the LIST, per category, with what is behind it.
   The operator writes the sentence; this supplies the facts.
   ===================================================================== */

/** The three standings, ordered by how much an operator can show. */
export type SspStanding = "MEASURED" | "REPORTED" | "UNSEEN";

export interface SspRow {
  /** The plan's own code — BWI rather than CICTT's BIRD. See taxonomy.ts. */
  readonly code: string;
  readonly label: string;
  readonly standing: SspStanding;
  /** Indicators the operator has filed against this category. */
  readonly indicators: readonly { readonly name: string; readonly periods: number }[];
  /** Reports tagged with it, whether or not anything measures it. */
  readonly reports: number;
  /**
   * What this row does NOT say, in words, for the standings where the
   * silence is dangerous. Held here rather than in a screen so two
   * surfaces cannot render the same standing with different caveats.
   */
  readonly meaning: string | null;
  /**
   * The national indicators the plan lists under this category that the
   * operator could populate from their own record. Named so a gap comes
   * with a next step rather than only a colour.
   */
  readonly available: readonly string[];
}

export interface SspRollup {
  readonly rows: readonly SspRow[];
  /**
   * Indicators the operator keeps that bear on no national category.
   * COUNTED, NOT HIDDEN: an operator measuring six things of their own
   * choosing is doing SMS correctly, and a rollup that silently ignored
   * them would read as "you measure nothing".
   */
  readonly ownIndicators: number;
}

interface IndicatorLike {
  readonly name?: string;
  readonly hrc?: string | null;
  readonly periods?: readonly unknown[];
}

interface CategoryLike {
  readonly code: string;
  readonly label: string;
  readonly nasp?: boolean;
}

interface NationalIndicatorLike {
  readonly measure: string;
  readonly hrc?: string;
  readonly reachable: boolean;
}

const UNSEEN_MEANING =
  "Nothing is tagged against this category. That is a statement about your " +
  "records, not about your operation — it does not mean the risk is absent.";

const REPORTED_MEANING =
  "Your people are reporting events here and no indicator counts them yet. " +
  "The data already exists.";

/**
 * Roll an operator's indicators and tagged reports up to the national
 * categories.
 *
 * PURE, AND IT INVENTS NOTHING. Every count comes from something the
 * operator recorded. Where there is nothing, the row says so in words
 * rather than showing a zero that reads like a measurement.
 *
 * The categories and the national indicator list are PASSED IN rather
 * than imported, so this module cannot drift into holding a second copy
 * of a vocabulary that is declared once in taxonomy.ts and nasp.ts —
 * the mistake that put `LOC_I` and the plan's `LOC-I` in disagreement.
 */
export function rollUp(
  categories: readonly CategoryLike[],
  nationalIndicators: readonly NationalIndicatorLike[],
  indicators: readonly IndicatorLike[],
  reportsByHrc: Readonly<Record<string, number>>,
): SspRollup {
  const national = categories.filter((c) => c.nasp);

  const rows = national.map((c) => {
    const mine = indicators
      .filter((i) => i.hrc === c.code)
      .map((i) =>
        Object.freeze({ name: i.name ?? "Untitled", periods: i.periods?.length ?? 0 }),
      );
    const reports = reportsByHrc[c.code] ?? 0;

    /* AN INDICATOR WITH NO PERIODS IS NOT A MEASUREMENT, and treating
       it as one is how a screen tells an operator they can show
       something they cannot. Filing an indicator is a declaration of
       intent; the series is the evidence. */
    const measuring = mine.some((i) => i.periods > 0);

    const standing: SspStanding = measuring
      ? "MEASURED"
      : reports > 0 || mine.length > 0
        ? "REPORTED"
        : "UNSEEN";

    return Object.freeze({
      code: c.code,
      label: c.label,
      standing,
      indicators: Object.freeze(mine),
      reports,
      meaning:
        standing === "UNSEEN"
          ? UNSEEN_MEANING
          : standing === "REPORTED"
            ? REPORTED_MEANING
            : null,
      available: Object.freeze(
        nationalIndicators
          .filter((n) => n.hrc === c.code && n.reachable)
          .map((n) => n.measure),
      ),
    });
  });

  const nationalCodes = new Set(national.map((c) => c.code));
  const ownIndicators = indicators.filter(
    (i) => !i.hrc || !nationalCodes.has(i.hrc),
  ).length;

  return Object.freeze({ rows: Object.freeze(rows), ownIndicators });
}

/**
 * The one sentence a screen puts above the table.
 *
 * Held beside the rollup rather than typed into a template, for the
 * reason `NASP_CAVEAT` is held beside the indicator list: an operator
 * has to know this is a comparison and not a compliance score, or the
 * product has quietly invented a rule the State did not make.
 */
export const SSP_CAVEAT =
  "Kenya's National Aviation Safety Plan names six high-risk categories and says what " +
  "it counts under each. This shows which of them your own records can currently speak " +
  "to. It is not a score and not a requirement — several may not apply to your " +
  "operation, and deciding that is your call to make and to justify.";
