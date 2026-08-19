-- A DEVICE'S DELETE IS A LOCAL RETRACTION; THE SERVER'S ANSWER IS A
-- STATE.
--
-- Nothing is removed. A hard delete of a safety report destroys evidence
-- an auditor is entitled to and breaks the append-only audit chain that
-- makes the rest of the record worth anything — the same reasoning that
-- makes reporterId SetNull rather than Cascade when a person is
-- offboarded.
--
-- NULLABLE AND UN-BACKFILLED, deliberately. Every report that exists
-- today was not retracted, and NULL says exactly that. A default of
-- now() would retract the entire table; a NOT NULL with a sentinel date
-- would make "not retracted" a value somebody has to remember to
-- compare against.
ALTER TABLE "SafetyReport" ADD COLUMN "retractedAt" TIMESTAMP(3);
ALTER TABLE "SafetyReport" ADD COLUMN "retractedById" TEXT;
ALTER TABLE "SafetyReport" ADD COLUMN "retractedReason" TEXT;

-- SetNull, not Cascade, and not Restrict.
--
-- Cascade would delete the safety report when the person who retracted
-- it is deleted — the exact evidence loss this whole design refuses.
-- Restrict would block offboarding a leaver who once retracted a
-- duplicate. SetNull keeps the retraction true and lets the name go,
-- which is what the audit chain is for.
ALTER TABLE "SafetyReport"
  ADD CONSTRAINT "SafetyReport_retractedById_fkey"
  FOREIGN KEY ("retractedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EVERY list query gains `retractedAt IS NULL`, so the index that serves
-- the triage queue has to carry it — otherwise the exclusion costs a
-- scan on the one screen a safety office keeps open all day.
CREATE INDEX "SafetyReport_orgId_retractedAt_idx"
  ON "SafetyReport"("orgId", "retractedAt");
