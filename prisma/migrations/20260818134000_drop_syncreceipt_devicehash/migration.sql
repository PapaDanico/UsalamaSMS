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
-- DROP COLUMN alone can leave the values in dead tuples. Changing TEXT
-- to BYTEA with a NULL expression forces a transaction-safe table rewrite,
-- removing the old values before the now-empty column is dropped.
UPDATE "SyncReceipt" SET "deviceHash" = NULL WHERE "deviceHash" IS NOT NULL;

ALTER TABLE "SyncReceipt"
  ALTER COLUMN "deviceHash" TYPE BYTEA USING NULL::BYTEA;

ALTER TABLE "SyncReceipt" DROP COLUMN "deviceHash";
