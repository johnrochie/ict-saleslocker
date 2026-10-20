-- ============================================================
-- ICT SalesIQ — explicit Data API grants
-- ============================================================
-- From 30 Oct 2026 Supabase no longer auto-grants Data API access on
-- new tables in "public". Existing hosted tables keep their grants, but
-- anything that replays these migrations (new project, preview branch,
-- local `supabase db reset`) would end up with no grants at all and every
-- query would fail with "permission denied".
--
-- This migration grants access on everything created by 001-016.
-- RLS stays the real gate for row access; these are table-level grants only.
--
--   Normal tables : authenticated + service_role (full DML). No anon access —
--                   the app requires login.
--   Token tables  : service_role only. Org-wide API credentials, never
--                   readable through a user session (see 011 and 013).
--   Views         : select for authenticated + service_role.
--
-- RULE FOR FUTURE MIGRATIONS: every CREATE TABLE / CREATE VIEW in "public"
-- must be followed by its own GRANT statements in the same file.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('xero_tokens', 'bullhorn_tokens')
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, service_role', t);
  END LOOP;

  FOR t IN
    SELECT viewname FROM pg_views WHERE schemaname = 'public'
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated, service_role', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.xero_tokens     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bullhorn_tokens TO service_role;
