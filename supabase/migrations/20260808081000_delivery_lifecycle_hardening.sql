-- Harden delivery confirmation and qualify nested RLS references.

ALTER TABLE public.delivery_confirmation_secrets
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- Replace job creation to generate the 4-digit PIN from cryptographic random bytes.
CREATE OR REPLACE FUNCTION public.ensure_delivery_job(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_merchant public.merchants;
  v_job_id uuid;
  v_random bytea;
  v_pin_number integer;
  v_pin text;
BEGIN
  SELECT * INTO v_order FROM public.orders o WHERE o.id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.fulfillment_type <> 'delivery' THEN RETURN NULL; END IF;

  SELECT * INTO v_merchant FROM public.merchants m WHERE m.id = v_order.merchant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'merchant not found'; END IF;

  SELECT dj.id INTO v_job_id FROM public.delivery_jobs dj WHERE dj.order_id = _order_id;
  IF v_job_id IS NOT NULL THEN RETURN v_job_id; END IF;

  INSERT INTO public.delivery_jobs (
    order_id, merchant_id, status, pickup_address, delivery_address,
    pickup_latitude, pickup_longitude, delivery_latitude, delivery_longitude,
    estimated_earnings
  ) VALUES (
    v_order.id,
    v_order.merchant_id,
    'searching',
    jsonb_build_object(
      'name', v_merchant.name,
      'address_line', v_merchant.address_line,
      'neighborhood', v_merchant.neighborhood,
      'city', v_merchant.city,
      'state', v_merchant.state
    ),
    v_order.delivery_address,
    v_merchant.latitude,
    v_merchant.longitude,
    CASE WHEN (v_order.delivery_address->>'latitude') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (v_order.delivery_address->>'latitude')::numeric ELSE NULL END,
    CASE WHEN (v_order.delivery_address->>'longitude') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (v_order.delivery_address->>'longitude')::numeric ELSE NULL END,
    v_order.delivery_fee
  ) RETURNING id INTO v_job_id;

  v_random := gen_random_bytes(2);
  v_pin_number := ((get_byte(v_random, 0) * 256) + get_byte(v_random, 1)) % 10000;
  v_pin := lpad(v_pin_number::text, 4, '0');

  INSERT INTO public.delivery_confirmation_secrets(order_id, pin_code)
  VALUES (v_order.id, v_pin)
  ON CONFLICT (order_id) DO NOTHING;

  INSERT INTO public.delivery_events(delivery_job_id,event_type,to_status,metadata)
  VALUES (v_job_id,'job_created','searching',jsonb_build_object('order_id',v_order.id));

  UPDATE public.orders SET status = 'searching_driver' WHERE id = v_order.id;
  INSERT INTO public.order_status_history(order_id,status,changed_by_user_id)
  VALUES (v_order.id,'searching_driver',(SELECT auth.uid()));

  RETURN v_job_id;
END;
$$;

-- Return false on a wrong/temporarily locked PIN instead of raising after the
-- counter update, so failed-attempt state is committed and brute force is capped.
DROP FUNCTION IF EXISTS public.complete_delivery_with_pin(uuid,text);
CREATE FUNCTION public.complete_delivery_with_pin(_delivery_job_id uuid, _pin text)
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

  IF v_secret.locked_until IS NOT NULL AND v_secret.locked_until > now() THEN
    RETURN false;
  END IF;

  IF _pin IS DISTINCT FROM v_secret.pin_code THEN
    v_next_attempts := v_secret.failed_attempts + 1;
    UPDATE public.delivery_confirmation_secrets
    SET failed_attempts = CASE WHEN v_next_attempts >= 5 THEN 0 ELSE v_next_attempts END,
        locked_until = CASE WHEN v_next_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END
    WHERE order_id=v_job.order_id;
    RETURN false;
  END IF;

  UPDATE public.delivery_confirmation_secrets
  SET failed_attempts=0,locked_until=NULL
  WHERE order_id=v_job.order_id;

  UPDATE public.delivery_jobs SET status='delivered',delivered_at=now() WHERE id=_delivery_job_id;
  UPDATE public.orders SET status='delivered',delivered_at=now() WHERE id=v_job.order_id;
  INSERT INTO public.order_status_history(order_id,status,changed_by_user_id)
  VALUES(v_job.order_id,'delivered',(SELECT auth.uid()));
  INSERT INTO public.delivery_events(delivery_job_id,event_type,from_status,to_status,actor_user_id)
  VALUES(_delivery_job_id,'delivery_confirmed',v_job.status,'delivered',(SELECT auth.uid()));
  UPDATE public.courier_availability SET last_seen_at=now() WHERE courier_id=v_courier_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_delivery_with_pin(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_delivery_with_pin(uuid,text) TO authenticated, service_role;

-- Qualify every outer-table reference used from a nested EXISTS.
DROP POLICY IF EXISTS "Customers can view own delivery job" ON public.delivery_jobs;
CREATE POLICY "Customers can view own delivery job" ON public.delivery_jobs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id=delivery_jobs.order_id AND o.customer_user_id=(SELECT auth.uid())
));

DROP POLICY IF EXISTS "Customers can view own delivery events" ON public.delivery_events;
CREATE POLICY "Customers can view own delivery events" ON public.delivery_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.delivery_jobs dj
  JOIN public.orders o ON o.id=dj.order_id
  WHERE dj.id=delivery_events.delivery_job_id AND o.customer_user_id=(SELECT auth.uid())
));

DROP POLICY IF EXISTS "Merchants can view delivery events" ON public.delivery_events;
CREATE POLICY "Merchants can view delivery events" ON public.delivery_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.delivery_jobs dj
  WHERE dj.id=delivery_events.delivery_job_id
    AND public.current_user_is_merchant_member(dj.merchant_id)
));

DROP POLICY IF EXISTS "Couriers can view own delivery events" ON public.delivery_events;
CREATE POLICY "Couriers can view own delivery events" ON public.delivery_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.delivery_jobs dj
  WHERE dj.id=delivery_events.delivery_job_id
    AND dj.courier_id=public.current_user_courier_id()
));

DROP POLICY IF EXISTS "Customers can view own delivery PIN" ON public.delivery_confirmation_secrets;
CREATE POLICY "Customers can view own delivery PIN" ON public.delivery_confirmation_secrets FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id=delivery_confirmation_secrets.order_id
    AND o.customer_user_id=(SELECT auth.uid())
));

DROP POLICY IF EXISTS "Assigned courier can view assigned orders" ON public.orders;
CREATE POLICY "Assigned courier can view assigned orders" ON public.orders FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.delivery_jobs dj
  WHERE dj.order_id=orders.id AND dj.courier_id=public.current_user_courier_id()
));

DROP POLICY IF EXISTS "Merchant members can view order items" ON public.order_items;
CREATE POLICY "Merchant members can view order items" ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id=order_items.order_id
    AND (public.current_user_is_merchant_member(o.merchant_id) OR public.current_user_is_admin())
));

DROP POLICY IF EXISTS "Assigned courier can view order items" ON public.order_items;
CREATE POLICY "Assigned courier can view order items" ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.delivery_jobs dj
  WHERE dj.order_id=order_items.order_id AND dj.courier_id=public.current_user_courier_id()
));

DROP POLICY IF EXISTS "Merchant members can view order history" ON public.order_status_history;
CREATE POLICY "Merchant members can view order history" ON public.order_status_history FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id=order_status_history.order_id
    AND (public.current_user_is_merchant_member(o.merchant_id) OR public.current_user_is_admin())
));

DROP POLICY IF EXISTS "Assigned courier can view order history" ON public.order_status_history;
CREATE POLICY "Assigned courier can view order history" ON public.order_status_history FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.delivery_jobs dj
  WHERE dj.order_id=order_status_history.order_id AND dj.courier_id=public.current_user_courier_id()
));
