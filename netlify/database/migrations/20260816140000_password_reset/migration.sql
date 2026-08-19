-- A live password-reset link.
--
-- The token itself is never stored: tokenHash holds an HMAC of it under
-- the server's signing secret, the same treatment RefreshToken gets.
--
-- usedAt is nullable rather than the row being deleted, so "spent at
-- 14:02" survives as an answer to why a colleague was signed out. The
-- partial-looking index on (userId, usedAt) serves the sweep that
-- invalidates a user's outstanding links when a newer one is issued.
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

CREATE INDEX "PasswordReset_userId_usedAt_idx" ON "PasswordReset"("userId", "usedAt");

ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The posture every table in this schema carries: RLS on, one
-- RESTRICTIVE deny-all, nothing granted to anybody. A table holding
-- credential material born without it would be the one table in the
-- database an added PERMISSIVE policy could open.
--
-- The grants matter more than the policy here and CLAUDE.md says why:
-- service_role has BYPASSRLS, so a policy cannot restrain it and only
-- the absence of a grant can. ALTER DEFAULT PRIVILEGES was revoked in
-- schema public on 16 August 2026, so this table is born with none —
-- the REVOKE below is belt and braces against that being undone.
ALTER TABLE "PasswordReset" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_not_owner" ON "PasswordReset"
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
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE "PasswordReset" FROM %I', r);
    END IF;
  END LOOP;
END $$;
