-- APOIS ENTREGAS — offered courier visibility and atomic financial settlement on delivery.

CREATE POLICY "Offered courier can view delivery job"
ON public.delivery_jobs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.delivery_offers o
  WHERE o.delivery_job_id=delivery_jobs.id
    AND o.courier_id=public.current_user_courier_id()
    AND o.status='offered'
    AND o.expires_at>now()
));

-- Calculate financial snapshots and credit ledgers exactly once per delivered order.
CREATE OR REPLACE FUNCTION public.settle_delivered_order_financials(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_job public.delivery_jobs;
  v_merchant public.merchants;
  v_rule public.fee_rules;
  v_commission numeric(12,2) := 0;
  v_courier_earnings numeric(12,2) := 0;
  v_merchant_net numeric(12,2) := 0;
  v_platform_fee numeric(12,2) := 0;
  v_distance_km numeric := 0;
  v_merchant_wallet uuid;
  v_courier_wallet uuid;
  v_platform_wallet uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders o WHERE o.id=_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.status <> 'delivered' THEN RAISE EXCEPTION 'order is not delivered'; END IF;

  -- The snapshot is also the idempotency marker. A legitimate zero merchant net
  -- remains non-null after settlement.
  IF v_order.merchant_net IS NOT NULL AND v_order.courier_earnings IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_merchant FROM public.merchants m WHERE m.id=v_order.merchant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'merchant not found'; END IF;

  SELECT * INTO v_job FROM public.delivery_jobs dj WHERE dj.order_id=_order_id;
  IF v_order.fulfillment_type='delivery' AND (NOT FOUND OR v_job.courier_id IS NULL) THEN
    RAISE EXCEPTION 'delivered order has no courier';
  END IF;

  -- Merchant-specific rule wins; then active city rule. Null when no rule exists.
  SELECT * INTO v_rule
  FROM public.fee_rules fr
  WHERE fr.is_active=true
    AND (fr.starts_at IS NULL OR fr.starts_at<=now())
    AND (fr.ends_at IS NULL OR fr.ends_at>now())
    AND (fr.merchant_id=v_order.merchant_id OR (fr.merchant_id IS NULL AND fr.city_id=v_merchant.city_id))
  ORDER BY (fr.merchant_id IS NOT NULL) DESC, fr.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_commission := round((GREATEST(v_order.subtotal-v_order.discount,0) * v_rule.merchant_commission_percent / 100.0)::numeric,2);
    IF v_order.fulfillment_type='delivery' THEN
      v_distance_km := COALESCE(v_job.estimated_distance_meters,0)::numeric / 1000.0;
      v_courier_earnings := round(GREATEST(v_rule.courier_minimum_fee, v_rule.courier_base_fee + (v_rule.courier_per_km * v_distance_km))::numeric,2);
    END IF;
  ELSE
    v_commission := 0;
    v_courier_earnings := CASE WHEN v_order.fulfillment_type='delivery' THEN v_order.delivery_fee ELSE 0 END;
  END IF;

  v_merchant_net := GREATEST(round((v_order.subtotal-v_order.discount-v_commission)::numeric,2),0);
  v_platform_fee := GREATEST(round((v_commission + v_order.service_fee + GREATEST(v_order.delivery_fee-v_courier_earnings,0))::numeric,2),0);

  UPDATE public.orders
  SET merchant_net=v_merchant_net,
      courier_earnings=v_courier_earnings,
      platform_fee=v_platform_fee
  WHERE id=_order_id;

  INSERT INTO public.wallets(owner_type,merchant_id)
  VALUES('merchant',v_order.merchant_id)
  ON CONFLICT (merchant_id) WHERE merchant_id IS NOT NULL DO NOTHING;
  SELECT id INTO v_merchant_wallet FROM public.wallets WHERE merchant_id=v_order.merchant_id;

  INSERT INTO public.wallets(owner_type)
  VALUES('platform')
  ON CONFLICT (owner_type) WHERE owner_type='platform' DO NOTHING;
  SELECT id INTO v_platform_wallet FROM public.wallets WHERE owner_type='platform';

  PERFORM public.post_wallet_transaction(
    v_merchant_wallet,'order_earning',v_merchant_net,v_merchant_net,0,
    'order-merchant:'||_order_id::text,'order',_order_id::text,'Repasse do pedido','completed'
  );

  IF v_platform_fee > 0 THEN
    PERFORM public.post_wallet_transaction(
      v_platform_wallet,'platform_fee',v_platform_fee,v_platform_fee,0,
      'order-platform:'||_order_id::text,'order',_order_id::text,'Receita da plataforma','completed'
    );
  END IF;

  IF v_order.fulfillment_type='delivery' AND v_courier_earnings > 0 THEN
    INSERT INTO public.wallets(owner_type,courier_id)
    VALUES('courier',v_job.courier_id)
    ON CONFLICT (courier_id) WHERE courier_id IS NOT NULL DO NOTHING;
    SELECT id INTO v_courier_wallet FROM public.wallets WHERE courier_id=v_job.courier_id;

    PERFORM public.post_wallet_transaction(
      v_courier_wallet,'order_earning',v_courier_earnings,v_courier_earnings,0,
      'order-courier:'||_order_id::text,'order',_order_id::text,'Ganho da entrega','completed'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_delivered_order_financials(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_delivered_order_financials(uuid) TO service_role;

-- Recreate final delivery RPC so delivery + financial ledger share one transaction.
CREATE OR REPLACE FUNCTION public.complete_delivery_with_pin(_delivery_job_id uuid, _pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier_id uuid;
  v_job public.delivery_jobs;
  v_secret public.delivery_confirmation_secrets;
  v_next_attempts integer;
BEGIN
  SELECT c.id INTO v_courier_id
  FROM public.couriers c
  WHERE c.user_id=(SELECT auth.uid()) AND c.status='approved' AND c.is_active=true;
  IF v_courier_id IS NULL THEN RAISE EXCEPTION 'eligible courier required'; END IF;

  SELECT * INTO v_job
  FROM public.delivery_jobs dj
  WHERE dj.id=_delivery_job_id AND dj.courier_id=v_courier_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'delivery job not assigned to courier'; END IF;
  IF v_job.status <> 'arrived_destination' THEN RAISE EXCEPTION 'courier must arrive at destination first'; END IF;

  SELECT * INTO v_secret
  FROM public.delivery_confirmation_secrets s
  WHERE s.order_id=v_job.order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'delivery confirmation secret not found'; END IF;

  IF v_secret.locked_until IS NOT NULL AND v_secret.locked_until > now() THEN RETURN false; END IF;

  IF _pin IS DISTINCT FROM v_secret.pin_code THEN
    v_next_attempts := v_secret.failed_attempts + 1;
    UPDATE public.delivery_confirmation_secrets
    SET failed_attempts=CASE WHEN v_next_attempts>=5 THEN 0 ELSE v_next_attempts END,
        locked_until=CASE WHEN v_next_attempts>=5 THEN now()+interval '15 minutes' ELSE NULL END
    WHERE order_id=v_job.order_id;
    RETURN false;
  END IF;

  UPDATE public.delivery_confirmation_secrets SET failed_attempts=0,locked_until=NULL WHERE order_id=v_job.order_id;
  UPDATE public.delivery_jobs SET status='delivered',delivered_at=now() WHERE id=_delivery_job_id;
  UPDATE public.orders SET status='delivered',delivered_at=now() WHERE id=v_job.order_id;
  INSERT INTO public.order_status_history(order_id,status,changed_by_user_id)
  VALUES(v_job.order_id,'delivered',(SELECT auth.uid()));
  INSERT INTO public.delivery_events(delivery_job_id,event_type,from_status,to_status,actor_user_id)
  VALUES(_delivery_job_id,'delivery_confirmed',v_job.status,'delivered',(SELECT auth.uid()));
  UPDATE public.courier_availability SET last_seen_at=now() WHERE courier_id=v_courier_id;

  PERFORM public.settle_delivered_order_financials(v_job.order_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_delivery_with_pin(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_delivery_with_pin(uuid,text) TO authenticated,service_role;
