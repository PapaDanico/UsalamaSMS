/* =====================================================================
   THE NATIONAL ROLLUP, AGAINST A REAL DATABASE.

   tests/ssp.test.ts covers the arithmetic. Two things it cannot reach,
   and both are the kind CLAUDE.md says get lost in an aggregate:

     · A RETRACTED REPORT MUST STOP COUNTING. It is a tombstone — the
       row stays so the audit chain is unbroken. Counting one here
       would tell a regulator an operator is seeing events in a
       category on the strength of reports that operator has withdrawn,
       on the one screen built to be shown to that regulator. The
       retraction gate caught this before it shipped; this is the
       assertion that keeps it caught.

     · A CALLER WHO MAY NOT READ REPORTS MUST BE TOLD SO. Silently
       passing an empty tag count renders every unmeasured category as
       "nothing tagged here" when the tags exist and the reader cannot
       see them — understating the operator's position using their own
       product.
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
let frontlineId = "";

const token = (sub: string, role: string) =>
  jwt.sign({ sub, org: orgId, role, typ: "access" }, JWT_SECRET,
    { algorithm: "HS256", issuer: "usalamasms", expiresIn: "15m" });

const get = (who: string, role: string) =>
  app.inject({
    method: "GET",
    url: "/api/v1/ssp",
    headers: { authorization: `Bearer ${token(who, role)}` },
  });

const report = (tags: string[], retracted = false) =>
  prisma().safetyReport.create({
    data: {
      orgId, clientId: `c-${Math.random()}`, type: "HAZARD",
      title: "Something happened on the runway today",
      narrative: "A description long enough to satisfy the schema requirements.",
      awareAt: new Date(), jurisdiction: "KE", isAnonymous: false,
      hrcTags: tags as never,
      ...(retracted ? { retractedAt: new Date() } : {}),
    },
  });

describe.skipIf(!hasDatabase)("the SSP rollup", () => {
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
      data: { name: "Strip Air", jurisdiction: "KE", trialEndsOn: new Date(Date.now() + 8.64e7) },
    });
    orgId = org.id;
    managerId = (await prisma().user.create({
      data: { orgId, email: "m@strip.test", name: "M", role: "SAFETY_MANAGER", passwordHash: "x" },
    })).id;
    frontlineId = (await prisma().user.create({
      data: { orgId, email: "f@strip.test", name: "F", role: "FRONTLINE", passwordHash: "x" },
    })).id;
  });

  it("has a row for each national category and no score anywhere", async () => {
    const res = await get(managerId, "SAFETY_MANAGER");
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(6);
    expect(body.caveat).toMatch(/not a score/i);
    expect(Object.keys(body)).not.toContain("score");
  });

  it("A RETRACTED REPORT DOES NOT COUNT TOWARDS A CATEGORY", async () => {
    await report(["RI"]);
    await report(["RI"], true);
    const body = (await get(managerId, "SAFETY_MANAGER")).json();
    const ri = body.rows.find((r: { code: string }) => r.code === "RI");
    /* Two rows exist; one is withdrawn. The honest count is one. */
    expect(ri.reports).toBe(1);
  });

  it("and a category whose only report was retracted reads as unseen", async () => {
    await report(["CFIT"], true);
    const body = (await get(managerId, "SAFETY_MANAGER")).json();
    const cfit = body.rows.find((r: { code: string }) => r.code === "CFIT");
    expect(cfit.reports).toBe(0);
    expect(cfit.standing).toBe("UNSEEN");
  });

  it("MEASURED needs periods behind the indicator", async () => {
    const spi = await prisma().spi.create({
      data: {
        orgId, name: "Runway excursions", kind: "LOWER_CONSEQUENCE",
        exposureUnit: "movements", per: 100, direction: "LOWER_IS_BETTER",
        owner: "Safety Manager", hrc: "RE",
      },
    });
    let body = (await get(managerId, "SAFETY_MANAGER")).json();
    expect(body.rows.find((r: { code: string }) => r.code === "RE").standing).toBe("REPORTED");

    await prisma().spiPeriod.create({
      data: { orgId, spiId: spi.id, label: "2026-Q1", events: 1, exposure: 400 },
    });
    body = (await get(managerId, "SAFETY_MANAGER")).json();
    expect(body.rows.find((r: { code: string }) => r.code === "RE").standing).toBe("MEASURED");
  });

  it("NAMES THE COUNTS A ROLE CANNOT SEE rather than showing them as zero", async () => {
    /* REGULATOR_INSPECTOR IS THE ROLE WITH THIS SPLIT, and finding that
       out made the feature sharper rather than merely fixing a fixture.
       It is the ONLY role holding `spi.read` without
       `report.read.org` — the asymmetry CLAUDE.md records deliberately,
       because oversight is a question about whether the operator's own
       record is intact and not a licence to read what frontline staff
       wrote in confidence.

       So the reader most likely to meet a rollup with no report counts
       is the regulator. Without the withheld line, an inspector opens
       this and sees all six national categories reading "nothing is
       tagged against this category" — and concludes the operator is
       measuring nothing, on a page built to show the opposite. The
       silent-empty version of this endpoint would have understated an
       operator to their Authority, using the operator's own product. */
    await report(["RI"]);
    const res = await get(frontlineId, "REGULATOR_INSPECTOR");
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.withheld.join(" ")).toMatch(/report access/i);
    expect(body.withheld.join(" ")).toMatch(/unseen by you/i);
    expect(body.rows.find((r: { code: string }) => r.code === "RI").reports).toBe(0);
  });

  it("and the manager is told nothing was withheld", async () => {
    /* The other direction — an always-withholding route would satisfy
       the assertion above and be useless. */
    const body = (await get(managerId, "SAFETY_MANAGER")).json();
    expect(body.withheld).toHaveLength(0);
  });
});
