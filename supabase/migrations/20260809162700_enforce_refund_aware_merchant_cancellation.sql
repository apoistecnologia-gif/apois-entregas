CREATE OR REPLACE FUNCTION public.merchant_transition_order(
  _order_id uuid,
  _new_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_order public.orders;
BEGIN
  SELECT * INTO v_order
  FROM public.orders o
  WHERE o.id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  IF NOT public.current_user_is_merchant_member(v_order.merchant_id)
     AND NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'merchant access required';
  END IF;

  -- Cancellation is intentionally excluded here. It must flow through
  -- merchant_reject_order so a paid order cannot be cancelled without
  -- creating the corresponding refund record.
  IF _new_status = 'cancelled' THEN
    RAISE EXCEPTION 'use merchant_reject_order for cancellation';
  END IF;

  IF NOT (
    (v_order.status = 'confirmed' AND _new_status IN ('accepted','preparing')) OR
    (v_order.status = 'accepted' AND _new_status = 'preparing') OR
    (v_order.status = 'preparing' AND _new_status = 'ready')
  ) THEN
    RAISE EXCEPTION 'invalid order transition from % to %', v_order.status, _new_status;
  END IF;

  UPDATE public.orders
  SET status = _new_status,
      accepted_at = CASE
        WHEN _new_status IN ('accepted','preparing') AND accepted_at IS NULL THEN now()
        ELSE accepted_at
      END,
      ready_at = CASE WHEN _new_status = 'ready' THEN now() ELSE ready_at END
  WHERE id = _order_id;

  INSERT INTO public.order_status_history(order_id,status,changed_by_user_id)
  VALUES(_order_id,_new_status,(SELECT auth.uid()));

  IF _new_status = 'ready' AND v_order.fulfillment_type = 'delivery' THEN
    PERFORM public.ensure_delivery_job(_order_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_order(
  _order_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Legacy compatibility wrapper. The refund-aware function is the single
  -- cancellation path for merchant/admin users.
  PERFORM public.merchant_reject_order(_order_id, _reason);
END;
$$;

REVOKE ALL ON FUNCTION public.merchant_transition_order(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_transition_order(uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_order(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_order(uuid,text) TO authenticated, service_role;
