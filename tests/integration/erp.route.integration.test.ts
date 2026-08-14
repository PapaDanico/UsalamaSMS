/* ============================================================
   THE EMERGENCY CONTACT DIRECTORY, through the real route.

   erp.test.ts holds the freshness arithmetic. The two properties only a
   real route can hold are both about what the product refuses to do
   with a date:

     · A NEW CONTACT IS NOT VERIFIED. Typing a number out of an old
       manual is not confirming it reaches anybody, and defaulting
       verifiedOn to now() would make a freshly-imported directory read
       as fully current on the day it is least trustworthy.
     · VERIFICATION CANNOT BE BACKDATED. Every other date in this
       product accepts one, because recording last month's work this
       morning is ordinary. This one must not, or a stale directory can
       be made current by typing rather than by dialling.
   ============================================================ */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";
import { VERIFY_WITHIN_DAYS } from "../../packages/shared/src/erp";

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

const DAY = 86_400_000;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

describe.skipIf(!hasDatabase)("the emergency contact directory, through the real route", () => {
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

  const manager = () => tokenFor(managerId, orgId, "SAFETY_MANAGER");
  const frontline = () => tokenFor(frontlineId, orgId, "FRONTLINE");

  const add = (token: string, body: unknown) =>
    app.inject({
      method: "POST", url: "/api/v1/sms/contacts",
      headers: { authorization: `Bearer ${token}` }, payload: body as never,
    });
  const verify = (token: string, id: string, body: unknown = {}) =>
    app.inject({
      method: "POST", url: `/api/v1/sms/contacts/${id}/verify`,
      headers: { authorization: `Bearer ${token}` }, payload: body as never,
    });
  const list = (token: string) =>
    app.inject({
      method: "GET", url: "/api/v1/sms/contacts",
      headers: { authorization: `Bearer ${token}` },
    });

  const duty = () => ({
    name: "KCAA duty officer",
    role: "State notification, Annex 13",
    organisation: "Kenya Civil Aviation Authority",
    phone: "+254 700 000 000",
    callOrder: 1,
    authority: "Receives the accident notification. Cannot release the aircraft.",
  });

  it("A NEW CONTACT IS NOT VERIFIED — typing is not confirming", async () => {
    /* The decision the whole feature turns on. Defaulting verifiedOn to
       now() would make every freshly-imported directory read as fully
       current on the day it is least trustworthy. */
    const res = await add(manager(), duty());
    expect(res.statusCode).toBe(201);
    expect(res.json().contact.verifiedOn).toBeNull();
    expect(res.json().contact.freshness).toBe("NEVER_VERIFIED");

    const body = (await list(manager())).json();
    expect(body.directory.usable).toBe(false);
    expect(body.directory.neverVerified).toBe(1);
  });

  it("VERIFICATION CANNOT BE BACKDATED", async () => {
    /* Every other date in this product accepts a backdate. This one
       must not: "I confirmed this number" happened when the call was
       made, and a stale directory that can be made current by typing is
       a directory that will be. */
    const id = (await add(manager(), duty())).json().contact.id;
    const long = new Date(Date.now() - 900 * DAY).toISOString();

    const res = await verify(manager(), id, { verifiedOn: long });
    expect(res.statusCode).toBe(200);

    const stored = await prisma().emergencyContact.findUniqueOrThrow({ where: { id } });
    expect(
      Date.now() - stored.verifiedOn!.getTime(),
      "the caller's date was accepted — a stale contact can be made current by typing",
    ).toBeLessThan(60_000);
    expect(res.json().contact.freshness).toBe("CURRENT");
  });

  it("goes stale on its own, with no job and no flag", async () => {
    /* Charter rule 6 on the one table where a stored status would be
       most tempting and most wrong: a "current" flag says current
       forever, which is exactly how a directory fails. */
    const id = (await add(manager(), duty())).json().contact.id;
    await verify(manager(), id);
    expect((await list(manager())).json().directory.usable).toBe(true);

    // Age it in the database — no column changes, only the clock.
    await prisma().emergencyContact.update({
      where: { id },
      data: { verifiedOn: new Date(Date.now() - (VERIFY_WITHIN_DAYS + 1) * DAY) },
    });

    const body = (await list(manager())).json();
    expect(body.contacts[0].freshness).toBe("STALE");
    expect(body.directory.usable).toBe(false);
    expect(body.directory.stale).toBe(1);
  });

  it("READS IN CALL ORDER, with the unplaced contacts last", async () => {
    await add(manager(), { ...duty(), name: "Third", callOrder: undefined });
    await add(manager(), { ...duty(), name: "Second", callOrder: 2 });
    await add(manager(), { ...duty(), name: "First", callOrder: 1 });

    const names = (await list(manager())).json().contacts.map((c: { name: string }) => c.name);
    expect(names).toEqual(["First", "Second", "Third"]);
  });

  it("ANY MEMBER OF THE OPERATOR MAY READ IT, and only erp.manage may write", async () => {
    /* A directory only the safety manager can open is a directory that
       is not available at three in the morning, which is the one time
       it matters. */
    await add(manager(), duty());
    expect((await list(frontline())).statusCode).toBe(200);
    expect((await list(frontline())).json().contacts).toHaveLength(1);

    expect((await add(frontline(), duty())).statusCode).toBe(403);
    const id = (await list(manager())).json().contacts[0].id;
    expect((await verify(frontline(), id)).statusCode).toBe(403);
  });

  it("accepts a phone number this product cannot parse", async () => {
    /* A call list holds satellite numbers, extensions, radio
       frequencies and "ask for the duty engineer on the hangar line". A
       regex that refuses any of those pushes the real answer into the
       notes field, where nobody dials it from. */
    const res = await add(manager(), {
      ...duty(),
      phone: "HF 8879 kHz, or ask Wilson tower for the duty engineer",
    });
    expect(res.statusCode).toBe(201);
  });

  it("CANNOT SEE OR TOUCH ANOTHER OPERATOR'S DIRECTORY", async () => {
    const id = (await add(manager(), duty())).json().contact.id;
    const stranger = tokenFor(otherManagerId, otherOrgId, "SAFETY_MANAGER");

    expect((await list(stranger)).json().contacts).toHaveLength(0);
    // Not-found rather than forbidden: a refusal confirms the row exists.
    expect((await verify(stranger, id)).statusCode).toBe(404);
    expect(
      (await app.inject({
        method: "DELETE", url: `/api/v1/sms/contacts/${id}`,
        headers: { authorization: `Bearer ${stranger}` },
      })).statusCode,
    ).toBe(404);
    expect(await prisma().emergencyContact.count({ where: { orgId } })).toBe(1);
  });

  it("REALLY DELETES, and records that it did", async () => {
    /* Unlike a cancelled corrective action, which is a decision worth
       keeping. A contact who has left is a wrong number in a call-out
       tree, which is the failure this table exists to prevent. */
    const id = (await add(manager(), duty())).json().contact.id;
    const res = await app.inject({
      method: "DELETE", url: `/api/v1/sms/contacts/${id}`,
      headers: { authorization: `Bearer ${manager()}` },
    });
    expect(res.statusCode).toBe(204);
    expect(await prisma().emergencyContact.count({ where: { orgId } })).toBe(0);

    const actions = (await prisma().auditLog.findMany({ where: { orgId } })).map((a) => a.action);
    expect(actions).toContain("erp.contact.delete");
  });

  it("appends an audit entry for creation and verification", async () => {
    const id = (await add(manager(), duty())).json().contact.id;
    await verify(manager(), id);
    const actions = (await prisma().auditLog.findMany({ where: { orgId } })).map((a) => a.action);
    expect(actions).toContain("erp.contact.create");
    expect(actions).toContain("erp.contact.verify");
  });

  it("requires a token", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/sms/contacts" })).statusCode,
    ).toBe(401);
  });
});
