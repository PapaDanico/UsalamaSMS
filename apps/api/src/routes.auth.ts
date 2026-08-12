// =====================================================================
// UsalamaSMS API — authentication.
//
// LoginSchema, issueAccessToken and issueRefreshToken were written in
// the first pass and were unreachable: no route referenced them. This
// file makes them reachable, and adds the two things a refresh-token
// implementation is worthless without — ROTATION and REUSE DETECTION.
// =====================================================================
import type { FastifyInstance } from "fastify";
import { LoginSchema } from "@usalamasms/shared";
import {
  prisma, ENV, hmac, verifyPassword, issueAccessToken, issueRefreshToken,
  appendAuditTx, authenticate, requirePermission,
} from "./core";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";

/**
 * Every failed login returns this, with this status, after roughly the
 * same amount of work.
 *
 * Distinguishing "no such user" from "wrong password" hands an attacker
 * a free account enumeration oracle. On this product that is worse than
 * usual: the user list of a safety platform is the staff roster of an
 * operator, and knowing who has an account tells you who files reports.
 */
const GENERIC_FAILURE = { error: "invalid_credentials" } as const;

/**
 * A dummy argon2 hash, verified against when no user matched.
 *
 * Without it the "user not found" path returns in microseconds while
 * the "wrong password" path spends ~100 ms in argon2 — a timing
 * difference big enough to enumerate accounts over the public internet
 * with no special tooling. The generic message above is worth nothing
 * if the clock answers the question anyway.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0c2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ------------------------------ Login ------------------------------
  app.post(
    "/api/v1/auth/login",
    {
      config: {
        // Tighter than the sync route by an order of magnitude. Sync is
        // a device catching up; login is the one endpoint worth
        // brute-forcing.
        rateLimit: { max: 10, timeWindow: "15 minutes" },
      },
    },
    async (req, reply) => {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(GENERIC_FAILURE);
      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, orgId: true, role: true, passwordHash: true, active: true },
      });

      // Always run the KDF, even with no user and even for a deactivated
      // one, so all three paths cost the same.
      // The catch keeps the RESPONSE indistinguishable — a KDF failure
      // must not become a different status code that tells an attacker
      // which accounts exist. What it used to do as well was discard the
      // exception entirely, and that is a different thing: an argon2
      // native-binding failure after a runtime bump would make every
      // verification throw, every login return 401, and the only trace
      // be "login failed" — a total authentication outage on a safety
      // platform, indistinguishable in the logs from a bad week for
      // passwords, with health and readiness both still green.
      const ok = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password).catch((err) => {
        req.log.error({ err: { message: String(err) } }, "password verification threw");
        return false;
      });

      if (!user || !user.active || !ok) {
        // Logged for the operator's own security review, and the log
        // line deliberately does NOT say which of the three it was —
        // the log is read by people, and people repeat what they read.
        req.log.warn({ email: hmac(email.toLowerCase()) }, "login failed");
        return reply.code(401).send(GENERIC_FAILURE);
      }

      const accessToken = issueAccessToken({ sub: user.id, org: user.orgId, role: user.role });
      const refreshToken = await issueRefreshToken(user.id);

      return reply.send({
        accessToken,
        refreshToken,
        expiresIn: ENV.ACCESS_TTL,
        role: user.role,
        orgId: user.orgId,
      });
    },
  );

  // ----------------------------- Refresh -----------------------------
  app.post(
    "/api/v1/auth/refresh",
    { config: { rateLimit: { max: 60, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const token = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
      if (typeof token !== "string" || token.length < 32) {
        return reply.code(401).send({ error: "invalid_refresh_token" });
      }

      const tokenHash = hmac(token);

      // ==============================================================
      // ROTATION WITH REUSE DETECTION.
      //
      // Each refresh burns the token and issues a new one. If a token
      // that has ALREADY been revoked is presented, one of two things
      // happened: a client raced itself, or someone is replaying a
      // stolen token. The two are indistinguishable from here, so the
      // safe reading is theft — and the response is to revoke every
      // outstanding token for that user, forcing a fresh login on every
      // device including the attacker's.
      //
      // Without this, a stolen refresh token is valid for thirty days
      // and its use is invisible. On a platform holding confidential
      // safety reports, a silently persistent session is the whole
      // breach.
      // ==============================================================
      const existing = await prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, revokedAt: true },
      });

      if (!existing) return reply.code(401).send({ error: "invalid_refresh_token" });

      if (existing.revokedAt) {
        await prisma.$transaction(async (tx) => {
          await tx.refreshToken.updateMany({
            where: { userId: existing.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          const user = await tx.user.findUnique({
            where: { id: existing.userId },
            select: { orgId: true },
          });
          if (user) {
            await appendAuditTx(tx, {
              orgId: user.orgId,
              userId: existing.userId,
              action: "auth.refresh.reuse_detected",
              entityType: "User",
              entityId: existing.userId,
              detail: { allSessionsRevoked: true },
            });
          }
        });
        req.log.error({ userId: existing.userId }, "refresh token reuse — all sessions revoked");
        return reply.code(401).send({ error: "invalid_refresh_token" });
      }

      if (existing.expiresAt.getTime() < Date.now()) {
        return reply.code(401).send({ error: "invalid_refresh_token" });
      }

      const user = await prisma.user.findUnique({
        where: { id: existing.userId },
        select: { id: true, orgId: true, role: true, active: true },
      });
      if (!user || !user.active) return reply.code(401).send({ error: "invalid_refresh_token" });

      // ==============================================================
      // BURN IT CONDITIONALLY, and treat losing the race as reuse.
      //
      // This was `update({ where: { id } })` — unconditional — against a
      // `revokedAt` that had been READ several statements earlier. Two
      // requests presenting the same token concurrently both read null,
      // both passed the reuse check above, and both minted a fresh pair.
      // Two live token chains, no reuse_detected, nothing revoked: the
      // theft this whole block exists to catch, invisible for the full
      // thirty days, precisely when it is being actively exploited.
      //
      // `updateMany` with `revokedAt: null` in the WHERE makes the check
      // and the write one atomic statement. Exactly one racer can get a
      // count of 1. The loser did not present an unused token — somebody
      // else used it first — which is the definition of reuse, so it
      // falls through to the same revoke-everything response rather
      // than to a quiet 401.
      // ==============================================================
      const burned = await prisma.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (burned.count === 0) {
        await prisma.$transaction(async (tx) => {
          await tx.refreshToken.updateMany({
            where: { userId: existing.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await appendAuditTx(tx, {
            orgId: user.orgId,
            userId: existing.userId,
            action: "auth.refresh.reuse_detected",
            entityType: "User",
            entityId: existing.userId,
            detail: { allSessionsRevoked: true, concurrent: true },
          });
        });
        req.log.error(
          { userId: existing.userId },
          "refresh token used twice concurrently — all sessions revoked",
        );
        return reply.code(401).send({ error: "invalid_refresh_token" });
      }

      const accessToken = issueAccessToken({ sub: user.id, org: user.orgId, role: user.role });
      const refreshToken = await issueRefreshToken(user.id);

      return reply.send({ accessToken, refreshToken, expiresIn: ENV.ACCESS_TTL });
    },
  );

  // ------------------------------ Logout -----------------------------
  app.post(
    "/api/v1/auth/logout",
    { preHandler: [authenticate] },
    async (req, reply) => {
      // Revokes every refresh token for the caller, not just the one
      // presented. "Log out" on a shared handset in a crew room has to
      // mean the device is done, and a per-token logout leaves the other
      // tokens live on a machine the next person is about to use.
      //
      // The access token remains valid until it expires — 15 minutes.
      // A revocation list for access tokens would mean a database read
      // on every request to solve a 15-minute window, which is the wrong
      // trade at this scale. It is a real gap and it is bounded.
      await prisma.refreshToken.updateMany({
        where: { userId: req.auth!.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return reply.code(204).send();
    },
  );

  // ------------------------------- Me --------------------------------
  /* ------------------ Administrative password reset ------------------

     THE HOLE THIS FILLS. Login, refresh, logout and me were the whole
     of authentication. A safety manager who forgot their password had
     no route back in — not a self-service one, and not an
     administrative one either. On a product handed to an operator with
     fifteen staff, that is not an edge case; it is the second week.

     WHY ADMINISTRATIVE RATHER THAN SELF-SERVICE. A self-service reset
     needs an email sender, which is another external service, another
     key to configure and another delivery path to fail quietly. An
     operator this size has a person who does this. That person is the
     SYSTEM_ADMIN, and the route is auditable, which an email link is
     not.

     THREE PROPERTIES THAT ARE THE WHOLE POINT:

       1. IT REVOKES EVERY SESSION. Changing a password hash while
          leaving refresh tokens alive means an attacker who has one
          keeps it — the reset feels like a remedy and is not one. A
          reset is a statement that the old credential is finished, and
          that has to include the tokens issued from it.

       2. IT CANNOT CROSS A TENANT. The target is looked up inside the
          caller's own org. Two operators who compete on the same routes
          share this database, and an admin of one resetting an account
          in the other is the worst breach this product could have.

       3. THE ADMIN STILL CANNOT READ A REPORT. SYSTEM_ADMIN holds
          user.manage and org.manage and NO narrative permission — see
          the note beside NARRATIVE_PERMISSIONS. Being able to restore
          somebody's access is not being able to read what they filed in
          confidence, and this route does not quietly become the way
          around that.

     The new password is returned ONCE, in the response, for the admin
     to hand over. It is never stored in the clear and never logged: the
     audit entry records that a reset happened, by whom, to whom — not
     what the password is. */
  app.post<{ Body: { userId?: unknown } }>(
    "/api/v1/auth/admin/reset-password",
    {
      preHandler: [authenticate, requirePermission("user.manage")],
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (req, reply) => {
      const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
      if (!userId) return reply.code(400).send({ error: "user_id_required" });

      /* Scoped to the caller's org in the WHERE clause rather than
         fetched and then checked. A check after the fact is a check
         somebody removes during a refactor without noticing what it
         was for. */
      const target = await prisma.user.findFirst({
        where: { id: userId, orgId: req.auth!.org },
        select: { id: true, email: true, role: true },
      });
      if (!target) return reply.code(404).send({ error: "user_not_found" });

      /* 18 bytes of base64url — comfortably past the 12 characters
         LoginSchema demands, and generated here rather than chosen, so
         a temporary password is never a memorable one somebody keeps. */
      const password = randomBytes(18).toString("base64url");
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: target.id }, data: { passwordHash } });

        // Property 1. Every outstanding refresh token, not just the
        // current one — a reset that leaves a session alive is not a
        // reset.
        await tx.refreshToken.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        await appendAuditTx(tx, {
          orgId: req.auth!.org,
          userId: req.auth!.sub,
          action: "auth.password.reset",
          entityType: "User",
          entityId: target.id,
          // The subject and the actor, never the credential.
          detail: { targetEmail: target.email, targetRole: target.role },
        });
      });

      return {
        userId: target.id,
        email: target.email,
        password,
        note:
          "Shown once. Hand it over directly and have them change it. " +
          "Every existing session for this account has been signed out.",
      };
    },
  );

  app.get("/api/v1/auth/me", { preHandler: [authenticate] }, async (req) => ({
    userId: req.auth!.sub,
    orgId: req.auth!.org,
    role: req.auth!.role,
  }));
}
