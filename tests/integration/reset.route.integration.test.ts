/* =====================================================================
   GETTING BACK INTO AN ACCOUNT, through the real routes.

   reset.test.ts holds the rules a unit test can settle — the
   validators, the two fixed answers, what the email may say. This file
   holds the four that only a real database can answer, and each of them
   is a way a password-reset flow is usually wrong:

     · IT ANSWERS THE SAME FOR AN ADDRESS THAT EXISTS AND ONE THAT DOES
       NOT. Same status, same body. A mocked Prisma would agree with
       whatever the route did, because the route's answer is the thing
       under test.

     · A NEW LINK KILLS THE OLD ONE. Two rows, one constraint, one
       sweep — nothing about that is visible without the table.

     · THE SAME LINK CANNOT BE SPENT TWICE, INCLUDING CONCURRENTLY. The
       refresh route records at length what a read-then-write does to
       single-use enforcement: both racers win. The only way to know
       this route does not have that defect is to fire both at one
       Postgres and count the winners.

     · IT REVOKES EVERY LIVE SESSION. A reset that leaves a refresh
       token alive hands the account to the holder AND to whoever forced
       the reset, and the remedy becomes the breach.

   MAIL IS STUBBED, the database is real. Whether Resend was called is a
   fact about our request, not about the provider — so the stub records
   what would have gone on the wire and asserts on it, exactly the way
   sendDigest is tested.
   ===================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createHmac } from "node:crypto";
import argon2 from "argon2";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";
import { RESET_TTL_MINUTES } from "../../packages/shared/src/reset";

const JWT_SECRET = "integration-test-secret-not-a-real-one";
process.env["JWT_SECRET"] = JWT_SECRET;
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";
/* Set before the server is imported. With no key the route reports
   NOT_CONFIGURED, which is a supported state and has its own test —
   but the tests that matter need the send to be attempted. */
process.env["RESEND_API_KEY"] = "re_not_a_real_key";
process.env["PUBLIC_BASE_URL"] = "https://usalamasms.test";

let app: FastifyInstance;
let orgId: string;
let userId: string;

const EMAIL = "chief.pilot@operator.test";
const OLD_PASSWORD = "the-old-one-12ch";

/** The same HMAC the API stores, so a test can find the row a token names. */
const hashOf = (token: string): string =>
  createHmac("sha256", JWT_SECRET).update(token, "utf8").digest("hex");

/* ------------------------------------------------------------------
   THE MAIL STUB. Records every send rather than performing one, and
   hands back a 200 so the route sees SENT. */
let sent: Array<{ to: string; text: string }> = [];

function installMailStub(status = 200): void {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes("api.resend.com")) return new Response("{}", { status: 200 });
    const body = JSON.parse(String(init?.body ?? "{}")) as { to: string; text: string };
    sent.push({ to: body.to, text: body.text });
    return new Response(JSON.stringify({ id: "stub" }), { status });
  });
}

/** The token out of the link the email actually carried. */
const tokenFromLastMail = (): string =>
  sent.at(-1)!.text.match(/\/reset\?token=([A-Za-z0-9_-]+)/)![1]!;

/* ------------------------------------------------------------------
   A DISTINCT CALLER PER TEST, and it has to be said why rather than
   left as a helper somebody later reads as configuration.

   /auth/forgot allows five requests per fifteen minutes and the limiter
   is in-memory, so it does NOT reset between tests the way the database
   does — the first five assertions passed and the rest got 429s, which
   is the limiter working correctly and the suite measuring the wrong
   thing.

   THE FIX IS NOT AN X-FORWARDED-FOR. rate-limit-key.ts records that the
   integration suite once rotated exactly that header to buy a fresh
   bucket per test, and that the trick was a live forgery vector
   committed as a test helper. The edge header is the opposite case: it
   is the value the PLATFORM sets from the socket it terminated, a
   client cannot influence it, and it is what the limiter is designed to
   count against. Different values here are different callers, which is
   what these tests are.

   The bucket-sharing case is not lost — it is asserted deliberately in
   the last test in this file, which is the only one that reuses a
   caller. */
let caller = 0;
const asNewCaller = (): Record<string, string> => ({
  "x-nf-client-connection-ip": `198.51.100.${++caller}`,
});

describe.skipIf(!hasDatabase)("password reset, through the real routes", () => {
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
    sent = [];
    installMailStub();

    const org = await prisma().org.create({ data: { name: "Design Partner AOC" } });
    orgId = org.id;
    const user = await prisma().user.create({
      data: {
        orgId,
        email: EMAIL,
        name: "A Chief Pilot",
        /* THE ROLE THE PRODUCT ACTUALLY CREATES. Signup sets this and
           nothing else, and it does not hold `user.manage` — which is
           why the administrative reset was unreachable and why these
           routes exist. Using SAFETY_MANAGER here would test a shape
           the product never produces. */
        role: "ACCOUNTABLE_EXECUTIVE",
        passwordHash: await argon2.hash(OLD_PASSWORD, { type: argon2.argon2id }),
      },
    });
    userId = user.id;
  });

  /* One caller identity per test, minted in beforeEach — so the calls
     WITHIN a test share a bucket the way a real person's would, and
     separate tests do not. */
  let client: Record<string, string>;
  beforeEach(() => {
    client = asNewCaller();
  });

  const forgot = (email: string) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot",
      headers: client,
      payload: { email },
    });

  const spend = (token: string, newPassword: string) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/reset",
      headers: client,
      payload: { token, newPassword },
    });

  const login = (password: string) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: client,
      payload: { email: EMAIL, password },
    });

  /* ================================================================
     1 · THE ENUMERATION ANSWER.
     ================================================================ */
  it("answers a real address and an unknown one identically", async () => {
    const real = await forgot(EMAIL);
    const fake = await forgot("nobody@nowhere.test");

    expect(real.statusCode).toBe(202);
    expect(fake.statusCode).toBe(202);
    expect(fake.body).toBe(real.body);
  });

  it("answers a deactivated account the same way, and sends it nothing", async () => {
    await prisma().user.update({ where: { id: userId }, data: { active: false } });
    const res = await forgot(EMAIL);

    expect(res.statusCode).toBe(202);
    expect(sent).toHaveLength(0);
    expect(await prisma().passwordReset.count()).toBe(0);
  });

  it("answers a malformed address the same way rather than with a 400", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot",
      payload: { email: "not-an-address" },
    });
    /* A 400 that distinguishes valid-but-unknown from invalid is the
       oracle wearing a different status code. */
    expect(bad.statusCode).toBe(202);
    expect(JSON.parse(bad.body).message).toBe(JSON.parse((await forgot(EMAIL)).body).message);
  });

  /* ================================================================
     2 · THE LINK ITSELF.
     ================================================================ */
  it("stores a hash and never the token, and sends the token and never the hash", async () => {
    await forgot(EMAIL);
    const row = await prisma().passwordReset.findFirstOrThrow();
    const token = tokenFromLastMail();

    expect(row.tokenHash).toBe(hashOf(token));
    expect(row.tokenHash).not.toBe(token);
    expect(sent.at(-1)!.text).not.toContain(row.tokenHash);
  });

  it("builds the link from PUBLIC_BASE_URL, never from a request header", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot",
      /* A Host header is attacker-controlled. A reset link pointing at
         a site of the requester's choosing is a credential-harvesting
         campaign sent from our own domain. */
      headers: { host: "phishing.example" },
      payload: { email: EMAIL },
    });
    expect(sent.at(-1)!.text).toContain("https://usalamasms.test/reset?token=");
    expect(sent.at(-1)!.text).not.toContain("phishing.example");
  });

  it("expires it after the stated lifetime and not some other one", async () => {
    /* BRACKETED BY BOTH CLOCKS. The route stamps the expiry some
       milliseconds after `before`, so `<= before + TTL` is off by the
       duration of the request — which is how this first read
       60.00005 minutes and failed on a correct implementation. The
       honest window is [before + TTL, after + TTL]: wide enough for
       the request, and still tight enough that 30 minutes or 24 hours
       falls outside it. */
    const before = Date.now();
    await forgot(EMAIL);
    const after = Date.now();
    const expiry = (await prisma().passwordReset.findFirstOrThrow()).expiresAt.getTime();
    const ttl = RESET_TTL_MINUTES * 60_000;

    expect(expiry).toBeGreaterThanOrEqual(before + ttl);
    expect(expiry).toBeLessThanOrEqual(after + ttl);
  });

  it("kills the previous link when a second is asked for", async () => {
    await forgot(EMAIL);
    const first = tokenFromLastMail();
    await forgot(EMAIL);
    const second = tokenFromLastMail();

    expect(second).not.toBe(first);
    expect((await spend(first, "a-new-password-1")).statusCode).toBe(400);
    expect((await spend(second, "a-new-password-2")).statusCode).toBe(200);
  });

  /* ================================================================
     3 · SPENDING IT.
     ================================================================ */
  it("sets the password, so the new one works and the old one does not", async () => {
    await forgot(EMAIL);
    const res = await spend(tokenFromLastMail(), "brand-new-password");

    expect(res.statusCode).toBe(200);
    expect((await login("brand-new-password")).statusCode).toBe(200);
    expect((await login(OLD_PASSWORD)).statusCode).toBe(401);
  });

  it("cannot be spent twice", async () => {
    await forgot(EMAIL);
    const token = tokenFromLastMail();

    expect((await spend(token, "brand-new-password")).statusCode).toBe(200);
    expect((await spend(token, "a-third-password-x")).statusCode).toBe(400);
    /* And the second attempt changed nothing — the first password is
       still the live one. */
    expect((await login("brand-new-password")).statusCode).toBe(200);
  });

  /* ================================================================
     THE RACE. The refresh route carries a long note about a
     read-then-write letting two concurrent callers both win; this is
     the same defect in the same shape, and the only way to see it is
     to fire both at one Postgres.

     If consumption were `findUnique` then `update`, both of these
     would return 200 and the SECOND password would be the live one —
     an attacker racing the account holder chooses the credential.
     ================================================================ */
  it("lets exactly one of two concurrent uses win", async () => {
    await forgot(EMAIL);
    const token = tokenFromLastMail();

    const [a, b] = await Promise.all([
      spend(token, "racer-one-password"),
      spend(token, "racer-two-password"),
    ]);

    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 400]);

    /* And whichever won, the account has exactly one working password
       rather than two rows' worth of confusion. */
    const worked = await Promise.all([
      login("racer-one-password").then((r) => r.statusCode === 200),
      login("racer-two-password").then((r) => r.statusCode === 200),
    ]);
    expect(worked.filter(Boolean)).toHaveLength(1);
  });

  it("refuses an expired link", async () => {
    await forgot(EMAIL);
    const token = tokenFromLastMail();
    await prisma().passwordReset.updateMany({
      where: { tokenHash: hashOf(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await spend(token, "brand-new-password")).statusCode).toBe(400);
    expect((await login(OLD_PASSWORD)).statusCode).toBe(200);
  });

  it("refuses a token that was never issued", async () => {
    expect((await spend("z".repeat(43), "brand-new-password")).statusCode).toBe(400);
  });

  it("refuses to set a password shorter than the floor, and says so", async () => {
    await forgot(EMAIL);
    const res = await spend(tokenFromLastMail(), "short");

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("password_too_short");
    /* The link survives a typo. Burning it on a password that was too
       short would send somebody back to their inbox for a mistake the
       form should have caught. */
    expect((await spend(tokenFromLastMail(), "a-long-enough-one")).statusCode).toBe(200);
  });

  /* ================================================================
     4 · WHAT A RESET MEANS FOR EVERY OTHER DEVICE.
     ================================================================ */
  it("revokes every live refresh token, so a session held elsewhere ends", async () => {
    const signedIn = await login(OLD_PASSWORD);
    const { refreshToken } = JSON.parse(signedIn.body) as { refreshToken: string };
    /* It works before the reset — otherwise the assertion after it
       proves nothing about the reset. */
    expect(
      (await app.inject({ method: "POST", url: "/api/v1/auth/refresh", payload: { refreshToken } }))
        .statusCode,
    ).toBe(200);

    await forgot(EMAIL);
    await spend(tokenFromLastMail(), "brand-new-password");

    expect(await prisma().refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });

  it("returns no tokens, so a stolen link is a password prompt and not a session", async () => {
    await forgot(EMAIL);
    const body = JSON.parse((await spend(tokenFromLastMail(), "brand-new-password")).body);

    expect(body.accessToken).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();
  });

  /* ================================================================
     5 · THE RECORD, and what it must not hold.
     ================================================================ */
  it("appends both halves to the audit chain, holding neither the token nor the password", async () => {
    await forgot(EMAIL);
    const token = tokenFromLastMail();
    await spend(token, "brand-new-password");

    const entries = await prisma().auditLog.findMany({ where: { orgId } });
    const actions = entries.map((e) => e.action);
    expect(actions).toContain("auth.password.reset_requested");
    expect(actions).toContain("auth.password.reset_completed");

    /* An audit entry holding a live reset link would make the audit
       export a credential store. */
    /* The replacer is for the chain's sequence number, which is a
       BIGINT and which JSON.stringify refuses outright. Scanning the
       whole serialised row rather than named fields is the point — a
       field added later is covered without anybody remembering to. */
    const serialised = JSON.stringify(entries, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    expect(serialised).not.toContain(token);
    expect(serialised).not.toContain(hashOf(token));
    expect(serialised).not.toContain("brand-new-password");
  });

  /* ================================================================
     6 · NO KEY IS A SUPPORTED STATE, AND IT IS REPORTED.

     Charter rule 8. A recovery route that answers 202 while sending
     nothing is the quiet-failure objection to mail links coming true —
     the operator stares at an empty inbox and cannot tell whether the
     address was wrong or the deployment cannot send at all.
     ================================================================ */
  it("reports the delivery state, and reports it identically for an unknown address", async () => {
    const real = JSON.parse((await forgot(EMAIL)).body);
    const fake = JSON.parse((await forgot("nobody@nowhere.test")).body);

    expect(real.delivery).toBe("CONFIGURED");
    /* THE POINT. If this were computed after the account lookup it
       would be a fact about the account rather than about the server,
       and the field itself would be the oracle. */
    expect(fake.delivery).toBe("CONFIGURED");
  });

  /* ================================================================
     7 · AND THE LIMIT ACTUALLY BITES.

     THE ONLY TEST HERE THAT REUSES ONE CALLER, deliberately — every
     other one takes a fresh edge address so the limiter does not
     interfere with what it is measuring, and a suite that did that
     everywhere would never notice the limiter had been removed.

     Five per fifteen minutes, and the cost of getting this wrong is
     not a brute-forced password: a token is 32 random bytes. It is
     that anybody can point this route at a stranger's address a
     thousand times, which is a mail provider's definition of a
     product to stop delivering.
     ================================================================ */
  it("throttles a caller asking over and over, whatever address they name", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      codes.push((await forgot(`someone-${i}@nowhere.test`)).statusCode);
    }
    expect(codes.slice(0, 5)).toEqual([202, 202, 202, 202, 202]);
    expect(codes.slice(5)).toEqual([429, 429]);
  });
});
