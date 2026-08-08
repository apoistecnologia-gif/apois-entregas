-- APOIS ENTREGAS — delivery lifecycle, offers, state transitions and PIN confirmation.

-- Expand order lifecycle without removing legacy states already used by the app.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check CHECK (
    status IN (
      'created','pending_payment','paid','confirmed','accepted','preparing','ready',
      'ready_for_pickup','searching_driver','driver_assigned','driver_arriving_store',
      'picked_up','out_for_delivery','on_the_way','delivered','cancelled','refunded'
    )
  );

ALTER TABLE public.order_status_history DROP CONSTRAINT IF EXISTS order_status_history_status_check;
ALTER TABLE public.order_status_history
  ADD CONSTRAINT order_status_history_status_check CHECK (
    status IN (
      'created','pending_payment','paid','confirmed','accepted','preparing','ready',
      'ready_for_pickup','searching_driver','driver_assigned','driver_arriving_store',
      'picked_up','out_for_delivery','on_the_way','delivered','cancelled','refunded'
    )
  );

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_type text NOT NULL DEFAULT 'delivery'
    CHECK (fulfillment_type IN ('delivery','pickup')),
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE TABLE IF NOT EXISTS public.delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
  courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'searching'
    CHECK (status IN (
      'searching','offered','accepted','arriving_pickup','at_pickup','picked_up',
      'on_the_way','arrived_destination','delivered','cancelled'
    )),
  pickup_address jsonb NOT NULL CHECK (jsonb_typeof(pickup_address) = 'object'),
  delivery_address jsonb NOT NULL CHECK (jsonb_typeof(delivery_address) = 'object'),
  pickup_latitude numeric(9,6) CHECK (pickup_latitude IS NULL OR pickup_latitude BETWEEN -90 AND 90),
  pickup_longitude numeric(9,6) CHECK (pickup_longitude IS NULL OR pickup_longitude BETWEEN -180 AND 180),
  delivery_latitude numeric(9,6) CHECK (delivery_latitude IS NULL OR delivery_latitude BETWEEN -90 AND 90),
  delivery_longitude numeric(9,6) CHECK (delivery_longitude IS NULL OR delivery_longitude BETWEEN -180 AND 180),
  estimated_distance_meters integer CHECK (estimated_distance_meters IS NULL OR estimated_distance_meters >= 0),
  estimated_duration_seconds integer CHECK (estimated_duration_seconds IS NULL OR estimated_duration_seconds >= 0),
  estimated_earnings numeric(10,2) NOT NULL DEFAULT 0 CHECK (estimated_earnings >= 0),
  accepted_at timestamptz,
  pickup_arrived_at timestamptz,
  picked_up_at timestamptz,
  destination_arrived_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_jobs_status_idx ON public.delivery_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS delivery_jobs_courier_status_idx ON public.delivery_jobs(courier_id, status);
CREATE INDEX IF NOT EXISTS delivery_jobs_merchant_status_idx ON public.delivery_jobs(merchant_id, status);

CREATE TABLE IF NOT EXISTS public.delivery_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_job_id uuid NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE CASCADE,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered','accepted','rejected','expired','cancelled')),
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_job_id, courier_id)
);

CREATE INDEX IF NOT EXISTS delivery_offers_courier_status_idx
  ON public.delivery_offers(courier_id, status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_offers_one_accepted_per_job_idx
  ON public.delivery_offers(delivery_job_id) WHERE status = 'accepted';

CREATE TABLE IF NOT EXISTS public.delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_job_id uuid NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_events_job_created_idx
  ON public.delivery_events(delivery_job_id, created_at);

CREATE TABLE IF NOT EXISTS public.delivery_confirmation_secrets (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  pin_code text NOT NULL CHECK (pin_code ~ '^[0-9]{4}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS delivery_jobs_set_updated_at ON public.delivery_jobs;
CREATE TRIGGER delivery_jobs_set_updated_at
BEFORE UPDATE ON public.delivery_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Internal helper creates one delivery job and one customer-only PIN.
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

  v_pin := lpad((floor(random() * 10000))::integer::text, 4, '0');
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

-- Merchant state machine. Establishment staff cannot write order status directly.
CREATE OR REPLACE FUNCTION public.merchant_transition_order(_order_id uuid, _new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
BEGIN
  SELECT * INTO v_order FROM public.orders o WHERE o.id=_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF NOT public.current_user_is_merchant_member(v_order.merchant_id) AND NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'merchant access required';
  END IF;

  IF NOT (
    (v_order.status='confirmed' AND _new_status IN ('accepted','preparing','cancelled')) OR
    (v_order.status='accepted' AND _new_status IN ('preparing','cancelled')) OR
    (v_order.status='preparing' AND _new_status IN ('ready','cancelled'))
  ) THEN
    RAISE EXCEPTION 'invalid order transition from % to %', v_order.status, _new_status;
  END IF;

  UPDATE public.orders
  SET status=_new_status,
      accepted_at=CASE WHEN _new_status IN ('accepted','preparing') AND accepted_at IS NULL THEN now() ELSE accepted_at END,
      ready_at=CASE WHEN _new_status='ready' THEN now() ELSE ready_at END,
      cancelled_at=CASE WHEN _new_status='cancelled' THEN now() ELSE cancelled_at END
  WHERE id=_order_id;

  INSERT INTO public.order_status_history(order_id,status,changed_by_user_id)
  VALUES(_order_id,_new_status,(SELECT auth.uid()));

  IF _new_status='ready' AND v_order.fulfillment_type='delivery' THEN
    PERFORM public.ensure_delivery_job(_order_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_order(_order_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_order public.orders;
BEGIN
  SELECT * INTO v_order FROM public.orders o WHERE o.id=_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF NOT public.current_user_is_merchant_member(v_order.merchant_id) AND NOT public.current_user_is_admin() THEN RAISE EXCEPTION 'merchant access required'; END IF;
  IF v_order.status NOT IN ('confirmed','accepted','preparing') THEN RAISE EXCEPTION 'order can no longer be rejected'; END IF;
  IF NULLIF(btrim(_reason),'') IS NULL THEN RAISE EXCEPTION 'cancellation reason is required'; END IF;
  UPDATE public.orders SET status='cancelled',cancellation_reason=btrim(_reason),cancelled_at=now() WHERE id=_order_id;
  INSERT INTO public.order_status_history(order_id,status,changed_by_user_id) VALUES(_order_id,'cancelled',(SELECT auth.uid()));
END;
$$;

-- Trusted dispatch creates offers after selecting an eligible courier.
CREATE OR REPLACE FUNCTION public.create_delivery_offer(_delivery_job_id uuid, _courier_id uuid, _expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  IF _expires_at <= now() THEN RAISE EXCEPTION 'offer expiration must be in the future'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.couriers c
    JOIN public.courier_availability a ON a.courier_id=c.id
    WHERE c.id=_courier_id AND c.status='approved' AND c.is_active=true AND a.is_online=true
  ) THEN RAISE EXCEPTION 'courier is not eligible'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.delivery_jobs dj WHERE dj.id=_delivery_job_id AND dj.status IN ('searching','offered')) THEN RAISE EXCEPTION 'delivery job is not offerable'; END IF;
  INSERT INTO public.delivery_offers(delivery_job_id,courier_id,status,expires_at)
  VALUES(_delivery_job_id,_courier_id,'offered',_expires_at)
  ON CONFLICT(delivery_job_id,courier_id) DO UPDATE
    SET status='offered',offered_at=now(),expires_at=EXCLUDED.expires_at,responded_at=NULL
  RETURNING id INTO v_id;
  UPDATE public.delivery_jobs SET status='offered' WHERE id=_delivery_job_id AND status='searching';
  RETURN v_id;
END;
$$;

-- Courier acceptance is atomic: the job row is locked before assignment.
CREATE OR REPLACE FUNCTION public.accept_delivery_offer(_offer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier public.couriers;
  v_offer public.delivery_offers;
  v_job public.delivery_jobs;
BEGIN
  SELECT * INTO v_courier FROM public.couriers c
  WHERE c.user_id=(SELECT auth.uid()) AND c.status='approved' AND c.is_active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'eligible courier required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.courier_availability a WHERE a.courier_id=v_courier.id AND a.is_online=true) THEN RAISE EXCEPTION 'courier must be online'; END IF;

  SELECT * INTO v_offer FROM public.delivery_offers o WHERE o.id=_offer_id AND o.courier_id=v_courier.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'offer not found'; END IF;
  IF v_offer.status <> 'offered' OR v_offer.expires_at <= now() THEN RAISE EXCEPTION 'offer is no longer available'; END IF;

  SELECT * INTO v_job FROM public.delivery_jobs dj WHERE dj.id=v_offer.delivery_job_id FOR UPDATE;
  IF v_job.status NOT IN ('searching','offered') OR v_job.courier_id IS NOT NULL THEN RAISE EXCEPTION 'delivery already assigned'; END IF;

  UPDATE public.delivery_jobs SET courier_id=v_courier.id,status='accepted',accepted_at=now() WHERE id=v_job.id;
  UPDATE public.delivery_offers SET status='accepted',responded_at=now() WHERE id=v_offer.id;
  UPDATE public.delivery_offers SET status='cancelled',responded_at=now() WHERE delivery_job_id=v_job.id AND id<>v_offer.id AND status='offered';
  UPDATE public.orders SET status='driver_assigned' WHERE id=v_job.order_id;
  INSERT INTO public.order_status_history(order_id,status,changed_by_user_id) VALUES(v_job.order_id,'driver_assigned',(SELECT auth.uid()));
  INSERT INTO public.delivery_events(delivery_job_id,event_type,from_status,to_status,actor_user_id)
  VALUES(v_job.id,'offer_accepted',v_job.status,'accepted',(SELECT auth.uid()));
  RETURN v_job.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_delivery_offer(_offer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_courier_id uuid;
BEGIN
  SELECT c.id INTO v_courier_id FROM public.couriers c WHERE c.user_id=(SELECT auth.uid());
  IF v_courier_id IS NULL THEN RAISE EXCEPTION 'courier profile required'; END IF;
  UPDATE public.delivery_offers SET status='rejected',responded_at=now()
  WHERE id=_offer_id AND courier_id=v_courier_id AND status='offered' AND expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'offer is no longer available'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.courier_transition_delivery(_delivery_job_id uuid, _new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_courier_id uuid; v_job public.delivery_jobs;
BEGIN
  SELECT c.id INTO v_courier_id FROM public.couriers c WHERE c.user_id=(SELECT auth.uid()) AND c.status='approved' AND c.is_active=true;
  IF v_courier_id IS NULL THEN RAISE EXCEPTION 'eligible courier required'; END IF;
  SELECT * INTO v_job FROM public.delivery_jobs dj WHERE dj.id=_delivery_job_id AND dj.courier_id=v_courier_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'delivery job not assigned to courier'; END IF;

  IF NOT (
    (v_job.status='accepted' AND _new_status='arriving_pickup') OR
    (v_job.status='arriving_pickup' AND _new_status='at_pickup') OR
    (v_job.status='at_pickup' AND _new_status='picked_up') OR
    (v_job.status='picked_up' AND _new_status='on_the_way') OR
    (v_job.status='on_the_way' AND _new_status='arrived_destination')
  ) THEN RAISE EXCEPTION 'invalid delivery transition from % to %',v_job.status,_new_status; END IF;

  UPDATE public.delivery_jobs
  SET status=_new_status,
      pickup_arrived_at=CASE WHEN _new_status='at_pickup' THEN now() ELSE pickup_arrived_at END,
      picked_up_at=CASE WHEN _new_status='picked_up' THEN now() ELSE picked_up_at END,
      destination_arrived_at=CASE WHEN _new_status='arrived_destination' THEN now() ELSE destination_arrived_at END
  WHERE id=_delivery_job_id;

  IF _new_status='arriving_pickup' THEN
    UPDATE public.orders SET status='driver_arriving_store' WHERE id=v_job.order_id;
    INSERT INTO public.order_status_history(order_id,status,changed_by_user_id) VALUES(v_job.order_id,'driver_arriving_store',(SELECT auth.uid()));
  ELSIF _new_status='picked_up' THEN
    UPDATE public.orders SET status='picked_up' WHERE id=v_job.order_id;
    INSERT INTO public.order_status_history(order_id,status,changed_by_user_id) VALUES(v_job.order_id,'picked_up',(SELECT auth.uid()));
  ELSIF _new_status='on_the_way' THEN
    UPDATE public.orders SET status='on_the_way' WHERE id=v_job.order_id;
    INSERT INTO public.order_status_history(order_id,status,changed_by_user_id) VALUES(v_job.order_id,'on_the_way',(SELECT auth.uid()));
  END IF;

  INSERT INTO public.delivery_events(delivery_job_id,event_type,from_status,to_status,actor_user_id)
  VALUES(_delivery_job_id,'status_changed',v_job.status,_new_status,(SELECT auth.uid()));
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_delivery_with_pin(_delivery_job_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_courier_id uuid; v_job public.delivery_jobs;
BEGIN
  SELECT c.id INTO v_courier_id FROM public.couriers c WHERE c.user_id=(SELECT auth.uid()) AND c.status='approved' AND c.is_active=true;
  IF v_courier_id IS NULL THEN RAISE EXCEPTION 'eligible courier required'; END IF;
  SELECT * INTO v_job FROM public.delivery_jobs dj WHERE dj.id=_delivery_job_id AND dj.courier_id=v_courier_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'delivery job not assigned to courier'; END IF;
  IF v_job.status <> 'arrived_destination' THEN RAISE EXCEPTION 'courier must arrive at destination first'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.delivery_confirmation_secrets s WHERE s.order_id=v_job.order_id AND s.pin_code=_pin) THEN RAISE EXCEPTION 'invalid delivery PIN'; END IF;

  UPDATE public.delivery_jobs SET status='delivered',delivered_at=now() WHERE id=_delivery_job_id;
  UPDATE public.orders SET status='delivered',delivered_at=now() WHERE id=v_job.order_id;
  INSERT INTO public.order_status_history(order_id,status,changed_by_user_id) VALUES(v_job.order_id,'delivered',(SELECT auth.uid()));
  INSERT INTO public.delivery_events(delivery_job_id,event_type,from_status,to_status,actor_user_id)
  VALUES(_delivery_job_id,'delivery_confirmed',v_job.status,'delivered',(SELECT auth.uid()));
  UPDATE public.courier_availability SET last_seen_at=now() WHERE courier_id=v_courier_id;
END;
$$;

-- Function privileges.
REVOKE ALL ON FUNCTION public.ensure_delivery_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_delivery_job(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_delivery_offer(uuid,uuid,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_delivery_offer(uuid,uuid,timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.merchant_transition_order(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_order(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_delivery_offer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_delivery_offer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.courier_transition_delivery(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_delivery_with_pin(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_transition_order(uuid,text), public.reject_order(uuid,text),
  public.accept_delivery_offer(uuid), public.reject_delivery_offer(uuid),
  public.courier_transition_delivery(uuid,text), public.complete_delivery_with_pin(uuid,text)
  TO authenticated, service_role;

-- RLS.
ALTER TABLE public.delivery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_confirmation_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own delivery job" ON public.delivery_jobs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.customer_user_id=(SELECT auth.uid())));
CREATE POLICY "Merchants can view own delivery jobs" ON public.delivery_jobs FOR SELECT TO authenticated
USING (public.current_user_is_merchant_member(merchant_id));
CREATE POLICY "Assigned courier can view delivery job" ON public.delivery_jobs FOR SELECT TO authenticated
USING (courier_id=public.current_user_courier_id());
CREATE POLICY "Admins can view delivery jobs" ON public.delivery_jobs FOR SELECT TO authenticated
USING (public.current_user_is_admin());

CREATE POLICY "Couriers can view own offers" ON public.delivery_offers FOR SELECT TO authenticated
USING (courier_id=public.current_user_courier_id());
CREATE POLICY "Admins can view delivery offers" ON public.delivery_offers FOR SELECT TO authenticated
USING (public.current_user_is_admin());

CREATE POLICY "Customers can view own delivery events" ON public.delivery_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.delivery_jobs dj JOIN public.orders o ON o.id=dj.order_id WHERE dj.id=delivery_job_id AND o.customer_user_id=(SELECT auth.uid())));
CREATE POLICY "Merchants can view delivery events" ON public.delivery_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.delivery_jobs dj WHERE dj.id=delivery_job_id AND public.current_user_is_merchant_member(dj.merchant_id)));
CREATE POLICY "Couriers can view own delivery events" ON public.delivery_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.delivery_jobs dj WHERE dj.id=delivery_job_id AND dj.courier_id=public.current_user_courier_id()));
CREATE POLICY "Admins can view delivery events" ON public.delivery_events FOR SELECT TO authenticated
USING (public.current_user_is_admin());

CREATE POLICY "Customers can view own delivery PIN" ON public.delivery_confirmation_secrets FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.customer_user_id=(SELECT auth.uid())));
CREATE POLICY "Admins can view delivery PIN for support" ON public.delivery_confirmation_secrets FOR SELECT TO authenticated
USING (public.current_user_is_admin());

-- Merchant/courier visibility into order records, without granting writes.
CREATE POLICY "Merchant members can view merchant orders" ON public.orders FOR SELECT TO authenticated
USING (public.current_user_is_merchant_member(merchant_id) OR public.current_user_is_admin());
CREATE POLICY "Assigned courier can view assigned orders" ON public.orders FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.delivery_jobs dj WHERE dj.order_id=id AND dj.courier_id=public.current_user_courier_id()));
CREATE POLICY "Merchant members can view order items" ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND (public.current_user_is_merchant_member(o.merchant_id) OR public.current_user_is_admin())));
CREATE POLICY "Assigned courier can view order items" ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.delivery_jobs dj WHERE dj.order_id=order_id AND dj.courier_id=public.current_user_courier_id()));
CREATE POLICY "Merchant members can view order history" ON public.order_status_history FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND (public.current_user_is_merchant_member(o.merchant_id) OR public.current_user_is_admin())));
CREATE POLICY "Assigned courier can view order history" ON public.order_status_history FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.delivery_jobs dj WHERE dj.order_id=order_id AND dj.courier_id=public.current_user_courier_id()));

-- Table privileges: read only from clients; all writes go through state-machine RPCs.
REVOKE ALL ON public.delivery_jobs, public.delivery_offers, public.delivery_events, public.delivery_confirmation_secrets FROM anon;
REVOKE ALL ON public.delivery_jobs, public.delivery_offers, public.delivery_events, public.delivery_confirmation_secrets FROM authenticated;
GRANT SELECT ON public.delivery_jobs, public.delivery_offers, public.delivery_events, public.delivery_confirmation_secrets TO authenticated;
GRANT ALL ON public.delivery_jobs, public.delivery_offers, public.delivery_events, public.delivery_confirmation_secrets TO service_role;
