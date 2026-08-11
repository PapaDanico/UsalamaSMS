-- Deny-by-default Row Level Security.
--
-- Supabase exposes the public schema through PostgREST, so with RLS off
-- the anon key is a full read/write credential over every table —
-- including SafetyReport.narrative, reporterId and the AuditLog. On a
-- product whose central promise is that a confidential report cannot be
-- traced to its author, that is the whole premise gone. The Supabase
-- linter reported it as CRITICAL on this project's first schema push.
--
-- RLS is enabled with NO POLICIES, deliberately. That denies PostgREST
-- entirely for the anon and authenticated roles and leaves the
-- application untouched: the API connects through Prisma as the
-- table-owning role, which bypasses RLS.
--
-- This is the right shape for THIS architecture rather than a shortcut.
-- Tenant scoping is enforced in application code and proven by
-- tests/integration; a second authorisation model written in policy SQL
-- would have to be kept in step with the RBAC matrix forever, and two
-- places to get anonymity wrong is worse than one. If the Supabase
-- client SDK is ever adopted, policies get written then — as a decision
-- somebody makes, not as a default nobody chose.
--
-- DO NOT add FORCE ROW LEVEL SECURITY without also writing policies.
-- Owner bypass is what keeps the API working; FORCE removes it, and the
-- application loses access to its own tables.
--
-- Harmless on a local Postgres for the same reason: the test harness
-- connects as the owner too.

ALTER TABLE "Org"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SafetyReport"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Hazard"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Spi"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncReceipt"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"       ENABLE ROW LEVEL SECURITY;
