drop policy if exists "Customers can view own delivery PIN" on public.delivery_confirmation_secrets;
create policy "Customers can view own delivery PIN at destination"
on public.delivery_confirmation_secrets
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    join public.delivery_jobs dj on dj.order_id = o.id
    where o.id = delivery_confirmation_secrets.order_id
      and o.customer_user_id = (select auth.uid())
      and dj.status = 'arrived_destination'
  )
);
