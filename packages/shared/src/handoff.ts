/* =====================================================================
   HANDING A WARNING TO A CHANNEL THIS PRODUCT DOES NOT OWN.

   Four things in this product are computed and delivered to nobody:
   training that is lapsing, an emergency contact nobody has verified in
   six months, a reporting deadline coming up, and a corrective action
   past its date. Every one of them is correct on a screen the person
   who needs it has not opened.

   THE REAL ANSWER IS SMS, and it is blocked on a sender-ID
   registration and API credentials that must not travel through a chat
   log. That work is queued and this is not it.

   THIS IS THE THING THAT NEEDS NOTHING. The Web Share API and a
   `mailto:` link are both client-side: no server, no account, no
   registration, no credential. The product composes the sentence and
   hands it to whatever the safety manager already has open — which in
   this market is WhatsApp. The operator sends it themselves.

   ---------------------------------------------------------------
   WHAT THIS IS NOT, said plainly because the temptation is to let it
   blur.

   IT IS NOT ALERTING. Alerting reaches somebody who has NOT opened the
   screen; this reaches somebody who has. It removes the retyping, not
   the checking. Element 4.1 stays PARTIAL, the coverage figure does not
   move, and a claims assertion holds that — because the one way this
   feature does harm is by being mistaken for the thing it stands in
   for, and an operator who believes they are being alerted stops
   looking.

   ---------------------------------------------------------------
   THE SAFETY PROPERTY, which is the whole of the design.

   WHATSAPP IS THE LEAST CONTROLLED CHANNEL THIS PRODUCT WILL EVER
   TOUCH. A message leaves the device, lands in a group, is forwarded,
   is backed up to somebody's cloud, and is read by people no
   permission matrix has ever heard of. Everything else in this product
   is scoped by orgId and a role; this is scoped by whoever the sender
   taps.

   So the rule is absolute and it is the same one the triage queue
   already follows for the same reason: **A HANDOFF CARRIES COUNTS AND
   DATES. IT NEVER CARRIES A NARRATIVE, A NAME, OR A REPORT TITLE.**

   "Three training records lapse within 30 days" is safe to forward.
   "Capt. Otieno's line check expires on the 3rd" is a personnel record
   in a group chat. "Two reports are approaching their KCAA deadline" is
   safe. The title of a fatigue report is the sentence that identifies
   its author at a six-aircraft operator, which is what
   de-identification exists to prevent and what this would walk straight
   past.

   The composers below therefore take NUMBERS AND DATES ONLY. There is
   no parameter on any of them that could carry free text, which is the
   structural version of the rule rather than a promise to remember it.
   ===================================================================== */

/** What kind of warning is being handed off. */
export type HandoffKind = "training" | "contacts" | "deadlines" | "actions";

export interface Handoff {
  readonly kind: HandoffKind;
  /** A subject line, for the mail path. */
  readonly subject: string;
  /** The message body. Counts and dates; never content. */
  readonly body: string;
}

/**
 * The counts a handoff may mention. Numbers and a horizon, nothing else.
 *
 * NOTE WHAT CANNOT BE PASSED. There is no `names`, no `titles`, no
 * `reports`. A caller holding a lapsing training record cannot put the
 * person in the message even by mistake, because the function will not
 * accept them.
 */
export interface HandoffCounts {
  /** How many items the warning covers. */
  readonly count: number;
  /** The window it was computed over, in days, where one applies. */
  readonly withinDays?: number;
  /** How many of them are already past, where the distinction matters. */
  readonly overdue?: number;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/* Every message ends the same way. The recipient of a forwarded
   WhatsApp message has no idea what produced it, and a warning with no
   provenance is a warning somebody ignores — or worse, acts on without
   knowing what it was counted from. */
const PROVENANCE =
  "Counted by UsalamaSMS from your operator's own record. " +
  "Open the product for the detail — this message deliberately carries none.";

export function trainingHandoff(c: HandoffCounts): Handoff {
  const within = c.withinDays ?? 30;
  const overdue = c.overdue ?? 0;
  const lapsed = overdue > 0 ? ` ${overdue} ${plural(overdue, "has", "have")} already lapsed.` : "";
  return {
    kind: "training",
    subject: `Training: ${c.count} ${plural(c.count, "record", "records")} need attention`,
    body:
      `${c.count} training ${plural(c.count, "record", "records")} ` +
      `${plural(c.count, "lapses", "lapse")} within ${within} days.${lapsed}\n\n${PROVENANCE}`,
  };
}

export function contactsHandoff(c: HandoffCounts): Handoff {
  const within = c.withinDays ?? 182;
  return {
    kind: "contacts",
    subject: `Emergency contacts: ${c.count} unverified`,
    body:
      `${c.count} emergency ${plural(c.count, "contact has", "contacts have")} not been ` +
      `verified in ${within} days. A directory nobody has checked is a plan that ` +
      `connects to nobody.\n\n${PROVENANCE}`,
  };
}

export function deadlinesHandoff(c: HandoffCounts): Handoff {
  const overdue = c.overdue ?? 0;
  /* THE OVERDUE COUNT LEADS WHEN THERE IS ONE. A message that opens
     with "four approaching" and buries "one already late" is a message
     read as comfortable. */
  const head =
    overdue > 0
      ? `${overdue} ${plural(overdue, "report is", "reports are")} PAST the reporting deadline. `
      : "";
  return {
    kind: "deadlines",
    subject:
      overdue > 0
        ? `Reporting deadline: ${overdue} past, ${c.count} approaching`
        : `Reporting deadline: ${c.count} approaching`,
    body:
      `${head}${c.count} ${plural(c.count, "report is", "reports are")} approaching the ` +
      `reporting deadline for your State.\n\n${PROVENANCE}`,
  };
}

export function actionsHandoff(c: HandoffCounts): Handoff {
  const overdue = c.overdue ?? c.count;
  return {
    kind: "actions",
    subject: `Corrective actions: ${overdue} overdue`,
    body:
      `${overdue} corrective ${plural(overdue, "action is", "actions are")} past ` +
      `${plural(overdue, "its", "their")} due date.\n\n${PROVENANCE}`,
  };
}

/**
 * A `mailto:` URL for a handoff.
 *
 * NO RECIPIENT. The product does not know who should get this and must
 * not guess — the safety manager picks from their own address book,
 * which is also the only place a verified number or address lives. An
 * operator's own emergency contact directory holds those; putting them
 * in a link here would be the product asserting a routing decision it
 * has no basis for.
 */
export function mailtoFor(h: Handoff): string {
  return `mailto:?subject=${encodeURIComponent(h.subject)}&body=${encodeURIComponent(h.body)}`;
}

/**
 * Anything that looks like content rather than a count.
 *
 * READ BY A TEST AND BY A CLAIMS GATE, so the rule at the top of this
 * file is enforced rather than described. It looks for the shapes
 * de-identification exists to remove — a registration, a flight number,
 * a titled name, an email, a telephone number — in a string that is
 * about to leave the device through a channel this product does not
 * control.
 */
export function looksLikeContent(text: string): ReadonlyArray<string> {
  const found: string[] = [];
  const checks: ReadonlyArray<readonly [string, RegExp]> = [
    ["a registration", /\b5[XYHZ]-[A-Z]{3}\b|\b[A-Z]{1,2}-[A-Z]{3,4}\b/],
    ["a flight number", /\b[A-Z]{2}\d{2,4}\b/],
    ["a titled name", /\b(Capt|Captain|Mr|Mrs|Ms|Dr|F\/O|FO)\.?\s+[A-Z][a-z]+/],
    ["an email address", /[\w.+-]+@[\w-]+\.[\w.]+/],
    ["a telephone number", /\+?\d[\d\s().-]{7,}/],
  ];
  for (const [what, pattern] of checks) {
    if (pattern.test(text)) found.push(what);
  }
  return found;
}
