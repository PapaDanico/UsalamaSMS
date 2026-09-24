-- Manuals: chunked upload, and the text the parser read.
--
-- ONLY THIS FEATURE. `migrate diff` also proposed dropping the defaults on
-- Org.fleetTypes/bases/operationTypes, OrgConfig.aerodromes/aircraftTypes
-- and SafetyReport.cicttCodes, and an index on Hazard. Those are the false
-- drift CLAUDE.md records — dropping the scalar-list defaults breaks
-- inserts — and none of it is this change.

ALTER TABLE "ControlledDocument" ADD COLUMN     "extractedText" TEXT,
ADD COLUMN     "kind" TEXT,
ADD COLUMN     "pageCount" INTEGER,
ADD COLUMN     "parsed" JSONB,
ADD COLUMN     "parsedAt" TIMESTAMP(3),
ADD COLUMN     "parserVersion" TEXT;

CREATE TABLE "DocumentUpload" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "totalBytes" INTEGER NOT NULL,
    "received" INTEGER NOT NULL DEFAULT 0,
    "chunks" INTEGER NOT NULL DEFAULT 0,
    "data" BYTEA NOT NULL DEFAULT '\x',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentUpload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentUpload_orgId_expiresAt_idx" ON "DocumentUpload"("orgId", "expiresAt");
CREATE INDEX "idx_documentupload_userid" ON "DocumentUpload"("userId");

ALTER TABLE "DocumentUpload" ADD CONSTRAINT "DocumentUpload_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentUpload" ADD CONSTRAINT "DocumentUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The deny-by-default posture, in the same migration as the table: row
-- security on, the RESTRICTIVE deny-all, and the guarded revoke.
ALTER TABLE "DocumentUpload" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_not_owner" ON "DocumentUpload"
    AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE "DocumentUpload" FROM %I', r);
    END IF;
  END LOOP;
END $$;
