-- Recording that a reporting obligation was DISCHARGED.
--
-- The product computed deadlines from the day it shipped and had
-- nowhere to record that one had been met, so a notified occurrence and
-- a forgotten one looked identical. `deadlineStatus` takes a
-- `submittedAt` meaning "discharged" and was called from nowhere in the
-- API — the function existed, tested, and unreachable.
--
-- ALL THREE NULLABLE, AND NULLABLE PERMANENTLY. Most reports are not
-- occurrences and owe nobody a notification; a NOT NULL with a default
-- would turn "not applicable" into "done" on every historical row, and
-- the row it would lie about most confidently is the one somebody
-- forgot to file.
--
-- No backfill for the same reason. An existing occurrence whose window
-- has passed genuinely has an unknown status, and unknown is the
-- correct thing to store about it.
ALTER TABLE "SafetyReport" ADD COLUMN "reportedToAuthorityAt" TIMESTAMP(3);
ALTER TABLE "SafetyReport" ADD COLUMN "reportedToAuthorityById" TEXT;
ALTER TABLE "SafetyReport" ADD COLUMN "authorityReference" TEXT;

ALTER TABLE "SafetyReport"
  ADD CONSTRAINT "SafetyReport_reportedToAuthorityById_fkey"
  FOREIGN KEY ("reportedToAuthorityById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- The digest and the triage queue both ask "which occurrences still owe
-- a notification", which is a scan of this column within a tenant.
CREATE INDEX "SafetyReport_orgId_reportedToAuthorityAt_idx"
  ON "SafetyReport"("orgId", "reportedToAuthorityAt");
