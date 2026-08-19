-- What THIS operator calls things, and nothing else.
--
-- Every operator has been getting the same aerodromes, the same aircraft
-- types, the same post titles and the same words on the risk matrix. A
-- six-aircraft Kenyan AOC does not fly to the strips in the shipped list,
-- and its accountable executive is called whatever its own manual calls
-- them. Every incumbent lets an operator set this without a vendor change
-- order.
--
-- THE INTERESTING PART IS WHAT IS ABSENT FROM THIS TABLE. There is no
-- column for a reporting deadline, a tolerability band, an element
-- definition or a de-identification rule, and there never will be: those
-- come from the instrument, from Doc 9859, from Annex 19 and from L.N. 32's
-- Third Schedule. An operator able to edit them would have bought a
-- compliance tool that cannot be relied on for compliance. A claims gate
-- asserts that absence over this model's field names, because the way the
-- line gets crossed is a settings screen growing one more harmless field.
--
-- THE LABEL MAPS ARE JSON KEYED BY THE FRAMEWORK'S OWN KEYS, and unknown
-- keys are dropped by normaliseConfig() before they ever reach here. That
-- is what makes the scales RELABELLABLE and not REDEFINABLE. Storing the
-- scale as rows would have been the easy shape and the wrong one: a tenant
-- with four severities makes tolerability() index past the end of the
-- matrix, and the answer to "what band is this" starts depending on whose
-- database is being read. The arithmetic is this product's central claim
-- and it only holds if it is the same arithmetic everywhere.
--
-- ONE ROW PER ORG, enforced by the unique constraint rather than by
-- convention. Two configuration rows for one operator is two answers to
-- "what does this operator call a Catastrophic", and the one that wins
-- would be whichever the query happened to order first.
--
-- ARRAYS DEFAULT EMPTY, NOT NULL. An operator with no extra aerodromes and
-- an operator who has not opened the settings screen are the same thing —
-- they both get the shipped list — and two representations of one fact is
-- how they come to disagree.

CREATE TABLE "OrgConfig" (
  "id"                TEXT NOT NULL,
  "orgId"             TEXT NOT NULL,
  "severityLabels"    JSONB,
  "likelihoodLabels"  JSONB,
  "postTitles"        JSONB,
  "aerodromes"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "aircraftTypes"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reviewDefaultDays" INTEGER,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrgConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgConfig_orgId_key" ON "OrgConfig"("orgId");
CREATE INDEX "OrgConfig_orgId_idx" ON "OrgConfig"("orgId");

ALTER TABLE "OrgConfig"
  ADD CONSTRAINT "OrgConfig_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same posture as every other table: enabled, no policies, no Data API
-- grants. See CLAUDE.md.
ALTER TABLE "OrgConfig" ENABLE ROW LEVEL SECURITY;
