-- Couriers may inspect a delivery job while an offer is pending. Keep the exact
-- customer destination private until one courier atomically accepts the job.
-- The authoritative destination remains on orders, which offered couriers cannot read.
create or replace function public.sanitize_unassigned_delivery_destination()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.courier_id is null and new.status in ('searching','offered') then
    new.delivery_address := jsonb_strip_nulls(jsonb_build_object(
      'neighborhood', new.delivery_address->>'neighborhood',
      'city', new.delivery_address->>'city',
      'state', new.delivery_address->>'state'
    ));
    new.delivery_latitude := null;
    new.delivery_longitude := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_sanitize_unassigned_delivery_destination on public.delivery_jobs;
create trigger trg_sanitize_unassigned_delivery_destination
before insert or update of courier_id,status,delivery_address,delivery_latitude,delivery_longitude
on public.delivery_jobs
for each row execute function public.sanitize_unassigned_delivery_destination();

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
  v_order public.orders;
  v_delivery_lat numeric;
  v_delivery_lon numeric;
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

  select * into v_order
  from public.orders o
  where o.id=v_job.order_id;
  if not found then raise exception 'order not found'; end if;

  if coalesce(v_order.delivery_address->>'latitude','') ~ '^-?[0-9]+(\.[0-9]+)?$' then
    v_delivery_lat := (v_order.delivery_address->>'latitude')::numeric;
  end if;
  if coalesce(v_order.delivery_address->>'longitude','') ~ '^-?[0-9]+(\.[0-9]+)?$' then
    v_delivery_lon := (v_order.delivery_address->>'longitude')::numeric;
  end if;
  if v_delivery_lat is null or v_delivery_lon is null
     or v_delivery_lat not between -90 and 90
     or v_delivery_lon not between -180 and 180 then
    raise exception 'delivery coordinates required';
  end if;

  update public.delivery_jobs
  set courier_id=v_courier.id,
      status='accepted',
      accepted_at=now(),
      delivery_address=v_order.delivery_address,
      delivery_latitude=v_delivery_lat,
      delivery_longitude=v_delivery_lon
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
