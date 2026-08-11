create table if not exists public.merchant_asaas_accounts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null unique references public.merchants(id) on delete cascade,
  asaas_account_id text,
  asaas_wallet_id text,
  encrypted_api_key text,
  api_key_iv text,
  holder_type text not null default 'individual' check (holder_type in ('individual','mei','company')),
  status text not null default 'pending' check (status in ('pending','active','blocked','error')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asaas_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  resource_type text,
  resource_id text,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_merchant_asaas_wallet on public.merchant_asaas_accounts(asaas_wallet_id);
create index if not exists idx_asaas_webhook_resource on public.asaas_webhook_events(resource_type, resource_id);

alter table public.merchant_asaas_accounts enable row level security;
alter table public.asaas_webhook_events enable row level security;

revoke all on public.merchant_asaas_accounts from anon, authenticated;
revoke all on public.asaas_webhook_events from anon, authenticated;
grant select on public.merchant_asaas_accounts to authenticated;

create policy merchant_asaas_account_owner_select on public.merchant_asaas_accounts
for select to authenticated
using (
  exists (
    select 1 from public.merchant_members mm
    where mm.merchant_id = merchant_asaas_accounts.merchant_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
  )
  or public.has_role(auth.uid(), 'admin'::public.app_role)
);

create or replace function public.touch_merchant_asaas_accounts_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_merchant_asaas_accounts on public.merchant_asaas_accounts;
create trigger trg_touch_merchant_asaas_accounts
before update on public.merchant_asaas_accounts
for each row execute function public.touch_merchant_asaas_accounts_updated_at();

revoke execute on function public.touch_merchant_asaas_accounts_updated_at() from public, anon, authenticated;
