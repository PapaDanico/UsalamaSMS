-- CreateEnum
CREATE TYPE "Role" AS ENUM ('FRONTLINE', 'SAFETY_OFFICER', 'SAFETY_MANAGER', 'INVESTIGATOR', 'KEY_MANAGEMENT', 'ACCOUNTABLE_EXECUTIVE', 'REGULATOR_INSPECTOR', 'SYSTEM_ADMIN');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('MOR', 'VCR', 'HAZARD', 'SUGGESTION', 'NEAR_MISS', 'FATIGUE');

-- CreateEnum
CREATE TYPE "ReportState" AS ENUM ('SUBMITTED', 'TRIAGED', 'UNDER_INVESTIGATION', 'ACTIONS_OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('A_CATASTROPHIC', 'B_HAZARDOUS', 'C_MAJOR', 'D_MINOR', 'E_NEGLIGIBLE');

-- CreateEnum
CREATE TYPE "Likelihood" AS ENUM ('FREQUENT', 'OCCASIONAL', 'REMOTE', 'IMPROBABLE', 'EXTREMELY_IMPROBABLE');

-- CreateEnum
CREATE TYPE "Tolerability" AS ENUM ('INTOLERABLE', 'TOLERABLE', 'ACCEPTABLE');

-- CreateEnum
CREATE TYPE "Jurisdiction" AS ENUM ('KE', 'UG', 'TZ', 'RW', 'EU');

-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jurisdiction" "Jurisdiction" NOT NULL DEFAULT 'KE',
    "aocNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'FRONTLINE',
    "mfaSecret" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyReport" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "state" "ReportState" NOT NULL DEFAULT 'SUBMITTED',
    "title" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "awareAt" TIMESTAMP(3),
    "jurisdiction" "Jurisdiction" NOT NULL DEFAULT 'KE',
    "location" TEXT,
    "aircraftType" TEXT,
    "hrcTags" TEXT[],
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "reporterId" TEXT,
    "isDeIdentified" BOOLEAN NOT NULL DEFAULT false,
    "deIdentifiedAt" TIMESTAMP(3),
    "deIdentifiedNarrative" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hazard" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "reportId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hazard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "hazardId" TEXT NOT NULL,
    "consequence" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "likelihood" "Likelihood" NOT NULL,
    "score" INTEGER NOT NULL,
    "tolerability" "Tolerability" NOT NULL,
    "alarpJustification" TEXT,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Spi" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "alertLevel" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Spi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncReceipt" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "userId" TEXT,
    "deviceId" TEXT,
    "deviceHash" TEXT,
    "conflict" BOOLEAN NOT NULL DEFAULT false,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "detail" JSONB,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_orgId_role_idx" ON "User"("orgId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyReport_clientId_key" ON "SafetyReport"("clientId");

-- CreateIndex
CREATE INDEX "SafetyReport_orgId_state_createdAt_idx" ON "SafetyReport"("orgId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "SafetyReport_orgId_type_occurredAt_idx" ON "SafetyReport"("orgId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "Hazard_orgId_createdAt_idx" ON "Hazard"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "RiskAssessment_orgId_tolerability_idx" ON "RiskAssessment"("orgId", "tolerability");

-- CreateIndex
CREATE INDEX "Spi_orgId_idx" ON "Spi"("orgId");

-- CreateIndex
CREATE INDEX "SyncReceipt_orgId_createdAt_idx" ON "SyncReceipt"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncReceipt_orgId_clientId_key" ON "SyncReceipt"("orgId", "clientId");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_seq_idx" ON "AuditLog"("orgId", "seq");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyReport" ADD CONSTRAINT "SafetyReport_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyReport" ADD CONSTRAINT "SafetyReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hazard" ADD CONSTRAINT "Hazard_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hazard" ADD CONSTRAINT "Hazard_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SafetyReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_hazardId_fkey" FOREIGN KEY ("hazardId") REFERENCES "Hazard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spi" ADD CONSTRAINT "Spi_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncReceipt" ADD CONSTRAINT "SyncReceipt_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncReceipt" ADD CONSTRAINT "SyncReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
