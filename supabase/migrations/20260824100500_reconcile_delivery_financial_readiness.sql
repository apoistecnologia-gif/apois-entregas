-- RECONCILIATION MIGRATION — not a historical reproduction.
--
-- Same rationale as 20260824100000_reconcile_mercadopago_marketplace_schema.sql:
-- introspected from the live "APOIS ENTREGA - PRODUÇÃO" project on 2026-08-24
-- because the migrations that originally created these objects (applied
-- directly against production, most likely under names such as
-- guard_delivery_orders_until_courier_marketplace_live,
-- expose_delivery_checkout_readiness and
-- disable_legacy_courier_payout_until_marketplace_direct_live) were never
-- committed to git. Idempotent throughout; deliberately not re-applied to
-- production as part of this reconciliation, since production already has
-- these exact objects.
--
-- This is the mechanism that keeps courier payout frozen: orders of type
-- "delivery" are rejected at insert time, and the courier's legacy payout UI
-- is disabled client-side (see src/routes/courier.tsx and
-- src/components/CourierPendingPayoutProcessor.tsx), while
-- platform_settings.courier_payout_mode remains 'marketplace_direct_pending'
-- — Mercado Pago has not yet made third-party payout available.

insert into public.platform_settings (key, value)
values ('courier_payout_mode', '"marketplace_direct_pending"'::jsonb)
on conflict (key) do nothing;

create or replace function public.enforce_delivery_financial_readiness()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_mode text := 'marketplace_direct_pending';
begin
  if new.fulfillment_type = 'delivery' then
    select coalesce(nullif(trim(both '"' from ps.value::text), ''), v_mode)
      into v_mode
    from public.platform_settings ps
    where ps.key = 'courier_payout_mode';

    v_mode := coalesce(v_mode, 'marketplace_direct_pending');

    if v_mode <> 'marketplace_direct_live' then
      raise exception 'delivery is unavailable: courier marketplace payout not live';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists orders_require_delivery_financial_readiness on public.orders;

create trigger orders_require_delivery_financial_readiness
  before insert on public.orders
  for each row execute function public.enforce_delivery_financial_readiness();

create or replace function public.get_delivery_checkout_readiness()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_mode text := 'marketplace_direct_pending';
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;

  select coalesce(nullif(trim(both '"' from ps.value::text), ''), v_mode)
    into v_mode
  from public.platform_settings ps
  where ps.key = 'courier_payout_mode';

  v_mode := coalesce(v_mode, 'marketplace_direct_pending');

  return jsonb_build_object(
    'delivery_available', v_mode = 'marketplace_direct_live',
    'mode', v_mode,
    'message', case
      when v_mode = 'marketplace_direct_live'
        then 'Entrega disponível.'
      else 'A entrega está temporariamente indisponível enquanto o recebimento direto dos entregadores é finalizado. Você ainda pode escolher retirada quando o estabelecimento oferecer essa opção.'
    end
  );
end;
$function$;

grant execute on function public.get_delivery_checkout_readiness() to authenticated, service_role;
