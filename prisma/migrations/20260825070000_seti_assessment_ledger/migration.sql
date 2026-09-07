-- CAA SET-I assessment ledger.
--
-- An assessment is a dated snapshot of evidence against every criterion.
-- The application creates all 48 items with the assessment, so an omitted
-- criterion stays visibly unassessed rather than disappearing from a score.
-- RLS follows the existing direct-API, deny-by-default posture.

CREATE TYPE "SetiAssessmentStatus" AS ENUM ('DRAFT', 'COMPLETE');
CREATE TYPE "SetiLevel" AS ENUM ('PRESENT', 'SUITABLE', 'OPERATING', 'EFFECTIVE');

CREATE TABLE "SetiAssessment" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "assessedOn" TIMESTAMP(3) NOT NULL,
  "status" "SetiAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
  "assessorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SetiAssessment_pkey" PRIMARY KEY ("id")
);

-- `orgId` IS CARRIED HERE TOO, though the parent already has one.
--
-- This repository's tenancy is enforced in SQL, and the convention that
-- makes that reviewable is that every tenant-owned table holds `orgId`
-- and indexes it first. `routes.seti.ts` is correct as written — it
-- checks the parent assessment against `tenantWhere(req)` before ever
-- touching an item — but that is one forgotten join away from a
-- cross-tenant read, and the next query written against this table has
-- nothing local to scope on. `rls.integration.test.ts` asserts the
-- convention over every table and reddened on this one.
CREATE TABLE "SetiAssessmentItem" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "criterionId" TEXT NOT NULL,
  "level" "SetiLevel",
  "evidence" TEXT,
  "sourceRefs" TEXT,
  "ownerPost" TEXT,
  "reviewDueOn" TIMESTAMP(3),
  "assessorNotes" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SetiAssessmentItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SetiAssessmentItem_assessmentId_criterionId_key" UNIQUE ("assessmentId", "criterionId")
);

CREATE INDEX "SetiAssessment_orgId_assessedOn_idx" ON "SetiAssessment"("orgId", "assessedOn");
CREATE INDEX "idx_setiassessment_assessorid" ON "SetiAssessment"("assessorId");
CREATE INDEX "SetiAssessmentItem_orgId_assessmentId_idx" ON "SetiAssessmentItem"("orgId", "assessmentId");
CREATE INDEX "SetiAssessmentItem_criterionId_idx" ON "SetiAssessmentItem"("criterionId");

ALTER TABLE "SetiAssessment" ADD CONSTRAINT "SetiAssessment_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SetiAssessment" ADD CONSTRAINT "SetiAssessment_assessorId_fkey"
  FOREIGN KEY ("assessorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SetiAssessmentItem" ADD CONSTRAINT "SetiAssessmentItem_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "SetiAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SetiAssessmentItem" ADD CONSTRAINT "SetiAssessmentItem_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- THE POSTURE THIS FILE'S OWN HEADER CLAIMED, NOW ACTUALLY PRESENT.
--
-- It said "RLS follows the existing direct-API, deny-by-default posture"
-- and then enabled row security and stopped. RLS with no policy denies
-- today and stops denying the moment somebody adds one on the Supabase
-- advisor's recommendation — which is precisely the posture this
-- repository abandoned in August 2026 after twenty-seven policies
-- appeared on production, twelve of them GRANTING. A RESTRICTIVE policy
-- is AND'd with every other, so it cannot be widened by anything added
-- beside it.
--
-- `rls.integration.test.ts` asserts this over every table. It was not
-- run on the pull request that added this file, because integration
-- tests need a real Postgres and every GitHub Actions run since 19
-- August completes in three seconds with runner_id 0.
ALTER TABLE "SetiAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SetiAssessmentItem" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_not_owner" ON "SetiAssessment"
    AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_not_owner" ON "SetiAssessmentItem"
    AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- GUARDED, because those three roles are Supabase's and this same
-- migration runs against a bare Postgres in `npm run test:integration`,
-- where `REVOKE ... FROM anon` is error 42704 and takes the whole suite
-- down. Skipping the revoke there costs nothing: a role that does not
-- exist holds no privilege.
DO $$
DECLARE r text; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['SetiAssessment', 'SetiAssessmentItem'] LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END $$;
