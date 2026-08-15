create table if not exists public.notification_push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','discarded')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_push_outbox_pending_idx
  on public.notification_push_outbox(status, next_attempt_at, created_at)
  where status in ('pending','processing','failed');

alter table public.notification_push_outbox enable row level security;
revoke all on table public.notification_push_outbox from public, anon, authenticated;
grant all on table public.notification_push_outbox to service_role;

create or replace function public.enqueue_native_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if exists (
    select 1
    from public.push_devices d
    where d.user_id = new.user_id
      and d.is_active = true
  ) then
    insert into public.notification_push_outbox(notification_id,user_id)
    values(new.id,new.user_id)
    on conflict(notification_id) do nothing;
  end if;
  return new;
end;
$function$;

revoke execute on function public.enqueue_native_push_for_notification() from public, anon, authenticated;

drop trigger if exists notifications_enqueue_native_push on public.notifications;
create trigger notifications_enqueue_native_push
after insert on public.notifications
for each row execute function public.enqueue_native_push_for_notification();

create or replace function public.claim_notification_push_batch(_limit integer default 25)
returns table(
  outbox_id uuid,
  notification_id uuid,
  user_id uuid,
  title text,
  body text,
  data jsonb,
  notification_type text,
  attempt_count integer,
  devices jsonb
)
language sql
volatile
security definer
set search_path to ''
as $function$
  with candidates as (
    select o.id
    from public.notification_push_outbox o
    where o.attempt_count < 6
      and (
        (o.status in ('pending','failed') and o.next_attempt_at <= now())
        or (o.status = 'processing' and o.updated_at <= now() - interval '2 minutes')
      )
    order by o.created_at
    limit greatest(1,least(coalesce(_limit,25),100))
    for update skip locked
  ), claimed as (
    update public.notification_push_outbox o
    set status='processing',
        attempt_count=o.attempt_count+1,
        updated_at=now(),
        last_error=null
    from candidates c
    where o.id=c.id
    returning o.id,o.notification_id,o.user_id,o.attempt_count
  )
  select
    c.id,
    c.notification_id,
    c.user_id,
    n.title,
    n.body,
    n.data,
    n.notification_type,
    c.attempt_count,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',d.id,
          'platform',d.platform,
          'token',d.token
        ) order by d.created_at
      ) filter (where d.id is not null),
      '[]'::jsonb
    ) as devices
  from claimed c
  join public.notifications n on n.id=c.notification_id
  left join public.push_devices d on d.user_id=c.user_id and d.is_active=true
  group by c.id,c.notification_id,c.user_id,n.title,n.body,n.data,n.notification_type,c.attempt_count;
$function$;

revoke all on function public.claim_notification_push_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_push_batch(integer) to service_role;

-- The update policy already existed for device token refreshes, but the table grant
-- was missing. Keep UPDATE behind the existing own-user RLS policy.
grant update on table public.push_devices to authenticated;
