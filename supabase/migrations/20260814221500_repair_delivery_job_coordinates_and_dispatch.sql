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
  select * into v_order
  from public.orders o
  where o.id = _order_id
  for update;

  if not found then raise exception 'order not found'; end if;
  if v_order.fulfillment_type <> 'delivery' then return null; end if;

  select * into v_merchant
  from public.merchants m
  where m.id = v_order.merchant_id;

  if not found then raise exception 'merchant not found'; end if;
  if v_merchant.latitude is null or v_merchant.longitude is null then
    raise exception 'merchant pickup location required';
  end if;

  if coalesce(v_order.delivery_address->>'latitude', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then
    v_delivery_lat := (v_order.delivery_address->>'latitude')::numeric;
  end if;
  if coalesce(v_order.delivery_address->>'longitude', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then
    v_delivery_lon := (v_order.delivery_address->>'longitude')::numeric;
  end if;

  if v_delivery_lat is null or v_delivery_lon is null
     or v_delivery_lat not between -90 and 90
     or v_delivery_lon not between -180 and 180 then
    raise exception 'delivery coordinates required';
  end if;

  v_distance_km := public.haversine_km(
    v_merchant.latitude,
    v_merchant.longitude,
    v_delivery_lat,
    v_delivery_lon
  );
  v_estimated_distance_meters := greatest(round(v_distance_km * 1000)::integer, 0);

  select * into v_rule
  from public.fee_rules fr
  where fr.is_active = true
    and (fr.starts_at is null or fr.starts_at <= now())
    and (fr.ends_at is null or fr.ends_at > now())
    and (
      fr.merchant_id = v_order.merchant_id
      or (fr.merchant_id is null and fr.city_id = v_merchant.city_id)
    )
  order by (fr.merchant_id is not null) desc, fr.created_at desc
  limit 1;

  if found then
    v_commission := round(
      (greatest(v_order.subtotal - v_order.discount, 0) * v_rule.merchant_commission_percent / 100.0)::numeric,
      2
    );
    v_configured_earnings := round(
      greatest(
        v_rule.courier_minimum_fee,
        v_rule.courier_base_fee + (v_rule.courier_per_km * v_distance_km)
      )::numeric,
      2
    );
    v_available_pool := round(
      (v_order.delivery_fee + v_order.service_fee + v_commission)::numeric,
      2
    );
    v_estimated_earnings := least(v_configured_earnings, greatest(v_available_pool, 0));
  else
    v_estimated_earnings := v_order.delivery_fee;
  end if;

  select dj.id into v_job_id
  from public.delivery_jobs dj
  where dj.order_id = _order_id
  limit 1
  for update;

  if v_job_id is not null then
    update public.delivery_jobs
    set
      pickup_address = jsonb_build_object(
        'name', v_merchant.name,
        'address_line', v_merchant.address_line,
        'neighborhood', v_merchant.neighborhood,
        'city', v_merchant.city,
        'state', v_merchant.state
      ),
      delivery_address = v_order.delivery_address,
      pickup_latitude = v_merchant.latitude,
      pickup_longitude = v_merchant.longitude,
      delivery_latitude = v_delivery_lat,
      delivery_longitude = v_delivery_lon,
      estimated_distance_meters = v_estimated_distance_meters,
      estimated_earnings = v_estimated_earnings,
      updated_at = now()
    where id = v_job_id;

    return v_job_id;
  end if;

  insert into public.delivery_jobs(
    order_id,
    merchant_id,
    status,
    pickup_address,
    delivery_address,
    pickup_latitude,
    pickup_longitude,
    delivery_latitude,
    delivery_longitude,
    estimated_distance_meters,
    estimated_earnings
  ) values (
    v_order.id,
    v_order.merchant_id,
    'searching',
    jsonb_build_object(
      'name', v_merchant.name,
      'address_line', v_merchant.address_line,
      'neighborhood', v_merchant.neighborhood,
      'city', v_merchant.city,
      'state', v_merchant.state
    ),
    v_order.delivery_address,
    v_merchant.latitude,
    v_merchant.longitude,
    v_delivery_lat,
    v_delivery_lon,
    v_estimated_distance_meters,
    v_estimated_earnings
  ) returning id into v_job_id;

  v_random := extensions.gen_random_bytes(2);
  v_pin_number := ((get_byte(v_random, 0) * 256) + get_byte(v_random, 1)) % 10000;
  v_pin := lpad(v_pin_number::text, 4, '0');

  insert into public.delivery_confirmation_secrets(order_id, pin_code)
  values (v_order.id, v_pin)
  on conflict (order_id) do nothing;

  insert into public.delivery_events(delivery_job_id, event_type, to_status, metadata)
  values (v_job_id, 'job_created', 'searching', jsonb_build_object('order_id', v_order.id));

  update public.orders
  set status = 'searching_driver'
  where id = v_order.id;

  insert into public.order_status_history(order_id, status, changed_by_user_id)
  values (v_order.id, 'searching_driver', (select auth.uid()));

  return v_job_id;
end;
$function$;

create or replace function public.merchant_request_courier(_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_job public.delivery_jobs;
  v_job_id uuid;
  v_existing_job_id uuid;
  v_is_admin boolean := public.current_user_is_admin();
begin
  select * into v_order
  from public.orders o
  where o.id = _order_id
  for update;

  if not found then raise exception 'order not found'; end if;
  if not public.current_user_is_merchant_member(v_order.merchant_id) and not v_is_admin then
    raise exception 'merchant access required';
  end if;
  if v_order.fulfillment_type <> 'delivery' then raise exception 'delivery order required'; end if;
  if v_order.payment_method = 'pix' and v_order.payment_status <> 'paid' then
    raise exception 'pix payment must be confirmed before courier dispatch';
  end if;
  if v_order.status not in (
    'ready',
    'searching_driver',
    'driver_assigned',
    'driver_arriving_store',
    'picked_up',
    'out_for_delivery',
    'on_the_way'
  ) then
    raise exception 'order must be ready before courier dispatch';
  end if;

  select dj.id into v_existing_job_id
  from public.delivery_jobs dj
  where dj.order_id = _order_id
  limit 1;

  v_job_id := public.ensure_delivery_job(_order_id);

  select dj.* into v_job
  from public.delivery_jobs dj
  where dj.id = v_job_id
  for update;

  if not found then raise exception 'delivery job missing for dispatched order'; end if;

  if v_job.courier_id is null and v_job.status in ('searching', 'offered') then
    perform public.dispatch_delivery_job_offers(v_job.id);
  end if;

  if v_is_admin and v_existing_job_id is null then
    insert into public.admin_audit_logs(
      admin_id,
      action,
      entity_type,
      entity_id,
      before_data,
      after_data
    ) values (
      (select auth.uid()),
      'admin_request_courier',
      'order',
      _order_id::text,
      to_jsonb(v_order),
      jsonb_build_object('delivery_job_id', v_job_id)
    );
  end if;

  return v_job_id;
end;
$function$;

revoke all on function public.ensure_delivery_job(uuid) from public, anon;
grant execute on function public.ensure_delivery_job(uuid) to authenticated, service_role;
revoke all on function public.merchant_request_courier(uuid) from public, anon;
grant execute on function public.merchant_request_courier(uuid) to authenticated, service_role;

update public.delivery_jobs dj
set
  delivery_address = o.delivery_address,
  delivery_latitude = (o.delivery_address->>'latitude')::numeric,
  delivery_longitude = (o.delivery_address->>'longitude')::numeric,
  estimated_distance_meters = case
    when dj.pickup_latitude is not null and dj.pickup_longitude is not null then
      greatest(
        round(
          public.haversine_km(
            dj.pickup_latitude,
            dj.pickup_longitude,
            (o.delivery_address->>'latitude')::numeric,
            (o.delivery_address->>'longitude')::numeric
          ) * 1000
        )::integer,
        0
      )
    else dj.estimated_distance_meters
  end,
  updated_at = now()
from public.orders o
where dj.order_id = o.id
  and coalesce(o.delivery_address->>'latitude', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
  and coalesce(o.delivery_address->>'longitude', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
  and (o.delivery_address->>'latitude')::numeric between -90 and 90
  and (o.delivery_address->>'longitude')::numeric between -180 and 180
  and (
    dj.delivery_latitude is null
    or dj.delivery_longitude is null
    or dj.delivery_address is distinct from o.delivery_address
  );