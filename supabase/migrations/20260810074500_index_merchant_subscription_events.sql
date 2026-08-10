create index if not exists merchant_subscription_events_subscription_idx
  on public.merchant_subscription_events(merchant_subscription_id, created_at desc);
