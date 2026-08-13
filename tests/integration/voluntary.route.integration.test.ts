/* ============================================================
   REGULATION 13, through the real route and a real Postgres.

   The product offered a "voluntary and confidential" report type for
   months and stated none of what regulation 13 requires such a system
   to be or define. packages/shared/src/voluntary.ts carries the
   requirement text and its unit suite checks it; these checks are
   about the half that only a database can answer — that an operator's
   own answers are held, held once, and not silently erased by the next
   edit.

   THE INVARIANT WORTH MOST HERE is the partial write: an operator
   defines a voluntary scheme over days, not in one sitting, and an
   edit to one field must not erase the others. It is the same shape as
   the server read that overwrote the device's register.

   Written first in the belief that it caught a naive `...body.data`
   spread. It does not — zod's `.optional()` omits an absent key rather
   than setting it undefined, so that spread was never the hazard, and
   the mutation said so. The check stays because the property is real
   and its guarantee is INCIDENTAL: it rests on the schema staying
   `.optional()`, on Prisma ignoring absent keys, and on nobody adding
   a default. A property worth holding is worth pinning even on a day
   when the code cannot violate it.
   ============================================================ */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { VOLUNTARY_REQUIREMENTS, unanswered } from "../../packages/shared/src/voluntary";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;
let orgId: string;
let otherOrgId: string;
let managerId: string;
let frontlineId: string;
let otherManagerId: string;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

describe.skipIf(!hasDatabase)("the voluntary reporting scheme, through the real route", () => {
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
    const other = await prisma().org.create({ data: { name: "Competitor" } });
    orgId = org.id;
    otherOrgId = other.id;

    const mk = async (email: string, role: string, oid: string) =>
      (
        await prisma().user.create({
          data: { orgId: oid, email, passwordHash: "x", name: email, role: role as never },
        })
      ).id;

    managerId = await mk("manager@a.test", "SAFETY_MANAGER", orgId);
    frontlineId = await mk("frontline@a.test", "FRONTLINE", orgId);
    otherManagerId = await mk("manager@b.test", "SAFETY_MANAGER", otherOrgId);
  });

  const post = (token: string, body: unknown) =>
    app.inject({
      method: "POST", url: "/api/v1/sms/voluntary",
      headers: { authorization: `Bearer ${token}` }, payload: body as never,
    });
  const get = (token: string) =>
    app.inject({ method: "GET", url: "/api/v1/sms/voluntary", headers: { authorization: `Bearer ${token}` } });

  it("has no scheme until one is defined, and says so plainly", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    expect((await get(manager)).json().scheme).toBeNull();
  });

  it("holds the operator's own answers and reads them back", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const res = await post(manager, {
      objective: "To find hazards before they bite, without anybody being blamed.",
      contactPost: "Safety Manager",
    });
    expect(res.statusCode).toBe(200);

    const scheme = (await get(manager)).json().scheme;
    expect(scheme.objective).toContain("before they bite");
    expect(scheme.contactPost).toBe("Safety Manager");
  });

  it("A PARTIAL EDIT DOES NOT ERASE WHAT IT DID NOT MENTION", async () => {
    /* The property, stated against the ROUTE rather than against any
       particular implementation of it.

       WHAT THIS CHECK IS NOT. It was written believing it caught a
       naive `...body.data` spread erasing absent fields, and the
       mutation showed it does not: zod's `.optional()` omits an absent
       key rather than setting it undefined, so that spread is safe and
       the comment was wrong. The check is kept because the PROPERTY
       matters and its guarantee is incidental — it rests on the schema
       staying `.optional()` rather than `.nullable()`, on Prisma's
       update ignoring absent keys, and on nobody adding a default. Any
       of those changing turns editing the objective into erasing the
       contacting manager, silently, in a definition an inspector
       reads. That is worth a check even when today's code cannot fail
       it. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    await post(manager, {
      objective: "First draft.",
      contactPost: "Safety Manager",
      whoMayReport: "Anyone, including contractors.",
    });
    await post(manager, { objective: "Second draft, better." });

    const scheme = (await get(manager)).json().scheme;
    expect(scheme.objective).toBe("Second draft, better.");
    expect(scheme.contactPost, "the contacting manager was erased by an unrelated edit").toBe(
      "Safety Manager",
    );
    expect(scheme.whoMayReport).toContain("contractors");
  });

  it("KEEPS EXACTLY ONE SCHEME PER OPERATOR", async () => {
    /* A voluntary system defined twice and differently is the thing an
       inspector finds. Enforced by a unique constraint as well as by
       the upsert, because the route is not the only way in. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    await post(manager, { objective: "One." });
    await post(manager, { objective: "Two." });
    await post(manager, { scope: "All flight operations." });

    expect(await prisma().voluntaryScheme.count({ where: { orgId } })).toBe(1);
  });

  it("ANOTHER OPERATOR'S SCHEME IS NOT VISIBLE", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const stranger = tokenFor(otherManagerId, otherOrgId, "SAFETY_MANAGER");
    await post(manager, { objective: "Ours." });

    expect((await get(stranger)).json().scheme).toBeNull();
    expect((await get(manager)).json().scheme.objective).toBe("Ours.");
  });

  it("a frontline reporter may read the scheme but not define it", async () => {
    /* Deliberate, and the opposite judgement to the indicators. A
       voluntary system that its own reporters cannot read has not been
       communicated, and 13(3)(c) and (d) exist precisely so a reporter
       knows whether and when to use it. Defining it is the safety
       manager's act. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const frontline = tokenFor(frontlineId, orgId, "FRONTLINE");
    await post(manager, { objective: "Ours." });

    expect((await get(frontline)).statusCode).toBe(200);
    expect((await post(frontline, { objective: "Mine." })).statusCode).toBe(403);
  });

  it("REFUSES A WRITE THAT DEFINES NOTHING", async () => {
    // An empty body would append an audit entry recording that somebody
    // defined the scheme, having defined nothing.
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    expect((await post(manager, {})).statusCode).toBe(400);
    expect(await prisma().voluntaryScheme.count({ where: { orgId } })).toBe(0);
  });

  it("appends an audit entry naming which fields were defined", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    await post(manager, { objective: "Ours.", scope: "All operations." });
    const entry = await prisma().auditLog.findFirstOrThrow({
      where: { orgId, action: "voluntary.define" },
    });
    expect(JSON.stringify(entry.detail)).toContain("objective");
  });

  it("STILL REPORTS THE UNDEFINED ONES AS UNDEFINED, computed from what is stored", async () => {
    /* The join between this table and the shared requirement list.
       Regulation 13(3) is not scored: two of six answered is not a
       third of a voluntary system, and the product must keep saying
       which four are missing rather than reporting a fraction. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    await post(manager, { objective: "Ours.", contactPost: "Safety Manager" });
    const scheme = (await get(manager)).json().scheme;

    const byCite: Record<string, string | undefined> = {
      "13(3)(a)": scheme.objective,
      "13(3)(b)": scheme.scope,
      "13(3)(c)": scheme.whoMayReport,
      "13(3)(d)": scheme.whenToReport,
      "13(3)(e)": scheme.howProcessed,
      "13(3)(f)": scheme.contactPost,
    };
    const left = unanswered(byCite);
    expect(left).toHaveLength(VOLUNTARY_REQUIREMENTS.length - 2);
    expect(left.map((r) => r.cite)).toContain("13(3)(e)");
  });

  it("requires a token", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/sms/voluntary" })).statusCode,
    ).toBe(401);
  });
});
