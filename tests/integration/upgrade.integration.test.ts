/* =====================================================================
   THE UPGRADE LOOP, AND THE ONE ROUTE IN THIS API THAT CROSSES TENANCY
   ON PURPOSE.

   `/api/v1/admin/upgrade-requests` does NOT call tenantWhere. It cannot:
   the requests belong to customers, and scoping it to the platform
   administrator's own organisation would return an empty list forever.

   That makes it the single most dangerous read in the product. Every
   other route in this API is safe because tenancy is enforced in SQL;
   this one is safe only because `platform.entitlement.manage` is held
   by nobody inside an operator. If that ever stops being true — a role
   gains the permission, or the guard is dropped — one operator reads
   the names, fleet sizes and subscription states of every other
   customer, and nothing in the schema would stop it.

   So the load-bearing assertion here is not that the vendor CAN read
   it. It is that an operator's own most-privileged role CANNOT.
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
let officerId = "";
let ownAdminId = "";
let vendorId = "";

const token = (sub: string, org: string, role: string) =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET,
    { algorithm: "HS256", issuer: "usalamasms", expiresIn: "15m" });

describe.skipIf(!hasDatabase)("the upgrade loop", () => {
  beforeAll(async () => {
    migrate();
    const { build } = await import("../../apps/api/src/server");
    app = await build();
    await app.ready();
  });
  afterAll(async () => { await app?.close(); await disconnect(); });

  beforeEach(async () => {
    await reset();
    /* LAPSED on purpose — this whole feature only exists for an
       operator who has hit the wall. */
    const past = new Date(Date.now() - 8.64e7);
    const org = await prisma().org.create({
      data: { name: "Strip Air", jurisdiction: "KE", trialEndsOn: past, fleetSize: 4 },
    });
    orgId = org.id;
    const other = await prisma().org.create({
      data: { name: "Lake Air", jurisdiction: "KE", trialEndsOn: past, fleetSize: 2 },
    });
    otherOrgId = other.id;

    officerId = (await prisma().user.create({
      data: { orgId, email: "o@strip.test", name: "O", role: "SAFETY_OFFICER", passwordHash: "x" },
    })).id;
    ownAdminId = (await prisma().user.create({
      data: { orgId, email: "a@strip.test", name: "A", role: "SYSTEM_ADMIN", passwordHash: "x" },
    })).id;
    vendorId = (await prisma().user.create({
      data: {
        orgId: otherOrgId, email: "v@usalamasms.test", name: "V",
        role: "PLATFORM_ADMIN", passwordHash: "x",
      },
    })).id;
  });

  const ask = (who: string, org: string, role: string) =>
    app.inject({
      method: "POST", url: "/api/v1/upgrade-request",
      headers: { authorization: `Bearer ${token(who, org, role)}` },
      payload: {},
    });

  const list = (who: string, org: string, role: string) =>
    app.inject({
      method: "GET", url: "/api/v1/admin/upgrade-requests",
      headers: { authorization: `Bearer ${token(who, org, role)}` },
    });

  it("A SAFETY OFFICER CAN ASK — the person who hits the wall is whoever was working", async () => {
    /* Not gated on a permission, deliberately. Making a safety officer
       fetch the accountable executive to press a button is the friction
       this removes. */
    const res = await ask(officerId, orgId, "SAFETY_OFFICER");
    expect(res.statusCode, res.body).toBe(202);
    const body = res.json();
    expect(body.recorded).toBe(true);
    /* Fleet of 4 resolves to a real band, so the operator is told the
       price rather than "contact us". */
    expect(body.band?.usdMonthly).toBeGreaterThan(0);
  });

  it("GRANTS NOTHING — asking is not paying", async () => {
    await ask(officerId, orgId, "SAFETY_OFFICER");
    const org = await prisma().org.findUnique({
      where: { id: orgId }, select: { paidThrough: true, trialEndsOn: true },
    });
    expect(org?.paidThrough).toBeNull();
    /* And the wall is still up: an operator who could grant their own
       entitlement by asking has a free subscription. */
    const still = await app.inject({
      method: "GET", url: "/api/v1/spi",
      headers: { authorization: `Bearer ${token(officerId, orgId, "SAFETY_OFFICER")}` },
    });
    expect(still.statusCode).toBe(402);
  });

  it("writes it to the audit chain, which is what the console reads", async () => {
    await ask(officerId, orgId, "SAFETY_OFFICER");
    const rows = await prisma().auditLog.findMany({
      where: { orgId, action: "platform.upgrade.requested" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(officerId);
  });

  it("THE OPERATOR'S OWN SYSTEM_ADMIN CANNOT READ THE REQUEST LIST", async () => {
    /* THE ASSERTION THIS FILE EXISTS FOR. That route does not scope by
       tenant, so a role inside an operator that could reach it would
       read every other customer's name, fleet size and subscription
       state. SYSTEM_ADMIN is the most privileged role an operator has. */
    await ask(officerId, orgId, "SAFETY_OFFICER");
    const res = await list(ownAdminId, orgId, "SYSTEM_ADMIN");
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toMatch(/Strip Air|Lake Air/);
  });

  it("nor can an accountable executive, or a regulator", async () => {
    for (const role of ["ACCOUNTABLE_EXECUTIVE", "REGULATOR_INSPECTOR", "SAFETY_MANAGER"]) {
      const res = await list(ownAdminId, orgId, role);
      expect(res.statusCode, `${role} reached the vendor's console`).toBe(403);
    }
  });

  it("and the vendor sees it, across tenancy, which is the point", async () => {
    /* The other direction. A route that refused everybody would satisfy
       every assertion above and be useless. */
    await ask(officerId, orgId, "SAFETY_OFFICER");
    const res = await list(vendorId, otherOrgId, "PLATFORM_ADMIN");
    expect(res.statusCode, res.body).toBe(200);
    const { requests } = res.json();
    expect(requests).toHaveLength(1);
    expect(requests[0].orgName).toBe("Strip Air");
    expect(requests[0].fleetSize).toBe(4);
    /* STILL WAITING — derived from the org's current state rather than
       stored, so it cannot be stale. */
    expect(requests[0].answered).toBe(false);
  });

  it("stops saying 'still waiting' once the entitlement is granted", async () => {
    await ask(officerId, orgId, "SAFETY_OFFICER");
    await prisma().org.update({
      where: { id: orgId },
      data: { paidThrough: new Date(Date.now() + 30 * 8.64e7) },
    });
    const { requests } = (await list(vendorId, otherOrgId, "PLATFORM_ADMIN")).json();
    expect(requests[0].answered).toBe(true);
  });
});
