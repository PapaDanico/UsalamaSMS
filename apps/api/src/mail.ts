/* =====================================================================
   THE ONLY PART OF NOTIFICATION THAT KNOWS A VENDOR EXISTS.

   digest.ts decides WHAT to say and refuses to put a narrative in it.
   This renders that into a subject and a body and hands it to Resend.
   It is deliberately the thin half: everything with judgement in it is
   upstream, unit-tested, and would survive changing provider — which is
   the whole reason it was built in that order.

   -------------------------------------------------------------
   NO KEY IS A SUPPORTED STATE, AND IT IS REPORTED.

   The obvious shape is a function that returns void, checks for the key
   and quietly returns when it is missing. That produces a product where
   the notification path appears to work in every environment that has
   never sent an email — which is every environment, until the first
   time somebody actually needed one. Charter rule 8: a refused write is
   reported.

   So this returns a discriminated result and never throws for an
   expected condition. NOT_CONFIGURED, NOTHING_TO_SAY and SENT are three
   different facts and a caller that logs them can tell which one it is
   looking at. A transport failure is a fourth, and it is the only one
   that means something is wrong.

   -------------------------------------------------------------
   PLAIN TEXT, NO HTML, NO TRACKING.

   Not an aesthetic preference. An HTML digest wants a tracking pixel
   and a wrapped link, and both are surveillance of when a safety
   manager read a warning — telemetry this product has no business
   collecting and no way to justify to a reporter. Plain text also
   survives the mail clients and the connections this product's users
   actually have, and it cannot leak layout into a spam score.

   -------------------------------------------------------------
   THE LINK IS COMPOSED HERE, FROM A CONFIGURED BASE.

   digest.ts returns a PATH. The absolute URL is built from
   PUBLIC_BASE_URL, which is configuration — never from a request header.
   A Host header is attacker-controlled, and an email sent to an
   operator's staff containing a link to a site chosen by whoever made
   the request is a phishing campaign with our return address on it.
   ===================================================================== */
import type { Digest, DigestItem } from "../../../packages/shared/src/digest";
import { isWorthSending } from "../../../packages/shared/src/digest";

export type MailOutcome =
  /** Handed to the provider, which accepted it. */
  | { readonly status: "SENT"; readonly id: string }
  /** No RESEND_API_KEY. Expected in development and in CI. */
  | { readonly status: "NOT_CONFIGURED" }
  /** The digest was empty. Never a failure — see isWorthSending. */
  | { readonly status: "NOTHING_TO_SAY" }
  /** The provider refused or could not be reached. This one is a problem. */
  | { readonly status: "FAILED"; readonly reason: string };

interface MailConfig {
  readonly apiKey: string | undefined;
  readonly baseUrl: string;
  readonly from: string;
}

/**
 * WORDING PER KIND, and it lives here rather than in digest.ts because
 * it is presentation. digest.ts holds a kind and a count; whether that
 * reads as "3 reports are waiting triage" is this file's problem, and a
 * second channel would word the same facts differently.
 */
const PHRASE: Readonly<Record<DigestItem["kind"], (n: number) => string>> = Object.freeze({
  DEADLINE: (n) => (n === 1 ? "1 reporting deadline needs attention" : `${n} reporting deadlines need attention`),
  CURRENCY: (n) => (n === 1 ? "1 training currency is lapsing" : `${n} training currencies are lapsing`),
  UNTRIAGED: (n) => (n === 1 ? "1 report is waiting to be triaged" : `${n} reports are waiting to be triaged`),
  ACTION_OVERDUE: (n) => (n === 1 ? "1 corrective action is overdue" : `${n} corrective actions are overdue`),
});

/**
 * The subject line.
 *
 * IT LEADS WITH THE WORST THING, because a subject is often all that is
 * read on a handset lock screen. "UsalamaSMS" first so it is
 * recognisable in a list, then the urgency, then the count of subjects
 * — never the detail of any of them.
 */
export function subjectFor(digest: Digest): string {
  const urgent = digest.urgency === "NOW" ? "Action needed today" : "Safety record update";
  const kinds = digest.items.length;
  return `UsalamaSMS — ${urgent} (${kinds} ${kinds === 1 ? "item" : "items"})`;
}

/** Days rendered as something a person reads without doing arithmetic. */
function when(item: DigestItem): string {
  if (item.soonestDays === null) return "";
  if (item.soonestDays < 0) return ` — soonest overdue by ${Math.abs(item.soonestDays)} days`;
  if (item.soonestDays === 0) return " — soonest is today";
  if (item.soonestDays === 1) return " — soonest is tomorrow";
  return ` — soonest in ${item.soonestDays} days`;
}

/**
 * The body.
 *
 * NOTHING IS INTERPOLATED THAT DID NOT COME FROM A DIGEST ITEM, and a
 * digest item has no field capable of holding free text. That is the
 * confidentiality boundary, and it holds here by construction rather
 * than by this function being careful.
 */
export function bodyFor(digest: Digest, baseUrl: string): string {
  const lines = digest.items.map((item) => `- ${PHRASE[item.kind](item.count)}${when(item)}\n  ${baseUrl}${item.href}`);
  return [
    "This is the daily summary from your safety management system.",
    "",
    ...lines,
    "",
    /* WORDED AROUND THE WORDS THE TEST FORBIDS, and that is the right
       way round. The assertion scans the WHOLE transmitted payload for
       "narrative", "reporter" and "anonymous" — a blunt check, and its
       bluntness is the point: it cannot be fooled by a field added
       later or by a clever interpolation. The first version of this
       footer said "safety narratives are never sent by email" and
       tripped it. Loosening the regex to allow the word in static copy
       would have traded a check that cannot be argued with for one that
       needs a maintainer to be careful. Changing four words of prose
       costs nothing and leaves the guard absolute. */
    "Counts only. Open the product to see what any of them are —",
    "what a report says is never sent by email.",
  ].join("\n");
}

/**
 * Send a digest, or say precisely why it was not sent.
 *
 * `fetchImpl` is injected so a test can assert what would go on the wire
 * without one going on the wire. The default is the platform fetch.
 */
export async function sendDigest(
  digest: Digest,
  to: string,
  config: MailConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<MailOutcome> {
  /* CHECKED HERE AS WELL AS AT THE CALL SITE, deliberately. isWorthSending
     is the rule and this is the enforcement: a caller that forgets to ask
     must not be able to send "nothing to report" every morning until
     people filter the address. */
  if (!isWorthSending(digest)) return { status: "NOTHING_TO_SAY" };
  if (!config.apiKey) return { status: "NOT_CONFIGURED" };

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to,
        subject: subjectFor(digest),
        text: bodyFor(digest, config.baseUrl),
      }),
    });

    if (!response.ok) {
      /* The STATUS, not the body. A provider error body can echo the
         request back, and this request contains an Authorization header
         in the same object a careless log line would serialise. */
      return { status: "FAILED", reason: `provider responded ${response.status}` };
    }

    /* PARSED AFTER THE OK, AND FAILURE TO PARSE IS NOT FAILURE TO SEND.
       The provider has accepted the message by this point. Letting a
       non-JSON 2xx body fall into the catch below would report FAILED
       for a mail that went out, and the obvious reaction to FAILED is
       to try again — so a parser quirk becomes two copies of a safety
       warning in somebody's inbox. The id is for logging; not having it
       is not worth resending over. */
    let id = "";
    try {
      const payload = (await response.json()) as { id?: string };
      id = payload.id ?? "";
    } catch {
      /* Accepted, unparseable. Still sent. */
    }
    return { status: "SENT", id };
  } catch (error) {
    return {
      status: "FAILED",
      reason: error instanceof Error ? error.message : "transport failed",
    };
  }
}

/**
 * Configuration from the environment, with the absent key left absent.
 *
 * NO DEFAULT FOR THE KEY. A placeholder would turn "not configured" into
 * a provider rejection, which reads as a fault rather than as a choice.
 */
export function mailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MailConfig {
  return {
    apiKey: env.RESEND_API_KEY || undefined,
    baseUrl: (env.PUBLIC_BASE_URL || "https://usalamasms.com").replace(/\/+$/, ""),
    from: "UsalamaSMS <safety@usalamasms.com>",
  };
}
