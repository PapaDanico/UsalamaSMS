-- Evidence bytes in the database, for deploys with no object store.
--
-- Evidence is part of reporting rather than an extra: a report about a
-- cracked bracket is worth much less than the photograph of it. Making
-- it wait on a second credential meant the feature shipped disabled.
--
-- Nullable, because a deploy WITH object storage configured keeps
-- putting files in the bucket and leaves this null. Postgres stores a
-- bytea of this size out of line and never reads it unless selected.
ALTER TABLE "ReportAttachment" ADD COLUMN "data" BYTEA;
