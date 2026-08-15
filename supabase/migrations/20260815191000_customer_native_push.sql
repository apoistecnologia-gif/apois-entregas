alter table public.push_devices add column if not exists app_product text;

update public.push_devices d
set app_product = case
  when exists (select 1 from public.couriers c where c.user_id = d.user_id) then 'courier'
  else 'customer'
end
where d.app_product is null;

alter table public.push_devices alter column app_product set default 'customer';
alter table public.push_devices alter column app_product set not null;

alter table public.push_devices drop constraint if exists push_devices_app_product_check;
alter table public.push_devices add constraint push_devices_app_product_check
  check (app_product in ('customer','courier'));

create index if not exists push_devices_user_product_active_idx
  on public.push_devices(user_id, app_product, is_active);

create or replace function public.register_customer_push_device(_token text, _platform text default 'android')
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_token text := nullif(btrim(coalesce(_token,'')), '');
  v_device_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.current_user_is_active() then raise exception 'active account required'; end if;
  if _platform <> 'android' then raise exception 'unsupported customer push platform'; end if;
  if v_token is null or length(v_token) < 20 or length(v_token) > 4096 then
    raise exception 'invalid push token';
  end if;

  insert into public.push_devices(user_id, platform, token, app_product, is_active, last_seen_at, updated_at)
  values(v_uid, 'android', v_token, 'customer', true, now(), now())
  on conflict(token) do update
  set user_id = excluded.user_id,
      platform = 'android',
      app_product = 'customer',
      is_active = true,
      last_seen_at = now(),
      updated_at = now()
  returning id into v_device_id;

  delete from public.push_devices d
  where d.user_id = v_uid
    and d.platform = 'android'
    and d.app_product = 'customer'
    and d.id <> v_device_id;

  return v_device_id;
end;
$function$;

create or replace function public.remove_customer_push_devices()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  delete from public.push_devices d
  where d.user_id = v_uid
    and d.platform = 'android'
    and d.app_product = 'customer';
end;
$function$;

create or replace function public.register_courier_push_device(_token text, _platform text default 'android')
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_token text := nullif(btrim(coalesce(_token,'')), '');
  v_device_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not public.current_user_is_active() then raise exception 'active account required'; end if;
  if _platform <> 'android' then raise exception 'unsupported courier push platform'; end if;
  if v_token is null or length(v_token) < 20 or length(v_token) > 4096 then
    raise exception 'invalid push token';
  end if;
  if not exists (
    select 1 from public.couriers c
    where c.user_id = v_uid and c.status = 'approved' and c.is_active = true
  ) then
    raise exception 'approved active courier required';
  end if;

  insert into public.push_devices(user_id, platform, token, app_product, is_active, last_seen_at, updated_at)
  values(v_uid, 'android', v_token, 'courier', true, now(), now())
  on conflict(token) do update
  set user_id = excluded.user_id,
      platform = 'android',
      app_product = 'courier',
      is_active = true,
      last_seen_at = now(),
      updated_at = now()
  returning id into v_device_id;

  delete from public.push_devices d
  where d.user_id = v_uid
    and d.platform = 'android'
    and d.app_product = 'courier'
    and d.id <> v_device_id;

  return v_device_id;
end;
$function$;

create or replace function public.remove_courier_push_devices()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  delete from public.push_devices d
  where d.user_id = v_uid
    and d.platform = 'android'
    and d.app_product = 'courier';
end;
$function$;

create or replace function public.claim_notification_push_batch_v2(_limit integer default 25)
returns table(
  outbox_id uuid,
  notification_id uuid,
  user_id uuid,
  title text,
  body text,
  data jsonb,
  notification_type text,
  attempt_count integer,
  devices jsonb
)
language sql
volatile
security definer
set search_path to ''
as $function$
  with candidates as (
    select o.id
    from public.notification_push_outbox o
    where o.attempt_count < 6
      and (
        (o.status in ('pending','failed') and o.next_attempt_at <= now())
        or (o.status = 'processing' and o.updated_at <= now() - interval '2 minutes')
      )
    order by o.created_at
    limit greatest(1,least(coalesce(_limit,25),100))
    for update skip locked
  ), claimed as (
    update public.notification_push_outbox o
    set status='processing', attempt_count=o.attempt_count+1, updated_at=now(), last_error=null
    from candidates c
    where o.id=c.id
    returning o.id,o.notification_id,o.user_id,o.attempt_count
  )
  select
    c.id,
    c.notification_id,
    c.user_id,
    n.title,
    n.body,
    n.data,
    n.notification_type,
    c.attempt_count,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',d.id,
          'platform',d.platform,
          'token',d.token,
          'appProduct',d.app_product
        ) order by d.created_at
      ) filter (where d.id is not null),
      '[]'::jsonb
    )
  from claimed c
  join public.notifications n on n.id=c.notification_id
  left join public.push_devices d on d.user_id=c.user_id and d.is_active=true
  group by c.id,c.notification_id,c.user_id,n.title,n.body,n.data,n.notification_type,c.attempt_count;
$function$;

revoke all on function public.register_customer_push_device(text,text) from public, anon;
grant execute on function public.register_customer_push_device(text,text) to authenticated;
revoke all on function public.remove_customer_push_devices() from public, anon;
grant execute on function public.remove_customer_push_devices() to authenticated;
revoke all on function public.register_courier_push_device(text,text) from public, anon;
grant execute on function public.register_courier_push_device(text,text) to authenticated;
revoke all on function public.remove_courier_push_devices() from public, anon;
grant execute on function public.remove_courier_push_devices() to authenticated;
revoke all on function public.claim_notification_push_batch_v2(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_push_batch_v2(integer) to service_role;
