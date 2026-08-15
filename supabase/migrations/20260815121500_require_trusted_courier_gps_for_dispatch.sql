insert into public.platform_settings(key,value,description)
values(
  'courier_max_location_accuracy_meters',
  '200'::jsonb,
  'Maximum reported GPS accuracy radius accepted for courier dispatch eligibility.'
)
on conflict(key) do nothing;

create or replace function private.courier_max_location_accuracy_meters()
returns numeric
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_accuracy numeric;
begin
  select case
    when jsonb_typeof(ps.value) = 'number' then (ps.value #>> '{}')::numeric
    when jsonb_typeof(ps.value) = 'string' and (ps.value #>> '{}') ~ '^[0-9]+([.][0-9]+)?$'
      then (ps.value #>> '{}')::numeric
    else null
  end
  into v_accuracy
  from public.platform_settings ps
  where ps.key = 'courier_max_location_accuracy_meters';

  v_accuracy := coalesce(v_accuracy, 200);
  return greatest(10, least(v_accuracy, 2000));
end;
$function$;

revoke all on function private.courier_max_location_accuracy_meters() from public, anon, authenticated;

create or replace function public.dispatch_delivery_job_offers(_delivery_job_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_job public.delivery_jobs;
  v_dispatch_radius_km numeric;
  v_max_accuracy_meters numeric;
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

  if v_job.search_started_at <= now() - private.courier_search_timeout_interval() then
    perform private.expire_delivery_job_search(v_job.id);
    return 0;
  end if;

  if v_job.pickup_latitude is null or v_job.pickup_longitude is null then
    return 0;
  end if;

  select c.courier_dispatch_radius_km
  into v_dispatch_radius_km
  from public.merchants m
  join public.cities c on c.id = m.city_id
  where m.id = v_job.merchant_id
    and c.is_active = true
  limit 1;

  if v_dispatch_radius_km is null or v_dispatch_radius_km <= 0 then
    return 0;
  end if;

  v_max_accuracy_meters := private.courier_max_location_accuracy_meters();

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
      l.accuracy_meters,
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
      and exists (
        select 1
        from public.push_devices pd
        where pd.user_id = c.user_id
          and pd.platform = 'android'
          and pd.is_active = true
      )
      and coalesce(a.last_seen_at, l.recorded_at) >= now() - interval '3 minutes'
      and l.recorded_at >= now() - interval '3 minutes'
      and l.accuracy_meters is not null
      and l.accuracy_meters between 0 and v_max_accuracy_meters
      and not exists (
        select 1
        from public.delivery_jobs active_job
        where active_job.courier_id = c.id
          and active_job.status in (
            'accepted','arriving_pickup','at_pickup','picked_up','on_the_way','arrived_destination'
          )
      )
      and not exists (
        select 1
        from public.delivery_offers prior_offer
        where prior_offer.delivery_job_id = v_job.id
          and prior_offer.courier_id = c.id
          and prior_offer.status in ('rejected','expired')
          and prior_offer.offered_at >= v_job.search_started_at
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
      delivery_job_id,courier_id,status,offered_at,expires_at
    ) values (
      v_job.id,v_courier.courier_id,'offered',now(),now() + interval '90 seconds'
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
      delivery_job_id,event_type,from_status,to_status,metadata
    ) values (
      v_job.id,
      'offers_dispatched',
      v_job.status,
      'offered',
      jsonb_build_object(
        'offer_count', v_offer_count,
        'max_pickup_radius_km', v_dispatch_radius_km,
        'max_location_accuracy_meters', v_max_accuracy_meters,
        'search_started_at', v_job.search_started_at
      )
    );
  end if;

  return v_offer_count;
end;
$function$;

revoke all on function public.dispatch_delivery_job_offers(uuid) from public, anon, authenticated;
grant execute on function public.dispatch_delivery_job_offers(uuid) to service_role;
