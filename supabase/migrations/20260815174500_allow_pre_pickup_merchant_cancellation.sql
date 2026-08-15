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
  v_job public.delivery_jobs;
  v_refund_id uuid;
  v_is_admin boolean := public.current_user_is_admin();
begin
  if nullif(btrim(_reason),'') is null then
    raise exception 'cancellation reason is required';
  end if;

  select * into v_order
  from public.orders o
  where o.id = _order_id
  for update;

  if not found then raise exception 'order not found'; end if;

  if not (public.current_user_is_merchant_member(v_order.merchant_id) or v_is_admin) then
    raise exception 'merchant access required';
  end if;

  if not v_is_admin and v_order.payment_status not in ('paid','refunded') then
    raise exception 'merchant can only reject paid orders';
  end if;

  select * into v_refund
  from public.refunds r
  where r.order_id = _order_id
    and r.status in ('pending','processing','completed')
  order by r.created_at desc
  limit 1;

  if v_order.status in ('cancelled','refunded') then
    return jsonb_build_object(
      'order_id', v_order.id,
      'status', v_order.status,
      'refund_id', v_refund.id,
      'refund_pending', v_refund.status in ('pending','processing')
    );
  end if;

  if v_order.status not in (
    'confirmed',
    'accepted',
    'preparing',
    'ready',
    'searching_driver',
    'driver_assigned',
    'driver_arriving_store'
  ) then
    raise exception 'order can no longer be rejected';
  end if;

  select * into v_job
  from public.delivery_jobs dj
  where dj.order_id = _order_id
  order by dj.created_at desc
  limit 1
  for update;

  if found and v_job.status in ('searching','offered','accepted','arriving_pickup','at_pickup') then
    update public.delivery_offers
    set status = 'cancelled',
        responded_at = coalesce(responded_at, now())
    where delivery_job_id = v_job.id
      and status in ('offered','accepted');

    update public.delivery_jobs
    set status = 'cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        cancellation_reason = btrim(_reason),
        updated_at = now()
    where id = v_job.id;

    insert into public.delivery_events(
      delivery_job_id,
      event_type,
      from_status,
      to_status,
      actor_user_id,
      metadata
    ) values (
      v_job.id,
      'merchant_cancelled',
      v_job.status,
      'cancelled',
      (select auth.uid()),
      jsonb_build_object('order_id', _order_id, 'reason', btrim(_reason))
    );
  end if;

  select * into v_payment
  from public.payments p
  where p.order_id = _order_id
  order by p.created_at desc
  limit 1
  for update;

  if found and v_payment.status = 'paid' then
    if v_refund.id is null then
      insert into public.refunds(payment_id, order_id, amount, reason, status, requested_by)
      values(v_payment.id, _order_id, v_payment.amount, btrim(_reason), 'pending', (select auth.uid()))
      returning id into v_refund_id;
    else
      v_refund_id := v_refund.id;
    end if;
  elsif found and v_payment.status in ('pending','processing') then
    update public.payments
    set status = 'cancelled',
        failed_at = now(),
        failure_reason = 'order_rejected_by_merchant'
    where id = v_payment.id;
  end if;

  update public.orders
  set status = 'cancelled',
      cancellation_reason = btrim(_reason),
      cancelled_at = now(),
      payment_status = case
        when v_refund_id is not null then payment_status
        when payment_status = 'paid' then payment_status
        else 'cancelled'
      end
  where id = _order_id;

  insert into public.order_status_history(order_id, status, changed_by_user_id)
  values(_order_id, 'cancelled', (select auth.uid()));

  if v_is_admin then
    insert into public.admin_audit_logs(admin_id, action, entity_type, entity_id, before_data, after_data)
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
    'order_id', _order_id,
    'status', 'cancelled',
    'refund_id', v_refund_id,
    'refund_pending', v_refund_id is not null
  );
end;
$function$;

revoke all on function public.merchant_reject_order(uuid,text) from public, anon;
grant execute on function public.merchant_reject_order(uuid,text) to authenticated, service_role;
