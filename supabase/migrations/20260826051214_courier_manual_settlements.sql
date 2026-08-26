-- Provisional manual Money Out model: the merchant pays the courier directly via
-- Pix outside the app, based on a daily closure ("fechamento") the platform
-- computes from delivered orders. APOIS never custodies or moves this money.
--
-- Reuses existing financial primitives (orders.courier_earnings, delivery_jobs,
-- payout_accounts, wallets) instead of a parallel ledger. Blocking is computed
-- live from due_at/status (no cron-driven state flip needed for correctness);
-- a periodic job only sends reminder/overdue notifications.

insert into public.platform_settings (key, value)
values ('merchant_manual_payout_grace_minutes', '1440'::jsonb)
on conflict (key) do nothing;

create table if not exists public.courier_settlements (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id),
  courier_id uuid not null references public.couriers(id),
  settlement_date date not null default current_date,
  delivery_count integer not null default 0 check (delivery_count >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','merchant_marked_paid','confirmed','disputed','admin_resolved')),
  due_at timestamptz not null,
  merchant_marked_paid_at timestamptz,
  proof_storage_path text,
  courier_confirmed_at timestamptz,
  disputed_at timestamptz,
  dispute_reason text,
  admin_resolved_at timestamptz,
  admin_resolved_by uuid,
  admin_resolution_outcome text check (admin_resolution_outcome in ('paid_confirmed','payment_required')),
  admin_resolution_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one OPEN settlement per merchant/courier/day; once it leaves
-- awaiting_payment, a later close on the same day starts a fresh one.
create unique index if not exists courier_settlements_open_unique_idx
  on public.courier_settlements (merchant_id, courier_id, settlement_date)
  where status = 'awaiting_payment';

create index if not exists courier_settlements_merchant_idx
  on public.courier_settlements (merchant_id, status);
create index if not exists courier_settlements_courier_idx
  on public.courier_settlements (courier_id, status);
create index if not exists courier_settlements_overdue_idx
  on public.courier_settlements (due_at)
  where status = 'awaiting_payment';

drop trigger if exists courier_settlements_set_updated_at on public.courier_settlements;
create trigger courier_settlements_set_updated_at
  before update on public.courier_settlements
  for each row execute function public.set_updated_at();

create table if not exists public.courier_settlement_deliveries (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.courier_settlements(id) on delete cascade,
  delivery_job_id uuid not null unique references public.delivery_jobs(id),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists courier_settlement_deliveries_settlement_idx
  on public.courier_settlement_deliveries (settlement_id);

alter table public.courier_settlements enable row level security;
alter table public.courier_settlement_deliveries enable row level security;

drop policy if exists "Merchant members view own courier settlements" on public.courier_settlements;
create policy "Merchant members view own courier settlements"
  on public.courier_settlements for select
  using (
    public.current_user_is_merchant_member(merchant_id)
    or courier_id = public.current_user_courier_id()
    or public.current_user_is_admin()
  );

drop policy if exists "Merchant members view own settlement deliveries" on public.courier_settlement_deliveries;
create policy "Merchant members view own settlement deliveries"
  on public.courier_settlement_deliveries for select
  using (
    exists (
      select 1 from public.courier_settlements cs
      where cs.id = settlement_id
        and (
          public.current_user_is_merchant_member(cs.merchant_id)
          or cs.courier_id = public.current_user_courier_id()
          or public.current_user_is_admin()
        )
    )
  );

revoke all on public.courier_settlements from public, anon;
grant select on public.courier_settlements to authenticated;
grant select on public.courier_settlements to service_role;
revoke all on public.courier_settlement_deliveries from public, anon;
grant select on public.courier_settlement_deliveries to authenticated;
grant select on public.courier_settlement_deliveries to service_role;

-- Read model: exposes an effective_status derived live from due_at so "overdue"
-- is always accurate and never depends on a scheduled job having run.
create or replace view public.courier_settlements_view
  with (security_invoker = true) as
select
  cs.*,
  case
    when cs.status = 'awaiting_payment' and cs.due_at < now() then 'overdue'
    else cs.status
  end as effective_status
from public.courier_settlements cs;

grant select on public.courier_settlements_view to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Closure: idempotent, concurrency-safe generation/append of daily settlements.
-- ---------------------------------------------------------------------------
create or replace function public.close_courier_settlements(_merchant_id uuid)
returns setof public.courier_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grace_minutes integer;
  v_courier record;
  v_settlement_id uuid;
  v_settlement public.courier_settlements;
  v_merchant_name text;
begin
  if not (public.current_user_is_merchant_manager(_merchant_id) or public.current_user_is_admin()) then
    raise exception 'merchant manager access required';
  end if;

  -- Serialize concurrent closes for the same merchant so two clicks/cron runs
  -- can never split or double-count the same delivery.
  perform pg_advisory_xact_lock(hashtextextended('courier_settlement:' || _merchant_id::text, 0));

  select nullif(btrim(trim(both '"' from ps.value::text)), '')::integer
    into v_grace_minutes
  from public.platform_settings ps
  where ps.key = 'merchant_manual_payout_grace_minutes';
  if v_grace_minutes is null or v_grace_minutes <= 0 then
    v_grace_minutes := 1440;
  end if;

  select m.name into v_merchant_name from public.merchants m where m.id = _merchant_id;

  for v_courier in
    select distinct dj.courier_id as courier_id
    from public.delivery_jobs dj
    join public.orders o on o.id = dj.order_id
    where dj.merchant_id = _merchant_id
      and dj.courier_id is not null
      and dj.status = 'delivered'
      and coalesce(o.courier_earnings, 0) > 0
      and not exists (
        select 1 from public.courier_settlement_deliveries csd
        where csd.delivery_job_id = dj.id
      )
  loop
    insert into public.courier_settlements(merchant_id, courier_id, settlement_date, due_at, status)
    values (
      _merchant_id,
      v_courier.courier_id,
      current_date,
      now() + make_interval(mins => v_grace_minutes),
      'awaiting_payment'
    )
    on conflict (merchant_id, courier_id, settlement_date) where status = 'awaiting_payment'
    do update set updated_at = now()
    returning id into v_settlement_id;

    insert into public.courier_settlement_deliveries(settlement_id, delivery_job_id, amount)
    select v_settlement_id, dj.id, o.courier_earnings
    from public.delivery_jobs dj
    join public.orders o on o.id = dj.order_id
    where dj.merchant_id = _merchant_id
      and dj.courier_id = v_courier.courier_id
      and dj.status = 'delivered'
      and coalesce(o.courier_earnings, 0) > 0
      and not exists (
        select 1 from public.courier_settlement_deliveries csd2
        where csd2.delivery_job_id = dj.id
      );

    update public.courier_settlements s
    set delivery_count = (select count(*) from public.courier_settlement_deliveries d where d.settlement_id = s.id),
        total_amount = (select coalesce(sum(d.amount), 0) from public.courier_settlement_deliveries d where d.settlement_id = s.id),
        updated_at = now()
    where s.id = v_settlement_id
    returning * into v_settlement;

    perform public.enqueue_notification(
      (select c.user_id from public.couriers c where c.id = v_courier.courier_id),
      'courier_settlement_created',
      'Novo valor a receber',
      'Você tem um novo repasse a receber de ' || coalesce(v_merchant_name, 'um estabelecimento') || '.',
      jsonb_build_object('settlementId', v_settlement_id, 'merchantId', _merchant_id),
      'courier-settlement-created:' || v_settlement_id::text
    );

    return next v_settlement;
  end loop;
  return;
end;
$$;

revoke all on function public.close_courier_settlements(uuid) from public, anon;
grant execute on function public.close_courier_settlements(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Merchant marks a settlement as paid (informational only — no money moves).
-- ---------------------------------------------------------------------------
create or replace function public.merchant_mark_courier_settlement_paid(
  _settlement_id uuid,
  _proof_storage_path text default null
)
returns public.courier_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.courier_settlements;
begin
  select * into v_settlement from public.courier_settlements s where s.id = _settlement_id for update;
  if not found then
    raise exception 'settlement not found';
  end if;
  if not (public.current_user_is_merchant_manager(v_settlement.merchant_id) or public.current_user_is_admin()) then
    raise exception 'merchant manager access required';
  end if;
  if v_settlement.status <> 'awaiting_payment' then
    raise exception 'settlement is not awaiting payment';
  end if;

  update public.courier_settlements
  set status = 'merchant_marked_paid',
      merchant_marked_paid_at = now(),
      proof_storage_path = coalesce(_proof_storage_path, proof_storage_path),
      updated_at = now()
  where id = _settlement_id
  returning * into v_settlement;

  perform public.enqueue_notification(
    (select c.user_id from public.couriers c where c.id = v_settlement.courier_id),
    'courier_settlement_marked_paid',
    'Pagamento informado',
    'O estabelecimento informou que realizou o pagamento do seu repasse. Confirme o recebimento.',
    jsonb_build_object('settlementId', v_settlement.id),
    'courier-settlement-marked-paid:' || v_settlement.id::text
  );

  return v_settlement;
end;
$$;

revoke all on function public.merchant_mark_courier_settlement_paid(uuid, text) from public, anon;
grant execute on function public.merchant_mark_courier_settlement_paid(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Courier confirms or disputes a merchant-reported payment.
-- ---------------------------------------------------------------------------
create or replace function public.courier_confirm_courier_settlement(_settlement_id uuid)
returns public.courier_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.courier_settlements;
  v_courier_id uuid := public.current_user_courier_id();
begin
  if v_courier_id is null then
    raise exception 'eligible courier required';
  end if;
  select * into v_settlement from public.courier_settlements s where s.id = _settlement_id for update;
  if not found then raise exception 'settlement not found'; end if;
  if v_settlement.courier_id <> v_courier_id then raise exception 'settlement does not belong to courier'; end if;
  if v_settlement.status <> 'merchant_marked_paid' then
    raise exception 'settlement is not awaiting courier confirmation';
  end if;

  update public.courier_settlements
  set status = 'confirmed',
      courier_confirmed_at = now(),
      updated_at = now()
  where id = _settlement_id
  returning * into v_settlement;

  return v_settlement;
end;
$$;

revoke all on function public.courier_confirm_courier_settlement(uuid) from public, anon;
grant execute on function public.courier_confirm_courier_settlement(uuid) to authenticated, service_role;

create or replace function public.courier_dispute_courier_settlement(_settlement_id uuid, _reason text default null)
returns public.courier_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.courier_settlements;
  v_courier_id uuid := public.current_user_courier_id();
  v_admin_user_id uuid;
begin
  if v_courier_id is null then
    raise exception 'eligible courier required';
  end if;
  select * into v_settlement from public.courier_settlements s where s.id = _settlement_id for update;
  if not found then raise exception 'settlement not found'; end if;
  if v_settlement.courier_id <> v_courier_id then raise exception 'settlement does not belong to courier'; end if;
  if v_settlement.status <> 'merchant_marked_paid' then
    raise exception 'settlement is not awaiting courier confirmation';
  end if;

  update public.courier_settlements
  set status = 'disputed',
      disputed_at = now(),
      dispute_reason = nullif(btrim(_reason), ''),
      updated_at = now()
  where id = _settlement_id
  returning * into v_settlement;

  perform public.enqueue_notification(
    (select m.owner_user_id from public.merchants m where m.id = v_settlement.merchant_id),
    'courier_settlement_disputed',
    'Repasse contestado',
    'O entregador informou que não recebeu o repasse. Verifique e regularize.',
    jsonb_build_object('settlementId', v_settlement.id),
    'courier-settlement-disputed-merchant:' || v_settlement.id::text
  );

  for v_admin_user_id in select ur.user_id from public.user_roles ur where ur.role = 'admin'::public.app_role
  loop
    perform public.enqueue_notification(
      v_admin_user_id,
      'courier_settlement_disputed',
      'Disputa de repasse aberta',
      'Um entregador contestou o recebimento de um repasse de estabelecimento.',
      jsonb_build_object(
        'settlementId', v_settlement.id,
        'merchantId', v_settlement.merchant_id,
        'courierId', v_settlement.courier_id
      ),
      'courier-settlement-disputed-admin:' || v_settlement.id::text || ':' || v_admin_user_id::text
    );
  end loop;

  return v_settlement;
end;
$$;

revoke all on function public.courier_dispute_courier_settlement(uuid, text) from public, anon;
grant execute on function public.courier_dispute_courier_settlement(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin resolves a dispute. Never edits the calculated amount; only closes
-- the workflow with an audited outcome/reason.
-- ---------------------------------------------------------------------------
create or replace function public.admin_resolve_courier_settlement_dispute(
  _settlement_id uuid,
  _outcome text,
  _reason text
)
returns public.courier_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.courier_settlements;
begin
  if not public.current_user_is_admin() then
    raise exception 'admin access required';
  end if;
  if _outcome not in ('paid_confirmed','payment_required') then
    raise exception 'invalid resolution outcome';
  end if;
  if nullif(btrim(_reason), '') is null then
    raise exception 'resolution reason is required';
  end if;

  select * into v_settlement from public.courier_settlements s where s.id = _settlement_id for update;
  if not found then raise exception 'settlement not found'; end if;
  if v_settlement.status <> 'disputed' then
    raise exception 'settlement is not in dispute';
  end if;

  update public.courier_settlements
  set status = 'admin_resolved',
      admin_resolved_at = now(),
      admin_resolved_by = (select auth.uid()),
      admin_resolution_outcome = _outcome,
      admin_resolution_reason = btrim(_reason),
      updated_at = now()
  where id = _settlement_id
  returning * into v_settlement;

  insert into public.admin_audit_logs(admin_id, action, entity_type, entity_id, before_data, after_data, metadata)
  values (
    (select auth.uid()),
    'admin_resolve_courier_settlement_dispute',
    'courier_settlement',
    _settlement_id::text,
    jsonb_build_object('status', 'disputed'),
    jsonb_build_object('status', 'admin_resolved', 'outcome', _outcome),
    jsonb_build_object('reason', _reason)
  );

  perform public.enqueue_notification(
    (select c.user_id from public.couriers c where c.id = v_settlement.courier_id),
    'courier_settlement_dispute_resolved',
    'Disputa resolvida',
    'A APOIS resolveu a disputa do seu repasse.',
    jsonb_build_object('settlementId', v_settlement.id, 'outcome', _outcome),
    'courier-settlement-dispute-resolved-courier:' || v_settlement.id::text
  );

  return v_settlement;
end;
$$;

revoke all on function public.admin_resolve_courier_settlement_dispute(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_courier_settlement_dispute(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Server-side dispatch block: a merchant with an overdue settlement cannot
-- request a new APOIS courier. Own-pickup orders never call this function,
-- so they are never affected. Unblocks automatically the instant the
-- merchant marks the overdue settlement(s) as paid (status leaves
-- 'awaiting_payment', so it drops out of the live overdue check below).
-- ---------------------------------------------------------------------------
create or replace function public.merchant_request_courier(_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders;
  v_job public.delivery_jobs;
  v_job_id uuid;
  v_existing_job_id uuid;
  v_dispatch_radius_km numeric;
  v_is_admin boolean := public.current_user_is_admin();
begin
  select * into v_order
  from public.orders o
  where o.id = _order_id
  for update;

  if not found then raise exception 'order not found'; end if;
  if not public.current_user_is_merchant_member(v_order.merchant_id) and not v_is_admin then
    raise exception 'merchant access required';
  end if;

  if exists (
    select 1
    from public.courier_settlements cs
    where cs.merchant_id = v_order.merchant_id
      and cs.status = 'awaiting_payment'
      and cs.due_at < now()
  ) then
    perform public.enqueue_notification(
      (select m.owner_user_id from public.merchants m where m.id = v_order.merchant_id),
      'courier_settlement_blocked',
      'Solicitação de entregador bloqueada',
      'Existem repasses vencidos para entregadores. Regularize para voltar a solicitar entregadores APOIS.',
      jsonb_build_object('merchantId', v_order.merchant_id),
      'courier-settlement-blocked:' || v_order.merchant_id::text || ':' || to_char(now(), 'YYYY-MM-DD')
    );
    raise exception 'courier settlement overdue: resolve pending courier payouts before requesting new deliveries';
  end if;

  if v_order.fulfillment_type <> 'delivery' then raise exception 'delivery order required'; end if;
  if v_order.payment_method = 'pix' and v_order.payment_status <> 'paid' then
    raise exception 'pix payment must be confirmed before courier dispatch';
  end if;
  if v_order.status not in (
    'ready','searching_driver','driver_assigned','driver_arriving_store','picked_up','out_for_delivery','on_the_way'
  ) then
    raise exception 'order must be ready before courier dispatch';
  end if;

  select dj.id into v_existing_job_id
  from public.delivery_jobs dj
  where dj.order_id = _order_id
  limit 1;

  if v_existing_job_id is not null and v_order.status = 'ready' then
    update public.delivery_jobs
    set status = 'searching',
        courier_id = null,
        search_started_at = now(),
        updated_at = now()
    where id = v_existing_job_id
      and courier_id is null
      and status = 'cancelled';

    if found then
      update public.orders set status = 'searching_driver' where id = _order_id;
      insert into public.order_status_history(order_id,status,changed_by_user_id)
      values(_order_id,'searching_driver',(select auth.uid()));
      insert into public.delivery_events(delivery_job_id,event_type,from_status,to_status,metadata)
      values(
        v_existing_job_id,
        'courier_search_restarted',
        'cancelled',
        'searching',
        jsonb_build_object('requested_by', auth.uid())
      );
    end if;
  end if;

  v_job_id := public.ensure_delivery_job(_order_id);

  select c.courier_dispatch_radius_km into v_dispatch_radius_km
  from public.merchants m
  join public.cities c on c.id = m.city_id
  where m.id = v_order.merchant_id
    and c.is_active = true
  limit 1;

  if v_dispatch_radius_km is null or v_dispatch_radius_km <= 0 then
    raise exception 'courier dispatch radius required';
  end if;

  select dj.* into v_job
  from public.delivery_jobs dj
  where dj.id = v_job_id
  for update;

  if not found then raise exception 'delivery job missing for dispatched order'; end if;

  if v_job.courier_id is null and v_job.status in ('searching','offered') then
    perform public.dispatch_delivery_job_offers(v_job.id);
  end if;

  if v_is_admin and v_existing_job_id is null then
    insert into public.admin_audit_logs(
      admin_id,action,entity_type,entity_id,before_data,after_data
    ) values (
      (select auth.uid()),
      'admin_request_courier',
      'order',
      _order_id::text,
      to_jsonb(v_order),
      jsonb_build_object('delivery_job_id',v_job_id)
    );
  end if;

  return v_job_id;
end;
$function$;

revoke all on function public.merchant_request_courier(uuid) from public, anon;
grant execute on function public.merchant_request_courier(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Let delivery orders be created under the manual-payout mode too (it is
-- not yet active — see courier_payout_mode). Money Out via Mercado Pago
-- remains a separate, still-blocked mode.
-- ---------------------------------------------------------------------------
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

    if v_mode not in ('marketplace_direct_live', 'merchant_manual') then
      raise exception 'delivery is unavailable: courier marketplace payout not live';
    end if;
  end if;

  return new;
end;
$function$;

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
    'delivery_available', v_mode in ('marketplace_direct_live', 'merchant_manual'),
    'mode', v_mode,
    'message', case
      when v_mode in ('marketplace_direct_live', 'merchant_manual')
        then 'Entrega disponível.'
      else 'A entrega está temporariamente indisponível enquanto o recebimento direto dos entregadores é finalizado. Você ainda pode escolher retirada quando o estabelecimento oferecer essa opção.'
    end
  );
end;
$function$;

grant execute on function public.get_delivery_checkout_readiness() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Non-financial reminder/overdue notifications only. Never changes status.
-- ---------------------------------------------------------------------------
create or replace function private.notify_courier_settlement_deadlines()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_admin_user_id uuid;
begin
  for v_row in
    select cs.id,
           (select m.owner_user_id from public.merchants m where m.id = cs.merchant_id) as owner_user_id
    from public.courier_settlements cs
    where cs.status = 'awaiting_payment'
      and cs.due_at > now()
      and cs.due_at <= now() + interval '2 hours'
  loop
    perform public.enqueue_notification(
      v_row.owner_user_id,
      'courier_settlement_due_soon',
      'Repasse com prazo próximo',
      'Um repasse a entregador vence em breve. Realize o Pix e marque como pago.',
      jsonb_build_object('settlementId', v_row.id),
      'courier-settlement-due-soon:' || v_row.id::text
    );
  end loop;

  for v_row in
    select cs.id, cs.merchant_id,
           (select m.owner_user_id from public.merchants m where m.id = cs.merchant_id) as owner_user_id,
           (select count(*) from public.courier_settlements cs2
              where cs2.merchant_id = cs.merchant_id
                and cs2.status = 'awaiting_payment'
                and cs2.due_at < now()) as overdue_count
    from public.courier_settlements cs
    where cs.status = 'awaiting_payment'
      and cs.due_at < now()
  loop
    perform public.enqueue_notification(
      v_row.owner_user_id,
      'courier_settlement_overdue',
      'Repasse vencido',
      'Um repasse a entregador está vencido. Solicitações de novos entregadores APOIS estão bloqueadas até a regularização.',
      jsonb_build_object('settlementId', v_row.id),
      'courier-settlement-overdue-merchant:' || v_row.id::text
    );

    for v_admin_user_id in select ur.user_id from public.user_roles ur where ur.role = 'admin'::public.app_role
    loop
      perform public.enqueue_notification(
        v_admin_user_id,
        case when v_row.overdue_count > 1 then 'courier_settlement_overdue_recurrent' else 'courier_settlement_overdue' end,
        case when v_row.overdue_count > 1 then 'Repasse vencido (reincidência)' else 'Repasse vencido' end,
        case when v_row.overdue_count > 1
          then 'Estabelecimento com múltiplos repasses vencidos a entregadores.'
          else 'Um repasse a entregador está vencido.'
        end,
        jsonb_build_object('settlementId', v_row.id, 'merchantId', v_row.merchant_id, 'overdueCount', v_row.overdue_count),
        'courier-settlement-overdue-admin:' || v_row.id::text || ':' || v_admin_user_id::text
      );
    end loop;
  end loop;

  for v_row in
    select cs.id,
           (select c.user_id from public.couriers c where c.id = cs.courier_id) as courier_user_id
    from public.courier_settlements cs
    where cs.status = 'merchant_marked_paid'
      and cs.merchant_marked_paid_at < now() - interval '6 hours'
  loop
    perform public.enqueue_notification(
      v_row.courier_user_id,
      'courier_settlement_confirmation_pending',
      'Confirmação pendente',
      'Você tem um pagamento informado pelo estabelecimento aguardando sua confirmação.',
      jsonb_build_object('settlementId', v_row.id),
      'courier-settlement-confirmation-pending:' || v_row.id::text
    );
  end loop;
end;
$$;

revoke all on function private.notify_courier_settlement_deadlines() from public, anon, authenticated;
grant execute on function private.notify_courier_settlement_deadlines() to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'apois-courier-settlement-deadlines') then
    perform cron.schedule(
      'apois-courier-settlement-deadlines',
      '*/30 * * * *',
      '$job$select private.notify_courier_settlement_deadlines();$job$'
    );
  end if;
end;
$$;
