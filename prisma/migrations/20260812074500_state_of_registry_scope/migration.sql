-- Jurisdiction: retire EU, leaving the State of Registry (Kenya) and
-- the ICAO baseline.
--
-- The EU row was correct and cited — Regulation (EU) No 376/2014
-- Article 4(6), 72 hours from awareness. It is removed for scope rather
-- than accuracy: nothing in this product is built for an EU-registered
-- operator, and a jurisdiction offered in a dropdown is a claim to know
-- that jurisdiction's obligations. A reporting obligation follows the
-- State of Registry, so the product maintains one State's standard
-- properly and offers ICAO's baseline for every other.
--
-- Rows on the retired value move to ICAO, not to KE: an EU-registered
-- operator does not acquire Kenya's 24-hour clock because a dropdown
-- changed. ICAO's baseline names no period, which is the correct thing
-- to say about a State whose instrument this product no longer reads.

ALTER TYPE "Jurisdiction" RENAME TO "Jurisdiction_old";
CREATE TYPE "Jurisdiction" AS ENUM ('ICAO', 'KE');

ALTER TABLE "Org" ALTER COLUMN "jurisdiction" DROP DEFAULT;
ALTER TABLE "SafetyReport" ALTER COLUMN "jurisdiction" DROP DEFAULT;

ALTER TABLE "Org"
  ALTER COLUMN "jurisdiction" TYPE "Jurisdiction"
  USING (CASE WHEN "jurisdiction"::text = 'EU'
              THEN 'ICAO' ELSE "jurisdiction"::text END)::"Jurisdiction";

ALTER TABLE "SafetyReport"
  ALTER COLUMN "jurisdiction" TYPE "Jurisdiction"
  USING (CASE WHEN "jurisdiction"::text = 'EU'
              THEN 'ICAO' ELSE "jurisdiction"::text END)::"Jurisdiction";

ALTER TABLE "Org" ALTER COLUMN "jurisdiction" SET DEFAULT 'KE';
ALTER TABLE "SafetyReport" ALTER COLUMN "jurisdiction" SET DEFAULT 'KE';

DROP TYPE "Jurisdiction_old";
