create or replace function public.create_order_atomic_v2(
  p_customer_user_id uuid,
  p_merchant_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_delivery_address jsonb,
  p_request_key uuid,
  p_fulfillment_type text default 'delivery'::text,
  p_coupon_code text default null::text,
  p_observation text default null::text
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
  v_quote_eligible boolean := false;
  v_quote_reason text;
  v_quote_delivery_fee numeric;
  v_quote_minimum_order numeric := 0;
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

  if p_fulfillment_type='delivery' then
    select q.eligible,q.reason,q.delivery_fee,q.minimum_order
      into v_quote_eligible,v_quote_reason,v_quote_delivery_fee,v_quote_minimum_order
    from public.resolve_delivery_quote(p_merchant_id,p_delivery_address) q;
    if not coalesce(v_quote_eligible,false) then
      raise exception 'delivery address unavailable: %',coalesce(v_quote_reason,'unknown');
    end if;
  end if;

  -- Legacy base function remains the single source of truth for product/options validation.
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
  if v_subtotal < greatest(
    v_merchant.minimum_order,
    case when p_fulfillment_type='delivery' then coalesce(v_quote_minimum_order,0) else 0 end
  ) then
    raise exception 'merchant minimum order not reached';
  end if;
  v_delivery_fee := case
    when p_fulfillment_type='delivery' then coalesce(v_quote_delivery_fee,v_merchant.delivery_fee)
    else 0
  end;

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
    on conflict on constraint coupon_redemptions_order_id_key do nothing;
  end if;

  return query select v_order_id,v_order_number;
end;
$function$;

revoke execute on function public.create_order_atomic_v2(uuid,uuid,jsonb,text,jsonb,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.create_order_atomic_v2(uuid,uuid,jsonb,text,jsonb,uuid,text,text,text) to service_role;