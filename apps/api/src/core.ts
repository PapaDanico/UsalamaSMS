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
import { getConnectionString, MissingDatabaseConnectionError } from "@netlify/database";
import { can, type Role, type Permission } from "@usalamasms/shared";
import { bandForFleet } from "../../../packages/shared/src/pricing";
import {
  allows, stateOn, trialEndsFrom, type Capability,
} from "../../../packages/shared/src/subscription";
import { deIdentify } from "./deident";
import { auditMaterial } from "./audit-material";

// ------------------------------ Env ----------------------------------
// Validated at startup — fail fast (envalid pattern).
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`FATAL: missing env ${name}`); process.exit(1); }
  return v;
}

/**
 * The database connection string.
 *
 * Netlify Database injects NETLIFY_DB_URL at function runtime. Reading
 * it through @netlify/database keeps the application on the managed
 * connection selected for the current production or preview deploy,
 * including database branches.
 *
 * A HARD-WON PIECE OF KNOWLEDGE IS ALSO ENCODED HERE. The Netlify Supabase
 * extension sets a variable called `SUPABASE_DATABASE_URL`, and it is
 * NOT a database connection string. It is the project's REST API base —
 * `https://<ref>.supabase.co` — intended for
 * `createClient(SUPABASE_DATABASE_URL, SUPABASE_ANON_KEY)`, the client
 * SDK path this architecture deliberately does not use.
 *
 * An earlier version of this function accepted that variable as a
 * Prisma connection string on the strength of its name. Prisma would
 * have tried to open a Postgres connection to an https:// URL and
 * failed with an error about the protocol, which reads like a Prisma
 * bug rather than like a misconfiguration, on a deploy that had just
 * been told it was correctly connected.
 *
 * So the scheme is checked, and a wrong one is named precisely. The
 * variable is still accepted — if somebody sets it to a real connection
 * string it works — but the extension's value is rejected with the
 * sentence that explains it.
 */
function databaseUrl(): string {
  let managed: string | undefined;
  try {
    managed = getConnectionString();
  } catch (error) {
    if (!(error instanceof MissingDatabaseConnectionError)) throw error;
  }

  const explicit = process.env["DATABASE_URL"];
  const fromExtension = process.env["SUPABASE_DATABASE_URL"];
  const url = managed ?? explicit ?? fromExtension;

  if (!url) {
    fatal(
      "no database connection string.\n" +
        "  Connect Netlify Database or set DATABASE_URL to a Postgres URI."
    );
  }

  if (!/^postgres(ql)?:\/\//.test(url)) {
    const which = managed ? "NETLIFY_DB_URL" : explicit ? "DATABASE_URL" : "SUPABASE_DATABASE_URL";
    fatal(
      `${which} is not a Postgres connection string.\n` +
        `  Got a URL beginning "${url.slice(0, url.indexOf(":") + 3)}".\n` +
        (which === "SUPABASE_DATABASE_URL"
          ? "  The Netlify Supabase extension sets SUPABASE_DATABASE_URL to the\n" +
            "  project's REST API base, not to a database connection string —\n" +
            "  it is meant for createClient(), which this API does not use.\n" +
            "  Set DATABASE_URL explicitly; it takes precedence.\n"
          : "") +
        "  See docs/06-DEPLOYMENT.md."
    );
  }

  return url;
}

/** Print and exit. Kept separate so the messages above stay readable. */
function fatal(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(1);
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
 * ever asked it to open a connection. It took a real Postgres to find.
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl() }),
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

/* =====================================================================
   ENTITLEMENT, ENFORCED.

   `allows(state, capability)` has been in subscription.ts since the
   subscription model was written, with a careful argument about which
   capabilities survive a lapse and why. IT HAD ZERO CALLERS. The
   pricing page promised that "the safety office tools pause; the
   reporting never does", and nothing in this API had any opinion about
   it — a capability model that reads as protection and protects
   nothing, which is the product-shaped version of a check that cannot
   fail.

   WHAT THIS REFUSES TO BLOCK, AND WHY IT IS NOT NEGOTIABLE. Filing a
   report, reading your own record and exporting the whole record stay
   available in every state, including LAPSED:

     · the deadline is owed to the AUTHORITY, not to us. An occurrence
       under L.N. 32 has a reporting window that runs whatever our
       invoice is doing, and software that blocked a filing over an
       unpaid subscription would put itself between an operator and a
       legal obligation — with the operator still in breach;
     · the person filing is a ramp agent who saw something. They bought
       nothing and can pay nothing, and a pricing decision three levels
       above them must not arrive as a locked door;
     · the record is theirs. A record held hostage until an invoice
       clears is exactly what operators are escaping.

   THE STATE IS READ, NOT TRUSTED FROM THE TOKEN. An access token is
   minted at sign-in and lives for minutes, so a token-carried
   entitlement would keep working after a lapse and — worse — after a
   payment. The read is a primary-key lookup on Org, on routes that are
   not in the filing path, which is the cheapest place to pay for being
   correct rather than fast.

   402 RATHER THAN 403. "Forbidden" tells an operator their ROLE is
   wrong and sends them to their administrator; this is not about who
   they are, and the response says which capability paused and what
   still works, so the screen can say something true.
   ===================================================================== */
export function requireEntitlement(capability: Capability) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.auth) { reply.code(401).send({ error: "authentication_required" }); return; }
    const org = await prisma.org.findUnique({
      where: { id: req.auth.org },
      /* fleetSize comes back so the refusal can name a PRICE rather
         than a policy. See the 402 body below. */
      select: { trialEndsOn: true, paidThrough: true, createdAt: true, fleetSize: true },
    });
    /* An org that cannot be read is not an org that has lapsed. Failing
       open here would be a licence check that any database blip
       disables; failing closed would pause a safety office over one. So
       it is neither — a missing org is an authentication problem, and
       says so. */
    if (!org) { reply.code(401).send({ error: "invalid_token" }); return; }
    /* AN ORG WITH NO DATES HAS NOT LAPSED — IT HAS NOT BEEN GIVEN ONE.
       The first version of this read a null trial date as the epoch,
       which made every organisation created before the console existed
       instantly LAPSED. Seven integration tests went red on it, and
       every one of them was right: an operator who was never granted a
       trial has not used one up.

       So the trial runs from `createdAt`, which is the honest reading —
       an org created twelve days ago is twelve days into its thirty,
       whoever did or did not write a date down. Existing operators are
       corrected by arithmetic rather than by a migration, and the
       console still writes an explicit date for everyone provisioned
       from now on. */
    const state = stateOn(
      {
        trialEndsOn: org.trialEndsOn ?? trialEndsFrom(org.createdAt),
        paidThrough: org.paidThrough,
      },
      new Date(),
    );
    if (allows(state, capability)) return;
    /* THE PRICE, WHERE THE OPERATOR MEETS THE WALL.
     
       This used to answer "subscription_lapsed" and stop, which tells a
       safety manager they cannot work and nothing about what to do
       next. They then have to find the pricing page, work out which
       band they are in, and email somebody — three steps, each a place
       to give up, at the exact moment they were trying to do their job.
     
       ONLY WHEN THE FLEET SIZE IS KNOWN. `bandForFleet` will happily
       answer for any number, and answering for a number nobody stated
       would put a figure in front of an operator that is not their
       price. A missing fleet size is reported as unknown and the screen
       asks rather than guesses — a wrong price is worse than no price,
       because the operator budgets against it. */
    const band = typeof org.fleetSize === "number" && org.fleetSize > 0
      ? bandForFleet(org.fleetSize)
      : null;

    reply.code(402).send({
      error: "subscription_lapsed",
      state,
      capability,
      /* Named rather than implied. An operator meeting this response
         needs to know immediately that their people can still report
         and their record is still theirs. */
      stillAvailable: ["FILE_REPORT", "READ_OWN_RECORD", "EXPORT_OWN_RECORD"],
      /* Null rather than a default band. See above. */
      band: band
        ? { id: band.id, name: band.name, fleet: band.fleet, usdMonthly: band.usdMonthly }
        : null,
      fleetSize: org.fleetSize ?? null,
    });
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
  /**
   * First row whose predecessor link is wrong.
   *
   * A STRING, and that is not cosmetic. `AuditLog.seq` is a Postgres
   * BigInt, so Prisma hands back a JavaScript `bigint` — and
   * `JSON.stringify` throws on one. The oversight route carries no
   * response schema, so Fastify serialises with `JSON.stringify` and
   * the throw became a 500 through the error handler.
   *
   * The effect was that this endpoint answered 200 for an intact chain
   * and 500 for an altered one — indistinguishable from a database
   * outage, on the one verdict the control exists to deliver. Every
   * test called verifyAuditChain() directly, where a bigint is fine,
   * so nothing saw it.
   *
   * A sequence number here is an identifier a person looks a row up by,
   * never an operand. String is the honest type for that, and it cannot
   * reintroduce the defect at any call site.
   */
  brokenLinkAtSeq?: string;
  /** First row whose stored hash does not match its own content. */
  contentAlteredAtSeq?: string;
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
  // ===================================================================
  // PAGED, because this loaded the whole log into memory.
  //
  // A single unbounded findMany is fine for the org this was written
  // against and wrong for the org it is FOR: this is the endpoint a
  // regulator is invited to call, on an operator with a year of
  // traffic, inside a Lambda with 1 GB and a timeout. It would fall
  // over on exactly the organisation whose chain most needs verifying,
  // and it would fall over as a timeout — which an inspector reads as
  // "the integrity check did not work", the one verdict this control
  // must never return by accident.
  //
  // The chain is inherently sequential, so this cannot be parallelised.
  // It can be streamed, and that is enough: memory is now bounded by
  // the page size rather than by the operator's history.
  // ===================================================================
  const PAGE = 1_000;

  let prev = GENESIS;
  let checked = 0;
  let cursor: bigint | undefined;
  let total = 0;

  for (;;) {
    const rows = await prisma.auditLog.findMany({
      where: { orgId, ...(cursor === undefined ? {} : { seq: { gt: cursor } }) },
      orderBy: { seq: "asc" },
      take: PAGE,
    });
    if (rows.length === 0) break;
    total += rows.length;
    cursor = rows[rows.length - 1]!.seq;

    const verdict = verifyPage(rows, prev, checked);
    if (verdict.failure) return verdict.failure;
    prev = verdict.prev;
    checked = verdict.checked;

    if (rows.length < PAGE) break;
  }

  // CHARTER RULE 11 — a check that stops checking must fail. An org with
  // no audit rows at all is not a verified org; it is an org whose
  // history is missing, and reporting `ok: true` for it would let a
  // wiped table pass as a clean bill of health.
  if (total === 0) {
    return { ok: false, rowsChecked: 0 };
  }

  return { ok: true, rowsChecked: checked };
}

/**
 * Verify one page, carrying the running predecessor across page
 * boundaries — which is the only thing that makes paging safe here. A
 * page that restarted from GENESIS would report a broken link at every
 * page boundary, and a page that skipped the check at its own first row
 * would let a splice at a multiple of the page size through unseen.
 */
function verifyPage(
  rows: ReadonlyArray<{
    seq: bigint; orgId: string; userId: string | null; action: string;
    entityType: string; entityId: string; detail: unknown;
    prevHash: string; hash: string; createdAt: Date;
  }>,
  startPrev: string,
  startChecked: number,
): { prev: string; checked: number; failure?: ChainVerdict } {
  let prev = startPrev;
  let checked = startChecked;

  for (const r of rows) {
    if (r.prevHash !== prev) {
      return { prev, checked, failure: { ok: false, rowsChecked: checked, brokenLinkAtSeq: String(r.seq) } };
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
      return {
        prev, checked,
        failure: { ok: false, rowsChecked: checked, contentAlteredAtSeq: String(r.seq) },
      };
    }

    prev = r.hash;
    checked++;
  }

  return { prev, checked };
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

    /* THE RECOMMENDATION IS SCRUBBED WITH THE NARRATIVE.
       "What do you think should be done?" is free text written by the
       same person in the same sitting — "I raised it with Captain
       Mwangi on Tuesday" identifies its author exactly as readily as
       the account does. Scrubbing one field and distributing the other
       is the sync-receipt defect again, one column over.

       Both are passed through as ONE document so a name that appears in
       both is counted once and the residual review sees the whole
       thing, rather than a reviewer accepting a residual in the
       narrative and never being shown the same name below it. */
    const SEPARATOR = "\n\n\u0000RECOMMENDATION\u0000\n\n";
    const combined = report.reporterRecommendation
      ? `${report.narrative}${SEPARATOR}${report.reporterRecommendation}`
      : report.narrative;

    const scrubbed = deIdentify(combined);

    if (scrubbed.residual.length > 0 && !options.reviewerAcceptedResidual) {
      throw new ResidualIdentifiersError(scrubbed.residual);
    }

    const [scrubbedNarrative, scrubbedRecommendation] = scrubbed.text.split(SEPARATOR);

    await tx.safetyReport.update({
      where: { id: reportId },
      data: {
        deIdentifiedNarrative: scrubbedNarrative ?? scrubbed.text,
        narrative: "[REDACTED — de-identified copy distributed]",
        // Replaced rather than nulled: a missing recommendation and a
        // redacted one are different facts, and the second is the one
        // a reader of the bulletin should be told.
        ...(report.reporterRecommendation
          ? { reporterRecommendation: scrubbedRecommendation ?? "[REDACTED]" }
          : {}),
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
