-- ONLY THE FATIGUE CHANGES ARE IN THIS FILE, AND THAT IS DELIBERATE.
--
-- `prisma migrate dev` generated this migration carrying six unrelated
-- statements as well: a DROP INDEX on VoluntaryScheme and five ALTER
-- COLUMN ... DROP DEFAULT across Org, OrgConfig and SafetyReport. They
-- are real pre-existing drift between production and schema.prisma —
-- measured against production rather than assumed — but they are not
-- fatigue, and a migration named for a feature that also reshapes three
-- other tables is a migration whose name lies to whoever reads the
-- ledger later.
--
-- They are applied by 20260818033215_index_and_default_reconciliation,
-- which is named for what it does.

-- AlterTable
ALTER TABLE "SafetyReport" ADD COLUMN     "fatigueDutyHours" DOUBLE PRECISION,
ADD COLUMN     "fatigueEndLocalHour" INTEGER,
ADD COLUMN     "fatigueFlightTimeHours" DOUBLE PRECISION,
ADD COLUMN     "fatigueRestBeforeHours" DOUBLE PRECISION,
ADD COLUMN     "fatigueSamnPerelli" INTEGER,
ADD COLUMN     "fatigueSectors" INTEGER,
ADD COLUMN     "fatigueSleepPrior24" DOUBLE PRECISION,
ADD COLUMN     "fatigueStartLocalHour" INTEGER;

-- CreateTable
CREATE TABLE "FatigueLimit" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "maxFlightTimeHours" DOUBLE PRECISION,
    "maxDutyHours" DOUBLE PRECISION,
    "minRestHours" DOUBLE PRECISION,
    "maxFlightTime7DaysHours" DOUBLE PRECISION,
    "instrument" TEXT NOT NULL,
    "declaredById" TEXT,
    "declaredOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FatigueLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FatigueLimit_orgId_key" ON "FatigueLimit"("orgId");

-- AddForeignKey
ALTER TABLE "FatigueLimit" ADD CONSTRAINT "FatigueLimit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===================================================================
-- THE DENY-ALL POSTURE, FOR A TABLE ADDED LATER.
--
-- Every table in public carries rowsecurity = true and exactly one
-- policy: deny_all_not_owner, RESTRICTIVE, USING (false). Nothing in
-- this product uses PostgREST — the API connects as the database owner,
-- and RLS does not apply to a table's owner — so this denies everybody
-- else and nothing this product does.
--
-- RESTRICTIVE rather than permissive, because a RESTRICTIVE policy is
-- AND'd with every other policy on the table: a later
-- CREATE POLICY ... USING (true) has no effect while this exists. The
-- old posture was zero policies, which also denies but only for as long
-- as nobody adds one.
--
-- IT WAS THE INTEGRATION SUITE THAT ASKED FOR THIS, not a reviewer.
-- rls.integration.test.ts asserts the posture over EVERY table
-- "including ones added later", and FatigueLimit went in without it —
-- two tests red, immediately, on the one thing about a new table that
-- is easiest to forget and worst to miss. See CLAUDE.md.
-- ===================================================================
ALTER TABLE "FatigueLimit" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_not_owner" ON "FatigueLimit"
    AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- GUARDED, because those three roles are Supabase's and this same
-- migration runs against a bare Postgres in `npm run test:integration`,
-- where `REVOKE ... FROM anon` is error 42704 and takes the whole suite
-- down. Skipping the revoke there costs nothing: a role that does not
-- exist holds no privilege.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE "FatigueLimit" FROM %I', r);
    END IF;
  END LOOP;
END $$;
