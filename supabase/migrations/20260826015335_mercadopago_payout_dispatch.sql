-- Mercado Pago Money Out dispatch infrastructure.  It is deliberately inert
-- until courier_payout_mode is explicitly switched to marketplace_direct_live
-- and the provider feature flag is enabled in the Edge Function environment.

alter table public.payouts
  add column if not exists dispatch_attempts integer not null default 0,
  add column if not exists next_dispatch_at timestamptz not null default now(),
  add column if not exists dispatch_last_error text,
  add column if not exists dispatch_locked_at timestamptz;

alter table public.payouts
  drop constraint if exists payouts_dispatch_attempts_check;
alter table public.payouts
  add constraint payouts_dispatch_attempts_check
  check (dispatch_attempts >= 0 and dispatch_attempts <= 8);

create index if not exists payouts_dispatch_queue_idx
  on public.payouts (next_dispatch_at, requested_at)
  where status in ('pending','processing');

create or replace function public.verify_payout_dispatch_runtime_key(_candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(_candidate), '') is not null
    and exists (
      select 1 from private.runtime_settings r
      where r.key = 'payout_dispatch_webhook_secret'
        and r.value = _candidate
    ), false
  );
$$;

revoke all on function public.verify_payout_dispatch_runtime_key(text) from public, anon, authenticated;
grant execute on function public.verify_payout_dispatch_runtime_key(text) to service_role;

create or replace function private.retry_pending_payout_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_mode text;
begin
  select trim(both '"' from value::text) into v_mode
  from public.platform_settings where key='courier_payout_mode';
  if coalesce(v_mode, 'marketplace_direct_pending') <> 'marketplace_direct_live' then
    return;
  end if;

  select value into v_url from private.runtime_settings where key='payout_dispatch_url';
  select value into v_secret from private.runtime_settings where key='payout_dispatch_webhook_secret';
  if nullif(btrim(v_url),'') is null or nullif(btrim(v_secret),'') is null then
    return;
  end if;

  perform net.http_post(
    url => v_url,
    body => jsonb_build_object('source','payout_dispatch_retry'),
    params => '{}'::jsonb,
    headers => jsonb_build_object(
      'Content-Type','application/json',
      'x-apois-payout-dispatch-key',v_secret
    ),
    timeout_milliseconds => 10000
  );
end;
$$;

revoke all on function private.retry_pending_payout_dispatch() from public, anon, authenticated;
grant execute on function private.retry_pending_payout_dispatch() to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'apois-payout-dispatch-retry') then
    perform cron.schedule(
      'apois-payout-dispatch-retry',
      '*/5 * * * *',
      '$job$select private.retry_pending_payout_dispatch();$job$'
    );
  end if;
end;
$$;
