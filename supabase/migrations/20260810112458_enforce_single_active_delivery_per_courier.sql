-- A courier may only own one active delivery at a time. Serialize offer acceptance
-- per courier and back the invariant with a partial unique index so concurrent
-- requests cannot assign two active jobs to the same courier.
create unique index if not exists delivery_jobs_one_active_job_per_courier
  on public.delivery_jobs(courier_id)
  where courier_id is not null
    and status in ('accepted','arriving_pickup','at_pickup','picked_up','on_the_way','arrived_destination');

create or replace function public.accept_delivery_offer(_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_courier public.couriers;
  v_offer public.delivery_offers;
  v_job public.delivery_jobs;
begin
  if not public.current_user_is_active() then
    raise exception 'active account required';
  end if;

  select *
  into v_courier
  from public.couriers c
  where c.user_id=(select auth.uid())
    and c.status='approved'
    and c.is_active=true
  for update;

  if not found then raise exception 'eligible courier required'; end if;

  if not exists(
    select 1
    from public.courier_availability a
    where a.courier_id=v_courier.id
      and a.is_online=true
  ) then
    raise exception 'courier must be online';
  end if;

  select *
  into v_offer
  from public.delivery_offers o
  where o.id=_offer_id
    and o.courier_id=v_courier.id
  for update;

  if not found then raise exception 'offer not found'; end if;
  if v_offer.status<>'offered' or v_offer.expires_at<=now() then
    raise exception 'offer is no longer available';
  end if;

  select *
  into v_job
  from public.delivery_jobs dj
  where dj.id=v_offer.delivery_job_id
  for update;

  if v_job.status not in ('searching','offered') or v_job.courier_id is not null then
    raise exception 'delivery already assigned';
  end if;

  if exists(
    select 1
    from public.delivery_jobs active_job
    where active_job.courier_id=v_courier.id
      and active_job.status in ('accepted','arriving_pickup','at_pickup','picked_up','on_the_way','arrived_destination')
  ) then
    raise exception 'courier already has active delivery';
  end if;

  update public.delivery_jobs
  set courier_id=v_courier.id,status='accepted',accepted_at=now()
  where id=v_job.id;

  update public.delivery_offers
  set status='accepted',responded_at=now()
  where id=v_offer.id;

  update public.delivery_offers
  set status='cancelled',responded_at=now()
  where delivery_job_id=v_job.id
    and id<>v_offer.id
    and status='offered';

  update public.orders set status='driver_assigned' where id=v_job.order_id;
  insert into public.order_status_history(order_id,status,changed_by_user_id)
  values(v_job.order_id,'driver_assigned',(select auth.uid()));
  insert into public.delivery_events(delivery_job_id,event_type,from_status,to_status,actor_user_id)
  values(v_job.id,'offer_accepted',v_job.status,'accepted',(select auth.uid()));
  return v_job.id;
end;
$function$;
