-- THE FIVE THINGS A STATE FILES BESIDE THE OCCURRENCE CATEGORY.
--
-- cicttCodes answers what happened. These answer how badly it hurt
-- somebody, what it did to the aircraft, whether it was dark, whether
-- the crew could see, and what kind of flight it was — the denominators
-- that turn "eleven runway excursions" into a finding with a control
-- attached to it.
--
-- NULLABLE ON PURPOSE, AND NULL IS NOT "UNKNOWN". Null means nobody has
-- coded it yet; each vocabulary carries its own UNKNOWN for "somebody
-- trained looked and could not establish it". A backfill to UNKNOWN
-- would report an un-triaged backlog as a determination, so the seven
-- existing reports stay null and are visibly uncoded.
--
-- NOT ENUMS. The vocabularies live in packages/shared/src/adrep.ts and
-- are admitted to be unverified against their primary instruments; a
-- database-level enum would make correcting one a migration and make
-- accepting a legitimate value this build has not got yet impossible.
-- The route validates against the shared list.

ALTER TABLE "SafetyReport" ADD COLUMN IF NOT EXISTS "injuryLevel"    TEXT;
ALTER TABLE "SafetyReport" ADD COLUMN IF NOT EXISTS "aircraftDamage" TEXT;
ALTER TABLE "SafetyReport" ADD COLUMN IF NOT EXISTS "lightCondition" TEXT;
ALTER TABLE "SafetyReport" ADD COLUMN IF NOT EXISTS "metCondition"   TEXT;
ALTER TABLE "SafetyReport" ADD COLUMN IF NOT EXISTS "operationType"  TEXT;
