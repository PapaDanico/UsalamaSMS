-- =====================================================================
-- The other eight Annex 19 elements.
--
-- Everything before this migration served elements 2.1, 2.2, 3.1 and
-- 3.2 — reporting, risk, indicators and change. /coverage has been
-- telling operators for months that the product can SCORE the other
-- eight and cannot DO them; these tables are the difference.
--
--   1.1  SafetyPolicy + PolicyAcknowledgement
--   1.2  Accountability
--   1.3  Appointment
--   1.4  EmergencyExercise
--   1.5  ControlledDocument
--   3.3  AuditFinding
--   4.1  TrainingRecord
--   4.2  SafetyCommunication
--
-- Every table is orgId-first and RLS-enabled with no policies, like the
-- rest — the API connects as the owner and scopes tenancy in SQL.
--
-- Every user reference is ON DELETE RESTRICT rather than SET NULL. A
-- signature, an appointment, a verification and a training record are
-- all statements about a person, and nulling the person silently turns
-- "signed by the accountable executive" into "signed by nobody" — the
-- same defect the audit chain had, in eight new places.
-- =====================================================================


-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('NONCONFORMITY', 'OBSERVATION', 'IMPROVEMENT');

-- CreateTable
CREATE TABLE "SafetyPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "statement" TEXT NOT NULL,
    "signedById" TEXT,
    "signedOn" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "supersededOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAcknowledgement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accountability" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "post" TEXT NOT NULL,
    "responsibility" TEXT NOT NULL,
    "elementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Accountability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "post" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appointedOn" TIMESTAMP(3) NOT NULL,
    "letterRef" TEXT,
    "endedOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyExercise" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "heldOn" TIMESTAMP(3) NOT NULL,
    "participants" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "planUpdated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledDocument" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedOn" TIMESTAMP(3),
    "reviewBy" TIMESTAMP(3),
    "supersededOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlledDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "auditRef" TEXT NOT NULL,
    "finding" TEXT NOT NULL,
    "elementId" TEXT,
    "severity" "FindingSeverity" NOT NULL DEFAULT 'OBSERVATION',
    "ownerPost" TEXT NOT NULL,
    "dueBy" TIMESTAMP(3),
    "correctiveAction" TEXT,
    "closedOn" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "completedOn" TIMESTAMP(3) NOT NULL,
    "expiresOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyCommunication" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT,
    "reportId" TEXT,

    CONSTRAINT "SafetyCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SafetyPolicy_orgId_supersededOn_idx" ON "SafetyPolicy"("orgId", "supersededOn");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyPolicy_orgId_version_key" ON "SafetyPolicy"("orgId", "version");

-- CreateIndex
CREATE INDEX "PolicyAcknowledgement_orgId_acknowledgedAt_idx" ON "PolicyAcknowledgement"("orgId", "acknowledgedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAcknowledgement_policyId_userId_key" ON "PolicyAcknowledgement"("policyId", "userId");

-- CreateIndex
CREATE INDEX "Accountability_orgId_post_idx" ON "Accountability"("orgId", "post");

-- CreateIndex
CREATE INDEX "Appointment_orgId_post_endedOn_idx" ON "Appointment"("orgId", "post", "endedOn");

-- CreateIndex
CREATE INDEX "EmergencyExercise_orgId_heldOn_idx" ON "EmergencyExercise"("orgId", "heldOn");

-- CreateIndex
CREATE INDEX "ControlledDocument_orgId_reviewBy_idx" ON "ControlledDocument"("orgId", "reviewBy");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledDocument_orgId_reference_version_key" ON "ControlledDocument"("orgId", "reference", "version");

-- CreateIndex
CREATE INDEX "AuditFinding_orgId_closedOn_dueBy_idx" ON "AuditFinding"("orgId", "closedOn", "dueBy");

-- CreateIndex
CREATE INDEX "AuditFinding_orgId_elementId_idx" ON "AuditFinding"("orgId", "elementId");

-- CreateIndex
CREATE INDEX "TrainingRecord_orgId_expiresOn_idx" ON "TrainingRecord"("orgId", "expiresOn");

-- CreateIndex
CREATE INDEX "TrainingRecord_orgId_userId_idx" ON "TrainingRecord"("orgId", "userId");

-- CreateIndex
CREATE INDEX "SafetyCommunication_orgId_publishedOn_idx" ON "SafetyCommunication"("orgId", "publishedOn");

-- AddForeignKey
ALTER TABLE "SafetyPolicy" ADD CONSTRAINT "SafetyPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyPolicy" ADD CONSTRAINT "SafetyPolicy_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgement" ADD CONSTRAINT "PolicyAcknowledgement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgement" ADD CONSTRAINT "PolicyAcknowledgement_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SafetyPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgement" ADD CONSTRAINT "PolicyAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accountability" ADD CONSTRAINT "Accountability_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyExercise" ADD CONSTRAINT "EmergencyExercise_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledDocument" ADD CONSTRAINT "ControlledDocument_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledDocument" ADD CONSTRAINT "ControlledDocument_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCommunication" ADD CONSTRAINT "SafetyCommunication_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCommunication" ADD CONSTRAINT "SafetyCommunication_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCommunication" ADD CONSTRAINT "SafetyCommunication_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SafetyReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- =====================================================================
-- AND THE SAME DENY-BY-DEFAULT POSTURE AS EVERY OTHER TABLE.
--
-- RLS is enabled with NO policies across this schema: the anon and
-- authenticated roles can reach nothing, and the API connects as the
-- table owner and scopes tenancy in SQL. See CLAUDE.md.
--
-- New tables do NOT inherit that. Postgres creates them with row
-- security off, and the migration that established the posture named
-- its ten tables one by one — so eight new tables arrived outside it,
-- silently, in the same change that made them hold an operator's signed
-- safety policy and its people's training records.
--
-- tests/integration/rls.integration.test.ts now asserts the property
-- over pg_tables rather than over a list, so the ninth table cannot
-- repeat this.
-- =====================================================================
ALTER TABLE "SafetyPolicy"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyAcknowledgement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Accountability"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmergencyExercise"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ControlledDocument"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditFinding"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrainingRecord"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SafetyCommunication"   ENABLE ROW LEVEL SECURITY;
