/* ============================================================
   WHAT AN OPERATOR CALLS ITS OWN THINGS, THROUGH THE REAL ROUTE.

   THIS SUITE EXISTS BECAUSE THE ROUTE HAD NONE. It was the only route
   file in apps/api/src with no matching suite here, and it holds the
   subtlest database semantics in the product — a defect that was found,
   fixed, and then guarded by nothing but the comment describing it:

     "`null` and not `undefined` on the update path. Prisma reads
      undefined as 'leave this column alone', so a cleared rename sent
      as undefined would silently persist the old label — the operator
      would remove a word on screen, save, reload, and find it still
      there."

   Every gate in this repository stayed green over that. Six hundred
   unit tests, two hundred and eighty-six integration tests, the claims
   gate, the wiring gate, the reachability gate — a change replacing
   `Prisma.DbNull` with `undefined` passed all of them, and the only
   thing standing between that change and a silent data defect was a
   person reading a comment.

   THAT IS THE DEFECT SHAPE THIS REPOSITORY KEEPS MEETING, one level up
   from where it usually appears: not "a check that cannot fail", but a
   FIX WITH NO CHECK AT ALL. The comment is right, the code is right,
   and neither is executed.

   WHY IT MATTERS RATHER THAN BEING TIDINESS. These are not preferences.
   A severity label is what every risk register in the operator renders,
   what a printed pack hands an auditor, and what two documents are
   compared on when somebody asks why they word the same band
   differently. An operator who removes a rename and finds it still
   there does not conclude the software has a bug — they conclude their
   own record says something they did not write.
   ============================================================ */

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
let reporterId: string;
let otherManagerId: string;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

describe.skipIf(!hasDatabase)("what an operator calls its own things", () => {
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
    const other = await prisma().org.create({ data: { name: "Somebody Else AOC" } });
    otherOrgId = other.id;
    const mk = async (org: string, email: string, role: string) =>
      (
        await prisma().user.create({
          data: { orgId: org, email, passwordHash: "x", name: email, role: role as never },
        })
      ).id;
    managerId = await mk(orgId, "manager@a.test", "SAFETY_MANAGER");
    reporterId = await mk(orgId, "ramp@a.test", "FRONTLINE");
    otherManagerId = await mk(otherOrgId, "manager@b.test", "SAFETY_MANAGER");
  });

  const manager = () => tokenFor(managerId, orgId, "SAFETY_MANAGER");
  const reporter = () => tokenFor(reporterId, orgId, "FRONTLINE");
  const otherManager = () => tokenFor(otherManagerId, otherOrgId, "SAFETY_MANAGER");

  const put = (token: string, body: unknown) =>
    app.inject({
      method: "PUT",
      url: "/api/v1/config",
      headers: { authorization: `Bearer ${token}` },
      payload: body as never,
    });

  const get = (token: string) =>
    app.inject({
      method: "GET",
      url: "/api/v1/config",
      headers: { authorization: `Bearer ${token}` },
    });

  it("writes a rename and reads it back", async () => {
    const res = await put(manager(), { severityLabels: { A_CATASTROPHIC: "Loss of hull" } });
    expect(res.statusCode).toBe(200);

    const read = await get(manager());
    expect(read.json().config.severityLabels).toMatchObject({ A_CATASTROPHIC: "Loss of hull" });
  });

  /* ============================================================
     THE ASSERTION THIS WHOLE FILE EXISTS FOR.

     Set a rename, then clear it, then READ IT BACK FROM THE DATABASE.
     Prisma treats `undefined` as "leave this column alone", so the
     naive update silently keeps the old label — the operator removes a
     word on screen, saves, reloads, and finds it still there.

     Reading back through the route rather than asserting the response
     is deliberate: the PUT returns the NORMALISED object it computed,
     which would look correct even if nothing were written. The bug
     lives between the handler and the row, so the assertion has to
     cross that boundary.
     ============================================================ */
  it("CLEARS a rename rather than silently keeping the old one", async () => {
    await put(manager(), { severityLabels: { A_CATASTROPHIC: "Loss of hull" } });
    const cleared = await put(manager(), {});
    expect(cleared.statusCode).toBe(200);

    const read = await get(manager());
    const labels = read.json().config.severityLabels;
    expect(
      labels?.["A_CATASTROPHIC"],
      "the removed rename came back — Prisma read the absence as 'leave it alone'",
    ).toBeUndefined();
  });

  /* The same property for every column the update path writes, because
     the defect is per-field: three JSON columns each carry their own
     DbNull, and getting two right and one wrong is the likeliest
     version of this mistake rather than the least likely. */
  it("clears every renameable field, not only the first one", async () => {
    await put(manager(), {
      severityLabels: { A_CATASTROPHIC: "Loss of hull" },
      likelihoodLabels: { FREQUENT: "Weekly" },
      postTitles: { ACCOUNTABLE_EXECUTIVE: "Managing Director" },
      reviewDefaultDays: 45,
    });
    await put(manager(), {});

    const config = (await get(manager())).json().config;
    expect(config.severityLabels?.["A_CATASTROPHIC"]).toBeUndefined();
    expect(config.likelihoodLabels?.["FREQUENT"]).toBeUndefined();
    expect(config.postTitles?.["ACCOUNTABLE_EXECUTIVE"]).toBeUndefined();
    expect(config.reviewDefaultDays ?? null).toBeNull();
  });

  /* THE WHOLE OBJECT IS REPLACED, which is what makes removal
     expressible as absence. A PATCH over a partial label map has no
     answer to "how do I remove a rename" that is not an empty string,
     and an empty string is exactly the value that renders a blank where
     a severity should be. */
  it("replaces the map rather than merging into it", async () => {
    await put(manager(), { severityLabels: { A_CATASTROPHIC: "Loss of hull", C_MAJOR: "Serious" } });
    await put(manager(), { severityLabels: { A_CATASTROPHIC: "Hull loss" } });

    const labels = (await get(manager())).json().config.severityLabels;
    expect(labels?.["A_CATASTROPHIC"]).toBe("Hull loss");
    expect(labels?.["C_MAJOR"], "a key absent from the new object must be gone").toBeUndefined();
  });

  it("clears a list the same way it clears a map", async () => {
    await put(manager(), { aerodromes: ["HKJK", "HKNW"] });
    expect((await get(manager())).json().config.aerodromes).toHaveLength(2);

    await put(manager(), {});
    expect((await get(manager())).json().config.aerodromes ?? []).toHaveLength(0);
  });

  /* An operator that has never opened the screen and one that opened it
     and cleared everything are the same thing — they both get what the
     product ships — so this answers rather than 404s. */
  it("answers with the shipped defaults before anything has been saved", async () => {
    const read = await get(manager());
    expect(read.statusCode).toBe(200);
    expect(read.json().config).toBeTruthy();
  });

  /* READABLE BY ANY SIGNED-IN MEMBER, deliberately. Holding a
     vocabulary behind the permission that writes it would mean a
     frontline user's risk matrix said something different from the
     safety manager's, which is worse than any confidentiality it could
     protect. */
  it("lets a frontline reporter READ the vocabulary their own matrix renders", async () => {
    await put(manager(), { severityLabels: { A_CATASTROPHIC: "Loss of hull" } });
    const read = await get(reporter());

    expect(read.statusCode).toBe(200);
    expect(read.json().config.severityLabels).toMatchObject({ A_CATASTROPHIC: "Loss of hull" });
  });

  it("refuses to let them WRITE it", async () => {
    const res = await put(reporter(), { severityLabels: { A_CATASTROPHIC: "Anything" } });
    expect(res.statusCode).toBe(403);
    expect((await get(manager())).json().config.severityLabels?.["A_CATASTROPHIC"]).toBeUndefined();
  });

  /* Renaming a severity point changes what every register in the
     operator reads as, so an auditor asking why two documents word the
     same band differently is asking a question the chain answers. */
  it("audits the rename, with the labels in the entry", async () => {
    await put(manager(), { severityLabels: { A_CATASTROPHIC: "Loss of hull" } });

    const entry = await prisma().auditLog.findFirst({
      where: { orgId, action: "org.config" },
      orderBy: { seq: "desc" },
    });
    expect(entry).toBeTruthy();
    expect(entry!.userId).toBe(managerId);
    expect(JSON.stringify(entry!.detail)).toContain("Loss of hull");
  });

  /* One operator's vocabulary is not another's, and an upsert keyed on
     the caller's org is exactly the shape that gets this wrong when
     somebody reaches for a findFirst without a tenant clause. */
  it("keeps one operator's words out of another's", async () => {
    await put(manager(), { severityLabels: { A_CATASTROPHIC: "Loss of hull" } });
    await put(otherManager(), { severityLabels: { A_CATASTROPHIC: "Total loss" } });

    expect((await get(manager())).json().config.severityLabels?.["A_CATASTROPHIC"]).toBe(
      "Loss of hull",
    );
    expect((await get(otherManager())).json().config.severityLabels?.["A_CATASTROPHIC"]).toBe(
      "Total loss",
    );
  });

  /* The NORMALISED object comes back, not the submitted one — a client
     that sent something the product does not keep should see that it
     was not kept rather than render its own copy of what it hoped it
     had saved. */
  it("answers with what was kept, not with what was sent", async () => {
    const res = await put(manager(), {
      severityLabels: { A_CATASTROPHIC: "Loss of hull" },
      somethingTheProductDoesNotKeep: "should not survive",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().config["somethingTheProductDoesNotKeep"]).toBeUndefined();
  });
});
