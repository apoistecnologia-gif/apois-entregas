alter table public.merchant_subscription_payments
  add column if not exists method text not null default 'pix',
  add column if not exists qr_code_text text,
  add column if not exists qr_code_image_url text,
  add column if not exists expires_at timestamptz,
  add column if not exists idempotency_key text,
  add column if not exists failure_reason text;

create unique index if not exists merchant_subscription_payments_idempotency_uidx
  on public.merchant_subscription_payments(idempotency_key)
  where idempotency_key is not null;

update public.merchant_subscriptions
set provider_plan_id = null,
    provider_preapproval_id = null,
    checkout_url = null,
    provider_status = 'pending',
    metadata = jsonb_build_object(
      'environment', coalesce(metadata->>'environment', 'test'),
      'billingModel', 'monthly_pix'
    ),
    updated_at = now()
where provider = 'mercadopago'
  and current_period_end is null;
