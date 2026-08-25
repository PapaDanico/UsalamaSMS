-- CAA SET-I assessment ledger.
--
-- An assessment is a dated snapshot of evidence against every criterion.
-- The application creates all 48 items with the assessment, so an omitted
-- criterion stays visibly unassessed rather than disappearing from a score.
-- RLS follows the existing direct-API, deny-by-default posture.

CREATE TYPE "SetiAssessmentStatus" AS ENUM ('DRAFT', 'COMPLETE');
CREATE TYPE "SetiLevel" AS ENUM ('PRESENT', 'SUITABLE', 'OPERATING', 'EFFECTIVE');

CREATE TABLE "SetiAssessment" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "assessedOn" TIMESTAMP(3) NOT NULL,
  "status" "SetiAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
  "assessorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SetiAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SetiAssessmentItem" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "criterionId" TEXT NOT NULL,
  "level" "SetiLevel",
  "evidence" TEXT,
  "sourceRefs" TEXT,
  "ownerPost" TEXT,
  "reviewDueOn" TIMESTAMP(3),
  "assessorNotes" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SetiAssessmentItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SetiAssessmentItem_assessmentId_criterionId_key" UNIQUE ("assessmentId", "criterionId")
);

CREATE INDEX "SetiAssessment_orgId_assessedOn_idx" ON "SetiAssessment"("orgId", "assessedOn");
CREATE INDEX "idx_setiassessment_assessorid" ON "SetiAssessment"("assessorId");
CREATE INDEX "SetiAssessmentItem_criterionId_idx" ON "SetiAssessmentItem"("criterionId");

ALTER TABLE "SetiAssessment" ADD CONSTRAINT "SetiAssessment_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SetiAssessment" ADD CONSTRAINT "SetiAssessment_assessorId_fkey"
  FOREIGN KEY ("assessorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SetiAssessmentItem" ADD CONSTRAINT "SetiAssessmentItem_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "SetiAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SetiAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SetiAssessmentItem" ENABLE ROW LEVEL SECURITY;
