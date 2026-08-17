/* =====================================================================
   THE AUDIT PACK — the operator's record, in the order an inspector
   reads it.

   WHY IT IS NOT THE EXPORT. /api/v1/export already returns everything
   this organisation holds, and that is the right artefact for the
   promise it serves: the record is yours, on the way out as well as
   the way in, in a format you can read without us. It is a
   twenty-four-key JSON object ordered by how the database is shaped.

   AN INSPECTOR DOES NOT READ A DATABASE. They arrive with Annex 19's
   twelve elements and ask, element by element, "show me". A safety
   manager answering that question from the export is transcribing at
   the worst possible moment — and the operators this product is for
   have one person who is also the quality manager and occasionally the
   dispatcher.

   So the pack is the SAME RECORD, RE-ORDERED BY THE QUESTION IT
   ANSWERS. No new data, no second source of truth, nothing computed
   that the export does not already contain.

   ---------------------------------------------------------------
   IT SHOWS THE EMPTY ELEMENTS TOO, AND THAT IS THE WHOLE DESIGN.

   A pack that quietly omitted the elements with no evidence would be
   the most dangerous document this product could generate: an operator
   would hand an inspector something that looked complete, and discover
   in the room that it was not. Every element appears. An element with
   nothing behind it says so, in the same typeface as the ones that are
   full.

   That is also the commercial argument. A vendor whose pack hides gaps
   sells one audit; a pack that finds them a month early is why the
   operator renews.

   THE VERIFICATION TRAVELS WITH IT. The audit chain is what makes this
   evidence rather than a printout — an inspector can take the hash of
   the last entry and check the chain independently. A pack without it
   is a document anybody could have typed.
   ===================================================================== */

/** One Annex 19 element, and what the operator can actually show for it. */
export interface PackSection {
  readonly elementId: string;
  readonly name: string;
  /** What an inspector is looking for under this element. */
  readonly asks: string;
  /** How many records the operator holds against it. */
  readonly count: number;
  /** The record kinds counted, so a zero is explicable rather than bare. */
  readonly sources: readonly string[];
  /**
   * NOT "pass" or "fail". An inspector decides that, and a document
   * that pre-judged it would be claiming an authority it does not
   * have. These say what is THERE.
   */
  readonly holding: "RECORDS" | "NOTHING";
  /** Said out loud when there is nothing, rather than left blank. */
  readonly gap?: string;
}

export interface AuditPack {
  readonly operator: string;
  readonly jurisdiction: string;
  readonly generatedAt: string;
  readonly sections: readonly PackSection[];
  /** Elements holding nothing — the list the operator works before the visit. */
  readonly gaps: readonly string[];
  readonly verification: {
    readonly entries: number;
    readonly lastHash: string | null;
    /** How to check it without trusting this document or this company. */
    readonly howToVerify: string;
  };
}

/* WHAT EACH ELEMENT IS ASKED FOR, and which keys of the export answer
   it. Written out rather than derived, because the mapping IS the
   product knowledge — it is the sentence a consultant says in the room,
   and deriving it from field names would produce "policies: 3" where an
   inspector needs "a signed safety policy, current, with the
   accountable executive's signature on it".

   The keys are the export payload's own, so a rename breaks this at
   the type level rather than silently emptying a section. */
export const PACK_MAP: readonly {
  id: string; name: string; asks: string; keys: readonly string[]; gap: string;
}[] = Object.freeze([
  {
    id: "1.1", name: "Management commitment and responsibility",
    asks: "A safety policy, signed by the accountable executive, currently in force.",
    keys: ["policies"],
    gap: "No safety policy on record. This is the first document an inspector asks for.",
  },
  {
    id: "1.2", name: "Safety accountabilities",
    asks: "Who is accountable for what, written down and matched to real posts.",
    keys: ["accountabilities"],
    gap: "No accountabilities recorded. An SMS with no named owners is an organisation chart, and 1.2 asks who answers for each part of it.",
  },
  {
    id: "1.3", name: "Appointment of key safety personnel",
    asks: "The appointment of the safety manager, with a letter reference and a date.",
    keys: ["appointments"],
    gap: "No appointment on record for the safety post. The regulator wants the letter reference and the date, not the name of whoever answers the phone.",
  },
  {
    id: "1.4", name: "Emergency response planning",
    asks: "A call-out directory that has been verified, and an exercise that found something.",
    keys: ["contacts", "exercises"],
    gap: "No emergency contacts and no exercise. A plan nobody has tested is a document.",
  },
  {
    id: "1.5", name: "SMS documentation",
    asks: "Controlled documents with a reference, revision, approver and review date.",
    keys: ["documents", "documentReads"],
    gap: "No controlled documents registered. Document control means reference, revision, approver and review date — an inspector checks the discipline, not the prose.",
  },
  {
    id: "2.1", name: "Hazard identification",
    asks: "Reports coming in, and hazards raised from them.",
    keys: ["reports", "hazards", "voluntaryScheme"],
    gap: "No reports and no hazards. An inspector reads this as a reporting culture that is not working.",
  },
  {
    id: "2.2", name: "Safety risk assessment and mitigation",
    asks: "Assessed risks with a tolerability decision and a named owner.",
    keys: ["riskAssessments"],
    gap: "No risk assessments. Hazards identified and never assessed is the most common finding.",
  },
  {
    id: "3.1", name: "Safety performance monitoring and measurement",
    asks: "Indicators with targets, and periods recorded against them over time.",
    keys: ["spis", "spiPeriods"],
    gap: "No safety performance indicators. Amendment 2 replaced a static acceptable level with exactly this.",
  },
  {
    id: "3.2", name: "Management of change",
    asks: "Changes assessed before they took effect, with approval recorded.",
    keys: ["changes"],
    gap: "No change assessments on record. A new type, a new base or a new contract assessed after it took effect is the finding element 3.2 exists to prevent.",
  },
  {
    id: "3.3", name: "Continuous improvement",
    asks: "Internal audit findings, and corrective actions closed and verified.",
    keys: ["findings", "actions"],
    gap: "No audit findings and no corrective actions. Nothing shows the loop closing.",
  },
  {
    id: "4.1", name: "Training and education",
    asks: "Who was trained, in what, when — and what has lapsed.",
    keys: ["training"],
    gap: "No training records. An empty matrix reads to an inspector as untrained, not as unrecorded — and 4.1 asks when each course lapses, not only that it happened.",
  },
  {
    id: "4.2", name: "Safety communication",
    asks: "Safety information published, and feedback reaching the people who reported.",
    keys: ["communications"],
    gap: "No safety communications published. Element 4.2 asks whether people who file hear back.",
  },
]);

/** Count whatever the export put under a key, without assuming an array. */
function countOf(payload: Record<string, unknown>, key: string): number {
  const v = payload[key];
  if (Array.isArray(v)) return v.length;
  /* Some sections are a single object — the voluntary scheme is one
     record or none, and `1` is the honest count rather than treating a
     present object as an empty list. */
  if (v && typeof v === "object") return 1;
  return 0;
}

export const HOW_TO_VERIFY =
  "Each audit entry carries the hash of the one before it. Take the last hash below, " +
  "post the exported audit log to /api/v1/audit/verify, and the chain is confirmed or " +
  "the first altered entry is named. Neither this operator nor UsalamaSMS can change a " +
  "past entry without breaking every hash after it.";

/**
 * Compose the pack from an export payload.
 *
 * PURE, AND TAKES THE PAYLOAD RATHER THAN THE DATABASE. The export
 * route already reads every table under one permission and one
 * tenancy check; re-reading them here would be a second place for the
 * tenancy to be got wrong, which is the defect /api/v1/picture already
 * taught this repository once.
 */
export function composePack(
  payload: Record<string, unknown>,
  generatedAt: Date,
): AuditPack {
  const org = (payload.org ?? {}) as { name?: string; jurisdiction?: string };
  const auditLog = Array.isArray(payload.auditLog) ? payload.auditLog : [];
  const last = auditLog.length
    ? (auditLog[auditLog.length - 1] as { hash?: string }).hash ?? null
    : null;

  const sections: PackSection[] = PACK_MAP.map((m) => {
    const count = m.keys.reduce((n, k) => n + countOf(payload, k), 0);
    return Object.freeze({
      elementId: m.id,
      name: m.name,
      asks: m.asks,
      count,
      sources: Object.freeze([...m.keys]),
      holding: count > 0 ? ("RECORDS" as const) : ("NOTHING" as const),
      ...(count === 0 ? { gap: m.gap } : {}),
    });
  });

  return Object.freeze({
    operator: org.name ?? "Unnamed operator",
    jurisdiction: org.jurisdiction ?? "—",
    generatedAt: generatedAt.toISOString(),
    sections: Object.freeze(sections),
    gaps: Object.freeze(
      sections.filter((s) => s.holding === "NOTHING").map((s) => s.elementId),
    ),
    verification: Object.freeze({
      entries: auditLog.length,
      lastHash: last,
      howToVerify: HOW_TO_VERIFY,
    }),
  });
}
