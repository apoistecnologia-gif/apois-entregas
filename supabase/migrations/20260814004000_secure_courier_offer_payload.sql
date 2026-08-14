-- Secure courier incoming-offer payload.
-- Keeps the exact customer destination private until the courier accepts the job.
-- This migration is intentionally idempotent because production already received the function
-- through the Supabase migration runner before the SQL was committed to Git.

create or replace function public.get_courier_incoming_offers()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_courier_id uuid;
begin
  if not public.current_user_is_active() then
    raise exception 'active account required';
  end if;

  select c.id
  into v_courier_id
  from public.couriers c
  where c.user_id = (select auth.uid())
    and c.status = 'approved'
    and c.is_active = true;

  if v_courier_id is null then
    return '[]'::jsonb;
  end if;

  if not exists (
    select 1
    from public.courier_availability a
    where a.courier_id = v_courier_id
      and a.is_online = true
  ) then
    return '[]'::jsonb;
  end if;

  if exists (
    select 1
    from public.delivery_jobs active_job
    where active_job.courier_id = v_courier_id
      and active_job.status in (
        'accepted',
        'arriving_pickup',
        'at_pickup',
        'picked_up',
        'on_the_way',
        'arrived_destination'
      )
  ) then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', offer.id,
          'delivery_job_id', offer.delivery_job_id,
          'status', offer.status,
          'offered_at', offer.offered_at,
          'expires_at', offer.expires_at,
          'order_number', ord.order_number,
          'item_count', (
            select coalesce(sum(oi.quantity), 0)
            from public.order_items oi
            where oi.order_id = ord.id
          ),
          'merchant_id', merchant.id,
          'merchant_name', merchant.name,
          'merchant_logo_url', merchant.logo_url,
          'pickup_address', jsonb_build_object(
            'name', merchant.name,
            'address_line', merchant.address_line,
            'neighborhood', merchant.neighborhood,
            'city', merchant.city,
            'state', merchant.state
          ),
          'delivery_area', jsonb_strip_nulls(
            jsonb_build_object(
              'neighborhood', ord.delivery_address ->> 'neighborhood',
              'city', ord.delivery_address ->> 'city',
              'state', ord.delivery_address ->> 'state'
            )
          ),
          'pickup_distance_meters', case
            when location.latitude is null
              or location.longitude is null
              or job.pickup_latitude is null
              or job.pickup_longitude is null
            then null
            else greatest(
              round(
                public.haversine_km(
                  location.latitude,
                  location.longitude,
                  job.pickup_latitude,
                  job.pickup_longitude
                ) * 1000
              )::integer,
              0
            )
          end,
          'delivery_distance_meters', job.estimated_distance_meters,
          'total_distance_meters', coalesce(
            case
              when location.latitude is null
                or location.longitude is null
                or job.pickup_latitude is null
                or job.pickup_longitude is null
              then null
              else greatest(
                round(
                  public.haversine_km(
                    location.latitude,
                    location.longitude,
                    job.pickup_latitude,
                    job.pickup_longitude
                  ) * 1000
                )::integer,
                0
              )
            end,
            0
          ) + coalesce(job.estimated_distance_meters, 0),
          'estimated_duration_seconds', job.estimated_duration_seconds,
          'estimated_earnings', job.estimated_earnings
        )
        order by offer.offered_at
      )
      from public.delivery_offers offer
      join public.delivery_jobs job on job.id = offer.delivery_job_id
      join public.orders ord on ord.id = job.order_id
      join public.merchants merchant on merchant.id = job.merchant_id
      left join public.courier_locations location on location.courier_id = v_courier_id
      where offer.courier_id = v_courier_id
        and offer.status = 'offered'
        and offer.expires_at > now()
        and job.courier_id is null
        and job.status in ('searching', 'offered')
    ),
    '[]'::jsonb
  );
end;
$function$;

revoke all on function public.get_courier_incoming_offers() from public;
revoke all on function public.get_courier_incoming_offers() from anon;
grant execute on function public.get_courier_incoming_offers() to authenticated;
grant execute on function public.get_courier_incoming_offers() to service_role;
