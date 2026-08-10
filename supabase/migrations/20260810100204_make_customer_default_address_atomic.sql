create unique index if not exists customer_addresses_one_default_per_user
  on public.customer_addresses(user_id)
  where is_default = true;

create or replace function public.set_default_customer_address(_address_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  if not exists (
    select 1
    from public.customer_addresses
    where id = _address_id
      and user_id = v_user_id
  ) then
    raise exception 'address not found';
  end if;

  update public.customer_addresses
  set is_default = (id = _address_id),
      updated_at = now()
  where user_id = v_user_id
    and is_default is distinct from (id = _address_id);
end;
$function$;

revoke all on function public.set_default_customer_address(uuid) from public, anon;
grant execute on function public.set_default_customer_address(uuid) to authenticated;
