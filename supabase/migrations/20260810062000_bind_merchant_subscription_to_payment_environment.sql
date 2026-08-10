insert into public.platform_settings(key,value,description)
values(
  'mercado_pago_environment',
  '"test"'::jsonb,
  'Ambiente de pagamentos vigente para cobranças Mercado Pago: test ou production.'
)
on conflict (key) do nothing;

create or replace function public.merchant_subscription_in_good_standing(_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (
      select 1
      from public.merchants m
      where m.id = _merchant_id
        and m.approval_status = 'approved'
        and m.is_active = true
    ) then true
    else exists (
      select 1
      from public.merchant_subscriptions ms
      join public.platform_settings ps
        on ps.key = 'mercado_pago_environment'
      where ms.merchant_id = _merchant_id
        and ms.current_period_end is not null
        and ms.current_period_end > now()
        and coalesce(ms.metadata->>'environment','') = coalesce(ps.value #>> '{}','')
        and coalesce(ms.last_payment_status,'') = 'approved'
    )
  end;
$$;

create or replace function public.enforce_merchant_subscription_period_from_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_latest_paid_at timestamptz;
  v_max_period_end timestamptz;
  v_current_environment text;
begin
  if new.current_period_end is null then
    return new;
  end if;

  if old.current_period_end is not distinct from new.current_period_end
     and old.current_period_start is not distinct from new.current_period_start
     and old.metadata is not distinct from new.metadata
     and old.last_payment_status is not distinct from new.last_payment_status then
    return new;
  end if;

  select ps.value #>> '{}'
  into v_current_environment
  from public.platform_settings ps
  where ps.key = 'mercado_pago_environment';

  if v_current_environment not in ('test','production') then
    raise exception 'invalid mercado pago environment setting';
  end if;

  if coalesce(new.metadata->>'environment','') <> v_current_environment then
    raise exception 'merchant subscription entitlement belongs to a different payment environment';
  end if;

  if coalesce(new.last_payment_status,'') <> 'approved' then
    raise exception 'merchant subscription period requires approved payment status';
  end if;

  select max(p.paid_at)
  into v_latest_paid_at
  from public.merchant_subscription_payments p
  where p.merchant_subscription_id = new.id
    and p.status = 'approved'
    and p.paid_at is not null
    and coalesce(p.idempotency_key,'') like '%:pix:' || v_current_environment || ':attempt:%';

  if v_latest_paid_at is null then
    raise exception 'merchant subscription period requires an approved payment from current environment';
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
