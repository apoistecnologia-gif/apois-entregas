create or replace function public.protect_approved_courier_identity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.status = 'approved'
     and not public.current_user_is_admin()
     and (
       new.cpf is distinct from old.cpf
       or new.birth_date is distinct from old.birth_date
       or new.vehicle_type is distinct from old.vehicle_type
       or new.vehicle_model is distinct from old.vehicle_model
       or new.vehicle_plate is distinct from old.vehicle_plate
       or new.cnh_number is distinct from old.cnh_number
     )
  then
    raise exception 'approved courier identity or vehicle changes require admin review';
  end if;
  return new;
end;
$function$;

revoke all on function public.protect_approved_courier_identity() from public, anon, authenticated;

drop trigger if exists trg_protect_approved_courier_identity on public.couriers;
create trigger trg_protect_approved_courier_identity
before update of cpf,birth_date,vehicle_type,vehicle_model,vehicle_plate,cnh_number
on public.couriers
for each row execute function public.protect_approved_courier_identity();
