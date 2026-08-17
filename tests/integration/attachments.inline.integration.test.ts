/* =====================================================================
   EVIDENCE WORKS WITH NO OBJECT STORE, and this file is the proof.

   Evidence is part of reporting rather than an extra to it. A hazard
   report about a cracked bracket is worth a great deal less than the
   photograph of the bracket, and for as long as this route answered
   503 without a second credential, the feature shipped disabled — on
   the deploy that had every other credential it needed.

   So the bytes fall back to the database the API already holds. This
   suite runs with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY DELETED,
   which is the state of a deploy that has never been given a bucket.

   THE ENVIRONMENT IS THE FIXTURE, and that is delicate on purpose.
   routes.attachments.ts reads both variables at module scope, so this
   file deletes them BEFORE the dynamic import and would fail loudly —
   an unexpected 503 — if module isolation ever stopped holding. A
   silent pass here would mean the suite was testing the bucket path
   under a different name, which is the shape of check this repository
   treats as worse than none.
   ===================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";
/* THE POINT OF THE FILE. Deleted rather than set empty, because an
   empty string and an absent variable are the same to this route and
   deleting is the honest reproduction of "never configured". */
delete process.env["SUPABASE_URL"];
delete process.env["SUPABASE_SERVICE_ROLE_KEY"];

let app: FastifyInstance;
let orgId = "";
let managerId = "";
let reportId = "";

/* 2 KB of non-zero bytes, declared as a PNG — the same fixture shape
   the bucket-path suite uses. The point of this file is WHERE the
   bytes land, not what is in them. */
const PHOTO = Buffer.alloc(2048, 0x5a);
const PHOTO_B64 = PHOTO.toString("base64");

const token = (sub: string, role: string) =>
  jwt.sign({ sub, org: orgId, role, typ: "access" }, JWT_SECRET,
    { algorithm: "HS256", issuer: "usalamasms", expiresIn: "15m" });

describe.skipIf(!hasDatabase)("evidence with no bucket configured", () => {
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
    const m = await prisma().user.create({
      data: { orgId, email: "m@strip.test", name: "M", role: "SAFETY_MANAGER", passwordHash: "x" },
    });
    managerId = m.id;
    const r = await prisma().safetyReport.create({
      data: {
        orgId, clientId: "c-1", type: "HAZARD", title: "Cracked bracket on the nose gear",
        narrative: "A crack was found on the nose gear bracket during the walk-around.",
        awareAt: new Date(), jurisdiction: "KE", isAnonymous: false,
      },
    });
    reportId = r.id;
  });

  const upload = () =>
    app.inject({
      method: "POST",
      url: `/api/v1/reports/${reportId}/attachments`,
      headers: { authorization: `Bearer ${token(managerId, "SAFETY_MANAGER")}` },
      payload: { contentType: "image/png", data: PHOTO_B64, label: "The crack" },
    });

  it("ACCEPTS AN UPLOAD RATHER THAN ANSWERING 503", async () => {
    const res = await upload();
    /* If this is 503 the fallback is not working — or the environment
       leaked from another suite and this file is silently testing the
       bucket path. Either way it is a real failure, not a skip. */
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json();
    expect(body.attachment?.id).toBeTruthy();
    expect(body.attachment?.sha256).toHaveLength(64);
  });

  it("puts the bytes in the database, and the row says so", async () => {
    await upload();
    const row = await prisma().reportAttachment.findFirst({
      where: { orgId }, select: { data: true, bytes: true, sha256: true, key: true },
    });
    expect(row?.data, "no inline bytes were stored").toBeTruthy();
    expect(row!.data!.length).toBe(row!.bytes);
    /* The key is still built and still unique — the row records where
       the file is by which column is set, not by a third flag that can
       fall out of step. */
    expect(row!.key).toContain(orgId);
  });

  it("SERVES IT BACK, byte for byte, with the hash checked on the way out", async () => {
    const created = (await upload()).json();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/attachments/${created.attachment.id}`,
      headers: { authorization: `Bearer ${token(managerId, "SAFETY_MANAGER")}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.rawPayload.length).toBe(PHOTO.length);
    expect(Buffer.compare(res.rawPayload, PHOTO)).toBe(0);
    expect(res.headers["content-type"]).toContain("image/png");
  });

  it("and a tampered row is refused rather than served", async () => {
    /* The hash check must survive the change of store. Storage was a
       separate system whose contents could drift; the database is not,
       but a row somebody edited by hand is the same problem and the
       same answer. */
    const created = (await upload()).json();
    await prisma().reportAttachment.update({
      where: { id: created.attachment.id },
      data: { data: Buffer.from("not the photograph anybody uploaded") },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/attachments/${created.attachment.id}`,
      headers: { authorization: `Bearer ${token(managerId, "SAFETY_MANAGER")}` },
    });
    expect(res.statusCode).toBe(409);
  });
});
