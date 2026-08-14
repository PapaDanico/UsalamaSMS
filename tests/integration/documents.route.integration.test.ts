/* ============================================================
   ELEMENT 1.5 — distribution, not just a register.

   The product controlled the REGISTER of documents: reference, version,
   approver, review date. What it could not answer is the question an
   auditor actually asks — who has read the version now in force.

   THE CHECK WORTH MOST HERE is that an acknowledgement is scoped to a
   REVISION. ControlledDocument is unique on (orgId, reference,
   version), so every revision is its own row; an acknowledgement keyed
   on documentId is therefore keyed on a revision, and reading rev 3
   must not mark anybody as having read rev 4.

   A per-document key would report full coverage the moment a revision
   shipped. That is the reassuring answer, the wrong one, and precisely
   what makes a distribution record worthless — an operator would revise
   its SMS manual and the screen would say everybody had already read
   it.
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
let frontlineId: string;
let otherManagerId: string;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

const doc = (version: string) => ({
  title: "Safety Management System Manual",
  reference: "SMSM",
  version,
});

describe.skipIf(!hasDatabase)("controlled documents, through the real route", () => {
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

  const add = (token: string, body: unknown) =>
    app.inject({
      method: "POST", url: "/api/v1/sms/documents",
      headers: { authorization: `Bearer ${token}` }, payload: body as never,
    });
  const read = (token: string, id: string) =>
    app.inject({
      method: "POST", url: `/api/v1/sms/documents/${id}/read`,
      headers: { authorization: `Bearer ${token}` }, payload: {} as never,
    });
  const list = (token: string) =>
    app.inject({
      method: "GET", url: "/api/v1/sms/documents",
      headers: { authorization: `Bearer ${token}` },
    });

  it("records that somebody has read a document", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const frontline = tokenFor(frontlineId, orgId, "FRONTLINE");
    const id = (await add(manager, doc("1"))).json().document.id;

    expect((await read(frontline, id)).statusCode).toBe(201);

    const [row] = (await list(manager)).json().documents;
    expect(row._count.reads).toBe(1);
  });

  it("READING REVISION 1 IS NOT READING REVISION 2", async () => {
    /* The property this whole table exists for. An operator revises its
       manual; the screen must not report that everybody has already
       read the new one.

       WRITTEN FIRST ON A WRONG ASSUMPTION, and the code was right. I
       expected both revisions in the list; posting a new version
       SUPERSEDES the previous one and the list returns only the version
       in force, which is correct — a distribution screen answering "who
       has read the current manual" should not be padded with revisions
       nobody is being asked to read. So the property is asserted the
       way it actually presents: the in-force revision shows nobody has
       read it, while the superseded one keeps its reader. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const frontline = tokenFor(frontlineId, orgId, "FRONTLINE");
    const v1 = (await add(manager, doc("1"))).json().document.id;
    await read(frontline, v1);
    const v2 = (await add(manager, doc("2"))).json().document.id;

    const docs = (await list(manager)).json().documents;
    expect(docs).toHaveLength(1);
    expect(docs[0].id, "the list should carry the revision in force").toBe(v2);
    expect(
      docs[0]._count.reads,
      "revision 2 counted a read that was against revision 1 — a revision nobody has " +
        "read reported as distributed",
    ).toBe(0);

    // And the earlier revision keeps its reader: who read what remains true.
    expect(await prisma().documentAcknowledgement.count({ where: { documentId: v1 } })).toBe(1);
    expect(await prisma().documentAcknowledgement.count({ where: { documentId: v2 } })).toBe(0);
  });

  it("IS IDEMPOTENT, and does not move the moment it was first read", async () => {
    /* Reading twice is not two readings. And when somebody read the
       revision is the fact — re-opening the document must not rewrite
       it, or the record answers "when did you last look" rather than
       "when were you told". */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const frontline = tokenFor(frontlineId, orgId, "FRONTLINE");
    const id = (await add(manager, doc("1"))).json().document.id;

    const first = await read(frontline, id);
    expect(first.statusCode).toBe(201);
    const when = first.json().acknowledgedAt;

    const again = await read(frontline, id);
    expect(again.statusCode).toBe(200);
    expect(again.json().alreadyRead).toBe(true);
    expect(again.json().acknowledgedAt).toBe(when);

    expect(await prisma().documentAcknowledgement.count({ where: { orgId } })).toBe(1);
  });

  it("A READER MAY RECORD THEIR OWN READING, without a manager", async () => {
    /* document.read, not document.manage. Requiring a manager's
       permission to say "I have read the manual" would make this a
       record of what the safety office believes rather than of what
       happened. */
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const frontline = tokenFor(frontlineId, orgId, "FRONTLINE");
    const id = (await add(manager, doc("1"))).json().document.id;

    expect((await read(frontline, id)).statusCode).toBe(201);
    // And a frontline reporter still cannot ADD a controlled document.
    expect((await add(frontline, doc("9"))).statusCode).toBe(403);
  });

  it("tells the caller whether THEY have read it", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const frontline = tokenFor(frontlineId, orgId, "FRONTLINE");
    const id = (await add(manager, doc("1"))).json().document.id;
    await read(frontline, id);

    const mine = (await list(frontline)).json().documents.find((d: { id: string }) => d.id === id);
    const theirs = (await list(manager)).json().documents.find((d: { id: string }) => d.id === id);
    expect(mine.reads).toHaveLength(1);
    expect(theirs.reads).toHaveLength(0);
  });

  it("ANOTHER OPERATOR'S DOCUMENT CANNOT BE ACKNOWLEDGED", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const stranger = tokenFor(otherManagerId, otherOrgId, "SAFETY_MANAGER");
    const id = (await add(manager, doc("1"))).json().document.id;

    // Not-found rather than forbidden: a refusal confirms the row exists.
    expect((await read(stranger, id)).statusCode).toBe(404);
    expect(await prisma().documentAcknowledgement.count({ where: { orgId: otherOrgId } })).toBe(0);
  });

  it("appends an audit entry, because distribution is evidence", async () => {
    const manager = tokenFor(managerId, orgId, "SAFETY_MANAGER");
    const frontline = tokenFor(frontlineId, orgId, "FRONTLINE");
    const id = (await add(manager, doc("1"))).json().document.id;
    await read(frontline, id);

    const actions = (await prisma().auditLog.findMany({ where: { orgId } })).map((a) => a.action);
    expect(actions).toContain("document.read");
  });

  it("requires a token", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/sms/documents" })).statusCode,
    ).toBe(401);
  });
});
