-- DENY-BY-DEFAULT, MADE ACTUALLY DENYING.
--
-- The posture has always been that nothing reaches these tables except
-- the Fastify API, which connects as the table owner and enforces
-- tenancy in SQL. Until now that was expressed as "RLS enabled, zero
-- policies", which does deny — but only for as long as nobody adds a
-- policy, and the pressure to add one is constant: Supabase's own
-- advisor reports the absence on every table, and its agent skill
-- recommends fixing it.
--
-- That pressure produced exactly what it was always going to. Twenty-
-- seven policies appeared on the production database, twelve of them
-- granting the `authenticated` role every operation on rows matching a
-- JWT claim. That is the correct shape for an application talking to
-- PostgREST from a browser, and this product has none: no supabase-js,
-- no publishable key anywhere in the codebase, nothing to hold one. A
-- grant no client uses is an opening nobody is watching.
--
-- THE DENY POLICIES THAT ACCOMPANIED THEM DENIED NOTHING. They were
-- PERMISSIVE, and permissive policies are OR'd — `USING false` beside a
-- granting policy contributes exactly nothing. No table carried both, so
-- it was latent rather than live; but adding an org policy to one of
-- those tables later would have opened it silently, which is the worst
-- kind of change there is.
--
-- SO THE ABSENCE BECOMES A STATEMENT. A RESTRICTIVE policy is AND'd with
-- every other policy on the table, so this one cannot be widened by
-- adding another beside it — a later `CREATE POLICY ... USING (true)`
-- has no effect while this exists. "Zero policies" relied on nobody
-- acting; this survives somebody acting.
--
-- It also silences the advisor honestly rather than by argument. The
-- notice said "RLS enabled, no policies"; there is now a policy, and it
-- is the one this architecture actually wants.
--
-- NOT `FORCE ROW LEVEL SECURITY`, and that is what makes this safe. RLS
-- does not apply to a table's owner, and the API connects as the owner.
-- Forcing it would deny everything to the one role that has to read and
-- write, which is the failure the previous posture warned about in the
-- same breath. Verified both directions when this was applied: `anon`
-- and `authenticated` read zero rows from SafetyReport, the owner reads
-- all seven.

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Every existing policy goes, whatever it is called. Named drops
    -- would miss anything added since, and this has to end in a KNOWN
    -- state rather than a mostly-known one.
    EXECUTE (
      SELECT coalesce(string_agg(format('DROP POLICY %I ON public.%I;', policyname, t), ' '), '')
      FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    );

    EXECUTE format(
      'CREATE POLICY deny_all_not_owner ON public.%I AS RESTRICTIVE TO public USING (false) WITH CHECK (false)', t);
  END LOOP;
END $$;
