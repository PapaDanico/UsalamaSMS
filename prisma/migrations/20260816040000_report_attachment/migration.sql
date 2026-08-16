-- Evidence attached to a report. THE BYTES ARE NOT HERE: this row is
-- the record, the file lives in object storage under "key". A
-- photograph is megabytes and there may be six per report, which in a
-- column would inflate every backup and every statement crossing the
-- transaction pooler.
--
-- "sha256" is what makes it evidence rather than an assertion. The
-- audit chain covers this row, so it covers the hash, so a file swapped
-- in storage after the fact no longer matches what the chain attests.
CREATE TABLE "ReportAttachment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "label" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportAttachment_key_key" ON "ReportAttachment"("key");

-- orgId FIRST, as on every tenant-owned table here: a read is scoped to
-- one operator before it is narrowed to one report.
CREATE INDEX "ReportAttachment_orgId_reportId_idx" ON "ReportAttachment"("orgId", "reportId");

ALTER TABLE "ReportAttachment" ADD CONSTRAINT "ReportAttachment_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportAttachment" ADD CONSTRAINT "ReportAttachment_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "SafetyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The posture every table in this database carries: RLS on, one
-- RESTRICTIVE deny-all. The API connects as the owner and RLS does not
-- apply to a table's owner, so this denies everybody else and nothing
-- else. See CLAUDE.md.
ALTER TABLE "ReportAttachment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_not_owner" ON "ReportAttachment"
    AS RESTRICTIVE FOR ALL TO public USING (false);
