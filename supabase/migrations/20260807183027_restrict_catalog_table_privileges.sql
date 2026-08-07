REVOKE ALL PRIVILEGES ON TABLE public.merchant_categories FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.merchants FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.menu_categories FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.products FROM anon, authenticated;

GRANT SELECT ON TABLE public.merchant_categories TO authenticated;
GRANT SELECT ON TABLE public.merchants TO authenticated;
GRANT SELECT ON TABLE public.menu_categories TO authenticated;
GRANT SELECT ON TABLE public.products TO authenticated;
