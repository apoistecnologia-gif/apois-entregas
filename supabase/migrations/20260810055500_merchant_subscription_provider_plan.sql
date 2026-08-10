alter table public.merchant_subscriptions
  add column if not exists provider_plan_id text;

create unique index if not exists merchant_subscriptions_provider_plan_id_uidx
  on public.merchant_subscriptions(provider_plan_id)
  where provider_plan_id is not null;
