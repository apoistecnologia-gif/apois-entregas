create or replace function public.ensure_pickup_confirmation_secret(_order_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_existing text;
  v_random bytea;
  v_pin_number integer;
  v_pin text;
begin
  select * into v_order
  from public.orders o
  where o.id = _order_id
  for update;

  if not found then raise exception 'order not found'; end if;
  if v_order.fulfillment_type <> 'pickup' then raise exception 'pickup order required'; end if;
  if not public.current_user_is_merchant_member(v_order.merchant_id)
     and not public.current_user_is_admin() then
    raise exception 'merchant access required';
  end if;

  select s.pin_code into v_existing
  from public.delivery_confirmation_secrets s
  where s.order_id = _order_id;
  if v_existing is not null then return v_existing; end if;

  v_random := gen_random_bytes(2);
  v_pin_number := ((get_byte(v_random,0)*256)+get_byte(v_random,1)) % 10000;
  v_pin := lpad(v_pin_number::text,4,'0');

  insert into public.delivery_confirmation_secrets(order_id,pin_code)
  values(_order_id,v_pin)
  on conflict(order_id) do nothing;

  select s.pin_code into v_existing
  from public.delivery_confirmation_secrets s
  where s.order_id = _order_id;
  return v_existing;
end;
$function$;

revoke all on function public.ensure_pickup_confirmation_secret(uuid) from public;
grant execute on function public.ensure_pickup_confirmation_secret(uuid) to authenticated;

create or replace function public.merchant_transition_order(_order_id uuid, _new_status text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_effective_status text;
begin
  select * into v_order
  from public.orders o
  where o.id = _order_id
  for update;

  if not found then raise exception 'order not found'; end if;

  if not public.current_user_is_merchant_member(v_order.merchant_id)
     and not public.current_user_is_admin() then
    raise exception 'merchant access required';
  end if;

  if _new_status = 'cancelled' then
    raise exception 'use merchant_reject_order for cancellation';
  end if;

  if not (
    (v_order.status = 'confirmed' and _new_status in ('accepted','preparing')) or
    (v_order.status = 'accepted' and _new_status = 'preparing') or
    (v_order.status = 'preparing' and _new_status = 'ready')
  ) then
    raise exception 'invalid order transition from % to %', v_order.status, _new_status;
  end if;

  v_effective_status := case
    when _new_status = 'ready' and v_order.fulfillment_type = 'pickup' then 'ready_for_pickup'
    else _new_status
  end;

  update public.orders
  set status = v_effective_status,
      accepted_at = case
        when v_effective_status in ('accepted','preparing') and accepted_at is null then now()
        else accepted_at
      end,
      ready_at = case when v_effective_status in ('ready','ready_for_pickup') then now() else ready_at end
  where id = _order_id;

  insert into public.order_status_history(order_id,status,changed_by_user_id)
  values(_order_id,v_effective_status,(select auth.uid()));

  if v_effective_status = 'ready' and v_order.fulfillment_type = 'delivery' then
    perform public.ensure_delivery_job(_order_id);
  elsif v_effective_status = 'ready_for_pickup' then
    perform public.ensure_pickup_confirmation_secret(_order_id);
  end if;
end;
$function$;

create or replace function public.complete_pickup_with_pin(_order_id uuid, _pin text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_secret public.delivery_confirmation_secrets;
  v_next_attempts integer;
begin
  select * into v_order
  from public.orders o
  where o.id = _order_id
  for update;

  if not found then raise exception 'order not found'; end if;
  if v_order.fulfillment_type <> 'pickup' then raise exception 'pickup order required'; end if;
  if v_order.status <> 'ready_for_pickup' then raise exception 'order is not ready for pickup'; end if;
  if not public.current_user_is_merchant_member(v_order.merchant_id)
     and not public.current_user_is_admin() then
    raise exception 'merchant access required';
  end if;

  select * into v_secret
  from public.delivery_confirmation_secrets s
  where s.order_id = _order_id
  for update;
  if not found then raise exception 'pickup confirmation secret not found'; end if;

  if v_secret.locked_until is not null and v_secret.locked_until > now() then return false; end if;

  if _pin is distinct from v_secret.pin_code then
    v_next_attempts := v_secret.failed_attempts + 1;
    update public.delivery_confirmation_secrets
    set failed_attempts = case when v_next_attempts >= 5 then 0 else v_next_attempts end,
        locked_until = case when v_next_attempts >= 5 then now() + interval '15 minutes' else null end
    where order_id = _order_id;
    return false;
  end if;

  update public.delivery_confirmation_secrets
  set failed_attempts = 0, locked_until = null
  where order_id = _order_id;

  update public.orders
  set status = 'delivered', delivered_at = now()
  where id = _order_id;

  insert into public.order_status_history(order_id,status,changed_by_user_id)
  values(_order_id,'delivered',(select auth.uid()));

  perform public.settle_delivered_order_financials(_order_id);
  return true;
end;
$function$;

revoke all on function public.complete_pickup_with_pin(uuid,text) from public;
grant execute on function public.complete_pickup_with_pin(uuid,text) to authenticated;
