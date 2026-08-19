-- Two corrections found by audit, both in the same shape: a constraint
-- that was reasoned about correctly in one place and not applied in the
-- other.
--
-- 1. AuditLog.userId was ON DELETE SET NULL. The chain's hash commits to
--    userId, so deleting a user rewrote the hashed content of every row
--    naming them and the chain reported itself tampered with. An
--    ordinary offboarding, producing a verdict indistinguishable from
--    real tampering. Reproduced before this migration was written:
--
--      BEFORE: {"ok":true,"rowsChecked":3}
--      AFTER:  {"ok":false,"contentAlteredAtSeq":"4"}
--
--    RESTRICT refuses the delete instead. User.active already exists and
--    is what offboarding is supposed to use.
--
-- 2. SafetyReport.clientId was globally unique. clientId is generated on
--    the device, so one operator's value could collide with another's —
--    raising an uncaught P2002 inside the sync batch loop, returning 500
--    for the whole batch, and leaving the device retrying into it
--    forever. The identical fix was applied to SyncReceipt months ago,
--    with a comment explaining exactly why; SafetyReport was missed.
--
-- Both are safe on existing data: no user is deleted by the application
-- today, and clientId values are UUIDs, so no cross-org collision can
-- already exist for the new unique index to reject.

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

-- DropIndex
DROP INDEX "SafetyReport_clientId_key";

-- CreateIndex
CREATE UNIQUE INDEX "SafetyReport_orgId_clientId_key" ON "SafetyReport"("orgId", "clientId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
