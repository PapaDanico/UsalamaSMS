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

const create = (who: string, org: string, role: string, body: unknown) =>
  app.inject({
    method: "POST", url: "/api/v1/users",
    headers: { authorization: `Bearer ${token(who, org, role)}` },
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
});
