// =====================================================================
// UsalamaSMS API — Auth, RBAC middleware, Audit chain, De-identification
// Fastify + Prisma. RBAC enforced server-side; client checks are cosmetic.
// =====================================================================
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import argon2 from "argon2";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { can, type Role, type Permission } from "@usalamasms/shared";
import { deIdentify } from "./deident";
import { auditMaterial } from "./audit-material";

// ------------------------------ Env ----------------------------------
// Validated at startup — fail fast (envalid pattern).
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`FATAL: missing env ${name}`); process.exit(1); }
  return v;
}

export const ENV = {
  JWT_SECRET: requireEnv("JWT_SECRET"),
  // Read HERE, at startup, not lazily inside reporterDupToken(). The old
  // code called requireEnv() from inside a request handler, so a missing
  // salt in production did not fail the deploy — it called process.exit(1)
  // in the middle of serving a request, killing the process on the first
  // VCR that happened to arrive. Fail fast means fail at boot.
  DEIDENT_SALT: requireEnv("DEIDENT_SALT"),
  ACCESS_TTL: "15m",
  REFRESH_TTL_MS: 30 * 24 * 3600 * 1000,
} as const;

/**
 * The client.
 *
 * Prisma 7 removed the `datasources` constructor option: a direct
 * database connection goes through a driver adapter, and a bare
 * `new PrismaClient()` throws the moment it is asked to connect.
 *
 * This was written as `new PrismaClient()` and typechecked, linted and
 * unit-tested clean for the entire life of the project, because nothing
 * ever asked it to open a connection. It took a real Postgres to find —
 * which is the argument for tests/integration in one line.
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: requireEnv("DATABASE_URL") }),
});

// ------------------------------ Auth ---------------------------------
export interface AccessClaims {
  sub: string;       // userId
  org: string;       // orgId — every query is tenant-scoped by this
  role: Role;
  typ: "access";
}

export async function verifyPassword(hash: string, pw: string): Promise<boolean> {
  return argon2.verify(hash, pw);
}

export function issueAccessToken(c: Omit<AccessClaims, "typ">): string {
  return jwt.sign({ ...c, typ: "access" }, ENV.JWT_SECRET, {
    algorithm: "HS256", expiresIn: ENV.ACCESS_TTL, issuer: "usalamasms",
  });
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = randomBytes(48).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hmac(raw),
      expiresAt: new Date(Date.now() + ENV.REFRESH_TTL_MS),
    },
  });
  return raw;
}

export function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * Keyed hash, for anything an attacker who reaches the database might
 * want to reverse. Refresh tokens are 48 random bytes so a plain digest
 * is not brute-forceable — but the de-identification tokens below are
 * derived from low-entropy inputs (a user id), where an unkeyed digest
 * is a rainbow table away from reversal.
 */
export function hmac(s: string): string {
  return createHmac("sha256", ENV.JWT_SECRET).update(s, "utf8").digest("hex");
}

// --------------------------- Middleware ------------------------------
declare module "fastify" {
  interface FastifyRequest { auth?: AccessClaims }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "authentication_required" }); return;
  }
  try {
    const claims = jwt.verify(header.slice(7), ENV.JWT_SECRET, {
      algorithms: ["HS256"], issuer: "usalamasms",
    }) as AccessClaims;
    if (claims.typ !== "access") throw new Error("wrong token type");
    req.auth = claims;
  } catch {
    // Never leak verification internals to the client.
    reply.code(401).send({ error: "invalid_token" });
  }
}

/** Route guard factory: requirePermission("risk.accept.intolerable") */
export function requirePermission(p: Permission) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.auth) { reply.code(401).send({ error: "authentication_required" }); return; }
    if (!can(req.auth.role, p)) {
      reply.code(403).send({ error: "forbidden", permission: p }); return;
    }
  };
}

/** Tenant scoping helper — every repository call must pass through this. */
export function tenantWhere(req: FastifyRequest): { orgId: string } {
  if (!req.auth) throw new Error("tenantWhere called before authenticate");
  return { orgId: req.auth.org };
}

// ================= Immutable audit log (hash chain) ===================
//
// Two defects fixed here, both of which made the chain look stronger
// than it was. This is the endpoint a regulator is invited to trust, so
// "looks strong" is the failure mode that matters.
//
// ---------------------------------------------------------------------
const GENESIS = "0".repeat(64);

/* The material definition lives in its own pure module so that the
   writer, the verifier and the tests all read the SAME one. See
   audit-material.ts for why that separation is the fix rather than a
   tidy-up. */
export { auditMaterial, canonicalJson, AUDIT_MATERIAL_FIELDS } from "./audit-material";

/**
 * Append one row to an org's audit chain.
 *
 * DEFECT FIXED — THE CHAIN COULD FORK. The previous implementation read
 * the last row's hash and then inserted, inside a transaction. Postgres
 * defaults to READ COMMITTED, under which two concurrent appends for the
 * same org both read the same `prevHash` and both commit: two rows now
 * claim the same predecessor. The chain is no longer a chain, and the
 * verifier reports a break that no one tampered with — which is worse
 * than a silent failure, because it destroys trust in a control that was
 * working.
 *
 * The fix is a per-org advisory lock taken inside the transaction, so
 * appends for one organisation serialise while different organisations
 * proceed in parallel. `pg_advisory_xact_lock` releases on commit or
 * rollback; there is nothing to leak on the error path.
 */
export async function appendAudit(params: {
  orgId: string; userId?: string; action: string;
  entityType: string; entityId: string; detail?: Prisma.JsonValue;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Two 32-bit keys: a namespace constant and the org. Hashing the org
    // id to an int is a collision risk across orgs, but the worst case
    // is two organisations briefly serialising against each other — a
    // performance cost, never a correctness one.
    const orgKey = lockKeyFor(params.orgId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_NAMESPACE}::int, ${orgKey}::int)`;

    const last = await tx.auditLog.findFirst({
      where: { orgId: params.orgId },
      orderBy: { seq: "desc" },
      select: { hash: true },
    });
    const prevHash = last?.hash ?? GENESIS;
    const createdAt = new Date();

    await tx.auditLog.create({
      data: {
        orgId: params.orgId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        detail: params.detail ?? undefined,
        createdAt,
        prevHash,
        hash: sha256(
          auditMaterial({ ...params, detail: params.detail ?? null, prevHash, createdAt }),
        ),
      },
    });
  });
}

const AUDIT_LOCK_NAMESPACE = 0x5341; // "SA"

function lockKeyFor(orgId: string): number {
  // Signed 32-bit, which is what pg_advisory_xact_lock(int, int) takes.
  return (parseInt(sha256(orgId).slice(0, 8), 16) | 0);
}

export interface ChainVerdict {
  ok: boolean;
  rowsChecked: number;
  /** First row whose predecessor link is wrong. */
  brokenLinkAtSeq?: bigint;
  /** First row whose stored hash does not match its own content. */
  contentAlteredAtSeq?: bigint;
}

/**
 * Verify chain integrity for an org — the regulator oversight endpoint.
 *
 * DEFECT FIXED — THIS FUNCTION DID NOT VERIFY THE AUDIT LOG. The old
 * implementation walked the rows checking only that each row's
 * `prevHash` equalled the previous row's `hash`. Both of those are
 * columns in the same table as the data they are supposed to protect.
 * Editing `action` from "risk.accept.intolerable" to "risk.accept.
 * tolerable" — the single edit an operator under investigation would
 * most want to make — left every link intact and the function returned
 * `{ ok: true }`.
 *
 * A hash chain only means anything if the hash is RECOMPUTED from the
 * row's content. That is what this now does, and it is the whole point
 * of the control.
 */
export async function verifyAuditChain(orgId: string): Promise<ChainVerdict> {
  const rows = await prisma.auditLog.findMany({ where: { orgId }, orderBy: { seq: "asc" } });

  let prev = GENESIS;
  let checked = 0;

  for (const r of rows) {
    if (r.prevHash !== prev) {
      return { ok: false, rowsChecked: checked, brokenLinkAtSeq: r.seq };
    }

    const expected = sha256(
      auditMaterial({
        orgId: r.orgId,
        userId: r.userId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        detail: r.detail as Prisma.JsonValue | null,
        prevHash: r.prevHash,
        createdAt: r.createdAt,
      }),
    );
    if (expected !== r.hash) {
      return { ok: false, rowsChecked: checked, contentAlteredAtSeq: r.seq };
    }

    prev = r.hash;
    checked++;
  }

  // CHARTER RULE 11 — a check that stops checking must fail. An org with
  // no audit rows at all is not a verified org; it is an org whose
  // history is missing, and reporting `ok: true` for it would let a
  // wiped table pass as a clean bill of health.
  if (rows.length === 0) {
    return { ok: false, rowsChecked: 0 };
  }

  return { ok: true, rowsChecked: checked };
}

// ================ De-identification (irreversible) ====================
export { deIdentify };
export { deIdentifyNarrative } from "./deident";

/**
 * Salted duplicate-detection token.
 *
 * Now an HMAC rather than sha256(salt + ":" + id). A user id is
 * low-entropy: given the salt, an unkeyed digest of every id in the
 * users table reverses the token in seconds, and the salt sits in the
 * same environment as the database credentials that leaked it. HMAC is
 * the right primitive for a keyed one-way token and costs nothing.
 */
export function reporterDupToken(reporterId: string): string {
  return hmac(`${ENV.DEIDENT_SALT}:${reporterId}`);
}

export class ResidualIdentifiersError extends Error {
  constructor(public readonly residual: ReadonlyArray<{ text: string; reason: string }>) {
    super(
      `de-identification left ${residual.length} possible identifier(s); ` +
        `a reviewer must confirm before distribution`,
    );
    this.name = "ResidualIdentifiersError";
  }
}

/**
 * Run the VCR de-identification pipeline.
 *
 * `reviewerAcceptedResidual` is a deliberate piece of friction. When the
 * scrubber flags spans it could not confidently remove, this throws
 * unless a named reviewer has looked at them and accepted. The
 * alternative — distributing whatever the regex happened to leave — is
 * how a confidential reporter gets identified by a colleague reading the
 * bulletin, and no amount of additional patterns makes that risk zero.
 * The decision belongs to a person, and the audit log records which one.
 */
export async function deIdentifyVcr(
  reportId: string,
  reviewerId: string,
  options: { reviewerAcceptedResidual?: boolean } = {},
): Promise<{ residual: ReadonlyArray<{ text: string; reason: string }> }> {
  const result = await prisma.$transaction(async (tx) => {
    const report = await tx.safetyReport.findUniqueOrThrow({ where: { id: reportId } });
    if (report.type !== "VCR") throw new Error("de-identification pipeline is VCR-only");
    if (report.isDeIdentified) throw new Error("report is already de-identified");

    const scrubbed = deIdentify(report.narrative);

    if (scrubbed.residual.length > 0 && !options.reviewerAcceptedResidual) {
      throw new ResidualIdentifiersError(scrubbed.residual);
    }

    await tx.safetyReport.update({
      where: { id: reportId },
      data: {
        deIdentifiedNarrative: scrubbed.text,
        narrative: "[REDACTED — de-identified copy distributed]",
        reporterId: null,          // hard removal, not encryption
        isDeIdentified: true,
        deIdentifiedAt: new Date(),
      },
    });

    // The audit append moved INSIDE the transaction. Previously the
    // update committed, then a second query fetched orgId, then the
    // audit was written — so a failure in either later step left a
    // report de-identified with no record of who did it or when. An
    // unaudited irreversible operation on safety data is exactly what
    // the audit log exists to prevent.
    await appendAuditTx(tx, {
      orgId: report.orgId,
      userId: reviewerId,
      action: "report.deidentify",
      entityType: "SafetyReport",
      entityId: reportId,
      detail: {
        removed: scrubbed.removed,
        residualCount: scrubbed.residual.length,
        reviewerAcceptedResidual: options.reviewerAcceptedResidual ?? false,
      },
    });

    return { residual: scrubbed.residual };
  });

  return result;
}

/**
 * Append to the chain using a caller's transaction, so an audit entry
 * commits or rolls back with the change it describes.
 */
export async function appendAuditTx(
  tx: Prisma.TransactionClient,
  params: {
    orgId: string; userId?: string; action: string;
    entityType: string; entityId: string; detail?: Prisma.JsonValue;
  },
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_NAMESPACE}::int, ${lockKeyFor(params.orgId)}::int)`;

  const last = await tx.auditLog.findFirst({
    where: { orgId: params.orgId },
    orderBy: { seq: "desc" },
    select: { hash: true },
  });
  const prevHash = last?.hash ?? GENESIS;
  const createdAt = new Date();

  await tx.auditLog.create({
    data: {
      orgId: params.orgId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      detail: params.detail ?? undefined,
      createdAt,
      prevHash,
      hash: sha256(
        auditMaterial({ ...params, detail: params.detail ?? null, prevHash, createdAt }),
      ),
    },
  });
}
