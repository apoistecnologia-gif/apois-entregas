create policy "Merchant managers view coupon redemptions"
on public.coupon_redemptions
for select
to authenticated
using (
  exists (
    select 1
    from public.coupons c
    where c.id = coupon_redemptions.coupon_id
      and c.merchant_id is not null
      and public.current_user_is_merchant_manager(c.merchant_id)
  )
  or public.current_user_is_admin()
);
