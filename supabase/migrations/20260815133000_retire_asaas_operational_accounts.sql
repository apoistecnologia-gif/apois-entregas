-- Asaas was retired from the APOIS ENTREGAS operational payment path.
-- Preserve encrypted historical identifiers for audit/reconciliation, but make
-- every previously-active subaccount non-operational so no stale UI or future
-- provider toggle can silently reuse it.
update public.merchant_asaas_accounts
set status = 'blocked',
    last_error = 'Asaas retired from APOIS ENTREGAS operational flow on 2026-08-15',
    updated_at = now()
where status = 'active';
