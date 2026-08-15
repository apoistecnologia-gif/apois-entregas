-- The RLS policy already restricts UPDATE to the wallet owner, but the table
-- privilege was missing. Existing users therefore could create a PIX payout
-- account once and then could not edit/correct it from either courier or
-- merchant UI.
grant update on table public.payout_accounts to authenticated;
