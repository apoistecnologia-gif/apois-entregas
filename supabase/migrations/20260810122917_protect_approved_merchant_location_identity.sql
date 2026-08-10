create or replace function public.protect_approved_merchant_identity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.approval_status = 'approved'
     and not public.current_user_is_admin()
     and (
       new.document is distinct from old.document
       or new.legal_name is distinct from old.legal_name
       or new.owner_user_id is distinct from old.owner_user_id
       or new.city_id is distinct from old.city_id
       or new.city is distinct from old.city
       or new.state is distinct from old.state
       or new.address_line is distinct from old.address_line
       or new.neighborhood is distinct from old.neighborhood
       or new.latitude is distinct from old.latitude
       or new.longitude is distinct from old.longitude
     )
  then
    raise exception 'approved merchant identity or pickup location changes require admin review';
  end if;
  return new;
end;
$function$;
