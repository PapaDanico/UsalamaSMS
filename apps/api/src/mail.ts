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
import { TRIAL_DAYS } from "../../../packages/shared/src/pricing";

export type MailOutcome =
  /** Handed to the provider, which accepted it. */
  | { readonly status: "SENT"; readonly id: string }
  /** No RESEND_API_KEY. Expected in development and in CI. */
  | { readonly status: "NOT_CONFIGURED" }
  /** The digest was empty. Never a failure — see isWorthSending. */
  | { readonly status: "NOTHING_TO_SAY" }
  /** The provider refused or could not be reached. This one is a problem. */
  | { readonly status: "FAILED"; readonly reason: string };

/* THE STAGES ARE DAYS INTO A TRIAL OF TRIAL_DAYS, so they cannot outrun
   it. They were 1/7/30/45/55/60 for one day in August 2026, against a
   trial the constant said was 30 days long: the last three could never
   fire, because `stateOn` stops returning TRIAL before day 45 arrives.
   Three emails nobody could receive, and no test could see it — the
   fixtures called `trialDigestBody({stage: 55})` directly and never
   asked whether a trial reaches day 55. */
export type TrialDigestStage = 1 | 7 | 15 | 25 | 30;

export interface TrialDigest {
  readonly stage: TrialDigestStage;
  readonly daysRemaining: number;
  readonly reports: number;
  readonly hazards: number;
  readonly closedActions: number;
  readonly onboardingComplete: number;
}

interface MailConfig {
  readonly apiKey: string | undefined;
  readonly baseUrl: string;
  readonly from: string;
  /**
   * WHERE A REPLY GOES, when somebody has somewhere for it to go.
   *
   * Every message this product sent came from `safety@usalamasms.com`
   * with no Reply-To, so a safety manager hitting Reply on the daily
   * digest wrote to an address nobody reads. That is the worst of the
   * three possible states: a no-reply sender at least tells them not to
   * bother, and a real mailbox answers. This looked like it worked.
   *
   * ABSENT UNLESS CONFIGURED, and absent means the header is OMITTED
   * rather than set to something plausible. The same discipline
   * `apiKey` gets: a placeholder would turn "nobody has set this up"
   * into "we sent your reply somewhere", and only one of those is true.
   *
   * REQUIRED IN THE TYPE, not optional. Every construction site has to
   * decide, which is how a future sender cannot quietly forget — the
   * same reasoning SURVIVES_LAPSE uses in subscription.ts.
   */
  readonly replyTo: string | undefined;
  /**
   * WHERE A COMMERCIAL NOTICE GOES — the vendor's own inbox, not an
   * operator's. Absent unless configured, for the same reason as
   * `replyTo`: a notice sent to a guessed address carries a customer's
   * name somewhere nobody chose.
   */
  readonly platformNotice: string | undefined;
}

function senderAddress(config: MailConfig): string {
  return config.replyTo
    ?? config.from.match(/<([^>]+)>/)?.[1]
    ?? "safety@usalamasms.com";
}

function unsubscribeLine(config: MailConfig): string {
  return `Unsubscribe from trial emails: mailto:${senderAddress(config)}?subject=Unsubscribe%20trial%20emails`;
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
  CONTACT: (n) => (n === 1 ? "1 emergency contact needs verification" : `${n} emergency contacts need verification`),
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
        Authorization: "Bearer " + config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
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

export function trialDigestSubject(digest: TrialDigest): string {
  switch (digest.stage) {
    case 1:
      return `Welcome to UsalamaSMS. Your ${TRIAL_DAYS}-day trial starts today.`;
    case 7:
      return "Week 1 check-in from UsalamaSMS";
    case 15:
      return "Halfway through your UsalamaSMS trial";
    case 25:
      return "5 days left in your UsalamaSMS trial";
    case 30:
      return "Your UsalamaSMS trial ends today";
  }
}

export function trialDigestBody(digest: TrialDigest, config: MailConfig): string {
  const lines =
    digest.stage === 1
      ? [
          `Welcome to UsalamaSMS. Your ${TRIAL_DAYS}-day trial starts today. Here's your onboarding checklist.`,
          "",
          "- [ ] File your first report",
          "- [ ] Complete the SMS maturity assessment",
          "- [ ] Add one hazard to the risk register",
          "- [ ] Create your first SPI",
          "- [ ] Invite your team (2+ members)",
          "",
          `Open the dashboard: ${config.baseUrl}/today`,
        ]
      : digest.stage === 7
        ? [
            `Week 1 check-in. You have ${digest.daysRemaining} days remaining.`,
            `${digest.onboardingComplete} of 4 shared onboarding steps complete.`,
            "The fifth step is the maturity assessment, and it is kept on the device where it was filled in.",
            "",
            `Open the dashboard: ${config.baseUrl}/today`,
          ]
        : digest.stage === 15
          ? [
              `Halfway through your trial. ${digest.reports} ${digest.reports === 1 ? "report" : "reports"} filed, ` +
                `${digest.hazards} ${digest.hazards === 1 ? "hazard" : "hazards"} registered.`,
              "",
              `Open the dashboard: ${config.baseUrl}/today`,
            ]
          : digest.stage === 25
            ? [
                `5 days left. Here's what you built: ${digest.reports} ${digest.reports === 1 ? "report" : "reports"}, ` +
                  `${digest.hazards} ${digest.hazards === 1 ? "hazard" : "hazards"}, ` +
                  `${digest.closedActions} ${digest.closedActions === 1 ? "closed action" : "closed actions"}. Ready to subscribe?`,
                "",
                `Open the dashboard: ${config.baseUrl}/today`,
              ]
            : [
                "Your trial ends today. Subscribe to keep full access, or continue with free reporting.",
                "",
                `Open the dashboard: ${config.baseUrl}/today`,
              ];

  return [
    ...lines,
    "",
    unsubscribeLine(config),
  ].join("\n");
}

export async function sendTrialDigest(
  digest: TrialDigest,
  to: string,
  config: MailConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<MailOutcome> {
  if (!config.apiKey) return { status: "NOT_CONFIGURED" };

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
        to,
        subject: trialDigestSubject(digest),
        text: trialDigestBody(digest, config),
      }),
    });

    if (!response.ok) return { status: "FAILED", reason: `provider responded ${response.status}` };

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

/* =====================================================================
   THE SECOND THING THIS FILE SENDS, and the only one that is not counts.

   A digest carries no free text by construction — a DigestItem has no
   field capable of holding any — and the comment above bodyFor calls
   that the confidentiality boundary. This message is held to the same
   line by the same means: the only variable in it is a URL this server
   composed from configuration and a token this server minted. No name,
   no organisation, no report, nothing the caller supplied.

   THAT INCLUDES NOT NAMING THE ACCOUNT. The obvious courtesy is "Hello
   Jane" or "for the UsalamaSMS account at Skyward Air", and both are a
   confirmation to whoever reads that mailbox that the address holds an
   account here — which is the exact fact /auth/forgot refuses to
   confirm to the person who asked. Putting it in the mail would leak
   through a side channel what the route was careful about at the front.

   THE LINK IS ABSOLUTE AND BUILT FROM PUBLIC_BASE_URL, never from a
   request header, for the reason this file's header records: a Host
   header is attacker-controlled, and a password-reset link pointing at
   a site of the requester's choosing is a credential-harvesting
   campaign sent from our own domain with our own return address.
   ===================================================================== */
export function resetSubject(): string {
  return "UsalamaSMS — set a new password";
}

export function resetBody(link: string, minutes: number): string {
  return [
    "Somebody asked to set a new password for this address.",
    "",
    "Open this link and choose one:",
    link,
    "",
    `The link works once and stops working after ${minutes} minutes.`,
    "",
    /* SAID PLAINLY, because it is the only instruction that matters to
       the one reader who did not ask for this. "Ignore this email" is
       the standard sentence and it is incomplete — it tells them to do
       nothing without telling them that doing nothing is sufficient,
       which is the part that decides whether they panic. */
    "If that was not you, nothing has happened and nothing will. The link",
    "changes nothing until it is opened, and your current password still works.",
    "",
    "Using it signs out every device this account is signed in on.",
  ].join("\n");
}

/**
 * Send a reset link, or say precisely why it was not sent.
 *
 * SAME DISCIPLINE AS sendDigest, and the same four outcomes minus the
 * one that cannot apply — there is no "nothing to say" about a link
 * somebody has asked for. NOT_CONFIGURED is a supported state and is
 * reported rather than swallowed: a deployment with no RESEND_API_KEY
 * has a recovery path that silently does nothing, and the operator
 * staring at an empty inbox deserves to be told which of the two it is.
 */
export async function sendPasswordReset(
  to: string,
  link: string,
  minutes: number,
  config: MailConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<MailOutcome> {
  if (!config.apiKey) return { status: "NOT_CONFIGURED" };

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
        to,
        subject: resetSubject(),
        text: resetBody(link, minutes),
      }),
    });

    if (!response.ok) {
      /* The status, never the body — see the note on the digest send:
         a provider error body can echo the request back, and this
         request contains both an Authorization header and a live reset
         link in the same object a careless log line would serialise. */
      return { status: "FAILED", reason: `provider responded ${response.status}` };
    }

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

/* =====================================================================
   THE INVITATION AN OPERATOR GETS WHEN AN ADMINISTRATOR PROVISIONS THEM.

   Until this existed, provisioning an operator sent NOTHING. The
   generated password came back once in the administrator's response and
   the new safety manager learned they had an account only if somebody
   remembered to tell them. That is the gap between having a product and
   being able to onboard a paying customer, and it was closed last.

   ---------------------------------------------------------------
   IT DOES NOT CARRY THE PASSWORD, AND THAT IS NOT AN OVERSIGHT.

   routes.admin.ts already says the generated password is "never logged,
   never emailed from here, and never returned again". A password in an
   email is a password in a mailbox forever — searchable, forwarded,
   backed up, and still valid months after the person has left. The
   administrator hands it over by whatever channel they and the customer
   already trust, and this message tells the recipient to expect that.

   WHAT IT DOES CARRY is the thing an operator cannot get any other way:
   confirmation that the account is real, the address it is under, and
   an absolute link to sign in. A person who receives "your
   administrator will send your password separately" from a domain that
   passes DKIM is far harder to phish than one who receives a password.

   ---------------------------------------------------------------
   THE LINK IS BUILT FROM PUBLIC_BASE_URL, never from a request header,
   for the reason the reset email records: a Host header is
   attacker-controlled, and a sign-in link pointing wherever the
   requester chooses is a credential-harvesting campaign sent from our
   own domain with our own return address.
   ===================================================================== */
export function invitationSubject(orgName: string): string {
  return `UsalamaSMS — your safety management account for ${orgName}`;
}

export function invitationBody(
  orgName: string,
  email: string,
  baseUrl: string,
  trialEndsOn: string | null,
): string {
  return [
    `An account has been created for ${orgName} on UsalamaSMS.`,
    "",
    `Sign in at: ${baseUrl}/login`,
    `Your username is this address: ${email}`,
    "",
    /* SAID BEFORE THEY GO LOOKING FOR IT. The single most likely
       failure of this email is somebody hunting for a password that is
       deliberately not in it, deciding the message is broken, and
       filing it. */
    "Your password is not in this email, on purpose — a password sent by",
    "email stays in a mailbox long after it should. Your administrator has",
    "it and will pass it to you directly. If you have not been given one,",
    "ask them rather than requesting a reset.",
    "",
    ...(trialEndsOn
      ? [`Your trial runs until ${trialEndsOn}. Everything is available during it.`, ""]
      : []),
    "What to do first: file one report, so the system holds something real,",
    "and open Annex 19 Conformance to see where you stand against the twelve",
    "elements.",
    "",
    "This product holds your safety record. It does not run your safety",
    "management system — somebody still has to identify the hazard, decide",
    "the risk is tolerable, and sign their name to that.",
  ].join("\n");
}

/**
 * Send the invitation, or say precisely why it was not sent.
 *
 * THE OUTCOME IS RETURNED RATHER THAN SWALLOWED, and the provisioning
 * route reports it to the administrator, because the administrator is
 * the only person who can act on a failure — they are holding the
 * password and can pick up a phone. An invitation that silently did not
 * arrive is worse than one that was never attempted: it leaves somebody
 * believing the customer has been onboarded.
 */
export async function sendInvitation(
  to: string,
  orgName: string,
  trialEndsOn: string | null,
  config: MailConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<MailOutcome> {
  if (!config.apiKey) return { status: "NOT_CONFIGURED" };

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
        to,
        subject: invitationSubject(orgName),
        text: invitationBody(orgName, to, config.baseUrl, trialEndsOn),
      }),
    });

    if (!response.ok) {
      /* The status, never the body — a provider error can echo the
         request back, and this request carries an Authorization header
         in the same object a careless log line would serialise. */
      return { status: "FAILED", reason: `provider responded ${response.status}` };
    }

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

/* =====================================================================
   AN OPERATOR HAS ASKED TO PAY, AND SOMEBODY HAS TO HEAR IT.

   The 402 wall now names a price. Without this, saying yes to it
   reached a database row and nobody's inbox — an operator waiting for
   an answer that was never going to come, which is a worse outcome than
   a wall with no button on it.

   IT CARRIES NO SAFETY DATA. Only the operator's name, who asked, the
   fleet size and the band. A commercial notice is not a place for a
   narrative, a report count or anything a reporter wrote in confidence,
   and the temptation to enrich it with "and they have 14 open hazards"
   is exactly how confidential material ends up in a sales mailbox.
   ===================================================================== */
export function upgradeRequestSubject(orgName: string): string {
  return `UsalamaSMS — ${orgName} has asked to upgrade`;
}

export function upgradeRequestBody(
  orgName: string,
  askedBy: string,
  fleetSize: number | null,
  band: { name: string; usdMonthly: number } | null,
): string {
  return [
    `${orgName} has asked to move onto a paid subscription.`,
    "",
    `Asked by: ${askedBy}`,
    fleetSize === null
      ? "Fleet size: not recorded — ask before quoting, do not assume a band."
      : `Fleet size: ${fleetSize}`,
    band
      ? `Band: ${band.name}, $${band.usdMonthly}/month`
      : "Band: cannot be determined without a fleet size.",
    "",
    "NOTHING HAS BEEN GRANTED. Confirm payment however you normally do,",
    "then grant the entitlement from the administration console. Until you",
    "do, their safety office stays paused — their people can still file",
    "reports and they can still export their whole record.",
  ].join("\n");
}

/**
 * Tell the platform administrator, or say precisely why nobody was told.
 *
 * ADDRESSED FROM THE ENVIRONMENT, and absent means NOT_CONFIGURED
 * rather than a guess. Sending a commercial notice to an address
 * nobody chose is how a customer's name ends up somewhere it was never
 * meant to go.
 */
export async function sendUpgradeRequest(
  orgName: string,
  askedBy: string,
  fleetSize: number | null,
  band: { name: string; usdMonthly: number } | null,
  config: MailConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<MailOutcome> {
  if (!config.apiKey) return { status: "NOT_CONFIGURED" };
  if (!config.platformNotice) return { status: "NOT_CONFIGURED" };

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
        to: config.platformNotice,
        subject: upgradeRequestSubject(orgName),
        text: upgradeRequestBody(orgName, askedBy, fleetSize, band),
      }),
    });
    if (!response.ok) {
      return { status: "FAILED", reason: `provider responded ${response.status}` };
    }
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
    /* Set MAIL_REPLY_TO to a mailbox somebody actually reads. Until it
       is set, no Reply-To is sent at all — which is honest: a reply
       fails visibly rather than disappearing into a void the sender
       believes is monitored. An empty string is not an address, so a
       variable created and never filled in stays absent. */
    replyTo: env.MAIL_REPLY_TO || undefined,
    platformNotice: env.PLATFORM_NOTICE_EMAIL || undefined,
  };
}
