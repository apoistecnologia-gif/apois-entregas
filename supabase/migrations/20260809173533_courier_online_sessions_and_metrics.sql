create table if not exists public.courier_online_sessions (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.couriers(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courier_online_sessions_valid_range check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists courier_online_sessions_one_open_idx
  on public.courier_online_sessions(courier_id)
  where ended_at is null;

create index if not exists courier_online_sessions_courier_started_idx
  on public.courier_online_sessions(courier_id, started_at desc);

alter table public.courier_online_sessions enable row level security;

revoke all on table public.courier_online_sessions from anon;
revoke insert, update, delete on table public.courier_online_sessions from authenticated;
grant select on table public.courier_online_sessions to authenticated;

drop policy if exists "Couriers view own online sessions" on public.courier_online_sessions;
create policy "Couriers view own online sessions"
  on public.courier_online_sessions
  for select
  to authenticated
  using (
    courier_id = public.current_user_courier_id()
    or public.current_user_is_admin()
  );

insert into public.courier_online_sessions(courier_id, started_at)
select ca.courier_id, coalesce(ca.online_since, ca.last_seen_at, now())
from public.courier_availability ca
where ca.is_online
  and not exists (
    select 1
    from public.courier_online_sessions s
    where s.courier_id = ca.courier_id
      and s.ended_at is null
  );

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

create or replace function public.get_courier_metrics(_timezone text default 'America/Sao_Paulo')
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
  select c.id
  into v_courier_id
  from public.couriers c
  where c.user_id = (select auth.uid());

  if v_courier_id is null then
    raise exception 'courier profile not found';
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    v_timezone := 'UTC';
  end if;

  v_today := date_trunc('day', v_now at time zone v_timezone) at time zone v_timezone;
  v_week := date_trunc('week', v_now at time zone v_timezone) at time zone v_timezone;
  v_month := date_trunc('month', v_now at time zone v_timezone) at time zone v_timezone;

  select
    coalesce(sum(case when coalesce(dj.delivered_at, dj.updated_at) >= v_today then dj.estimated_earnings else 0 end), 0),
    coalesce(sum(case when coalesce(dj.delivered_at, dj.updated_at) >= v_week then dj.estimated_earnings else 0 end), 0),
    coalesce(sum(case when coalesce(dj.delivered_at, dj.updated_at) >= v_month then dj.estimated_earnings else 0 end), 0),
    count(*)
  into v_earnings_today, v_earnings_week, v_earnings_month, v_completed
  from public.delivery_jobs dj
  where dj.courier_id = v_courier_id
    and dj.status = 'delivered';

  select
    count(*) filter (where o.status in ('accepted', 'rejected', 'expired')),
    count(*) filter (where o.status = 'accepted')
  into v_offer_total, v_offer_accepted
  from public.delivery_offers o
  where o.courier_id = v_courier_id;

  select coalesce(sum(extract(epoch from (least(coalesce(s.ended_at, v_now), v_now) - greatest(s.started_at, v_today)))), 0)
  into v_online_today
  from public.courier_online_sessions s
  where s.courier_id = v_courier_id
    and s.started_at < v_now
    and coalesce(s.ended_at, v_now) > v_today;

  select coalesce(sum(extract(epoch from (least(coalesce(s.ended_at, v_now), v_now) - greatest(s.started_at, v_week)))), 0)
  into v_online_week
  from public.courier_online_sessions s
  where s.courier_id = v_courier_id
    and s.started_at < v_now
    and coalesce(s.ended_at, v_now) > v_week;

  select coalesce(sum(extract(epoch from (least(coalesce(s.ended_at, v_now), v_now) - greatest(s.started_at, v_month)))), 0)
  into v_online_month
  from public.courier_online_sessions s
  where s.courier_id = v_courier_id
    and s.started_at < v_now
    and coalesce(s.ended_at, v_now) > v_month;

  select coalesce(w.balance, 0), coalesce(w.available_balance, 0), coalesce(w.reserved_balance, 0)
  into v_balance, v_available, v_reserved
  from public.wallets w
  where w.courier_id = v_courier_id
  limit 1;

  return jsonb_build_object(
    'timezone', v_timezone,
    'earnings_today', v_earnings_today,
    'earnings_week', v_earnings_week,
    'earnings_month', v_earnings_month,
    'completed_deliveries', v_completed,
    'offers_considered', v_offer_total,
    'offers_accepted', v_offer_accepted,
    'acceptance_rate', case when v_offer_total = 0 then 0 else round((v_offer_accepted::numeric * 100) / v_offer_total, 1) end,
    'online_seconds_today', v_online_today,
    'online_seconds_week', v_online_week,
    'online_seconds_month', v_online_month,
    'wallet_balance', v_balance,
    'available_balance', v_available,
    'reserved_balance', v_reserved
  );
end;
$function$;

revoke all on function public.get_courier_metrics(text) from public;
revoke all on function public.get_courier_metrics(text) from anon;
grant execute on function public.get_courier_metrics(text) to authenticated;
