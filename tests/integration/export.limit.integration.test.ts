/* ============================================================
   WHEN THE RECORD IS TOO BIG FOR ONE FILE.

   The export was the only read in this product with no bound on it.
   Twenty-three collections, none capped, assembled in memory inside a
   function with a gigabyte and a wall clock — while every sibling read
   was careful: the triage queue takes QUEUE_LIMIT and reports
   `truncated`, the register takes REGISTER_LIMIT and reports it, the
   digest takes ROW_LIMIT, the contact directory takes LIMIT.

   On a seven-report database that is invisible. On a real operator it
   is an out-of-memory or a timeout, arriving as a 502 on the single
   route whose purpose is handing a defensible record to a regulator, at
   the moment somebody is preparing for an audit.

   IT REFUSES INSTEAD OF TRUNCATING, AND THAT IS THE DESIGN DECISION
   THIS FILE EXISTS TO PIN DOWN. Every other capped read can truncate
   honestly, because a queue showing its first five hundred rows is
   still a queue and says so. An export cannot. This route's own header
   records that the fourth and realest way an export goes wrong is BY
   OMISSION — nine tenant-owned collections were once missing from it
   and nothing noticed. A silently short export is that defect
   reproduced on purpose, in a file somebody hands to an authority
   believing it complete.

   THE LIMIT IS CONFIGURABLE SO THIS SUITE CAN REACH IT. A 20,000-row
   refusal cannot be executed by a test that would have to write 20,001
   rows, and the alternative was an unproven refusal on the most
   consequential route in the product — which is the exact defect shape
   this repository keeps finding. Production sets nothing and gets the
   default.
   ============================================================ */

/* SET BEFORE THE ROUTE MODULE IS IMPORTED. The limit is read once at
   module load, so this assignment has to happen at file scope — after
   the dynamic import in beforeAll it would be too late, and the suite
   would pass against the 20,000 default by never reaching it. */
process.env["EXPORT_ROW_LIMIT"] = "3";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

const LIMIT = 3;
const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;
let orgId: string;
let managerId: string;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

describe.skipIf(!hasDatabase)("an export larger than one file", () => {
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
    managerId = (
      await prisma().user.create({
        data: {
          orgId, email: "manager@a.test", passwordHash: "x",
          name: "Manager", role: "SAFETY_MANAGER" as never,
        },
      })
    ).id;
  });

  const manager = () => tokenFor(managerId, orgId, "SAFETY_MANAGER");

  /* A fresh source address per call — the export limiter is 6 a minute
     and sharing one bucket would make these assert the limiter. */
  let probe = 0;
  const get = () =>
    app.inject({
      method: "GET",
      url: "/api/v1/export",
      headers: {
        authorization: `Bearer ${manager()}`,
        "x-nf-client-connection-ip": `203.0.113.${++probe}`,
      },
    });

  const addReports = async (n: number) => {
    for (let i = 0; i < n; i += 1) {
      await prisma().safetyReport.create({
        data: {
          orgId,
          clientId: `0000000${i}-0000-4000-8000-00000000000${i}`.slice(0, 36),
          type: "HAZARD" as never,
          title: `Bird activity ${i}`,
          narrative: "x",
        },
      });
    }
  };

  it("produces the file when every collection is within the limit", async () => {
    await addReports(LIMIT);
    const res = await get();

    expect(res.statusCode).toBe(200);
    expect(res.json().reports).toHaveLength(LIMIT);
  });

  /* THE OFF-BY-ONE THAT WOULD HAVE REFUSED A LEGITIMATE RECORD. Reading
     one row past the limit is what makes "exactly at the limit" and
     "over it" distinguishable; probing AT the limit would refuse an
     operator whose record happens to land on the number. */
  it("does not refuse a record that lands exactly on the limit", async () => {
    await addReports(LIMIT);
    expect((await get()).statusCode).toBe(200);
  });

  it("REFUSES rather than shipping a short file", async () => {
    await addReports(LIMIT + 1);
    const res = await get();

    expect(res.statusCode).toBe(413);
    const body = res.json();
    expect(body.error).toBe("too_large");
    expect(body.limit).toBe(LIMIT);
  });

  /* "Too large" with no subject sends somebody looking through
     twenty-three collections by hand. */
  it("names which collection is over, not merely that one is", async () => {
    await addReports(LIMIT + 1);
    const body = (await get()).json();

    expect(body.collections).toContain("reports");
    expect(body.message).toContain("reports");
  });

  /* THE PROPERTY THAT MATTERS MOST. A partial payload beside a 413
     would be the worst of both: a caller that ignores the status reads
     a short export as a complete one, which is the exact failure the
     refusal exists to prevent. */
  it("produces NO payload at all when it refuses", async () => {
    await addReports(LIMIT + 1);
    const body = (await get()).json();

    expect(body.reports, "a refused export must not carry rows").toBeUndefined();
    expect(body.auditLog).toBeUndefined();
    expect(body.chain).toBeUndefined();
  });

  /* An export that was refused was not taken, and the chain must not
     say it was. The audit entry is written on the success path; a
     refusal that logged one would put "a complete copy was taken" in
     the record of an operator who never received a file. */
  it("does not record a copy that was never produced", async () => {
    await addReports(LIMIT + 1);
    await get();

    const entry = await prisma().auditLog.findFirst({
      where: { orgId, action: "org.export" },
    });
    expect(entry, "a refused export was recorded as a copy taken").toBeNull();
  });

  /* The limit is per collection, not a total across them — an operator
     with three of everything is not over. */
  it("counts each collection against the limit on its own", async () => {
    await addReports(LIMIT);
    for (let i = 0; i < LIMIT; i += 1) {
      await prisma().hazard.create({
        data: { orgId, title: `Hazard ${i}`, description: "x", source: "REPORT" },
      });
    }
    expect((await get()).statusCode).toBe(200);
  });
});
