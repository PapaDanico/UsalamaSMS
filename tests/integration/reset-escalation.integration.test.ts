/* =====================================================================
   THE ADMINISTRATOR WHO COULD BECOME THE SAFETY MANAGER.

   `mayCreateRole` closed the mint-yourself-an-eye path, and the comment
   above it cited `/api/v1/auth/admin/reset-password` as the place that
   distinction was already respected. It was not. The reset returns the
   new password — it has to, there is no mail path to send it down — so
   the administrator finished the request holding a working credential
   for the account it had just reset.

   THIS WAS MEASURED BEFORE IT WAS FIXED, over HTTP, against this
   database, and the four lines are the whole finding:

     SYSTEM_ADMIN, own token,    GET /api/v1/export -> 403
     POST /api/v1/auth/admin/reset-password         -> 200, password returned
     POST /api/v1/auth/login as the safety manager  -> 200, role SAFETY_MANAGER
     that token,                 GET /api/v1/export -> 200, narrative in the body

   `/api/v1/export` is the entire safety record and `org.export` is a
   permission SYSTEM_ADMIN does not hold. It held it four requests later.

   So the assertions below run THE SEQUENCE, not the predicate. A unit
   test of `mayResetCredential` would have been green against a route
   that never called it — that is precisely the mistake the users suite
   next door was written to correct, and repeating it here would be
   worse than leaving the gap, because it would look like cover.
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

const MARKER = "CONFIDENTIAL-NARRATIVE-MARKER";
const ADMIN_PASSWORD = "AdminPassword123!";

let app: FastifyInstance;
let orgId = "";
let execId = "";
let adminId = "";
let managerId = "";

const token = (sub: string, org: string, role: string) =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET,
    { algorithm: "HS256", issuer: "usalamasms", expiresIn: "15m" });

const resetPassword = (who: string, role: string, userId: string) =>
  app.inject({
    method: "POST", url: "/api/v1/auth/admin/reset-password",
    headers: { authorization: `Bearer ${token(who, orgId, role)}` },
    payload: { userId },
  });

const exportAs = (bearer: string) =>
  app.inject({
    method: "GET", url: "/api/v1/export",
    headers: { authorization: `Bearer ${bearer}` },
  });

describe.skipIf(!hasDatabase)("resetting a credential you could not otherwise hold", () => {
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

    const hash = await argon2.hash(ADMIN_PASSWORD);
    execId = (await prisma().user.create({
      data: {
        orgId, email: "ae@strip.test", name: "Accountable Executive",
        role: "ACCOUNTABLE_EXECUTIVE", passwordHash: hash,
      },
    })).id;
    adminId = (await prisma().user.create({
      data: {
        orgId, email: "sa@strip.test", name: "System Admin",
        role: "SYSTEM_ADMIN", passwordHash: hash,
      },
    })).id;
    managerId = (await prisma().user.create({
      data: {
        orgId, email: "sm@strip.test", name: "Safety Manager",
        role: "SAFETY_MANAGER", passwordHash: hash,
      },
    })).id;

    await prisma().safetyReport.create({
      data: {
        orgId, reporterId: managerId, clientId: "escalation-1",
        type: "HAZARD", title: "A report the administrator may not read",
        narrative: `${MARKER} the crew reported a bird strike on rotation`,
        occurredAt: new Date(),
      },
    });
  });

  it("THE ADMINISTRATOR CANNOT READ THE RECORD WITH ITS OWN TOKEN", async () => {
    /* The baseline the whole finding is measured against. If this ever
       returns 200 the escalation below stops being an escalation and
       becomes the least of the problems. */
    const res = await exportAs(token(adminId, orgId, "SYSTEM_ADMIN"));
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain(MARKER);
  });

  it("AND CANNOT RESET THE SAFETY MANAGER TO GET ONE", async () => {
    const res = await resetPassword(adminId, "SYSTEM_ADMIN", managerId);
    expect(res.statusCode, res.body).toBe(403);
    expect(res.json().error).toBe("reset_not_permitted");
    /* The refusal has to say which door is still open, or an
       administrator reads it as the product being broken. */
    expect(res.json().message).toMatch(/accountable executive/i);
  });

  it("SO THE FULL SEQUENCE THAT REACHED THE NARRATIVES NOW STOPS AT STEP TWO", async () => {
    /* THE FINDING, RUN END TO END. Each step is the request that
       actually succeeded before the fix, in order. */
    const issued = await resetPassword(adminId, "SYSTEM_ADMIN", managerId);
    expect(issued.statusCode, "the reset was granted").toBe(403);

    /* And the account it aimed at is untouched — no password was spent
       and no session was revoked on the way to the refusal. */
    const login = await app.inject({
      method: "POST", url: "/api/v1/auth/login",
      payload: { email: "sm@strip.test", password: ADMIN_PASSWORD },
    });
    expect(login.statusCode, "the target's own password stopped working").toBe(200);

    const bearer = login.json().accessToken ?? login.json().access_token;
    const record = await exportAs(bearer);
    expect(record.statusCode).toBe(200);
    expect(record.body, "the safety manager lost their own record").toContain(MARKER);
  });

  it("nor the accountable executive, who reads narratives the admin may not", async () => {
    const res = await resetPassword(adminId, "SYSTEM_ADMIN", execId);
    expect(res.statusCode, res.body).toBe(403);
  });

  it("BUT THE RULE IS NOT A WALL — an admin still resets another admin", async () => {
    /* A rule that refused everything would satisfy every assertion
       above and leave the role unable to do the job it exists for. */
    const second = await prisma().user.create({
      data: {
        orgId, email: "sa2@strip.test", name: "Second Admin",
        role: "SYSTEM_ADMIN", passwordHash: await argon2.hash(ADMIN_PASSWORD),
      },
    });
    const res = await resetPassword(adminId, "SYSTEM_ADMIN", second.id);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().password).toBeTruthy();
  });

  it("and the accountable executive can still reset the safety manager", async () => {
    /* The legitimate path this rule leaves open, and the reason it is
       not a lockout. The executive already reads org narratives, so a
       credential for somebody who also reads them grants nothing new. */
    const res = await resetPassword(execId, "ACCOUNTABLE_EXECUTIVE", managerId);
    expect(res.statusCode, res.body).toBe(200);

    const login = await app.inject({
      method: "POST", url: "/api/v1/auth/login",
      payload: { email: "sm@strip.test", password: res.json().password },
    });
    expect(login.statusCode, "the issued password did not work").toBe(200);
  });

  it("a safety manager never reaches this route at all, for their own account or anyone's", async () => {
    /* THE ASSERTION THAT DELETED A BRANCH. The first draft of the fix
       carried a self-reset exemption — `target.id !== req.auth.sub &&`
       — so the rule would not refuse a narrative role its own
       credential. This is what it measured: the preHandler demands
       `user.manage` and refuses one step earlier, so the exemption
       could never execute. A role that DOES reach the handler is
       permitted against itself anyway, because the rule compares
       narrative access and a role always matches itself.

       Own-password changes live at `/api/v1/auth/password` while
       signed in, and `/api/v1/auth/forgot` when not. */
    const res = await resetPassword(managerId, "SAFETY_MANAGER", managerId);
    expect(res.statusCode).toBe(403);
    expect(res.json().permission, "refused by the rule rather than the door").toBe("user.manage");
  });

  it("and an administrator resetting itself is permitted by the rule, not by an exemption", async () => {
    const res = await resetPassword(adminId, "SYSTEM_ADMIN", adminId);
    expect(res.statusCode, res.body).toBe(200);
  });

  it("and a refusal writes no audit entry and revokes no session", async () => {
    /* A refusal that still revoked the target's sessions would be a
       denial of service wearing a 403 — the administrator could not
       read the narratives but could stop the safety manager doing so. */
    await prisma().refreshToken.create({
      data: {
        userId: managerId,
        tokenHash: "not-a-real-token-hash",
        expiresAt: new Date(Date.now() + 8.64e7),
      },
    });
    await resetPassword(adminId, "SYSTEM_ADMIN", managerId);

    const live = await prisma().refreshToken.count({
      where: { userId: managerId, revokedAt: null },
    });
    expect(live, "the refusal signed the target out").toBe(1);

    const rows = await prisma().auditLog.count({
      where: { orgId, action: "auth.password.reset" },
    });
    expect(rows, "a refused reset was recorded as a reset").toBe(0);
  });
});
