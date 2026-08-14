-- The CAPA loop — an action as its own object.
--
-- WHAT WAS MISSING. The product could record that something was DONE:
-- a note on a report's closure, a correctiveAction string on an audit
-- finding, controls on a register entry. What it could not do was treat
-- the action itself as an object with an owner, a date and a
-- verification, so "fit a guard to the fuel bowser by month end" lived
-- as prose inside whichever record mentioned it — invisible to any
-- question of the form "what is outstanding".
--
-- ONE TABLE, FOUR SOURCES, EXACTLY ONE SET. An action from a report, a
-- finding, a register entry or a change is the same kind of object.
-- Splitting it four ways gives an operator four lists and no answer
-- across the SMS.
--
-- THE CHECK CONSTRAINT IS THE POINT OF THIS MIGRATION. Prisma cannot
-- express "exactly one of these four", so without it the rule would be
-- a convention — and a convention is what the next developer does not
-- know about. A row with two sources would appear twice in one list and
-- a row with none would appear in no list at all, which is the worse of
-- the two: an action nobody can find is an action nobody does.
--
-- NO STATUS COLUMN, DELIBERATELY. Charter rule 6. A stored 'OPEN' is
-- still 'OPEN' the day after the due date passes, so the one state an
-- operator actually needs — overdue — is the one a stored status cannot
-- produce without a nightly job this product does not have and should
-- not need. statusOf() derives it from the dates on every read.
--
-- completedById AND verifiedById ARE RESTRICT, matching AuditLog. Who
-- did the work and who checked it are part of the record, and SetNull
-- would let an ordinary offboarding rewrite it.
--
-- ROW SECURITY ON, NO POLICY, NOT FORCED.

CREATE TABLE "CorrectiveAction" (
    "id"    TEXT NOT NULL,
    "orgId" TEXT NOT NULL,

    "reportId"  TEXT,
    "findingId" TEXT,
    "riskId"    TEXT,
    "changeId"  TEXT,

    "action"    TEXT NOT NULL,
    "ownerPost" TEXT NOT NULL,
    "dueOn"     TIMESTAMP(3),

    "completedOn"    TIMESTAMP(3),
    "completedById"  TEXT,
    "completionNote" TEXT,

    "verifiedOn"       TIMESTAMP(3),
    "verifiedById"     TEXT,
    "verificationNote" TEXT,

    "cancelledOn"     TIMESTAMP(3),
    "cancelledReason" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorrectiveAction_pkey" PRIMARY KEY ("id")
);

-- Exactly one source. Counted rather than written as a chain of ORs,
-- because the OR form is where the fourth source gets forgotten.
ALTER TABLE "CorrectiveAction"
  ADD CONSTRAINT "CorrectiveAction_exactly_one_source"
  CHECK (
    (CASE WHEN "reportId"  IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "findingId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "riskId"    IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "changeId"  IS NULL THEN 0 ELSE 1 END) = 1
  );

-- The question this table exists to answer: what is outstanding, and
-- what is late.
CREATE INDEX "CorrectiveAction_orgId_dueOn_completedOn_idx"
  ON "CorrectiveAction"("orgId", "dueOn", "completedOn");
CREATE INDEX "CorrectiveAction_orgId_reportId_idx"
  ON "CorrectiveAction"("orgId", "reportId");

ALTER TABLE "CorrectiveAction"
  ADD CONSTRAINT "CorrectiveAction_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CorrectiveAction"
  ADD CONSTRAINT "CorrectiveAction_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "SafetyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CorrectiveAction"
  ADD CONSTRAINT "CorrectiveAction_findingId_fkey"
  FOREIGN KEY ("findingId") REFERENCES "AuditFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CorrectiveAction"
  ADD CONSTRAINT "CorrectiveAction_riskId_fkey"
  FOREIGN KEY ("riskId") REFERENCES "RiskAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CorrectiveAction"
  ADD CONSTRAINT "CorrectiveAction_changeId_fkey"
  FOREIGN KEY ("changeId") REFERENCES "ChangeAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CorrectiveAction"
  ADD CONSTRAINT "CorrectiveAction_completedById_fkey"
  FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CorrectiveAction"
  ADD CONSTRAINT "CorrectiveAction_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CorrectiveAction" ENABLE ROW LEVEL SECURITY;
