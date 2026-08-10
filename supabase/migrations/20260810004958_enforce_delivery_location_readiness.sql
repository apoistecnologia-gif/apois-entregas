update public.merchants
set delivery_enabled = false,
    updated_at = now()
where approval_status = 'approved'
  and is_active = true
  and delivery_enabled = true
  and (latitude is null or longitude is null);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.merchants'::regclass
      and conname = 'merchants_delivery_requires_location'
  ) then
    alter table public.merchants
      add constraint merchants_delivery_requires_location
      check (
        approval_status <> 'approved'
        or is_active = false
        or delivery_enabled = false
        or (latitude is not null and longitude is not null)
      );
  end if;
end
$$;
