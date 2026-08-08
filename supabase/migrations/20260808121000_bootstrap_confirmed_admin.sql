-- APOIS ENTREGAS — bootstrap the designated first administrator only after
-- ownership of the mailbox has been confirmed by Supabase Auth.

CREATE OR REPLACE FUNCTION public.bootstrap_confirmed_apois_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF lower(COALESCE(NEW.email, '')) = 'apoistecnologia@gmail.com'
     AND NEW.email_confirmed_at IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_confirmed_apois_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_confirmed_apois_admin() TO service_role;

DROP TRIGGER IF EXISTS bootstrap_confirmed_apois_admin_trigger ON auth.users;
CREATE TRIGGER bootstrap_confirmed_apois_admin_trigger
AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.bootstrap_confirmed_apois_admin();

-- Idempotent backfill in case the designated account already exists and is confirmed
-- when this migration runs.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'apoistecnologia@gmail.com'
  AND email_confirmed_at IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;
