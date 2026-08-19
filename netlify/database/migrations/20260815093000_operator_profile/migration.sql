-- WHAT THE OPERATOR FLIES, AND FROM WHERE.
--
-- The denominators every rate this product computes has been missing.
-- fleetSize answers what it costs; these answer what the safety office
-- is looking at. Codes come from the shared vocabularies — AIRCRAFT_TYPES,
-- AERODROMES, and the same OPERATION_TYPES the triage panel codes an
-- occurrence against, so a declared profile and a coded occurrence group
-- together rather than being two vocabularies for one fact.
--
-- DEFAULT EMPTY, NOT NULL. An operator that skipped the question is
-- visibly un-profiled. There is no sentinel that would count as an
-- answer nobody gave.

ALTER TABLE "Org" ADD COLUMN IF NOT EXISTS "fleetTypes"     TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Org" ADD COLUMN IF NOT EXISTS "bases"          TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Org" ADD COLUMN IF NOT EXISTS "operationTypes" TEXT[] NOT NULL DEFAULT '{}';
