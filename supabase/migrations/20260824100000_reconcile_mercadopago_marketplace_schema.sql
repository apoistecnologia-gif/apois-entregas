-- RECONCILIATION MIGRATION — not a historical reproduction.
--
-- This migration was written on 2026-08-24 by introspecting the CURRENT live
-- schema of the "APOIS ENTREGA - PRODUÇÃO" Supabase project (ref
-- sbvhdgyuuperszlsllji), because the original migrations that created these
-- objects (applied directly against production, outside the git-tracked
-- migration flow, most likely between 2026-08-21 and 2026-08-22 under names
-- such as merchant_mercadopago_oauth_accounts and
-- select_merchant_mercadopago_as_order_payment_provider) were never
-- committed to this repository and their exact original SQL could not be
-- recovered.
--
-- Every statement below is idempotent (CREATE ... IF NOT EXISTS / CREATE OR
-- REPLACE / guarded ADD CONSTRAINT) so that:
--   1. Applied to a fresh database, it converges to the schema the current
--      APOIS Entregas application actually depends on.
--   2. Applied again to a database that already has these objects (i.e.
--      current production), it is a behavioral no-op.
-- It was deliberately NOT applied to production as part of this reconciliation
-- (see audit report) — production already has these objects; this file exists
-- so git can reproduce them elsewhere.

create table if not exists public.merchant_mercadopago_accounts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  provider_user_id text,
  account_email text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_iv text,
  refresh_token_iv text,
  token_type text not null default 'Bearer',
  scope text,
  access_token_expires_at timestamptz,
  status text not null default 'connected',
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_refreshed_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_mercadopago_accounts_merchant_key unique (merchant_id),
  constraint merchant_mercadopago_accounts_status_check
    check (status = any (array['connected','refresh_required','revoked','disconnected','error']))
);

create index if not exists merchant_mercadopago_accounts_provider_user_idx
  on public.merchant_mercadopago_accounts (provider_user_id)
  where provider_user_id is not null;

create index if not exists merchant_mercadopago_accounts_status_idx
  on public.merchant_mercadopago_accounts (status);

create table if not exists public.merchant_mercadopago_oauth_states (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null,
  code_verifier_encrypted text,
  code_verifier_iv text,
  redirect_after text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint merchant_mercadopago_oauth_states_state_hash_key unique (state_hash)
);

create index if not exists merchant_mp_oauth_states_expiry_idx
  on public.merchant_mercadopago_oauth_states (expires_at)
  where used_at is null;

alter table public.merchant_mercadopago_accounts enable row level security;
alter table public.merchant_mercadopago_oauth_states enable row level security;

-- No RLS policies: both tables hold OAuth tokens and are reachable only via
-- SECURITY DEFINER functions / Edge Functions using the service role, never
-- directly through PostgREST — matches confirmed production grants (only
-- postgres and service_role; no anon/authenticated privileges).
revoke all on public.merchant_mercadopago_accounts from anon, authenticated;
revoke all on public.merchant_mercadopago_oauth_states from anon, authenticated;
grant all on public.merchant_mercadopago_accounts to service_role;
grant all on public.merchant_mercadopago_oauth_states to service_role;

-- Mercado Pago marketplace fields on payments (order charges created with the
-- merchant's own OAuth-connected account; application_fee is always 0).
alter table public.payments add column if not exists provider_charge_id text;
alter table public.payments add column if not exists provider_seller_id text;
alter table public.payments add column if not exists merchant_mercadopago_account_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_merchant_mercadopago_account_id_fkey'
  ) then
    alter table public.payments
      add constraint payments_merchant_mercadopago_account_id_fkey
      foreign key (merchant_mercadopago_account_id)
      references public.merchant_mercadopago_accounts(id)
      on delete set null;
  end if;
end $$;

-- Resolves which payment provider create-order/checkout should use for a
-- given order; defaults to 'mercadopago' only if the setting row is absent.
create or replace function public.get_order_payment_provider()
returns text
language sql
stable security definer
set search_path to ''
as $function$
  select coalesce(
    (select trim(both '"' from value::text) from public.platform_settings where key='order_payment_provider' limit 1),
    'mercadopago'
  );
$function$;

grant execute on function public.get_order_payment_provider() to authenticated, service_role;

-- Seed rows only if absent — never overwrites the live configured values.
insert into public.platform_settings (key, value)
values
  ('order_payment_provider', '"mercadopago_merchant"'::jsonb),
  ('merchant_order_payment_provider', '"mercadopago_oauth"'::jsonb),
  ('merchant_order_application_fee_cents', '0'::jsonb),
  ('mercadopago_marketplace_oauth_enabled', 'true'::jsonb),
  ('mercado_pago_environment', '"test"'::jsonb),
  ('mercadopago_split_1n_mode', '"commercial_enablement_pending"'::jsonb)
on conflict (key) do nothing;
