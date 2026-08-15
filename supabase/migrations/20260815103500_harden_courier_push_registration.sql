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
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if not public.current_user_is_active() then
    raise exception 'active account required';
  end if;
  if _platform <> 'android' then
    raise exception 'unsupported courier push platform';
  end if;
  if v_token is null or length(v_token) < 20 or length(v_token) > 4096 then
    raise exception 'invalid push token';
  end if;
  if not exists (
    select 1
    from public.couriers c
    where c.user_id = v_uid
      and c.status = 'approved'
      and c.is_active = true
  ) then
    raise exception 'approved active courier required';
  end if;

  insert into public.push_devices(user_id, platform, token, is_active, last_seen_at, updated_at)
  values(v_uid, 'android', v_token, true, now(), now())
  on conflict(token) do update
  set user_id = excluded.user_id,
      platform = 'android',
      is_active = true,
      last_seen_at = now(),
      updated_at = now()
  returning id into v_device_id;

  delete from public.push_devices d
  where d.user_id = v_uid
    and d.platform = 'android'
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
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  delete from public.push_devices d
  where d.user_id = v_uid
    and d.platform = 'android';
end;
$function$;

revoke all on function public.register_courier_push_device(text,text) from public, anon;
grant execute on function public.register_courier_push_device(text,text) to authenticated;
revoke all on function public.remove_courier_push_devices() from public, anon;
grant execute on function public.remove_courier_push_devices() to authenticated;

-- Native registration now goes through the two validated RPCs above. Keep read
-- access for own-device diagnostics, but remove direct mutation paths.
revoke insert, update, delete on table public.push_devices from authenticated;
