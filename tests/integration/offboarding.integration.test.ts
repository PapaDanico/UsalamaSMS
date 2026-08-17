/* =====================================================================
   SOMEBODY LEAVES.

   `User.active` has been in the schema since the first migration, and
   login, refresh, forgot and admin-reset all refuse an inactive
   account. Nothing ever set it false. An operator could hire and could
   not offboard: a pilot who left last month kept a working sign-in to
   the safety record of the operator they left.

   What is asserted here is NOT that a boolean flips — that is hard to
   get wrong. It is that the access actually ends, that the audit chain
   survives it, and that the two ways of making it a one-way door are
   refused.
   ===================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

const PASSWORD = "LeavingPassword123!";

let app: FastifyInstance;
let orgId = "";
let execId = "";
let adminId = "";
let leaverId = "";

const token = (sub: string, org: string, role: string) =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET,
    { algorithm: "HS256", issuer: "usalamasms", expiresIn: "15m" });

const setActive = (who: string, role: string, id: string, active: boolean) =>
  app.inject({
    method: "POST", url: `/api/v1/users/${id}/active`,
    headers: { authorization: `Bearer ${token(who, orgId, role)}` },
    payload: { active },
  });

const login = (email: string, password: string) =>
  app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password } });

describe.skipIf(!hasDatabase)("offboarding somebody who has left", () => {
  beforeAll(async () => {
    migrate();
    const { build } = await import("../../apps/api/src/server");
    app = await build();
    await app.ready();
  });
  afterAll(async () => { await app?.close(); await disconnect(); });

  beforeEach(async () => {
    await reset();
    const org = await prisma().org.create({
      data: {
        name: "Strip Air", jurisdiction: "KE",
        trialEndsOn: new Date(Date.now() + 8.64e7),
      },
    });
    orgId = org.id;
    const hash = await argon2.hash(PASSWORD);

    execId = (await prisma().user.create({
      data: { orgId, email: "ae@strip.test", name: "Accountable Executive",
        role: "ACCOUNTABLE_EXECUTIVE", passwordHash: hash },
    })).id;
    adminId = (await prisma().user.create({
      data: { orgId, email: "sa@strip.test", name: "System Admin",
        role: "SYSTEM_ADMIN", passwordHash: hash },
    })).id;
    leaverId = (await prisma().user.create({
      data: { orgId, email: "leaver@strip.test", name: "Departing Pilot",
        role: "FRONTLINE", passwordHash: hash },
    })).id;
  });

  it("THE ACCOUNT THAT COULD SIGN IN A MOMENT AGO CANNOT NOW", async () => {
    /* The whole point, and the direction that matters. Asserting only
       the flag would pass against a route that set a column nothing
       reads — which is exactly the state this replaced. */
    expect((await login("leaver@strip.test", PASSWORD)).statusCode).toBe(200);

    const res = await setActive(adminId, "SYSTEM_ADMIN", leaverId, false);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().changed).toBe(true);

    expect((await login("leaver@strip.test", PASSWORD)).statusCode).toBe(401);
  });

  it("AND EVERY LIVE SESSION IS REVOKED, or deactivation ends nothing", async () => {
    /* A refresh token minted before the offboarding still mints access
       tokens after it — the same sentence the password reset carries,
       and the reason a rotation that leaves one alive has ended
       nothing. */
    const signedIn = await login("leaver@strip.test", PASSWORD);
    const refreshToken = signedIn.json().refreshToken;

    await setActive(adminId, "SYSTEM_ADMIN", leaverId, false);

    const live = await prisma().refreshToken.count({
      where: { userId: leaverId, revokedAt: null },
    });
    expect(live, "a refresh token outlived the offboarding").toBe(0);

    const renewed = await app.inject({
      method: "POST", url: "/api/v1/auth/refresh", payload: { refreshToken },
    });
    expect(renewed.statusCode, "the old refresh token still minted a session").toBe(401);
  });

  it("the answer names the fifteen-minute window rather than claiming instant", async () => {
    /* `authenticate` verifies a signature and does not re-read the
       user, so an access token already issued outlives this by up to
       ACCESS_TTL. Reporting "signed out" flatly would be the
       quiet-failure shape this repository keeps meeting. */
    const res = await setActive(adminId, "SYSTEM_ADMIN", leaverId, false);
    expect(res.json().note).toMatch(/15 minutes/);
  });

  it("THE AUDIT CHAIN STILL VERIFIES AFTERWARDS", async () => {
    /* THE REASON THIS IS DEACTIVATION AND NOT DELETION. AuditLog.userId
       was SetNull once, and offboarding rewrote the hashed content of
       every row naming the departing person, so the chain reported
       itself altered. */
    await setActive(adminId, "SYSTEM_ADMIN", leaverId, false);

    /* Through `/api/v1/export`, which is where the product actually
       surfaces the verdict, rather than by calling the verifier — the
       question is whether an operator taking their record away is told
       the chain is sound, and that is the route that tells them. It
       needs `org.export`, which the executive holds and the
       administrator deliberately does not. */
    const verify = await app.inject({
      method: "GET", url: "/api/v1/export",
      headers: { authorization: `Bearer ${token(execId, orgId, "ACCOUNTABLE_EXECUTIVE")}` },
    });
    expect(verify.statusCode, verify.body).toBe(200);
    expect(verify.json().chain.ok, "the chain reported itself altered").toBe(true);
    expect(verify.json().chain.entries, "no audit rows were checked at all")
      .toBeGreaterThan(0);

    /* And the row is still there to be named. */
    const still = await prisma().user.findUnique({ where: { id: leaverId } });
    expect(still, "the user row was deleted rather than deactivated").not.toBeNull();
    expect(still?.active).toBe(false);
  });

  it("records the offboarding against whoever did it, and not the reason", async () => {
    await setActive(adminId, "SYSTEM_ADMIN", leaverId, false);
    const rows = await prisma().auditLog.findMany({
      where: { orgId, action: "user.deactivated" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(adminId);
    expect(rows[0]!.entityId).toBe(leaverId);
  });

  it("REFUSES TO DEACTIVATE YOU, because nobody would be left to undo it", async () => {
    const res = await setActive(adminId, "SYSTEM_ADMIN", adminId, false);
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().error).toBe("cannot_deactivate_self");

    const still = await prisma().user.findUnique({ where: { id: adminId } });
    expect(still?.active, "the refusal deactivated them anyway").toBe(true);
  });

  it("AND REFUSES THE LAST ACTIVE ACCOUNTABLE EXECUTIVE", async () => {
    /* That role signs the safety policy, and since the escalation rule
       it is also the only one that can reset a safety manager's
       credential. An operator with none cannot appoint one either —
       `mayCreateRole` will not let an administrator mint the
       replacement. */
    const res = await setActive(adminId, "SYSTEM_ADMIN", execId, false);
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().error).toBe("last_accountable_executive");
    expect(res.json().message).toMatch(/appoint the replacement first/i);
  });

  it("but allows it once a second one exists, so the rule is not a wall", async () => {
    /* The other direction. A refusal that could never be satisfied
       would make the executive permanently un-offboardable, which is
       its own defect — people do leave that post. */
    const second = await prisma().user.create({
      data: { orgId, email: "ae2@strip.test", name: "Second Executive",
        role: "ACCOUNTABLE_EXECUTIVE", passwordHash: await argon2.hash(PASSWORD) },
    });
    const res = await setActive(adminId, "SYSTEM_ADMIN", execId, false);
    expect(res.statusCode, res.body).toBe(200);
    expect(second.active).toBe(true);
  });

  it("and an INACTIVE second executive does not satisfy the rule", async () => {
    /* The counting mistake that would make the check pass while
       leaving the operator with nobody able to sign a policy. */
    await prisma().user.create({
      data: { orgId, email: "ae3@strip.test", name: "Retired Executive",
        role: "ACCOUNTABLE_EXECUTIVE", active: false,
        passwordHash: await argon2.hash(PASSWORD) },
    });
    const res = await setActive(adminId, "SYSTEM_ADMIN", execId, false);
    expect(res.statusCode, res.body).toBe(409);
  });

  it("REACTIVATES, so leaving is not permanent", async () => {
    await setActive(adminId, "SYSTEM_ADMIN", leaverId, false);
    expect((await login("leaver@strip.test", PASSWORD)).statusCode).toBe(401);

    const back = await setActive(adminId, "SYSTEM_ADMIN", leaverId, true);
    expect(back.statusCode, back.body).toBe(200);
    /* Their own password still works — reactivation is not a reset. */
    expect((await login("leaver@strip.test", PASSWORD)).statusCode).toBe(200);
  });

  it("is idempotent, and says so rather than writing a second audit entry", async () => {
    /* An audit entry per click makes the chain report activity that did
       not happen, which is the same objection as a chain that reports
       itself altered, one step milder. */
    await setActive(adminId, "SYSTEM_ADMIN", leaverId, false);
    const again = await setActive(adminId, "SYSTEM_ADMIN", leaverId, false);
    expect(again.statusCode).toBe(200);
    expect(again.json().changed).toBe(false);

    const rows = await prisma().auditLog.count({
      where: { orgId, action: "user.deactivated" },
    });
    expect(rows, "a repeat click was recorded as a second offboarding").toBe(1);
  });

  it("CANNOT REACH ANOTHER OPERATOR'S STAFF", async () => {
    const other = await prisma().org.create({
      data: { name: "Lake Air", jurisdiction: "KE",
        trialEndsOn: new Date(Date.now() + 8.64e7) },
    });
    const theirs = await prisma().user.create({
      data: { orgId: other.id, email: "them@lake.test", name: "Their Pilot",
        role: "FRONTLINE", passwordHash: await argon2.hash(PASSWORD) },
    });

    const res = await setActive(adminId, "SYSTEM_ADMIN", theirs.id, false);
    expect(res.statusCode, res.body).toBe(404);

    const still = await prisma().user.findUnique({ where: { id: theirs.id } });
    expect(still?.active, "an admin deactivated another operator's staff").toBe(true);
  });

  it("refuses a role that does not manage accounts", async () => {
    const officer = await prisma().user.create({
      data: { orgId, email: "so@strip.test", name: "Safety Officer",
        role: "SAFETY_OFFICER", passwordHash: await argon2.hash(PASSWORD) },
    });
    const res = await setActive(officer.id, "SAFETY_OFFICER", leaverId, false);
    expect(res.statusCode).toBe(403);
  });

  it("and the executive can offboard too, not only the administrator", async () => {
    const res = await setActive(execId, "ACCOUNTABLE_EXECUTIVE", leaverId, false);
    expect(res.statusCode, res.body).toBe(200);
  });
});
