-- A merchant delivery point must be persisted together with the address returned by
-- the map provider. Coordinates alone are not enough: they previously allowed a
-- Petrolina street address to coexist with an Itainopolis city/point.
create or replace function public.confirm_merchant_mapped_address(
  _latitude numeric,
  _longitude numeric,
  _city text,
  _state text,
  _address_line text,
  _neighborhood text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_merchant_id uuid;
  v_city_id uuid;
  v_city_name text;
  v_city_state text;
begin
  if v_user_id is null or not public.current_user_is_active() then
    raise exception 'active account required';
  end if;

  if _latitude is null or _latitude < -90 or _latitude > 90
     or _longitude is null or _longitude < -180 or _longitude > 180 then
    raise exception 'valid merchant coordinates required';
  end if;

  if nullif(btrim(_city), '') is null or nullif(btrim(_state), '') is null then
    raise exception 'mapped merchant city and state required';
  end if;

  if nullif(btrim(_address_line), '') is null then
    raise exception 'mapped merchant address required';
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

  select c.id, c.name, c.state
    into v_city_id, v_city_name, v_city_state
  from public.cities c
  where c.is_active = true
    and lower(btrim(c.name)) = lower(btrim(_city))
    and upper(btrim(c.state)) = upper(btrim(_state))
  order by c.created_at
  limit 1;

  if v_city_id is null then
    raise exception 'merchant mapped address is outside an active service city';
  end if;

  perform set_config('apois.merchant_map_location', '1', true);

  update public.merchants
  set latitude = _latitude,
      longitude = _longitude,
      city_id = v_city_id,
      city = v_city_name,
      state = v_city_state,
      address_line = btrim(_address_line),
      neighborhood = nullif(btrim(coalesce(_neighborhood, '')), ''),
      updated_at = now()
  where id = v_merchant_id;

  if not found then
    raise exception 'merchant not found';
  end if;

  return v_merchant_id;
end;
$function$;

revoke all on function public.confirm_merchant_mapped_address(numeric,numeric,text,text,text,text)
  from public, anon;
grant execute on function public.confirm_merchant_mapped_address(numeric,numeric,text,text,text,text)
  to authenticated, service_role;

-- Coordinates-only writes are no longer a safe public operation. Keep the legacy
-- function for internal compatibility but remove it from the authenticated API.
revoke all on function public.set_merchant_mapped_location(numeric,numeric)
  from public, anon, authenticated;
grant execute on function public.set_merchant_mapped_location(numeric,numeric)
  to service_role;
