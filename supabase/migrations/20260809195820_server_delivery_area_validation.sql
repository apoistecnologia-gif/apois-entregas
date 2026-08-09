create or replace function public.haversine_km(
  p_lat1 numeric,
  p_lon1 numeric,
  p_lat2 numeric,
  p_lon2 numeric
)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select case
    when p_lat1 is null or p_lon1 is null or p_lat2 is null or p_lon2 is null then null
    else 6371::numeric * 2 * asin(
      least(
        1::numeric,
        sqrt(
          power(sin(radians((p_lat2 - p_lat1)::double precision) / 2), 2)
          + cos(radians(p_lat1::double precision))
          * cos(radians(p_lat2::double precision))
          * power(sin(radians((p_lon2 - p_lon1)::double precision) / 2), 2)
        )::numeric
      )::double precision
    )::numeric
  end;
$function$;

create or replace function public.point_in_geojson_ring(
  p_lat numeric,
  p_lon numeric,
  p_ring jsonb
)
returns boolean
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_count integer;
  v_i integer;
  v_j integer;
  v_xi numeric;
  v_yi numeric;
  v_xj numeric;
  v_yj numeric;
  v_inside boolean := false;
begin
  if p_lat is null or p_lon is null or p_ring is null or jsonb_typeof(p_ring) <> 'array' then
    return false;
  end if;

  v_count := jsonb_array_length(p_ring);
  if v_count < 3 then return false; end if;

  v_j := v_count - 1;
  for v_i in 0..v_count - 1 loop
    begin
      v_xi := (p_ring->v_i->>0)::numeric;
      v_yi := (p_ring->v_i->>1)::numeric;
      v_xj := (p_ring->v_j->>0)::numeric;
      v_yj := (p_ring->v_j->>1)::numeric;
    exception when others then
      return false;
    end;

    if ((v_yi > p_lat) <> (v_yj > p_lat))
       and p_lon < ((v_xj - v_xi) * (p_lat - v_yi) / nullif(v_yj - v_yi, 0) + v_xi) then
      v_inside := not v_inside;
    end if;
    v_j := v_i;
  end loop;

  return v_inside;
end;
$function$;

create or replace function public.point_in_geojson_polygon(
  p_lat numeric,
  p_lon numeric,
  p_polygon jsonb
)
returns boolean
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_index integer;
begin
  if p_polygon is null or jsonb_typeof(p_polygon) <> 'array' or jsonb_array_length(p_polygon) = 0 then
    return false;
  end if;

  if not public.point_in_geojson_ring(p_lat, p_lon, p_polygon->0) then
    return false;
  end if;

  if jsonb_array_length(p_polygon) > 1 then
    for v_index in 1..jsonb_array_length(p_polygon) - 1 loop
      if public.point_in_geojson_ring(p_lat, p_lon, p_polygon->v_index) then
        return false;
      end if;
    end loop;
  end if;

  return true;
end;
$function$;

create or replace function public.delivery_zone_contains_point(
  p_zone_id uuid,
  p_lat numeric,
  p_lon numeric
)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_zone public.delivery_zones;
  v_geometry jsonb;
  v_type text;
  v_index integer;
begin
  select * into v_zone from public.delivery_zones dz where dz.id = p_zone_id;
  if not found or not v_zone.is_active or p_lat is null or p_lon is null then return false; end if;

  if v_zone.radius_km is not null
     and v_zone.center_latitude is not null
     and v_zone.center_longitude is not null
     and public.haversine_km(v_zone.center_latitude, v_zone.center_longitude, p_lat, p_lon) <= v_zone.radius_km then
    return true;
  end if;

  if v_zone.geojson is null then return false; end if;
  v_geometry := case
    when v_zone.geojson->>'type' = 'Feature' then v_zone.geojson->'geometry'
    else v_zone.geojson
  end;
  v_type := v_geometry->>'type';

  if v_type = 'Polygon' then
    return public.point_in_geojson_polygon(p_lat, p_lon, v_geometry->'coordinates');
  elsif v_type = 'MultiPolygon' then
    if jsonb_typeof(v_geometry->'coordinates') <> 'array' then return false; end if;
    for v_index in 0..jsonb_array_length(v_geometry->'coordinates') - 1 loop
      if public.point_in_geojson_polygon(p_lat, p_lon, v_geometry->'coordinates'->v_index) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$function$;

revoke all on function public.haversine_km(numeric,numeric,numeric,numeric) from public;
revoke all on function public.point_in_geojson_ring(numeric,numeric,jsonb) from public;
revoke all on function public.point_in_geojson_polygon(numeric,numeric,jsonb) from public;
revoke all on function public.delivery_zone_contains_point(uuid,numeric,numeric) from public;
grant execute on function public.haversine_km(numeric,numeric,numeric,numeric) to authenticated, service_role;
grant execute on function public.delivery_zone_contains_point(uuid,numeric,numeric) to authenticated, service_role;

create or replace function public.resolve_delivery_quote(
  p_merchant_id uuid,
  p_delivery_address jsonb
)
returns table(
  eligible boolean,
  reason text,
  zone_id uuid,
  delivery_fee numeric,
  minimum_order numeric,
  distance_km numeric
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_merchant public.merchants;
  v_city public.cities;
  v_zone public.delivery_zones;
  v_lat numeric;
  v_lon numeric;
  v_address_city text;
  v_address_state text;
  v_zone_count integer;
  v_distance numeric;
begin
  if p_delivery_address is null or jsonb_typeof(p_delivery_address) <> 'object' then
    return query select false,'invalid_address'::text,null::uuid,0::numeric,0::numeric,null::numeric;
    return;
  end if;

  select * into v_merchant from public.merchants m where m.id = p_merchant_id;
  if not found or not v_merchant.is_active or v_merchant.approval_status <> 'approved' or not v_merchant.delivery_enabled then
    return query select false,'merchant_unavailable'::text,null::uuid,0::numeric,0::numeric,null::numeric;
    return;
  end if;

  if v_merchant.city_id is not null then
    select * into v_city from public.cities c where c.id = v_merchant.city_id;
  else
    select * into v_city
    from public.cities c
    where lower(btrim(c.name)) = lower(btrim(coalesce(v_merchant.city,'')))
      and upper(btrim(c.state)) = upper(btrim(coalesce(v_merchant.state,'')))
    order by c.is_active desc,c.created_at
    limit 1;
  end if;

  if v_city.id is null or not v_city.is_active then
    return query select false,'city_unavailable'::text,null::uuid,0::numeric,v_merchant.minimum_order,null::numeric;
    return;
  end if;

  v_address_city := nullif(btrim(p_delivery_address->>'city'),'');
  v_address_state := nullif(upper(btrim(p_delivery_address->>'state')),'');
  if v_address_city is null or v_address_state is null
     or lower(v_address_city) <> lower(btrim(v_city.name))
     or v_address_state <> upper(btrim(v_city.state)) then
    return query select false,'outside_served_city'::text,null::uuid,0::numeric,v_merchant.minimum_order,null::numeric;
    return;
  end if;

  if coalesce(p_delivery_address->>'latitude','') ~ '^-?[0-9]+(\.[0-9]+)?$' then
    v_lat := (p_delivery_address->>'latitude')::numeric;
  end if;
  if coalesce(p_delivery_address->>'longitude','') ~ '^-?[0-9]+(\.[0-9]+)?$' then
    v_lon := (p_delivery_address->>'longitude')::numeric;
  end if;
  if v_lat is not null and (v_lat < -90 or v_lat > 90) then v_lat := null; end if;
  if v_lon is not null and (v_lon < -180 or v_lon > 180) then v_lon := null; end if;

  select count(*) into v_zone_count
  from public.delivery_zones dz
  where dz.city_id = v_city.id and dz.is_active = true;

  if v_zone_count > 0 then
    if v_lat is null or v_lon is null then
      return query select false,'coordinates_required'::text,null::uuid,0::numeric,v_merchant.minimum_order,null::numeric;
      return;
    end if;

    select dz.* into v_zone
    from public.delivery_zones dz
    where dz.city_id = v_city.id
      and dz.is_active = true
      and public.delivery_zone_contains_point(dz.id,v_lat,v_lon)
    order by coalesce(dz.radius_km,999999::numeric),dz.created_at
    limit 1;

    if not found then
      return query select false,'outside_delivery_zone'::text,null::uuid,0::numeric,v_merchant.minimum_order,null::numeric;
      return;
    end if;
  elsif v_merchant.latitude is not null
        and v_merchant.longitude is not null
        and v_city.default_delivery_radius_km is not null then
    if v_lat is null or v_lon is null then
      return query select false,'coordinates_required'::text,null::uuid,0::numeric,v_merchant.minimum_order,null::numeric;
      return;
    end if;
    v_distance := public.haversine_km(v_merchant.latitude,v_merchant.longitude,v_lat,v_lon);
    if v_distance > v_city.default_delivery_radius_km then
      return query select false,'outside_default_radius'::text,null::uuid,0::numeric,v_merchant.minimum_order,v_distance;
      return;
    end if;
  end if;

  if v_distance is null and v_lat is not null and v_lon is not null
     and v_merchant.latitude is not null and v_merchant.longitude is not null then
    v_distance := public.haversine_km(v_merchant.latitude,v_merchant.longitude,v_lat,v_lon);
  end if;

  return query select
    true,
    'ok'::text,
    v_zone.id,
    coalesce(v_zone.delivery_fee,v_merchant.delivery_fee,0),
    greatest(coalesce(v_merchant.minimum_order,0),coalesce(v_zone.minimum_order,0)),
    v_distance;
end;
$function$;

revoke all on function public.resolve_delivery_quote(uuid,jsonb) from public;
grant execute on function public.resolve_delivery_quote(uuid,jsonb) to service_role;

create or replace function public.preview_delivery_quote(
  p_merchant_id uuid,
  p_delivery_address jsonb
)
returns table(
  eligible boolean,
  reason text,
  zone_id uuid,
  delivery_fee numeric,
  minimum_order numeric,
  distance_km numeric
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if (select auth.uid()) is null or not public.current_user_is_active() then
    raise exception 'active account required';
  end if;
  return query select * from public.resolve_delivery_quote(p_merchant_id,p_delivery_address);
end;
$function$;

revoke all on function public.preview_delivery_quote(uuid,jsonb) from public;
grant execute on function public.preview_delivery_quote(uuid,jsonb) to authenticated;

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='create_order_atomic_v2'
    and pg_get_function_identity_arguments(p.oid)='p_customer_user_id uuid, p_merchant_id uuid, p_items jsonb, p_payment_method text, p_delivery_address jsonb, p_request_key uuid, p_fulfillment_type text, p_coupon_code text, p_observation text';

  if v_definition is null then raise exception 'create_order_atomic_v2 definition not found'; end if;

  v_definition := replace(
    v_definition,
    '  v_user_uses bigint;\n',
    '  v_user_uses bigint;\n  v_delivery_quote record;\n'
  );

  v_definition := replace(
    v_definition,
    '  if p_fulfillment_type=''delivery'' and not v_merchant.delivery_enabled then raise exception ''delivery is unavailable''; end if;\n  if p_fulfillment_type=''pickup'' and not v_merchant.pickup_enabled then raise exception ''pickup is unavailable''; end if;\n\n  select created.order_id,created.order_number into v_order_id,v_order_number',
    '  if p_fulfillment_type=''delivery'' and not v_merchant.delivery_enabled then raise exception ''delivery is unavailable''; end if;\n  if p_fulfillment_type=''pickup'' and not v_merchant.pickup_enabled then raise exception ''pickup is unavailable''; end if;\n\n  if p_fulfillment_type=''delivery'' then\n    select * into v_delivery_quote from public.resolve_delivery_quote(p_merchant_id,p_delivery_address);\n    if not coalesce(v_delivery_quote.eligible,false) then\n      raise exception ''delivery address unavailable: %'',coalesce(v_delivery_quote.reason,''unknown'');\n    end if;\n  end if;\n\n  select created.order_id,created.order_number into v_order_id,v_order_number'
  );

  v_definition := replace(
    v_definition,
    '  if v_subtotal < v_merchant.minimum_order then raise exception ''merchant minimum order not reached''; end if;\n  v_delivery_fee := case when p_fulfillment_type=''delivery'' then v_merchant.delivery_fee else 0 end;',
    '  if v_subtotal < greatest(v_merchant.minimum_order,case when p_fulfillment_type=''delivery'' then coalesce(v_delivery_quote.minimum_order,0) else 0 end) then raise exception ''merchant minimum order not reached''; end if;\n  v_delivery_fee := case when p_fulfillment_type=''delivery'' then coalesce(v_delivery_quote.delivery_fee,v_merchant.delivery_fee) else 0 end;'
  );

  execute v_definition;
end;
$migration$;
