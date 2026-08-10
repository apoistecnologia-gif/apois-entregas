do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'merchant_subscriptions'
  ) then
    alter publication supabase_realtime add table public.merchant_subscriptions;
  end if;
end
$$;
