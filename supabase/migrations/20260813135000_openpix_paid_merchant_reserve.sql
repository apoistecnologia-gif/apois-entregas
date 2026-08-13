create or replace function public.reserve_paid_order_merchant_net(_order_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_merchant public.merchants;
  v_rule public.fee_rules;
  v_commission numeric(12,2) := 0;
  v_merchant_net numeric(12,2) := 0;
  v_wallet_id uuid;
  v_existing_amount numeric(12,2);
begin
  select * into v_order
  from public.orders o
  where o.id = _order_id
  for update;

  if not found then
    raise exception 'order not found';
  end if;
  if v_order.payment_status <> 'paid' then
    raise exception 'order payment is not paid';
  end if;
  if v_order.status in ('cancelled', 'refunded') then
    return 0;
  end if;

  select wt.balance_delta
    into v_existing_amount
  from public.wallet_transactions wt
  where wt.idempotency_key = 'order-merchant-funded:' || _order_id::text
  limit 1;
  if found then
    return coalesce(v_existing_amount, 0);
  end if;

  select * into v_merchant
  from public.merchants m
  where m.id = v_order.merchant_id;
  if not found then
    raise exception 'merchant not found';
  end if;

  if v_order.merchant_net is not null then
    v_merchant_net := greatest(round(v_order.merchant_net::numeric, 2), 0);
  else
    select * into v_rule
    from public.fee_rules fr
    where fr.is_active = true
      and (fr.starts_at is null or fr.starts_at <= now())
      and (fr.ends_at is null or fr.ends_at > now())
      and (
        fr.merchant_id = v_order.merchant_id
        or (fr.merchant_id is null and fr.city_id = v_merchant.city_id)
      )
    order by (fr.merchant_id is not null) desc, fr.created_at desc
    limit 1;

    if found then
      v_commission := round(
        (greatest(v_order.subtotal - v_order.discount, 0) * v_rule.merchant_commission_percent / 100.0)::numeric,
        2
      );
    end if;

    v_merchant_net := greatest(
      round((v_order.subtotal - v_order.discount - v_commission)::numeric, 2),
      0
    );

    update public.orders
    set merchant_net = v_merchant_net
    where id = _order_id;
  end if;

  insert into public.wallets(owner_type, merchant_id)
  values ('merchant', v_order.merchant_id)
  on conflict (merchant_id) where merchant_id is not null do nothing;

  select id into v_wallet_id
  from public.wallets
  where merchant_id = v_order.merchant_id;

  if v_merchant_net > 0 then
    perform public.post_wallet_transaction(
      v_wallet_id,
      'order_earning',
      v_merchant_net,
      0,
      v_merchant_net,
      'order-merchant-funded:' || _order_id::text,
      'order',
      _order_id::text,
      'Repasse do pedido recebido e reservado até a conclusão',
      'completed'
    );
  end if;

  return v_merchant_net;
end;
$$;

revoke all on function public.reserve_paid_order_merchant_net(uuid) from public, anon, authenticated;
grant execute on function public.reserve_paid_order_merchant_net(uuid) to service_role;

create or replace function public.reverse_paid_order_merchant_reserve(_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet_id uuid;
  v_amount numeric(12,2);
begin
  select wt.wallet_id, wt.balance_delta
    into v_wallet_id, v_amount
  from public.wallet_transactions wt
  where wt.idempotency_key = 'order-merchant-funded:' || _order_id::text
  limit 1;

  if not found or coalesce(v_amount, 0) <= 0 then
    return;
  end if;

  if exists (
    select 1
    from public.wallet_transactions wt
    where wt.idempotency_key = 'order-merchant-release:' || _order_id::text
  ) then
    return;
  end if;

  perform public.post_wallet_transaction(
    v_wallet_id,
    'refund',
    -v_amount,
    0,
    -v_amount,
    'order-merchant-reserve-reversal:' || _order_id::text,
    'order',
    _order_id::text,
    'Reversão do repasse reservado após estorno/cancelamento',
    'completed'
  );
end;
$$;

revoke all on function public.reverse_paid_order_merchant_reserve(uuid) from public, anon, authenticated;
grant execute on function public.reverse_paid_order_merchant_reserve(uuid) to service_role;

create or replace function public.reverse_merchant_reserve_on_completed_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    perform public.reverse_paid_order_merchant_reserve(new.order_id);
  end if;
  return new;
end;
$$;

revoke all on function public.reverse_merchant_reserve_on_completed_refund() from public, anon, authenticated;

drop trigger if exists refunds_reverse_paid_merchant_reserve on public.refunds;
create trigger refunds_reverse_paid_merchant_reserve
after insert or update of status on public.refunds
for each row execute function public.reverse_merchant_reserve_on_completed_refund();
