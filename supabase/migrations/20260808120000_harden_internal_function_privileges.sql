-- APOIS ENTREGAS — remove Data API execution from internal helpers/triggers.

ALTER FUNCTION public.handle_orders_updated_at() SET search_path = '';

-- Authorization helpers are needed by authenticated RLS/RPC code, never by anon.
REVOKE ALL ON FUNCTION public.current_user_courier_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_is_merchant_manager(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_is_merchant_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_owns_wallet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_courier_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_merchant_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_merchant_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_owns_wallet(uuid) TO authenticated, service_role;

-- These functions exist only for triggers/internal server execution.
REVOKE ALL ON FUNCTION public.dispatch_new_delivery_job() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_active_order_customer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_order_payment_before_fulfillment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_orders_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_delivery_offer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_order_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_support_critical() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_review_aggregates() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.dispatch_new_delivery_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_active_order_customer() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_order_payment_before_fulfillment() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_orders_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_delivery_offer() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_order_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_support_critical() TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_review_aggregates() TO service_role;
