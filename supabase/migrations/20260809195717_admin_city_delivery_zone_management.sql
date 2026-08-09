create or replace function public.admin_create_city(
  _name text,
  _state text,
  _timezone text default 'America/Sao_Paulo',
  _default_delivery_radius_km numeric default 12,
  _is_active boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_city_id uuid;
  v_after jsonb;
  v_timezone text := coalesce(nullif(btrim(_timezone),''),'America/Sao_Paulo');
begin
  if not public.current_user_is_admin() then raise exception 'admin access required'; end if;
  if nullif(btrim(_name),'') is null then raise exception 'city name is required'; end if;
  if nullif(btrim(_state),'') is null or length(btrim(_state)) <> 2 then raise exception 'state must have 2 characters'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_timezone) then raise exception 'invalid timezone'; end if;
  if _default_delivery_radius_km is null or _default_delivery_radius_km <= 0 or _default_delivery_radius_km > 500 then raise exception 'invalid delivery radius'; end if;

  insert into public.cities(name,state,is_active,default_delivery_radius_km,timezone)
  values(btrim(_name),upper(btrim(_state)),_is_active,_default_delivery_radius_km,v_timezone)
  returning id into v_city_id;

  select to_jsonb(c) into v_after from public.cities c where c.id=v_city_id;
  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,after_data)
  values((select auth.uid()),'create_city','city',v_city_id::text,v_after);
  return v_city_id;
end;
$function$;

create or replace function public.admin_update_city(
  _city_id uuid,
  _name text,
  _state text,
  _timezone text,
  _default_delivery_radius_km numeric,
  _is_active boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_timezone text := coalesce(nullif(btrim(_timezone),''),'America/Sao_Paulo');
begin
  if not public.current_user_is_admin() then raise exception 'admin access required'; end if;
  if nullif(btrim(_name),'') is null then raise exception 'city name is required'; end if;
  if nullif(btrim(_state),'') is null or length(btrim(_state)) <> 2 then raise exception 'state must have 2 characters'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_timezone) then raise exception 'invalid timezone'; end if;
  if _default_delivery_radius_km is null or _default_delivery_radius_km <= 0 or _default_delivery_radius_km > 500 then raise exception 'invalid delivery radius'; end if;

  select to_jsonb(c) into v_before from public.cities c where c.id=_city_id;
  if v_before is null then raise exception 'city not found'; end if;

  update public.cities
  set name=btrim(_name),
      state=upper(btrim(_state)),
      timezone=v_timezone,
      default_delivery_radius_km=_default_delivery_radius_km,
      is_active=_is_active
  where id=_city_id;

  select to_jsonb(c) into v_after from public.cities c where c.id=_city_id;
  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  values((select auth.uid()),'update_city','city',_city_id::text,v_before,v_after);
end;
$function$;

create or replace function public.admin_upsert_delivery_zone(
  _zone_id uuid,
  _city_id uuid,
  _name text,
  _center_latitude numeric,
  _center_longitude numeric,
  _radius_km numeric,
  _geojson jsonb,
  _delivery_fee numeric,
  _minimum_order numeric,
  _is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid := coalesce(_zone_id,gen_random_uuid());
  v_before jsonb;
  v_after jsonb;
begin
  if not public.current_user_is_admin() then raise exception 'admin access required'; end if;
  if not exists(select 1 from public.cities c where c.id=_city_id) then raise exception 'city not found'; end if;
  if nullif(btrim(_name),'') is null then raise exception 'zone name is required'; end if;
  if _delivery_fee is null or _delivery_fee < 0 then raise exception 'invalid delivery fee'; end if;
  if _minimum_order is null or _minimum_order < 0 then raise exception 'invalid minimum order'; end if;

  if _geojson is null then
    if _center_latitude is null or _center_longitude is null or _radius_km is null then
      raise exception 'radial zone requires center and radius';
    end if;
    if _center_latitude not between -90 and 90 or _center_longitude not between -180 and 180 then
      raise exception 'invalid zone coordinates';
    end if;
    if _radius_km <= 0 or _radius_km > 500 then raise exception 'invalid zone radius'; end if;
  else
    if coalesce(_geojson->>'type','') not in ('Feature','Polygon','MultiPolygon') then
      raise exception 'unsupported geojson type';
    end if;
  end if;

  select to_jsonb(dz) into v_before from public.delivery_zones dz where dz.id=v_id;

  insert into public.delivery_zones(
    id,city_id,name,geojson,center_latitude,center_longitude,radius_km,delivery_fee,minimum_order,is_active
  ) values(
    v_id,_city_id,btrim(_name),_geojson,_center_latitude,_center_longitude,_radius_km,_delivery_fee,_minimum_order,_is_active
  )
  on conflict(id) do update
  set city_id=excluded.city_id,
      name=excluded.name,
      geojson=excluded.geojson,
      center_latitude=excluded.center_latitude,
      center_longitude=excluded.center_longitude,
      radius_km=excluded.radius_km,
      delivery_fee=excluded.delivery_fee,
      minimum_order=excluded.minimum_order,
      is_active=excluded.is_active;

  select to_jsonb(dz) into v_after from public.delivery_zones dz where dz.id=v_id;
  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  values((select auth.uid()),case when v_before is null then 'create_delivery_zone' else 'update_delivery_zone' end,'delivery_zone',v_id::text,v_before,v_after);
  return v_id;
end;
$function$;

create or replace function public.admin_delete_delivery_zone(_zone_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before jsonb;
begin
  if not public.current_user_is_admin() then raise exception 'admin access required'; end if;
  select to_jsonb(dz) into v_before from public.delivery_zones dz where dz.id=_zone_id;
  if v_before is null then raise exception 'delivery zone not found'; end if;
  delete from public.delivery_zones where id=_zone_id;
  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data)
  values((select auth.uid()),'delete_delivery_zone','delivery_zone',_zone_id::text,v_before);
end;
$function$;

revoke all on function public.admin_create_city(text,text,text,numeric,boolean) from public;
revoke all on function public.admin_update_city(uuid,text,text,text,numeric,boolean) from public;
revoke all on function public.admin_upsert_delivery_zone(uuid,uuid,text,numeric,numeric,numeric,jsonb,numeric,numeric,boolean) from public;
revoke all on function public.admin_delete_delivery_zone(uuid) from public;
grant execute on function public.admin_create_city(text,text,text,numeric,boolean) to authenticated;
grant execute on function public.admin_update_city(uuid,text,text,text,numeric,boolean) to authenticated;
grant execute on function public.admin_upsert_delivery_zone(uuid,uuid,text,numeric,numeric,numeric,jsonb,numeric,numeric,boolean) to authenticated;
grant execute on function public.admin_delete_delivery_zone(uuid) to authenticated;
