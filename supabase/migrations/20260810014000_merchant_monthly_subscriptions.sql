create table if not exists public.merchant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null unique references public.merchants(id) on delete cascade,
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  provider_preapproval_id text unique,
  provider_status text not null default 'pending',
  amount numeric(10,2) not null default 69.90 check (amount > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  billing_frequency text not null default 'monthly' check (billing_frequency = 'monthly'),
  checkout_url text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_payment_at timestamptz,
  last_payment_at timestamptz,
  last_payment_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.merchant_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  merchant_subscription_id uuid not null references public.merchant_subscriptions(id) on delete cascade,
  provider_authorized_payment_id text not null unique,
  provider_payment_id text,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  status text not null,
  debit_date timestamptz,
  paid_at timestamptz,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists merchant_subscription_payments_subscription_idx
  on public.merchant_subscription_payments(merchant_subscription_id, debit_date desc);
create index if not exists merchant_subscriptions_period_end_idx
  on public.merchant_subscriptions(current_period_end);

create table if not exists public.merchant_subscription_events (
  id uuid primary key default gen_random_uuid(),
  merchant_subscription_id uuid references public.merchant_subscriptions(id) on delete cascade,
  provider_event_id text not null unique,
  event_type text not null,
  provider_resource_id text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.merchant_subscriptions enable row level security;
alter table public.merchant_subscription_payments enable row level security;
alter table public.merchant_subscription_events enable row level security;

revoke all on public.merchant_subscriptions from anon, authenticated;
revoke all on public.merchant_subscription_payments from anon, authenticated;
revoke all on public.merchant_subscription_events from anon, authenticated;
grant select on public.merchant_subscriptions to authenticated;
grant select on public.merchant_subscription_payments to authenticated;
grant select on public.merchant_subscription_events to authenticated;
grant all on public.merchant_subscriptions to service_role;
grant all on public.merchant_subscription_payments to service_role;
grant all on public.merchant_subscription_events to service_role;

create policy "Merchant members read own subscription"
on public.merchant_subscriptions for select to authenticated
using (
  public.current_user_is_active()
  and exists (
    select 1 from public.merchant_members mm
    where mm.merchant_id = merchant_subscriptions.merchant_id
      and mm.user_id = (select auth.uid())
      and mm.status = 'active'
  )
);

create policy "Admins read merchant subscriptions"
on public.merchant_subscriptions for select to authenticated
using (public.current_user_is_admin());

create policy "Merchant members read own subscription payments"
on public.merchant_subscription_payments for select to authenticated
using (
  public.current_user_is_active()
  and exists (
    select 1
    from public.merchant_subscriptions ms
    join public.merchant_members mm on mm.merchant_id = ms.merchant_id
    where ms.id = merchant_subscription_payments.merchant_subscription_id
      and mm.user_id = (select auth.uid())
      and mm.status = 'active'
  )
);

create policy "Admins read merchant subscription payments"
on public.merchant_subscription_payments for select to authenticated
using (public.current_user_is_admin());

create policy "Merchant members read own subscription events"
on public.merchant_subscription_events for select to authenticated
using (
  public.current_user_is_active()
  and exists (
    select 1
    from public.merchant_subscriptions ms
    join public.merchant_members mm on mm.merchant_id = ms.merchant_id
    where ms.id = merchant_subscription_events.merchant_subscription_id
      and mm.user_id = (select auth.uid())
      and mm.status = 'active'
  )
);

create policy "Admins read merchant subscription events"
on public.merchant_subscription_events for select to authenticated
using (public.current_user_is_admin());

create or replace function public.merchant_subscription_in_good_standing(_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (
      select 1
      from public.merchants m
      where m.id = _merchant_id
        and m.approval_status = 'approved'
        and m.is_active = true
    ) then true
    else exists (
      select 1
      from public.merchant_subscriptions ms
      where ms.merchant_id = _merchant_id
        and ms.current_period_end is not null
        and ms.current_period_end > now()
    )
  end;
$$;

revoke all on function public.merchant_subscription_in_good_standing(uuid) from public, anon;
grant execute on function public.merchant_subscription_in_good_standing(uuid) to authenticated, service_role;

create or replace function public.current_user_is_merchant_member(_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_active()
    and public.merchant_subscription_in_good_standing(_merchant_id)
    and exists (
      select 1
      from public.merchants m
      where m.id = _merchant_id
        and (
          m.owner_user_id = (select auth.uid())
          or exists (
            select 1
            from public.merchant_members mm
            where mm.merchant_id = _merchant_id
              and mm.user_id = (select auth.uid())
              and mm.status = 'active'
          )
        )
    );
$$;

create or replace function public.current_user_is_merchant_manager(_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_active()
    and public.merchant_subscription_in_good_standing(_merchant_id)
    and exists (
      select 1
      from public.merchants m
      where m.id = _merchant_id
        and (
          m.owner_user_id = (select auth.uid())
          or exists (
            select 1
            from public.merchant_members mm
            where mm.merchant_id = _merchant_id
              and mm.user_id = (select auth.uid())
              and mm.status = 'active'
              and mm.role in ('owner','manager')
          )
        )
    );
$$;

create or replace function public.current_user_is_merchant_owner(_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_active()
    and public.merchant_subscription_in_good_standing(_merchant_id)
    and exists (
      select 1
      from public.merchants m
      left join public.merchant_members mm
        on mm.merchant_id = m.id
       and mm.user_id = (select auth.uid())
       and mm.status = 'active'
       and mm.role = 'owner'
      where m.id = _merchant_id
        and (m.owner_user_id = (select auth.uid()) or mm.id is not null)
    );
$$;

create policy "Merchant members read billing locked merchant"
on public.merchants for select to authenticated
using (
  public.current_user_is_active()
  and exists (
    select 1 from public.merchant_members mm
    where mm.merchant_id = merchants.id
      and mm.user_id = (select auth.uid())
      and mm.status = 'active'
  )
);

drop policy if exists "Allow authenticated to select active merchants" on public.merchants;
create policy "Authenticated browse billable active merchants"
on public.merchants for select to authenticated
using (
  is_active = true
  and approval_status = 'approved'
  and public.merchant_subscription_in_good_standing(id)
);

create or replace function public.enforce_merchant_subscription_on_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.merchant_subscription_in_good_standing(new.merchant_id) then
    raise exception 'merchant subscription inactive';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_merchant_subscription_on_order on public.orders;
create trigger trg_enforce_merchant_subscription_on_order
before insert on public.orders
for each row execute function public.enforce_merchant_subscription_on_order();

insert into public.merchant_subscriptions(merchant_id, provider_status, amount, currency, billing_frequency)
select m.id, 'pending', 69.90, 'BRL', 'monthly'
from public.merchants m
where m.approval_status = 'approved' and m.is_active = true
on conflict (merchant_id) do nothing;
