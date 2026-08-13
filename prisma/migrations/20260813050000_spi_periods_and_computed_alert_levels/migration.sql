-- ELEMENT 3.1 — safety performance monitoring, in a place the safety
-- office can see.
--
-- Regulation 9(5) of L.N. 32/2026 requires a service provider's SMS to
-- have "safety performance indicators and targets acceptable to the
-- Authority". The indicators existed and were computed correctly — in
-- one browser's localStorage. The Spi table meanwhile held a guess at
-- a feature that had since been designed somewhere else, and no code
-- path ever read or wrote it.
--
-- SAFE TO RUN AS A DROP-AND-REPLACE ONLY BECAUSE THE TABLE IS EMPTY OF
-- MEANING. Nothing writes it, so nothing depends on its columns. The
-- guard below refuses rather than assumes: if any operator has rows
-- here, this migration stops instead of discarding them.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM "Spi";
  IF n > 0 THEN
    RAISE EXCEPTION
      'Spi holds % row(s). This migration reshapes the table and was written for an empty one — migrate the data before running it.', n;
  END IF;
END $$;

ALTER TABLE "Spi" DROP COLUMN "unit";
-- alertLevel is DERIVED. alertLevels() computes it from the series, and
-- a stored alert level is the same defect as a stored deadline: correct
-- on the day it was written and silently wrong once the next period
-- lands. Charter rule 6.
ALTER TABLE "Spi" DROP COLUMN "alertLevel";

ALTER TABLE "Spi" ADD COLUMN "kind" TEXT NOT NULL;
ALTER TABLE "Spi" ADD COLUMN "exposureUnit" TEXT NOT NULL;
ALTER TABLE "Spi" ADD COLUMN "per" DOUBLE PRECISION NOT NULL;
ALTER TABLE "Spi" ADD COLUMN "direction" TEXT NOT NULL;
ALTER TABLE "Spi" ADD COLUMN "owner" TEXT NOT NULL;
ALTER TABLE "Spi" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL;
ALTER TABLE "Spi" ALTER COLUMN "target" DROP NOT NULL;

-- One indicator per name per operator: two called "Runway excursions"
-- with different series is a measurement nobody can act on.
CREATE UNIQUE INDEX "Spi_orgId_name_key" ON "Spi"("orgId", "name");

CREATE TABLE "SpiPeriod" (
    "id" TEXT NOT NULL,
    -- Denormalised alongside spiId because every query in this API is
    -- scoped by orgId first, and a join is not a tenancy boundary.
    "orgId" TEXT NOT NULL,
    "spiId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "events" INTEGER NOT NULL,
    "exposure" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpiPeriod_pkey" PRIMARY KEY ("id")
);

-- C-07 in the schema this time. A period appended twice doubles the
-- exposure it contributes and moves the alert level for a reason that
-- did not happen.
CREATE UNIQUE INDEX "SpiPeriod_spiId_label_key" ON "SpiPeriod"("spiId", "label");
CREATE INDEX "SpiPeriod_orgId_idx" ON "SpiPeriod"("orgId");
CREATE INDEX "SpiPeriod_spiId_idx" ON "SpiPeriod"("spiId");

ALTER TABLE "SpiPeriod" ADD CONSTRAINT "SpiPeriod_spiId_fkey"
  FOREIGN KEY ("spiId") REFERENCES "Spi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The posture every table in this schema carries: RLS on, no policies,
-- nothing reachable by the anon or authenticated roles. See CLAUDE.md.
ALTER TABLE "SpiPeriod" ENABLE ROW LEVEL SECURITY;
