-- The initial migration copied the customer delivery radius only as a temporary
-- bootstrap. That is not a valid business assumption: customer coverage and
-- courier-to-pickup search distance are independent controls. Clear those copied
-- values until an administrator explicitly configures dispatch coverage.
update public.cities
set courier_dispatch_radius_km = null,
    updated_at = now()
where courier_dispatch_radius_km = default_delivery_radius_km;

drop function if exists public.admin_create_city(text,text,text,numeric,boolean);
create function public.admin_create_city(
  _name text,
  _state text,
  _timezone text default 'America/Sao_Paulo',
  _default_delivery_radius_km numeric default 12,
  _is_active boolean default false,
  _courier_dispatch_radius_km numeric default null
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
  if _courier_dispatch_radius_km is not null and (_courier_dispatch_radius_km <= 0 or _courier_dispatch_radius_km > 100) then raise exception 'invalid courier dispatch radius'; end if;

  insert into public.cities(name,state,is_active,default_delivery_radius_km,courier_dispatch_radius_km,timezone)
  values(btrim(_name),upper(btrim(_state)),_is_active,_default_delivery_radius_km,_courier_dispatch_radius_km,v_timezone)
  returning id into v_city_id;

  select to_jsonb(c) into v_after from public.cities c where c.id=v_city_id;
  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,after_data)
  values((select auth.uid()),'create_city','city',v_city_id::text,v_after);
  return v_city_id;
end;
$function$;

revoke all on function public.admin_create_city(text,text,text,numeric,boolean,numeric) from public,anon;
grant execute on function public.admin_create_city(text,text,text,numeric,boolean,numeric) to authenticated;

drop function if exists public.admin_update_city(uuid,text,text,text,numeric,boolean);
create function public.admin_update_city(
  _city_id uuid,
  _name text,
  _state text,
  _timezone text,
  _default_delivery_radius_km numeric,
  _is_active boolean,
  _courier_dispatch_radius_km numeric default null
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
  if _courier_dispatch_radius_km is not null and (_courier_dispatch_radius_km <= 0 or _courier_dispatch_radius_km > 100) then raise exception 'invalid courier dispatch radius'; end if;

  select to_jsonb(c) into v_before from public.cities c where c.id=_city_id;
  if v_before is null then raise exception 'city not found'; end if;

  update public.cities
  set name=btrim(_name),
      state=upper(btrim(_state)),
      timezone=v_timezone,
      default_delivery_radius_km=_default_delivery_radius_km,
      courier_dispatch_radius_km=_courier_dispatch_radius_km,
      is_active=_is_active,
      updated_at=now()
  where id=_city_id;

  select to_jsonb(c) into v_after from public.cities c where c.id=_city_id;
  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  values((select auth.uid()),'update_city','city',_city_id::text,v_before,v_after);
end;
$function$;

revoke all on function public.admin_update_city(uuid,text,text,text,numeric,boolean,numeric) from public,anon;
grant execute on function public.admin_update_city(uuid,text,text,text,numeric,boolean,numeric) to authenticated;
