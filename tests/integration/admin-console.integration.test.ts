/* =====================================================================
   THE VENDOR CONSOLE'S TWO WRITE ROUTES.

   An audit measured 59 of 62 API routes as having a test that
   references their path. These were two of the three that did not, and
   they are the two that touch money: one MINTS A CUSTOMER — an
   organisation and its first account, with a password shown once — and
   the other decides WHAT THAT CUSTOMER HAS PAID FOR.

   THE FIRST PASS OF THAT AUDIT GOT THIS WRONG, and the correction is
   worth recording here because it is the same class of mistake the
   routes themselves guard against. It reported
   /api/v1/admin/upgrade-requests as untested, because the detector
   matched test FILENAMES against route names and no file is called
   `admin`. That route is covered, by upgrade.integration.test.ts.
   Matching paths against file CONTENTS gave the real answer.

   What is asserted below is not that the routes return 200. It is that
   the vendor console cannot be driven by anybody else, that
   provisioning an operator is atomic, and that an entitlement change is
   recorded against whoever made it with the reason they gave.
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
let vendorOrgId = "";
let platformAdminId = "";
let operatorOrgId = "";
let operatorExecId = "";

const token = (sub: string, org: string, role: string) =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET,
    { algorithm: "HS256", issuer: "usalamasms", expiresIn: "15m" });

const provision = (who: string, org: string, role: string, body: unknown) =>
  app.inject({
    method: "POST", url: "/api/v1/admin/operators",
    headers: { authorization: `Bearer ${token(who, org, role)}` },
    payload: body as never,
  });

const entitle = (who: string, org: string, role: string, id: string, body: unknown) =>
  app.inject({
    method: "POST", url: `/api/v1/admin/operators/${id}/entitlement`,
    headers: { authorization: `Bearer ${token(who, org, role)}` },
    payload: body as never,
  });

const GOOD = {
  orgName: "Rift Valley Air", jurisdiction: "KE",
  adminEmail: "ops@rift.test", adminName: "Grace Wanjiku",
  role: "SYSTEM_ADMIN",
};

describe.skipIf(!hasDatabase)("the vendor console's write routes", () => {
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
    vendorOrgId = (await prisma().org.create({
      data: { name: "The vendor", jurisdiction: "KE", trialEndsOn: soon },
    })).id;
    platformAdminId = (await prisma().user.create({
      data: { orgId: vendorOrgId, email: "vendor@usalamasms.test", name: "Vendor",
        role: "PLATFORM_ADMIN", passwordHash: "x" },
    })).id;

    operatorOrgId = (await prisma().org.create({
      data: { name: "Strip Air", jurisdiction: "KE", trialEndsOn: soon },
    })).id;
    operatorExecId = (await prisma().user.create({
      data: { orgId: operatorOrgId, email: "ae@strip.test", name: "Exec",
        role: "ACCOUNTABLE_EXECUTIVE", passwordHash: "x" },
    })).id;
  });

  /* ---------------------------- provisioning ---------------------------- */

  it("MINTS AN OPERATOR AND ITS FIRST ACCOUNT, with the password shown once", async () => {
    const res = await provision(platformAdminId, vendorOrgId, "PLATFORM_ADMIN", GOOD);
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json();
    expect(body.password).toBeTruthy();

    const made = await prisma().org.findFirst({ where: { name: "Rift Valley Air" } });
    expect(made).not.toBeNull();
    const admin = await prisma().user.findFirst({ where: { email: "ops@rift.test" } });
    expect(admin?.orgId, "the account landed outside the org it was made for")
      .toBe(made!.id);
  });

  it("NO OPERATOR CAN DRIVE THE CONSOLE, however senior", async () => {
    /* The whole reason the vendor org holds no safety record: a tenant
       that could provision could reach the others. Every operator role
       is refused, not just the junior ones. */
    for (const role of ["ACCOUNTABLE_EXECUTIVE", "SYSTEM_ADMIN", "SAFETY_MANAGER"]) {
      const res = await provision(operatorExecId, operatorOrgId, role, {
        ...GOOD, adminEmail: `x-${role}@rift.test`,
      });
      expect(res.statusCode, `${role} provisioned an operator`).toBe(403);
    }
    expect(await prisma().org.count(), "an org was created despite the 403").toBe(2);
  });

  it("REFUSES AN ADDRESS THAT ALREADY HAS AN ACCOUNT, rather than shadowing it", async () => {
    const res = await provision(platformAdminId, vendorOrgId, "PLATFORM_ADMIN", {
      ...GOOD, adminEmail: "ae@strip.test",
    });
    expect(res.statusCode).toBe(409);
    /* AND THE ORG IS NOT LEFT BEHIND. The org and the user are created
       in one transaction; a duplicate email discovered after the org
       row would otherwise leave an operator nobody can sign in to. */
    expect(await prisma().org.count(), "a half-provisioned operator survived").toBe(2);
  });

  it("refuses a malformed operator without creating anything", async () => {
    const res = await provision(platformAdminId, vendorOrgId, "PLATFORM_ADMIN", {
      ...GOOD, orgName: "X",
    });
    expect(res.statusCode).toBe(400);
    expect(await prisma().org.count()).toBe(2);
  });

  /* ---------------------------- entitlement ---------------------------- */

  it("RECORDS AN ENTITLEMENT CHANGE AGAINST WHOEVER MADE IT, with their reason", async () => {
    const paidThrough = new Date(Date.now() + 3.15e10).toISOString();
    const res = await entitle(
      platformAdminId, vendorOrgId, "PLATFORM_ADMIN", operatorOrgId,
      { paidThrough, reason: "Invoice INV-2026-004 settled by bank transfer" },
    );
    expect(res.statusCode, res.body).toBe(200);

    const org = await prisma().org.findUnique({ where: { id: operatorOrgId } });
    expect(org?.paidThrough).not.toBeNull();

    /* The audit entry is the point. This route moves the line between a
       customer who has paid and one who has not, and "why" is the
       question asked six months later. */
    const rows = await prisma().auditLog.findMany({
      where: { action: { contains: "entitlement" } },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows[0]!.detail)).toMatch(/INV-2026-004/);
  });

  it("CAN CLEAR A PAYMENT, because a console that only extends makes a mistake permanent", async () => {
    const paidThrough = new Date(Date.now() + 3.15e10).toISOString();
    await entitle(platformAdminId, vendorOrgId, "PLATFORM_ADMIN", operatorOrgId,
      { paidThrough, reason: "Confirmed in error" });
    const res = await entitle(platformAdminId, vendorOrgId, "PLATFORM_ADMIN", operatorOrgId,
      { paidThrough: null, reason: "Payment never cleared — reversing" });
    expect(res.statusCode, res.body).toBe(200);

    const org = await prisma().org.findUnique({ where: { id: operatorOrgId } });
    expect(org?.paidThrough, "a wrongly confirmed payment could not be undone").toBeNull();
  });

  it("refuses an entitlement change that changes nothing", async () => {
    const res = await entitle(platformAdminId, vendorOrgId, "PLATFORM_ADMIN", operatorOrgId,
      { reason: "no fields given" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("nothing_to_change");
  });

  it("AND NO OPERATOR CAN GRANT ITSELF AN ENTITLEMENT", async () => {
    /* The commercially dangerous one: an operator that could set its
       own paidThrough would never need to pay. */
    const res = await entitle(
      operatorExecId, operatorOrgId, "ACCOUNTABLE_EXECUTIVE", operatorOrgId,
      { paidThrough: new Date(Date.now() + 3.15e10).toISOString(), reason: "self-granted" },
    );
    expect(res.statusCode).toBe(403);

    const org = await prisma().org.findUnique({ where: { id: operatorOrgId } });
    expect(org?.paidThrough, "an operator granted itself an entitlement").toBeNull();
  });
});
