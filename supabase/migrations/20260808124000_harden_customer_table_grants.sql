-- APOIS ENTREGAS — explicit least-privilege grants for customer-owned tables.

REVOKE ALL ON TABLE public.customer_favorites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.customer_favorites TO authenticated;
GRANT ALL ON TABLE public.customer_favorites TO service_role;

REVOKE ALL ON TABLE public.notification_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_preferences TO authenticated;
GRANT ALL ON TABLE public.notification_preferences TO service_role;
