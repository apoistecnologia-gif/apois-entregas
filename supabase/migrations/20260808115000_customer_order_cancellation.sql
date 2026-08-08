-- APOIS ENTREGAS — customer cancellation before merchant acceptance, with refund handoff when paid.

CREATE OR REPLACE FUNCTION public.customer_cancel_order(
  _order_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_order public.orders;
  v_payment public.payments;
  v_refund_id uuid;
  v_job_id uuid;
BEGIN
  IF NULLIF(btrim(_reason),'') IS NULL THEN
    RAISE EXCEPTION 'cancellation reason is required';
  END IF;

  SELECT * INTO v_order
  FROM public.orders o
  WHERE o.id=_order_id
    AND o.customer_user_id=(SELECT auth.uid())
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.status IN ('cancelled','refunded') THEN
    RETURN jsonb_build_object('order_id',v_order.id,'status',v_order.status,'refund_id',NULL);
  END IF;
  IF v_order.status NOT IN ('created','pending_payment','paid','confirmed') THEN
    RAISE EXCEPTION 'order can no longer be cancelled by customer';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments p
  WHERE p.order_id=_order_id
  ORDER BY p.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND AND v_payment.status='paid' THEN
    INSERT INTO public.refunds(payment_id,order_id,amount,reason,status,requested_by)
    VALUES(v_payment.id,_order_id,v_order.total,btrim(_reason),'pending',(SELECT auth.uid()))
    RETURNING id INTO v_refund_id;
  ELSIF FOUND AND v_payment.status IN ('pending','processing') THEN
    UPDATE public.payments
    SET status='cancelled', failure_reason='order_cancelled_by_customer'
    WHERE id=v_payment.id;
  END IF;

  SELECT dj.id INTO v_job_id FROM public.delivery_jobs dj WHERE dj.order_id=_order_id FOR UPDATE;
  IF v_job_id IS NOT NULL THEN
    UPDATE public.delivery_offers
    SET status='cancelled',responded_at=COALESCE(responded_at,now())
    WHERE delivery_job_id=v_job_id AND status='offered';

    UPDATE public.delivery_jobs
    SET status='cancelled'
    WHERE id=v_job_id
      AND courier_id IS NULL
      AND status IN ('searching','offered');

    INSERT INTO public.delivery_events(delivery_job_id,event_type,from_status,to_status,actor_user_id,metadata)
    SELECT v_job_id,'customer_cancelled',dj.status,'cancelled',(SELECT auth.uid()),jsonb_build_object('reason',btrim(_reason))
    FROM public.delivery_jobs dj
    WHERE dj.id=v_job_id AND dj.status='cancelled';
  END IF;

  UPDATE public.orders
  SET status='cancelled',
      cancelled_at=now(),
      cancellation_reason=btrim(_reason),
      payment_status=CASE
        WHEN v_refund_id IS NOT NULL THEN payment_status
        WHEN payment_status='paid' THEN payment_status
        ELSE 'cancelled'
      END
  WHERE id=_order_id;

  INSERT INTO public.order_status_history(order_id,status,changed_by_user_id)
  VALUES(_order_id,'cancelled',(SELECT auth.uid()));

  RETURN jsonb_build_object(
    'order_id',_order_id,
    'status','cancelled',
    'refund_id',v_refund_id,
    'refund_pending',v_refund_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.customer_cancel_order(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_cancel_order(uuid,text) TO authenticated,service_role;
