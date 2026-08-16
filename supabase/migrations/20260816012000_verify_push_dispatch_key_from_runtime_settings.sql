create or replace function public.verify_push_dispatch_key(_candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(_candidate), '') is not null
    and exists (
      select 1
      from private.runtime_settings s
      where s.key = 'push_dispatch_webhook_secret'
        and nullif(btrim(s.value), '') is not null
        and s.value = _candidate
    ),
    false
  );
$$;

revoke all on function public.verify_push_dispatch_key(text) from public, anon, authenticated;
grant execute on function public.verify_push_dispatch_key(text) to service_role;
