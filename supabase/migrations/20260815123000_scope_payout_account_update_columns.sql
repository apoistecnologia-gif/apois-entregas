-- Keep payout account editing functional without exposing metadata/review columns
-- to direct client updates. RLS still requires current_user_owns_wallet(wallet_id).
revoke update on table public.payout_accounts from authenticated;
grant update (
  wallet_id,
  account_type,
  pix_key,
  pix_key_type,
  holder_name,
  document,
  is_active
) on table public.payout_accounts to authenticated;
