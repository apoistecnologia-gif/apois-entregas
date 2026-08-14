revoke select on table public.merchant_asaas_accounts from authenticated;

grant select (
  id,
  merchant_id,
  asaas_account_id,
  asaas_wallet_id,
  holder_type,
  status,
  last_error,
  created_at,
  updated_at
) on table public.merchant_asaas_accounts to authenticated;

drop policy if exists merchant_asaas_account_owner_select on public.merchant_asaas_accounts;

create policy merchant_asaas_account_manager_select
on public.merchant_asaas_accounts
for select
to authenticated
using (
  public.current_user_is_merchant_manager(merchant_id)
  or public.current_user_is_admin()
);
