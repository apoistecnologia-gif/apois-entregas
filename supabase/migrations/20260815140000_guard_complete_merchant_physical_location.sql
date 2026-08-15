create or replace function public.guard_merchant_coordinate_updates()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_location_changed boolean;
begin
  v_location_changed :=
    new.city_id is distinct from old.city_id
    or new.city is distinct from old.city
    or new.state is distinct from old.state
    or new.address_line is distinct from old.address_line
    or new.neighborhood is distinct from old.neighborhood
    or new.latitude is distinct from old.latitude
    or new.longitude is distinct from old.longitude;

  if not v_location_changed then
    return new;
  end if;

  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return new;
  end if;

  if coalesce(current_setting('apois.merchant_map_location', true), '') = '1' then
    return new;
  end if;

  raise exception 'merchant physical location must be confirmed on map';
end;
$function$;

drop trigger if exists merchants_guard_coordinate_updates on public.merchants;
create trigger merchants_guard_coordinate_updates
before update of city_id, city, state, address_line, neighborhood, latitude, longitude
on public.merchants
for each row
execute function public.guard_merchant_coordinate_updates();
