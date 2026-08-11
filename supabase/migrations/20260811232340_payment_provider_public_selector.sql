create or replace function public.get_order_payment_provider()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select trim(both '"' from value::text) from public.platform_settings where key='order_payment_provider' limit 1),
    'mercadopago'
  );
$$;
revoke all on function public.get_order_payment_provider() from public, anon;
grant execute on function public.get_order_payment_provider() to authenticated;
