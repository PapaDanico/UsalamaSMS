-- The operator's own mark, for the documents they hand over.
--
-- A base64 data URI rather than a storage key: a logo is one small
-- image per operator that has to render inside a PRINTED page, and a
-- print dialog does not wait for a network fetch. Capped and
-- allowlisted in application code (packages/shared/src/logo.ts), which
-- also refuses SVG — markup that can carry script, rendered into the
-- operator's own pages.
ALTER TABLE "OrgConfig" ADD COLUMN "logo" TEXT;
ALTER TABLE "OrgConfig" ADD COLUMN "logoUpdatedAt" TIMESTAMP(3);
