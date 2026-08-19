-- Element 3.2 — the management of change, off the handset.
--
-- The element's evidence definition is unusually precise: "a change
-- assessment for the most recent significant change, DATED BEFORE IT
-- HAPPENED". An assessment written after the fleet arrived is a
-- justification, and the difference between the two is the element.
-- Both dates are stored and neither is derived: assessedOn is when the
-- thinking was done, effectiveFrom is when the change takes effect, and
-- their order is what an inspector reads.
--
-- effectiveFrom is NULLABLE on purpose. A change still being planned
-- has no date, and defaulting it to today would silently record every
-- draft as taking effect the moment it was typed — turning "assessed
-- before" into "assessed on the day", which is the claim this element
-- exists to test.
--
-- THE RISK POSITION IS STORED, deliberately and for the same reason
-- RiskAssessment's is: an assessment is a decision taken on a date
-- under the matrix as it stood, and recomputing it if the scale is
-- revised would rewrite a decision somebody approved.
--
-- ROW SECURITY ON, NO POLICY, NOT FORCED — this database's posture.
-- Postgres does not enable it by default, so a table added in a later
-- migration sits outside the posture unless its migration says so.

CREATE TYPE "ChangeTrigger" AS ENUM (
  'FLEET', 'ROUTE_OR_NETWORK', 'ORGANISATION', 'KEY_PERSONNEL',
  'EQUIPMENT_OR_SYSTEM', 'PROCEDURE', 'OTHER'
);

CREATE TYPE "ChangeStatus" AS ENUM (
  'DRAFT', 'ASSESSED', 'APPROVED', 'IN_EFFECT', 'REVIEWED'
);

CREATE TABLE "ChangeAssessment" (
    "id"                   TEXT NOT NULL,
    "orgId"                TEXT NOT NULL,
    "title"                TEXT NOT NULL,
    "description"          TEXT NOT NULL,
    "trigger"              "ChangeTrigger" NOT NULL,
    "assessedOn"           TIMESTAMP(3) NOT NULL,
    "effectiveFrom"        TIMESTAMP(3),
    "severity"             "Severity" NOT NULL,
    "likelihood"           "Likelihood" NOT NULL,
    "score"                INTEGER NOT NULL,
    "tolerability"         "Tolerability" NOT NULL,
    "controls"             TEXT,
    "residualSeverity"     "Severity",
    "residualLikelihood"   "Likelihood",
    "residualScore"        INTEGER,
    "residualTolerability" "Tolerability",
    "approvedById"         TEXT,
    "approvedAt"           TIMESTAMP(3),
    "reviewDueOn"          TIMESTAMP(3),
    "reviewedOn"           TIMESTAMP(3),
    "reviewNotes"          TEXT,
    "status"               "ChangeStatus" NOT NULL DEFAULT 'DRAFT',
    "updatedAt"            TIMESTAMP(3) NOT NULL,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeAssessment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChangeAssessment_orgId_status_idx" ON "ChangeAssessment"("orgId", "status");
CREATE INDEX "ChangeAssessment_orgId_effectiveFrom_idx" ON "ChangeAssessment"("orgId", "effectiveFrom");

ALTER TABLE "ChangeAssessment"
  ADD CONSTRAINT "ChangeAssessment_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChangeAssessment"
  ADD CONSTRAINT "ChangeAssessment_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChangeAssessment" ENABLE ROW LEVEL SECURITY;
