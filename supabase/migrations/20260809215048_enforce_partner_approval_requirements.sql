create or replace function public.submit_courier_application(_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_existing public.couriers;
  v_id uuid;
  v_cpf text := regexp_replace(coalesce(_payload->>'cpf',''),'\D','','g');
  v_birth_date date;
  v_address jsonb := coalesce(_payload->'address','{}'::jsonb);
  v_vehicle_type text := lower(nullif(btrim(_payload->>'vehicle_type'),''));
  v_vehicle_model text := nullif(btrim(_payload->>'vehicle_model'),'');
  v_vehicle_plate text := upper(nullif(regexp_replace(coalesce(_payload->>'vehicle_plate',''),'[^A-Za-z0-9]','','g'),''));
  v_cnh_number text := nullif(regexp_replace(coalesce(_payload->>'cnh_number',''),'\D','','g'),'');
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id=v_user_id and p.is_active=true) then
    raise exception 'active profile required';
  end if;
  if length(v_cpf) <> 11 then raise exception 'invalid cpf'; end if;
  begin
    v_birth_date := nullif(_payload->>'birth_date','')::date;
  exception when others then
    raise exception 'invalid birth date';
  end;
  if v_birth_date is null then raise exception 'birth date required'; end if;
  if v_birth_date >= current_date then raise exception 'invalid birth date'; end if;
  if nullif(btrim(v_address->>'street'),'') is null
     or nullif(btrim(v_address->>'number'),'') is null
     or nullif(btrim(v_address->>'neighborhood'),'') is null
     or nullif(btrim(v_address->>'city'),'') is null
     or length(btrim(coalesce(v_address->>'state',''))) <> 2 then
    raise exception 'complete address required';
  end if;
  if v_vehicle_type not in ('moto','carro','bicicleta') then raise exception 'invalid vehicle type'; end if;
  if v_vehicle_model is null then raise exception 'vehicle model required'; end if;
  if v_vehicle_type in ('moto','carro') then
    if v_vehicle_plate is null or length(v_vehicle_plate) <> 7 then raise exception 'valid vehicle plate required'; end if;
    if v_cnh_number is null or length(v_cnh_number) <> 11 then raise exception 'valid cnh required'; end if;
  end if;

  select * into v_existing from public.couriers c where c.user_id=v_user_id for update;
  if found and v_existing.status in ('approved','blocked') then raise exception 'courier application cannot be changed'; end if;

  if found then
    update public.couriers set
      cpf=v_cpf,
      birth_date=v_birth_date,
      address=v_address,
      vehicle_type=v_vehicle_type,
      vehicle_model=v_vehicle_model,
      vehicle_plate=case when v_vehicle_type='bicicleta' then null else v_vehicle_plate end,
      cnh_number=case when v_vehicle_type='bicicleta' then null else v_cnh_number end,
      pix_key=nullif(btrim(_payload->>'pix_key'),''),
      photo_url=nullif(btrim(_payload->>'photo_url'),''),
      status='under_review',
      rejection_reason=null,
      approved_by=null,
      approved_at=null,
      is_active=true
    where id=v_existing.id
    returning id into v_id;
  else
    insert into public.couriers(
      user_id,cpf,birth_date,address,vehicle_type,vehicle_model,vehicle_plate,cnh_number,pix_key,photo_url,
      status,is_active,rejection_reason,approved_by,approved_at
    ) values (
      v_user_id,v_cpf,v_birth_date,v_address,v_vehicle_type,v_vehicle_model,
      case when v_vehicle_type='bicicleta' then null else v_vehicle_plate end,
      case when v_vehicle_type='bicicleta' then null else v_cnh_number end,
      nullif(btrim(_payload->>'pix_key'),''),nullif(btrim(_payload->>'photo_url'),''),
      'under_review',true,null,null,null
    ) returning id into v_id;
  end if;

  update public.courier_documents
  set status='pending',rejection_reason=null,reviewed_by=null,reviewed_at=null
  where courier_id=v_id and status='rejected';
  return v_id;
end;
$function$;

create or replace function public.admin_review_courier(_courier_id uuid, _status text, _reason text default null::text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_user_id uuid;
  v_vehicle_type text;
  v_vehicle_plate text;
  v_cnh_number text;
begin
  if not public.current_user_is_admin() then raise exception 'admin access required'; end if;
  if _status not in ('under_review','approved','rejected','blocked') then raise exception 'invalid courier review status'; end if;
  select to_jsonb(c),c.user_id,c.vehicle_type,c.vehicle_plate,c.cnh_number
    into v_before,v_user_id,v_vehicle_type,v_vehicle_plate,v_cnh_number
  from public.couriers c where c.id=_courier_id;
  if v_before is null then raise exception 'courier not found'; end if;

  if _status='approved' then
    if v_vehicle_type in ('moto','carro') and (nullif(btrim(v_vehicle_plate),'') is null or nullif(btrim(v_cnh_number),'') is null) then
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

  update public.couriers as c
  set status=_status,
      rejection_reason=case when _status in ('rejected','blocked') then nullif(btrim(_reason),'') else null end,
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
    update public.courier_availability set is_online=false,online_since=null where courier_id=_courier_id;
  end if;
  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  values((select auth.uid()),'review_courier','courier',_courier_id::text,v_before,v_after);
end;
$function$;

create or replace function public.admin_review_merchant(_merchant_id uuid, _status text, _reason text default null::text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not public.current_user_is_admin() then raise exception 'admin access required'; end if;
  if _status not in ('under_review','approved','rejected','blocked') then raise exception 'invalid merchant review status'; end if;
  select to_jsonb(m) into v_before from public.merchants m where m.id=_merchant_id;
  if v_before is null then raise exception 'merchant not found'; end if;

  if _status='approved' then
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

revoke execute on function public.submit_courier_application(jsonb) from anon;
revoke execute on function public.admin_review_courier(uuid,text,text) from anon;
revoke execute on function public.admin_review_merchant(uuid,text,text) from anon;
grant execute on function public.submit_courier_application(jsonb) to authenticated;
grant execute on function public.admin_review_courier(uuid,text,text) to authenticated;
grant execute on function public.admin_review_merchant(uuid,text,text) to authenticated;