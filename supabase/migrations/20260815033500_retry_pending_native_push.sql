-- A durable outbox needs a server-side retry path even when the first HTTP attempt
-- never reaches the Edge Function. Supabase Cron + pg_net provides that watchdog.
create extension if not exists pg_cron;

create or replace function private.retry_pending_native_push_dispatch()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1
    from public.notification_push_outbox o
    where o.attempt_count < 6
      and (
        (o.status in ('pending','failed') and o.next_attempt_at <= now())
        or (o.status='processing' and o.updated_at <= now() - interval '2 minutes')
      )
  ) then
    return;
  end if;

  select value into v_url
  from private.runtime_settings
  where key='push_dispatch_url';

  select value into v_secret
  from private.runtime_settings
  where key='push_dispatch_webhook_secret';

  if nullif(btrim(v_url),'') is null or nullif(btrim(v_secret),'') is null then
    return;
  end if;

  perform net.http_post(
    url => v_url,
    body => jsonb_build_object('source','push_outbox_retry'),
    params => '{}'::jsonb,
    headers => jsonb_build_object(
      'Content-Type','application/json',
      'x-apois-push-dispatch-key',v_secret
    ),
    timeout_milliseconds => 10000
  );
end;
$function$;

revoke all on function private.retry_pending_native_push_dispatch() from public, anon, authenticated;

-- Reapplying the migration in a repaired environment remains deterministic.
do $schedule$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job where jobname='apois-native-push-outbox-retry'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end
$schedule$;

select cron.schedule(
  'apois-native-push-outbox-retry',
  '* * * * *',
  'select private.retry_pending_native_push_dispatch();'
);
