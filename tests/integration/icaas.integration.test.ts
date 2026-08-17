/* =====================================================================
   THE KCAA HANDOFF, AGAINST A REAL DATABASE.

   `tests/icaas.test.ts` covers the composer: given an action, what does
   the pack say. It cannot cover the two things that actually go wrong
   in a handoff, because both are properties of the ROUTE rather than
   the function:

     · WHO CAN SEE WHAT. An audit finding sits behind `audit.read`, and
       a SAFETY_OFFICER does not hold it while holding
       `report.read.org`. That split is the entire reason this route
       reads three models with three checks instead of gating once at
       the door — and a unit test of a pure function cannot express it,
       because the permission never reaches the function;

     · AND WHETHER "WITHHELD" AND "ABSENT" STAY APART once a real role
       is doing the reading. Collapsed, the pack tells an operator no
       CAR is linked to an action that has one, and they raise the CAP
       against the wrong finding at the Authority's portal.

   The suite that had NEITHER of these is the suite that shipped a
   feature nothing imported. Fifteen green assertions about a function
   no role could call.
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
let managerId = "";
let officerId = "";
let actionId = "";
let reportId = "";

const token = (sub: string, role: string) =>
  jwt.sign({ sub, org: orgId, role, typ: "access" }, JWT_SECRET,
    { algorithm: "HS256", issuer: "usalamasms", expiresIn: "15m" });

const get = (id: string, who: string, role: string) =>
  app.inject({
    method: "GET",
    url: `/api/v1/icaas/cap/${id}`,
    headers: { authorization: `Bearer ${token(who, role)}` },
  });

describe.skipIf(!hasDatabase)("the ICAAS handoff", () => {
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
        /* In trial, so GENERATE_DOCUMENT is available. The lapsed case
           is asserted on purpose further down. */
        trialEndsOn: new Date(Date.now() + 8.64e7),
      },
    });
    orgId = org.id;

    const m = await prisma().user.create({
      data: { orgId, email: "m@strip.test", name: "M", role: "SAFETY_MANAGER", passwordHash: "x" },
    });
    managerId = m.id;
    const o = await prisma().user.create({
      data: { orgId, email: "o@strip.test", name: "O", role: "SAFETY_OFFICER", passwordHash: "x" },
    });
    officerId = o.id;

    const r = await prisma().safetyReport.create({
      data: {
        orgId, clientId: "c-1", type: "HAZARD", title: "Displaced threshold unbriefed",
        narrative: "Crews were not briefed on the displaced threshold at Wilson.",
        awareAt: new Date(), jurisdiction: "KE", isAnonymous: false,
      },
    });
    reportId = r.id;

    const finding = await prisma().auditFinding.create({
      data: {
        orgId, auditRef: "CAR-2026-014",
        finding: "Crews not briefed on the displaced threshold.",
        ownerPost: "Safety Manager",
      },
    });

    const a = await prisma().correctiveAction.create({
      data: {
        orgId, findingId: finding.id,
        action: "Re-brief crews on the displaced threshold before night operations.",
        ownerPost: "Safety Manager",
        dueOn: new Date("2026-09-30T00:00:00.000Z"),
      },
    });
    actionId = a.id;
  });

  it("NEVER CLAIMS TO HAVE SUBMITTED ANYTHING", async () => {
    /* The assertion the whole feature exists under. An operator who
       believed a CAP reached KCAA, and then met an inspector who had
       never seen it, would have stopped chasing it. */
    const res = await get(actionId, managerId, "SAFETY_MANAGER");
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.submitsToAuthority).toBe(false);
    expect(body.portal).toBe("https://ecitizen.kcaa.or.ke");
    expect(body.source).toMatch(/no published API/i);
    expect(body.steps.length).toBeGreaterThan(3);
  });

  it("composes the pack from the record, with nothing retyped", async () => {
    const { pack } = (await get(actionId, managerId, "SAFETY_MANAGER")).json();
    expect(pack.reference).toBe("CAR-2026-014");
    expect(pack.finding).toMatch(/displaced threshold/i);
    expect(pack.action).toMatch(/Re-brief crews/);
    expect(pack.ownerPost).toBe("Safety Manager");
    expect(pack.targetDate).toMatch(/^2026-09-30/);
    expect(pack.missing).toHaveLength(0);
    expect(pack.readyToSubmit).toBe(true);
  });

  it("A SAFETY_OFFICER GETS THE PACK WITH THE FINDING WITHHELD, AND IS TOLD SO", async () => {
    /* The defect this route is shaped around. The officer may read the
       action — /api/v1/actions lists it for them — and may not read the
       finding, which /api/v1/sms/findings answers 403 for. */
    const res = await get(actionId, officerId, "SAFETY_OFFICER");
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();

    expect(body.pack.finding).toBeNull();
    expect(body.pack.reference).not.toBe("CAR-2026-014");

    /* NAMED, not silently dropped. */
    expect(body.withheld.join(" ")).toMatch(/audit finding/i);
    expect(body.withheld.join(" ")).toMatch(/audit access/i);

    /* And not describable as absent. */
    expect(body.pack.missing.join(" ")).toMatch(/cannot read it/i);
    expect(body.pack.missing.join(" ")).not.toMatch(/pick the matching one yourself/i);
    expect(body.pack.readyToSubmit).toBe(false);
  });

  it("and the manager's pack withholds nothing", async () => {
    /* The other direction — an always-withholding route would satisfy
       every assertion above and be useless. */
    const body = (await get(actionId, managerId, "SAFETY_MANAGER")).json();
    expect(body.withheld).toHaveLength(0);
  });

  it("distinguishes a genuinely unlinked action from a withheld one", async () => {
    /* An operator may raise a corrective action from their own hazard.
       For THAT action the officer's pack must say the opposite thing. */
    const own = await prisma().correctiveAction.create({
      data: {
        orgId, reportId,
        action: "Repaint the threshold markings.",
        ownerPost: "Head of Ground Operations",
        dueOn: new Date("2026-10-15T00:00:00.000Z"),
      },
    });
    const body = (await get(own.id, officerId, "SAFETY_OFFICER")).json();
    expect(body.withheld).toHaveLength(0);
    expect(body.pack.missing.join(" ")).toMatch(/pick the matching one yourself/i);
    expect(body.pack.missing.join(" ")).not.toMatch(/cannot read it/i);
  });

  it("carries evidence hashes, and never the bytes", async () => {
    await prisma().reportAttachment.create({
      data: {
        orgId, reportId, key: `${orgId}/${reportId}/e1`,
        contentType: "image/png", bytes: 3,
        sha256: "a".repeat(64), label: "Briefing sheet",
      },
    });
    const own = await prisma().correctiveAction.create({
      data: {
        orgId, reportId, action: "Repaint the threshold markings.",
        ownerPost: "Head of Ground Operations",
        dueOn: new Date("2026-10-15T00:00:00.000Z"),
      },
    });
    const body = (await get(own.id, managerId, "SAFETY_MANAGER")).json();
    expect(body.pack.evidence).toHaveLength(1);
    expect(body.pack.evidence[0].sha256).toHaveLength(64);
    expect(body.pack.evidence[0].label).toBe("Briefing sheet");
    /* A pack is a list of what to upload, not a second copy of it. */
    expect(JSON.stringify(body)).not.toMatch(/"data"/);
  });

  it("REFUSES ANOTHER OPERATOR'S ACTION AS NOT FOUND", async () => {
    const other = await prisma().org.create({
      data: { name: "Lake Air", jurisdiction: "KE", trialEndsOn: new Date(Date.now() + 8.64e7) },
    });
    const theirs = await prisma().correctiveAction.create({
      data: {
        orgId: other.id, action: "Something of theirs.", ownerPost: "Safety Manager",
        reportId: null, dueOn: new Date("2026-09-30T00:00:00.000Z"),
        findingId: (await prisma().auditFinding.create({
          data: {
            orgId: other.id, auditRef: "CAR-OTHER-1",
            finding: "Their finding.", ownerPost: "Safety Manager",
          },
        })).id,
      },
    });
    const res = await get(theirs.id, managerId, "SAFETY_MANAGER");
    expect(res.statusCode).toBe(404);
  });

  it("is behind GENERATE_DOCUMENT, so a lapsed operator meets 402 rather than 403", async () => {
    /* 402 rather than 403 is the distinction core.ts draws: this is a
       bill, not a permission. A 403 would tell a safety manager they
       are not allowed to do their job. */
    await prisma().org.update({
      where: { id: orgId },
      data: { trialEndsOn: new Date(Date.now() - 8.64e7), paidThrough: null },
    });
    const res = await get(actionId, managerId, "SAFETY_MANAGER");
    expect(res.statusCode, res.body).toBe(402);
  });
});
