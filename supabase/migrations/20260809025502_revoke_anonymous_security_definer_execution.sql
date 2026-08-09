REVOKE ALL ON FUNCTION public.admin_review_document(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_document(text, uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_settle_payout(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_settle_payout(uuid, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_merchant_application(uuid, text, text, text, text, text, text, text, text, text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_merchant_application(uuid, text, text, text, text, text, text, text, text, text, numeric, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_user_is_merchant_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_merchant_owner(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.merchant_reject_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_reject_order(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resubmit_merchant_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_merchant_application(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.submit_courier_application(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_courier_application(jsonb) TO authenticated, service_role;
