create or replace function public.merchant_transition_order(_order_id uuid, _new_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_effective_status text;
  v_is_admin boolean := public.current_user_is_admin();
begin
  select * into v_order from public.orders o where o.id = _order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not public.current_user_is_merchant_member(v_order.merchant_id) and not v_is_admin then
    raise exception 'merchant access required';
  end if;
  if _new_status = 'cancelled' then raise exception 'use merchant_reject_order for cancellation'; end if;
  if v_order.payment_method = 'pix' and v_order.payment_status <> 'paid'
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
      accepted_at = case when v_effective_status in ('accepted','preparing') and accepted_at is null then now() else accepted_at end,
      ready_at = case when v_effective_status in ('ready','ready_for_pickup') then now() else ready_at end
  where id = _order_id;
  insert into public.order_status_history(order_id,status,changed_by_user_id)
  values(_order_id,v_effective_status,(select auth.uid()));
  if v_is_admin then
    insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
    values((select auth.uid()),'admin_transition_order','order',_order_id::text,to_jsonb(v_order),jsonb_build_object('status',v_effective_status));
  end if;
  if v_effective_status = 'ready_for_pickup' then
    perform public.ensure_pickup_confirmation_secret(_order_id);
  end if;
end;
$$;

create or replace function public.merchant_request_courier(_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_job_id uuid;
  v_is_admin boolean := public.current_user_is_admin();
begin
  select * into v_order from public.orders o where o.id = _order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not public.current_user_is_merchant_member(v_order.merchant_id) and not v_is_admin then
    raise exception 'merchant access required';
  end if;
  if v_order.fulfillment_type <> 'delivery' then raise exception 'delivery order required'; end if;
  if v_order.payment_method = 'pix' and v_order.payment_status <> 'paid' then
    raise exception 'pix payment must be confirmed before courier dispatch';
  end if;
  if v_order.status not in ('ready','searching_driver','driver_assigned','driver_arriving_store','picked_up','out_for_delivery','on_the_way') then
    raise exception 'order must be ready before courier dispatch';
  end if;
  select dj.id into v_job_id from public.delivery_jobs dj where dj.order_id = _order_id limit 1;
  if v_job_id is not null then return v_job_id; end if;
  if v_order.status <> 'ready' then raise exception 'delivery job missing for dispatched order'; end if;
  v_job_id := public.ensure_delivery_job(_order_id);
  if v_is_admin then
    insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
    values((select auth.uid()),'admin_request_courier','order',_order_id::text,to_jsonb(v_order),jsonb_build_object('delivery_job_id',v_job_id));
  end if;
  return v_job_id;
end;
$$;

revoke all on function public.merchant_request_courier(uuid) from public;
grant execute on function public.merchant_request_courier(uuid) to authenticated;
