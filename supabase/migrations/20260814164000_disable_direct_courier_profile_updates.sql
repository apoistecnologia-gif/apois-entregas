revoke update on table public.couriers from authenticated;

drop policy if exists "Couriers update own editable profile" on public.couriers;
