-- Couriers must only receive offers whose pickup is within the configured
-- operational radius of the merchant's active city. Previously dispatch ranked
-- couriers by distance but did not enforce any maximum, allowing absurdly distant
-- offers when few couriers were online.
create or replace function public.dispatch_delivery_job_offers(_delivery_job_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_job public.delivery_jobs;
  v_dispatch_radius_km numeric;
  v_offer_count integer := 0;
  v_courier record;
begin
  select *
  into v_job
  from public.delivery_jobs dj
  where dj.id = _delivery_job_id
  for update;

  if not found then
    raise exception 'delivery job not found';
  end if;

  if v_job.courier_id is not null
     or v_job.status not in ('searching', 'offered') then
    return 0;
  end if;

  if v_job.pickup_latitude is null or v_job.pickup_longitude is null then
    return 0;
  end if;

  select c.default_delivery_radius_km
    into v_dispatch_radius_km
  from public.merchants m
  join public.cities c on c.id = m.city_id
  where m.id = v_job.merchant_id
    and c.is_active = true
  limit 1;

  -- Fail closed if dispatch geography is not configured. Sending an offer with
  -- an unknown search boundary is operationally unsafe.
  if v_dispatch_radius_km is null or v_dispatch_radius_km <= 0 then
    return 0;
  end if;

  -- Expire stale offers before choosing replacements.
  update public.delivery_offers
  set status = 'expired',
      responded_at = coalesce(responded_at, now())
  where delivery_job_id = v_job.id
    and status = 'offered'
    and expires_at <= now();

  for v_courier in
    select
      c.id as courier_id,
      l.latitude,
      l.longitude,
      public.haversine_km(
        l.latitude,
        l.longitude,
        v_job.pickup_latitude,
        v_job.pickup_longitude
      ) as pickup_distance_km
    from public.couriers c
    join public.profiles p on p.id = c.user_id
    join public.courier_availability a on a.courier_id = c.id
    join public.courier_locations l on l.courier_id = c.id
    where c.status = 'approved'
      and c.is_active = true
      and p.is_active = true
      and a.is_online = true
      and coalesce(a.last_seen_at, l.recorded_at) >= now() - interval '3 minutes'
      and l.recorded_at >= now() - interval '3 minutes'
      and not exists (
        select 1
        from public.delivery_jobs active_job
        where active_job.courier_id = c.id
          and active_job.status in (
            'accepted',
            'arriving_pickup',
            'at_pickup',
            'picked_up',
            'on_the_way',
            'arrived_destination'
          )
      )
      and not exists (
        select 1
        from public.delivery_offers prior_offer
        where prior_offer.delivery_job_id = v_job.id
          and prior_offer.courier_id = c.id
          and prior_offer.status in ('rejected', 'expired')
      )
      and public.haversine_km(
        l.latitude,
        l.longitude,
        v_job.pickup_latitude,
        v_job.pickup_longitude
      ) <= v_dispatch_radius_km
    order by pickup_distance_km asc, c.created_at asc
    limit 5
  loop
    insert into public.delivery_offers(
      delivery_job_id,
      courier_id,
      status,
      offered_at,
      expires_at
    ) values (
      v_job.id,
      v_courier.courier_id,
      'offered',
      now(),
      now() + interval '90 seconds'
    )
    on conflict (delivery_job_id, courier_id) do update
    set status = 'offered',
        offered_at = excluded.offered_at,
        expires_at = excluded.expires_at,
        responded_at = null;

    v_offer_count := v_offer_count + 1;
  end loop;

  update public.delivery_jobs
  set status = case when v_offer_count > 0 then 'offered' else 'searching' end,
      updated_at = now()
  where id = v_job.id
    and courier_id is null;

  if v_offer_count > 0 then
    insert into public.delivery_events(
      delivery_job_id,
      event_type,
      from_status,
      to_status,
      metadata
    ) values (
      v_job.id,
      'offers_dispatched',
      v_job.status,
      'offered',
      jsonb_build_object(
        'offer_count', v_offer_count,
        'max_pickup_radius_km', v_dispatch_radius_km
      )
    );
  end if;

  return v_offer_count;
end;
$function$;

revoke all on function public.dispatch_delivery_job_offers(uuid) from public, anon, authenticated;
grant execute on function public.dispatch_delivery_job_offers(uuid) to service_role;

-- Trigger-only functions are internal implementation details, not API endpoints.
revoke execute on function public.guard_merchant_coordinate_updates() from public, anon, authenticated;
revoke execute on function public.sanitize_unassigned_delivery_destination() from public, anon, authenticated;
