-- Jurisdiction: add ICAO, retire UG/TZ/RW.
--
-- All three retired values carried the EU's 72 hours as an "ICAO-common"
-- default. There is no such default: ICAO Annex 13 requires notification
-- with a minimum of delay and names no period, and Annex 19 leaves the
-- period to the State. Three rows of a compliance tool therefore asserted
-- a deadline no instrument states. See packages/shared/src/regulations.ts.
--
-- Postgres cannot drop a value from an enum in place, so the type is
-- rebuilt. Existing rows on a retired value MOVE TO ICAO rather than
-- blocking the migration: ICAO is exactly what they always were — an
-- operator whose State instrument nobody had read — and it is the only
-- destination that does not invent a second time. Reassigning them to KE
-- would give a Ugandan operator Kenya's 24-hour clock.

ALTER TYPE "Jurisdiction" RENAME TO "Jurisdiction_old";
CREATE TYPE "Jurisdiction" AS ENUM ('ICAO', 'KE', 'EU');

ALTER TABLE "Org" ALTER COLUMN "jurisdiction" DROP DEFAULT;
ALTER TABLE "SafetyReport" ALTER COLUMN "jurisdiction" DROP DEFAULT;

ALTER TABLE "Org"
  ALTER COLUMN "jurisdiction" TYPE "Jurisdiction"
  USING (CASE WHEN "jurisdiction"::text IN ('UG', 'TZ', 'RW')
              THEN 'ICAO' ELSE "jurisdiction"::text END)::"Jurisdiction";

ALTER TABLE "SafetyReport"
  ALTER COLUMN "jurisdiction" TYPE "Jurisdiction"
  USING (CASE WHEN "jurisdiction"::text IN ('UG', 'TZ', 'RW')
              THEN 'ICAO' ELSE "jurisdiction"::text END)::"Jurisdiction";

ALTER TABLE "Org" ALTER COLUMN "jurisdiction" SET DEFAULT 'KE';
ALTER TABLE "SafetyReport" ALTER COLUMN "jurisdiction" SET DEFAULT 'KE';

DROP TYPE "Jurisdiction_old";
