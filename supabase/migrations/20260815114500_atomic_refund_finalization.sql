create or replace function public.finalize_refund_state_atomically()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_payment public.payments;
  v_now timestamptz := coalesce(new.processed_at, now());
  v_transitioned boolean := false;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  select * into v_payment
  from public.payments p
  where p.id = new.payment_id
  for update;
  if not found then
    raise exception 'refund payment not found';
  end if;

  select * into v_order
  from public.orders o
  where o.id = new.order_id
  for update;
  if not found then
    raise exception 'refund order not found';
  end if;

  if v_payment.order_id is distinct from new.order_id then
    raise exception 'refund payment/order mismatch';
  end if;
  if round(v_payment.amount * 100) <> round(new.amount * 100) then
    raise exception 'refund amount/payment mismatch';
  end if;

  update public.payments
  set status = 'refunded',
      updated_at = now()
  where id = new.payment_id;

  if v_order.status = 'cancelled' then
    update public.orders
    set status = 'refunded',
        payment_status = 'refunded'
    where id = new.order_id;
    v_transitioned := true;
  else
    update public.orders
    set payment_status = 'refunded'
    where id = new.order_id;
  end if;

  if v_transitioned then
    insert into public.order_status_history(order_id,status,changed_by_user_id)
    select new.order_id,'refunded',new.requested_by
    where not exists (
      select 1
      from public.order_status_history h
      where h.order_id = new.order_id
        and h.status = 'refunded'
    );
  end if;

  if new.provider_refund_id is not null then
    insert into public.payment_transactions(
      payment_id,
      provider_transaction_id,
      transaction_type,
      amount,
      status,
      processed_at
    ) values (
      new.payment_id,
      new.provider_refund_id,
      'refund',
      new.amount,
      'completed',
      v_now
    )
    on conflict(payment_id,provider_transaction_id,transaction_type) do update
    set amount = excluded.amount,
        status = 'completed',
        processed_at = coalesce(public.payment_transactions.processed_at, excluded.processed_at);
  end if;

  return new;
end;
$function$;

revoke all on function public.finalize_refund_state_atomically() from public, anon, authenticated;

drop trigger if exists refunds_finalize_local_state on public.refunds;
create trigger refunds_finalize_local_state
after update of status on public.refunds
for each row
when (new.status = 'completed' and old.status is distinct from new.status)
execute function public.finalize_refund_state_atomically();

-- Repair any historical local rows that may have been left partially finalized
-- by a provider-confirmed refund. Existing healthy rows are unchanged.
update public.payments p
set status='refunded', updated_at=now()
from public.refunds r
where r.payment_id=p.id
  and r.status='completed'
  and p.status<>'refunded';

update public.orders o
set payment_status='refunded',
    status=case when o.status='cancelled' then 'refunded' else o.status end
from public.refunds r
where r.order_id=o.id
  and r.status='completed'
  and (o.payment_status<>'refunded' or o.status='cancelled');

insert into public.payment_transactions(payment_id,provider_transaction_id,transaction_type,amount,status,processed_at)
select r.payment_id,r.provider_refund_id,'refund',r.amount,'completed',coalesce(r.processed_at,r.updated_at,r.created_at)
from public.refunds r
where r.status='completed'
  and r.provider_refund_id is not null
on conflict(payment_id,provider_transaction_id,transaction_type) do update
set amount=excluded.amount,
    status='completed',
    processed_at=coalesce(public.payment_transactions.processed_at,excluded.processed_at);
