-- The controlled document itself, not only its control record.
--
-- Element 1.5 held reference, revision, approver, review date and
-- supersession — the discipline an audit checks — and could not
-- produce the document. An inspector asking "show me revision 3" was
-- sent to a shared drive the register could not vouch for.
--
-- Same mechanism as report evidence: bytes in the row, a server hash
-- re-checked on read, an allowlisted type. Nullable, because a
-- register entry for a document held elsewhere is still true.
ALTER TABLE "ControlledDocument" ADD COLUMN "data" BYTEA;
ALTER TABLE "ControlledDocument" ADD COLUMN "contentType" TEXT;
ALTER TABLE "ControlledDocument" ADD COLUMN "bytes" INTEGER;
ALTER TABLE "ControlledDocument" ADD COLUMN "sha256" TEXT;
ALTER TABLE "ControlledDocument" ADD COLUMN "filename" TEXT;
