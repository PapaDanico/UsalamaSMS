-- What happened to a report — one row per move.
--
-- THE GAP THIS CLOSES. ReportState has had five values since the first
-- migration and four of them were unreachable: no route anywhere wrote
-- the column. Every report ever filed was SUBMITTED, permanently. That
-- is a filing cabinet, and element 2.1's own evidence line asks for "a
-- report rate that is trending", which a queue that only grows cannot
-- be.
--
-- THE HISTORY IS THE RECORD, not a closedAt column. A column answers
-- "when"; an inspector asks by whom, from what state, and what was
-- done about it. It also makes time-to-closure derivable from the
-- FIRST closure — a column overwritten on reopening could not answer
-- that at all, and would report a reopening as slowness.
--
-- byUserId IS RESTRICT, matching AuditLog rather than SafetyReport's
-- reporter. Who moved a report is part of the record and an offboarded
-- person having triaged it remains true. SetNull here would also
-- silently rewrite history during an ordinary administrative act,
-- which is the exact defect that broke the audit chain once already.
--
-- note IS NULLABLE rather than defaulted to the empty string: "no note
-- was required" and "a note was required and somebody typed nothing"
-- are different facts, and the second one is refused by the route
-- before it reaches here.
--
-- ROW SECURITY ON, NO POLICY, NOT FORCED. Postgres does not enable it
-- by default, so a table added in a later migration sits outside the
-- posture unless its migration says so.

CREATE TABLE "ReportTransition" (
    "id"        TEXT NOT NULL,
    "orgId"     TEXT NOT NULL,
    "reportId"  TEXT NOT NULL,
    "fromState" "ReportState" NOT NULL,
    "toState"   "ReportState" NOT NULL,
    "note"      TEXT,
    "byUserId"  TEXT NOT NULL,
    "at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportTransition_pkey" PRIMARY KEY ("id")
);

-- The order the history is read in.
CREATE INDEX "ReportTransition_orgId_reportId_at_idx"
  ON "ReportTransition"("orgId", "reportId", "at");
-- The index the closure indicator aggregates over.
CREATE INDEX "ReportTransition_orgId_toState_at_idx"
  ON "ReportTransition"("orgId", "toState", "at");

ALTER TABLE "ReportTransition"
  ADD CONSTRAINT "ReportTransition_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportTransition"
  ADD CONSTRAINT "ReportTransition_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "SafetyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportTransition"
  ADD CONSTRAINT "ReportTransition_byUserId_fkey"
  FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportTransition" ENABLE ROW LEVEL SECURITY;
