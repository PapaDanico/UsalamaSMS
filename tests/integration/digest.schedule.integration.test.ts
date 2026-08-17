/* ============================================================
   THE SCHEDULED SEND, WHICH NOBODY WILL BE WATCHING.

   Everything else in this product fails in front of somebody. This runs
   at 05:00 with no session, no screen and no reader, so the only way a
   defect in it becomes visible is that a safety manager does not get
   told something — which is indistinguishable, from their side, from
   there having been nothing to tell.

   So the properties worth asserting are the ones that would be silent:

     · A MISSING KEY IS REPORTED, not treated as "nothing to send".
       Charter rule 8. A job that quietly does nothing because a
       variable is absent appears to work in every environment that has
       never sent an email, which is every environment until the morning
       one was needed;
     · IT GOES TO PEOPLE WHO CAN ACT ON IT and to nobody else. A digest
       is a list of the safety office's work, and a frontline reporter
       receiving one is both noise and a disclosure;
     · AN EMPTY DIGEST SENDS NOTHING, because a daily "nothing to
       report" is a message people stop opening;
     · ONE OPERATOR'S FAILURE DOES NOT SILENCE THE OTHERS. A run that
       throws on the first bad row has told an arbitrary subset and
       reported success for the rest.

   The provider is never contacted: fetch is injected at the mail
   boundary, so this asserts what WOULD go on the wire without anything
   going on it.
   ============================================================ */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";
import { computeDigest } from "../../apps/api/src/digest.compute";
import { sendDigest } from "../../apps/api/src/mail";
import { isWorthSending } from "../../packages/shared/src/digest";
import { can } from "../../packages/shared/src/index";

const OCCURRED = new Date("2026-08-10T06:00:00.000Z");
const NOW = new Date("2026-08-14T06:00:00.000Z");

let orgId: string;
let otherOrgId: string;

describe.skipIf(!hasDatabase)("the scheduled digest", () => {
  beforeAll(() => {
    migrate();
  });
  afterAll(async () => {
    await disconnect();
  });

  beforeEach(async () => {
    await reset();
    orgId = (await prisma().org.create({ data: { name: "Design Partner AOC" } })).id;
    otherOrgId = (await prisma().org.create({ data: { name: "Competitor" } })).id;

    const mk = (oid: string, email: string, role: string) =>
      prisma().user.create({
        data: { orgId: oid, email, passwordHash: "x", name: email, role: role as never },
      });
    await mk(orgId, "manager@a.test", "SAFETY_MANAGER");
    await mk(orgId, "ramp@a.test", "FRONTLINE");
    await mk(otherOrgId, "rival@b.test", "SAFETY_MANAGER");

    /* An occurrence nobody has told the authority about — one thing to
       say, so the digest is worth sending. */
    await prisma().safetyReport.create({
      data: {
        orgId, clientId: "c-1", type: "MOR" as never,
        title: "Runway excursion on landing roll", narrative: "x",
        occurredAt: OCCURRED, awareAt: OCCURRED,
      },
    });
  });

  /* The recipient rule, asserted against the permission matrix rather
     than against a list of role names — a role added later must be
     judged by what it may READ, not by whether somebody remembered to
     add it here. */
  it("addresses the people who may read the operator's reports, and nobody else", async () => {
    const people = await prisma().user.findMany({
      where: { orgId, active: true },
      select: { email: true, role: true },
    });
    const recipients = people
      .filter((p) => can(p.role as never, "report.read.org"))
      .map((p) => p.email);

    expect(recipients).toContain("manager@a.test");
    expect(recipients).not.toContain("ramp@a.test");
    expect(recipients).not.toContain("rival@b.test");
  });

  it("has something to say when an occurrence is unreported", async () => {
    const digest = await computeDigest(prisma() as never, orgId, NOW);
    expect(digest).toBeTruthy();
    expect(isWorthSending(digest!)).toBe(true);
    expect(digest!.items.some((i) => i.kind === "DEADLINE")).toBe(true);
  });

  /* The operator with no reports at all. A daily message saying nothing
     is the failure this rule exists to prevent. */
  it("has nothing to say for an operator with an empty record, and sends nothing", async () => {
    const digest = await computeDigest(prisma() as never, otherOrgId, NOW);
    expect(digest).toBeTruthy();
    expect(isWorthSending(digest!)).toBe(false);

    const fetchImpl = vi.fn();
    const outcome = await sendDigest(
      digest!,
      "rival@b.test",
      { apiKey: "k", baseUrl: "https://example.test", replyTo: undefined,
      from: "x@example.test" },
      fetchImpl as never,
    );
    expect(outcome.status).toBe("NOTHING_TO_SAY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  /* An org id that does not exist answers null rather than throwing, so
     one deleted operator cannot end the run for the rest. */
  it("answers null for an operator that is not there, rather than throwing", async () => {
    const digest = await computeDigest(
      prisma() as never,
      "00000000-0000-0000-0000-000000000000",
      NOW,
    );
    expect(digest).toBeNull();
  });

  /* The confidentiality boundary, asserted over the WHOLE payload that
     would go on the wire. A digest item has no field capable of holding
     free text, so this holds by construction — and it is checked anyway
     because the construction is what a future field would quietly
     change. */
  it("puts no narrative and no title into what would be transmitted", async () => {
    const digest = await computeDigest(prisma() as never, orgId, NOW);
    let body = "";
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      body = init.body;
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    });

    const outcome = await sendDigest(
      digest!,
      "manager@a.test",
      { apiKey: "k", baseUrl: "https://example.test", replyTo: undefined,
      from: "x@example.test" },
      fetchImpl as never,
    );

    expect(outcome.status).toBe("SENT");
    expect(body).not.toMatch(/runway excursion/i);
    expect(body).not.toMatch(/narrative/i);
  });

  /* Charter rule 8 at the boundary the schedule leans on: with no key,
     the outcome NAMES the absence rather than looking like silence. */
  it("reports a missing key rather than appearing to have nothing to send", async () => {
    const digest = await computeDigest(prisma() as never, orgId, NOW);
    const fetchImpl = vi.fn();
    const outcome = await sendDigest(
      digest!,
      "manager@a.test",
      { apiKey: undefined, baseUrl: "https://example.test", replyTo: undefined,
      from: "x@example.test" },
      fetchImpl as never,
    );
    expect(outcome.status).toBe("NOT_CONFIGURED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
