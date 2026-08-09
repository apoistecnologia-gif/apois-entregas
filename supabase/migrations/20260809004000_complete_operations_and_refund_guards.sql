-- Merchant operators need to see unavailable/disabled catalog rows they manage.
DROP POLICY IF EXISTS "Merchant managers view all menu categories" ON public.menu_categories;
CREATE POLICY "Merchant managers view all menu categories"
ON public.menu_categories FOR SELECT TO authenticated
USING (public.current_user_is_merchant_manager(merchant_id) OR public.current_user_is_admin());

DROP POLICY IF EXISTS "Merchant managers view all products" ON public.products;
CREATE POLICY "Merchant managers view all products"
ON public.products FOR SELECT TO authenticated
USING (public.current_user_is_merchant_manager(merchant_id) OR public.current_user_is_admin());

CREATE OR REPLACE FUNCTION public.customer_cancel_order(_order_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_payment public.payments;
  v_refund public.refunds;
  v_refund_id uuid;
  v_job_id uuid;
BEGIN
  IF NULLIF(btrim(_reason),'') IS NULL THEN RAISE EXCEPTION 'cancellation reason is required'; END IF;
  SELECT * INTO v_order FROM public.orders o
  WHERE o.id=_order_id AND o.customer_user_id=(SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  SELECT * INTO v_refund FROM public.refunds r
  WHERE r.order_id=_order_id AND r.status IN ('pending','processing','completed')
  ORDER BY r.created_at DESC LIMIT 1;

  IF v_order.status IN ('cancelled','refunded') THEN
    RETURN jsonb_build_object(
      'order_id',v_order.id,'status',v_order.status,
      'refund_id',v_refund.id,'refund_pending',v_refund.status IN ('pending','processing')
    );
  END IF;
  IF v_order.status NOT IN ('created','pending_payment','paid','confirmed') THEN
    RAISE EXCEPTION 'order can no longer be cancelled by customer';
  END IF;

  SELECT * INTO v_payment FROM public.payments p
  WHERE p.order_id=_order_id ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND AND v_payment.status='paid' THEN
    IF v_refund.id IS NULL THEN
      INSERT INTO public.refunds(payment_id,order_id,amount,reason,status,requested_by)
      VALUES(v_payment.id,_order_id,v_payment.amount,btrim(_reason),'pending',(SELECT auth.uid()))
      RETURNING id INTO v_refund_id;
    ELSE
      v_refund_id:=v_refund.id;
    END IF;
  ELSIF FOUND AND v_payment.status IN ('pending','processing') THEN
    UPDATE public.payments
    SET status='cancelled',failed_at=now(),failure_reason='order_cancelled_by_customer'
    WHERE id=v_payment.id;
  END IF;

  SELECT dj.id INTO v_job_id FROM public.delivery_jobs dj WHERE dj.order_id=_order_id FOR UPDATE;
  IF v_job_id IS NOT NULL THEN
    UPDATE public.delivery_offers SET status='cancelled',responded_at=COALESCE(responded_at,now())
    WHERE delivery_job_id=v_job_id AND status='offered';
    UPDATE public.delivery_jobs SET status='cancelled',cancelled_at=now(),cancellation_reason=btrim(_reason)
    WHERE id=v_job_id AND courier_id IS NULL AND status IN ('searching','offered');
  END IF;

  UPDATE public.orders
  SET status='cancelled',cancelled_at=now(),cancellation_reason=btrim(_reason),
      payment_status=CASE
        WHEN v_refund_id IS NOT NULL THEN payment_status
        WHEN payment_status='paid' THEN payment_status
        ELSE 'cancelled'
      END
  WHERE id=_order_id;
  INSERT INTO public.order_status_history(order_id,status,changed_by_user_id)
  VALUES(_order_id,'cancelled',(SELECT auth.uid()));

  RETURN jsonb_build_object(
    'order_id',_order_id,'status','cancelled','refund_id',v_refund_id,
    'refund_pending',v_refund_id IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.merchant_reject_order(_order_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_payment public.payments;
  v_refund public.refunds;
  v_refund_id uuid;
BEGIN
  IF NULLIF(btrim(_reason),'') IS NULL THEN RAISE EXCEPTION 'cancellation reason is required'; END IF;
  SELECT * INTO v_order FROM public.orders o WHERE o.id=_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF NOT (public.current_user_is_merchant_member(v_order.merchant_id) OR public.current_user_is_admin()) THEN
    RAISE EXCEPTION 'merchant access required';
  END IF;

  SELECT * INTO v_refund FROM public.refunds r
  WHERE r.order_id=_order_id AND r.status IN ('pending','processing','completed')
  ORDER BY r.created_at DESC LIMIT 1;

  IF v_order.status IN ('cancelled','refunded') THEN
    RETURN jsonb_build_object(
      'order_id',v_order.id,'status',v_order.status,'refund_id',v_refund.id,
      'refund_pending',v_refund.status IN ('pending','processing')
    );
  END IF;
  IF v_order.status NOT IN ('confirmed','accepted','preparing') THEN
    RAISE EXCEPTION 'order can no longer be rejected';
  END IF;

  SELECT * INTO v_payment FROM public.payments p
  WHERE p.order_id=_order_id ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND AND v_payment.status='paid' THEN
    IF v_refund.id IS NULL THEN
      INSERT INTO public.refunds(payment_id,order_id,amount,reason,status,requested_by)
      VALUES(v_payment.id,_order_id,v_payment.amount,btrim(_reason),'pending',(SELECT auth.uid()))
      RETURNING id INTO v_refund_id;
    ELSE
      v_refund_id:=v_refund.id;
    END IF;
  ELSIF FOUND AND v_payment.status IN ('pending','processing') THEN
    UPDATE public.payments
    SET status='cancelled',failed_at=now(),failure_reason='order_rejected_by_merchant'
    WHERE id=v_payment.id;
  END IF;

  UPDATE public.orders
  SET status='cancelled',cancellation_reason=btrim(_reason),cancelled_at=now(),
      payment_status=CASE
        WHEN v_refund_id IS NOT NULL THEN payment_status
        WHEN payment_status='paid' THEN payment_status
        ELSE 'cancelled'
      END
  WHERE id=_order_id;
  INSERT INTO public.order_status_history(order_id,status,changed_by_user_id)
  VALUES(_order_id,'cancelled',(SELECT auth.uid()));

  RETURN jsonb_build_object(
    'order_id',_order_id,'status','cancelled','refund_id',v_refund_id,
    'refund_pending',v_refund_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merchant_reject_order(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_settle_payout(
  _payout_id uuid,
  _new_status text,
  _provider text DEFAULT NULL,
  _provider_payout_id text DEFAULT NULL,
  _failure_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payout public.payouts;
BEGIN
  IF NOT public.current_user_is_admin() THEN RAISE EXCEPTION 'admin access required'; END IF;
  IF _new_status NOT IN ('processing','paid','failed','cancelled') THEN RAISE EXCEPTION 'invalid payout status'; END IF;
  SELECT * INTO v_payout FROM public.payouts p WHERE p.id=_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout not found'; END IF;
  IF v_payout.status=_new_status THEN RETURN; END IF;
  IF v_payout.status IN ('paid','failed','cancelled') THEN RAISE EXCEPTION 'payout already finalized'; END IF;
  IF v_payout.status='processing' AND _new_status NOT IN ('paid','failed','cancelled') THEN RAISE EXCEPTION 'invalid payout transition'; END IF;

  IF _new_status='paid' THEN
    PERFORM public.post_wallet_transaction(v_payout.wallet_id,'payout',-v_payout.amount,0,-v_payout.amount,
      'payout-paid:'||v_payout.id::text,'payout',v_payout.id::text,'Saque pago','completed');
  ELSIF _new_status IN ('failed','cancelled') THEN
    PERFORM public.post_wallet_transaction(v_payout.wallet_id,'payout_release',0,v_payout.amount,-v_payout.amount,
      'payout-release:'||v_payout.id::text,'payout',v_payout.id::text,'Reserva de saque liberada','completed');
  END IF;

  UPDATE public.payouts SET
    status=_new_status,
    provider=COALESCE(_provider,provider),
    provider_payout_id=COALESCE(_provider_payout_id,provider_payout_id),
    failure_reason=CASE WHEN _new_status='failed' THEN _failure_reason ELSE failure_reason END,
    processed_at=CASE WHEN _new_status IN ('paid','failed','cancelled') THEN now() ELSE processed_at END
  WHERE id=_payout_id;

  INSERT INTO public.admin_audit_logs(admin_id,action,entity_type,entity_id,after_data)
  VALUES((SELECT auth.uid()),'settle_payout','payout',_payout_id::text,
    jsonb_build_object('status',_new_status,'provider',_provider,'provider_payout_id',_provider_payout_id));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_settle_payout(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_settle_payout(uuid,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_document(
  _kind text,
  _document_id uuid,
  _status text,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.current_user_is_admin() THEN RAISE EXCEPTION 'admin access required'; END IF;
  IF _kind NOT IN ('courier','merchant') THEN RAISE EXCEPTION 'invalid document kind'; END IF;
  IF _status NOT IN ('approved','rejected','pending') THEN RAISE EXCEPTION 'invalid document status'; END IF;
  IF _status='rejected' AND NULLIF(btrim(_reason),'') IS NULL THEN RAISE EXCEPTION 'rejection reason is required'; END IF;

  IF _kind='courier' THEN
    SELECT to_jsonb(d) INTO v_before FROM public.courier_documents d WHERE d.id=_document_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'document not found'; END IF;
    UPDATE public.courier_documents d SET
      status=_status,rejection_reason=CASE WHEN _status='rejected' THEN btrim(_reason) ELSE NULL END,
      reviewed_by=(SELECT auth.uid()),reviewed_at=now()
    WHERE d.id=_document_id RETURNING to_jsonb(d) INTO v_after;
  ELSE
    SELECT to_jsonb(d) INTO v_before FROM public.merchant_documents d WHERE d.id=_document_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'document not found'; END IF;
    UPDATE public.merchant_documents d SET
      status=_status,rejection_reason=CASE WHEN _status='rejected' THEN btrim(_reason) ELSE NULL END,
      reviewed_by=(SELECT auth.uid()),reviewed_at=now()
    WHERE d.id=_document_id RETURNING to_jsonb(d) INTO v_after;
  END IF;

  INSERT INTO public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  VALUES((SELECT auth.uid()),'review_'||_kind||'_document',_kind||'_document',_document_id::text,v_before,v_after);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_document(text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_document(text,uuid,text,text) TO authenticated;
