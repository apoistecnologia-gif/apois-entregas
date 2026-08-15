-- pg_net request timeout must accommodate an Edge Function cold start and secret/Firebase
-- initialization. Two seconds was too aggressive and left durable outbox rows pending.
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
      timeout_milliseconds => 10000
    );
  exception when others then
    -- The outbox remains pending and can be retried; never roll back notification creation.
    null;
  end;

  return new;
end;
$function$;

revoke execute on function public.request_native_push_dispatch() from public, anon, authenticated;
