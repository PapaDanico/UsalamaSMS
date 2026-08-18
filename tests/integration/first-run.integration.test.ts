/* =====================================================================
   THE SCALE THE DIGEST ROUTE REPORTS, over HTTP.

   tests/first-run.test.ts asserts the predicate. A predicate is perfect
   in a route that never calls it — the sentence this repository has now
   written twice — so what is asserted here is that
   `GET /api/v1/digest` actually counts this operator's record, counts
   only this operator's, and moves as records arrive.

   THE DEFECT THIS EXISTS FOR: /today rendered "Nothing needs you today"
   over an empty operator, because the digest correctly found nothing
   wrong and the screen had no way to tell an empty record from a clear
   one.
   ===================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";
import { establishment, nextStep } from "../../packages/shared/src/today";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;
let orgId = "";
let managerId = "";

const token = (sub: string, org: string, role: string) =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET,
    { algorithm: "HS256", issuer: "usalamasms", expiresIn: "15m" });

const digest = (who = managerId, org = orgId, role = "SAFETY_MANAGER") =>
  app.inject({
    method: "GET", url: "/api/v1/digest",
    headers: { authorization: `Bearer ${token(who, org, role)}` },
  });

describe.skipIf(!hasDatabase)("what the digest says about how much record there is", () => {
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
      data: { name: "New Air", jurisdiction: "KE",
        trialEndsOn: new Date(Date.now() + 8.64e7) },
    });
    orgId = org.id;
    managerId = (await prisma().user.create({
      data: { orgId, email: "sm@new.test", name: "Safety Manager",
        role: "SAFETY_MANAGER", passwordHash: await argon2.hash("NewPassword123!") },
    })).id;
  });

  it("A BRAND-NEW OPERATOR IS REPORTED AS EMPTY, not as clear", async () => {
    const res = await digest();
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();

    /* The digest itself is correctly empty — that was never the bug. */
    expect(body.digest.items).toHaveLength(0);
    expect(body.digest.urgency).toBeNull();

    /* And now the screen can tell why. */
    expect(body.scale, "the route reported no scale at all").toBeTruthy();
    expect(body.scale).toEqual({ reports: 0, indicators: 0, registerEntries: 0 });
    expect(establishment(body.scale)).toBe("EMPTY");
    expect(nextStep(body.scale)?.where).toBe("/report");
  });

  it("AND STOPS BEING EMPTY THE MOMENT A REPORT ARRIVES", async () => {
    /* The direction that matters: a count that never moves would satisfy
       the assertion above for ever and offer the first step to an
       operator who had taken it. */
    await prisma().safetyReport.create({
      data: {
        orgId, reporterId: managerId, clientId: "first-1", type: "HAZARD",
        title: "Loose equipment on stand 4", narrative: "Seen on the walk-round.",
        occurredAt: new Date(),
      },
    });
    const body = (await digest()).json();
    expect(body.scale.reports).toBe(1);
    expect(establishment(body.scale)).toBe("STARTED");
    expect(nextStep(body.scale)?.where).toBe("/toolkits/spi");
  });

  it("counts a RETRACTED report too, because filing and correcting is reporting", async () => {
    await prisma().safetyReport.create({
      data: {
        orgId, reporterId: managerId, clientId: "retracted-1", type: "HAZARD",
        title: "Filed twice by mistake", narrative: "Duplicate.",
        occurredAt: new Date(), retractedAt: new Date(),
      },
    });
    const body = (await digest()).json();
    expect(body.scale.reports, "a retracted report reset the operator to empty").toBe(1);
    expect(establishment(body.scale)).not.toBe("EMPTY");
  });

  it("COUNTS ONLY THIS OPERATOR'S RECORD", async () => {
    /* An operator told they are running because somebody else filed a
       report is the tenancy failure wearing an onboarding hat. */
    const other = await prisma().org.create({
      data: { name: "Lake Air", jurisdiction: "KE",
        trialEndsOn: new Date(Date.now() + 8.64e7) },
    });
    const theirManager = await prisma().user.create({
      data: { orgId: other.id, email: "sm@lake.test", name: "Their Manager",
        role: "SAFETY_MANAGER", passwordHash: await argon2.hash("NewPassword123!") },
    });
    await prisma().safetyReport.create({
      data: {
        orgId: other.id, reporterId: theirManager.id, clientId: "theirs-1",
        type: "HAZARD", title: "Their hazard", narrative: "Theirs.",
        occurredAt: new Date(),
      },
    });

    const body = (await digest()).json();
    expect(body.scale.reports, "another operator's report counted here").toBe(0);
    expect(establishment(body.scale)).toBe("EMPTY");
  });

  it("and a role that cannot read the record is refused before any of this", async () => {
    const res = await digest(managerId, orgId, "FRONTLINE");
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain("scale");
  });
});
