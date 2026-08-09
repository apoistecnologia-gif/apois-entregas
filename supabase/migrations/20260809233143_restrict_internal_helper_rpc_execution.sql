-- Restrict internal helper functions that are not browser-facing API endpoints.
-- These helpers are called by privileged RPCs/functions and are not referenced by RLS policies.
revoke execute on function public.resolve_delivery_quote(uuid, jsonb) from authenticated;
revoke execute on function public.delivery_zone_contains_point(uuid, numeric, numeric) from authenticated;
revoke execute on function public.merchant_accepting_orders(uuid, timestamptz) from authenticated;
revoke execute on function public.ensure_pickup_confirmation_secret(uuid) from authenticated;
revoke execute on function public.mark_notification_read(uuid) from authenticated;

grant execute on function public.resolve_delivery_quote(uuid, jsonb) to service_role;
grant execute on function public.delivery_zone_contains_point(uuid, numeric, numeric) to service_role;
grant execute on function public.merchant_accepting_orders(uuid, timestamptz) to service_role;
