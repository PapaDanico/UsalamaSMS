/* ============================================================
   EVIDENCE ON A REPORT, through the real route.

   evidence.test.ts holds the rule. This file exists because the rule
   was RIGHT and the route did not deliver it, in three separate ways at
   once, for the whole life of the feature — and every one of them was
   invisible to a unit test:

     · a 3 MB ceiling behind a 1 MB body limit, so the real cap was
       786 KB and the refusal was a Fastify parser error;
     · a base64 decode that cannot refuse anything, so a truncated
       upload would be stored and hashed as if it were the file;
     · a download link that carries no bearer token, covered in
       scripts/smoke.mjs because it is a browser defect.

   The first is the reason this file's largest test posts a payload
   OVER A MEGABYTE. That is the assertion; the rest is scaffolding for
   it. A test that posts a 40-byte GIF passes against the broken build.

   STORAGE IS STUBBED, the database is real. What only Postgres can
   answer is tenancy, the count cap under a real unique constraint, and
   whether the audit entry commits — and those are exactly the things a
   mocked Prisma would agree with whatever the route did.
   ============================================================ */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";
import {
  EVIDENCE_MAX_FILES,
  EVIDENCE_MAX_BYTES,
} from "../../packages/shared/src/evidence";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";
/* Set BEFORE the server is imported: routes.attachments.ts reads these
   at module scope, deliberately, so a deploy either has storage or
   refuses at the first request rather than at the first upload. */
process.env["SUPABASE_URL"] = "https://storage.invalid";
process.env["SUPABASE_SERVICE_ROLE_KEY"] = "service-role-key-for-the-stub";
process.env["SUPABASE_EVIDENCE_BUCKET"] = "evidence";

let app: FastifyInstance;
let orgId: string;
let otherOrgId: string;
let managerId: string;
let reportId: string;
let otherReportId: string;

const tokenFor = (sub: string, org: string, role: string): string =>
  jwt.sign({ sub, org, role, typ: "access" }, JWT_SECRET, {
    algorithm: "HS256", expiresIn: "15m", issuer: "usalamasms",
  });

/* ------------------------------------------------------------------
   THE STUB BUCKET. Keyed by storage path, holding the exact bytes the
   route wrote — which is what makes the hash-on-the-way-out test real
   rather than a restatement of the hash-on-the-way-in one. */
const bucket = new Map<string, Buffer>();
let putStatus = 200;

function installStorageStub(): void {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const key = url.split("/object/evidence/")[1] ?? url;
    if ((init?.method ?? "GET") === "POST") {
      if (putStatus !== 200) {
        return new Response("nope", { status: putStatus });
      }
      bucket.set(key, Buffer.from(init?.body as Uint8Array));
      return new Response("{}", { status: 200 });
    }
    const held = bucket.get(key);
    if (!held) return new Response("missing", { status: 404 });
    return new Response(new Uint8Array(held), { status: 200 });
  });
}

/** A base64 payload of exactly n bytes, filled with something non-zero. */
const payload = (n: number): string => Buffer.alloc(n, 0x5a).toString("base64");

describe.skipIf(!hasDatabase)("evidence on a report, through the real route", () => {
  beforeAll(async () => {
    migrate();
    const { build } = await import("../../apps/api/src/server");
    app = await build();
    await app.ready();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app?.close();
    await disconnect();
  });

  beforeEach(async () => {
    await reset();
    bucket.clear();
    putStatus = 200;
    installStorageStub();

    const org = await prisma().org.create({ data: { name: "Design Partner AOC" } });
    const other = await prisma().org.create({ data: { name: "Competitor" } });
    orgId = org.id;
    otherOrgId = other.id;

    const manager = await prisma().user.create({
      data: { orgId, email: "manager@example.test", name: "S Manager", role: "SAFETY_MANAGER", passwordHash: "x" },
    });
    managerId = manager.id;

    const report = await prisma().safetyReport.create({
      data: { orgId, clientId: crypto.randomUUID(), type: "HAZARD", title: "Bird activity, runway 06", narrative: "Flock on short final." },
    });
    reportId = report.id;

    const theirs = await prisma().safetyReport.create({
      data: { orgId: otherOrgId, clientId: crypto.randomUUID(), type: "HAZARD", title: "Not yours", narrative: "Another operator's report." },
    });
    otherReportId = theirs.id;
  });

  const post = (id: string, body: unknown) =>
    app.inject({
      method: "POST",
      url: `/api/v1/reports/${id}/attachments`,
      headers: { authorization: `Bearer ${tokenFor(managerId, orgId, "SAFETY_MANAGER")}` },
      payload: body as Record<string, unknown>,
    });

  /* ================================================================
     THE ONE THAT WOULD HAVE CAUGHT IT.
     ================================================================ */
  it("accepts a file far larger than the API's own 1 MB body limit", async () => {
    /* 1.5 MB of file is 2 MB of base64 — comfortably over the 1,048,576
       the JSON parser allows every other route in this product, and
       comfortably under this route's own ceiling. Before the route
       declared its own bodyLimit this returned 413 with
       FST_ERR_CTP_BODY_TOO_LARGE, and the effective ceiling for the
       whole feature was 786 KB. */
    const bytes = 1_500_000;
    expect(bytes).toBeGreaterThan(1_048_576);
    expect(bytes).toBeLessThan(EVIDENCE_MAX_BYTES);

    const res = await post(reportId, {
      contentType: "image/jpeg",
      data: payload(bytes),
      label: "cowling.jpg",
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().attachment.bytes).toBe(bytes);
  });

  it("still refuses a file over the ceiling the rule states", async () => {
    /* The body limit is generous enough to CARRY an oversized file so
       that the refusal is this product's sentence rather than the
       transport's — which is the whole difference between the two. */
    const res = await post(reportId, {
      contentType: "image/jpeg",
      data: payload(EVIDENCE_MAX_BYTES + 1024),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/limit per attachment/i);
  });

  /* ================================================================
     A DECODE THAT COULD NOT REFUSE.
     ================================================================ */
  it("refuses a truncated payload instead of storing whatever decoded", async () => {
    const good = payload(900);
    const res = await post(reportId, {
      contentType: "image/jpeg",
      data: good.slice(0, good.length - 1),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/did not arrive intact/i);
    /* NOTHING WAS WRITTEN. Charter rule 8: a refused write is reported,
       and it is also actually refused. */
    expect(bucket.size).toBe(0);
    expect(await prisma().reportAttachment.count()).toBe(0);
  });

  it("refuses a payload carrying characters base64 would have silently dropped", async () => {
    const res = await post(reportId, { contentType: "image/jpeg", data: "!!!!not base64!!!!" });
    expect(res.statusCode).toBe(400);
    expect(await prisma().reportAttachment.count()).toBe(0);
  });

  /* ================================================================
     TENANCY.
     ================================================================ */
  it("answers 404 for another operator's report rather than attaching to it", async () => {
    const res = await post(otherReportId, { contentType: "image/jpeg", data: payload(64) });
    expect(res.statusCode).toBe(404);
    expect(await prisma().reportAttachment.count()).toBe(0);
  });

  it("does not list or serve another operator's attachment", async () => {
    await post(reportId, { contentType: "image/jpeg", data: payload(64) });
    const mine = await prisma().reportAttachment.findFirstOrThrow();

    const intruder = await prisma().user.create({
      data: { orgId: otherOrgId, email: "them@example.test", name: "Them", role: "SAFETY_MANAGER", passwordHash: "x" },
    });
    const theirToken = `Bearer ${tokenFor(intruder.id, otherOrgId, "SAFETY_MANAGER")}`;

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/reports/${reportId}/attachments`,
      headers: { authorization: theirToken },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().attachments).toHaveLength(0);

    const fetchIt = await app.inject({
      method: "GET",
      url: `/api/v1/attachments/${mine.id}`,
      headers: { authorization: theirToken },
    });
    expect(fetchIt.statusCode).toBe(404);
  });

  it("puts the operator in the storage key, so a leaked row is not a leaked file", async () => {
    await post(reportId, { contentType: "image/jpeg", data: payload(64) });
    const row = await prisma().reportAttachment.findFirstOrThrow();
    expect(row.key.startsWith(`${orgId}/${reportId}/`)).toBe(true);
    /* And the key never leaves the API — a client has no use for a path
       it cannot fetch directly anyway. */
    const list = await app.inject({
      method: "GET",
      url: `/api/v1/reports/${reportId}/attachments`,
      headers: { authorization: `Bearer ${tokenFor(managerId, orgId, "SAFETY_MANAGER")}` },
    });
    expect(JSON.stringify(list.json())).not.toContain(row.key);
  });

  /* ================================================================
     THE HASH, WHICH IS WHY THE BYTES TRAVEL THROUGH THE API AT ALL.
     ================================================================ */
  it("records the server's own hash of the bytes it wrote", async () => {
    const bytes = Buffer.alloc(2048, 0x5a);
    const res = await post(reportId, { contentType: "image/jpeg", data: bytes.toString("base64") });
    expect(res.statusCode).toBe(201);
    expect(res.json().attachment.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("refuses to serve a stored file that no longer matches its hash", async () => {
    /* THE POINT OF STORING A HASH. Storage is a separate system with
       its own access path; if what comes back is not what the chain
       attests, saying so is the entire value of the column. Serving it
       silently would make the hash decorative. */
    await post(reportId, { contentType: "image/jpeg", data: payload(512) });
    const row = await prisma().reportAttachment.findFirstOrThrow();

    bucket.set(row.key, Buffer.from("substituted after the fact"));

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/attachments/${row.id}`,
      headers: { authorization: `Bearer ${tokenFor(managerId, orgId, "SAFETY_MANAGER")}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("tampered");
  });

  it("serves the bytes back with a disposition that never renders in this origin", async () => {
    const bytes = Buffer.alloc(256, 0x21);
    await post(reportId, { contentType: "image/png", data: bytes.toString("base64") });
    const row = await prisma().reportAttachment.findFirstOrThrow();

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/attachments/${row.id}`,
      headers: { authorization: `Bearer ${tokenFor(managerId, orgId, "SAFETY_MANAGER")}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toBe("attachment");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(res.rawPayload).equals(bytes)).toBe(true);
  });

  it("tells the client whether this deploy can accept a file, on the way in", async () => {
    /* The list read works with or without storage configured, so before
       this the panel rendered a file input on every deploy and only
       learned the truth after somebody had chosen a photograph, waited
       for it to re-encode and upload, and got a 503. Correct refusal,
       cruel sequence: it spent a reporter's time and data to say
       something the server knew before they started. */
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/${reportId}/attachments`,
      headers: { authorization: `Bearer ${tokenFor(managerId, orgId, "SAFETY_MANAGER")}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().storage).toBe(true);
  });

  it("needs a token — a browser navigating to the path gets nothing", async () => {
    /* The reason the panel cannot use a plain link, asserted where the
       behaviour lives. scripts/smoke.mjs asserts the other half: that
       no anchor in the shipped bundle points here. */
    const row = await app.inject({ method: "GET", url: `/api/v1/attachments/${reportId}` });
    expect(row.statusCode).toBe(401);
  });

  /* ================================================================
     WRITE DISCIPLINE.
     ================================================================ */
  it("writes no row when storage refuses the file", async () => {
    putStatus = 500;
    const res = await post(reportId, { contentType: "image/jpeg", data: payload(1024) });
    expect(res.statusCode).toBe(502);
    /* A ledger entry for a file that does not exist is worse than no
       entry: it is discovered by an inspector asking for the
       photograph. */
    expect(await prisma().reportAttachment.count()).toBe(0);
  });

  it("stops at the per-report ceiling and says which limit was reached", async () => {
    for (let i = 0; i < EVIDENCE_MAX_FILES; i++) {
      const res = await post(reportId, { contentType: "image/jpeg", data: payload(64 + i) });
      expect(res.statusCode).toBe(201);
    }
    const over = await post(reportId, { contentType: "image/jpeg", data: payload(99) });
    expect(over.statusCode).toBe(409);
    expect(over.json().message).toContain(String(EVIDENCE_MAX_FILES));
    expect(await prisma().reportAttachment.count()).toBe(EVIDENCE_MAX_FILES);
  });

  it("puts the hash in the audit chain, and never the file", async () => {
    const res = await post(reportId, { contentType: "image/jpeg", data: payload(777), label: "fairing.jpg" });
    const sha = res.json().attachment.sha256;

    const entry = await prisma().auditLog.findFirstOrThrow({
      where: { orgId, action: "report.evidence.add" },
    });
    const detail = JSON.stringify(entry.detail);
    expect(detail).toContain(sha);
    /* The bytes themselves are nowhere near the chain — a hash is what
       makes a later substitution detectable, and a copy of the file
       would make the audit log the second place it leaks from. */
    expect(detail).not.toContain(payload(777).slice(0, 40));
  });

  it("refuses a frontline reporter, who cannot see the queue in the first place", async () => {
    const frontline = await prisma().user.create({
      data: { orgId, email: "ramp@example.test", name: "Ramp", role: "FRONTLINE", passwordHash: "x" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/reports/${reportId}/attachments`,
      headers: { authorization: `Bearer ${tokenFor(frontline.id, orgId, "FRONTLINE")}` },
      payload: { contentType: "image/jpeg", data: payload(64) },
    });
    expect(res.statusCode).toBe(403);
    expect(await prisma().reportAttachment.count()).toBe(0);
  });
});
