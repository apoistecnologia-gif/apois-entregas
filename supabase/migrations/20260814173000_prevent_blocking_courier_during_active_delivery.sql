create or replace function public.admin_set_user_active(
  _user_id uuid,
  _is_active boolean,
  _reason text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not public.current_user_is_admin() then raise exception 'admin access required'; end if;
  if _user_id=(select auth.uid()) and not _is_active then
    raise exception 'administrator cannot block own account';
  end if;
  if not _is_active and nullif(btrim(_reason),'') is null then
    raise exception 'block reason is required';
  end if;

  select to_jsonb(p) into v_before
  from public.profiles p
  where p.id=_user_id
  for update;
  if v_before is null then raise exception 'profile not found'; end if;

  if not _is_active and exists (
    select 1
    from public.delivery_jobs dj
    join public.couriers c on c.id=dj.courier_id
    where c.user_id=_user_id
      and dj.status in (
        'accepted','arriving_pickup','at_pickup','picked_up','on_the_way','arrived_destination'
      )
  ) then
    raise exception 'active delivery must be completed before blocking courier account';
  end if;

  update public.profiles p
  set is_active=_is_active,
      blocked_reason=case when _is_active then null else btrim(_reason) end
  where p.id=_user_id
  returning to_jsonb(p) into v_after;

  if not _is_active then
    update public.courier_availability a
    set is_online=false,online_since=null,last_seen_at=now()
    where a.courier_id in (select c.id from public.couriers c where c.user_id=_user_id);

    update public.courier_online_sessions s
    set ended_at=greatest(now(),s.started_at),updated_at=now()
    where s.courier_id in (select c.id from public.couriers c where c.user_id=_user_id)
      and s.ended_at is null;
  end if;

  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  values(
    (select auth.uid()),
    case when _is_active then 'unblock_user' else 'block_user' end,
    'profile',
    _user_id::text,
    v_before,
    v_after
  );
end;
$$;

create or replace function public.admin_review_courier(
  _courier_id uuid,
  _status text,
  _reason text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_user_id uuid;
  v_vehicle_type text;
  v_vehicle_plate text;
  v_cnh_number text;
begin
  if not public.current_user_is_admin() then raise exception 'admin access required'; end if;
  if _status not in ('under_review','approved','rejected','blocked') then
    raise exception 'invalid courier review status';
  end if;
  if _status in ('rejected','blocked') and nullif(btrim(_reason),'') is null then
    raise exception 'review reason is required';
  end if;

  select to_jsonb(c),c.user_id,c.vehicle_type,c.vehicle_plate,c.cnh_number
    into v_before,v_user_id,v_vehicle_type,v_vehicle_plate,v_cnh_number
  from public.couriers c
  where c.id=_courier_id
  for update;
  if v_before is null then raise exception 'courier not found'; end if;

  if _status in ('under_review','rejected','blocked') and exists (
    select 1
    from public.delivery_jobs dj
    where dj.courier_id=_courier_id
      and dj.status in (
        'accepted','arriving_pickup','at_pickup','picked_up','on_the_way','arrived_destination'
      )
  ) then
    raise exception 'active delivery must be completed before changing courier eligibility';
  end if;

  if _status='approved' then
    if v_vehicle_type in ('moto','carro')
       and (nullif(btrim(v_vehicle_plate),'') is null or nullif(btrim(v_cnh_number),'') is null) then
      raise exception 'motorized courier requires plate and cnh before approval';
    end if;
    if not exists (
      select 1 from public.courier_documents d
      where d.courier_id=_courier_id and d.document_type='foto_perfil' and d.status='approved'
    ) then raise exception 'approved courier photo is required'; end if;
    if v_vehicle_type in ('moto','carro') and not exists (
      select 1 from public.courier_documents d
      where d.courier_id=_courier_id and d.document_type='cnh' and d.status='approved'
    ) then raise exception 'approved cnh document is required'; end if;
    if v_vehicle_type in ('moto','carro') and not exists (
      select 1 from public.courier_documents d
      where d.courier_id=_courier_id and d.document_type='documento_veiculo' and d.status='approved'
    ) then raise exception 'approved vehicle document is required'; end if;
  end if;

  update public.couriers c
  set status=_status,
      rejection_reason=case when _status in ('rejected','blocked') then btrim(_reason) else null end,
      approved_at=case when _status='approved' then now() else c.approved_at end,
      approved_by=case when _status='approved' then (select auth.uid()) else c.approved_by end,
      is_active=case when _status='approved' then true when _status='blocked' then false else c.is_active end
  where c.id=_courier_id
  returning to_jsonb(c) into v_after;

  if _status='approved' then
    insert into public.user_roles(user_id,role)
    values(v_user_id,'driver'::public.app_role)
    on conflict(user_id,role) do nothing;
  end if;

  if _status<>'approved' then
    update public.courier_availability
    set is_online=false,online_since=null,last_seen_at=now()
    where courier_id=_courier_id;

    update public.courier_online_sessions
    set ended_at=greatest(now(),started_at),updated_at=now()
    where courier_id=_courier_id and ended_at is null;
  end if;

  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  values((select auth.uid()),'review_courier','courier',_courier_id::text,v_before,v_after);
end;
$$;

revoke all on function public.admin_set_user_active(uuid,boolean,text) from public, anon;
grant execute on function public.admin_set_user_active(uuid,boolean,text) to authenticated, service_role;

revoke all on function public.admin_review_courier(uuid,text,text) from public, anon;
grant execute on function public.admin_review_courier(uuid,text,text) to authenticated, service_role;
