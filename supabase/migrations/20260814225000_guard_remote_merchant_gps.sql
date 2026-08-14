create or replace function public.guard_merchant_coordinate_updates()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.latitude is not distinct from old.latitude
     and new.longitude is not distinct from old.longitude then
    return new;
  end if;

  if public.current_user_is_admin() then
    return new;
  end if;

  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return new;
  end if;

  if coalesce(current_setting('apois.merchant_map_location', true), '') = '1' then
    return new;
  end if;

  raise exception 'merchant location must be confirmed on map';
end;
$function$;

create or replace function public.set_merchant_mapped_location(
  _latitude numeric,
  _longitude numeric
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_merchant_id uuid;
begin
  if v_user_id is null or not public.current_user_is_active() then
    raise exception 'active account required';
  end if;

  if _latitude is null or _latitude < -90 or _latitude > 90
     or _longitude is null or _longitude < -180 or _longitude > 180 then
    raise exception 'valid merchant coordinates required';
  end if;

  select mm.merchant_id
    into v_merchant_id
  from public.merchant_members mm
  where mm.user_id = v_user_id
    and mm.status = 'active'
  order by mm.created_at desc
  limit 1;

  if v_merchant_id is null then
    raise exception 'merchant access required';
  end if;

  perform set_config('apois.merchant_map_location', '1', true);

  update public.merchants
  set latitude = _latitude,
      longitude = _longitude,
      updated_at = now()
  where id = v_merchant_id;

  if not found then
    raise exception 'merchant not found';
  end if;

  return v_merchant_id;
end;
$function$;

drop trigger if exists merchants_guard_coordinate_updates on public.merchants;
create trigger merchants_guard_coordinate_updates
before update of latitude, longitude on public.merchants
for each row
execute function public.guard_merchant_coordinate_updates();

revoke all on function public.set_merchant_mapped_location(numeric,numeric) from public, anon;
grant execute on function public.set_merchant_mapped_location(numeric,numeric) to authenticated, service_role;
