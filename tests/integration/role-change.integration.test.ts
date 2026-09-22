/* =====================================================================
   PROMOTION, AND THE ONE-CLICK BREACH IT WOULD HAVE OPENED.

   THIS FILE EXISTS FOR THE REASON `users.integration.test.ts` OPENS
   WITH, and the reason is now recorded three times in this repository:
   a validator is perfect in a route that never calls it. `mayChangeRole`
   has eleven unit tests in `rbac.test.ts` and every one of them would
   be green against a route that gated on `user.manage` and stopped.

   WHAT THAT ROUTE WOULD HAVE BEEN. The other two administrative doors
   take four requests and a password handover; this one takes one
   request and no handover at all:

     SYSTEM_ADMIN, own token, GET /api/v1/export  -> 403
     PUT /api/v1/users/<self>/role SAFETY_MANAGER -> 200
     sign in again,           GET /api/v1/export  -> every narrative

   So the assertions below are about the ROUTE, over HTTP, and they are
   deliberately driven in BOTH directions: what the guard refuses, and
   what an operator running an airline has to be able to do on an
   ordinary Tuesday. A rule that refuses everything is not a control,
   it is an outage.
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
let managerId = "";
let frontlineId = "";
let inspectorId = "";

const token = (sub: string, org: string, role: string) =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET,
    { algorithm: "HS256", issuer: "usalamasms", expiresIn: "15m" });

const move = (who: string, org: string, role: string, target: string, to: unknown) =>
  app.inject({
    method: "PUT", url: `/api/v1/users/${target}/role`,
    headers: { authorization: `Bearer ${token(who, org, role)}` },
    payload: { role: to } as never,
  });

const roleOf = async (id: string) =>
  (await prisma().user.findUnique({ where: { id }, select: { role: true } }))?.role;

describe.skipIf(!hasDatabase)("changing a colleague's role", () => {
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
    orgId = (await prisma().org.create({
      data: { name: "Strip Air", jurisdiction: "KE", trialEndsOn: soon },
    })).id;
    otherOrgId = (await prisma().org.create({
      data: { name: "Lake Air", jurisdiction: "KE", trialEndsOn: soon },
    })).id;

    const person = async (email: string, name: string, role: string, org = orgId) =>
      (await prisma().user.create({
        data: { orgId: org, email, name, role: role as never, passwordHash: "x" },
      })).id;

    execId = await person("ae@strip.test", "AE", "ACCOUNTABLE_EXECUTIVE");
    adminId = await person("sa@strip.test", "SA", "SYSTEM_ADMIN");
    managerId = await person("sm@strip.test", "SM", "SAFETY_MANAGER");
    frontlineId = await person("fo@strip.test", "FO", "FRONTLINE");
    inspectorId = await person("ri@strip.test", "RI", "REGULATOR_INSPECTOR");
  });

  /* ---- WHAT AN OPERATOR HAS TO BE ABLE TO DO ---------------------- */

  it("THE ACCOUNTABLE EXECUTIVE CAN PROMOTE A FRONTLINE REPORTER INTO THE SAFETY OFFICE", async () => {
    /* The act this route exists for. Before it, the only routes were a
       SECOND account for the same person — which makes the safety
       record attribute one reporter's filings to two identities — or an
       UPDATE by hand against production. */
    const res = await move(execId, orgId, "ACCOUNTABLE_EXECUTIVE", frontlineId, "SAFETY_OFFICER");
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.changed).toBe(true);
    expect(body.role).toBe("SAFETY_OFFICER");
    expect(body.previousRole).toBe("FRONTLINE");
    expect(await roleOf(frontlineId)).toBe("SAFETY_OFFICER");
  });

  it("AND THE PERSON IS THE SAME PERSON — no second account, no second identity", async () => {
    await move(execId, orgId, "ACCOUNTABLE_EXECUTIVE", frontlineId, "SAFETY_OFFICER");
    const rows = await prisma().user.findMany({
      where: { orgId, email: "fo@strip.test" }, select: { id: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(frontlineId);
  });

  /* ---- THE BREACH ------------------------------------------------- */

  it("AN ADMINISTRATOR CANNOT PROMOTE ITSELF INTO THE SAFETY OFFICE", async () => {
    /* Refused twice on purpose — by the self check and by the matrix —
       because the two fail for different reasons and editing one away
       should not open the door. This asserts the door, whichever lock
       answers first. */
    const res = await move(adminId, orgId, "SYSTEM_ADMIN", adminId, "SAFETY_MANAGER");
    expect([403, 409]).toContain(res.statusCode);
    expect(await roleOf(adminId)).toBe("SYSTEM_ADMIN");
  });

  it("AN ADMINISTRATOR CANNOT PROMOTE A COLLEAGUE INTO THE SAFETY OFFICE EITHER", async () => {
    /* The same escalation one step removed: mint the account, then hold
       its credential. `mayResetCredential` closes the second half, so
       this closes the first. */
    const res = await move(adminId, orgId, "SYSTEM_ADMIN", inspectorId, "SAFETY_MANAGER");
    expect(res.statusCode, res.body).toBe(403);
    expect(res.json().error).toBe("role_change_not_permitted");
    expect(res.json().message).toBeTruthy();
    expect(await roleOf(inspectorId)).toBe("REGULATOR_INSPECTOR");
  });

  it("AN ADMINISTRATOR CANNOT MOVE ANYBODY *OUT* OF THE SAFETY OFFICE", async () => {
    /* The half a destination-only guard would have missed. FRONTLINE is
       a narrative role — it reads its own reports — so demoting the
       safety manager to it is still an account the administrator is
       deliberately held away from. */
    const res = await move(adminId, orgId, "SYSTEM_ADMIN", managerId, "FRONTLINE");
    expect(res.statusCode, res.body).toBe(403);
    expect(await roleOf(managerId)).toBe("SAFETY_MANAGER");
  });

  it("AN ADMINISTRATOR CAN STILL REORGANISE THE ACCOUNTS THAT READ NOTHING", async () => {
    /* Not a vacuous pass. If this 403'd the rule would be an outage
       rather than a control: account administration is what the role is
       for, and both ends here read no narrative. */
    const res = await move(adminId, orgId, "SYSTEM_ADMIN", inspectorId, "SYSTEM_ADMIN");
    expect(res.statusCode, res.body).toBe(200);
    expect(await roleOf(inspectorId)).toBe("SYSTEM_ADMIN");
  });

  it("NOBODY CHANGES THEIR OWN ROLE — not even the accountable executive", async () => {
    /* The matrix permits the executive to move anybody to anything, so
       without the self check the one role that reads every narrative
       could make itself the account administrator and lock the operator
       out of its own safety office. */
    const res = await move(execId, orgId, "ACCOUNTABLE_EXECUTIVE", execId, "SYSTEM_ADMIN");
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().error).toBe("cannot_change_own_role");
    expect(await roleOf(execId)).toBe("ACCOUNTABLE_EXECUTIVE");
  });

  it("A ROLE WITH NO user.manage IS REFUSED BEFORE THE HANDLER", async () => {
    const res = await move(managerId, orgId, "SAFETY_MANAGER", frontlineId, "SAFETY_OFFICER");
    expect(res.statusCode, res.body).toBe(403);
    expect(await roleOf(frontlineId)).toBe("FRONTLINE");
  });

  it("PLATFORM_ADMIN IS REFUSED AS A DESTINATION — a tenant that could mint one could read the others", async () => {
    const res = await move(execId, orgId, "ACCOUNTABLE_EXECUTIVE", frontlineId, "PLATFORM_ADMIN");
    expect(res.statusCode, res.body).toBe(403);
    expect(await roleOf(frontlineId)).toBe("FRONTLINE");
  });

  /* ---- TENANCY ---------------------------------------------------- */

  it("AN ADMINISTRATOR OF ONE OPERATOR CANNOT REACH AN ACCOUNT INSIDE ANOTHER", async () => {
    /* The orgId comes from the TOKEN and is in the WHERE, so the
       request cannot express this. 404 rather than 403 deliberately: a
       403 would confirm the account exists. */
    const outsider = (await prisma().user.create({
      data: {
        orgId: otherOrgId, email: "ae@lake.test", name: "Other AE",
        role: "FRONTLINE", passwordHash: "x",
      },
    })).id;
    const res = await move(execId, orgId, "ACCOUNTABLE_EXECUTIVE", outsider, "SAFETY_MANAGER");
    expect(res.statusCode, res.body).toBe(404);
    expect(await roleOf(outsider)).toBe("FRONTLINE");
  });

  /* ---- THE ONE-WAY DOOR ------------------------------------------- */

  it("THE ONLY ACTIVE ACCOUNTABLE EXECUTIVE CANNOT BE MOVED OFF THE ROLE", async () => {
    /* Same one-way door `/api/v1/users/:id/active` refuses: that role
       signs the safety policy and is the only one that can reset the
       safety office's credential, and `mayCreateRole` will not let an
       administrator mint the replacement. */
    const second = (await prisma().user.create({
      data: {
        orgId, email: "ae2@strip.test", name: "AE2",
        role: "ACCOUNTABLE_EXECUTIVE", passwordHash: "x", active: true,
      },
    })).id;
    /* The second executive is the ACTOR, so this is not refused by the
       self check — which is the point. */
    const res = await move(second, orgId, "ACCOUNTABLE_EXECUTIVE", execId, "SAFETY_MANAGER");
    expect(res.statusCode, res.body).toBe(200);

    /* Now there is one left, and moving it is the door. */
    const last = await move(execId, orgId, "ACCOUNTABLE_EXECUTIVE", second, "SAFETY_MANAGER");
    expect(last.statusCode, last.body).toBe(409);
    expect(last.json().error).toBe("last_accountable_executive");
    expect(await roleOf(second)).toBe("ACCOUNTABLE_EXECUTIVE");
  });

  it("A DEACTIVATED EXECUTIVE DOES NOT COUNT AS THE REPLACEMENT", async () => {
    /* `active: true` in the count is the clause that matters. Without
       it an operator whose previous executive was offboarded could move
       its only working one off the role. */
    await prisma().user.create({
      data: {
        orgId, email: "gone@strip.test", name: "Gone",
        role: "ACCOUNTABLE_EXECUTIVE", passwordHash: "x", active: false,
      },
    });
    const res = await move(adminId, orgId, "SYSTEM_ADMIN", execId, "SYSTEM_ADMIN");
    /* Refused by the narrative boundary first for this actor, so drive
       it with one the matrix permits. */
    expect(res.statusCode).toBe(403);

    const second = (await prisma().user.create({
      data: {
        orgId, email: "ae3@strip.test", name: "AE3",
        role: "ACCOUNTABLE_EXECUTIVE", passwordHash: "x", active: true,
      },
    })).id;
    await move(second, orgId, "ACCOUNTABLE_EXECUTIVE", execId, "SAFETY_MANAGER");
    const last = await move(execId, orgId, "ACCOUNTABLE_EXECUTIVE", second, "FRONTLINE");
    expect(last.statusCode, last.body).toBe(409);
  });

  /* ---- THE SESSIONS, AND THE LEDGER ------------------------------- */

  it("EVERY LIVE SESSION IS REVOKED, because the role rides in the access token", async () => {
    /* `authenticate` verifies a signature and does not re-read the
       user, so without this a demoted account keeps reading narratives
       for another quarter of an hour and a promoted one is told its new
       role cannot do what it now may. */
    await prisma().refreshToken.create({
      data: {
        userId: frontlineId, tokenHash: "live-one",
        expiresAt: new Date(Date.now() + 8.64e7),
      },
    });
    const res = await move(execId, orgId, "ACCOUNTABLE_EXECUTIVE", frontlineId, "SAFETY_OFFICER");
    expect(res.statusCode, res.body).toBe(200);
    const live = await prisma().refreshToken.count({
      where: { userId: frontlineId, revokedAt: null },
    });
    expect(live).toBe(0);
    /* AND THE ANSWER NAMES THE WINDOW rather than reporting a clean
       success — an access token already issued outlives the revoke. */
    expect(res.json().note).toMatch(/15 minutes/);
  });

  it("THE AUDIT ENTRY RECORDS BOTH ENDS", async () => {
    /* "Who appointed whom to what, and what they held before" is the
       question an auditor asks of an appointment. A record of only the
       destination cannot answer it. */
    await move(execId, orgId, "ACCOUNTABLE_EXECUTIVE", frontlineId, "SAFETY_OFFICER");
    const entry = await prisma().auditLog.findFirst({
      where: { orgId, action: "user.role.changed", entityId: frontlineId },
      orderBy: { createdAt: "desc" },
    });
    expect(entry).toBeTruthy();
    const detail = entry!.detail as Record<string, unknown>;
    expect(detail["fromRole"]).toBe("FRONTLINE");
    expect(detail["toRole"]).toBe("SAFETY_OFFICER");
    expect(entry!.userId).toBe(execId);
  });

  it("A NO-OP IS IDEMPOTENT AND WRITES NOTHING TO THE CHAIN", async () => {
    /* An audit entry per click would make the chain report an
       appointment that did not happen. */
    const res = await move(execId, orgId, "ACCOUNTABLE_EXECUTIVE", frontlineId, "FRONTLINE");
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().changed).toBe(false);
    const entries = await prisma().auditLog.count({
      where: { orgId, action: "user.role.changed" },
    });
    expect(entries).toBe(0);
  });

  it("AN UNKNOWN ROLE IS A 400, not a silently ignored write", async () => {
    const res = await move(execId, orgId, "ACCOUNTABLE_EXECUTIVE", frontlineId, "CHIEF_PILOT");
    expect(res.statusCode, res.body).toBe(400);
    expect(res.json().error).toBe("unknown_role");
    expect(await roleOf(frontlineId)).toBe("FRONTLINE");
  });

  it("A MISSING BODY IS A 400 TOO", async () => {
    const res = await app.inject({
      method: "PUT", url: `/api/v1/users/${frontlineId}/role`,
      headers: { authorization: `Bearer ${token(execId, orgId, "ACCOUNTABLE_EXECUTIVE")}` },
      payload: {} as never,
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(await roleOf(frontlineId)).toBe("FRONTLINE");
  });
});
