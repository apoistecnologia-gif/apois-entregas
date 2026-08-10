drop policy if exists "Customers can view own delivery PIN at destination" on public.delivery_confirmation_secrets;
create policy "Customers can view own confirmation PIN when actionable"
on public.delivery_confirmation_secrets
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = delivery_confirmation_secrets.order_id
      and o.customer_user_id = (select auth.uid())
      and (
        (o.fulfillment_type = 'pickup' and o.status = 'ready_for_pickup')
        or
        (
          o.fulfillment_type = 'delivery'
          and exists (
            select 1
            from public.delivery_jobs dj
            where dj.order_id = o.id
              and dj.status = 'arrived_destination'
          )
        )
      )
  )
);
