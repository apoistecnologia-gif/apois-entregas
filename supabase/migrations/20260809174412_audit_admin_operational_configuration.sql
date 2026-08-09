create or replace function public.admin_update_fee_rule(
  _fee_rule_id uuid,
  _merchant_commission_percent numeric,
  _courier_base_fee numeric,
  _courier_per_km numeric,
  _courier_minimum_fee numeric,
  _customer_service_fee numeric
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception 'admin access required';
  end if;

  if _merchant_commission_percent is null
    or _merchant_commission_percent < 0
    or _merchant_commission_percent > 100 then
    raise exception 'invalid merchant commission';
  end if;

  if _courier_base_fee is null or _courier_base_fee < 0
    or _courier_per_km is null or _courier_per_km < 0
    or _courier_minimum_fee is null or _courier_minimum_fee < 0
    or _customer_service_fee is null or _customer_service_fee < 0 then
    raise exception 'invalid fee value';
  end if;

  select to_jsonb(f)
  into v_before
  from public.fee_rules f
  where f.id = _fee_rule_id
  for update;

  if v_before is null then
    raise exception 'fee rule not found';
  end if;

  update public.fee_rules f
  set
    merchant_commission_percent = _merchant_commission_percent,
    courier_base_fee = _courier_base_fee,
    courier_per_km = _courier_per_km,
    courier_minimum_fee = _courier_minimum_fee,
    customer_service_fee = _customer_service_fee,
    updated_at = now()
  where f.id = _fee_rule_id
  returning to_jsonb(f) into v_after;

  insert into public.admin_audit_logs(
    admin_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) values (
    (select auth.uid()),
    'update_fee_rule',
    'fee_rule',
    _fee_rule_id::text,
    v_before,
    v_after
  );
end;
$function$;

create or replace function public.admin_update_platform_setting(
  _key text,
  _value jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_key text := btrim(coalesce(_key, ''));
begin
  if not public.current_user_is_admin() then
    raise exception 'admin access required';
  end if;

  if v_key = '' then
    raise exception 'invalid setting key';
  end if;

  if _value is null then
    raise exception 'setting value is required';
  end if;

  select to_jsonb(s)
  into v_before
  from public.platform_settings s
  where s.key = v_key
  for update;

  if v_before is null then
    raise exception 'setting not found';
  end if;

  update public.platform_settings s
  set
    value = _value,
    updated_by = (select auth.uid()),
    updated_at = now()
  where s.key = v_key
  returning to_jsonb(s) into v_after;

  insert into public.admin_audit_logs(
    admin_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) values (
    (select auth.uid()),
    'update_platform_setting',
    'platform_setting',
    v_key,
    v_before,
    v_after
  );
end;
$function$;

revoke all on function public.admin_update_fee_rule(uuid,numeric,numeric,numeric,numeric,numeric) from public;
revoke all on function public.admin_update_fee_rule(uuid,numeric,numeric,numeric,numeric,numeric) from anon;
grant execute on function public.admin_update_fee_rule(uuid,numeric,numeric,numeric,numeric,numeric) to authenticated;

revoke all on function public.admin_update_platform_setting(text,jsonb) from public;
revoke all on function public.admin_update_platform_setting(text,jsonb) from anon;
grant execute on function public.admin_update_platform_setting(text,jsonb) to authenticated;
