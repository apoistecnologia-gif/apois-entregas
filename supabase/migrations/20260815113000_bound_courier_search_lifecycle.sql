alter table public.cities
  add column if not exists courier_dispatch_radius_km numeric;

update public.cities
set courier_dispatch_radius_km = default_delivery_radius_km
where courier_dispatch_radius_km is null
  and default_delivery_radius_km is not null
  and default_delivery_radius_km > 0;

alter table public.cities
  drop constraint if exists cities_courier_dispatch_radius_km_check;
alter table public.cities
  add constraint cities_courier_dispatch_radius_km_check
  check (courier_dispatch_radius_km is null or courier_dispatch_radius_km > 0 and courier_dispatch_radius_km <= 100);

comment on column public.cities.courier_dispatch_radius_km is
  'Independent maximum courier-to-pickup search radius. Do not reuse customer delivery coverage for dispatch decisions.';

alter table public.delivery_jobs
  add column if not exists search_started_at timestamptz;

update public.delivery_jobs
set search_started_at = created_at
where search_started_at is null;

alter table public.delivery_jobs
  alter column search_started_at set default now(),
  alter column search_started_at set not null;

insert into public.platform_settings(key,value,description)
values(
  'courier_search_timeout_minutes',
  '15'::jsonb,
  'Operational safety timeout for one courier-search cycle. Merchant may explicitly retry after timeout.'
)
on conflict(key) do nothing;

create or replace function private.courier_search_timeout_interval()
returns interval
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_minutes numeric;
begin
  select case
    when jsonb_typeof(ps.value) = 'number' then (ps.value #>> '{}')::numeric
    when jsonb_typeof(ps.value) = 'string' and (ps.value #>> '{}') ~ '^[0-9]+([.][0-9]+)?$'
      then (ps.value #>> '{}')::numeric
    else null
  end
  into v_minutes
  from public.platform_settings ps
  where ps.key = 'courier_search_timeout_minutes';

  v_minutes := coalesce(v_minutes, 15);
  v_minutes := greatest(1, least(v_minutes, 120));
  return make_interval(mins => v_minutes::integer);
end;
$function$;

revoke all on function private.courier_search_timeout_interval() from public, anon, authenticated;

create or replace function private.expire_delivery_job_search(_delivery_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_job public.delivery_jobs;
  v_transitioned boolean := false;
begin
  select *
  into v_job
  from public.delivery_jobs dj
  where dj.id = _delivery_job_id
  for update;

  if not found
     or v_job.courier_id is not null
     or v_job.status not in ('searching','offered')
     or v_job.search_started_at > now() - private.courier_search_timeout_interval() then
    return false;
  end if;

  update public.delivery_offers
  set status = 'expired',
      responded_at = coalesce(responded_at, now())
  where delivery_job_id = v_job.id
    and status = 'offered';

  update public.delivery_jobs
  set status = 'cancelled',
      updated_at = now()
  where id = v_job.id
    and courier_id is null
    and status in ('searching','offered');

  if found then
    v_transitioned := true;

    insert into public.delivery_events(
      delivery_job_id,event_type,from_status,to_status,metadata
    ) values (
      v_job.id,
      'courier_search_timed_out',
      v_job.status,
      'cancelled',
      jsonb_build_object(
        'search_started_at', v_job.search_started_at,
        'timeout_minutes', extract(epoch from private.courier_search_timeout_interval()) / 60
      )
    );

    update public.orders
    set status = 'ready'
    where id = v_job.order_id
      and status = 'searching_driver';

    if found then
      insert into public.order_status_history(order_id,status,changed_by_user_id)
      values(v_job.order_id,'ready',null);
    end if;
  end if;

  return v_transitioned;
end;
$function$;

revoke all on function private.expire_delivery_job_search(uuid) from public, anon, authenticated;

create or replace function private.expire_stale_courier_searches()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_job_id uuid;
  v_count integer := 0;
begin
  for v_job_id in
    select dj.id
    from public.delivery_jobs dj
    where dj.courier_id is null
      and dj.status in ('searching','offered')
      and dj.search_started_at <= now() - private.courier_search_timeout_interval()
    order by dj.search_started_at
    limit 100
  loop
    if private.expire_delivery_job_search(v_job_id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$function$;

revoke all on function private.expire_stale_courier_searches() from public, anon, authenticated;

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
      and exists (
        select 1
        from public.push_devices pd
        where pd.user_id = c.user_id
          and pd.platform = 'android'
          and pd.is_active = true
      )
      and coalesce(a.last_seen_at, l.recorded_at) >= now() - interval '3 minutes'
      and l.recorded_at >= now() - interval '3 minutes'
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
        'search_started_at', v_job.search_started_at
      )
    );
  end if;

  return v_offer_count;
end;
$function$;

create or replace function public.merchant_request_courier(_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_job public.delivery_jobs;
  v_job_id uuid;
  v_existing_job_id uuid;
  v_is_admin boolean := public.current_user_is_admin();
begin
  select * into v_order from public.orders o where o.id = _order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not public.current_user_is_merchant_member(v_order.merchant_id) and not v_is_admin then
    raise exception 'merchant access required';
  end if;
  if v_order.fulfillment_type <> 'delivery' then raise exception 'delivery order required'; end if;
  if v_order.payment_method = 'pix' and v_order.payment_status <> 'paid' then
    raise exception 'pix payment must be confirmed before courier dispatch';
  end if;
  if v_order.status not in ('ready','searching_driver','driver_assigned','driver_arriving_store','picked_up','out_for_delivery','on_the_way') then
    raise exception 'order must be ready before courier dispatch';
  end if;

  select dj.id into v_existing_job_id
  from public.delivery_jobs dj
  where dj.order_id = _order_id
  limit 1;

  if v_existing_job_id is not null and v_order.status = 'ready' then
    update public.delivery_jobs
    set status = 'searching',
        courier_id = null,
        search_started_at = now(),
        updated_at = now()
    where id = v_existing_job_id
      and courier_id is null
      and status = 'cancelled';

    if found then
      update public.orders set status='searching_driver' where id=_order_id;
      insert into public.order_status_history(order_id,status,changed_by_user_id)
      values(_order_id,'searching_driver',(select auth.uid()));
      insert into public.delivery_events(delivery_job_id,event_type,from_status,to_status,metadata)
      values(v_existing_job_id,'courier_search_restarted','cancelled','searching',jsonb_build_object('requested_by',auth.uid()));
    end if;
  end if;

  v_job_id := public.ensure_delivery_job(_order_id);

  select dj.* into v_job from public.delivery_jobs dj where dj.id = v_job_id for update;
  if not found then raise exception 'delivery job missing for dispatched order'; end if;

  if v_job.courier_id is null and v_job.status in ('searching','offered') then
    perform public.dispatch_delivery_job_offers(v_job.id);
  end if;

  if v_is_admin and v_existing_job_id is null then
    insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
    values((select auth.uid()),'admin_request_courier','order',_order_id::text,to_jsonb(v_order),jsonb_build_object('delivery_job_id',v_job_id));
  end if;

  return v_job_id;
end;
$function$;

select cron.schedule(
  'apois-expire-stale-courier-searches',
  '* * * * *',
  $$select private.expire_stale_courier_searches();$$
)
where not exists (
  select 1 from cron.job where jobname='apois-expire-stale-courier-searches'
);

-- Resolve pre-existing abandoned searches immediately. They remain retryable by
-- the merchant, but can no longer surface hours or days later to a courier.
select private.expire_stale_courier_searches();
