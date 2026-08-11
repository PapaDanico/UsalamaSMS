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
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { prisma, reset, migrate, disconnect, hasDatabase } from "./db.setup";

process.env["JWT_SECRET"] = "integration-test-secret-not-a-real-one";
process.env["DEIDENT_SALT"] = "integration-test-salt";
process.env["LOG_LEVEL"] = "silent";

const PASSWORD = "a-sufficiently-long-test-password";

let app: FastifyInstance;
let orgId: string;

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

  const login = (email: string, password: string) =>
    app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
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
});
