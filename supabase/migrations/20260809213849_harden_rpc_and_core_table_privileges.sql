-- Restrict direct table capabilities to the operations the authenticated application actually needs.
revoke all on table public.customer_addresses from anon;
revoke all on table public.customer_addresses from authenticated;
grant select, insert, update, delete on table public.customer_addresses to authenticated;

revoke all on table public.user_roles from anon;
revoke all on table public.user_roles from authenticated;
grant select on table public.user_roles to authenticated;

drop policy if exists "Admins can view user roles" on public.user_roles;
create policy "Admins can view user roles"
on public.user_roles
for select
to authenticated
using (public.current_user_is_admin());

-- Order creation is an Edge Function/service-role boundary. Browsers must not invoke the backend-only RPCs directly.
revoke execute on function public.create_order_atomic_v2(uuid, uuid, jsonb, text, jsonb, uuid, text, text, text) from anon, authenticated;
revoke execute on function public.create_order_for_checkout_intent_v2(uuid, uuid, jsonb, text, jsonb, uuid, uuid, text, text, text) from anon, authenticated;
grant execute on function public.create_order_atomic_v2(uuid, uuid, jsonb, text, jsonb, uuid, text, text, text) to service_role;
grant execute on function public.create_order_for_checkout_intent_v2(uuid, uuid, jsonb, text, jsonb, uuid, uuid, text, text, text) to service_role;

-- New authenticated RPCs created after the earlier hardening migration inherited anon EXECUTE in Supabase.
-- Remove anonymous entry points while preserving authenticated use where intended.
revoke execute on function public.admin_create_city(text, text, text, numeric, boolean) from anon;
revoke execute on function public.admin_delete_delivery_zone(uuid) from anon;
revoke execute on function public.admin_update_city(uuid, text, text, text, numeric, boolean) from anon;
revoke execute on function public.admin_upsert_delivery_zone(uuid, uuid, text, numeric, numeric, numeric, jsonb, numeric, numeric, boolean) from anon;
revoke execute on function public.complete_pickup_with_pin(uuid, text) from anon;
revoke execute on function public.deactivate_own_account() from anon;
revoke execute on function public.delivery_zone_contains_point(uuid, numeric, numeric) from anon;
revoke execute on function public.ensure_pickup_confirmation_secret(uuid) from anon;
revoke execute on function public.get_my_notification_feed(integer) from anon;
revoke execute on function public.preview_coupon(uuid, text, numeric) from anon;
revoke execute on function public.preview_delivery_quote(uuid, jsonb) from anon;
revoke execute on function public.read_all_my_notifications() from anon;
revoke execute on function public.read_my_notification(uuid) from anon;
revoke execute on function public.resolve_delivery_quote(uuid, jsonb) from anon;

-- Make the intended authenticated boundary explicit.
grant execute on function public.admin_create_city(text, text, text, numeric, boolean) to authenticated;
grant execute on function public.admin_delete_delivery_zone(uuid) to authenticated;
grant execute on function public.admin_update_city(uuid, text, text, text, numeric, boolean) to authenticated;
grant execute on function public.admin_upsert_delivery_zone(uuid, uuid, text, numeric, numeric, numeric, jsonb, numeric, numeric, boolean) to authenticated;
grant execute on function public.complete_pickup_with_pin(uuid, text) to authenticated;
grant execute on function public.deactivate_own_account() to authenticated;
grant execute on function public.get_my_notification_feed(integer) to authenticated;
grant execute on function public.preview_coupon(uuid, text, numeric) to authenticated;
grant execute on function public.preview_delivery_quote(uuid, jsonb) to authenticated;
grant execute on function public.read_all_my_notifications() to authenticated;
grant execute on function public.read_my_notification(uuid) to authenticated;
