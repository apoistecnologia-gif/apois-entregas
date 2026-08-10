create or replace function public.enforce_approved_subscription_payment_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'approved' then
    if new.status is distinct from old.status
      or new.paid_at is distinct from old.paid_at
      or new.amount is distinct from old.amount
      or new.currency is distinct from old.currency
      or new.merchant_subscription_id is distinct from old.merchant_subscription_id
      or new.provider_authorized_payment_id is distinct from old.provider_authorized_payment_id
    then
      raise exception 'approved merchant subscription payment is immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_approved_subscription_payment_immutable
  on public.merchant_subscription_payments;
create trigger trg_approved_subscription_payment_immutable
before update on public.merchant_subscription_payments
for each row execute function public.enforce_approved_subscription_payment_immutability();

create or replace function public.enforce_merchant_subscription_period_from_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_latest_paid_at timestamptz;
  v_max_period_end timestamptz;
begin
  if new.current_period_end is null then
    return new;
  end if;

  if old.current_period_end is not distinct from new.current_period_end
     and old.current_period_start is not distinct from new.current_period_start then
    return new;
  end if;

  select max(p.paid_at)
  into v_latest_paid_at
  from public.merchant_subscription_payments p
  where p.merchant_subscription_id = new.id
    and p.status = 'approved'
    and p.paid_at is not null;

  if v_latest_paid_at is null then
    raise exception 'merchant subscription period requires an approved payment';
  end if;

  v_max_period_end := v_latest_paid_at + interval '1 month';

  if new.current_period_start is null
     or new.current_period_start < v_latest_paid_at - interval '1 minute'
     or new.current_period_start > v_latest_paid_at + interval '1 minute' then
    raise exception 'merchant subscription period start must match latest approved payment';
  end if;

  if new.current_period_end > v_max_period_end + interval '1 minute' then
    raise exception 'merchant subscription period exceeds paid monthly entitlement';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_merchant_subscription_period_from_payment
  on public.merchant_subscriptions;
create trigger trg_merchant_subscription_period_from_payment
before update on public.merchant_subscriptions
for each row execute function public.enforce_merchant_subscription_period_from_payment();
