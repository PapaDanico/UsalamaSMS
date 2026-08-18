// =====================================================================
// Authentication, end to end.
//
// tests/auth.test.ts reads the source and asserts that the branches
// exist. This runs them: a real argon2 hash in a real Postgres, through
// the real route, with a real token coming back that a protected
// endpoint actually accepts.
//
// The refresh-rotation behaviour in particular cannot be checked any
// other way. "The file contains updateMany" is not the same claim as
// "presenting a burnt token revokes every session", and the difference
// is the entire security property.
// =====================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

process.env["JWT_SECRET"] = "integration-test-secret-not-a-real-one";
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

const PASSWORD = "a-sufficiently-long-test-password";

let app: FastifyInstance;
let orgId: string;

/**
 * A fresh source address per test.
 *
 * The login limiter is 10 attempts per IP per 15 minutes and its counter
 * is in-memory for the life of the app, which `beforeAll` builds once.
 * Without this the suite's own logins would exhaust the bucket partway
 * through and later tests would fail with 429 for reasons that have
 * nothing to do with what they assert — the classic way a real limiter
 * gets weakened to make a test suite pass.
 *
 * Per-IP is also what production does, so giving each test its own
 * address is the accurate simulation rather than a workaround.
 */
let clientIp = "";
let testIndex = 0;

describe.skipIf(!hasDatabase)("auth routes against Postgres", () => {
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
    clientIp = `10.0.0.${++testIndex}`;
    const org = await prisma().org.create({ data: { name: "Design Partner AOC" } });
    orgId = org.id;
    await prisma().user.create({
      data: {
        orgId,
        email: "safety@example.test",
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
        name: "Safety Manager",
        role: "SAFETY_MANAGER",
      },
    });
  });

  /* The limiter keys on the PLATFORM's view of the caller, not on
     X-Forwarded-For — see rateLimitKey() in server.ts, and the test
     below that proves a forged header no longer buys a fresh bucket.
     So an isolated caller here sends the platform header, exactly as
     Netlify's edge does in front of the deployed function. */
  const login = (email: string, password: string, ip: string = clientIp) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "x-nf-client-connection-ip": ip },
      payload: { email, password },
    });

  it("issues a token a seeded account can actually use", async () => {
    const res = await login("safety@example.test", PASSWORD);
    expect(res.statusCode).toBe(200);

    const { accessToken, refreshToken, role, orgId: returnedOrg } = res.json();
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
    expect(role).toBe("SAFETY_MANAGER");
    expect(returnedOrg).toBe(orgId);

    // The token has to work on a protected route, not merely parse.
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().role).toBe("SAFETY_MANAGER");
  });

  it("gives the same answer for a wrong password and a missing account", async () => {
    // A safety platform's user list is an operator's staff roster, and
    // knowing who has an account tells you who files reports.
    const wrongPassword = await login("safety@example.test", "not-the-password");
    const noSuchUser = await login("nobody@example.test", PASSWORD);

    expect(wrongPassword.statusCode).toBe(401);
    expect(noSuchUser.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(noSuchUser.json());
    expect(JSON.stringify(wrongPassword.json())).not.toMatch(/user|exist|found|password/i);
  });

  it("refuses a deactivated account", async () => {
    await prisma().user.update({
      where: { email: "safety@example.test" },
      data: { active: false },
    });
    expect((await login("safety@example.test", PASSWORD)).statusCode).toBe(401);
  });

  it("ROTATES the refresh token — the old one stops working", async () => {
    const first = (await login("safety@example.test", PASSWORD)).json();

    const refreshed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: first.refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().refreshToken).not.toBe(first.refreshToken);
  });

  it("TREATS REUSE AS THEFT — replaying a burnt token kills every session", async () => {
    // A client racing itself and an attacker replaying a stolen token
    // are indistinguishable from here, so the safe reading is theft.
    // Without this, a stolen refresh token is valid for thirty days and
    // its use is invisible.
    const a = (await login("safety@example.test", PASSWORD)).json();
    const b = (await login("safety@example.test", PASSWORD)).json(); // a second device

    // Burn a's token legitimately.
    const rotated = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: a.refreshToken },
    });
    expect(rotated.statusCode).toBe(200);

    // Now replay the burnt one.
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: a.refreshToken },
    });
    expect(replay.statusCode).toBe(401);

    // Every outstanding token is now dead — including the OTHER
    // device's, and including the one the legitimate rotation just
    // issued. That is the point: the server cannot tell which party is
    // the attacker, so it ends the argument.
    for (const token of [rotated.json().refreshToken, b.refreshToken]) {
      const after = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        payload: { refreshToken: token },
      });
      expect(after.statusCode).toBe(401);
    }

    // And it is recorded somewhere the operator cannot edit.
    const audit = await prisma().auditLog.findFirst({
      where: { orgId, action: "auth.refresh.reuse_detected" },
    });
    expect(audit, "refresh-token reuse was not written to the audit chain").not.toBeNull();
  });

  it("logout revokes every refresh token, not just the one presented", async () => {
    // "Log out" on a shared crew-room handset has to mean the device is
    // done.
    const a = (await login("safety@example.test", PASSWORD)).json();
    const b = (await login("safety@example.test", PASSWORD)).json();

    const out = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(out.statusCode).toBe(204);

    for (const token of [a.refreshToken, b.refreshToken]) {
      const after = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        payload: { refreshToken: token },
      });
      expect(after.statusCode).toBe(401);
    }
  });

  it("stores no plaintext token anywhere", async () => {
    const { refreshToken } = (await login("safety@example.test", PASSWORD)).json();
    const rows = await prisma().refreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(refreshToken);
    expect(rows[0]?.tokenHash).toHaveLength(64); // hex sha256 of an HMAC
    expect(JSON.stringify(rows)).not.toContain(refreshToken);
  });

  it("THROTTLES LOGIN — the eleventh attempt from one address is refused", async () => {
    // routes.auth.ts has declared `rateLimit: { max: 10 }` on this route
    // since it was written, with a correct comment above it explaining
    // that login is the one endpoint worth brute-forcing. The plugin
    // that makes route-level `config.rateLimit` mean anything was never
    // registered, and Fastify ignores unknown config keys in silence, so
    // the limit was decoration. Every gate passed. Login was unbounded.
    //
    // This test is what makes the limit a fact rather than a claim.
    const attacker = "203.0.113.7";
    for (let i = 0; i < 10; i++) {
      const res = await login("safety@example.test", `wrong-password-${i}`, attacker);
      expect(res.statusCode, `attempt ${i + 1} should still be allowed through`).toBe(401);
    }

    const blocked = await login("safety@example.test", "wrong-password-10", attacker);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ error: "too_many_requests" });

    // Refused WITHOUT reaching argon2 or the users table, which is the
    // point — a limiter that still does the expensive work is a denial
    // of service with extra steps.
    expect(JSON.stringify(blocked.json())).not.toMatch(/user|exist|found|password/i);

    // COUNTER-TEST. The above passes just as well if the limiter is a
    // single global counter, which would let one attacker lock out an
    // entire operator's staff — a worse failure than the one being
    // fixed. A different address must be unaffected.
    const bystander = await login("safety@example.test", PASSWORD, "198.51.100.4");
    expect(bystander.statusCode, "a second address was caught by another's limit").toBe(200);
  });

  it("BURNS A REFRESH TOKEN ATOMICALLY — two racers, one winner", async () => {
    /* The reuse check read `revokedAt`, and the burn several statements
       later wrote it unconditionally. Two requests presenting the same
       token concurrently could both read null, both pass the check, and
       both mint a fresh pair — two live chains, no reuse_detected, and
       nothing revoked, at the exact moment a stolen token is being used.

       This asserts the property the fix rests on, at the level where it
       is actually decided: the guarded UPDATE must be won by exactly one
       of two genuinely concurrent transactions. Driving two HTTP
       requests instead would not do it — inject() plus a single-threaded
       runtime lets the first finish its burn before the second reads,
       so that test passes with the defect restored, which makes it no
       test at all. */
    const { refreshToken } = (await login("safety@example.test", PASSWORD, "10.5.0.1")).json();
    const row = await prisma().refreshToken.findFirstOrThrow({
      where: { user: { email: "safety@example.test" }, revokedAt: null },
      orderBy: { id: "desc" },
    });
    expect(refreshToken).toBeTruthy();

    const burn = () =>
      prisma().refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    const [a, b] = await Promise.all([burn(), burn()]);

    expect(
      a.count + b.count,
      "both racers burned the same refresh token, so neither is detectable as reuse",
    ).toBe(1);
  });

  it("uses a CONDITIONAL burn, so losing the race is detectable", () => {
    // Charter rule 11: the assertion above is about the database's
    // behaviour and would keep passing if the route stopped using the
    // guarded form. This names the form.
    const source = readFileSync(
      resolve(__dirname, "../../apps/api/src/routes.auth.ts"),
      "utf8",
    );
    const refreshBlock = source.slice(source.indexOf("/api/v1/auth/refresh"));
    expect(refreshBlock).toMatch(
      /updateMany\(\{\s*where:\s*\{\s*id:\s*existing\.id,\s*revokedAt:\s*null\s*\}/,
    );
    expect(refreshBlock).toMatch(/burned\.count === 0/);
    expect(refreshBlock, "the unconditional burn is back").not.toMatch(
      /refreshToken\.update\(\{\s*where:\s*\{\s*id:\s*existing\.id\s*\}/,
    );
  });

  it("A FORGED HEADER DOES NOT BUY A FRESH BUCKET", async () => {
    // Found by audit. The limiter keyed on req.ip, and `trustProxy: true`
    // resolves that to the LEFTMOST X-Forwarded-For entry — the one the
    // caller writes. A random header per request therefore reset the
    // count every time, against the endpoint this file calls the one
    // worth brute-forcing. The comment above the setting asserted the
    // opposite, and this suite had been using the trick itself to get
    // clean buckets, so the exploit was committed as a test helper.
    const edge = "203.0.113.99";
    const attempt = (i: number) =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: {
          "x-nf-client-connection-ip": edge,
          // What an attacker controls. Different on every request.
          "x-forwarded-for": `10.0.0.${i}, 172.16.0.${i}`,
        },
        payload: { email: "safety@example.test", password: `wrong-password-${i}` },
      });

    for (let i = 0; i < 10; i++) {
      expect((await attempt(i)).statusCode, `attempt ${i + 1} should be allowed`).toBe(401);
    }
    const blocked = await attempt(10);
    expect(
      blocked.statusCode,
      "a rotating X-Forwarded-For reset the login limiter — the bypass is back",
    ).toBe(429);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const forged = jwt.sign(
      { sub: "someone", org: orgId, role: "ACCOUNTABLE_EXECUTIVE", typ: "access" },
      "not-the-server-secret",
      { algorithm: "HS256", issuer: "usalamasms", expiresIn: "15m" },
    );
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(res.statusCode).toBe(401);
  });

  /* ================================================================
     ADMINISTRATIVE PASSWORD RESET.

     The route exists because login/refresh/logout/me was the whole of
     authentication and a person who forgot a password had no way back
     in. What is tested here is not that it changes a hash — that part
     is hard to get wrong — but the three properties that make it a
     reset rather than a password change.
     ================================================================ */
  /* THE ACTOR IS THE ACCOUNTABLE EXECUTIVE, AND IT USED TO BE A
     SYSTEM_ADMIN — do not change it back.

     The target below is the SAFETY_MANAGER, and that pair is now
     refused: a reset RETURNS the password, so an administrator that
     reads no narrative could reset the safety manager, sign in as them
     and read the whole record. It was measured over HTTP, and
     `reset-escalation.integration.test.ts` asserts the refusal.

     Nothing about the three properties below changed — a new password
     that works, every session revoked, an audit entry without the
     credential. Only who is permitted to exercise them. The executive
     holds `user.manage` and reads org narratives already, which is the
     legitimate path that keeps the rule from being a lockout. */
  const asAdmin = async () => {
    await prisma().user.create({
      data: {
        orgId,
        email: "admin@example.test",
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
        name: "Accountable Executive",
        role: "ACCOUNTABLE_EXECUTIVE",
      },
    });
    const res = await login("admin@example.test", PASSWORD, `10.9.0.${testIndex}`);
    return res.json().accessToken as string;
  };

  const targetId = async () =>
    (await prisma().user.findFirstOrThrow({ where: { email: "safety@example.test" } })).id;

  const resetAs = (token: string, userId: string) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/admin/reset-password",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId },
    });

  it("RESETS a password, and the new one actually works", async () => {
    const token = await asAdmin();
    const res = await resetAs(token, await targetId());
    expect(res.statusCode).toBe(200);

    const { password } = res.json();
    expect(typeof password).toBe("string");
    expect(password.length).toBeGreaterThanOrEqual(12);

    // The old one is finished and the new one is live. Both halves,
    // because only checking the new one would pass on an implementation
    // that added a second valid password.
    expect((await login("safety@example.test", PASSWORD, "10.8.0.1")).statusCode).toBe(401);
    expect((await login("safety@example.test", password, "10.8.0.2")).statusCode).toBe(200);
  });

  it("REVOKES every existing session, not just the current one", async () => {
    // The property that makes this a reset. Changing the hash while
    // leaving refresh tokens alive means whoever holds one keeps their
    // access — the reset feels like a remedy and is not one.
    const victim = await login("safety@example.test", PASSWORD, "10.7.0.1");
    const stolen = victim.json().refreshToken as string;

    // It works before the reset, so the assertion after it means
    // something.
    const before = await app.inject({
      method: "POST", url: "/api/v1/auth/refresh", payload: { refreshToken: stolen },
    });
    expect(before.statusCode).toBe(200);

    const token = await asAdmin();
    expect((await resetAs(token, await targetId())).statusCode).toBe(200);

    const after = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: before.json().refreshToken },
    });
    expect(after.statusCode).not.toBe(200);
  });

  it("CANNOT reach a user in another tenant", async () => {
    // Two operators who compete on the same routes share this database.
    const other = await prisma().org.create({ data: { name: "A Competitor" } });
    const stranger = await prisma().user.create({
      data: {
        orgId: other.id,
        email: "stranger@other.test",
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
        name: "Someone Else",
        role: "SAFETY_MANAGER",
      },
    });

    const token = await asAdmin();
    const res = await resetAs(token, stranger.id);

    // 404 rather than 403: whether a user id exists in another tenant is
    // itself information this admin is not entitled to.
    expect(res.statusCode).toBe(404);

    // And the password is untouched — the refusal is real, not cosmetic.
    const after = await prisma().user.findFirstOrThrow({ where: { id: stranger.id } });
    expect(await argon2.verify(after.passwordHash, PASSWORD)).toBe(true);
  });

  it("REFUSES a caller without user.manage, however senior", async () => {
    // The safety manager is the most senior operational role and does
    // not hold user.manage. Seniority is not the permission.
    const res = await resetAs(
      (await login("safety@example.test", PASSWORD, "10.6.0.1")).json().accessToken,
      await targetId(),
    );
    expect(res.statusCode).toBe(403);
  });

  it("WRITES an audit entry naming the actor and subject, and not the password", async () => {
    const token = await asAdmin();
    const res = await resetAs(token, await targetId());
    const { password } = res.json();

    const entry = await prisma().auditLog.findFirstOrThrow({
      where: { orgId, action: "auth.password.reset" },
      orderBy: { seq: "desc" },
    });
    expect(entry.entityType).toBe("User");

    // The credential must not be recoverable from the record of the
    // reset — an audit log that stores the password it issued is a
    // second copy of it, kept forever.
    expect(JSON.stringify(entry.detail ?? {})).not.toContain(password);
    expect(JSON.stringify(entry.detail ?? {})).toContain("safety@example.test");
  });

/* ============================================================
   SIGNING UP — the route that made this product sellable.

   Nineteen screens, fifty-four routes and eleven of Annex 19's twelve
   elements, and no way for an operator to come into existence except a
   seed script run against the database by hand.

   The assertions that matter are not that it works. They are the four
   things it must refuse, because this is the only unauthenticated route
   in the product that WRITES, and every successful call creates a
   tenant.
   ============================================================ */
describe("signing up", () => {
  const NEW_OPERATOR = {
    orgName: "Rift Valley Air Charter",
    aocNumber: "KE-AOC-114",
    jurisdiction: "KE",
    fleet: 6,
    name: "Amina Odhiambo",
    email: "amina@riftvalley.test",
    password: "a-sufficiently-long-password",
  };

  /* A fresh client address per call. The route allows five an hour and
     that limit is correct — it is the only unauthenticated route in the
     product that writes, and every success creates a tenant. Sharing
     one bucket across the suite would make these tests assert the rate
     limiter rather than the route, which is the same house pattern the
     login tests above use. */
  let probe = 0;
  const signup = (body: unknown) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      headers: { "x-nf-client-connection-ip": `198.51.100.${++probe}` },
      payload: body as never,
    });

  /* THE ASSERTION WHOSE ABSENCE LET THE DEFECT SHIP. `fleet: 6` has
     been in the fixture above since this suite was written, the panel
     renders the field, the panel posts it and SignupSchema validates
     it — and the org.create never wrote it. Every operator that ever
     signed up typed how many aircraft it flies and left fleetSize null.

     The symptom was SILENCE, which is why nothing caught it:
     billableBand() returns null for a missing fleet size rather than
     quietly invoicing the cheapest band, so there was no error and no
     wrong invoice — just an operator that could not be billed and
     nothing anywhere saying why. Charter rule 8, a write that does not
     happen is reported, failing in the one place the report was a 201.

     A test that asserts a 201 asserts the route answered. This asserts
     it did the thing it answered about. */
  it("stores the fleet size it was given, which decides the price band", async () => {
    const res = await signup(NEW_OPERATOR);
    expect(res.statusCode).toBe(201);

    const org = await prisma().org.findFirst({
      where: { name: NEW_OPERATOR.orgName },
      select: { fleetSize: true },
    });
    expect(org?.fleetSize).toBe(NEW_OPERATOR.fleet);
  });

  /* And the other half: an operator that skipped it is visibly
     un-profiled rather than defaulted to something billable. */
  it("leaves the fleet size null when it was not given", async () => {
    const { fleet: _fleet, ...withoutFleet } = NEW_OPERATOR;
    expect((await signup(withoutFleet)).statusCode).toBe(201);

    const org = await prisma().org.findFirst({
      where: { name: NEW_OPERATOR.orgName },
      select: { fleetSize: true },
    });
    expect(org?.fleetSize).toBeNull();
  });

  it("records what the operator flies, from where, and what kind of flying", async () => {
    const res = await signup({
      ...NEW_OPERATOR,
      fleetTypes: ["C208", "DH8D"],
      bases: ["HKNW", "HKWJ"],
      operationTypes: ["CAT_NON_SCHEDULED", "AERIAL_WORK"],
    });
    expect(res.statusCode).toBe(201);

    const org = await prisma().org.findFirst({
      where: { name: NEW_OPERATOR.orgName },
      select: { fleetTypes: true, bases: true, operationTypes: true },
    });
    expect(org?.fleetTypes).toEqual(["C208", "DH8D"]);
    expect(org?.bases).toEqual(["HKNW", "HKWJ"]);
    expect(org?.operationTypes).toEqual(["CAT_NON_SCHEDULED", "AERIAL_WORK"]);
  });

  /* NO ESCAPE HATCH ON A DENOMINATOR. The report form lets somebody
     type an aerodrome the list has not got, because a report is about
     one event and free text beats a wrong code. A profile is what every
     rate divides BY, and a denominator nothing can group is not a
     denominator — so an unknown code is dropped here.

     DROPPED RATHER THAN REFUSED, and that is the deliberate half. A
     signup that 400s because one unrecognised type arrived is a
     customer lost over a field that was optional to begin with. */
  it("drops a code the vocabulary does not carry, and keeps the ones it does", async () => {
    const res = await signup({
      ...NEW_OPERATOR,
      fleetTypes: ["C208", "NOT-A-TYPE"],
      bases: ["HKJK", "Nairobi"],
    });
    expect(res.statusCode).toBe(201);

    const org = await prisma().org.findFirst({
      where: { name: NEW_OPERATOR.orgName },
      select: { fleetTypes: true, bases: true },
    });
    expect(org?.fleetTypes).toEqual(["C208"]);
    /* "Nairobi" is the exact string the taxonomy module names as the
       failure it exists to prevent — HKJK, JKIA and Nairobi being three
       aerodromes to a GROUP BY. */
    expect(org?.bases).toEqual(["HKJK"]);
  });

  it("de-duplicates rather than storing one type twice", async () => {
    expect(
      (await signup({ ...NEW_OPERATOR, fleetTypes: ["C208", "C208", "DH8D"] })).statusCode,
    ).toBe(201);
    const org = await prisma().org.findFirst({
      where: { name: NEW_OPERATOR.orgName },
      select: { fleetTypes: true },
    });
    expect(org?.fleetTypes).toEqual(["C208", "DH8D"]);
  });

  it("creates the operator and signs its accountable executive in", async () => {
    const res = await signup(NEW_OPERATOR);
    expect(res.statusCode).toBe(201);

    const body = res.json();
    expect(body.role).toBe("ACCOUNTABLE_EXECUTIVE");
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();

    const org = await prisma().org.findFirstOrThrow({ where: { name: NEW_OPERATOR.orgName } });
    expect(org.aocNumber).toBe("KE-AOC-114");
    const user = await prisma().user.findUniqueOrThrow({ where: { email: NEW_OPERATOR.email } });
    expect(user.orgId).toBe(org.id);
    expect(user.role).toBe("ACCOUNTABLE_EXECUTIVE");
  });

  it("REFUSES A ROLE FROM THE BODY — the first user is the accountable executive", async () => {
    /* The post Annex 19 makes personally answerable, and the only one
       that may sign a safety policy. A signup form does not get to
       choose it, and a payload that could ask is a payload somebody
       will eventually send. */
    const res = await signup({ ...NEW_OPERATOR, role: "SYSTEM_ADMIN" });
    expect(res.statusCode).toBe(201);
    const user = await prisma().user.findUniqueOrThrow({ where: { email: NEW_OPERATOR.email } });
    expect(user.role).toBe("ACCOUNTABLE_EXECUTIVE");
  });

  it("CANNOT JOIN AN EXISTING ORGANISATION", async () => {
    /* Joining an operator is an invitation issued from inside it.
       Conflating the two is how one operator's safety officer ends up
       reading another's reports — so `orgId` is not in the schema and
       the attempt creates a NEW tenant rather than being honoured. */
    const res = await signup({ ...NEW_OPERATOR, orgId });
    expect(res.statusCode).toBe(201);
    const user = await prisma().user.findUniqueOrThrow({ where: { email: NEW_OPERATOR.email } });
    expect(user.orgId).not.toBe(orgId);
  });

  it("DOES NOT SAY WHETHER AN EMAIL ALREADY EXISTS", async () => {
    /* The login route goes to real trouble not to be an account
       enumeration oracle — a dummy hash so the timing matches, one
       message for three outcomes. A signup form answering "that address
       is taken" hands the oracle straight back, and the user list of a
       safety platform is an operator's staff roster. */
    expect((await signup(NEW_OPERATOR)).statusCode).toBe(201);
    const second = await signup({ ...NEW_OPERATOR, orgName: "Someone Else Ltd" });

    expect(second.statusCode).toBe(409);
    const said = JSON.stringify(second.json()).toLowerCase();
    expect(said).not.toContain("exists");
    expect(said).not.toContain("taken");
    expect(said).not.toContain("registered");
    expect(said).not.toContain(NEW_OPERATOR.email);

    // And the refusal created nothing.
    expect(await prisma().org.count({ where: { name: "Someone Else Ltd" } })).toBe(0);
  });

  it("refuses a password shorter than the login route demands", async () => {
    const res = await signup({ ...NEW_OPERATOR, password: "short" });
    expect(res.statusCode).toBe(400);
    expect(await prisma().org.count({ where: { name: NEW_OPERATOR.orgName } })).toBe(0);
  });

  it("ANCHORS THE AUDIT CHAIN AT THE MOMENT THE OPERATOR BEGAN", async () => {
    /* An organisation whose audit log starts at its first report cannot
       show when it started. This entry is what an inspector reads to
       date the record. */
    await signup(NEW_OPERATOR);
    const org = await prisma().org.findFirstOrThrow({ where: { name: NEW_OPERATOR.orgName } });
    const first = await prisma().auditLog.findFirstOrThrow({
      where: { orgId: org.id },
      orderBy: { seq: "asc" },
    });
    expect(first.action).toBe("org.create");
    expect(first.entityId).toBe(org.id);
  });

  it("starts a tenant that can see nothing of anybody else's", async () => {
    /* The invariant every other route depends on, asserted at the one
       place a tenant is born. */
    const res = await signup(NEW_OPERATOR);
    const { accessToken } = res.json();
    const queue = await app.inject({
      method: "GET",
      url: "/api/v1/reports/queue",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().reports).toHaveLength(0);
  });
});
});
