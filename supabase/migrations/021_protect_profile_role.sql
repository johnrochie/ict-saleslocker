-- ============================================================
-- ICT SalesIQ — stop users changing their own role
-- ============================================================
-- The profiles_update_own policy lets any signed-in user update their own
-- row, which included `role` and `autotask_name`. That meant anyone could
-- make themselves an admin (or another rep) using the public API key.
--
-- This trigger blocks changes to role / autotask_name unless the caller is
-- an admin. The service-role key and the SQL editor have no auth.uid(),
-- so they are unaffected.

CREATE OR REPLACE FUNCTION protect_profile_privileges()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.role IS DISTINCT FROM OLD.role
          OR NEW.autotask_name IS DISTINCT FROM OLD.autotask_name)
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  THEN
    RAISE EXCEPTION 'Only an admin can change role or Autotask name';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS profiles_protect_privileges ON profiles;
CREATE TRIGGER profiles_protect_privileges
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_privileges();
