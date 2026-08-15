create or replace function public.activate_merchant_subscription_from_approved_payment()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_subscription public.merchant_subscriptions;
  v_environment text;
  v_paid_at timestamptz;
  v_period_base timestamptz;
  v_period_end timestamptz;
begin
  if new.status <> 'approved'
     or (tg_op = 'UPDATE' and old.status = 'approved') then
    return new;
  end if;

  select *
  into v_subscription
  from public.merchant_subscriptions ms
  where ms.id = new.merchant_subscription_id
  for update;

  if not found then
    raise exception 'merchant subscription not found';
  end if;

  if round(new.amount * 100) <> round(v_subscription.amount * 100)
     or new.currency <> v_subscription.currency then
    raise exception 'merchant subscription payment amount/currency mismatch';
  end if;

  select nullif(lower(btrim(ps.value #>> '{}')), '')
  into v_environment
  from public.platform_settings ps
  where ps.key = 'mercado_pago_environment';

  if v_environment not in ('test','production') then
    raise exception 'merchant subscription payment environment is not configured';
  end if;

  v_paid_at := coalesce(new.paid_at, new.debit_date, new.created_at, now());
  v_period_base := greatest(
    v_paid_at,
    coalesce(v_subscription.current_period_end, v_paid_at)
  );
  v_period_end := v_period_base + interval '1 month';

  update public.merchant_subscriptions
  set provider_status = 'paid',
      current_period_start = v_paid_at,
      current_period_end = v_period_end,
      next_payment_at = v_period_end,
      last_payment_at = v_paid_at,
      last_payment_status = 'approved',
      metadata = coalesce(v_subscription.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'environment', v_environment,
          'billingModel', coalesce(nullif(v_subscription.metadata->>'billingModel',''), 'monthly_pix')
        ),
      updated_at = now()
  where id = v_subscription.id;

  return new;
end;
$function$;

revoke all on function public.activate_merchant_subscription_from_approved_payment()
  from public, anon, authenticated;

drop trigger if exists merchant_subscription_payment_activate_access
  on public.merchant_subscription_payments;
create trigger merchant_subscription_payment_activate_access
after insert or update of status
on public.merchant_subscription_payments
for each row
when (new.status = 'approved')
execute function public.activate_merchant_subscription_from_approved_payment();
