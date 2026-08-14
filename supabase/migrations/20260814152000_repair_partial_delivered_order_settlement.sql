create or replace function public.settle_delivered_order_financials(_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_job public.delivery_jobs;
  v_merchant public.merchants;
  v_rule public.fee_rules;
  v_has_job boolean := false;
  v_has_rule boolean := false;
  v_financials_precomputed boolean := false;
  v_commission numeric(12,2) := 0;
  v_configured_courier_earnings numeric(12,2) := 0;
  v_courier_earnings numeric(12,2) := 0;
  v_merchant_net numeric(12,2) := 0;
  v_platform_fee numeric(12,2) := 0;
  v_available_pool numeric(12,2) := 0;
  v_distance_km numeric := 0;
  v_merchant_wallet uuid;
  v_courier_wallet uuid;
  v_platform_wallet uuid;
  v_has_reserved_merchant_funds boolean := false;
begin
  select * into v_order
  from public.orders o
  where o.id = _order_id
  for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status <> 'delivered' then raise exception 'order is not delivered'; end if;

  select * into v_merchant
  from public.merchants m
  where m.id = v_order.merchant_id;
  if not found then raise exception 'merchant not found'; end if;

  select * into v_job
  from public.delivery_jobs dj
  where dj.order_id = _order_id;
  v_has_job := found;
  if v_order.fulfillment_type = 'delivery' and (not v_has_job or v_job.courier_id is null) then
    raise exception 'delivered order has no courier';
  end if;

  v_financials_precomputed :=
    v_order.merchant_net is not null
    and v_order.courier_earnings is not null
    and v_order.platform_fee is not null;

  -- A fully settled order may return immediately. A partially settled order must
  -- continue so missing ledger legs can be repaired through idempotent postings.
  if v_financials_precomputed
     and (
       coalesce(v_order.merchant_net, 0) <= 0
       or exists (
         select 1
         from public.wallet_transactions wt
         where wt.idempotency_key in (
           'order-merchant:' || _order_id::text,
           'order-merchant-release:' || _order_id::text
         )
       )
     )
     and (
       coalesce(v_order.platform_fee, 0) <= 0
       or exists (
         select 1
         from public.wallet_transactions wt
         where wt.idempotency_key = 'order-platform:' || _order_id::text
       )
     )
     and (
       v_order.fulfillment_type <> 'delivery'
       or coalesce(v_order.courier_earnings, 0) <= 0
       or exists (
         select 1
         from public.wallet_transactions wt
         where wt.idempotency_key = 'order-courier:' || _order_id::text
       )
     ) then
    return;
  end if;

  if v_financials_precomputed then
    -- Preserve the financial snapshot already recorded on the order. This avoids
    -- recalculating an old delivery using fee rules that may have changed later.
    v_merchant_net := greatest(round(v_order.merchant_net::numeric, 2), 0);
    v_courier_earnings := greatest(round(v_order.courier_earnings::numeric, 2), 0);
    v_platform_fee := greatest(round(v_order.platform_fee::numeric, 2), 0);
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
    v_has_rule := found;

    if v_order.merchant_net is not null then
      v_merchant_net := greatest(round(v_order.merchant_net::numeric, 2), 0);
      v_commission := greatest(
        round((greatest(v_order.subtotal - v_order.discount, 0) - v_merchant_net)::numeric, 2),
        0
      );
    elsif v_has_rule then
      v_commission := round(
        (greatest(v_order.subtotal - v_order.discount, 0) * v_rule.merchant_commission_percent / 100.0)::numeric,
        2
      );
      v_merchant_net := greatest(
        round((v_order.subtotal - v_order.discount - v_commission)::numeric, 2),
        0
      );
    else
      v_merchant_net := greatest(round((v_order.subtotal - v_order.discount)::numeric, 2), 0);
    end if;

    if v_order.fulfillment_type = 'delivery' then
      if v_has_rule then
        v_distance_km := coalesce(v_job.estimated_distance_meters, 0)::numeric / 1000.0;
        v_configured_courier_earnings := round(
          greatest(
            v_rule.courier_minimum_fee,
            v_rule.courier_base_fee + (v_rule.courier_per_km * v_distance_km)
          )::numeric,
          2
        );
        v_available_pool := round((v_commission + v_order.service_fee + v_order.delivery_fee)::numeric, 2);
        v_courier_earnings := least(v_configured_courier_earnings, greatest(v_available_pool, 0));
      else
        v_courier_earnings := v_order.delivery_fee;
      end if;
    end if;

    v_platform_fee := greatest(
      round((v_commission + v_order.service_fee + v_order.delivery_fee - v_courier_earnings)::numeric, 2),
      0
    );

    update public.orders
    set merchant_net = v_merchant_net,
        courier_earnings = v_courier_earnings,
        platform_fee = v_platform_fee
    where id = _order_id;
  end if;

  insert into public.wallets(owner_type, merchant_id)
  values ('merchant', v_order.merchant_id)
  on conflict (merchant_id) where merchant_id is not null do nothing;
  select id into v_merchant_wallet from public.wallets where merchant_id = v_order.merchant_id;

  insert into public.wallets(owner_type)
  values ('platform')
  on conflict (owner_type) where owner_type = 'platform' do nothing;
  select id into v_platform_wallet from public.wallets where owner_type = 'platform';

  select exists (
    select 1
    from public.wallet_transactions wt
    where wt.idempotency_key = 'order-merchant-funded:' || _order_id::text
  ) into v_has_reserved_merchant_funds;

  if v_merchant_net > 0 then
    if v_has_reserved_merchant_funds then
      perform public.post_wallet_transaction(
        v_merchant_wallet,
        'order_earning',
        0,
        v_merchant_net,
        -v_merchant_net,
        'order-merchant-release:' || _order_id::text,
        'order',
        _order_id::text,
        'Repasse do pedido liberado após conclusão',
        'completed'
      );
    else
      perform public.post_wallet_transaction(
        v_merchant_wallet,
        'order_earning',
        v_merchant_net,
        v_merchant_net,
        0,
        'order-merchant:' || _order_id::text,
        'order',
        _order_id::text,
        'Repasse do pedido',
        'completed'
      );
    end if;
  end if;

  if v_platform_fee > 0 then
    perform public.post_wallet_transaction(
      v_platform_wallet,
      'platform_fee',
      v_platform_fee,
      v_platform_fee,
      0,
      'order-platform:' || _order_id::text,
      'order',
      _order_id::text,
      'Receita da plataforma',
      'completed'
    );
  end if;

  if v_order.fulfillment_type = 'delivery' and v_courier_earnings > 0 then
    insert into public.wallets(owner_type, courier_id)
    values ('courier', v_job.courier_id)
    on conflict (courier_id) where courier_id is not null do nothing;
    select id into v_courier_wallet from public.wallets where courier_id = v_job.courier_id;
    perform public.post_wallet_transaction(
      v_courier_wallet,
      'order_earning',
      v_courier_earnings,
      v_courier_earnings,
      0,
      'order-courier:' || _order_id::text,
      'order',
      _order_id::text,
      'Ganho da entrega',
      'completed'
    );
  end if;
end;
$$;
