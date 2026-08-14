create or replace function public.guard_merchant_coordinate_updates()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.latitude is not distinct from old.latitude
     and new.longitude is not distinct from old.longitude then
    return new;
  end if;

  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return new;
  end if;

  if coalesce(current_setting('apois.merchant_map_location', true), '') = '1' then
    return new;
  end if;

  raise exception 'merchant location must be confirmed on map';
end;
$function$;
