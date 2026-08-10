# Supabase migration reconciliation — 2026-08-10

This note extends `MIGRATION_RECONCILIATION.md` for the production changes made on 2026-08-10.

## Source of truth

The production ledger in `supabase_migrations.schema_migrations` is authoritative for what has actually been applied to project `sbvhdgyuuperszlsllji`.

Do **not** run `supabase migration repair`, rename applied migrations, or re-apply SQL only to make historical timestamps look identical. Reconciliation must preserve the database state and first prove semantic equivalence.

## Historical filename/version differences

The following production migrations are represented in Git by files with a different timestamp prefix. The semantic migration name identifies the intended counterpart:

| Production ledger | Git migration |
|---|---|
| `20260810013806 merchant_monthly_subscriptions` | `20260810014000_merchant_monthly_subscriptions.sql` |
| `20260810054741 merchant_subscription_provider_plan` | `20260810055500_merchant_subscription_provider_plan.sql` |
| `20260810055613 merchant_subscription_realtime` | `20260810061000_merchant_subscription_realtime.sql` |
| `20260810061411 merchant_subscription_pix_billing` | `20260810073500_merchant_subscription_pix_billing.sql` |
| `20260810062935 index_merchant_subscription_events` | `20260810074500_index_merchant_subscription_events.sql` |
| `20260810071641 harden_merchant_subscription_period_integrity` | `20260810041600_harden_merchant_subscription_period_integrity.sql` |
| `20260810072758 protect_approved_merchant_identity` | `20260810043000_protect_approved_merchant_identity.sql` |
| `20260810073032 separate_merchant_membership_from_billing_state` | `20260810044500_separate_merchant_membership_from_billing_state.sql` |
| `20260810074049 validate_courier_identity_fields` | `20260810050500_validate_courier_identity_fields.sql` |
| `20260810075155 isolate_merchant_private_data` | `20260810055000_isolate_merchant_private_data.sql` |
| `20260810081209 bind_merchant_subscription_to_payment_environment` | `20260810062000_bind_merchant_subscription_to_payment_environment.sql` |

These rows are documentation of an already-existing historical mismatch; they are **not** instructions to execute either side again.

## Exact version tracking after reconciliation

From the production ledger version `20260810091041` onward, product migrations are tracked in Git with the production version ID, including the current tail:

- `20260810123427_make_maps_rate_limit_table_explicitly_private.sql`
- `20260810123453_lock_approved_document_storage_evidence.sql`
- `20260810123901_bind_partner_document_rows_to_storage_owner.sql`
- `20260810123924_preserve_submitted_support_attachment_evidence.sql`
- `20260810124327_reveal_delivery_pin_only_at_destination.sql`
- `20260810124454_protect_approved_courier_identity_and_vehicle.sql`
- `20260810124638_preserve_pickup_pin_visibility_at_ready.sql`
- `20260810155230_allow_wallet_owners_update_payout_account_fields.sql`
- `20260810155943_allow_merchant_managers_touch_updated_at.sql`

Emergency diagnostics, probes, or no-op migration-ledger entries can exist only in the remote history when they did not become part of the product schema. Their corresponding Edge Function source/state is reconciled separately in `EDGE_FUNCTION_RECONCILIATION.md`.

## Safe operating rule

Before `supabase db push`, migration repair, or any production migration operation:

1. compare the local migration directory with `supabase_migrations.schema_migrations`;
2. consult this file and `MIGRATION_RECONCILIATION.md`;
3. do not re-apply any historical counterpart listed above;
4. create all new structural changes with the exact production version tracked in Git.
