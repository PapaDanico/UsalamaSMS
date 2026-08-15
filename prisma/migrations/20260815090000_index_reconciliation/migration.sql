-- RECONCILING THE INDEXES WITH THE SCHEMA THAT DESCRIBES THEM.
--
-- Production and this repository had diverged in both directions, and
-- one migration has to close both because a half-reconciled schema is
-- how the next `prisma migrate dev` silently undoes somebody's work.
--
-- WHAT CAME FROM PRODUCTION AND IS KEPT: thirty-four single-column
-- indexes on foreign keys. Postgres does not create these; an
-- unindexed FK makes every cascade and every parent-row lock scan the
-- child table. They were applied directly to the database, so they
-- existed in no migration and no schema — meaning any environment
-- built from this repo did not have them. They are declared in
-- schema.prisma now, with `map:` preserving the names already in
-- production so nothing is rebuilt.
--
-- WHAT CAME FROM PRODUCTION AND IS REVERSED: twenty-five composite
-- indexes were dropped as "unused". The evidence was
-- pg_stat_user_indexes on a database of FIFTY-FOUR ROWS, largest table
-- seventeen. Postgres will not use an index on a table that small — a
-- sequential scan is cheaper — so idx_scan = 0 there is a fact about
-- table size and nothing else. Zero of SafetyReport's indexes had ever
-- been scanned, its PRIMARY KEY included; on that evidence the primary
-- key is unused too.
--
-- Four of them serve predicates this product runs on its busiest
-- screens: the triage queue orders (orgId, state, createdAt); the
-- digest filters (orgId, reportedToAuthorityAt IS NULL); every list
-- query now filters (orgId, retractedAt IS NULL); overdue actions
-- filter (orgId, dueOn, completedOn). None of them fails on seven
-- rows. None of them fails on seven thousand. The schema comment on
-- the notification index said it first: "nothing fails until the table
-- is large."
--
-- WHAT IS DROPPED, AND IT IS THE ONE GENUINELY REDUNDANT ENTRY:
-- OrgConfig had both a UNIQUE constraint on orgId and a plain index on
-- orgId. A unique constraint IS an index. The second one served no
-- read and cost every write.
--
-- IDEMPOTENT THROUGHOUT, because this has to bring BOTH a production
-- database that has the FK indexes and lacks the composites, and a
-- local one that has the composites and lacks the FK indexes, to the
-- same place.


-- ---- Foreign keys: create where missing ----
CREATE INDEX IF NOT EXISTS "idx_appointment_userid" ON public."Appointment" ("userId");
CREATE INDEX IF NOT EXISTS "idx_auditfinding_verifiedbyid" ON public."AuditFinding" ("verifiedById");
CREATE INDEX IF NOT EXISTS "idx_auditlog_userid" ON public."AuditLog" ("userId");
CREATE INDEX IF NOT EXISTS "idx_changeassessment_orgid" ON public."ChangeAssessment" ("orgId");
CREATE INDEX IF NOT EXISTS "idx_changeassessment_approvedbyid" ON public."ChangeAssessment" ("approvedById");
CREATE INDEX IF NOT EXISTS "idx_controlleddocument_approvedbyid" ON public."ControlledDocument" ("approvedById");
CREATE INDEX IF NOT EXISTS "idx_correctiveaction_orgid" ON public."CorrectiveAction" ("orgId");
CREATE INDEX IF NOT EXISTS "idx_correctiveaction_reportid" ON public."CorrectiveAction" ("reportId");
CREATE INDEX IF NOT EXISTS "idx_correctiveaction_changeid" ON public."CorrectiveAction" ("changeId");
CREATE INDEX IF NOT EXISTS "idx_correctiveaction_completedbyid" ON public."CorrectiveAction" ("completedById");
CREATE INDEX IF NOT EXISTS "idx_correctiveaction_findingid" ON public."CorrectiveAction" ("findingId");
CREATE INDEX IF NOT EXISTS "idx_correctiveaction_riskid" ON public."CorrectiveAction" ("riskId");
CREATE INDEX IF NOT EXISTS "idx_correctiveaction_verifiedbyid" ON public."CorrectiveAction" ("verifiedById");
CREATE INDEX IF NOT EXISTS "idx_documentacknowledgement_orgid" ON public."DocumentAcknowledgement" ("orgId");
CREATE INDEX IF NOT EXISTS "idx_documentacknowledgement_userid" ON public."DocumentAcknowledgement" ("userId");
CREATE INDEX IF NOT EXISTS "idx_emergencycontact_orgid" ON public."EmergencyContact" ("orgId");
CREATE INDEX IF NOT EXISTS "idx_emergencycontact_verifiedbyid" ON public."EmergencyContact" ("verifiedById");
CREATE INDEX IF NOT EXISTS "idx_hazard_reportid" ON public."Hazard" ("reportId");
CREATE INDEX IF NOT EXISTS "idx_policyacknowledgement_orgid" ON public."PolicyAcknowledgement" ("orgId");
CREATE INDEX IF NOT EXISTS "idx_policyacknowledgement_userid" ON public."PolicyAcknowledgement" ("userId");
CREATE INDEX IF NOT EXISTS "idx_reporttransition_orgid" ON public."ReportTransition" ("orgId");
CREATE INDEX IF NOT EXISTS "idx_reporttransition_reportid" ON public."ReportTransition" ("reportId");
CREATE INDEX IF NOT EXISTS "idx_reporttransition_byuserid" ON public."ReportTransition" ("byUserId");
CREATE INDEX IF NOT EXISTS "idx_riskassessment_hazardid" ON public."RiskAssessment" ("hazardId");
CREATE INDEX IF NOT EXISTS "idx_safetycommunication_publishedbyid" ON public."SafetyCommunication" ("publishedById");
CREATE INDEX IF NOT EXISTS "idx_safetycommunication_reportid" ON public."SafetyCommunication" ("reportId");
CREATE INDEX IF NOT EXISTS "idx_safetypolicy_signedbyid" ON public."SafetyPolicy" ("signedById");
CREATE INDEX IF NOT EXISTS "idx_safetyreport_reporterid" ON public."SafetyReport" ("reporterId");
CREATE INDEX IF NOT EXISTS "idx_safetyreport_reportedtoauthoritybyid" ON public."SafetyReport" ("reportedToAuthorityById");
CREATE INDEX IF NOT EXISTS "idx_safetyreport_retractedbyid" ON public."SafetyReport" ("retractedById");
CREATE INDEX IF NOT EXISTS "idx_syncreceipt_userid" ON public."SyncReceipt" ("userId");
CREATE INDEX IF NOT EXISTS "idx_trainingrecord_userid" ON public."TrainingRecord" ("userId");

-- ---- Composites the schema declares: restore where missing ----
CREATE INDEX IF NOT EXISTS "TrainingRecord_orgId_expiresOn_idx" ON public."TrainingRecord" ("orgId", "expiresOn");
CREATE INDEX IF NOT EXISTS "VoluntaryScheme_orgId_idx" ON public."VoluntaryScheme" ("orgId");
CREATE INDEX IF NOT EXISTS "ChangeAssessment_orgId_status_idx" ON public."ChangeAssessment" ("orgId", "status");
CREATE INDEX IF NOT EXISTS "ChangeAssessment_orgId_effectiveFrom_idx" ON public."ChangeAssessment" ("orgId", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "DocumentAcknowledgement_orgId_acknowledgedAt_idx" ON public."DocumentAcknowledgement" ("orgId", "acknowledgedAt");
CREATE INDEX IF NOT EXISTS "RiskAssessment_orgId_status_idx" ON public."RiskAssessment" ("orgId", "status");
CREATE INDEX IF NOT EXISTS "RiskAssessment_orgId_reviewBy_idx" ON public."RiskAssessment" ("orgId", "reviewBy");
CREATE INDEX IF NOT EXISTS "CorrectiveAction_orgId_dueOn_completedOn_idx" ON public."CorrectiveAction" ("orgId", "dueOn", "completedOn");
CREATE INDEX IF NOT EXISTS "CorrectiveAction_orgId_reportId_idx" ON public."CorrectiveAction" ("orgId", "reportId");
CREATE INDEX IF NOT EXISTS "EmergencyContact_orgId_callOrder_idx" ON public."EmergencyContact" ("orgId", "callOrder");
CREATE INDEX IF NOT EXISTS "EmergencyContact_orgId_verifiedOn_idx" ON public."EmergencyContact" ("orgId", "verifiedOn");
CREATE INDEX IF NOT EXISTS "SafetyPolicy_orgId_supersededOn_idx" ON public."SafetyPolicy" ("orgId", "supersededOn");
CREATE INDEX IF NOT EXISTS "PolicyAcknowledgement_orgId_acknowledgedAt_idx" ON public."PolicyAcknowledgement" ("orgId", "acknowledgedAt");
CREATE INDEX IF NOT EXISTS "ControlledDocument_orgId_reviewBy_idx" ON public."ControlledDocument" ("orgId", "reviewBy");
CREATE INDEX IF NOT EXISTS "SpiPeriod_orgId_idx" ON public."SpiPeriod" ("orgId");
CREATE INDEX IF NOT EXISTS "SpiPeriod_spiId_idx" ON public."SpiPeriod" ("spiId");
CREATE INDEX IF NOT EXISTS "Spi_orgId_idx" ON public."Spi" ("orgId");
CREATE INDEX IF NOT EXISTS "SyncReceipt_orgId_createdAt_idx" ON public."SyncReceipt" ("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReportTransition_orgId_reportId_at_idx" ON public."ReportTransition" ("orgId", "reportId", "at");
CREATE INDEX IF NOT EXISTS "ReportTransition_orgId_toState_at_idx" ON public."ReportTransition" ("orgId", "toState", "at");
CREATE INDEX IF NOT EXISTS "SafetyReport_orgId_state_createdAt_idx" ON public."SafetyReport" ("orgId", "state", "createdAt");
CREATE INDEX IF NOT EXISTS "SafetyReport_orgId_type_occurredAt_idx" ON public."SafetyReport" ("orgId", "type", "occurredAt");
CREATE INDEX IF NOT EXISTS "SafetyReport_orgId_location_phase_idx" ON public."SafetyReport" ("orgId", "location", "phase");
CREATE INDEX IF NOT EXISTS "SafetyReport_orgId_reportedToAuthorityAt_idx" ON public."SafetyReport" ("orgId", "reportedToAuthorityAt");
CREATE INDEX IF NOT EXISTS "SafetyReport_orgId_retractedAt_idx" ON public."SafetyReport" ("orgId", "retractedAt");

-- ---- The one redundant index ----
DROP INDEX IF EXISTS public."OrgConfig_orgId_idx";
