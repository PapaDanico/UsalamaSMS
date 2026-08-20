-- Jurisdiction: add the seven EAC member states the schema already names.
--
-- WHY THIS MIGRATION EXISTS AT ALL.
--
-- On 19 August 2026 `schema.prisma` gained UG, TZ, RW, BI, SS, CD and SO
-- on the Jurisdiction enum, `regulations.ts` gained a PROVISIONAL row for
-- each, and the signup panel began offering all nine as a dropdown. No
-- migration added the VALUES to Postgres, so the database still held
-- exactly two: ICAO and KE.
--
-- Every layer above the database agreed with itself, which is why nothing
-- caught it. Prisma generated the client from schema.prisma; Zod validated
-- against regulations.ts; the browser rendered nine options; and 975 unit
-- tests plus 495 integration tests passed, because not one of them ever
-- created an org outside Kenya.
--
-- The failure landed on the customer instead. Choosing Uganda — or any of
-- the six after it — made `org.create` raise
--
--     invalid input value for enum "Jurisdiction": "UG"
--
-- and signup returned a 500. A prospective operator in the market this
-- product was built for could not open an account, and the one who could
-- was the one who happened to leave the dropdown on Kenya.
--
-- ADD VALUE, NOT THE RENAME-AND-RECREATE PATTERN used by
-- 20260812070000_icao_baseline_jurisdictions and
-- 20260812074500_state_of_registry_scope. Those two REMOVED values, which
-- Postgres cannot do in place and which needs the columns recast. This one
-- only adds, so ADD VALUE is correct and does not rewrite either table.
--
-- IF NOT EXISTS on every line, because the enum is the one object in this
-- schema whose history includes two full recreations: an environment
-- rebuilt from a later snapshot may already carry some of these labels,
-- and a migration that dies on one blocks every migration behind it.

ALTER TYPE "Jurisdiction" ADD VALUE IF NOT EXISTS 'UG';
ALTER TYPE "Jurisdiction" ADD VALUE IF NOT EXISTS 'TZ';
ALTER TYPE "Jurisdiction" ADD VALUE IF NOT EXISTS 'RW';
ALTER TYPE "Jurisdiction" ADD VALUE IF NOT EXISTS 'BI';
ALTER TYPE "Jurisdiction" ADD VALUE IF NOT EXISTS 'SS';
ALTER TYPE "Jurisdiction" ADD VALUE IF NOT EXISTS 'CD';
ALTER TYPE "Jurisdiction" ADD VALUE IF NOT EXISTS 'SO';
