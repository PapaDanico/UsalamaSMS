-- Element 1.5 — who has read which REVISION of a controlled document.
--
-- The product controlled the REGISTER of documents: reference, version,
-- approver, review date. What it could not answer is the question an
-- auditor actually asks — who has read the version now in force.
--
-- THE UNIQUE CONSTRAINT IS ON (documentId, userId) AND THAT IS THE
-- POINT. ControlledDocument is unique on (orgId, reference, version), so
-- every revision is its own row, so a key on documentId is a key on a
-- REVISION. Reading revision 3 does not mark somebody as having read
-- revision 4.
--
-- A per-DOCUMENT key would have reported full coverage the moment a
-- revision shipped — the reassuring answer and the wrong one, and
-- exactly the failure that makes a distribution record worthless.
--
-- CASCADES MIRROR PolicyAcknowledgement, deliberately: the
-- acknowledgement dies with its document and NEVER with its user. Who
-- read a revision is part of the record, and an offboarded person
-- having read it remains true — the same reasoning that kept the audit
-- chain intact when offboarding was fixed.
--
-- ROW SECURITY ON, NO POLICY, NOT FORCED. Postgres does not enable it
-- by default, so a table added in a later migration sits outside the
-- posture unless its migration says so.

CREATE TABLE "DocumentAcknowledgement" (
    "id"             TEXT NOT NULL,
    "orgId"          TEXT NOT NULL,
    "documentId"     TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAcknowledgement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentAcknowledgement_documentId_userId_key"
  ON "DocumentAcknowledgement"("documentId", "userId");
CREATE INDEX "DocumentAcknowledgement_orgId_acknowledgedAt_idx"
  ON "DocumentAcknowledgement"("orgId", "acknowledgedAt");

ALTER TABLE "DocumentAcknowledgement"
  ADD CONSTRAINT "DocumentAcknowledgement_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentAcknowledgement"
  ADD CONSTRAINT "DocumentAcknowledgement_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "ControlledDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentAcknowledgement"
  ADD CONSTRAINT "DocumentAcknowledgement_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentAcknowledgement" ENABLE ROW LEVEL SECURITY;
