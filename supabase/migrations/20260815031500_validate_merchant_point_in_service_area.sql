-- Mapped merchant coordinates must agree not only with the city text returned by
-- the geocoder, but also with the backend service geography. This prevents a client
-- from supplying an arbitrary latitude/longitude together with a valid city name.
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
  v_city_center_lat numeric;
  v_city_center_lon numeric;
  v_city_radius_km numeric;
  v_has_active_zones boolean;
  v_inside_service_area boolean := false;
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

  select
    c.id,
    c.name,
    c.state,
    c.center_latitude,
    c.center_longitude,
    c.default_delivery_radius_km
  into
    v_city_id,
    v_city_name,
    v_city_state,
    v_city_center_lat,
    v_city_center_lon,
    v_city_radius_km
  from public.cities c
  where c.is_active = true
    and lower(btrim(c.name)) = lower(btrim(_city))
    and upper(btrim(c.state)) = upper(btrim(_state))
  order by c.created_at
  limit 1;

  if v_city_id is null then
    raise exception 'merchant mapped address is outside an active service city';
  end if;

  select exists (
    select 1
    from public.delivery_zones z
    where z.city_id = v_city_id
      and z.is_active = true
  ) into v_has_active_zones;

  if v_has_active_zones then
    select exists (
      select 1
      from public.delivery_zones z
      where z.city_id = v_city_id
        and z.is_active = true
        and z.center_latitude is not null
        and z.center_longitude is not null
        and z.radius_km is not null
        and z.radius_km > 0
        and public.haversine_km(
          _latitude,
          _longitude,
          z.center_latitude,
          z.center_longitude
        ) <= z.radius_km
    ) into v_inside_service_area;
  elsif v_city_center_lat is not null
        and v_city_center_lon is not null
        and v_city_radius_km is not null
        and v_city_radius_km > 0 then
    v_inside_service_area := public.haversine_km(
      _latitude,
      _longitude,
      v_city_center_lat,
      v_city_center_lon
    ) <= v_city_radius_km;
  else
    raise exception 'service geography is not configured for merchant location confirmation';
  end if;

  if not v_inside_service_area then
    raise exception 'merchant mapped point is outside the configured service area';
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
