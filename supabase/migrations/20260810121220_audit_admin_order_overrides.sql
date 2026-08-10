create or replace function public.merchant_transition_order(_order_id uuid, _new_status text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_effective_status text;
  v_is_admin boolean := public.current_user_is_admin();
begin
  select * into v_order
  from public.orders o
  where o.id = _order_id
  for update;

  if not found then raise exception 'order not found'; end if;

  if not public.current_user_is_merchant_member(v_order.merchant_id)
     and not v_is_admin then
    raise exception 'merchant access required';
  end if;

  if _new_status = 'cancelled' then
    raise exception 'use merchant_reject_order for cancellation';
  end if;

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

  if v_is_admin then
    insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
    values(
      (select auth.uid()),
      'admin_transition_order',
      'order',
      _order_id::text,
      to_jsonb(v_order),
      jsonb_build_object('status',v_effective_status)
    );
  end if;

  if v_effective_status = 'ready' and v_order.fulfillment_type = 'delivery' then
    perform public.ensure_delivery_job(_order_id);
  elsif v_effective_status = 'ready_for_pickup' then
    perform public.ensure_pickup_confirmation_secret(_order_id);
  end if;
end;
$function$;

create or replace function public.merchant_reject_order(_order_id uuid, _reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_payment public.payments;
  v_refund public.refunds;
  v_refund_id uuid;
  v_is_admin boolean := public.current_user_is_admin();
begin
  if nullif(btrim(_reason),'') is null then raise exception 'cancellation reason is required'; end if;
  select * into v_order from public.orders o where o.id=_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not (public.current_user_is_merchant_member(v_order.merchant_id) or v_is_admin) then
    raise exception 'merchant access required';
  end if;

  select * into v_refund from public.refunds r
  where r.order_id=_order_id and r.status in ('pending','processing','completed')
  order by r.created_at desc limit 1;

  if v_order.status in ('cancelled','refunded') then
    return jsonb_build_object(
      'order_id',v_order.id,'status',v_order.status,'refund_id',v_refund.id,
      'refund_pending',v_refund.status in ('pending','processing')
    );
  end if;
  if v_order.status not in ('confirmed','accepted','preparing') then
    raise exception 'order can no longer be rejected';
  end if;

  select * into v_payment from public.payments p
  where p.order_id=_order_id order by p.created_at desc limit 1 for update;

  if found and v_payment.status='paid' then
    if v_refund.id is null then
      insert into public.refunds(payment_id,order_id,amount,reason,status,requested_by)
      values(v_payment.id,_order_id,v_payment.amount,btrim(_reason),'pending',(select auth.uid()))
      returning id into v_refund_id;
    else
      v_refund_id:=v_refund.id;
    end if;
  elsif found and v_payment.status in ('pending','processing') then
    update public.payments
    set status='cancelled',failed_at=now(),failure_reason='order_rejected_by_merchant'
    where id=v_payment.id;
  end if;

  update public.orders
  set status='cancelled',cancellation_reason=btrim(_reason),cancelled_at=now(),
      payment_status=case
        when v_refund_id is not null then payment_status
        when payment_status='paid' then payment_status
        else 'cancelled'
      end
  where id=_order_id;
  insert into public.order_status_history(order_id,status,changed_by_user_id)
  values(_order_id,'cancelled',(select auth.uid()));

  if v_is_admin then
    insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
    values(
      (select auth.uid()),
      'admin_reject_order',
      'order',
      _order_id::text,
      to_jsonb(v_order),
      jsonb_build_object('status','cancelled','reason',btrim(_reason),'refund_id',v_refund_id)
    );
  end if;

  return jsonb_build_object(
    'order_id',_order_id,'status','cancelled','refund_id',v_refund_id,
    'refund_pending',v_refund_id is not null
  );
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
  v_is_admin boolean := public.current_user_is_admin();
begin
  select * into v_order
  from public.orders o
  where o.id = _order_id
  for update;

  if not found then raise exception 'order not found'; end if;
  if v_order.fulfillment_type <> 'pickup' then raise exception 'pickup order required'; end if;
  if v_order.status <> 'ready_for_pickup' then raise exception 'order is not ready for pickup'; end if;
  if not public.current_user_is_merchant_member(v_order.merchant_id)
     and not v_is_admin then
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
    if v_is_admin then
      insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
      values(
        (select auth.uid()),'admin_pickup_pin_failed','order',_order_id::text,null,
        jsonb_build_object('failed_attempt_number',v_next_attempts,'locked',v_next_attempts>=5)
      );
    end if;
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

  if v_is_admin then
    insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
    values(
      (select auth.uid()),'admin_complete_pickup','order',_order_id::text,to_jsonb(v_order),
      jsonb_build_object('status','delivered')
    );
  end if;

  return true;
end;
$function$;
