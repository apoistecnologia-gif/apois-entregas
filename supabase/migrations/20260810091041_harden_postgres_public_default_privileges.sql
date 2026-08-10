-- Keep future public-schema objects created by the migration owner deny-by-default for API roles.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- Remove privileges that leaked from the former permissive default ACLs when these tables were created.
revoke truncate, trigger, references on table public.courier_online_sessions from authenticated;
revoke truncate, trigger, references on table public.merchant_special_hours from authenticated;

-- Trigger-only functions are not API endpoints and do not need direct execution by client roles.
revoke execute on function public.enforce_approved_subscription_payment_immutability() from public, anon, authenticated;
revoke execute on function public.enforce_merchant_subscription_on_order() from public, anon, authenticated;
revoke execute on function public.enforce_merchant_subscription_period_from_payment() from public, anon, authenticated;
revoke execute on function public.set_customer_address_updated_at() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
