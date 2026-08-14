revoke insert on table public.couriers from authenticated;

drop policy if exists "Users create secure courier application" on public.couriers;
