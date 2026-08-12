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

describe("a KDF failure", () => {
  it("is LOGGED, while the response stays indistinguishable", () => {
    // `.catch(() => false)` discarded the exception entirely. An argon2
    // native-binding failure after a runtime bump would make every
    // verification throw, every login return 401, and the only trace be
    // "login failed" — a total authentication outage on a safety
    // platform, indistinguishable in the logs from a bad week for
    // passwords, with health and readiness both still green.
    const loginBlock = auth.slice(auth.indexOf("/api/v1/auth/login"));
    expect(loginBlock, "the KDF exception is discarded rather than logged").not.toMatch(
      /verifyPassword\([\s\S]{0,120}?\.catch\(\(\)\s*=>\s*false\)/,
    );
    expect(loginBlock).toMatch(/verifyPassword\([\s\S]{0,200}?\.catch\([\s\S]{0,200}?log\.error/);

    // And the response must NOT change shape — a KDF failure that
    // returned 500 would tell an attacker which accounts exist.
    expect(loginBlock).toMatch(/return false;/);
    expect(loginBlock).toMatch(/GENERIC_FAILURE/);
  });
});

describe("logout", () => {
  it("revokes every refresh token for the user, not just the one presented", () => {
    const logoutBlock = auth.slice(auth.indexOf("/api/v1/auth/logout"));
    expect(logoutBlock).toMatch(/updateMany\(\{[\s\S]*?userId: req\.auth!\.sub, revokedAt: null/);
  });
});

/* =====================================================================
   What the rate limiter counts against.

   Unlike its neighbours in this file, this one imports the function and
   runs it. rateLimitKey is pure, so the rule can be stated as
   arithmetic rather than as a grep — and the rule is the whole control:
   the limiter must count the platform's view of the caller, never a
   value the caller writes.
   ===================================================================== */
import { rateLimitKey } from "../apps/api/src/rate-limit-key";

describe("the rate limiter's key", () => {
  it("PREFERS the edge's view over anything the caller sent", () => {
    // The defect: keying on req.ip, which under `trustProxy: true`
    // resolves to the leftmost X-Forwarded-For entry — chosen by the
    // caller. A random header per request bought a fresh bucket.
    const a = rateLimitKey({ "x-nf-client-connection-ip": "203.0.113.7" }, "10.0.0.1");
    const b = rateLimitKey({ "x-nf-client-connection-ip": "203.0.113.7" }, "10.0.0.999");
    expect(a).toBe(b);
  });

  it("falls back to the connection address when the edge says nothing", () => {
    expect(rateLimitKey({}, "10.0.0.1")).not.toBe(rateLimitKey({}, "10.0.0.2"));
  });

  it("cannot be made to collide across the two sources", () => {
    // An `ip:`/`edge:` prefix, so a caller who could somehow set their
    // fallback address to another caller's edge address still lands in
    // a different bucket rather than inheriting or exhausting theirs.
    expect(rateLimitKey({}, "203.0.113.7")).not.toBe(
      rateLimitKey({ "x-nf-client-connection-ip": "203.0.113.7" }, "10.0.0.1"),
    );
  });

  it("ignores an empty or whitespace edge header rather than bucketing everyone together", () => {
    // A blank header must not become one shared key for every caller,
    // which would let one attacker exhaust the limit for all of them.
    expect(rateLimitKey({ "x-nf-client-connection-ip": "   " }, "10.0.0.1")).toBe(
      rateLimitKey({}, "10.0.0.1"),
    );
    expect(rateLimitKey({ "x-nf-client-connection-ip": "   " }, "10.0.0.1")).not.toBe(
      rateLimitKey({ "x-nf-client-connection-ip": "   " }, "10.0.0.2"),
    );
  });

  it("keeps one hop of proxy trust, so the fallback is not free to forge", () => {
    /* Line-anchored, so the comment above the setting — which quotes
       the old value to explain what it did — is not mistaken for the
       setting itself. A comment line starts with `//`. */
    expect(server).toMatch(/^\s*trustProxy:\s*1,/m);
    expect(server, "trustProxy: true resolves req.ip to the caller's own header").not.toMatch(
      /^\s*trustProxy:\s*true/m,
    );
  });
});
