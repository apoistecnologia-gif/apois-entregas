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

  -- PIX is the only customer payment method currently exposed by the product.
  -- Never allow fulfillment to begin before the trusted payment reconciliation
  -- has marked the order paid, even if a client calls the RPC directly.
  if v_order.payment_method = 'pix'
     and v_order.payment_status <> 'paid'
     and _new_status in ('accepted','preparing','ready') then
    raise exception 'pix payment must be confirmed before fulfillment';
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
