create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
  );
$function$;

revoke all on function public.current_user_is_active() from public;
grant execute on function public.current_user_is_active() to authenticated;

create or replace function public.current_user_courier_id()
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select c.id
  from public.couriers c
  join public.profiles p on p.id = c.user_id
  where c.user_id = (select auth.uid())
    and p.is_active = true
  limit 1;
$function$;

create or replace function public.current_user_owns_wallet(_wallet_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select public.current_user_is_active()
    and exists (
      select 1
      from public.wallets w
      left join public.couriers c on c.id = w.courier_id
      where w.id = _wallet_id
        and (
          w.customer_user_id = (select auth.uid())
          or c.user_id = (select auth.uid())
          or (w.merchant_id is not null and public.current_user_is_merchant_manager(w.merchant_id))
          or public.current_user_is_admin()
        )
    );
$function$;

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
  where c.user_id = (select auth.uid());

  if not found then
    raise exception 'courier profile not found';
  end if;

  if _is_online and (v_courier.status <> 'approved' or not v_courier.is_active) then
    raise exception 'courier is not allowed to go online';
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

create or replace function public.accept_delivery_offer(_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_courier public.couriers;
  v_offer public.delivery_offers;
  v_job public.delivery_jobs;
begin
  if not public.current_user_is_active() then
    raise exception 'active account required';
  end if;
  select * into v_courier from public.couriers c where c.user_id=(select auth.uid()) and c.status='approved' and c.is_active=true;
  if not found then raise exception 'eligible courier required'; end if;
  if not exists(select 1 from public.courier_availability a where a.courier_id=v_courier.id and a.is_online=true) then raise exception 'courier must be online'; end if;
  select * into v_offer from public.delivery_offers o where o.id=_offer_id and o.courier_id=v_courier.id for update;
  if not found then raise exception 'offer not found'; end if;
  if v_offer.status<>'offered' or v_offer.expires_at<=now() then raise exception 'offer is no longer available'; end if;
  select * into v_job from public.delivery_jobs dj where dj.id=v_offer.delivery_job_id for update;
  if v_job.status not in ('searching','offered') or v_job.courier_id is not null then raise exception 'delivery already assigned'; end if;
  update public.delivery_jobs set courier_id=v_courier.id,status='accepted',accepted_at=now() where id=v_job.id;
  update public.delivery_offers set status='accepted',responded_at=now() where id=v_offer.id;
  update public.delivery_offers set status='cancelled',responded_at=now() where delivery_job_id=v_job.id and id<>v_offer.id and status='offered';
  update public.orders set status='driver_assigned' where id=v_job.order_id;
  insert into public.order_status_history(order_id,status,changed_by_user_id) values(v_job.order_id,'driver_assigned',(select auth.uid()));
  insert into public.delivery_events(delivery_job_id,event_type,from_status,to_status,actor_user_id) values(v_job.id,'offer_accepted',v_job.status,'accepted',(select auth.uid()));
  return v_job.id;
end;
$function$;

create or replace function public.reject_delivery_offer(_offer_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_courier_id uuid;
  v_job_id uuid;
  v_expired boolean;
begin
  if not public.current_user_is_active() then raise exception 'active account required'; end if;
  select c.id into v_courier_id from public.couriers c where c.user_id=(select auth.uid());
  if v_courier_id is null then raise exception 'courier profile required'; end if;
  select o.delivery_job_id,o.expires_at<=now() into v_job_id,v_expired from public.delivery_offers o where o.id=_offer_id and o.courier_id=v_courier_id and o.status='offered' for update;
  if not found then raise exception 'offer is no longer available'; end if;
  update public.delivery_offers set status=case when v_expired then 'expired' else 'rejected' end,responded_at=now() where id=_offer_id;
  if not exists(select 1 from public.delivery_offers live where live.delivery_job_id=v_job_id and live.status='offered' and live.expires_at>now()) then
    update public.delivery_jobs set status='searching' where id=v_job_id and courier_id is null and status='offered';
    perform public.dispatch_delivery_job_offers(v_job_id);
  end if;
end;
$function$;

create or replace function public.courier_transition_delivery(_delivery_job_id uuid, _new_status text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_courier_id uuid;
  v_job public.delivery_jobs;
begin
  if not public.current_user_is_active() then raise exception 'active account required'; end if;
  select c.id into v_courier_id from public.couriers c where c.user_id=(select auth.uid()) and c.status='approved' and c.is_active=true;
  if v_courier_id is null then raise exception 'eligible courier required'; end if;
  select * into v_job from public.delivery_jobs dj where dj.id=_delivery_job_id and dj.courier_id=v_courier_id for update;
  if not found then raise exception 'delivery job not assigned to courier'; end if;
  if not ((v_job.status='accepted' and _new_status='arriving_pickup') or (v_job.status='arriving_pickup' and _new_status='at_pickup') or (v_job.status='at_pickup' and _new_status='picked_up') or (v_job.status='picked_up' and _new_status='on_the_way') or (v_job.status='on_the_way' and _new_status='arrived_destination')) then raise exception 'invalid delivery transition from % to %',v_job.status,_new_status; end if;
  update public.delivery_jobs set status=_new_status,pickup_arrived_at=case when _new_status='at_pickup' then now() else pickup_arrived_at end,picked_up_at=case when _new_status='picked_up' then now() else picked_up_at end,destination_arrived_at=case when _new_status='arrived_destination' then now() else destination_arrived_at end where id=_delivery_job_id;
  if _new_status='arriving_pickup' then
    update public.orders set status='driver_arriving_store' where id=v_job.order_id;
    insert into public.order_status_history(order_id,status,changed_by_user_id) values(v_job.order_id,'driver_arriving_store',(select auth.uid()));
  elsif _new_status='picked_up' then
    update public.orders set status='picked_up' where id=v_job.order_id;
    insert into public.order_status_history(order_id,status,changed_by_user_id) values(v_job.order_id,'picked_up',(select auth.uid()));
  elsif _new_status='on_the_way' then
    update public.orders set status='on_the_way' where id=v_job.order_id;
    insert into public.order_status_history(order_id,status,changed_by_user_id) values(v_job.order_id,'on_the_way',(select auth.uid()));
  end if;
  insert into public.delivery_events(delivery_job_id,event_type,from_status,to_status,actor_user_id) values(_delivery_job_id,'status_changed',v_job.status,_new_status,(select auth.uid()));
end;
$function$;

create or replace function public.complete_delivery_with_pin(_delivery_job_id uuid, _pin text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_courier_id uuid;
  v_job public.delivery_jobs;
  v_secret public.delivery_confirmation_secrets;
  v_next_attempts integer;
begin
  if not public.current_user_is_active() then raise exception 'active account required'; end if;
  select c.id into v_courier_id from public.couriers c where c.user_id=(select auth.uid()) and c.status='approved' and c.is_active=true;
  if v_courier_id is null then raise exception 'eligible courier required'; end if;
  select * into v_job from public.delivery_jobs dj where dj.id=_delivery_job_id and dj.courier_id=v_courier_id for update;
  if not found then raise exception 'delivery job not assigned to courier'; end if;
  if v_job.status<>'arrived_destination' then raise exception 'courier must arrive at destination first'; end if;
  select * into v_secret from public.delivery_confirmation_secrets s where s.order_id=v_job.order_id for update;
  if not found then raise exception 'delivery confirmation secret not found'; end if;
  if v_secret.locked_until is not null and v_secret.locked_until>now() then return false; end if;
  if _pin is distinct from v_secret.pin_code then
    v_next_attempts:=v_secret.failed_attempts+1;
    update public.delivery_confirmation_secrets set failed_attempts=case when v_next_attempts>=5 then 0 else v_next_attempts end,locked_until=case when v_next_attempts>=5 then now()+interval '15 minutes' else null end where order_id=v_job.order_id;
    return false;
  end if;
  update public.delivery_confirmation_secrets set failed_attempts=0,locked_until=null where order_id=v_job.order_id;
  update public.delivery_jobs set status='delivered',delivered_at=now() where id=_delivery_job_id;
  update public.orders set status='delivered',delivered_at=now() where id=v_job.order_id;
  insert into public.order_status_history(order_id,status,changed_by_user_id) values(v_job.order_id,'delivered',(select auth.uid()));
  insert into public.delivery_events(delivery_job_id,event_type,from_status,to_status,actor_user_id) values(_delivery_job_id,'delivery_confirmed',v_job.status,'delivered',(select auth.uid()));
  update public.courier_availability set last_seen_at=now() where courier_id=v_courier_id;
  perform public.settle_delivered_order_financials(v_job.order_id);
  return true;
end;
$function$;

create or replace function public.update_courier_location(_latitude numeric, _longitude numeric, _accuracy_meters numeric default null, _heading numeric default null, _speed_mps numeric default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_courier_id uuid;
begin
  if not public.current_user_is_active() then raise exception 'active account required'; end if;
  select c.id into v_courier_id from public.couriers c join public.courier_availability a on a.courier_id=c.id where c.user_id=(select auth.uid()) and c.status='approved' and c.is_active=true and a.is_online=true;
  if v_courier_id is null then raise exception 'courier must be approved and online'; end if;
  if _latitude not between -90 and 90 or _longitude not between -180 and 180 then raise exception 'invalid coordinates'; end if;
  insert into public.courier_locations(courier_id,latitude,longitude,accuracy_meters,heading,speed_mps,recorded_at) values(v_courier_id,_latitude,_longitude,_accuracy_meters,_heading,_speed_mps,now())
  on conflict(courier_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,accuracy_meters=excluded.accuracy_meters,heading=excluded.heading,speed_mps=excluded.speed_mps,recorded_at=now();
  update public.courier_availability set last_seen_at=now() where courier_id=v_courier_id;
end;
$function$;

create or replace function public.get_courier_metrics(_timezone text default 'America/Sao_Paulo'::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_courier_id uuid;
  v_timezone text := coalesce(nullif(btrim(_timezone), ''), 'UTC');
  v_now timestamptz := now();
  v_today timestamptz;
  v_week timestamptz;
  v_month timestamptz;
  v_earnings_today numeric := 0;
  v_earnings_week numeric := 0;
  v_earnings_month numeric := 0;
  v_completed bigint := 0;
  v_offer_total bigint := 0;
  v_offer_accepted bigint := 0;
  v_online_today numeric := 0;
  v_online_week numeric := 0;
  v_online_month numeric := 0;
  v_balance numeric := 0;
  v_available numeric := 0;
  v_reserved numeric := 0;
begin
  if not public.current_user_is_active() then raise exception 'active account required'; end if;
  select c.id into v_courier_id from public.couriers c where c.user_id = (select auth.uid());
  if v_courier_id is null then raise exception 'courier profile not found'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then v_timezone := 'UTC'; end if;
  v_today := date_trunc('day', v_now at time zone v_timezone) at time zone v_timezone;
  v_week := date_trunc('week', v_now at time zone v_timezone) at time zone v_timezone;
  v_month := date_trunc('month', v_now at time zone v_timezone) at time zone v_timezone;
  select
    coalesce(sum(case when coalesce(dj.delivered_at, dj.updated_at) >= v_today then dj.estimated_earnings else 0 end), 0),
    coalesce(sum(case when coalesce(dj.delivered_at, dj.updated_at) >= v_week then dj.estimated_earnings else 0 end), 0),
    coalesce(sum(case when coalesce(dj.delivered_at, dj.updated_at) >= v_month then dj.estimated_earnings else 0 end), 0),
    count(*)
  into v_earnings_today, v_earnings_week, v_earnings_month, v_completed
  from public.delivery_jobs dj where dj.courier_id = v_courier_id and dj.status = 'delivered';
  select count(*) filter (where o.status in ('accepted','rejected','expired')), count(*) filter (where o.status='accepted')
  into v_offer_total, v_offer_accepted from public.delivery_offers o where o.courier_id=v_courier_id;
  select coalesce(sum(extract(epoch from (least(coalesce(s.ended_at,v_now),v_now)-greatest(s.started_at,v_today)))),0)
  into v_online_today from public.courier_online_sessions s where s.courier_id=v_courier_id and s.started_at<v_now and coalesce(s.ended_at,v_now)>v_today;
  select coalesce(sum(extract(epoch from (least(coalesce(s.ended_at,v_now),v_now)-greatest(s.started_at,v_week)))),0)
  into v_online_week from public.courier_online_sessions s where s.courier_id=v_courier_id and s.started_at<v_now and coalesce(s.ended_at,v_now)>v_week;
  select coalesce(sum(extract(epoch from (least(coalesce(s.ended_at,v_now),v_now)-greatest(s.started_at,v_month)))),0)
  into v_online_month from public.courier_online_sessions s where s.courier_id=v_courier_id and s.started_at<v_now and coalesce(s.ended_at,v_now)>v_month;
  select coalesce(w.balance,0),coalesce(w.available_balance,0),coalesce(w.reserved_balance,0)
  into v_balance,v_available,v_reserved from public.wallets w where w.courier_id=v_courier_id limit 1;
  return jsonb_build_object(
    'timezone',v_timezone,
    'earnings_today',v_earnings_today,
    'earnings_week',v_earnings_week,
    'earnings_month',v_earnings_month,
    'completed_deliveries',v_completed,
    'offers_considered',v_offer_total,
    'offers_accepted',v_offer_accepted,
    'acceptance_rate',case when v_offer_total=0 then 0 else round((v_offer_accepted::numeric*100)/v_offer_total,1) end,
    'online_seconds_today',v_online_today,
    'online_seconds_week',v_online_week,
    'online_seconds_month',v_online_month,
    'wallet_balance',v_balance,
    'available_balance',v_available,
    'reserved_balance',v_reserved
  );
end;
$function$;
