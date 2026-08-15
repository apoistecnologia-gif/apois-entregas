create or replace function public.ack_courier_offer_seen(_offer_id uuid, _channel text default 'courier_app')
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_job_id uuid;
  v_job_status text;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select o.delivery_job_id, j.status
  into v_job_id, v_job_status
  from public.delivery_offers o
  join public.delivery_jobs j on j.id = o.delivery_job_id
  join public.couriers c on c.id = o.courier_id
  where o.id = _offer_id
    and c.user_id = v_user_id
    and c.status = 'approved'
    and c.is_active = true;

  if v_job_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.delivery_events e
    where e.delivery_job_id = v_job_id
      and e.event_type = 'offer_seen_by_courier_app'
      and e.metadata ->> 'offer_id' = _offer_id::text
  ) then
    insert into public.delivery_events(
      delivery_job_id,
      event_type,
      from_status,
      to_status,
      actor_user_id,
      metadata
    ) values (
      v_job_id,
      'offer_seen_by_courier_app',
      v_job_status,
      v_job_status,
      v_user_id,
      jsonb_build_object(
        'offer_id', _offer_id,
        'channel', coalesce(nullif(btrim(_channel), ''), 'courier_app'),
        'seen_at', now()
      )
    );
  end if;

  return true;
end;
$function$;

revoke all on function public.ack_courier_offer_seen(uuid,text) from public;
grant execute on function public.ack_courier_offer_seen(uuid,text) to authenticated;
