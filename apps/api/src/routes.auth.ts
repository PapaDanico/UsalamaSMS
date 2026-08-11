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
  appendAuditTx, authenticate,
} from "./core";

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
      const ok = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password).catch(() => false);

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

      // Burn this one, then issue the replacement.
      await prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });

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
  app.get("/api/v1/auth/me", { preHandler: [authenticate] }, async (req) => ({
    userId: req.auth!.sub,
    orgId: req.auth!.org,
    role: req.auth!.role,
  }));
}
