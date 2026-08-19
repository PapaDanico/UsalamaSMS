/* =====================================================================
   WHAT WOULD GO ON THE WIRE, ASSERTED WITHOUT ANYTHING GOING ON IT.

   `fetch` is injected, so every one of these inspects the exact request
   body the provider would receive. That matters more here than in most
   places: this is the one component in the product that transmits
   outside its own access control, and "we reviewed it carefully" is not
   the standard the rest of the repository holds itself to.
   ===================================================================== */
import { describe, it, expect, vi } from "vitest";
import {
  sendDigest, sendTrialDigest, subjectFor, bodyFor, mailConfigFromEnv,
  trialDigestBody, trialDigestSubject,
} from "../apps/api/src/mail";
import { digestFor } from "../packages/shared/src/digest";

const configured = {
  apiKey: "re_test_key",
  baseUrl: "https://usalamasms.com",
  from: "UsalamaSMS <safety@usalamasms.com>",
  /* No Reply-To by default, which is the state a deployment is in
     until somebody sets MAIL_REPLY_TO to a mailbox they read. */
  platformNotice: undefined,
  replyTo: undefined,
};

const withReplyTo = { ...configured, replyTo: "safety@strip.test" };

const busy = digestFor({
  deadlines: [{ status: "OVERDUE", daysLeft: -2 }],
  currencies: [{ state: "DUE_SOON", daysLeft: 11 }],
  untriaged: 3,
  overdueActions: [{ daysLeft: -5 }],
  contacts: [{ state: "STALE", daysLeft: -8 }],
});

const quiet = digestFor({ deadlines: [], currencies: [], untriaged: 0, overdueActions: [], contacts: [] });

/** A fetch that records the call and reports success. */
function spyFetch(status = 200, body: unknown = { id: "abc-123" }) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("refusing to send, and saying so", () => {
  /* Charter rule 8. The obvious shape returns void and quietly does
     nothing without a key, which produces a notification path that
     appears to work in every environment that has never sent an email —
     which is every environment, until the first time one was needed. */
  it("reports NOT_CONFIGURED rather than pretending, when there is no key", async () => {
    const fetchImpl = spyFetch();
    const outcome = await sendDigest(busy, "safety@example.com", { ...configured, apiKey: undefined }, fetchImpl);
    expect(outcome.status).toBe("NOT_CONFIGURED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports NOTHING_TO_SAY for an empty digest, and does not call the provider", async () => {
    const fetchImpl = spyFetch();
    const outcome = await sendDigest(quiet, "safety@example.com", configured, fetchImpl);
    expect(outcome.status).toBe("NOTHING_TO_SAY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  /* Checked here as well as at the call site on purpose: a caller that
     forgets to ask must not be able to send "nothing to report" every
     morning until people filter the address. */
  it("checks emptiness before it checks the key, so an empty digest is never a config error", async () => {
    const outcome = await sendDigest(quiet, "safety@example.com", { ...configured, apiKey: undefined }, spyFetch());
    expect(outcome.status).toBe("NOTHING_TO_SAY");
  });

  it("reports FAILED with the status when the provider refuses", async () => {
    const outcome = await sendDigest(busy, "safety@example.com", configured, spyFetch(422));
    expect(outcome.status).toBe("FAILED");
    if (outcome.status === "FAILED") expect(outcome.reason).toContain("422");
  });

  it("reports FAILED rather than throwing when the transport dies", async () => {
    const dead = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const outcome = await sendDigest(busy, "safety@example.com", configured, dead);
    expect(outcome.status).toBe("FAILED");
  });

  /* A provider error body can echo the request back, and the request
     carries an Authorization header in the same object a careless log
     line would serialise. */
  it("does not put the provider's response body into the failure reason", async () => {
    const outcome = await sendDigest(
      busy,
      "safety@example.com",
      configured,
      spyFetch(400, { message: "Bearer re_test_key was rejected" }),
    );
    expect(outcome.status).toBe("FAILED");
    if (outcome.status === "FAILED") expect(outcome.reason).not.toContain("re_test_key");
  });
});

describe("what actually goes on the wire", () => {
  async function wireBody() {
    const fetchImpl = spyFetch();
    await sendDigest(busy, "safety@example.com", configured, fetchImpl);
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    /* Typed rather than Record<string, string>: under
       noUncheckedIndexedAccess an index signature makes every field
       possibly-undefined, and `html` genuinely IS optional while `text`
       genuinely is not — which is the distinction these checks turn on. */
    return JSON.parse((call[1] as RequestInit).body as string) as {
      from: string;
      to: string;
      subject: string;
      text: string;
      html?: string;
    };
  }

  it("sends plain text and no HTML at all", async () => {
    const sent = await wireBody();
    expect(sent.text).toBeTruthy();
    expect(sent.html).toBeUndefined();
    expect(sent.text).not.toMatch(/<[a-z]/i);
  });

  /* An HTML digest wants a tracking pixel and a wrapped link, and both
     are surveillance of when a safety manager read a warning. */
  /* SCANS THE WHOLE PAYLOAD, not just the text part. The first version
     read `sent.text` only, so planting an HTML body with a tracking
     pixel in it under mutation left THIS check green — the sibling
     no-HTML assertion is what caught it. A test named for tracking that
     cannot see a tracker in the field trackers actually live in is a
     test that reads as coverage it does not provide. */
  it("carries no tracking pixel or wrapped link anywhere in the payload", async () => {
    const sent = await wireBody();
    expect(JSON.stringify(sent)).not.toMatch(/\.gif|\.png|track|click\?|utm_|pixel/i);
  });

  it("links absolutely, to a screen, on the configured host", async () => {
    const sent = await wireBody();
    for (const url of sent.text.match(/https?:\/\/\S+/g) ?? []) {
      expect(url.startsWith("https://usalamasms.com/")).toBe(true);
      expect(url).not.toContain("?");
    }
  });

  /* THE BOUNDARY, asserted over the transmitted bytes rather than over
     the digest that produced them. digest.ts guarantees no item can
     hold free text; this guarantees nothing else got added on the way
     out — a subject line, a footer, a helpful summary. */
  it("transmits no narrative, name or report identifier", async () => {
    const sent = await wireBody();
    const whole = JSON.stringify(sent);
    expect(whole).not.toMatch(/narrative|reporter|anonymous/i);
    expect(whole).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });

  it("says how many, and never which", async () => {
    const sent = await wireBody();
    expect(sent.text).toContain("3 reports are waiting to be triaged");
    expect(sent.text).toContain("what a report says is never sent by email");
  });
});

describe("the subject line", () => {
  it("leads with the product, then the urgency", async () => {
    expect(subjectFor(busy).startsWith("UsalamaSMS —")).toBe(true);
    expect(subjectFor(busy)).toContain("Action needed today");
  });

  it("softens when nothing is urgent", () => {
    const calm = digestFor({ deadlines: [], currencies: [], untriaged: 2, overdueActions: [], contacts: [] });
    expect(subjectFor(calm)).toContain("Safety record update");
  });

  it("counts subjects, never their contents", () => {
    expect(subjectFor(busy)).toContain("5 items");
    expect(subjectFor(busy)).not.toMatch(/[0-9a-f]{8}-/i);
  });
});

describe("wording", () => {
  it("agrees in number for one and for many", () => {
    const one = digestFor({ deadlines: [], currencies: [], untriaged: 1, overdueActions: [], contacts: [] });
    expect(bodyFor(one, "https://x.test")).toContain("1 report is waiting");
    expect(bodyFor(busy, "https://x.test")).toContain("3 reports are waiting");
  });

  it("says today and tomorrow rather than making somebody subtract", () => {
    const today = digestFor({ deadlines: [{ status: "DUE_SOON", daysLeft: 0 }], currencies: [], untriaged: 0, overdueActions: [], contacts: [] });
    const tomorrow = digestFor({ deadlines: [{ status: "DUE_SOON", daysLeft: 1 }], currencies: [], untriaged: 0, overdueActions: [], contacts: [] });
    expect(bodyFor(today, "https://x.test")).toContain("soonest is today");
    expect(bodyFor(tomorrow, "https://x.test")).toContain("soonest is tomorrow");
  });

  it("states overdue as overdue rather than as a negative number", () => {
    const body = bodyFor(busy, "https://x.test");
    expect(body).toContain("overdue by 2 days");
    expect(body).not.toContain("-2");
  });
});

describe("configuration", () => {
  it("leaves an absent key absent rather than inventing a placeholder", () => {
    expect(mailConfigFromEnv({} as NodeJS.ProcessEnv).apiKey).toBeUndefined();
  });

  it("treats an empty string as absent", () => {
    expect(mailConfigFromEnv({ RESEND_API_KEY: "" } as NodeJS.ProcessEnv).apiKey).toBeUndefined();
  });

  it("trims a trailing slash so a link never doubles it", () => {
    const config = mailConfigFromEnv({ PUBLIC_BASE_URL: "https://usalamasms.com/" } as NodeJS.ProcessEnv);
    expect(config.baseUrl).toBe("https://usalamasms.com");
  });
});

/* =====================================================================
   THE REPLY THAT USED TO GO NOWHERE.

   Every message this product sent came from safety@usalamasms.com with
   no Reply-To, so a safety manager hitting Reply on the daily digest
   wrote into a void. That is the worst of the three states a sender can
   be in: a no-reply address at least tells them not to bother, and a
   real mailbox answers. This one looked like it worked.

   ABSENT MEANS THE HEADER IS OMITTED, never set to something
   plausible — the same discipline the API key gets. A placeholder
   turns "nobody has configured this" into "we sent your reply
   somewhere", and only one of those is true.
   ===================================================================== */
describe("reply-to", () => {
  const bodyOf = async (config: typeof configured | typeof withReplyTo) => {
    const fetchImpl = spyFetch();
    await sendDigest(busy, "safety@example.com", config, fetchImpl);
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    return JSON.parse(String((call[1] as { body: string }).body)) as Record<string, unknown>;
  };

  it("SENDS NO Reply-To HEADER AT ALL when none is configured", async () => {
    const body = await bodyOf(configured);
    expect(body).not.toHaveProperty("reply_to");
  });

  it("and sends it when there is a mailbox to send it to", async () => {
    /* The other direction — a config that never emitted the header
       would satisfy the assertion above and be useless. */
    const body = await bodyOf(withReplyTo);
    expect(body["reply_to"]).toBe("safety@strip.test");
  });

  it("reads it from the environment, absent when unset", () => {
    expect(mailConfigFromEnv({} as NodeJS.ProcessEnv).replyTo).toBeUndefined();
    expect(
      mailConfigFromEnv({ MAIL_REPLY_TO: "ops@strip.test" } as NodeJS.ProcessEnv).replyTo,
    ).toBe("ops@strip.test");
    /* An empty string is not an address. Left as a variable somebody
       created and never filled in, it would otherwise become a
       Reply-To of "". */
    expect(
      mailConfigFromEnv({ MAIL_REPLY_TO: "" } as NodeJS.ProcessEnv).replyTo,
    ).toBeUndefined();
  });
});

describe("trial digests", () => {
  it("report NOT_CONFIGURED rather than pretending when the key is absent", async () => {
    const outcome = await sendTrialDigest(
      { stage: 1, daysRemaining: 59, reports: 0, hazards: 0, closedActions: 0, onboardingComplete: 0 },
      "safety@example.com",
      { ...configured, apiKey: undefined },
      spyFetch(),
    );
    expect(outcome.status).toBe("NOT_CONFIGURED");
  });

  it("send plain text with an unsubscribe mailto link", async () => {
    const fetchImpl = spyFetch();
    await sendTrialDigest(
      { stage: 55, daysRemaining: 5, reports: 3, hazards: 2, closedActions: 1, onboardingComplete: 3 },
      "safety@example.com",
      configured,
      fetchImpl,
    );
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const sent = JSON.parse((call[1] as RequestInit).body as string) as {
      subject: string;
      text: string;
      html?: string;
    };
    expect(sent.subject).toContain("5 days left");
    expect(sent.text).toContain("3 reports");
    expect(sent.text).toContain("1 closed action");
    expect(sent.text).toContain("mailto:safety@usalamasms.com?subject=Unsubscribe%20trial%20emails");
    expect(sent.html).toBeUndefined();
  });

  it("names the local-only maturity caveat on the week-one message", () => {
    const text = trialDigestBody(
      { stage: 7, daysRemaining: 53, reports: 1, hazards: 0, closedActions: 0, onboardingComplete: 2 },
      configured,
    );
    expect(trialDigestSubject({
      stage: 7, daysRemaining: 53, reports: 1, hazards: 0, closedActions: 0, onboardingComplete: 2,
    })).toContain("Week 1");
    expect(text).toContain("2 of 5 onboarding steps complete");
    expect(text).toMatch(/maturity assessment is kept on the device/i);
  });
});
