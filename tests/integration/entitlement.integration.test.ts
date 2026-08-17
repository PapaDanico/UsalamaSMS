/* =====================================================================
   WHAT A LAPSED SUBSCRIPTION DOES, AND THE MUCH LONGER LIST OF WHAT IT
   MUST NOT DO.

   `allows(state, capability)` was written with a careful argument about
   which capabilities survive a lapse, and then had ZERO CALLERS for as
   long as it existed. The pricing page promised "the safety office
   tools pause; the reporting never does" and nothing in the API had an
   opinion. This file is the reason that sentence is now true.

   THE HALF THAT MATTERS MOST IS THE NEGATIVE HALF. A test that only
   proved triage pauses would pass just as happily against a build that
   blocked everything — including a ramp agent filing an occurrence
   with a legal reporting deadline running. So the refusals are
   asserted first and at greater length than the pause.
   ===================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

/* Set BEFORE core.ts is imported. core.ts reads its env at module
   scope and calls process.exit on a missing JWT_SECRET, so a test that
   sets this after the dynamic import dies during collection — which
   presents as "7 skipped" rather than as an error, and is how this file
   spent its first run appearing to pass by not running. */
const SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;
let orgId = "";
let managerId = "";
let frontlineId = "";

const token = (sub: string, role: string) =>
  jwt.sign({ sub, org: orgId, role, typ: "access" }, SECRET,
    { algorithm: "HS256", issuer: "usalamasms", expiresIn: "5m" });

const call = (method: string, url: string, who: string, body?: unknown) =>
  app.inject({
    method: method as never, url,
    headers: { authorization: `Bearer ${who}`, "content-type": "application/json" },
    payload: body as never,
  });

const manager = () => token(managerId, "SAFETY_MANAGER");
const frontline = () => token(frontlineId, "FRONTLINE");

/** Move the org's clock so every date is comfortably in the past. */
async function lapse() {
  await prisma().org.update({
    where: { id: orgId },
    data: {
      trialEndsOn: new Date("2020-01-01T00:00:00.000Z"),
      paidThrough: null,
    },
  });
}
async function payUp() {
  await prisma().org.update({
    where: { id: orgId },
    data: { paidThrough: new Date(Date.now() + 30 * 86_400_000) },
  });
}

describe.skipIf(!hasDatabase)("entitlement, against the real routes", () => {
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
        name: "Lapsed Air", jurisdiction: "KE", fleetSize: 4,
        trialEndsOn: new Date(Date.now() + 10 * 86_400_000),
      },
    });
    orgId = org.id;
    const m = await prisma().user.create({
      data: { orgId, email: "m@lapsed.test", name: "M", role: "SAFETY_MANAGER", passwordHash: "x" },
    });
    managerId = m.id;
    const f = await prisma().user.create({
      data: { orgId, email: "f@lapsed.test", name: "F", role: "FRONTLINE", passwordHash: "x" },
    });
    frontlineId = f.id;
  });

  /* ---------------- the refusals, which are the point -------------- */

  it("A LAPSED SUBSCRIPTION NEVER STOPS SOMEBODY FILING A REPORT", async () => {
    /* The deadline under L.N. 32 runs whatever our invoice is doing.
       Blocking here would put this product between an operator and a
       legal obligation, with the operator still in breach. */
    await lapse();
    const clientId = "11111111-1111-4111-8111-111111111111";
    const res = await call("POST", "/api/v1/sync/batch", frontline(), {
      deviceId: "device-1234567890",
      items: [{
        clientId, entityType: "safetyReport", op: "CREATE",
        clientUpdatedAt: new Date().toISOString(),
        payload: {
          clientId, type: "HAZARD", title: "Birds on the threshold",
          narrative: "A flock crossed the approach for a third morning running.",
          awareAt: new Date().toISOString(), jurisdiction: "KE",
          hrcTags: [], isAnonymous: false,
        },
      }],
    });
    expect(res.statusCode, res.body).toBeLessThan(400);
    /* AND IT REALLY LANDED. A 2xx from a route that silently dropped
       the item would satisfy the line above while the report went
       nowhere — which is the failure this whole test exists to rule
       out, so the row is read back. */
    const stored = await prisma().safetyReport.findFirst({
      where: { orgId, clientId }, select: { title: true },
    });
    expect(stored?.title).toBe("Birds on the threshold");
  });

  it("and never withholds the operator's own record on the way out", async () => {
    await lapse();
    const res = await call("GET", "/api/v1/export", manager());
    /* 403 would mean the ROLE cannot export, which is a different
       question and a legitimate answer for some roles. 402 would mean
       we are holding the record hostage, and that is the one this
       asserts can never happen. */
    expect(res.statusCode).not.toBe(402);
  });

  it("and a reporter can still read their own reports", async () => {
    await lapse();
    const res = await call("GET", "/api/v1/reports/queue", frontline());
    expect(res.statusCode).not.toBe(402);
  });

  /* ---------------- the pause, which is what is sold --------------- */

  it("PAUSES the safety office's working surfaces, and says what still works", async () => {
    await lapse();
    const res = await call("POST", "/api/v1/spi", manager(), {
      name: "Rejected takeoffs", kind: "OUTCOME", direction: "LOWER_IS_BETTER",
      per: 1000, exposureUnit: "departures", target: 2,
    });
    expect(res.statusCode).toBe(402);
    const body = res.json();
    expect(body.error).toBe("subscription_lapsed");
    expect(body.state).toBe("LAPSED");
    /* The response names the three things that still work, so the
       screen can say something true rather than "forbidden". */
    expect(body.stillAvailable).toContain("FILE_REPORT");
    expect(body.stillAvailable).toContain("EXPORT_OWN_RECORD");
  });

  it("and the SAME call succeeds once the invoice is confirmed", async () => {
    /* The direction a one-sided test would miss: a gate that always
       said 402 would pass every assertion above. */
    await lapse();
    const before = await call("POST", "/api/v1/register", manager(), {
      hazard: "Displaced threshold not briefed",
      consequence: "Runway excursion on landing",
      likelihood: "OCCASIONAL", severity: "C_MAJOR", controls: "Crew briefing",
    });
    expect(before.statusCode).toBe(402);

    await payUp();
    const after = await call("POST", "/api/v1/register", manager(), {
      hazard: "Displaced threshold not briefed",
      consequence: "Runway excursion on landing",
      likelihood: "OCCASIONAL", severity: "C_MAJOR", controls: "Crew briefing",
    });
    expect(after.statusCode, after.body).not.toBe(402);
  });

  it("A TRIAL IS NOT A LAPSE — everything works during one", async () => {
    /* The org is created with a live trial and nothing else. An
       entitlement check that read "not paid" as "lapsed" would lock out
       every operator on day one, which is the most expensive possible
       version of this bug. */
    const res = await call("POST", "/api/v1/spi", manager(), {
      name: "Ground damage events", kind: "OUTCOME", direction: "LOWER_IS_BETTER",
      per: 1000, exposureUnit: "movements", target: 1,
    });
    expect(res.statusCode, res.body).not.toBe(402);
  });

  it("AN ORG WITH NO DATES AT ALL IS IN TRIAL, NOT LAPSED", async () => {
    /* THE CASE THAT BROKE SEVEN OTHER SUITES, and which this file did
       not cover until a mutation walked straight through it: every
       fixture here creates an org WITH a trial date, so reading a null
       date as the epoch passed every assertion above while making
       every organisation created before the console existed instantly
       LAPSED.

       An operator who was never granted a trial has not used one up.
       The trial runs from createdAt, so an org made moments ago is on
       its first day of thirty. */
    await prisma().org.update({
      where: { id: orgId },
      data: { trialEndsOn: null, paidThrough: null },
    });
    const res = await call("POST", "/api/v1/spi", manager(), {
      name: "Runway excursions", kind: "OUTCOME", direction: "LOWER_IS_BETTER",
      per: 1000, exposureUnit: "movements", target: 1,
    });
    expect(res.statusCode, res.body).not.toBe(402);
  });

  it("but an org created long ago with no dates HAS used its trial up", async () => {
    /* The other direction, so "derive from createdAt" cannot quietly
       become "never lapse". */
    await prisma().org.update({
      where: { id: orgId },
      data: {
        trialEndsOn: null, paidThrough: null,
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });
    const res = await call("POST", "/api/v1/spi", manager(), {
      name: "Runway excursions", kind: "OUTCOME", direction: "LOWER_IS_BETTER",
      per: 1000, exposureUnit: "movements", target: 1,
    });
    expect(res.statusCode).toBe(402);
  });

  it("and GRACE behaves exactly like ACTIVE", async () => {
    /* A grace period that degrades the product has already done the
       damage it exists to prevent. */
    await prisma().org.update({
      where: { id: orgId },
      data: {
        trialEndsOn: new Date("2020-01-01T00:00:00.000Z"),
        paidThrough: new Date(Date.now() - 3 * 86_400_000),
      },
    });
    const res = await call("POST", "/api/v1/spi", manager(), {
      name: "Bird strikes", kind: "OUTCOME", direction: "LOWER_IS_BETTER",
      per: 1000, exposureUnit: "movements", target: 1,
    });
    expect(res.statusCode, res.body).not.toBe(402);
  });
});
