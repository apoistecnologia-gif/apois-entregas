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

  -- Coordinates are operationally required even when a city currently has no
  -- polygon/radius rule: dispatch, route distance and courier earnings depend on them.
  if v_lat is null or v_lon is null then
    return query select false,'coordinates_required'::text,null::uuid,0::numeric,v_merchant.minimum_order,null::numeric;
    return;
  end if;

  v_distance := public.haversine_km(v_merchant.latitude,v_merchant.longitude,v_lat,v_lon);

  select count(*) into v_zone_count
  from public.delivery_zones dz
  where dz.city_id = v_city.id and dz.is_active = true;

  if v_zone_count > 0 then
    select dz.* into v_zone
    from public.delivery_zones dz
    where dz.city_id = v_city.id
      and dz.is_active = true
      and public.delivery_zone_contains_point(dz.id,v_lat,v_lon)
    order by coalesce(dz.radius_km,999999::numeric),dz.created_at
    limit 1;

    if not found then
      return query select false,'outside_delivery_zone'::text,null::uuid,0::numeric,v_merchant.minimum_order,v_distance;
      return;
    end if;
  elsif v_city.default_delivery_radius_km is not null and v_distance > v_city.default_delivery_radius_km then
    return query select false,'outside_default_radius'::text,null::uuid,0::numeric,v_merchant.minimum_order,v_distance;
    return;
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

create or replace function public.preview_checkout_fee(p_merchant_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_merchant public.merchants;
  v_rule public.fee_rules;
begin
  if not public.current_user_is_active() then
    raise exception 'active account required';
  end if;

  select * into v_merchant
  from public.merchants m
  where m.id = p_merchant_id
    and m.is_active = true
    and m.approval_status = 'approved';
  if not found then raise exception 'merchant unavailable'; end if;

  select * into v_rule
  from public.fee_rules fr
  where fr.is_active = true
    and (fr.starts_at is null or fr.starts_at <= now())
    and (fr.ends_at is null or fr.ends_at > now())
    and (
      fr.merchant_id = p_merchant_id
      or (fr.merchant_id is null and fr.city_id = v_merchant.city_id)
    )
  order by (fr.merchant_id is not null) desc, fr.created_at desc
  limit 1;

  return coalesce(v_rule.customer_service_fee,0);
end;
$function$;

revoke all on function public.preview_checkout_fee(uuid) from public, anon;
grant execute on function public.preview_checkout_fee(uuid) to authenticated, service_role;

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
  v_rule public.fee_rules;
  v_quote_eligible boolean := false;
  v_quote_reason text;
  v_quote_delivery_fee numeric;
  v_quote_minimum_order numeric := 0;
  v_subtotal numeric;
  v_delivery_fee numeric;
  v_service_fee numeric := 0;
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

  select * into v_rule
  from public.fee_rules fr
  where fr.is_active=true
    and (fr.starts_at is null or fr.starts_at<=now())
    and (fr.ends_at is null or fr.ends_at>now())
    and (fr.merchant_id=p_merchant_id or (fr.merchant_id is null and fr.city_id=v_merchant.city_id))
  order by (fr.merchant_id is not null) desc,fr.created_at desc
  limit 1;
  if found then v_service_fee:=coalesce(v_rule.customer_service_fee,0); end if;

  if p_fulfillment_type='delivery' then
    select q.eligible,q.reason,q.delivery_fee,q.minimum_order
      into v_quote_eligible,v_quote_reason,v_quote_delivery_fee,v_quote_minimum_order
    from public.resolve_delivery_quote(p_merchant_id,p_delivery_address) q;
    if not coalesce(v_quote_eligible,false) then
      raise exception 'delivery address unavailable: %',coalesce(v_quote_reason,'unknown');
    end if;
  end if;

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

  v_total:=round((v_subtotal+v_delivery_fee+v_service_fee-v_discount)::numeric,2);
  if v_total < 0.01 then raise exception 'coupon would reduce payable total below minimum'; end if;

  update public.orders o
  set fulfillment_type=p_fulfillment_type,
      delivery_address=case when p_fulfillment_type='pickup' then '{}'::jsonb else p_delivery_address end,
      delivery_fee=v_delivery_fee,
      service_fee=v_service_fee,
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

revoke all on function public.create_order_atomic_v2(uuid,uuid,jsonb,text,jsonb,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.create_order_atomic_v2(uuid,uuid,jsonb,text,jsonb,uuid,text,text,text) to service_role;

create or replace function public.ensure_delivery_job(_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_merchant public.merchants;
  v_rule public.fee_rules;
  v_job_id uuid;
  v_random bytea;
  v_pin_number integer;
  v_pin text;
  v_delivery_lat numeric;
  v_delivery_lon numeric;
  v_distance_km numeric := 0;
  v_estimated_distance_meters integer := 0;
  v_commission numeric(12,2) := 0;
  v_configured_earnings numeric(12,2) := 0;
  v_estimated_earnings numeric(12,2) := 0;
  v_available_pool numeric(12,2) := 0;
begin
  select * into v_order from public.orders o where o.id=_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.fulfillment_type<>'delivery' then return null; end if;

  select * into v_merchant from public.merchants m where m.id=v_order.merchant_id;
  if not found then raise exception 'merchant not found'; end if;
  if v_merchant.latitude is null or v_merchant.longitude is null then
    raise exception 'merchant pickup location required';
  end if;

  if coalesce(v_order.delivery_address->>'latitude','') ~ '^-?[0-9]+(\.[0-9]+)?$' then
    v_delivery_lat := (v_order.delivery_address->>'latitude')::numeric;
  end if;
  if coalesce(v_order.delivery_address->>'longitude','') ~ '^-?[0-9]+(\.[0-9]+)?$' then
    v_delivery_lon := (v_order.delivery_address->>'longitude')::numeric;
  end if;
  if v_delivery_lat is null or v_delivery_lon is null
     or v_delivery_lat not between -90 and 90
     or v_delivery_lon not between -180 and 180 then
    raise exception 'delivery coordinates required';
  end if;

  select dj.id into v_job_id from public.delivery_jobs dj where dj.order_id=_order_id;
  if v_job_id is not null then return v_job_id; end if;

  v_distance_km := public.haversine_km(v_merchant.latitude,v_merchant.longitude,v_delivery_lat,v_delivery_lon);
  v_estimated_distance_meters := greatest(round(v_distance_km*1000)::integer,0);

  select * into v_rule
  from public.fee_rules fr
  where fr.is_active=true
    and (fr.starts_at is null or fr.starts_at<=now())
    and (fr.ends_at is null or fr.ends_at>now())
    and (fr.merchant_id=v_order.merchant_id or (fr.merchant_id is null and fr.city_id=v_merchant.city_id))
  order by (fr.merchant_id is not null) desc,fr.created_at desc
  limit 1;

  if found then
    v_commission:=round((greatest(v_order.subtotal-v_order.discount,0)*v_rule.merchant_commission_percent/100.0)::numeric,2);
    v_configured_earnings:=round(greatest(v_rule.courier_minimum_fee,v_rule.courier_base_fee+(v_rule.courier_per_km*v_distance_km))::numeric,2);
    v_available_pool:=round((v_order.delivery_fee+v_order.service_fee+v_commission)::numeric,2);
    v_estimated_earnings:=least(v_configured_earnings,greatest(v_available_pool,0));
  else
    v_estimated_earnings:=v_order.delivery_fee;
  end if;

  insert into public.delivery_jobs(
    order_id,merchant_id,status,pickup_address,delivery_address,
    pickup_latitude,pickup_longitude,delivery_latitude,delivery_longitude,
    estimated_distance_meters,estimated_earnings
  ) values(
    v_order.id,v_order.merchant_id,'searching',
    jsonb_build_object('name',v_merchant.name,'address_line',v_merchant.address_line,'neighborhood',v_merchant.neighborhood,'city',v_merchant.city,'state',v_merchant.state),
    v_order.delivery_address,
    v_merchant.latitude,v_merchant.longitude,
    v_delivery_lat,v_delivery_lon,
    v_estimated_distance_meters,v_estimated_earnings
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

create or replace function public.settle_delivered_order_financials(_order_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_job public.delivery_jobs;
  v_merchant public.merchants;
  v_rule public.fee_rules;
  v_commission numeric(12,2):=0;
  v_configured_courier_earnings numeric(12,2):=0;
  v_courier_earnings numeric(12,2):=0;
  v_merchant_net numeric(12,2):=0;
  v_platform_fee numeric(12,2):=0;
  v_available_pool numeric(12,2):=0;
  v_distance_km numeric:=0;
  v_merchant_wallet uuid;
  v_courier_wallet uuid;
  v_platform_wallet uuid;
begin
  select * into v_order from public.orders o where o.id=_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status<>'delivered' then raise exception 'order is not delivered'; end if;
  if v_order.merchant_net is not null and v_order.courier_earnings is not null then return; end if;

  select * into v_merchant from public.merchants m where m.id=v_order.merchant_id;
  if not found then raise exception 'merchant not found'; end if;
  select * into v_job from public.delivery_jobs dj where dj.order_id=_order_id;
  if v_order.fulfillment_type='delivery' and (not found or v_job.courier_id is null) then raise exception 'delivered order has no courier'; end if;

  select * into v_rule
  from public.fee_rules fr
  where fr.is_active=true
    and (fr.starts_at is null or fr.starts_at<=now())
    and (fr.ends_at is null or fr.ends_at>now())
    and (fr.merchant_id=v_order.merchant_id or (fr.merchant_id is null and fr.city_id=v_merchant.city_id))
  order by (fr.merchant_id is not null) desc,fr.created_at desc
  limit 1;

  if found then
    v_commission:=round((greatest(v_order.subtotal-v_order.discount,0)*v_rule.merchant_commission_percent/100.0)::numeric,2);
    if v_order.fulfillment_type='delivery' then
      v_distance_km:=coalesce(v_job.estimated_distance_meters,0)::numeric/1000.0;
      v_configured_courier_earnings:=round(greatest(v_rule.courier_minimum_fee,v_rule.courier_base_fee+(v_rule.courier_per_km*v_distance_km))::numeric,2);
      v_available_pool:=round((v_commission+v_order.service_fee+v_order.delivery_fee)::numeric,2);
      v_courier_earnings:=least(v_configured_courier_earnings,greatest(v_available_pool,0));
    end if;
  else
    v_commission:=0;
    v_courier_earnings:=case when v_order.fulfillment_type='delivery' then v_order.delivery_fee else 0 end;
  end if;

  v_merchant_net:=greatest(round((v_order.subtotal-v_order.discount-v_commission)::numeric,2),0);
  v_platform_fee:=greatest(round((v_commission+v_order.service_fee+v_order.delivery_fee-v_courier_earnings)::numeric,2),0);

  update public.orders
  set merchant_net=v_merchant_net,courier_earnings=v_courier_earnings,platform_fee=v_platform_fee
  where id=_order_id;

  insert into public.wallets(owner_type,merchant_id) values('merchant',v_order.merchant_id)
  on conflict (merchant_id) where merchant_id is not null do nothing;
  select id into v_merchant_wallet from public.wallets where merchant_id=v_order.merchant_id;

  insert into public.wallets(owner_type) values('platform')
  on conflict (owner_type) where owner_type='platform' do nothing;
  select id into v_platform_wallet from public.wallets where owner_type='platform';

  perform public.post_wallet_transaction(v_merchant_wallet,'order_earning',v_merchant_net,v_merchant_net,0,'order-merchant:'||_order_id::text,'order',_order_id::text,'Repasse do pedido','completed');
  if v_platform_fee>0 then
    perform public.post_wallet_transaction(v_platform_wallet,'platform_fee',v_platform_fee,v_platform_fee,0,'order-platform:'||_order_id::text,'order',_order_id::text,'Receita da plataforma','completed');
  end if;
  if v_order.fulfillment_type='delivery' and v_courier_earnings>0 then
    insert into public.wallets(owner_type,courier_id) values('courier',v_job.courier_id)
    on conflict (courier_id) where courier_id is not null do nothing;
    select id into v_courier_wallet from public.wallets where courier_id=v_job.courier_id;
    perform public.post_wallet_transaction(v_courier_wallet,'order_earning',v_courier_earnings,v_courier_earnings,0,'order-courier:'||_order_id::text,'order',_order_id::text,'Ganho da entrega','completed');
  end if;
end;
$function$;

revoke all on function public.settle_delivered_order_financials(uuid) from public, anon, authenticated;
grant execute on function public.settle_delivered_order_financials(uuid) to service_role;

create or replace function public.admin_create_fee_rule(
  _name text,
  _city_id uuid,
  _merchant_id uuid,
  _merchant_commission_percent numeric,
  _courier_base_fee numeric,
  _courier_per_km numeric,
  _courier_minimum_fee numeric,
  _customer_service_fee numeric
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_after jsonb;
  v_name text := btrim(coalesce(_name,''));
begin
  if not public.current_user_is_admin() then raise exception 'admin access required'; end if;
  if char_length(v_name) not between 3 and 120 then raise exception 'invalid fee rule name'; end if;
  if (_city_id is null and _merchant_id is null) or (_city_id is not null and _merchant_id is not null) then
    raise exception 'choose exactly one fee rule scope';
  end if;
  if _city_id is not null and not exists(select 1 from public.cities c where c.id=_city_id) then raise exception 'city not found'; end if;
  if _merchant_id is not null and not exists(select 1 from public.merchants m where m.id=_merchant_id) then raise exception 'merchant not found'; end if;
  if _merchant_commission_percent is null or _merchant_commission_percent<0 or _merchant_commission_percent>100 then raise exception 'invalid merchant commission'; end if;
  if _courier_base_fee is null or _courier_base_fee<0
     or _courier_per_km is null or _courier_per_km<0
     or _courier_minimum_fee is null or _courier_minimum_fee<0
     or _customer_service_fee is null or _customer_service_fee<0 then
    raise exception 'invalid fee value';
  end if;

  insert into public.fee_rules(
    city_id,merchant_id,name,is_active,customer_service_fee,
    merchant_commission_percent,courier_base_fee,courier_per_km,courier_minimum_fee
  ) values(
    _city_id,_merchant_id,v_name,true,_customer_service_fee,
    _merchant_commission_percent,_courier_base_fee,_courier_per_km,_courier_minimum_fee
  ) returning id into v_id;

  select to_jsonb(fr) into v_after from public.fee_rules fr where fr.id=v_id;
  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  values((select auth.uid()),'create_fee_rule','fee_rule',v_id::text,null,v_after);
  return v_id;
end;
$function$;

revoke all on function public.admin_create_fee_rule(text,uuid,uuid,numeric,numeric,numeric,numeric,numeric) from public, anon;
grant execute on function public.admin_create_fee_rule(text,uuid,uuid,numeric,numeric,numeric,numeric,numeric) to authenticated, service_role;
