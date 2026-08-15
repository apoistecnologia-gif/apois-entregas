create or replace function public.set_courier_online(_is_online boolean)
returns public.courier_availability
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_courier public.couriers;
  v_result public.courier_availability;
  v_job_id uuid;
begin
  if not public.current_user_is_active() then
    raise exception 'active account required';
  end if;

  select *
  into v_courier
  from public.couriers c
  where c.user_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'courier profile not found';
  end if;

  if _is_online and (v_courier.status <> 'approved' or not v_courier.is_active) then
    raise exception 'courier is not allowed to go online';
  end if;

  if _is_online and not exists (
    select 1
    from public.push_devices d
    where d.user_id = (select auth.uid())
      and d.platform = 'android'
      and d.is_active = true
  ) then
    raise exception 'active courier push registration required';
  end if;

  if _is_online and not exists (
    select 1
    from public.courier_locations l
    where l.courier_id = v_courier.id
      and l.recorded_at >= now() - interval '45 seconds'
      and l.accuracy_meters is not null
      and l.accuracy_meters between 0 and private.courier_max_location_accuracy_meters()
  ) then
    raise exception 'fresh accurate courier location required';
  end if;

  if not _is_online and exists (
    select 1
    from public.delivery_jobs dj
    where dj.courier_id = v_courier.id
      and dj.status in ('accepted','arriving_pickup','at_pickup','picked_up','on_the_way','arrived_destination')
  ) then
    raise exception 'active delivery must be completed before going offline';
  end if;

  insert into public.courier_availability(courier_id, is_online, online_since, last_seen_at)
  values (
    v_courier.id,
    _is_online,
    case when _is_online then now() else null end,
    now()
  )
  on conflict(courier_id) do update
  set
    is_online = excluded.is_online,
    online_since = case
      when excluded.is_online and not public.courier_availability.is_online then now()
      when excluded.is_online then public.courier_availability.online_since
      else null
    end,
    last_seen_at = now()
  returning * into v_result;

  if _is_online then
    insert into public.courier_online_sessions(courier_id, started_at)
    select v_courier.id, coalesce(v_result.online_since, now())
    where not exists (
      select 1
      from public.courier_online_sessions s
      where s.courier_id = v_courier.id
        and s.ended_at is null
    );

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
  else
    update public.courier_online_sessions
    set
      ended_at = greatest(now(), started_at),
      updated_at = now()
    where courier_id = v_courier.id
      and ended_at is null;
  end if;

  return v_result;
end;
$function$;
