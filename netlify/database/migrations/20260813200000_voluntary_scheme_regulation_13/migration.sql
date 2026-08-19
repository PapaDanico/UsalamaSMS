-- Regulation 13 of the Civil Aviation (Safety Management) Regulations,
-- 2025 (L.N. 32 of 2026) — the voluntary reporting system.
--
-- 13(3) requires such a system to DEFINE six things: its objective, the
-- scope of sectors or areas covered, who can report, when to report,
-- how reports are processed, and the manager to be contacted. 13(2)
-- requires it to be non-punitive and to afford protection to its
-- sources.
--
-- The product has offered a "voluntary and confidential" report type
-- since the reporting form was built, and stated none of this. The
-- shape is declared in packages/shared/src/voluntary.ts and quoted on
-- /methodology; this table is where an operator's own answers live.
--
-- ONE ROW PER OPERATOR. The unique constraint is the point: a scheme
-- defined twice and differently is the thing an inspector finds.
--
-- EVERY COLUMN NULLABLE. An operator part-way through defining its
-- scheme is a real state. Forcing all six at once would either block
-- them recording any of it or invite placeholder text, and placeholder
-- text in a regulatory definition is worse than a blank — a blank is
-- visibly missing, and "TBC" reads as answered.
--
-- ADDITIVE ONLY. New table, no existing row touched.

CREATE TABLE "VoluntaryScheme" (
    "id"           TEXT NOT NULL,
    "orgId"        TEXT NOT NULL,
    "objective"    TEXT,
    "scope"        TEXT,
    "whoMayReport" TEXT,
    "whenToReport" TEXT,
    "howProcessed" TEXT,
    "contactPost"  TEXT,
    "protection"   TEXT,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoluntaryScheme_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VoluntaryScheme_orgId_key" ON "VoluntaryScheme"("orgId");
CREATE INDEX "VoluntaryScheme_orgId_idx" ON "VoluntaryScheme"("orgId");

ALTER TABLE "VoluntaryScheme"
  ADD CONSTRAINT "VoluntaryScheme_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ROW SECURITY ON, WITH NO POLICY, which is this database's posture and
-- not an unfinished thought. Nothing in this product reaches Postgres
-- through PostgREST — every read and write goes through the Fastify API
-- as the table owner — so a table with row security enabled and zero
-- policies is reachable by the application and by nothing else.
--
-- Postgres does NOT enable it by default, so a table added in a later
-- migration sits outside the posture unless its migration says so. That
-- is how eight tables once arrived unprotected, and it is why
-- tests/integration/rls.integration.test.ts asserts over pg_tables
-- rather than over a list somebody maintains.
--
-- Deliberately NOT FORCE ROW LEVEL SECURITY: the API connects as the
-- owner, and forcing it on an owner with no policies locks the
-- application out of its own database.
ALTER TABLE "VoluntaryScheme" ENABLE ROW LEVEL SECURITY;
