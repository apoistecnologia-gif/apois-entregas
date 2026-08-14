create or replace function public.ensure_cancelled_paid_order_refund(_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_order public.orders;
  v_refund_id uuid;
begin
  select * into v_payment
  from public.payments p
  where p.id = _payment_id
  for update;

  if not found then
    raise exception 'payment not found';
  end if;
  if v_payment.status <> 'paid' then
    raise exception 'payment must be paid';
  end if;

  select * into v_order
  from public.orders o
  where o.id = v_payment.order_id
  for update;

  if not found then
    raise exception 'order not found';
  end if;
  if v_order.status <> 'cancelled' then
    raise exception 'order must be cancelled';
  end if;

  select r.id into v_refund_id
  from public.refunds r
  where r.payment_id = v_payment.id
    and r.order_id = v_order.id
    and r.status in ('pending','processing','failed','completed')
  order by r.created_at desc
  limit 1;

  if v_refund_id is not null then
    return v_refund_id;
  end if;

  insert into public.refunds(
    payment_id,
    order_id,
    amount,
    reason,
    status,
    requested_by
  )
  values(
    v_payment.id,
    v_order.id,
    v_payment.amount,
    'Pagamento confirmado após cancelamento do pedido',
    'pending',
    v_order.customer_user_id
  )
  returning id into v_refund_id;

  return v_refund_id;
end;
$$;

revoke all on function public.ensure_cancelled_paid_order_refund(uuid) from public, anon, authenticated;
grant execute on function public.ensure_cancelled_paid_order_refund(uuid) to service_role;
