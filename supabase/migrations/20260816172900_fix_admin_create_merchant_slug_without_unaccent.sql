create or replace function public.admin_create_merchant(
  _owner_user_id uuid,
  _category_id uuid,
  _name text,
  _legal_name text,
  _document text,
  _contact_phone text,
  _contact_email text,
  _address_line text,
  _neighborhood text,
  _city text,
  _state text,
  _latitude numeric default null,
  _longitude numeric default null,
  _approve boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_slug text;
  v_status text := case when _approve then 'approved' else 'under_review' end;
  v_now timestamptz := now();
begin
  if not public.current_user_is_admin() then
    raise exception 'admin access required';
  end if;
  if _owner_user_id is null or not exists (select 1 from public.profiles p where p.id = _owner_user_id) then
    raise exception 'owner profile not found';
  end if;
  if not exists (select 1 from public.merchant_categories c where c.id = _category_id and c.is_active = true) then
    raise exception 'invalid merchant category';
  end if;
  if nullif(btrim(_name),'') is null then raise exception 'merchant name is required'; end if;
  if exists (
    select 1 from public.merchant_members mm
    join public.merchants m on m.id = mm.merchant_id
    where mm.user_id = _owner_user_id and mm.role = 'owner' and mm.status = 'active'
      and m.approval_status not in ('rejected','blocked')
  ) then
    raise exception 'owner already has an active merchant';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(btrim(_name)), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'estabelecimento'; end if;
  v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

  insert into public.merchants(
    owner_user_id, category_id, name, slug, legal_name, document, contact_phone, contact_email,
    address_line, neighborhood, city, state, latitude, longitude,
    approval_status, is_active, temporarily_closed, approved_by, approved_at
  ) values (
    _owner_user_id, _category_id, btrim(_name), v_slug,
    nullif(btrim(_legal_name),''), nullif(regexp_replace(coalesce(_document,''),'\D','','g'),''),
    nullif(btrim(_contact_phone),''), nullif(btrim(_contact_email),''),
    nullif(btrim(_address_line),''), nullif(btrim(_neighborhood),''), nullif(btrim(_city),''), upper(nullif(btrim(_state),'')),
    _latitude, _longitude, v_status, _approve, false,
    case when _approve then (select auth.uid()) else null end,
    case when _approve then v_now else null end
  ) returning id into v_id;

  insert into public.merchant_members(merchant_id,user_id,role,status)
  values(v_id,_owner_user_id,'owner','active');

  insert into public.user_roles(user_id,role)
  values(_owner_user_id,'merchant'::public.app_role)
  on conflict(user_id,role) do nothing;

  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  values((select auth.uid()),'admin_create_merchant','merchant',v_id::text,null,
    jsonb_build_object('owner_user_id',_owner_user_id,'name',btrim(_name),'approval_status',v_status,'is_active',_approve));

  return v_id;
end;
$$;

grant execute on function public.admin_create_merchant(uuid,uuid,text,text,text,text,text,text,text,text,text,numeric,numeric,boolean) to authenticated;
