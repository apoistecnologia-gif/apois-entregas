alter table public.merchant_hours
  add column if not exists second_opens_at time without time zone,
  add column if not exists second_closes_at time without time zone;

alter table public.merchant_hours
  drop constraint if exists merchant_hours_second_interval_check;

alter table public.merchant_hours
  add constraint merchant_hours_second_interval_check check (
    (second_opens_at is null and second_closes_at is null)
    or (
      is_closed = false
      and second_opens_at is not null
      and second_closes_at is not null
    )
  );

create table if not exists public.merchant_special_hours (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  service_date date not null,
  is_closed boolean not null default true,
  opens_at time without time zone,
  closes_at time without time zone,
  second_opens_at time without time zone,
  second_closes_at time without time zone,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_special_hours_merchant_date_key unique (merchant_id, service_date),
  constraint merchant_special_hours_valid_primary check (
    (is_closed = true and opens_at is null and closes_at is null and second_opens_at is null and second_closes_at is null)
    or (is_closed = false and opens_at is not null and closes_at is not null)
  ),
  constraint merchant_special_hours_second_interval_check check (
    (second_opens_at is null and second_closes_at is null)
    or (is_closed = false and second_opens_at is not null and second_closes_at is not null)
  )
);

create index if not exists idx_merchant_special_hours_lookup
  on public.merchant_special_hours (merchant_id, service_date);

alter table public.merchant_special_hours enable row level security;

grant select, insert, update, delete on table public.merchant_special_hours to authenticated;
revoke all on table public.merchant_special_hours from anon;

create policy "Authenticated users can view special hours of active merchants"
on public.merchant_special_hours
for select
to authenticated
using (
  exists (
    select 1
    from public.merchants m
    where m.id = merchant_special_hours.merchant_id
      and m.is_active = true
  )
);

create policy "Merchant managers insert special hours"
on public.merchant_special_hours
for insert
to authenticated
with check (public.current_user_is_merchant_manager(merchant_id));

create policy "Merchant managers update special hours"
on public.merchant_special_hours
for update
to authenticated
using (public.current_user_is_merchant_manager(merchant_id))
with check (public.current_user_is_merchant_manager(merchant_id));

create policy "Merchant managers delete special hours"
on public.merchant_special_hours
for delete
to authenticated
using (public.current_user_is_merchant_manager(merchant_id));
