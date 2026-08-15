create or replace function public.admin_suspend_merchant(_merchant_id uuid, _suspended boolean, _reason text default null::text)
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
  select to_jsonb(m) into v_before from public.merchants m where m.id=_merchant_id;
  if v_before is null then raise exception 'merchant not found'; end if;
  if (v_before->>'approval_status') <> 'approved' then raise exception 'only approved merchants can be suspended or resumed'; end if;

  update public.merchants as m
  set is_active = not _suspended,
      is_open = case when _suspended then false else m.is_open end,
      rejection_reason = case when _suspended then nullif(btrim(_reason),'') else null end
  where m.id=_merchant_id
  returning to_jsonb(m) into v_after;

  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  values((select auth.uid()),case when _suspended then 'suspend_merchant' else 'resume_merchant' end,'merchant',_merchant_id::text,v_before,v_after);
end;
$function$;

create or replace function public.admin_delete_merchant(_merchant_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before jsonb;
  v_order_count bigint;
begin
  if not public.current_user_is_admin() then raise exception 'admin access required'; end if;
  select to_jsonb(m) into v_before from public.merchants m where m.id=_merchant_id;
  if v_before is null then raise exception 'merchant not found'; end if;

  select count(*) into v_order_count from public.orders o where o.merchant_id=_merchant_id;
  if v_order_count > 0 then
    raise exception 'merchant with order history cannot be deleted; block it instead';
  end if;

  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  values((select auth.uid()),'delete_merchant','merchant',_merchant_id::text,v_before,null);

  delete from public.merchants where id=_merchant_id;
end;
$function$;

revoke execute on function public.admin_suspend_merchant(uuid,boolean,text) from anon;
revoke execute on function public.admin_delete_merchant(uuid) from anon;
grant execute on function public.admin_suspend_merchant(uuid,boolean,text) to authenticated;
grant execute on function public.admin_delete_merchant(uuid) to authenticated;
