/* =====================================================================
   THE ONE ROUTE NO TEST TOUCHED.

   Measured on 18 August 2026: 55 routes are declared across
   apps/api/src/routes*.ts, and 54 of them appear somewhere under
   tests/. One did not — PUT /api/v1/config/logo.

   `tests/logo.test.ts` exists, and that is exactly what made the gap
   invisible: it imports `checkLogo` from packages/shared/src/logo and
   asserts the VALIDATOR. A validator can be perfect in a route that
   never calls it, and this repository has already met that shape once
   this month — the escalation finding next door in
   reset-escalation.integration.test.ts opens by saying a unit test of
   `mayResetCredential` would have been green against a route that did
   not use it.

   So every assertion here goes over HTTP. What is being asked is not
   "does checkLogo work" but "does the route reachable with curl apply
   it, gate it, and keep it inside one operator".

   THE PAYLOAD IS A LOGO ON EVERY DOCUMENT AN OPERATOR HANDS A
   REGULATOR, which is why the tenancy assertion is here rather than
   assumed from the others: a mark written into the wrong org appears
   on somebody else's audit pack.
   ===================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";
import { LOGO_MAX_CHARS } from "../../packages/shared/src/logo";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;
let orgId = "";
let managerId = "";
let officerId = "";

const token = (sub: string, org: string, role: string) =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET,
    { algorithm: "HS256", issuer: "usalamasms", expiresIn: "15m" });

/* A one-pixel PNG, so the happy path carries something a decoder would
   actually accept rather than a string that merely starts correctly. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8" +
  "z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const putLogo = (who: string, role: string, logo: unknown, org = orgId) =>
  app.inject({
    method: "PUT", url: "/api/v1/config/logo",
    headers: { authorization: `Bearer ${token(who, org, role)}` },
    payload: { logo },
  });

const logoOf = async (id: string) =>
  (await prisma().orgConfig.findUnique({ where: { orgId: id } }))?.logo ?? null;

describe.skipIf(!hasDatabase)("the mark on an operator's documents", () => {
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
    const hash = await argon2.hash("LogoPassword123!");
    managerId = (await prisma().user.create({
      data: { orgId, email: "sm@strip.test", name: "Safety Manager",
        role: "SAFETY_MANAGER", passwordHash: hash },
    })).id;
    officerId = (await prisma().user.create({
      data: { orgId, email: "so@strip.test", name: "Safety Officer",
        role: "SAFETY_OFFICER", passwordHash: hash },
    })).id;
  });

  it("STORES A MARK, and the row actually holds it afterwards", async () => {
    const res = await putLogo(managerId, "SAFETY_MANAGER", PNG);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().logo).toBe(PNG);
    expect(await logoOf(orgId), "the response echoed a mark nothing stored").toBe(PNG);
  });

  it("AND THE ROUTE APPLIES checkLogo, not just the upload screen", async () => {
    /* THE ASSERTION THIS FILE EXISTS FOR. tests/logo.test.ts proves the
       validator refuses a GIF; nothing proved the ROUTE asks it. */
    const res = await putLogo(managerId, "SAFETY_MANAGER",
      "data:image/gif;base64,R0lGODlhAQABAAAAACw=");
    expect(res.statusCode, res.body).toBe(400);
    expect(res.json().error).toBe("rejected");
    expect(await logoOf(orgId), "a refused type was stored anyway").toBeNull();
  });

  it("and refuses one over the ceiling, over HTTP rather than in the browser", async () => {
    const huge = `data:image/png;base64,${"A".repeat(LOGO_MAX_CHARS + 10)}`;
    const res = await putLogo(managerId, "SAFETY_MANAGER", huge);
    expect(res.statusCode, res.body.slice(0, 200)).toBe(400);
    expect(await logoOf(orgId)).toBeNull();
  });

  it("and refuses something that is not a data URI at all", async () => {
    const res = await putLogo(managerId, "SAFETY_MANAGER", "https://example.test/logo.png");
    expect(res.statusCode).toBe(400);
    expect(await logoOf(orgId)).toBeNull();
  });

  it("A ROLE WITHOUT config.manage CANNOT SET IT", async () => {
    const res = await putLogo(officerId, "SAFETY_OFFICER", PNG);
    expect(res.statusCode, res.body).toBe(403);
    expect(await logoOf(orgId), "a refused role's mark was stored").toBeNull();
  });

  it("CANNOT REACH ANOTHER OPERATOR'S CONFIG", async () => {
    /* The mark goes on every document handed to a regulator. One written
       into the wrong org appears on somebody else's audit pack. */
    const other = await prisma().org.create({
      data: { name: "Lake Air", jurisdiction: "KE",
        trialEndsOn: new Date(Date.now() + 8.64e7) },
    });
    await prisma().orgConfig.create({
      data: { orgId: other.id, aerodromes: [], aircraftTypes: [] },
    });

    /* A token for this operator, carrying the other operator's id. The
       route reads the org off the token, so the only thing that can go
       wrong here is the route trusting a body or a param instead. */
    const res = await putLogo(managerId, "SAFETY_MANAGER", PNG, orgId);
    expect(res.statusCode).toBe(200);
    expect(await logoOf(other.id), "the write reached the other operator").toBeNull();
  });

  it("CLEARS ONLY ON AN EXPLICIT null, never on an omitted key", async () => {
    /* An absent key is a client that predates this field. Treating it as
       "remove the logo" lets an old payload strip an operator's branding
       on its next save. */
    await putLogo(managerId, "SAFETY_MANAGER", PNG);

    const omitted = await app.inject({
      method: "PUT", url: "/api/v1/config/logo",
      headers: { authorization: `Bearer ${token(managerId, orgId, "SAFETY_MANAGER")}` },
      payload: {},
    });
    expect(omitted.statusCode).toBe(400);
    expect(await logoOf(orgId), "an omitted key wiped the mark").toBe(PNG);

    const cleared = await putLogo(managerId, "SAFETY_MANAGER", null);
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect(cleared.json().logo).toBeNull();
    expect(await logoOf(orgId)).toBeNull();
  });

  it("records that a mark was set, and never the image itself", async () => {
    /* Sixty kilobytes of base64 in a detail column makes every entry
       around it unreadable, and the bytes are already in the row the
       entry points at. */
    await putLogo(managerId, "SAFETY_MANAGER", PNG);
    const rows = await prisma().auditLog.findMany({
      where: { orgId, action: "org.logo.set" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(managerId);
    expect(JSON.stringify(rows[0]!.detail), "the image reached the audit chain")
      .not.toContain("iVBORw0KGgo");
    expect(JSON.stringify(rows[0]!.detail)).toContain("image/png");
  });

  it("and a refusal writes no audit entry", async () => {
    await putLogo(officerId, "SAFETY_OFFICER", PNG);
    const rows = await prisma().auditLog.count({ where: { orgId, action: "org.logo.set" } });
    expect(rows, "a refused upload was recorded as a set").toBe(0);
  });
});
