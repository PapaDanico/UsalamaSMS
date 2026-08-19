-- Element 1.4 — who to call, in what order, with what authority.
--
-- The exercise record answers what an inspector asks. This answers what
-- an operator needs at three in the morning, and it is the half element
-- 1.4's coverage entry has named as missing since it was written.
--
-- SCOPED NARROW ON PURPOSE. Not a document editor: an ERP is a manual
-- with call-out trees, checklists and diagrams, and a worse version of
-- a Word file helps nobody. The directory is the part that goes stale
-- fastest, is needed fastest, and that a document cannot enforce.
--
-- verifiedOn IS THE WHOLE POINT AND THERE IS NO STATUS COLUMN BESIDE
-- IT. A contact directory is not wrong when it is written; it goes
-- wrong quietly. The duty officer's number changes, the handling agent
-- is bought, the doctor retires — and none of that produces an event
-- inside this product. Staleness is computed against this date on every
-- read; a stored "current" flag would say current forever, which is the
-- exact failure mode a directory has.
--
-- callOrder IS NULLABLE and is sorted LAST when absent, in the query
-- rather than here — a naive ascending sort on a nullable column puts
-- the unordered contacts at the top of a list whose entire meaning is
-- the order. Same trap the corrective actions' due dates carried.
--
-- verifiedById IS RESTRICT, matching the audit chain: who confirmed a
-- number is part of the record.
--
-- ROW SECURITY ON, NO POLICY, NOT FORCED.

CREATE TABLE "EmergencyContact" (
    "id"    TEXT NOT NULL,
    "orgId" TEXT NOT NULL,

    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    "organisation" TEXT,
    "phone"        TEXT NOT NULL,
    "altPhone"     TEXT,
    "email"        TEXT,

    "callOrder" INTEGER,

    "authority" TEXT,
    "notes"     TEXT,

    "verifiedOn"   TIMESTAMP(3),
    "verifiedById" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- The order the directory is read in.
CREATE INDEX "EmergencyContact_orgId_callOrder_idx"
  ON "EmergencyContact"("orgId", "callOrder");
-- The query that finds what has gone stale.
CREATE INDEX "EmergencyContact_orgId_verifiedOn_idx"
  ON "EmergencyContact"("orgId", "verifiedOn");

ALTER TABLE "EmergencyContact"
  ADD CONSTRAINT "EmergencyContact_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmergencyContact"
  ADD CONSTRAINT "EmergencyContact_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmergencyContact" ENABLE ROW LEVEL SECURITY;
