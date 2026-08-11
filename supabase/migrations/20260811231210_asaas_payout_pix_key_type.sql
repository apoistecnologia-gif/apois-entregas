alter table public.payout_accounts add column if not exists pix_key_type text;
alter table public.payout_accounts drop constraint if exists payout_accounts_pix_key_type_check;
alter table public.payout_accounts add constraint payout_accounts_pix_key_type_check check (pix_key_type is null or pix_key_type in ('CPF','CNPJ','EMAIL','PHONE','EVP'));
create index if not exists idx_payouts_provider_payout_id on public.payouts(provider, provider_payout_id) where provider_payout_id is not null;
