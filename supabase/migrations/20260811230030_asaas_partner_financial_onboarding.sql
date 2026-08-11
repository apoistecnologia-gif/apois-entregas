alter table public.profiles add column if not exists cpf text;

create unique index if not exists profiles_cpf_unique
on public.profiles (regexp_replace(cpf, '\D', '', 'g'))
where cpf is not null and btrim(cpf) <> '';

create table if not exists public.merchant_financial_profiles (
  merchant_id uuid primary key references public.merchants(id) on delete cascade,
  holder_type text not null check (holder_type in ('individual','mei','company')),
  legal_name text not null,
  cpf_cnpj text not null,
  birth_date date,
  company_type text check (company_type is null or company_type in ('MEI','LIMITED','INDIVIDUAL','ASSOCIATION')),
  email text not null,
  mobile_phone text not null,
  income_value numeric(14,2) not null check (income_value > 0),
  address text not null,
  address_number text not null,
  complement text,
  province text not null,
  postal_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_financial_pf_birth check (holder_type <> 'individual' or birth_date is not null),
  constraint merchant_financial_pj_type check (holder_type = 'individual' or company_type is not null)
);

create unique index if not exists merchant_financial_cpf_cnpj_unique
on public.merchant_financial_profiles (regexp_replace(cpf_cnpj, '\D', '', 'g'));

alter table public.merchant_financial_profiles enable row level security;
revoke all on public.merchant_financial_profiles from anon, authenticated;
grant select, insert, update on public.merchant_financial_profiles to authenticated;

create policy merchant_financial_profile_select on public.merchant_financial_profiles
for select to authenticated using (
  exists (select 1 from public.merchant_members mm where mm.merchant_id = merchant_financial_profiles.merchant_id and mm.user_id = auth.uid() and mm.status='active')
  or public.has_role(auth.uid(), 'admin'::public.app_role)
);

create policy merchant_financial_profile_insert on public.merchant_financial_profiles
for insert to authenticated with check (
  exists (select 1 from public.merchant_members mm where mm.merchant_id = merchant_financial_profiles.merchant_id and mm.user_id = auth.uid() and mm.status='active')
  or public.has_role(auth.uid(), 'admin'::public.app_role)
);

create policy merchant_financial_profile_update on public.merchant_financial_profiles
for update to authenticated using (
  exists (select 1 from public.merchant_members mm where mm.merchant_id = merchant_financial_profiles.merchant_id and mm.user_id = auth.uid() and mm.status='active')
  or public.has_role(auth.uid(), 'admin'::public.app_role)
) with check (
  exists (select 1 from public.merchant_members mm where mm.merchant_id = merchant_financial_profiles.merchant_id and mm.user_id = auth.uid() and mm.status='active')
  or public.has_role(auth.uid(), 'admin'::public.app_role)
);

create or replace function public.touch_merchant_financial_profiles_updated_at()
returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists trg_touch_merchant_financial_profiles on public.merchant_financial_profiles;
create trigger trg_touch_merchant_financial_profiles before update on public.merchant_financial_profiles for each row execute function public.touch_merchant_financial_profiles_updated_at();
revoke execute on function public.touch_merchant_financial_profiles_updated_at() from public, anon, authenticated;

insert into public.platform_settings(key,value)
values ('order_payment_provider','"mercadopago"'::jsonb)
on conflict (key) do nothing;
