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

// core.ts validates these at import time and exits without them.
process.env["JWT_SECRET"] ??= "integration-test-secret-not-a-real-one";
process.env["DEIDENT_SALT"] ??= "integration-test-salt";
process.env["LOG_LEVEL"] ??= "silent";

const GENESIS = "0".repeat(64);
const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/* ---------------------------------------------------------------------
   THESE TESTS DRIVE THE SHIPPED FUNCTIONS.

   They used to drive local re-creations of appendAudit and
   verifyAuditChain, on the reasoning that core.ts could not be imported
   without JWT_SECRET and a Prisma singleton. Both obstacles are three
   lines of environment, as the auth and function suites next door
   already demonstrated.

   The consequence was worse than the inconvenience it avoided. All eight
   tests below would have passed unchanged if core.ts's verifier
   regressed to the link-only version — the exact defect this file exists
   to prevent — because the thing they exercised was a copy that could
   not regress with it. A test that verifies a reimplementation of the
   code under test verifies nothing about the code under test.

   Splitting auditMaterial() into its own module was the same fix applied
   one level down: writer, verifier and tests read ONE definition. That
   argument does not stop at the material function.
   --------------------------------------------------------------------- */
let appendAudit: typeof import("../../apps/api/src/core").appendAudit;
let verifyAuditChain: typeof import("../../apps/api/src/core").verifyAuditChain;

/**
 * An append with the advisory lock deliberately omitted.
 *
 * This is the ONE thing that still has to be re-created, because the
 * shipped appendAudit has no switch for it and must not grow one: an
 * option to disable the lock is an option somebody eventually passes in
 * production. It exists solely for the counter-test at the bottom, which
 * proves the lock is what protects the chain rather than assuming it.
 *
 * It is intentionally the same shape as core's append minus the lock, so
 * a divergence in the rest of the plumbing shows up as the counter-test
 * failing to fork — which reads as "the lock stopped mattering" and
 * sends someone to look. That is the safe direction for this copy to be
 * wrong in.
 */
async function appendWithoutLock(params: {
  orgId: string; action: string; entityType: string; entityId: string; detail?: unknown;
}): Promise<void> {
  await prisma().$transaction(async (tx) => {
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

describe.skipIf(!hasDatabase)("audit chain against Postgres", () => {
  let orgId: string;

  beforeAll(async () => {
    migrate();
    // Imported here rather than at the top so migrate() has run and the
    // environment above is in place before core.ts evaluates it.
    const core = await import("../../apps/api/src/core");
    appendAudit = core.appendAudit;
    verifyAuditChain = core.verifyAuditChain;

    // Rule 11 applied to the import itself: a typo in the module path or
    // a rename would leave these undefined, and every test below would
    // fail with a message about `appendAudit is not a function` rather
    // than with one about the chain. Say which it is.
    expect(typeof appendAudit, "core.appendAudit was not importable").toBe("function");
    expect(typeof verifyAuditChain, "core.verifyAuditChain was not importable").toBe("function");
  });
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
        appendWithoutLock({ orgId, action: "unlocked", entityType: "T", entityId: `u-${i}` }),
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

  it("VERIFIES ACROSS PAGE BOUNDARIES — a chain longer than one page", async () => {
    // verifyAuditChain used to be one unbounded findMany: the entire
    // audit log of an organisation into a Lambda's memory, on the
    // endpoint a REGULATOR is invited to call. It would have fallen over
    // on exactly the operator whose chain most needed verifying, and it
    // would have fallen over as a timeout — which an inspector reads as
    // "the integrity check did not work".
    //
    // Paging a hash chain introduces a specific new way to be wrong: the
    // running predecessor has to survive the boundary. Restart it and
    // every boundary looks like tampering; skip the first row's link
    // check and a splice at a multiple of the page size passes unseen.
    //
    // The page is 1,000, so 2,500 rows crosses it twice. They are built
    // and bulk-inserted rather than appended one at a time, because the
    // property under test is the VERIFIER's paging and 2,500 locked
    // transactions would be minutes of nothing.
    const N = 2_500;
    const rows = [];
    let prev = GENESIS;
    for (let i = 0; i < N; i++) {
      const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + i * 1000);
      const row = {
        orgId,
        action: "bulk",
        entityType: "T",
        entityId: `bulk-${i}`,
        createdAt,
        prevHash: prev,
        hash: "",
      };
      row.hash = sha256(auditMaterial({ ...row, userId: null, detail: null }));
      prev = row.hash;
      rows.push(row);
    }
    await prisma().auditLog.createMany({ data: rows });

    const clean = await verifyAuditChain(orgId);
    expect(clean.ok, "a well-formed 2,500-row chain failed to verify").toBe(true);
    expect(clean.rowsChecked).toBe(N);

    // Tamper INSIDE the second page. If the carry were broken this would
    // still be caught, so it is the weaker of the two.
    await prisma().$executeRawUnsafe(
      `UPDATE "AuditLog" SET action = 'edited' WHERE "entityId" = 'bulk-1500'`,
    );
    const mid = await verifyAuditChain(orgId);
    expect(mid.ok).toBe(false);
    expect(mid.contentAlteredAtSeq).toBeDefined();
  });

  it("catches an edit at exactly the page boundary", async () => {
    // THE COUNTER-TEST for the one above. An edit to the FIRST row of a
    // page is the row whose link check a naive paging implementation
    // skips — it is the row the previous page would have validated. If
    // this passes while the test above passes, the carry is real.
    const N = 1_200; // one full page plus a bit
    const rows = [];
    let prev = GENESIS;
    for (let i = 0; i < N; i++) {
      const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + i * 1000);
      const row = {
        orgId, action: "bulk", entityType: "T", entityId: `edge-${i}`,
        createdAt, prevHash: prev, hash: "",
      };
      row.hash = sha256(auditMaterial({ ...row, userId: null, detail: null }));
      prev = row.hash;
      rows.push(row);
    }
    await prisma().auditLog.createMany({ data: rows });
    expect((await verifyAuditChain(orgId)).ok).toBe(true);

    // Index 1000 is the first row of the second page.
    await prisma().$executeRawUnsafe(
      `UPDATE "AuditLog" SET action = 'edited' WHERE "entityId" = 'edge-1000'`,
    );
    const verdict = await verifyAuditChain(orgId);
    expect(verdict.ok, "an edit at the first row of page two was not detected").toBe(false);
    expect(verdict.contentAlteredAtSeq).toBeDefined();
    // And it stopped AT the boundary, not before it — proof the first
    // page verified and the carry reached across.
    expect(verdict.rowsChecked).toBe(1000);
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
