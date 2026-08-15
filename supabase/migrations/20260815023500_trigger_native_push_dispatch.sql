create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.runtime_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
revoke all on table private.runtime_settings from public, anon, authenticated;

insert into private.runtime_settings(key,value)
values(
  'push_dispatch_url',
  'https://sbvhdgyuuperszlsllji.supabase.co/functions/v1/dispatch-push-outbox'
)
on conflict(key) do update
set value=excluded.value,updated_at=now();

insert into private.runtime_settings(key,value)
select 'push_dispatch_webhook_secret', encode(extensions.gen_random_bytes(32),'hex')
where not exists (
  select 1 from private.runtime_settings where key='push_dispatch_webhook_secret'
);

create or replace function public.request_native_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url
  from private.runtime_settings
  where key='push_dispatch_url';

  select value into v_secret
  from private.runtime_settings
  where key='push_dispatch_webhook_secret';

  if nullif(btrim(v_url),'') is null or nullif(btrim(v_secret),'') is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url => v_url,
      body => jsonb_build_object('outboxId',new.id),
      params => '{}'::jsonb,
      headers => jsonb_build_object(
        'Content-Type','application/json',
        'x-apois-push-dispatch-key',v_secret
      ),
      timeout_milliseconds => 2000
    );
  exception when others then
    -- Notification persistence must never fail because the async dispatcher is unavailable.
    null;
  end;

  return new;
end;
$function$;

revoke execute on function public.request_native_push_dispatch() from public, anon, authenticated;

drop trigger if exists notification_push_outbox_dispatch on public.notification_push_outbox;
create trigger notification_push_outbox_dispatch
after insert on public.notification_push_outbox
for each row execute function public.request_native_push_dispatch();
