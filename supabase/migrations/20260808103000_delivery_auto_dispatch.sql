-- APOIS ENTREGAS — automatic dispatch to eligible nearby couriers.

CREATE OR REPLACE FUNCTION public.dispatch_delivery_job_offers(_delivery_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.delivery_jobs;
  v_count integer := 0;
  v_courier_id uuid;
BEGIN
  SELECT * INTO v_job
  FROM public.delivery_jobs dj
  WHERE dj.id=_delivery_job_id
  FOR UPDATE;

  IF NOT FOUND OR v_job.courier_id IS NOT NULL OR v_job.status IN ('accepted','arriving_pickup','at_pickup','picked_up','on_the_way','arrived_destination','delivered','cancelled') THEN
    RETURN 0;
  END IF;

  UPDATE public.delivery_offers
  SET status='expired', responded_at=COALESCE(responded_at,now())
  WHERE delivery_job_id=_delivery_job_id
    AND status='offered'
    AND expires_at<=now();

  -- Existing live offers do not get their expiration extended by retries.
  IF EXISTS (
    SELECT 1 FROM public.delivery_offers o
    WHERE o.delivery_job_id=_delivery_job_id AND o.status='offered' AND o.expires_at>now()
  ) THEN
    RETURN 0;
  END IF;

  FOR v_courier_id IN
    SELECT c.id
    FROM public.couriers c
    JOIN public.courier_availability a ON a.courier_id=c.id
    JOIN public.courier_locations l ON l.courier_id=c.id
    WHERE c.status='approved'
      AND c.is_active=true
      AND a.is_online=true
      AND a.last_seen_at>now()-interval '3 minutes'
      AND l.recorded_at>now()-interval '3 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM public.delivery_jobs busy
        WHERE busy.courier_id=c.id
          AND busy.status IN ('accepted','arriving_pickup','at_pickup','picked_up','on_the_way','arrived_destination')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.delivery_offers previous
        WHERE previous.delivery_job_id=_delivery_job_id
          AND previous.courier_id=c.id
          AND previous.status IN ('rejected','expired')
      )
    ORDER BY
      CASE
        WHEN v_job.pickup_latitude IS NULL OR v_job.pickup_longitude IS NULL THEN 0
        ELSE power((l.latitude-v_job.pickup_latitude)::numeric,2)+power((l.longitude-v_job.pickup_longitude)::numeric,2)
      END,
      a.last_seen_at DESC
    LIMIT 5
  LOOP
    INSERT INTO public.delivery_offers(delivery_job_id,courier_id,status,offered_at,expires_at)
    VALUES(_delivery_job_id,v_courier_id,'offered',now(),now()+interval '90 seconds')
    ON CONFLICT(delivery_job_id,courier_id) DO UPDATE
    SET status='offered',offered_at=now(),expires_at=now()+interval '90 seconds',responded_at=NULL
    WHERE public.delivery_offers.status IN ('cancelled');

    IF FOUND THEN v_count:=v_count+1; END IF;
  END LOOP;

  UPDATE public.delivery_jobs
  SET status=CASE WHEN v_count>0 THEN 'offered' ELSE 'searching' END
  WHERE id=_delivery_job_id AND courier_id IS NULL;

  IF v_count>0 THEN
    INSERT INTO public.delivery_events(delivery_job_id,event_type,from_status,to_status,metadata)
    VALUES(_delivery_job_id,'offers_dispatched',v_job.status,'offered',jsonb_build_object('offer_count',v_count));
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_delivery_job_offers(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_delivery_job_offers(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.dispatch_new_delivery_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.dispatch_delivery_job_offers(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_jobs_auto_dispatch ON public.delivery_jobs;
CREATE TRIGGER delivery_jobs_auto_dispatch
AFTER INSERT ON public.delivery_jobs
FOR EACH ROW EXECUTE FUNCTION public.dispatch_new_delivery_job();

-- Recreate reject so rejection/expiry immediately advances dispatch to other couriers.
CREATE OR REPLACE FUNCTION public.reject_delivery_offer(_offer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier_id uuid;
  v_job_id uuid;
  v_expired boolean;
BEGIN
  SELECT c.id INTO v_courier_id
  FROM public.couriers c
  WHERE c.user_id=(SELECT auth.uid());
  IF v_courier_id IS NULL THEN RAISE EXCEPTION 'courier profile required'; END IF;

  SELECT o.delivery_job_id, o.expires_at<=now()
  INTO v_job_id, v_expired
  FROM public.delivery_offers o
  WHERE o.id=_offer_id AND o.courier_id=v_courier_id AND o.status='offered'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'offer is no longer available'; END IF;

  UPDATE public.delivery_offers
  SET status=CASE WHEN v_expired THEN 'expired' ELSE 'rejected' END,
      responded_at=now()
  WHERE id=_offer_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.delivery_offers live
    WHERE live.delivery_job_id=v_job_id AND live.status='offered' AND live.expires_at>now()
  ) THEN
    UPDATE public.delivery_jobs SET status='searching'
    WHERE id=v_job_id AND courier_id IS NULL AND status='offered';
    PERFORM public.dispatch_delivery_job_offers(v_job_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_delivery_offer(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reject_delivery_offer(uuid) TO authenticated,service_role;

-- Going online also wakes up currently unassigned jobs. This remains bounded and
-- does not extend any existing live offer.
CREATE OR REPLACE FUNCTION public.set_courier_online(_is_online boolean)
RETURNS public.courier_availability
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier public.couriers;
  v_result public.courier_availability;
  v_job_id uuid;
BEGIN
  SELECT * INTO v_courier FROM public.couriers c WHERE c.user_id=(SELECT auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'courier profile not found'; END IF;
  IF _is_online AND (v_courier.status<>'approved' OR NOT v_courier.is_active) THEN RAISE EXCEPTION 'courier is not allowed to go online'; END IF;

  INSERT INTO public.courier_availability(courier_id,is_online,online_since,last_seen_at)
  VALUES(v_courier.id,_is_online,CASE WHEN _is_online THEN now() ELSE NULL END,now())
  ON CONFLICT(courier_id) DO UPDATE
  SET is_online=EXCLUDED.is_online,
      online_since=CASE WHEN EXCLUDED.is_online AND NOT public.courier_availability.is_online THEN now() WHEN EXCLUDED.is_online THEN public.courier_availability.online_since ELSE NULL END,
      last_seen_at=now()
  RETURNING * INTO v_result;

  IF _is_online THEN
    FOR v_job_id IN
      SELECT dj.id FROM public.delivery_jobs dj
      WHERE dj.courier_id IS NULL AND dj.status IN ('searching','offered')
      ORDER BY dj.created_at
      LIMIT 20
    LOOP
      PERFORM public.dispatch_delivery_job_offers(v_job_id);
    END LOOP;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_courier_online(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_courier_online(boolean) TO authenticated,service_role;
