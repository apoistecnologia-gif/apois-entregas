-- Keep SECURITY DEFINER helper RPCs unavailable to unauthenticated callers.
-- Signed-in application flows still require these helpers directly or through RLS/RPCs.
revoke execute on function public.current_user_is_active() from anon;
revoke execute on function public.merchant_accepting_orders(uuid, timestamptz) from anon;

grant execute on function public.current_user_is_active() to authenticated;
grant execute on function public.merchant_accepting_orders(uuid, timestamptz) to authenticated;
