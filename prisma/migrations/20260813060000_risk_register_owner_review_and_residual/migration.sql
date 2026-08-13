-- ELEMENTS 2.1 and 2.2 — the standing register, off the handset.
--
-- RiskAssessment already held the assessment: severity, likelihood, the
-- score and tolerability of record, and the acceptance. What lived only
-- in one browser was everything that makes it a REGISTER rather than a
-- filing cabinet — the controls, the residual position after them, the
-- owner, the review date and the status.
--
-- A hazard with no owner and no review date has been assessed and not
-- managed, and that is the finding an auditor writes.
--
-- ADDITIVE ONLY. Every column is nullable or defaulted, so existing
-- assessments keep their meaning: an assessment made before this
-- migration has no controls and no residual position, which is exactly
-- what it had.

CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'MITIGATED', 'ACCEPTED', 'CLOSED');

ALTER TABLE "RiskAssessment" ADD COLUMN "controls" TEXT;

-- The residual pair travels with its own score and tolerability for the
-- same documented reason the initial pair does: it is the assessment of
-- record at a point in time. Recomputing it if the matrix is ever
-- revised would rewrite a decision somebody signed.
ALTER TABLE "RiskAssessment" ADD COLUMN "residualSeverity" "Severity";
ALTER TABLE "RiskAssessment" ADD COLUMN "residualLikelihood" "Likelihood";
ALTER TABLE "RiskAssessment" ADD COLUMN "residualScore" INTEGER;
ALTER TABLE "RiskAssessment" ADD COLUMN "residualTolerability" "Tolerability";

ALTER TABLE "RiskAssessment" ADD COLUMN "owner" TEXT;
ALTER TABLE "RiskAssessment" ADD COLUMN "reviewBy" TIMESTAMP(3);
ALTER TABLE "RiskAssessment" ADD COLUMN "status" "RiskStatus" NOT NULL DEFAULT 'OPEN';

-- updatedAt has no default in Prisma's model, so existing rows are
-- backfilled from createdAt rather than from now(): a row's last change
-- was when it was made, and stamping every historic assessment with the
-- migration time would claim they were all touched today.
ALTER TABLE "RiskAssessment" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "RiskAssessment" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "RiskAssessment" ALTER COLUMN "updatedAt" SET NOT NULL;

-- The two queries a safety office actually runs: what is open, what is due.
CREATE INDEX "RiskAssessment_orgId_status_idx" ON "RiskAssessment"("orgId", "status");
CREATE INDEX "RiskAssessment_orgId_reviewBy_idx" ON "RiskAssessment"("orgId", "reviewBy");
