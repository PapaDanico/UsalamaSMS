// =====================================================================
// The operator's own copy, through the real route.
//
// The terms of use have promised this for weeks. What is asserted here
// is not that the endpoint returns rows — it is the four properties
// that make an export safe to hand somebody, each of which is a way the
// same endpoint could do real harm while looking like it worked:
//
//   · it does not carry another operator's record;
//   · it does not name the reporter of an anonymous report, by any
//     column or through the audit entries keyed to that report;
//   · it does not undo de-identification;
//   · it can be checked — the chain travels with the verdict.
//
// Plus the one that is not about the payload: taking a complete copy of
// an organisation's safety record is itself an event in that record.
// =====================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;
let orgId: string;
let otherOrgId: string;
let managerId: string;
let execId: string;
let frontlineId: string;
let adminId: string;
let otherManagerId: string;

/**
 * A fresh source address per test.
 *
 * The export limiter is 6 per minute and its counter is in-memory for
 * the life of the app, which `beforeAll` builds once — so without this
 * the suite exhausts the bucket partway through and later tests fail
 * with 429 for reasons unrelated to what they assert. That is the
 * classic route by which a real limiter gets loosened to make a test
 * suite pass, and the limit here is deliberately tight: this is the one
 * endpoint that returns every narrative the organisation holds.
 *
 * Per-caller is what production does, so an address per test is the
 * accurate simulation rather than a workaround. It keys on the PLATFORM
 * header for the same reason the login tests do — see rateLimitKey().
 */
let clientIp = "";
let testIndex = 0;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

describe.skipIf(!hasDatabase)("the operator's own copy", () => {
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
    testIndex += 1;
    clientIp = `203.0.113.${testIndex}`;
    await reset();
    const org = await prisma().org.create({ data: { name: "Design Partner AOC" } });
    const other = await prisma().org.create({ data: { name: "Competitor" } });
    orgId = org.id;
    otherOrgId = other.id;
    const mk = async (oid: string, role: string, name: string) =>
      (await prisma().user.create({
        data: {
          orgId: oid, email: `${role}.${oid}@example.test`, passwordHash: "argon2-hash-not-real",
          name, role: role as never,
        },
      })).id;
    managerId = await mk(orgId, "SAFETY_MANAGER", "Safety Manager");
    execId = await mk(orgId, "ACCOUNTABLE_EXECUTIVE", "Accountable Executive");
    frontlineId = await mk(orgId, "FRONTLINE", "Ramp Agent");
    adminId = await mk(orgId, "SYSTEM_ADMIN", "Administrator");
    otherManagerId = await mk(otherOrgId, "SAFETY_MANAGER", "Rival Safety Manager");
  });

  const get = (token: string) =>
    app.inject({
      method: "GET", url: "/api/v1/export",
      headers: { authorization: `Bearer ${token}`, "x-nf-client-connection-ip": clientIp },
    });

  const manager = () => tokenFor(managerId, orgId, "SAFETY_MANAGER");

  /**
   * File anonymously THROUGH THE REAL SYNC ROUTE.
   *
   * Deliberately not a prisma.create plus a hand-written audit entry.
   * That version asserted nothing: it wrote `userId: null` itself and
   * then checked the export returned null, which is true of any
   * endpoint and would stay green if the sync route started naming
   * anonymous reporters tomorrow. Going through the route means the
   * audit entry is written by the code that writes it in production,
   * so the assertion is about the product rather than about the test.
   */
  const fileAnonymously = async (title: string) => {
    const clientId = crypto.randomUUID();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sync/batch",
      headers: {
        authorization: `Bearer ${tokenFor(frontlineId, orgId, "FRONTLINE")}`,
        "x-nf-client-connection-ip": clientIp,
      },
      payload: {
        deviceId: "device-1234567890",
        items: [{
          clientId, entityType: "safetyReport", op: "CREATE",
          clientUpdatedAt: new Date().toISOString(),
          payload: {
            clientId, type: "HAZARD", title,
            narrative: "The northern strip has standing water after rain and nobody marked it.",
            awareAt: new Date().toISOString(), jurisdiction: "KE",
            hrcTags: [], isAnonymous: true,
          },
        }],
      },
    });
    expect(res.statusCode, `the anonymous filing did not arrive: ${res.body}`).toBe(200);
    const report = await prisma().safetyReport.findFirstOrThrow({ where: { orgId, clientId } });
    expect(report.isAnonymous, "the route did not record it as anonymous").toBe(true);
    return report;
  };

  it("REFUSES A ROLE THAT DOES NOT HOLD THE OPERATOR'S RECORD", async () => {
    for (const [id, role] of [[frontlineId, "FRONTLINE"], [adminId, "SYSTEM_ADMIN"]] as const) {
      const res = await get(tokenFor(id, orgId, role));
      expect(res.statusCode, `${role} was handed a complete copy`).toBe(403);
    }
  });

  it("SYSTEM_ADMIN is refused ON PURPOSE, and this is the reason", async () => {
    /* The administrator holds org.manage, user.manage and audit.read,
       and deliberately holds NO narrative permission — under Annex 19's
       protection provisions the technical administrator is exactly who
       confidentiality must hold against. An export is every narrative in
       one file, so granting it to that role would route around the
       whole rule in a single endpoint. */
    await prisma().safetyReport.create({
      data: {
        orgId, clientId: crypto.randomUUID(), type: "VCR", title: "Fatigue on the evening rotation",
        narrative: "I was too tired to fly the last sector and said so.", reporterId: frontlineId,
      },
    });
    const res = await get(tokenFor(adminId, orgId, "SYSTEM_ADMIN"));
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain("too tired");
  });

  it("gives it to the safety manager and to the accountable executive", async () => {
    expect((await get(manager())).statusCode).toBe(200);
    expect((await get(tokenFor(execId, orgId, "ACCOUNTABLE_EXECUTIVE"))).statusCode).toBe(200);
  });

  it("CARRIES NOTHING OF THE SECOND OPERATOR'S", async () => {
    await prisma().safetyReport.create({
      data: {
        orgId: otherOrgId, clientId: crypto.randomUUID(), type: "MOR",
        title: "Rival tail strike", narrative: "A tail strike on landing at the rival's home base.",
        reporterId: otherManagerId, occurredAt: new Date(),
      },
    });
    await prisma().safetyPolicy.create({
      data: { orgId: otherOrgId, version: 1, statement: "The rival's own safety policy statement." },
    });

    const res = await get(manager());
    expect(res.statusCode).toBe(200);
    // Asserted on the whole serialised file, not per collection: the
    // question an operator asks about an export is whether anything of
    // somebody else's is anywhere in it.
    expect(res.body).not.toContain("Rival tail strike");
    expect(res.body).not.toContain("rival's home base");
    expect(res.body).not.toContain("rival's own safety policy");
    expect(res.body).not.toContain(otherOrgId);
    expect(res.body).not.toContain(otherManagerId);
  });

  it("NAMES NO ANONYMOUS REPORTER — not in the report, not in the audit entry", async () => {
    const anon = await fileAnonymously("Standing water on the northern strip");
    // A named report by the same person, so the export legitimately
    // contains their id and the anonymous one still must not join to it.
    await prisma().safetyReport.create({
      data: {
        orgId, clientId: crypto.randomUUID(), type: "HAZARD", title: "A named report",
        narrative: "This one was filed under my own name and can be attributed.",
        reporterId: frontlineId,
      },
    });

    const body = (await get(manager())).json();
    const exported = (body.reports as Array<Record<string, unknown>>).find((r) => r.id === anon.id)!;
    expect(exported.isAnonymous).toBe(true);
    expect(exported.reporterId).toBeNull();

    /* The join C-01 closed for conflict receipts, checked here: every
       audit entry keyed to the anonymous report must carry no actor. An
       entry naming a user against that entityId is the reporter. */
    const entries = (body.auditLog as Array<Record<string, unknown>>)
      .filter((e) => e.entityId === anon.id);
    expect(entries.length, "the anonymous filing produced no audit entry at all").toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.userId, "an audit entry in the export names an anonymous reporter").toBeNull();
    }
  });

  it("DOES NOT UNDO DE-IDENTIFICATION", async () => {
    const report = await prisma().safetyReport.create({
      data: {
        orgId, clientId: crypto.randomUUID(), type: "VCR",
        title: "Approach briefing not completed",
        narrative: "I raised it with Captain Mwangi on Tuesday and nothing was done about it.",
        reporterId: frontlineId,
      },
    });
    const { deIdentifyVcr } = await import("../../apps/api/src/core");
    await deIdentifyVcr(report.id, managerId, { reviewerAcceptedResidual: true });

    const res = await get(manager());
    expect(res.statusCode).toBe(200);
    // The identifier the pipeline removed must not come back through a
    // different endpoint. An export that reverses de-identification is
    // worse than one that never existed, because the operator believes
    // the protection held.
    expect(res.body).not.toContain("Captain Mwangi");
    const exported = (res.json().reports as Array<Record<string, unknown>>)
      .find((r) => r.id === report.id)!;
    expect(exported.reporterId).toBeNull();
    expect(exported.isDeIdentified).toBe(true);
  });

  it("TELLS AN EMPTY LOG APART FROM A BROKEN ONE", async () => {
    /* verifyAuditChain reports ok:false for an org with no entries, on
       purpose — charter rule 11, so a wiped table cannot pass as a
       clean bill of health. Handed to an operator unexplained, that is
       an accusation: the first export a new operator takes has an empty
       log, and "ok: false" reads as "your record is corrupt" at exactly
       the moment they are deciding whether to trust the product.

       The verdict must not be softened, so the file names the state
       instead. */
    const body = (await get(manager())).json();
    expect(body.chain.entries).toBe(0);
    expect(body.chain.ok, "an empty chain was reported as verified").toBe(false);
    expect(body.chain.state).toBe("empty");
    expect(body.chain.note).toMatch(/nothing to verify/i);
  });

  it("CAN BE CHECKED — the chain travels with the verdict", async () => {
    await fileAnonymously("Standing water on the northern strip");
    const body = (await get(manager())).json();
    expect(body.chain.ok).toBe(true);
    expect(body.chain.state).toBe("verified");
    expect(body.chain.entries).toBe((body.auditLog as unknown[]).length);
    expect((body.auditLog as unknown[]).length).toBeGreaterThan(0);
    // Sequential, so a reader can walk it rather than trusting the order.
    const seqs = (body.auditLog as Array<{ seq: number }>).map((e) => Number(e.seq));
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  it("RECORDS THAT THE COPY WAS TAKEN", async () => {
    // An export is a disclosure event. If it leaves no trace, the
    // append-only record has a hole exactly where somebody took
    // everything.
    await get(manager());
    const entry = await prisma().auditLog.findFirst({
      where: { orgId, action: "org.export" }, orderBy: { seq: "desc" },
    });
    expect(entry, "a complete copy was taken and the record does not say so").not.toBeNull();
    expect(entry!.userId).toBe(managerId);
  });

  it("carries no password hash and no MFA secret", async () => {
    const res = await get(manager());
    expect(res.body).not.toContain("argon2-hash-not-real");
    expect(res.body).not.toContain("passwordHash");
    expect(res.body).not.toContain("mfaSecret");
  });

  it("refuses without a token", async () => {
    expect(
      (await app.inject({
        method: "GET", url: "/api/v1/export",
        headers: { "x-nf-client-connection-ip": clientIp },
      })).statusCode,
    ).toBe(401);
  });
});
