create or replace function public.sync_completed_refund_order_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    update public.orders o
    set payment_status = 'refunded',
        status = 'refunded'
    where o.id = new.order_id
      and (o.payment_status is distinct from 'refunded' or o.status is distinct from 'refunded');

    if found and not exists (
      select 1
      from public.order_status_history h
      where h.order_id = new.order_id
        and h.status = 'refunded'
    ) then
      insert into public.order_status_history(order_id, status, changed_by_user_id)
      values (new.order_id, 'refunded', new.requested_by);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_completed_refund_order_state() from public, anon, authenticated;

drop trigger if exists sync_completed_refund_order_state on public.refunds;
create trigger sync_completed_refund_order_state
after insert or update of status on public.refunds
for each row
when (new.status = 'completed')
execute function public.sync_completed_refund_order_state();

update public.orders o
set payment_status = 'refunded',
    status = 'refunded'
where exists (
  select 1
  from public.refunds r
  where r.order_id = o.id
    and r.status = 'completed'
)
and (o.payment_status is distinct from 'refunded' or o.status is distinct from 'refunded');

insert into public.order_status_history(order_id, status, changed_by_user_id)
select r.order_id, 'refunded', r.requested_by
from public.refunds r
where r.status = 'completed'
  and not exists (
    select 1
    from public.order_status_history h
    where h.order_id = r.order_id
      and h.status = 'refunded'
  );
