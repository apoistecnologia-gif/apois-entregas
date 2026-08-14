revoke update on table public.payout_accounts from authenticated;

grant update (pix_key, holder_name, document, is_active, pix_key_type)
on table public.payout_accounts
to authenticated;
