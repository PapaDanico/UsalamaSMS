-- CreateEnum
CREATE TYPE "FlightPhase" AS ENUM ('STANDING', 'PUSHBACK', 'TAXI', 'TAKEOFF', 'INITIAL_CLIMB', 'CLIMB', 'CRUISE', 'DESCENT', 'APPROACH', 'LANDING', 'LANDING_ROLL', 'GO_AROUND', 'GROUND_HANDLING', 'MAINTENANCE');

-- AlterTable
ALTER TABLE "SafetyReport" ADD COLUMN     "phase" "FlightPhase";

-- CreateIndex
CREATE INDEX "SafetyReport_orgId_location_phase_idx" ON "SafetyReport"("orgId", "location", "phase");
