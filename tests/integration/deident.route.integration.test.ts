// =====================================================================
// The de-identification route.
//
// THE PIPELINE HAD NO ROUTE. deIdentifyVcr, the reviewer friction, the
// ResidualIdentifiersError and the in-transaction audit append were all
// written and all correct, and nothing in the application could invoke
// any of it. An exported function that nothing imports typechecks and
// passes every unit test, so this repository had already shipped the
// same defect twice — routes with no server, health endpoints
// unreachable at the deployed path.
//
// What this file asserts is therefore mostly not "the scrubber works"
// (tests/deident-corpus.test.ts does that against 34 narratives). It is
// that the operation is REACHABLE, TENANT-SCOPED, PERMISSIONED, and that
// the friction cannot be bypassed by a client that simply does not ask.
// =====================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

process.env["JWT_SECRET"] = "integration-test-secret-not-a-real-one";
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

const PASSWORD = "a-sufficiently-long-test-password";

let app: FastifyInstance;
let orgId: string;
let managerToken: string;
let frontlineToken: string;
let ipIndex = 0;

/** A narrative the scrubber can clean completely. */
const CLEAN =
  "During pushback the towbar shear pin failed. The crew stopped immediately " +
  "and engineering attended. No injuries and no aircraft damage resulted.";

/** One the scrubber flags and cannot confidently remove. */
const WITH_RESIDUAL =
  "I was the only engineer on shift that night, so anyone reading this will " +
  "know it was me. Captain Mwangi asked for the defect to be deferred.";

async function login(email: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    // A fresh address per call: the login limiter is real now, and a
    // suite that exhausts its own bucket fails for reasons unrelated to
    // what it asserts.
    headers: { "x-forwarded-for": `10.1.0.${++ipIndex}` },
    payload: { email, password: PASSWORD },
  });
  expect(res.statusCode, `login failed for ${email}`).toBe(200);
  return res.json().accessToken;
}

async function createVcr(narrative: string, org = orgId): Promise<string> {
  const report = await prisma().safetyReport.create({
    data: {
      orgId: org,
      clientId: `vcr-${Math.random().toString(36).slice(2)}`,
      type: "VCR",
      title: "Confidential report",
      narrative,
      awareAt: new Date(),
      jurisdiction: "KE",
      isAnonymous: false,
    },
  });
  return report.id;
}

describe.skipIf(!hasDatabase)("the de-identification route", () => {
  beforeAll(async () => {
    migrate();
    const { build } = await import("../../apps/api/src/server");
    app = await build();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await disconnect();
  });

  beforeEach(async () => {
    await reset();
    const org = await prisma().org.create({ data: { name: "Design Partner AOC" } });
    orgId = org.id;
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    await prisma().user.createMany({
      data: [
        { orgId, email: "manager@example.test", passwordHash, name: "Safety Manager", role: "SAFETY_MANAGER" },
        { orgId, email: "ramp@example.test", passwordHash, name: "Ramp Agent", role: "FRONTLINE" },
      ],
    });
    managerToken = await login("manager@example.test");
    frontlineToken = await login("ramp@example.test");
  });

  const deidentify = (id: string, token: string, body?: unknown) =>
    app.inject({
      method: "POST",
      url: `/api/v1/reports/${id}/deidentify`,
      headers: { authorization: `Bearer ${token}` },
      payload: body ?? {},
    });

  it("IS REACHABLE AT ALL — the defect this file exists for", async () => {
    const id = await createVcr(CLEAN);
    const res = await deidentify(id, managerToken);
    expect(res.statusCode, "the de-identification pipeline is still unroutable").toBe(200);

    const after = await prisma().safetyReport.findUniqueOrThrow({ where: { id } });
    expect(after.isDeIdentified).toBe(true);
    expect(after.reporterId).toBeNull();
    expect(after.deIdentifiedNarrative).toBeTruthy();
    // The original is gone, not encrypted. Reversible de-identification
    // is a promise somebody holding a key can break.
    expect(after.narrative).not.toContain("towbar shear pin");
  });

  it("REFUSES when the scrubber left something, and says what", async () => {
    // The friction is the product. A pipeline that distributes whatever
    // the regexes happened to leave is how a confidential reporter is
    // identified by a colleague reading the bulletin.
    const id = await createVcr(WITH_RESIDUAL);
    const res = await deidentify(id, managerToken);

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("residual_identifiers");
    expect(res.json().residual.length).toBeGreaterThan(0);

    // And it did NOT half-apply. A report left de-identified with its
    // narrative replaced but the operation reported as failed is the
    // worst of both.
    const after = await prisma().safetyReport.findUniqueOrThrow({ where: { id } });
    expect(after.isDeIdentified).toBe(false);
    expect(after.narrative).toBe(WITH_RESIDUAL);
  });

  it("proceeds only when a named reviewer accepts the residual", async () => {
    const id = await createVcr(WITH_RESIDUAL);
    const res = await deidentify(id, managerToken, { acceptResidual: true });
    expect(res.statusCode).toBe(200);

    // The decision is recorded against the person who made it. That is
    // the entire justification for allowing the override to exist.
    const audit = await prisma().auditLog.findFirst({
      where: { orgId, action: "report.deidentify" },
    });
    expect(audit, "an irreversible operation was applied with no audit entry").not.toBeNull();
    expect(audit?.userId, "the audit entry does not name the reviewer").toBeTruthy();
    expect((audit?.detail as { reviewerAcceptedResidual?: boolean })?.reviewerAcceptedResidual).toBe(true);
  });

  it("refuses a role without report.deidentify.review", async () => {
    const id = await createVcr(CLEAN);
    const res = await deidentify(id, frontlineToken);
    expect(res.statusCode).toBe(403);

    const after = await prisma().safetyReport.findUniqueOrThrow({ where: { id } });
    expect(after.isDeIdentified).toBe(false);
  });

  it("CANNOT REACH ANOTHER OPERATOR'S REPORT, and does not admit it exists", async () => {
    // deIdentifyVcr takes a report id and is happy to de-identify any
    // report in the database — tenant scoping is the route's job, as it
    // is everywhere else here. Without it, one operator could destroy a
    // competitor's evidence on this shared platform.
    const other = await prisma().org.create({ data: { name: "Another Operator" } });
    const id = await createVcr(CLEAN, other.id);

    const res = await deidentify(id, managerToken);
    // 404, not 403: the two answers differ only for someone probing ids
    // that are not theirs, and the difference tells them which exist.
    expect(res.statusCode).toBe(404);

    const after = await prisma().safetyReport.findUniqueOrThrow({ where: { id } });
    expect(after.isDeIdentified, "a report in another tenancy was de-identified").toBe(false);
  });

  it("refuses a second application rather than double-scrubbing", async () => {
    const id = await createVcr(CLEAN);
    expect((await deidentify(id, managerToken)).statusCode).toBe(200);

    const again = await deidentify(id, managerToken);
    expect(again.statusCode).toBeGreaterThanOrEqual(400);

    // And the first result survived intact — a second pass must not
    // scrub the already-scrubbed copy into something else.
    const after = await prisma().safetyReport.findUniqueOrThrow({ where: { id } });
    expect(after.deIdentifiedNarrative).toBeTruthy();
  });

  it("requires authentication", async () => {
    const id = await createVcr(CLEAN);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/reports/${id}/deidentify`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });
});
