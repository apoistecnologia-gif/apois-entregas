create or replace function public.update_courier_location(
  _latitude numeric,
  _longitude numeric,
  _accuracy_meters numeric default null,
  _heading numeric default null,
  _speed_mps numeric default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_courier_id uuid;
  v_job_id uuid;
begin
  if not public.current_user_is_active() then
    raise exception 'active account required';
  end if;

  select c.id
  into v_courier_id
  from public.couriers c
  join public.courier_availability a on a.courier_id = c.id
  where c.user_id = (select auth.uid())
    and c.status = 'approved'
    and c.is_active = true
    and a.is_online = true;

  if v_courier_id is null then
    raise exception 'courier must be approved and online';
  end if;

  if _latitude not between -90 and 90 or _longitude not between -180 and 180 then
    raise exception 'invalid coordinates';
  end if;

  insert into public.courier_locations(
    courier_id,
    latitude,
    longitude,
    accuracy_meters,
    heading,
    speed_mps,
    recorded_at
  )
  values(
    v_courier_id,
    _latitude,
    _longitude,
    _accuracy_meters,
    _heading,
    _speed_mps,
    now()
  )
  on conflict(courier_id) do update
  set latitude = excluded.latitude,
      longitude = excluded.longitude,
      accuracy_meters = excluded.accuracy_meters,
      heading = excluded.heading,
      speed_mps = excluded.speed_mps,
      recorded_at = now();

  update public.courier_availability
  set last_seen_at = now(),
      updated_at = now()
  where courier_id = v_courier_id;

  -- Going online can happen before the browser's first watchPosition callback.
  -- Once a fresh location reaches the server, immediately retry a bounded set of
  -- unassigned jobs so a courier is not left online without receiving already-waiting work.
  for v_job_id in
    select dj.id
    from public.delivery_jobs dj
    where dj.courier_id is null
      and dj.status in ('searching', 'offered')
    order by dj.created_at
    limit 20
  loop
    perform public.dispatch_delivery_job_offers(v_job_id);
  end loop;
end;
$function$;

revoke all on function public.update_courier_location(numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.update_courier_location(numeric, numeric, numeric, numeric, numeric) to authenticated, service_role;
