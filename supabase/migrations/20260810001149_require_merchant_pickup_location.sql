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

  if v_merchant.latitude is null or v_merchant.longitude is null then
    return query select false,'merchant_location_required'::text,null::uuid,0::numeric,v_merchant.minimum_order,null::numeric;
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
  elsif v_city.default_delivery_radius_km is not null then
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

  if v_distance is null and v_lat is not null and v_lon is not null then
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

revoke all on function public.resolve_delivery_quote(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.resolve_delivery_quote(uuid,jsonb) to service_role;

create or replace function public.ensure_delivery_job(_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_merchant public.merchants;
  v_job_id uuid;
  v_random bytea;
  v_pin_number integer;
  v_pin text;
begin
  select * into v_order from public.orders o where o.id=_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.fulfillment_type<>'delivery' then return null; end if;

  select * into v_merchant from public.merchants m where m.id=v_order.merchant_id;
  if not found then raise exception 'merchant not found'; end if;
  if v_merchant.latitude is null or v_merchant.longitude is null then
    raise exception 'merchant pickup location required';
  end if;

  select dj.id into v_job_id from public.delivery_jobs dj where dj.order_id=_order_id;
  if v_job_id is not null then return v_job_id; end if;

  insert into public.delivery_jobs(
    order_id,merchant_id,status,pickup_address,delivery_address,
    pickup_latitude,pickup_longitude,delivery_latitude,delivery_longitude,estimated_earnings
  ) values(
    v_order.id,v_order.merchant_id,'searching',
    jsonb_build_object('name',v_merchant.name,'address_line',v_merchant.address_line,'neighborhood',v_merchant.neighborhood,'city',v_merchant.city,'state',v_merchant.state),
    v_order.delivery_address,
    v_merchant.latitude,v_merchant.longitude,
    case when (v_order.delivery_address->>'latitude') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_order.delivery_address->>'latitude')::numeric else null end,
    case when (v_order.delivery_address->>'longitude') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_order.delivery_address->>'longitude')::numeric else null end,
    v_order.delivery_fee
  ) returning id into v_job_id;

  v_random:=extensions.gen_random_bytes(2);
  v_pin_number:=((get_byte(v_random,0)*256)+get_byte(v_random,1))%10000;
  v_pin:=lpad(v_pin_number::text,4,'0');
  insert into public.delivery_confirmation_secrets(order_id,pin_code)
  values(v_order.id,v_pin) on conflict(order_id) do nothing;

  insert into public.delivery_events(delivery_job_id,event_type,to_status,metadata)
  values(v_job_id,'job_created','searching',jsonb_build_object('order_id',v_order.id));
  update public.orders set status='searching_driver' where id=v_order.id;
  insert into public.order_status_history(order_id,status,changed_by_user_id)
  values(v_order.id,'searching_driver',(select auth.uid()));
  return v_job_id;
end;
$function$;

revoke all on function public.ensure_delivery_job(uuid) from public, anon, authenticated;
grant execute on function public.ensure_delivery_job(uuid) to service_role;

create or replace function public.admin_review_merchant(_merchant_id uuid, _status text, _reason text default null::text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_latitude numeric;
  v_longitude numeric;
begin
  if not public.current_user_is_admin() then raise exception 'admin access required'; end if;
  if _status not in ('under_review','approved','rejected','blocked') then raise exception 'invalid merchant review status'; end if;
  select to_jsonb(m),m.latitude,m.longitude into v_before,v_latitude,v_longitude
  from public.merchants m where m.id=_merchant_id;
  if v_before is null then raise exception 'merchant not found'; end if;

  if _status='approved' then
    if v_latitude is null or v_longitude is null then
      raise exception 'merchant pickup location is required before approval';
    end if;
    if not exists (
      select 1 from public.merchant_documents d
      where d.merchant_id=_merchant_id and d.document_type='documento_empresa' and d.status='approved'
    ) then raise exception 'approved company document is required'; end if;
    if not exists (
      select 1 from public.merchant_documents d
      where d.merchant_id=_merchant_id and d.document_type='responsavel' and d.status='approved'
    ) then raise exception 'approved responsible person document is required'; end if;
    if not exists (
      select 1 from public.merchant_documents d
      where d.merchant_id=_merchant_id and d.document_type='comprovante_endereco' and d.status='approved'
    ) then raise exception 'approved address proof is required'; end if;
  end if;

  update public.merchants as m
  set approval_status=_status,
      rejection_reason=case when _status in ('rejected','blocked') then nullif(btrim(_reason),'') else null end,
      approved_at=case when _status='approved' then now() else m.approved_at end,
      approved_by=case when _status='approved' then (select auth.uid()) else m.approved_by end,
      is_active=case when _status='approved' then true when _status in ('rejected','blocked') then false else m.is_active end,
      is_open=case when _status='approved' then true when _status in ('rejected','blocked') then false else m.is_open end
  where m.id=_merchant_id
  returning to_jsonb(m) into v_after;

  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  values((select auth.uid()),'review_merchant','merchant',_merchant_id::text,v_before,v_after);
end;
$function$;

revoke all on function public.admin_review_merchant(uuid,text,text) from public, anon;
grant execute on function public.admin_review_merchant(uuid,text,text) to authenticated, service_role;
