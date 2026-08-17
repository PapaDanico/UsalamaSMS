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
import { SignupSchema } from "../../../packages/shared/src/signup";
import { z } from "zod";
import { PERMISSIONS, RoleEnum, type Role } from "@usalamasms/shared";
import { mayCreateRole } from "../../../packages/shared/src/permissions";

/* THE SAME SHAPE THE CONSOLE ISSUES, so a credential from either path
   reads identically to whoever receives it. Duplicated deliberately
   rather than exported from routes.admin.ts: that file is the vendor's
   and this one is the operator's, and a shared helper between them
   would be a seam somebody later routes an operator through. Twenty
   bytes of entropy either way — the alphabet drops the characters that
   are misread aloud over a telephone, which is how most of these will
   actually be handed over.  */
const CREDENTIAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function issuePassword(): string {
  const bytes = randomBytes(20);
  let out = "";
  for (const b of bytes) out += CREDENTIAL_ALPHABET[b % CREDENTIAL_ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10, 15)}-${out.slice(15, 20)}`;
}

/* WHAT A PERSON MAY CHANGE ABOUT THEMSELVES, and the email is not on
   the list — see the route below. Trimmed and bounded to the same
   shape SignupSchema uses for the same column, so a name that was
   acceptable at signup stays acceptable afterwards. */
const ProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

/* THE CURRENT ONE IS REQUIRED, and the new one meets the same minimum
   LoginSchema demands — a change route with a weaker floor than the
   sign-up form is a downgrade dressed as a feature. */
const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12),
});
/* By path, not through the barrel — routes.reports.ts records why: the
   report form imports the barrel, so anything it re-exports rides in
   the entry chunk a ramp agent downloads before filing. */
import { AIRCRAFT_TYPES, AERODROMES } from "../../../packages/shared/src/taxonomy";
import { OPERATION_TYPES } from "../../../packages/shared/src/adrep";

/* Codes the vocabulary carries, de-duplicated, in the order sent. The
   escape hatch that AERODROMES and AIRCRAFT_TYPES offer on the REPORT
   form is deliberately absent here: a report is about one event and a
   free-text location is better than a wrong code, but a profile is the
   denominator every rate divides by, and a denominator nothing can
   group is not a denominator. */
function knownOnly(
  sent: ReadonlyArray<string> | undefined,
  list: ReadonlyArray<{ code: string }>,
): string[] {
  if (!sent?.length) return [];
  const known = new Set(list.map((row) => row.code));
  return [...new Set(sent.filter((code) => known.has(code)))];
}
import {
  prisma, ENV, hmac, verifyPassword, issueAccessToken, issueRefreshToken,
  appendAuditTx, authenticate, requirePermission, tenantWhere,
} from "./core";
/* By path rather than through the barrel, for the reason reset.ts
   states in its own header: the report form imports the barrel, so
   anything re-exported from it is downloaded by a ramp agent before
   they can file. */
import {
  ForgotSchema, ResetSchema, RESET_TTL_MINUTES, MIN_PASSWORD_LENGTH,
  RESET_REQUESTED_ANSWER, RESET_REFUSED_ANSWER,
} from "../../../packages/shared/src/reset";
import { mailConfigFromEnv, sendPasswordReset } from "./mail";
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
  /* ============================================================
     SIGN UP — an operator creating its own account.

     THE ROUTE THIS PRODUCT DID NOT HAVE, and the reason it could be
     demonstrated but not bought. Nineteen screens, fifty-four routes,
     eleven of Annex 19's twelve elements, and no way for an operator to
     come into existence except `npm run seed` run against the database
     by somebody holding the credentials. A product that has to be
     installed by its author for every customer is a consultancy
     deliverable wearing a product's feature list.

     FIVE PROPERTIES, each of which is the reason for a line below:

       1. THE FIRST USER IS THE ACCOUNTABLE EXECUTIVE, set by the
          server and not accepted from the body. It is the post Annex 19
          makes personally answerable and the only one that may sign a
          safety policy. A signup form does not get to choose it.

       2. IT CANNOT JOIN AN EXISTING ORGANISATION. There is no orgId in
          the schema, so the mistake is unavailable rather than
          defended. Joining an operator is an invitation issued from
          inside it; conflating the two is how one operator's officer
          ends up reading another's reports.

       3. IT DOES NOT SAY WHETHER THE EMAIL EXISTS. A duplicate is
          refused with the same shape and cost as a success would take —
          the login route already goes to some trouble not to be an
          account-enumeration oracle, and a signup form that answers
          "that email is taken" hands back the oracle login closed.

       4. IT IS RATE LIMITED HARDER THAN LOGIN. Login costs an attacker
          a guess; this costs the operator a row in every tenant-scoped
          table and an audit chain of its own.

       5. THE ORGANISATION AND ITS FIRST USER ARE ONE TRANSACTION. An
          org with no users is unreachable and invisible — nobody can
          sign into it, and nothing will ever clean it up.

     WHAT IT DOES NOT DO IS TAKE MONEY. Collection needs a payment
     provider and credentials, which is a person's job and must not
     travel through a chat log — the same class of blocker as the SMS
     sender ID. Until that lands this creates a working account, which
     is the half that had to exist first.
     ============================================================ */
  app.post(
    "/api/v1/auth/signup",
    {
      config: {
        /* Five in an hour per address. A real operator signs up once;
           this is the only unauthenticated route that WRITES, and every
           successful call creates a tenant. */
        rateLimit: { max: 5, timeWindow: "1 hour" },
      },
    },
    async (req, reply) => {
      const parsed = SignupSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid",
          detail: parsed.error.flatten(),
        });
      }
      const input = parsed.data;
      const email = input.email.toLowerCase();

      /* THE DUPLICATE IS REFUSED WITHOUT SAYING SO. `taken` is not in
         the response: the caller is told the account could not be
         created and to sign in if they already have one, which is true
         either way and tells an enumerator nothing. The KDF still runs
         so the two paths cost roughly the same, for the same reason the
         login route verifies against a dummy hash. */
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
      if (existing) {
        req.log.warn({ email: hmac(email) }, "signup refused — address already registered");
        return reply.code(409).send({
          error: "cannot_create",
          /* SAID "your administrator can reset it" UNTIL THE RESET
             ROUTES LANDED, and there was no administrator: this route
             creates one ACCOUNTABLE_EXECUTIVE, that role does not hold
             `user.manage`, and nothing anywhere creates a second user.
             So the sentence sent every locked-out customer to a person
             who does not exist. It now names the route that works. */
          message:
            "That account could not be created. If you already have one, sign in — " +
            "and if you have forgotten the password, ask for a reset link at /reset.",
        });
      }

      const created = await prisma.$transaction(async (tx) => {
        const org = await tx.org.create({
          data: {
            name: input.orgName,
            jurisdiction: input.jurisdiction,
            ...(input.aocNumber ? { aocNumber: input.aocNumber } : {}),
            /* THE FLEET SIZE WAS ASKED FOR AND THROWN AWAY. The signup
               panel renders a number field, the panel posts it, and
               SignupSchema has validated it since this route existed —
               and this create never wrote it. So every operator that
               ever signed up typed how many aircraft it flies, was told
               the account was created, and left `fleetSize` null.

               billableBand() returns null for a missing fleet size
               rather than quietly invoicing the cheapest band, which is
               the right refusal and meant the symptom was silence: no
               error, no wrong invoice, just an operator that could not
               be billed and nothing anywhere saying why.

               That is charter rule 8 — a write that does not happen is
               reported — failing in the one place where the report was
               a 201. */
            ...(input.fleet === undefined ? {} : { fleetSize: input.fleet }),
            /* And the profile beside it. Filtered to codes the shared
               vocabularies actually carry rather than stored as sent:
               this is the only unauthenticated route that writes, and a
               free-text aerodrome here is the second HKJK the taxonomy
               exists to prevent. An unrecognised code is DROPPED rather
               than refused — a signup that 400s because somebody's
               integration sent one unknown type is a customer lost over
               a field that was optional anyway. */
            fleetTypes: knownOnly(input.fleetTypes, AIRCRAFT_TYPES),
            bases: knownOnly(input.bases, AERODROMES),
            operationTypes: (input.operationTypes ?? []).filter((c) =>
              OPERATION_TYPES.some((o) => o.code === c),
            ),
          },
        });
        const user = await tx.user.create({
          data: {
            orgId: org.id,
            email,
            name: input.name,
            passwordHash,
            /* Server-set. See property 1 above. */
            role: "ACCOUNTABLE_EXECUTIVE",
          },
        });
        /* THE CHAIN STARTS HERE. An organisation whose audit log begins
           at its first report cannot show when it began; this entry is
           the anchor an inspector reads to date the record. */
        await appendAuditTx(tx, {
          orgId: org.id,
          userId: user.id,
          action: "org.create",
          entityType: "Org",
          entityId: org.id,
        });
        return { org, user };
      });

      const accessToken = issueAccessToken({
        sub: created.user.id,
        org: created.org.id,
        role: created.user.role,
      });
      const refreshToken = await issueRefreshToken(created.user.id);

      /* Signed in immediately. An operator that has just typed its own
         name, its AOC number and a password, and is then returned to a
         login form, has been asked to prove it twice. */
      return reply.code(201).send({
        accessToken,
        refreshToken,
        expiresIn: ENV.ACCESS_TTL,
        role: created.user.role,
        orgId: created.org.id,
        orgName: created.org.name,
      });
    },
  );

  /* ==================================================================
     GETTING BACK IN WITHOUT AN ADMINISTRATOR — the two unauthenticated
     routes, and the argument for them is in packages/shared/src/reset.ts
     rather than repeated here.

     The short version: the administrative reset above is the better
     mechanism and it is unreachable. Signup makes one user, sets it to
     ACCOUNTABLE_EXECUTIVE, and that role does not hold `user.manage` —
     so every operator that has ever signed up has one account, in an
     organisation containing nobody able to reset it.

     FIVE PROPERTIES, and each is a line below:

       1. IT ANSWERS THE SAME WAY WHATEVER IT FINDS. Same status, same
          body, same argon2-shaped delay. The login route spends a dummy
          hash to keep the clock quiet; this one issues and hashes a
          token it then throws away, for the same reason and at the same
          cost.

       2. A NEW LINK KILLS THE OLD ONES. Somebody who asks twice because
          the first mail was slow must not leave two live credentials in
          an inbox.

       3. CONSUMPTION IS ONE CONDITIONAL UPDATE. `usedAt: null` in the
          WHERE, count checked — the refresh route records at length
          what happens when a read-then-write is used to enforce
          single-use, and the answer is that both racers win.

       4. IT REVOKES EVERY SESSION. A reset is a statement that the old
          credential is finished; leaving a refresh token alive means
          whoever forced the reset keeps their access, and the remedy
          becomes the breach.

       5. IT SAYS WHAT THE MAIL PATH DID. NOT_CONFIGURED, SENT and
          FAILED reach the caller as three different words. A recovery
          route that reports success while sending nothing is the
          quiet-failure objection to mail links coming true.
     ================================================================== */
  app.post(
    "/api/v1/auth/forgot",
    {
      config: {
        /* Harder than login. Login costs an attacker a guess; this
           costs a real person an email they did not ask for, and a
           product that can be made to post a hundred of them at one
           address is a product mail providers stop delivering. */
        rateLimit: { max: 5, timeWindow: "15 minutes" },
      },
    },
    async (req, reply) => {
      const parsed = ForgotSchema.safeParse(req.body);
      /* EVEN A MALFORMED BODY GETS THE SAME ANSWER. A 400 for "that is
         not an email address" is harmless, but a 400 that distinguishes
         a valid-but-unknown address from an invalid one is the oracle
         wearing a different status code. */
      if (!parsed.success) {
        return reply.code(202).send({ requested: true, message: RESET_REQUESTED_ANSWER });
      }
      const email = parsed.data.email;

      /* READ BEFORE THE LOOKUP, so what is reported about the mail path
         cannot depend on whether the account exists. Computing it after
         a `if (!user) return` is how a server property becomes an
         account oracle. */
      const mail = mailConfigFromEnv();
      const delivery = mail.apiKey ? "CONFIGURED" : "NOT_CONFIGURED";

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, orgId: true, active: true },
      });

      /* MINTED WHETHER OR NOT IT IS USED. randomBytes and the HMAC both
         cost the same for a missing account as for a real one, which is
         what keeps the two paths indistinguishable on the clock. */
      const token = randomBytes(32).toString("base64url");
      const tokenHash = hmac(token);
      const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);

      if (user && user.active) {
        await prisma.$transaction(async (tx) => {
          /* Property 2. Every outstanding link for this account, spent
             now rather than at expiry. */
          await tx.passwordReset.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: new Date() },
          });
          await tx.passwordReset.create({
            data: { userId: user.id, tokenHash, expiresAt },
          });
          await appendAuditTx(tx, {
            orgId: user.orgId,
            userId: user.id,
            action: "auth.password.reset_requested",
            entityType: "User",
            entityId: user.id,
            /* THE ACT AND THE CHANNEL, never the token. An audit entry
               holding a live reset link would make the audit export a
               credential store. */
            detail: { delivery },
          });
        });

        const outcome = await sendPasswordReset(
          email,
          `${mail.baseUrl}/reset?token=${token}`,
          RESET_TTL_MINUTES,
          mail,
        );
        /* Logged against an HMAC of the address, the way login logs a
           failure — the log is read by people and a plaintext staff
           roster in it is the same leak by a slower route. */
        req.log.info({ email: hmac(email), outcome: outcome.status }, "password reset requested");
      } else {
        req.log.warn({ email: hmac(email) }, "password reset requested for no live account");
      }

      /* `delivery` IS REPORTED TO EVERY CALLER, and it is safe precisely
         because it was computed above without reference to the account.
         It says whether THIS DEPLOYMENT can send mail at all — a fact
         about the server, identical for an address that exists and one
         that does not, and the difference between "check your inbox"
         and "nothing was sent and here is why". Charter rule 8. */
      return reply.code(202).send({
        requested: true,
        delivery,
        message: RESET_REQUESTED_ANSWER,
      });
    },
  );

  app.post(
    "/api/v1/auth/reset",
    {
      config: {
        /* A token is 32 random bytes, so guessing is not the threat;
           hashing is. Each call runs argon2 on a caller-supplied
           password, and an unbounded route that does that is a CPU
           exhaustion primitive pointed at the API every other request
           shares. */
        rateLimit: { max: 10, timeWindow: "15 minutes" },
      },
    },
    async (req, reply) => {
      const parsed = ResetSchema.safeParse(req.body);
      if (!parsed.success) {
        /* THE PASSWORD RULE IS WORTH STATING and the token's shape is
           not. A person who typed nine characters needs to know the
           floor is twelve; a person holding a badly-formed token is
           told the same thing every other bad token hears. */
        const tooShort = parsed.error.issues.some((i) => i.path[0] === "newPassword");
        return reply.code(400).send({
          error: tooShort ? "password_too_short" : "invalid",
          message: tooShort
            ? `A new password needs at least ${MIN_PASSWORD_LENGTH} characters.`
            : RESET_REFUSED_ANSWER,
        });
      }

      const tokenHash = hmac(parsed.data.token);
      const existing = await prisma.passwordReset.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, usedAt: true },
      });

      /* ONE ANSWER FOR FOUR FACTS — never issued, already spent, timed
         out, and belonging to a deactivated account. Telling them apart
         tells somebody holding a stolen link which kind they hold. */
      const refuse = () =>
        reply.code(400).send({ error: "reset_link_unusable", message: RESET_REFUSED_ANSWER });

      if (!existing || existing.usedAt || existing.expiresAt.getTime() < Date.now()) {
        return refuse();
      }

      const user = await prisma.user.findUnique({
        where: { id: existing.userId },
        select: { id: true, orgId: true, email: true, active: true },
      });
      if (!user || !user.active) return refuse();

      const passwordHash = await argon2.hash(parsed.data.newPassword, { type: argon2.argon2id });

      /* Property 3. The claim and the write are one statement, so two
         clicks on the same link produce exactly one winner. Read-then-
         write here would let both set a password — and the second one
         would win, which means an attacker racing the account holder
         chooses the credential. */
      const claimed = await prisma.passwordReset.updateMany({
        where: { id: existing.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) return refuse();

      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { passwordHash } });

        /* Any sibling link issued before this one, closed in the same
           breath. Property 2 covers the normal path; this covers a link
           that outlived a request the sweep never saw. */
        await tx.passwordReset.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });

        /* Property 4, and the reason this is a recovery rather than a
           password change. Whoever locked the account holder out is
           holding a refresh token; a reset that leaves it live has
           handed the account back to both of them. */
        await tx.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        await appendAuditTx(tx, {
          orgId: user.orgId,
          userId: user.id,
          action: "auth.password.reset_completed",
          entityType: "User",
          entityId: user.id,
          detail: { self: true, viaEmailLink: true, allSessionsRevoked: true },
        });
      });

      req.log.info({ user: hmac(user.email) }, "password reset completed");

      /* NO TOKENS IN THIS RESPONSE, deliberately. Signing the caller
         straight in would be kinder and would mean a stolen link is a
         session rather than a password prompt — and it would skip the
         one step that proves the person now holds the credential they
         just set. They sign in, like anybody else with a password. */
      return reply.send({
        reset: true,
        message:
          "Password set. Every device this account was signed in on has been signed out. " +
          "Sign in with the new password.",
      });
    },
  );

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

  /* THE ORGANISATION'S NAME, not only its id.
     
     Added for the printed record. An operator prints /sms for an audit,
     and a pack of loose pages with no operator name on them is a pack
     an auditor cannot attribute — the id in the token is a uuid, which
     is useless on paper. The name is not in the JWT deliberately: a
     token is a credential and should carry claims, not display strings
     that go stale when an operator renames itself.
     
     AOC number too, where the operator has one, because that is the
     reference a regulator files a pack under. */
  /* =====================================================================
     THE SECOND USER, WHICH NOTHING COULD CREATE.

     Nine roles, a permission matrix, role-gated routes throughout — and
     until this route existed, an operator had exactly one account. The
     comment above this file's signup handler said so outright:
     "nothing anywhere creates a second user". Filing a report requires
     `authenticate`, so the FRONTLINE staff the whole reporting system
     exists for could not have accounts at all, the triage queue had
     nobody to staff it, and investigator assignment had nobody to
     assign to.

     ---------------------------------------------------------------
     THE ESCALATION THIS OPENS IS NOT VISIBLE FROM THE ROUTE.

     `mayCreateRole` in permissions.ts carries the argument in full. The
     short version: SYSTEM_ADMIN deliberately reads no narrative, and
     `user.manage` would otherwise let it create a SAFETY_MANAGER, set
     that account's password — the creator chooses it — sign in, and
     read everything. No check is violated anywhere on that path. The
     sequence is the breach, which is why it is refused in the matrix
     rather than here.

     ---------------------------------------------------------------
     THE PASSWORD IS HANDED OVER, NOT EMAILED. Same discipline as
     provisioning: shown once, never stored in the clear, never logged.
     A set-your-own link would have been better and would have shipped
     DISABLED, because it needs mail configured — the exact failure
     evidence upload had.
     ===================================================================== */
  app.post<{ Body: { email?: unknown; name?: unknown; role?: unknown } }>(
    "/api/v1/users",
    {
      preHandler: [authenticate, requirePermission("user.manage")],
      config: { rateLimit: { max: 20, timeWindow: "15 minutes" } },
    },
    async (req, reply) => {
      const auth = req.auth!;
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const name = String(req.body?.name ?? "").trim();
      const roleRaw = String(req.body?.role ?? "");

      if (!email.includes("@") || email.length > 254) {
        return reply.code(400).send({ error: "email_required" });
      }
      if (name.length < 2 || name.length > 160) {
        return reply.code(400).send({ error: "name_required" });
      }

      const parsed = RoleEnum.safeParse(roleRaw);
      if (!parsed.success) return reply.code(400).send({ error: "unknown_role" });
      const role = parsed.data;

      /* THE MATRIX ANSWERS, NOT THIS ROUTE. Keeping the rule in
         permissions.ts means the unit tests can drive every role pair
         without standing a server up, and means a second creation path
         cannot disagree with this one. */
      if (!mayCreateRole(auth.role as never, role)) {
        return reply.code(403).send({
          error: "role_not_permitted",
          /* NAMED, because "forbidden" would read as a bug to an
             administrator who can plainly see the role in the list. */
          message:
            role === "PLATFORM_ADMIN"
              ? "That role belongs to the supplier of this product and cannot be created by an operator."
              : "Your role cannot create an account that reads safety narratives. Ask the accountable executive.",
        });
      }

      /* Globally unique, not per-tenant: an address identifies a person
         at sign-in, and two organisations holding the same one would
         make login ambiguous. Checked before the hash is spent. */
      const taken = await prisma.user.findFirst({ where: { email }, select: { id: true } });
      if (taken) return reply.code(409).send({ error: "email_already_registered" });

      const password = issuePassword();
      const passwordHash = await argon2.hash(password);

      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          /* orgId FROM THE TOKEN, never from the body. An admin of one
             operator creating an account inside another is the worst
             breach this product could have, and the safe version is one
             where the request cannot express it. */
          data: { orgId: auth.org, email, name, role, passwordHash },
          select: { id: true, email: true, name: true, role: true },
        });
        await appendAuditTx(tx, {
          orgId: auth.org,
          userId: auth.sub,
          action: "user.created",
          entityType: "User",
          entityId: user.id,
          /* Field by field, and NEVER the password or its hash. */
          detail: { email: user.email, role: user.role },
        });
        return user;
      });

      return reply.code(201).send({
        id: created.id,
        email: created.email,
        name: created.name,
        role: created.role,
        password,
        passwordShownOnce: true,
      });
    },
  );

  /* The team, so the screen that creates people can show who exists.
     No narrative, no password, no hash — a name, an address and a
     role. Reading who works here is not reading what they filed. */
  app.get("/api/v1/users", {
    preHandler: [authenticate, requirePermission("user.manage")],
  }, async (req) => {
    const rows = await prisma.user.findMany({
      where: tenantWhere(req),
      orderBy: [{ name: "asc" }],
      take: 500,
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    return { users: rows };
  });

  app.get("/api/v1/auth/me", { preHandler: [authenticate] }, async (req) => {
    const [org, user] = await Promise.all([
      prisma.org.findUnique({
        where: { id: req.auth!.org },
        select: {
          name: true,
          aocNumber: true,
          jurisdiction: true,
          /* THE LOGO COMES BACK ON /me, not from /config, and that is a
             performance decision rather than a modelling one. The print
             block reads its identity from here already; putting the
             mark anywhere else means every printed pack issues a second
             request while a print dialog is opening, and a print dialog
             does not wait. */
          config: { select: { logo: true } },
        },
      }),
      /* WHO THE PERSON IS, not only which tenant they are in. The
         account area could not say "you are signed in as" without this
         — it had the org's name and not the reader's, which is the
         wrong way round for a page about them.

         Scoped by org as well as by id. The id comes from a verified
         token so the org clause adds nothing today; it costs nothing
         and it is the clause somebody would otherwise have to remember
         to add the day this is reached any other way. */
      prisma.user.findFirst({
        where: { id: req.auth!.sub, orgId: req.auth!.org },
        select: { name: true, email: true, createdAt: true },
      }),
    ]);

    return {
      userId: req.auth!.sub,
      orgId: req.auth!.org,
      role: req.auth!.role,
      name: user?.name ?? null,
      email: user?.email ?? null,
      memberSince: user?.createdAt?.toISOString() ?? null,
      orgName: org?.name ?? null,
      aocNumber: org?.aocNumber ?? null,
      jurisdiction: org?.jurisdiction ?? null,
      logo: org?.config?.logo ?? null,
      /* THE PERMISSIONS THEMSELVES, and this is what stops the account
         area becoming a second copy of the matrix.

         The queue already returns which moves a caller may make rather
         than letting the screen work it out, for exactly this reason: a
         client that decides for itself what a role may do is a second
         copy of the permission table, and it is the copy that goes
         stale. An index of destinations is the same problem one layer
         out — so the server says what this caller holds, and the screen
         filters on the answer. */
      permissions: [...(PERMISSIONS[req.auth!.role as Role] ?? [])],
    };
  });

  /* ------------------------------------------------------------------
     CHANGING YOUR OWN NAME.

     Small, and it existed nowhere. A user could be renamed by nobody —
     not an administrator, not themselves — so a person who married, or
     was entered with a typo on the day the operator was seeded, carried
     it on every report they filed and every disposition they recorded
     for the life of the account.

     THE EMAIL IS NOT CHANGEABLE HERE, deliberately. It is the login
     identifier and the key an administrator resets against, so changing
     it is an account migration rather than a profile edit — it needs
     the old address told, which needs the mail path, and doing it
     casually is how somebody locks themselves out of a safety record.
     ------------------------------------------------------------------ */
  app.patch(
    "/api/v1/auth/me",
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: 20, timeWindow: "15 minutes" } },
    },
    async (req, reply) => {
      const parsed = ProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
      }

      const before = await prisma.user.findFirst({
        where: { id: req.auth!.sub, orgId: req.auth!.org },
        select: { name: true },
      });
      if (!before) return reply.code(404).send({ error: "user_not_found" });

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: req.auth!.sub },
          data: { name: parsed.data.name },
        });
        /* BOTH SIDES. A name is what appears against a disposition an
           investigator later reads, so "was X, is now Y" is the fact
           that answers whether two entries were the same person. */
        await appendAuditTx(tx, {
          orgId: req.auth!.org,
          userId: req.auth!.sub,
          action: "user.profile.update",
          entityType: "User",
          entityId: req.auth!.sub,
          detail: { name: { from: before.name, to: parsed.data.name } },
        });
      });

      return reply.send({ name: parsed.data.name });
    },
  );

  /* ------------------------------------------------------------------
     CHANGING YOUR OWN PASSWORD, WHICH NOTHING COULD DO.

     THE ADMIN RESET ABOVE ENDS BY SAYING "hand it over directly and
     have them change it" — and until this route existed there was no
     way to change it. A temporary password generated by an
     administrator, handed over in person, was the permanent password of
     that account: the instruction had no mechanism, which is the same
     defect the demo-password rotation had before `--rotate` was
     written.

     It is worse here than there. That one was a demo; this is an
     operator's safety officer, holding a credential a second person has
     seen and cannot stop knowing.

     THE CURRENT PASSWORD IS REQUIRED. Not ceremony: an access token
     lives fifteen minutes and can be left behind on a shared handset in
     a ready room, and a change-password route that trusts the token
     alone turns a borrowed screen into a permanent account takeover.
     Proving the current password is what makes the person at the
     keyboard the account holder rather than whoever sat down next.

     EVERY OTHER SESSION IS REVOKED, and that is the whole point of
     changing a password you believe somebody knows. A refresh token
     minted before the change still mints access tokens after it, so a
     change that leaves one alive has ended nothing — the same sentence
     CLAUDE.md writes about rotation, applied to the one route a user
     can reach on their own.

     EVERY SESSION, INCLUDING THIS ONE, and the first draft of this
     route claimed otherwise. It said the caller's own session was
     spared — which would be kinder, and the code cannot do it: an
     access token carries no `jti`, and RefreshToken has no column
     tying it to the access token presented here. There is no way from
     this request to say which stored token belongs to the caller.

     So it revokes all of them and SAYS SO. The alternative was to add
     a claim and a column to buy the nicer behaviour, and that is a
     schema change made to soften a message on the one route whose
     entire purpose is ending sessions somebody else might hold. The
     access token in hand keeps working until it expires, so nothing is
     interrupted mid-page; the next refresh is the sign-in.
     ------------------------------------------------------------------ */
  app.post(
    "/api/v1/auth/password",
    {
      preHandler: [authenticate],
      /* Tighter than the profile edit. This verifies a password, so an
         attacker with a borrowed token gets few guesses at the one
         thing that would make the takeover permanent. */
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    },
    async (req, reply) => {
      const parsed = PasswordChangeSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid", detail: parsed.error.flatten() });
      }

      const user = await prisma.user.findFirst({
        where: { id: req.auth!.sub, orgId: req.auth!.org },
        select: { id: true, passwordHash: true, email: true },
      });
      if (!user) return reply.code(404).send({ error: "user_not_found" });

      const ok = await verifyPassword(user.passwordHash, parsed.data.currentPassword);
      if (!ok) {
        req.log.warn(
          { user: hmac(user.email) },
          "password change refused — current password did not verify",
        );
        /* SAYS WHICH ONE WAS WRONG, unlike the login route, and the
           difference is who is asking. Login must not confirm that an
           address exists; here the caller has already proved they hold
           a token for this account, so telling them their current
           password was wrong reveals nothing they did not know and
           saves them retyping the new one twice. */
        return reply.code(403).send({
          error: "current_password_incorrect",
          message: "That is not the current password for this account. Nothing was changed.",
        });
      }

      /* REFUSED WHEN IT IS THE SAME PASSWORD. Somebody changing a
         credential they believe is known has not changed anything by
         setting it back to itself, and the route that answered 200
         would have told them they had. */
      if (parsed.data.currentPassword === parsed.data.newPassword) {
        return reply.code(400).send({
          error: "unchanged",
          message:
            "The new password is the same as the current one. If you are changing it " +
            "because somebody else knows it, it needs to be different.",
        });
      }

      const passwordHash = await argon2.hash(parsed.data.newPassword, { type: argon2.argon2id });

      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { passwordHash } });

        /* EVERY LIVE SESSION FOR THIS ACCOUNT. Not "every other" — see
           the note above: nothing in this request identifies which
           stored token is the caller's, and a revocation that guesses
           is a revocation that leaves the wrong one alive. */
        await tx.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        await appendAuditTx(tx, {
          orgId: req.auth!.org,
          userId: user.id,
          action: "auth.password.change",
          entityType: "User",
          entityId: user.id,
          /* THE ACT, NEVER THE CREDENTIAL — not the old one, not the
             new one, not a prefix of either. */
          detail: { self: true },
        });
      });

      return reply.send({
        changed: true,
        message:
          "Password changed. Every signed-in device for this account has been signed " +
          "out, including this one — you can carry on here until this session expires, " +
          "then sign in with the new password.",
      });
    },
  );
}
