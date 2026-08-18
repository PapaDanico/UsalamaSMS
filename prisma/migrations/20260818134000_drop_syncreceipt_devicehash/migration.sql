-- SyncReceipt.deviceHash was a join key, not a mask.
--
-- It held hmac(deviceId) for anonymous submissions. The same column
-- stores deviceId in CLEARTEXT for named submissions, so the candidate
-- set was never guessed — it was SELECT DISTINCT "deviceId". Hash each,
-- match the deviceHash, and syncReceipt.clientId = safetyReport.clientId
-- names the anonymous report while the sibling row names the person.
--
-- Nothing read it. Three writes, zero reads; duplicate detection is
-- @@unique([orgId, clientId]).
--
-- The UPDATE runs first and is not redundant: DROP COLUMN leaves the
-- values in dead tuples until a rewrite, and this table's rows are the
-- ones the property is about.
UPDATE "SyncReceipt" SET "deviceHash" = NULL WHERE "deviceHash" IS NOT NULL;

ALTER TABLE "SyncReceipt" DROP COLUMN "deviceHash";

-- Forces the rewrite that discards the dead tuples above. The table is
-- small (one row per synced entity) and this runs once.
VACUUM FULL "SyncReceipt";
