drop policy if exists "Customers track assigned courier" on public.courier_locations;

create policy "Customers track assigned courier"
on public.courier_locations
for select
to authenticated
using (
  public.current_user_is_active()
  and exists (
    select 1
    from public.delivery_jobs dj
    join public.orders o on o.id = dj.order_id
    where dj.courier_id = courier_locations.courier_id
      and o.customer_user_id = (select auth.uid())
      and dj.status in (
        'accepted',
        'arriving_pickup',
        'at_pickup',
        'picked_up',
        'on_the_way',
        'arrived_destination'
      )
  )
);
