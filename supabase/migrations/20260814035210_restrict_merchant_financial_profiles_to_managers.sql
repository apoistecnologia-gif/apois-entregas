drop policy if exists merchant_financial_profile_select on public.merchant_financial_profiles;
drop policy if exists merchant_financial_profile_insert on public.merchant_financial_profiles;
drop policy if exists merchant_financial_profile_update on public.merchant_financial_profiles;

create policy merchant_financial_profile_select
on public.merchant_financial_profiles
for select
to authenticated
using (
  public.current_user_is_merchant_manager(merchant_id)
  or public.current_user_is_admin()
);

create policy merchant_financial_profile_insert
on public.merchant_financial_profiles
for insert
to authenticated
with check (
  public.current_user_is_merchant_manager(merchant_id)
  or public.current_user_is_admin()
);

create policy merchant_financial_profile_update
on public.merchant_financial_profiles
for update
to authenticated
using (
  public.current_user_is_merchant_manager(merchant_id)
  or public.current_user_is_admin()
)
with check (
  public.current_user_is_merchant_manager(merchant_id)
  or public.current_user_is_admin()
);
