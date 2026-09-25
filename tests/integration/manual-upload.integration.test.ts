/* =====================================================================
   A MANUAL, UPLOADED IN PIECES AND READ.

   Driven through the real routes against a real Postgres: start an
   upload, send the file in order, register the document against it, and
   read back what the parser found — for a PDF SMS manual and a Word ERP.
   Plus the refusals that keep a manual intact: a piece out of order, a
   file that is not what it says, another operator's upload, and a role
   without document.manage.
   ===================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";
import { makePdf, makeDocx } from "../helpers/manual-fixtures";
import { PDF_TYPE, DOCX_TYPE } from "../../packages/shared/src/manual";

process.env["JWT_SECRET"] = "integration-test-secret-not-a-real-one";
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

let app: FastifyInstance;
const PASSWORD = "correct-horse-battery-staple-9";
let ip = 0;
const call = (method: string, url: string, token: string, payload?: unknown) =>
  app.inject({
    method: method as never, url, payload: payload as never,
    headers: { authorization: `Bearer ${token}`, "x-forwarded-for": `203.0.113.${(ip += 1) % 250}` },
  });

async function userWith(role: string, orgName = "Manual Test Air") {
  const org = await prisma().org.create({ data: { name: orgName } });
  const email = `${role.toLowerCase()}-${Date.now()}-${ip}@airline.co.ke`;
  await prisma().user.create({
    data: {
      orgId: org.id, email, role: role as never, name: "Test " + role,
      passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
    },
  });
  const login = await app.inject({
    method: "POST", url: "/api/v1/auth/login", payload: { email, password: PASSWORD },
    headers: { "x-forwarded-for": `198.51.100.${(ip += 1) % 250}` },
  });
  expect(login.statusCode, login.body).toBe(200);
  return { token: login.json().accessToken as string, orgId: org.id };
}

/** Upload a buffer in pieces of `size`, in order. Returns the upload id. */
async function upload(token: string, buf: Buffer, type: string, name: string, size = 2 * 1024 * 1024) {
  const start = await call("POST", "/api/v1/sms/documents/uploads", token, {
    filename: name, contentType: type, totalBytes: buf.length,
  });
  expect(start.statusCode, start.body).toBe(201);
  const id = start.json().upload.id as string;
  for (let i = 0, n = 0; i < buf.length; i += size, n++) {
    const r = await call("PUT", `/api/v1/sms/documents/uploads/${id}/chunks/${n}`, token, {
      data: buf.subarray(i, i + size).toString("base64"),
    });
    expect(r.statusCode, r.body).toBe(200);
  }
  return id;
}

const SMS_PAGES = [
  ["Contents", "1 Safety policy ........ 2"],
  ["CHAPTER 1 SAFETY POLICY AND OBJECTIVES", "1.1 Management commitment",
   "The accountable executive signs the safety policy."],
  ["2.1 Hazard identification", "Hazards are reported through the safety reporting system.",
   "3.2 Management of change", "Changes are assessed before they are made."],
];

describe.skipIf(!hasDatabase)("manual upload and parsing", () => {
  beforeAll(async () => {
    migrate();
    const { build } = await import("../../apps/api/src/server");
    app = await build();
    await app.ready();
  });
  afterAll(async () => { await app?.close(); await disconnect(); });
  beforeEach(async () => { await reset(); });

  it("a PDF SMS manual sent in pieces is stored whole, hashed, and read", async () => {
    const { token } = await userWith("SAFETY_MANAGER");
    const pdf = makePdf(SMS_PAGES);
    // Deliberately tiny pieces, so a multi-piece upload is what is tested.
    const id = await upload(token, pdf, PDF_TYPE, "SMS Manual Rev 3.pdf", 300);

    const created = await call("POST", "/api/v1/sms/documents", token, {
      title: "Safety Management System Manual", reference: "SMS-MAN", version: "3",
      uploadId: id, kind: "SMS_MANUAL",
    });
    expect(created.statusCode, created.body).toBe(201);
    const doc = created.json().document;
    expect(doc.data, "the create response must not carry the file").toBeUndefined();
    expect(doc.bytes).toBe(pdf.length);
    expect(doc.pageCount).toBe(3);

    const a = (await call("GET", `/api/v1/sms/documents/${doc.id}/analysis`, token)).json().analysis;
    const sms = a.parsed.sms as Array<{ id: string; found: boolean; page: number | null }>;
    expect(sms.find((e) => e.id === "1.1")).toMatchObject({ found: true, page: 2 });
    expect(sms.find((e) => e.id === "2.1")).toMatchObject({ found: true, page: 3 });
    expect(sms.find((e) => e.id === "3.2")).toMatchObject({ found: true, page: 3 });
    expect(sms.find((e) => e.id === "4.1")!.found).toBe(false);
    expect(a.parsed.outline.map((o: { title: string }) => o.title)).toContain("Management of change");

    // The download is the exact bytes that were uploaded.
    const dl = await call("GET", `/api/v1/sms/documents/${doc.id}/file`, token);
    expect(dl.statusCode, dl.body.slice(0, 200)).toBe(200);
    expect(Buffer.compare(dl.rawPayload, pdf)).toBe(0);

    // The finished upload is gone; the register list does not carry bytes.
    expect(await prisma().documentUpload.count()).toBe(0);
    const list = (await call("GET", "/api/v1/sms/documents", token)).json().documents;
    expect(list[0].data).toBeUndefined();
    expect(list[0].extractedText).toBeUndefined();
  });

  it("search finds the page carrying every word, and never another operator's manual", async () => {
    const { token } = await userWith("SAFETY_MANAGER");
    const id = await upload(token, makePdf(SMS_PAGES), PDF_TYPE, "sms.pdf");
    const made = await call("POST", "/api/v1/sms/documents", token, {
      title: "SMS Manual", reference: "SMS-MAN", version: "3", uploadId: id, kind: "SMS_MANUAL",
    });
    expect(made.statusCode, made.body).toBe(201);

    const hit = (await call("GET", "/api/v1/sms/documents/search?q=hazards%20REPORTED", token)).json();
    expect(hit.results).toHaveLength(1);
    expect(hit.results[0].hits).toEqual([expect.objectContaining({ page: 3 })]);
    expect(hit.results[0].extractedText, "search must not return the text").toBeUndefined();

    // Both words exist in the manual, never on one page: not an answer.
    const split = (await call("GET", "/api/v1/sms/documents/search?q=accountable%20hazards", token)).json();
    expect(split.results).toHaveLength(0);

    expect((await call("GET", "/api/v1/sms/documents/search?q=a", token)).statusCode).toBe(400);

    const other = await userWith("SAFETY_MANAGER", "Other Air");
    const theirs = (await call("GET", "/api/v1/sms/documents/search?q=hazards", other.token)).json();
    expect(theirs.results).toHaveLength(0);
  });

  it("a Word ERP is read for contacts and for the parties it names", async () => {
    const { token } = await userWith("SAFETY_MANAGER");
    const docx = await makeDocx([
      "EMERGENCY RESPONSE PLAN",
      "Crisis manager: +254 722 123 456",
      "Notify the AAID and KCAA immediately. KCAA duty officer ops@kcaa.example",
      "Police and hospital liaison through the station manager.",
    ]);
    const id = await upload(token, docx, DOCX_TYPE, "ERP.docx");
    const created = await call("POST", "/api/v1/sms/documents", token, {
      title: "Emergency Response Plan", reference: "ERP", version: "2", uploadId: id, kind: "ERP",
    });
    expect(created.statusCode, created.body).toBe(201);
    const a = (await call("GET", `/api/v1/sms/documents/${created.json().document.id}/analysis`, token)).json().analysis;
    const values = a.parsed.erp.contacts.map((c: { value: string }) => c.value);
    expect(values).toContain("+254 722 123 456");
    expect(values).toContain("ops@kcaa.example");
    const parties = Object.fromEntries(a.parsed.erp.parties.map((p: { party: string; found: boolean }) => [p.party, p.found]));
    expect(parties["Accident investigation authority"]).toBe(true);
    expect(parties["Insurer"]).toBe(false);
  });

  it("refuses a piece out of order, and a file that is not what it says", async () => {
    const { token } = await userWith("SAFETY_MANAGER");
    const start = await call("POST", "/api/v1/sms/documents/uploads", token, {
      filename: "x.pdf", contentType: PDF_TYPE, totalBytes: 16,
    });
    const id = start.json().upload.id;
    const skip = await call("PUT", `/api/v1/sms/documents/uploads/${id}/chunks/1`, token, {
      data: Buffer.from("0123456789").toString("base64"),
    });
    expect(skip.statusCode).toBe(409);
    await call("PUT", `/api/v1/sms/documents/uploads/${id}/chunks/0`, token, { data: Buffer.from("PK\x03\x04 not a pdf!!").toString("base64") });
    const reg = await call("POST", "/api/v1/sms/documents", token, {
      title: "Fake manual", reference: "FAKE", version: "1", uploadId: id, kind: "OTHER",
    });
    expect(reg.statusCode, reg.body).toBe(400);
  });

  it("another operator cannot use an upload, and a role without document.manage cannot start one", async () => {
    const a = await userWith("SAFETY_MANAGER", "Operator A");
    const b = await userWith("SAFETY_MANAGER", "Operator B");
    const id = await upload(a.token, makePdf([["1.1 Safety policy"]]), PDF_TYPE, "a.pdf");
    const stolen = await call("POST", "/api/v1/sms/documents", b.token, {
      title: "Not mine", reference: "X", version: "1", uploadId: id, kind: "OTHER",
    });
    expect(stolen.statusCode).toBe(404);
    const frontline = await userWith("FRONTLINE");
    const refused = await call("POST", "/api/v1/sms/documents/uploads", frontline.token, {
      filename: "m.pdf", contentType: PDF_TYPE, totalBytes: 100,
    });
    expect(refused.statusCode).toBe(403);
  });
});
