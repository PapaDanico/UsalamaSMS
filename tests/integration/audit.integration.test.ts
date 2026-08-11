// =====================================================================
// The audit chain, against a real Postgres.
//
// This is the file the source-level guards could never be. Two of the
// three properties below are invisible to static inspection:
//
//   · whether the chain FORKS when two appends race — a function of
//     Postgres' isolation level, not of the code's shape;
//   · whether the verifier NOTICES an edited row — the old one walked
//     prevHash links and returned ok for any tampering that left them
//     intact, and read exactly like a verifier that worked.
//
// A regex can see that `pg_advisory_xact_lock` appears in the file. Only
// a database can tell you it is doing anything.
// =====================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { prisma, reset, seedOrg, migrate, disconnect, hasDatabase } from "./db.setup";
import { auditMaterial } from "../../apps/api/src/audit-material";

const GENESIS = "0".repeat(64);
const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/* The append and verify implementations are re-created here rather than
   imported from core.ts, which cannot be loaded without JWT_SECRET and a
   Prisma singleton. They call the SAME auditMaterial() the production
   code does — which is the whole reason that function was split into its
   own module. If the two ever diverge, the divergence is in the
   transaction plumbing, and that is exactly what these tests exercise. */

const LOCK_NAMESPACE = 0x5341;
const lockKeyFor = (orgId: string): number => parseInt(sha256(orgId).slice(0, 8), 16) | 0;

async function appendAudit(params: {
  orgId: string; userId?: string; action: string;
  entityType: string; entityId: string; detail?: unknown;
  withLock?: boolean;
}): Promise<void> {
  await prisma().$transaction(async (tx) => {
    if (params.withLock !== false) {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock($1::int, $2::int)`,
        LOCK_NAMESPACE,
        lockKeyFor(params.orgId),
      );
    }
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
        detail: (params.detail ?? undefined) as never,
        createdAt,
        prevHash,
        hash: sha256(auditMaterial({ ...params, detail: params.detail ?? null, prevHash, createdAt })),
      },
    });
  });
}

async function verifyAuditChain(orgId: string): Promise<{
  ok: boolean; rowsChecked: number; brokenLinkAtSeq?: bigint; contentAlteredAtSeq?: bigint;
}> {
  const rows = await prisma().auditLog.findMany({ where: { orgId }, orderBy: { seq: "asc" } });
  let prev = GENESIS;
  let checked = 0;
  for (const r of rows) {
    if (r.prevHash !== prev) return { ok: false, rowsChecked: checked, brokenLinkAtSeq: r.seq };
    const expected = sha256(
      auditMaterial({
        orgId: r.orgId, userId: r.userId, action: r.action,
        entityType: r.entityType, entityId: r.entityId,
        detail: r.detail as unknown, prevHash: r.prevHash, createdAt: r.createdAt,
      }),
    );
    if (expected !== r.hash) return { ok: false, rowsChecked: checked, contentAlteredAtSeq: r.seq };
    prev = r.hash;
    checked++;
  }
  if (rows.length === 0) return { ok: false, rowsChecked: 0 };
  return { ok: true, rowsChecked: checked };
}

describe.skipIf(!hasDatabase)("audit chain against Postgres", () => {
  let orgId: string;

  beforeAll(() => migrate());
  afterAll(() => disconnect());

  beforeEach(async () => {
    await reset();
    ({ orgId } = await seedOrg());
  });

  it("verifies a chain it built itself", async () => {
    for (let i = 0; i < 5; i++) {
      await appendAudit({
        orgId, action: "report.create.sync", entityType: "SafetyReport",
        entityId: `report-${i}`, detail: { index: i },
      });
    }
    const verdict = await verifyAuditChain(orgId);
    expect(verdict.ok).toBe(true);
    expect(verdict.rowsChecked).toBe(5);
  });

  it("DETECTS AN EDITED ROW — the defect the old verifier could not see", async () => {
    await appendAudit({
      orgId, action: "risk.accept.intolerable", entityType: "RiskAssessment", entityId: "risk-1",
    });
    await appendAudit({
      orgId, action: "report.close", entityType: "SafetyReport", entityId: "report-1",
    });
    expect((await verifyAuditChain(orgId)).ok).toBe(true);

    // The single edit an operator under investigation would most want to
    // make. prevHash and hash are untouched, so every LINK still checks
    // out — which is precisely why the old verifier returned ok.
    await prisma().$executeRawUnsafe(
      `UPDATE "AuditLog" SET action = 'risk.accept.tolerable' WHERE "entityId" = 'risk-1'`,
    );

    const verdict = await verifyAuditChain(orgId);
    expect(verdict.ok).toBe(false);
    expect(verdict.contentAlteredAtSeq).toBeDefined();
    // And it must be reported as ALTERED CONTENT, not as a broken link —
    // the two mean different things to whoever is reading the report.
    expect(verdict.brokenLinkAtSeq).toBeUndefined();
  });

  it("detects a tampered detail payload", async () => {
    await appendAudit({
      orgId, action: "report.deidentify", entityType: "SafetyReport",
      entityId: "report-9", detail: { residualCount: 4, reviewerAcceptedResidual: true },
    });
    await prisma().$executeRawUnsafe(
      `UPDATE "AuditLog" SET detail = '{"residualCount": 0, "reviewerAcceptedResidual": false}'::jsonb
       WHERE "entityId" = 'report-9'`,
    );
    expect((await verifyAuditChain(orgId)).ok).toBe(false);
  });

  it("detects a deleted row", async () => {
    for (let i = 0; i < 3; i++) {
      await appendAudit({ orgId, action: "a", entityType: "T", entityId: `e-${i}` });
    }
    await prisma().$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "entityId" = 'e-1'`);
    const verdict = await verifyAuditChain(orgId);
    expect(verdict.ok).toBe(false);
    expect(verdict.brokenLinkAtSeq).toBeDefined();
  });

  it("treats an empty chain as unverified, not as clean", async () => {
    // Charter rule 11. A wiped table must not pass as a clean bill of health.
    const verdict = await verifyAuditChain(orgId);
    expect(verdict.ok).toBe(false);
    expect(verdict.rowsChecked).toBe(0);
  });

  it("DOES NOT FORK under concurrent appends — the advisory lock earns its place", async () => {
    // The original implementation read the last hash and then inserted,
    // inside a transaction. At Postgres' default READ COMMITTED, two
    // concurrent appends for one org both read the same prevHash and
    // both commit: the chain is no longer a chain, and the verifier
    // reports tampering nobody committed.
    await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        appendAudit({ orgId, action: "concurrent", entityType: "T", entityId: `e-${i}` }),
      ),
    );

    const rows = await prisma().auditLog.findMany({ where: { orgId }, orderBy: { seq: "asc" } });
    expect(rows).toHaveLength(24);

    // No two rows may claim the same predecessor.
    const prevHashes = rows.map((r) => r.prevHash);
    expect(new Set(prevHashes).size).toBe(prevHashes.length);

    expect((await verifyAuditChain(orgId)).ok).toBe(true);
  });

  it("proves the fork is real when the lock is removed", async () => {
    // The counter-test. Without it, the test above passes whether or not
    // the lock does anything, and a lock quietly deleted in a refactor
    // would look exactly like a lock that works. Watch a guard fail
    // before trusting it.
    const results = await Promise.allSettled(
      Array.from({ length: 24 }, (_, i) =>
        appendAudit({
          orgId, action: "unlocked", entityType: "T", entityId: `u-${i}`, withLock: false,
        }),
      ),
    );

    const rows = await prisma().auditLog.findMany({ where: { orgId }, orderBy: { seq: "asc" } });
    const prevHashes = rows.map((r) => r.prevHash);
    const forked = new Set(prevHashes).size !== prevHashes.length;
    const verdict = await verifyAuditChain(orgId);

    // Unlocked concurrent appends must produce a chain that is broken in
    // SOME observable way — duplicate predecessors, or a verifier that
    // rejects it. If this ever passes cleanly, the lock is no longer
    // what is protecting the chain and the test above proves nothing.
    expect(
      forked || !verdict.ok || results.some((r) => r.status === "rejected"),
      "unlocked concurrent appends produced a valid chain — the lock is not what is protecting it",
    ).toBe(true);
  });

  it("keeps each org's chain independent", async () => {
    const { orgId: second } = await seedOrg("Second Operator");
    await appendAudit({ orgId, action: "a", entityType: "T", entityId: "1" });
    await appendAudit({ orgId: second, action: "a", entityType: "T", entityId: "1" });
    await appendAudit({ orgId, action: "b", entityType: "T", entityId: "2" });

    expect((await verifyAuditChain(orgId)).rowsChecked).toBe(2);
    expect((await verifyAuditChain(second)).rowsChecked).toBe(1);
    expect((await verifyAuditChain(orgId)).ok).toBe(true);
    expect((await verifyAuditChain(second)).ok).toBe(true);
  });
});
