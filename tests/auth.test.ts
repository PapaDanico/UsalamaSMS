// =====================================================================
// Authentication guards.
//
// Source-level, for the same reason the confidentiality guards are:
// these are properties of ABSENCE and of control flow — a branch that
// must not distinguish two cases, a token that must be revoked — and
// asserting them properly needs a live Postgres. This suite runs on a
// laptop with no database, so it reads the source, names exactly what
// it looks for, and fails when its subject is gone (charter rule 11).
//
// They are not a substitute for integration tests against a real
// database. They are a substitute for nothing at all, which is what
// these behaviours had before.
// =====================================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const read = (p: string): string => readFileSync(resolve(ROOT, p), "utf8");

const auth = read("apps/api/src/routes.auth.ts");
const server = read("apps/api/src/server.ts");
const core = read("apps/api/src/core.ts");

describe("the auth routes exist and are reachable", () => {
  it("guards files that still exist", () => {
    expect(auth.length).toBeGreaterThan(500);
    expect(auth).toContain("/api/v1/auth/login");
    expect(auth).toContain("/api/v1/auth/refresh");
  });

  it("is actually mounted — the defect that made the first pass unreachable", () => {
    // LoginSchema, issueAccessToken and issueRefreshToken all existed
    // and no route referenced them. A module nothing imports still
    // typechecks and still passes its unit tests, so nothing caught it.
    expect(server).toContain("authRoutes");
    expect(server).toMatch(/register\(authRoutes\)/);
  });
});

describe("login does not leak which accounts exist", () => {
  it("returns one generic failure for every rejection path", () => {
    // A safety platform's user list is an operator's staff roster.
    // Knowing who has an account tells you who files reports.
    expect(auth).toContain("GENERIC_FAILURE");
    const loginBlock = auth.slice(auth.indexOf("/api/v1/auth/login"), auth.indexOf("/api/v1/auth/refresh"));
    // No branch may say "no such user" or "wrong password".
    expect(loginBlock).not.toMatch(/user_not_found|no_such_user|wrong_password|bad_password/i);
    // The single rejection returns the shared constant.
    expect(loginBlock).toMatch(/reply\.code\(401\)\.send\(GENERIC_FAILURE\)/);
  });

  it("spends the same time on a missing user as on a wrong password", () => {
    // Without a dummy verification the "no user" path returns in
    // microseconds while the "wrong password" path spends ~100ms in
    // argon2 — enumerable over the internet with no tooling. The
    // generic message is worth nothing if the clock answers anyway.
    expect(auth).toContain("DUMMY_HASH");
    expect(auth).toMatch(/verifyPassword\(user\?\.passwordHash \?\? DUMMY_HASH/);
  });

  it("does not log the email in clear on a failed attempt", () => {
    // The failure log is read during a security review by people who
    // repeat what they read.
    expect(auth).toMatch(/email: hmac\(/);
  });
});

describe("refresh tokens rotate, and reuse is treated as theft", () => {
  const refreshBlock = auth.slice(
    auth.indexOf("/api/v1/auth/refresh"),
    auth.indexOf("/api/v1/auth/logout"),
  );

  it("guards a block that still exists", () => {
    expect(refreshBlock.length).toBeGreaterThan(400);
  });

  it("burns the presented token and issues a new one", () => {
    expect(refreshBlock).toContain("revokedAt: new Date()");
    expect(refreshBlock).toContain("issueRefreshToken");
  });

  it("revokes EVERY session when an already-revoked token is presented", () => {
    // A client racing itself and an attacker replaying a stolen token
    // are indistinguishable from the server. The safe reading is theft.
    // Without this, a stolen refresh token is valid for thirty days and
    // its use is invisible.
    expect(refreshBlock).toContain("existing.revokedAt");
    expect(refreshBlock).toMatch(/updateMany\(\{[\s\S]*?userId: existing\.userId, revokedAt: null/);
    expect(refreshBlock).toContain("auth.refresh.reuse_detected");
  });

  it("writes the reuse event to the audit chain", () => {
    // The operator must be able to see this happened, and the audit
    // chain is the only record in this product that cannot be edited.
    expect(refreshBlock).toContain("appendAuditTx");
  });

  it("rejects an expired token", () => {
    expect(refreshBlock).toContain("existing.expiresAt.getTime() < Date.now()");
  });

  it("rejects a token belonging to a deactivated user", () => {
    // Deactivating a user must end their sessions, not merely stop new
    // logins — otherwise a dismissed employee keeps reading safety
    // reports for up to thirty days.
    expect(refreshBlock).toMatch(/!user \|\| !user\.active/);
  });
});

describe("token storage", () => {
  it("stores refresh tokens as a keyed hash, never in clear", () => {
    expect(core).toMatch(/tokenHash: hmac\(raw\)/);
    expect(core).not.toMatch(/tokenHash: raw/);
  });

  it("looks tokens up by the same function it stored them with", () => {
    // A mismatch here means every refresh fails and the symptom is
    // "users are randomly logged out", which gets debugged for a day.
    expect(auth).toContain("hmac(token)");
  });

  it("uses a keyed HMAC rather than a bare digest", () => {
    // A user id is low-entropy: given the salt, an unkeyed digest of
    // every id in the users table reverses the de-identification token
    // in seconds, and the salt lives in the same environment as the
    // credentials that leaked it.
    expect(core).toContain("createHmac");
    expect(core).toMatch(/reporterDupToken[\s\S]{0,200}hmac\(/);
  });
});

describe("logout", () => {
  it("revokes every refresh token for the user, not just the one presented", () => {
    const logoutBlock = auth.slice(auth.indexOf("/api/v1/auth/logout"));
    expect(logoutBlock).toMatch(/updateMany\(\{[\s\S]*?userId: req\.auth!\.sub, revokedAt: null/);
  });
});
