alter table public.cities
  add column if not exists timezone text not null default 'America/Sao_Paulo';

update public.merchants
set is_open = true
where is_active = true
  and approval_status = 'approved'
  and is_open = false;

create or replace function public.admin_review_merchant(_merchant_id uuid, _status text, _reason text default null::text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_before jsonb; v_after jsonb;
begin
  if not public.current_user_is_admin() then raise exception 'admin access required'; end if;
  if _status not in ('under_review','approved','rejected','blocked') then raise exception 'invalid merchant review status'; end if;
  select to_jsonb(m) into v_before from public.merchants m where m.id=_merchant_id;
  if v_before is null then raise exception 'merchant not found'; end if;
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

create or replace function public.merchant_accepting_orders(p_merchant_id uuid, p_at timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_active boolean;
  v_approval text;
  v_temporarily_closed boolean;
  v_city_active boolean;
  v_timezone text;
  v_local timestamp without time zone;
  v_today date;
  v_yesterday date;
  v_now_time time without time zone;
  v_weekday integer;
  v_yesterday_weekday integer;
  v_row record;
begin
  select m.is_active,
         m.approval_status,
         m.temporarily_closed,
         case when m.city_id is null then true else coalesce(c.is_active,false) end,
         coalesce(c.timezone,'America/Sao_Paulo')
    into v_active,v_approval,v_temporarily_closed,v_city_active,v_timezone
  from public.merchants m
  left join public.cities c on c.id=m.city_id
  where m.id=p_merchant_id;

  if not found or not v_active or v_approval <> 'approved' or v_temporarily_closed or not v_city_active then
    return false;
  end if;

  if not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_timezone) then
    v_timezone := 'America/Sao_Paulo';
  end if;

  v_local := p_at at time zone v_timezone;
  v_today := v_local::date;
  v_yesterday := v_today - 1;
  v_now_time := v_local::time;
  v_weekday := extract(dow from v_local)::integer;
  v_yesterday_weekday := (v_weekday + 6) % 7;

  select x.* into v_row
  from (
    select sh.is_closed,sh.opens_at,sh.closes_at,sh.second_opens_at,sh.second_closes_at,1 as priority
    from public.merchant_special_hours sh
    where sh.merchant_id=p_merchant_id and sh.service_date=v_yesterday
    union all
    select mh.is_closed,mh.opens_at,mh.closes_at,mh.second_opens_at,mh.second_closes_at,2
    from public.merchant_hours mh
    where mh.merchant_id=p_merchant_id and mh.weekday=v_yesterday_weekday
      and not exists(
        select 1 from public.merchant_special_hours sh
        where sh.merchant_id=p_merchant_id and sh.service_date=v_yesterday
      )
  ) x
  order by priority
  limit 1;

  if found and not v_row.is_closed then
    if v_row.opens_at is not null and v_row.closes_at is not null
       and v_row.closes_at < v_row.opens_at and v_now_time < v_row.closes_at then
      return true;
    end if;
    if v_row.second_opens_at is not null and v_row.second_closes_at is not null
       and v_row.second_closes_at < v_row.second_opens_at and v_now_time < v_row.second_closes_at then
      return true;
    end if;
  end if;

  v_row := null;
  select x.* into v_row
  from (
    select sh.is_closed,sh.opens_at,sh.closes_at,sh.second_opens_at,sh.second_closes_at,1 as priority
    from public.merchant_special_hours sh
    where sh.merchant_id=p_merchant_id and sh.service_date=v_today
    union all
    select mh.is_closed,mh.opens_at,mh.closes_at,mh.second_opens_at,mh.second_closes_at,2
    from public.merchant_hours mh
    where mh.merchant_id=p_merchant_id and mh.weekday=v_weekday
      and not exists(
        select 1 from public.merchant_special_hours sh
        where sh.merchant_id=p_merchant_id and sh.service_date=v_today
      )
  ) x
  order by priority
  limit 1;

  if not found or v_row.is_closed then return false; end if;

  if v_row.opens_at is not null and v_row.closes_at is not null then
    if (v_row.closes_at > v_row.opens_at and v_now_time >= v_row.opens_at and v_now_time < v_row.closes_at)
       or (v_row.closes_at < v_row.opens_at and v_now_time >= v_row.opens_at)
       or (v_row.closes_at = v_row.opens_at) then
      return true;
    end if;
  end if;

  if v_row.second_opens_at is not null and v_row.second_closes_at is not null then
    if (v_row.second_closes_at > v_row.second_opens_at and v_now_time >= v_row.second_opens_at and v_now_time < v_row.second_closes_at)
       or (v_row.second_closes_at < v_row.second_opens_at and v_now_time >= v_row.second_opens_at)
       or (v_row.second_closes_at = v_row.second_opens_at) then
      return true;
    end if;
  end if;

  return false;
end;
$function$;

revoke all on function public.merchant_accepting_orders(uuid,timestamptz) from public;
grant execute on function public.merchant_accepting_orders(uuid,timestamptz) to authenticated, service_role;

create or replace function public.preview_coupon(p_merchant_id uuid, p_code text, p_subtotal numeric)
returns table(coupon_id uuid, code text, discount_type text, discount_value numeric, discount_amount numeric)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_coupon public.coupons;
  v_total_uses bigint;
  v_user_uses bigint;
  v_discount numeric;
begin
  if v_user_id is null or not public.current_user_is_active() then raise exception 'active account required'; end if;
  if p_merchant_id is null then raise exception 'merchant_id is required'; end if;
  if p_code is null or btrim(p_code)='' then raise exception 'coupon code is required'; end if;
  if p_subtotal is null or p_subtotal < 0 then raise exception 'invalid subtotal'; end if;

  select c.* into v_coupon
  from public.coupons c
  where upper(c.code)=upper(btrim(p_code))
    and (c.merchant_id=p_merchant_id or c.merchant_id is null)
    and c.is_active=true
    and (c.starts_at is null or c.starts_at<=now())
    and (c.ends_at is null or c.ends_at>now())
  order by (c.merchant_id is null),c.created_at desc
  limit 1;

  if not found then raise exception 'coupon is invalid or expired'; end if;
  if p_subtotal < v_coupon.minimum_order then raise exception 'minimum order not reached for coupon'; end if;

  select count(*) into v_total_uses from public.coupon_redemptions r where r.coupon_id=v_coupon.id;
  if v_coupon.usage_limit is not null and v_total_uses>=v_coupon.usage_limit then raise exception 'coupon usage limit reached'; end if;
  select count(*) into v_user_uses from public.coupon_redemptions r where r.coupon_id=v_coupon.id and r.user_id=v_user_id;
  if v_coupon.usage_limit_per_user is not null and v_user_uses>=v_coupon.usage_limit_per_user then raise exception 'coupon already used maximum times'; end if;

  v_discount := case when v_coupon.discount_type='percent'
    then round((p_subtotal*v_coupon.discount_value/100.0)::numeric,2)
    else v_coupon.discount_value end;
  if v_coupon.max_discount is not null then v_discount:=least(v_discount,v_coupon.max_discount); end if;
  v_discount:=least(v_discount,p_subtotal);

  return query select v_coupon.id,v_coupon.code,v_coupon.discount_type,v_coupon.discount_value,v_discount;
end;
$function$;

revoke all on function public.preview_coupon(uuid,text,numeric) from public;
grant execute on function public.preview_coupon(uuid,text,numeric) to authenticated;

create or replace function public.create_order_atomic_v2(
  p_customer_user_id uuid,
  p_merchant_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_delivery_address jsonb,
  p_request_key uuid,
  p_fulfillment_type text default 'delivery',
  p_coupon_code text default null,
  p_observation text default null
)
returns table(order_id uuid, order_number bigint)
language plpgsql
set search_path to ''
as $function$
declare
  v_order_id uuid;
  v_order_number bigint;
  v_existing_customer uuid;
  v_merchant public.merchants;
  v_subtotal numeric;
  v_delivery_fee numeric;
  v_discount numeric := 0;
  v_total numeric;
  v_coupon public.coupons;
  v_total_uses bigint;
  v_user_uses bigint;
begin
  if p_customer_user_id is null then raise exception 'customer_user_id is required'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_customer_user_id and p.is_active=true) then raise exception 'active customer account required'; end if;
  if p_merchant_id is null then raise exception 'merchant_id is required'; end if;
  if p_request_key is null then raise exception 'request_key is required'; end if;
  if p_fulfillment_type not in ('delivery','pickup') then raise exception 'invalid fulfillment type'; end if;
  if p_delivery_address is null or jsonb_typeof(p_delivery_address)<>'object' then raise exception 'delivery_address must be a JSON object'; end if;
  if p_fulfillment_type='delivery' and p_delivery_address='{}'::jsonb then raise exception 'delivery address is required'; end if;

  select o.customer_user_id,o.id,o.order_number into v_existing_customer,v_order_id,v_order_number
  from public.orders o where o.request_key=p_request_key;
  if found then
    if v_existing_customer is distinct from p_customer_user_id then raise exception 'request_key already belongs to another customer'; end if;
    return query select v_order_id,v_order_number;
    return;
  end if;

  select * into v_merchant from public.merchants m where m.id=p_merchant_id;
  if not found or not v_merchant.is_active or v_merchant.approval_status<>'approved' then raise exception 'merchant is inactive'; end if;
  if v_merchant.temporarily_closed or not public.merchant_accepting_orders(p_merchant_id,now()) then raise exception 'merchant is closed'; end if;
  if p_fulfillment_type='delivery' and not v_merchant.delivery_enabled then raise exception 'delivery is unavailable'; end if;
  if p_fulfillment_type='pickup' and not v_merchant.pickup_enabled then raise exception 'pickup is unavailable'; end if;

  select created.order_id,created.order_number into v_order_id,v_order_number
  from public.create_order_atomic(
    p_customer_user_id,
    p_merchant_id,
    p_items,
    p_payment_method,
    case when p_fulfillment_type='pickup' then '{}'::jsonb else p_delivery_address end,
    p_request_key,
    p_observation
  ) created;

  select o.subtotal into v_subtotal from public.orders o where o.id=v_order_id for update;
  if v_subtotal < v_merchant.minimum_order then raise exception 'merchant minimum order not reached'; end if;
  v_delivery_fee := case when p_fulfillment_type='delivery' then v_merchant.delivery_fee else 0 end;

  if p_coupon_code is not null and btrim(p_coupon_code)<>'' then
    select c.* into v_coupon
    from public.coupons c
    where upper(c.code)=upper(btrim(p_coupon_code))
      and (c.merchant_id=p_merchant_id or c.merchant_id is null)
      and c.is_active=true
      and (c.starts_at is null or c.starts_at<=now())
      and (c.ends_at is null or c.ends_at>now())
    order by (c.merchant_id is null),c.created_at desc
    limit 1
    for update;

    if not found then raise exception 'coupon is invalid or expired'; end if;
    if v_subtotal < v_coupon.minimum_order then raise exception 'minimum order not reached for coupon'; end if;
    select count(*) into v_total_uses from public.coupon_redemptions r where r.coupon_id=v_coupon.id;
    if v_coupon.usage_limit is not null and v_total_uses>=v_coupon.usage_limit then raise exception 'coupon usage limit reached'; end if;
    select count(*) into v_user_uses from public.coupon_redemptions r where r.coupon_id=v_coupon.id and r.user_id=p_customer_user_id;
    if v_coupon.usage_limit_per_user is not null and v_user_uses>=v_coupon.usage_limit_per_user then raise exception 'coupon already used maximum times'; end if;

    v_discount := case when v_coupon.discount_type='percent'
      then round((v_subtotal*v_coupon.discount_value/100.0)::numeric,2)
      else v_coupon.discount_value end;
    if v_coupon.max_discount is not null then v_discount:=least(v_discount,v_coupon.max_discount); end if;
    v_discount:=least(v_discount,v_subtotal);
  end if;

  v_total:=round((v_subtotal+v_delivery_fee-v_discount)::numeric,2);
  if v_total < 0.01 then raise exception 'coupon would reduce payable total below minimum'; end if;

  update public.orders o
  set fulfillment_type=p_fulfillment_type,
      delivery_address=case when p_fulfillment_type='pickup' then '{}'::jsonb else p_delivery_address end,
      delivery_fee=v_delivery_fee,
      coupon_id=v_coupon.id,
      discount=v_discount,
      total=v_total
  where o.id=v_order_id;

  if v_coupon.id is not null then
    insert into public.coupon_redemptions(coupon_id,order_id,user_id,discount_amount)
    values(v_coupon.id,v_order_id,p_customer_user_id,v_discount)
    on conflict(order_id) do nothing;
  end if;

  return query select v_order_id,v_order_number;
end;
$function$;

revoke all on function public.create_order_atomic_v2(uuid,uuid,jsonb,text,jsonb,uuid,text,text,text) from public;
grant execute on function public.create_order_atomic_v2(uuid,uuid,jsonb,text,jsonb,uuid,text,text,text) to service_role;

create or replace function public.create_order_for_checkout_intent_v2(
  p_customer_user_id uuid,
  p_merchant_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_delivery_address jsonb,
  p_request_key uuid,
  p_checkout_intent_key uuid,
  p_fulfillment_type text default 'delivery',
  p_coupon_code text default null,
  p_observation text default null
)
returns table(order_id uuid, order_number bigint)
language plpgsql
set search_path to ''
as $function$
declare
  v_order_id uuid;
  v_order_number bigint;
  v_existing_customer uuid;
  v_existing_checkout_key uuid;
  v_existing_status text;
  v_existing_payment_status text;
  v_effective_request_key uuid := p_request_key;
begin
  if p_customer_user_id is null then raise exception 'customer_user_id is required'; end if;
  if p_request_key is null then raise exception 'request_key is required'; end if;
  if p_checkout_intent_key is null then raise exception 'checkout_intent_key is required'; end if;

  select o.id,o.order_number into v_order_id,v_order_number
  from public.orders o
  where o.customer_user_id=p_customer_user_id
    and o.checkout_intent_key=p_checkout_intent_key
    and o.payment_status in ('pending','failed')
    and o.status not in ('cancelled','refunded','delivered')
  order by o.created_at desc limit 1;
  if found then return query select v_order_id,v_order_number; return; end if;

  select o.customer_user_id,o.checkout_intent_key,o.status,o.payment_status,o.id,o.order_number
  into v_existing_customer,v_existing_checkout_key,v_existing_status,v_existing_payment_status,v_order_id,v_order_number
  from public.orders o where o.request_key=p_request_key;

  if found then
    if v_existing_customer is distinct from p_customer_user_id then raise exception 'request_key already belongs to another customer'; end if;
    if v_existing_checkout_key=p_checkout_intent_key
       and v_existing_payment_status in ('pending','failed')
       and v_existing_status not in ('cancelled','refunded','delivered') then
      return query select v_order_id,v_order_number;
      return;
    end if;
    v_effective_request_key:=gen_random_uuid();
  end if;

  begin
    select created.order_id,created.order_number into v_order_id,v_order_number
    from public.create_order_atomic_v2(
      p_customer_user_id,p_merchant_id,p_items,p_payment_method,p_delivery_address,
      v_effective_request_key,p_fulfillment_type,p_coupon_code,p_observation
    ) created;
    update public.orders set checkout_intent_key=p_checkout_intent_key where id=v_order_id;
  exception when unique_violation then
    select o.id,o.order_number into v_order_id,v_order_number
    from public.orders o
    where o.customer_user_id=p_customer_user_id
      and o.checkout_intent_key=p_checkout_intent_key
      and o.payment_status in ('pending','failed')
      and o.status not in ('cancelled','refunded','delivered')
    order by o.created_at desc limit 1;
    if not found then raise; end if;
  end;

  return query select v_order_id,v_order_number;
end;
$function$;

revoke all on function public.create_order_for_checkout_intent_v2(uuid,uuid,jsonb,text,jsonb,uuid,uuid,text,text,text) from public;
grant execute on function public.create_order_for_checkout_intent_v2(uuid,uuid,jsonb,text,jsonb,uuid,uuid,text,text,text) to service_role;
