-- The submission half of an indicator — Appendix II of CAA-AC-SMS009,
-- read against the document on 18 August 2026. All columns nullable:
-- the form is filled over time and the screen names what is blank.
--
-- WHAT WAS STRIPPED FROM WHAT `migrate dev` PROPOSED, and why. The
-- generated file also carried six ALTER COLUMN ... DROP DEFAULT
-- statements over Org, OrgConfig and SafetyReport scalar lists — the
-- exact artefact CLAUDE.md records from 18 August 2026, which broke
-- twenty-nine tests when it was accepted once. Prisma omits a scalar
-- list it was not given and relies on the column default; dropping it
-- makes inserts fail. It also proposed dropping
-- "Hazard_orgId_discovery_idx", which is not this feature either.
-- A migration named for the feature carries the feature.
ALTER TABLE "Spi" ADD COLUMN     "acceptance" TEXT,
ADD COLUMN     "acceptedOn" TIMESTAMP(3),
ADD COLUMN     "areaOfOperations" TEXT,
ADD COLUMN     "dataCustodian" TEXT,
ADD COLUMN     "dataProvider" TEXT,
ADD COLUMN     "dataSets" TEXT,
ADD COLUMN     "definitionOfTerms" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "indicatorType" TEXT,
ADD COLUMN     "limitations" TEXT,
ADD COLUMN     "rationale" TEXT,
ADD COLUMN     "submittedOn" TIMESTAMP(3);
