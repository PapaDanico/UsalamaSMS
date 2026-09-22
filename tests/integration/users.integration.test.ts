/* =====================================================================
   CREATING A COLLEAGUE, AND THE TWO BREACHES THE ROUTE STANDS BETWEEN.

   THIS FILE EXISTS BECAUSE ITS ABSENCE WAS MUTATION-PROVEN. `mayCreateRole`
   had six unit tests and they were all green against a route that did
   not call it. That is the difference between testing a FUNCTION and
   testing the WIRING, and it was measured rather than suspected:

     guard deleted outright        caught — by TS6133, an unused import.
                                   An accident of the mutation, not a control.
     guard neutered to a constant
       + orgId read from the body  `npm run check` EXIT 0, 840 tests passed.

   The second is what a real regression looks like: the import still
   used, the shape still plausible in review. It meant a SYSTEM_ADMIN
   could mint a SAFETY_MANAGER and read every narrative, AND an admin of
   one operator could create an account inside another — with the whole
   suite green.

   So the assertions below are deliberately about the ROUTE, over HTTP,
   and every one of them fails if the guard is removed.
   ===================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;
let orgId = "";
let otherOrgId = "";
let execId = "";
let adminId = "";

const token = (sub: string, org: string, role: string) =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET,
    { algorithm: "HS256", issuer: "usalamasms", expiresIn: "15m" });

/* `from` NAMES THE CALLER'S ADDRESS, and it exists because this route
   is rate limited to 20 requests per 15 minutes and the limiter keys on
   `x-nf-client-connection-ip`. `app.inject` presents the same address
   every time, so a table of validator cases exhausts the bucket and the
   run reports 429 where it means 400 — which is a test failing for a
   reason that has nothing to do with what it asserts.

   Giving each case its own address is the honest fix rather than
   raising the limit for tests: the limit stays exactly as production
   runs it, and what changes is that these are different callers, which
   is what a table of independent cases actually is. */
const create = (
  who: string, org: string, role: string, body: unknown, from = "10.0.0.1",
) =>
  app.inject({
    method: "POST", url: "/api/v1/users",
    headers: {
      authorization: `Bearer ${token(who, org, role)}`,
      "x-nf-client-connection-ip": from,
    },
    payload: body as never,
  });

describe.skipIf(!hasDatabase)("creating a colleague", () => {
  beforeAll(async () => {
    migrate();
    const { build } = await import("../../apps/api/src/server");
    app = await build();
    await app.ready();
  });
  afterAll(async () => { await app?.close(); await disconnect(); });

  beforeEach(async () => {
    await reset();
    const soon = new Date(Date.now() + 8.64e7);
    const org = await prisma().org.create({
      data: { name: "Strip Air", jurisdiction: "KE", trialEndsOn: soon },
    });
    orgId = org.id;
    const other = await prisma().org.create({
      data: { name: "Lake Air", jurisdiction: "KE", trialEndsOn: soon },
    });
    otherOrgId = other.id;

    execId = (await prisma().user.create({
      data: {
        orgId, email: "ae@strip.test", name: "AE",
        role: "ACCOUNTABLE_EXECUTIVE", passwordHash: "x",
      },
    })).id;
    adminId = (await prisma().user.create({
      data: { orgId, email: "sa@strip.test", name: "SA", role: "SYSTEM_ADMIN", passwordHash: "x" },
    })).id;
  });

  it("THE ACCOUNTABLE EXECUTIVE CAN APPOINT A SAFETY MANAGER", async () => {
    /* The single most normal act of standing an SMS up, and a subset
       rule would have refused it — the executive holds report.read.org
       and not report.triage. */
    const res = await create(execId, orgId, "ACCOUNTABLE_EXECUTIVE", {
      name: "Samuel Kiptoo", email: "sam@strip.test", role: "SAFETY_MANAGER",
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json();
    expect(body.role).toBe("SAFETY_MANAGER");
    expect(body.password).toBeTruthy();
    expect(body.passwordShownOnce).toBe(true);
  });

  it("and the account it made is in the caller's own organisation", async () => {
    await create(execId, orgId, "ACCOUNTABLE_EXECUTIVE", {
      name: "Faith Wanjiru", email: "f@strip.test", role: "FRONTLINE",
    });
    const made = await prisma().user.findFirst({
      where: { email: "f@strip.test" }, select: { orgId: true },
    });
    expect(made?.orgId).toBe(orgId);
  });

  it("AN orgId IN THE BODY IS IGNORED, so an admin cannot reach another operator", async () => {
    /* THE SECOND BREACH THE MUTATION OPENED. Two operators competing on
       the same routes share this database, and an account created inside
       the wrong one is the worst thing this product could do. The safe
       version is one where the request cannot express it — the org comes
       from the token. */
    const res = await create(execId, orgId, "ACCOUNTABLE_EXECUTIVE", {
      name: "Intruder", email: "x@lake.test", role: "FRONTLINE",
      orgId: otherOrgId,
    });
    expect(res.statusCode, res.body).toBe(201);
    const made = await prisma().user.findFirst({
      where: { email: "x@lake.test" }, select: { orgId: true },
    });
    expect(made?.orgId, "the body's orgId was honoured").toBe(orgId);
    expect(made?.orgId).not.toBe(otherOrgId);

    const inOther = await prisma().user.count({ where: { orgId: otherOrgId } });
    expect(inOther, "a user appeared in the other operator").toBe(0);
  });

  it("A SYSTEM_ADMIN CANNOT MINT ITSELF AN EYE", async () => {
    /* THE FIRST BREACH. SYSTEM_ADMIN deliberately reads no narrative —
       under Annex 19's protection provisions the technical administrator
       is exactly who confidentiality has to hold against. Creating a
       SAFETY_MANAGER, setting its password and signing in would walk
       around that without violating a single check. */
    for (const role of ["SAFETY_MANAGER", "SAFETY_OFFICER", "FRONTLINE", "INVESTIGATOR"]) {
      const res = await create(adminId, orgId, "SYSTEM_ADMIN", {
        name: "Nobody Here", email: `n-${role}@strip.test`, role,
      });
      expect(res.statusCode, `SYSTEM_ADMIN created a ${role}`).toBe(403);
      expect(res.json().message).toMatch(/narratives/i);
    }
    const leaked = await prisma().user.count({ where: { orgId, email: { contains: "n-" } } });
    expect(leaked, "an account was created despite the 403").toBe(0);
  });

  it("and can still add another administrator, so the rule is not a wall", async () => {
    /* The other direction — a rule that refused everything would satisfy
       the assertion above and make the role useless. */
    const res = await create(adminId, orgId, "SYSTEM_ADMIN", {
      name: "Second admin", email: "sa2@strip.test", role: "SYSTEM_ADMIN",
    });
    expect(res.statusCode, res.body).toBe(201);
  });

  it("REFUSES PLATFORM_ADMIN TO EVERYBODY, including the accountable executive", async () => {
    const res = await create(execId, orgId, "ACCOUNTABLE_EXECUTIVE", {
      name: "Vendor", email: "v@strip.test", role: "PLATFORM_ADMIN",
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toMatch(/supplier/i);
    expect(await prisma().user.count({ where: { email: "v@strip.test" } })).toBe(0);
  });

  it("refuses a role that does not hold user.manage at all", async () => {
    const officer = await prisma().user.create({
      data: { orgId, email: "so@strip.test", name: "SO", role: "SAFETY_OFFICER", passwordHash: "x" },
    });
    const res = await create(officer.id, orgId, "SAFETY_OFFICER", {
      name: "Nope", email: "nope@strip.test", role: "FRONTLINE",
    });
    expect(res.statusCode).toBe(403);
  });

  it("refuses a duplicate address rather than shadowing the first account", async () => {
    const res = await create(execId, orgId, "ACCOUNTABLE_EXECUTIVE", {
      name: "Clash", email: "sa@strip.test", role: "FRONTLINE",
    });
    expect(res.statusCode).toBe(409);
  });

  it("refuses email addresses that lack a dot in the domain part", async () => {
    /* The old check was `email.includes("@")`, which accepted `@`,
       `user@localhost`, `notanemail@` and similar. The new check requires
       local@domain.tld — at least one dot after the @. */
    for (const bad of ["@", "a@", "@b", "user@localhost", "notanemail@nope"]) {
      const res = await create(execId, orgId, "ACCOUNTABLE_EXECUTIVE", {
        name: "Bad email", email: bad, role: "FRONTLINE",
      });
      expect(res.statusCode, `expected 400 for ${JSON.stringify(bad)}`).toBe(400);
    }
  });

  it("records the creation in the audit chain, without the password", async () => {
    await create(execId, orgId, "ACCOUNTABLE_EXECUTIVE", {
      name: "Audited", email: "aud@strip.test", role: "FRONTLINE",
    });
    const rows = await prisma().auditLog.findMany({
      where: { orgId, action: "user.created" },
    });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0]!.detail)).not.toMatch(/password|argon2|\$2[aby]\$/i);
  });

  it("and the team list is scoped to the caller's own operator", async () => {
    await prisma().user.create({
      data: { orgId: otherOrgId, email: "them@lake.test", name: "Them", role: "FRONTLINE", passwordHash: "x" },
    });
    const res = await app.inject({
      method: "GET", url: "/api/v1/users",
      headers: { authorization: `Bearer ${token(execId, orgId, "ACCOUNTABLE_EXECUTIVE")}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toMatch(/them@lake\.test/);
  });

  /* =====================================================================
     EVERY `.co.ke` ADDRESS WAS REFUSED, WHICH IS THE WHOLE MARKET.

     This route hand-rolled an email rule whose domain half permitted
     exactly one dot, so `sam@airline.co.ke` — the ordinary shape of a
     Kenyan company address, in the market this product is built for —
     came back 400 while `x@gmail.com` went through. An operator could
     sign up as `ae@airline.co.ke`, because signup validates with Zod,
     and then add nobody from their own company.

     NO TEST COULD HAVE CAUGHT IT AND NONE DID. Every test in this file
     used a `.test` single-dot address, every layer agreed with itself,
     and the defect was found by creating a colleague in a browser
     against the real API and reading the refusal.

     So the cases below are REAL DOMAIN SHAPES rather than invented
     ones, which is the property that would have failed: a suite that
     only ever drives one shape of a value cannot see a defect in the
     others. The same sentence this repository already records about
     the `Jurisdiction` enum, one field along.
     ===================================================================== */
  const ACCEPTED = [
    ["sam@airline.co.ke", "a Kenyan company address — the home market"],
    ["ops@kenya-airways.co.ke", "a hyphenated Kenyan company address"],
    ["s@ba.co.uk", "two-label country domain, the same shape"],
    ["j@mail.icao.int", "a subdomain, which an authority's mail often is"],
    ["pilot@fly540.com", "the single-dot case, which already worked"],
    ["capt@dn.consulting", "a long TLD"],
  ] as const;

  for (const [email, why] of ACCEPTED) {
    it(`ACCEPTS ${email} — ${why}`, async () => {
      const res = await create(
        execId, orgId, "ACCOUNTABLE_EXECUTIVE",
        { name: "Colleague", email, role: "FRONTLINE" },
        `accept-${email}`,
      );
      expect(res.statusCode, res.body).toBe(201);
      expect(res.json().email).toBe(email);
    });
  }

  /* AND IT STILL REFUSES WHAT THE ORIGINAL RULE WAS WRITTEN FOR. A fix
     that accepted everything would be worse than the defect: the cost
     of a malformed address is a colleague who cannot sign in and an
     administrator who thinks they have been added. */
  const REFUSED = [
    ["", "nothing at all"],
    ["@", "the shape the very first version of this check accepted"],
    ["a@", "a local part and no domain"],
    ["@b.com", "a domain and no local part"],
    ["user@localhost", "no dot in the domain — unroutable mail"],
    ["two words@airline.co.ke", "whitespace in the local part"],
    [`${"a".repeat(250)}@airline.co.ke`, "past the RFC 5321 maximum of 254"],
  ] as const;

  for (const [email, why] of REFUSED) {
    it(`REFUSES ${JSON.stringify(email.slice(0, 24))} — ${why}`, async () => {
      const res = await create(
        execId, orgId, "ACCOUNTABLE_EXECUTIVE",
        { name: "Colleague", email, role: "FRONTLINE" },
        `refuse-${email}`,
      );
      expect(res.statusCode, res.body).toBe(400);
      expect(res.json().error).toBe("email_required");
    });
  }
});
