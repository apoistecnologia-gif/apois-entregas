create or replace function public.is_valid_cpf(_cpf text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(coalesce(_cpf,''),'\D','','g');
  i integer;
  sum1 integer := 0;
  sum2 integer := 0;
  d1 integer;
  d2 integer;
begin
  if length(v) <> 11 then return false; end if;
  if v ~ '^([0-9])\1{10}$' then return false; end if;
  for i in 1..9 loop
    sum1 := sum1 + substring(v from i for 1)::integer * (11 - i);
  end loop;
  d1 := 11 - (sum1 % 11);
  if d1 >= 10 then d1 := 0; end if;
  if d1 <> substring(v from 10 for 1)::integer then return false; end if;
  for i in 1..10 loop
    sum2 := sum2 + substring(v from i for 1)::integer * (12 - i);
  end loop;
  d2 := 11 - (sum2 % 11);
  if d2 >= 10 then d2 := 0; end if;
  return d2 = substring(v from 11 for 1)::integer;
end;
$$;

create or replace function public.validate_courier_identity_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_plate text;
begin
  if not public.is_valid_cpf(new.cpf) then
    raise exception 'invalid cpf';
  end if;
  if new.birth_date is null or new.birth_date > current_date - interval '18 years' then
    raise exception 'courier must be at least 18 years old';
  end if;
  if new.vehicle_type in ('moto','carro') then
    v_plate := upper(regexp_replace(coalesce(new.vehicle_plate,''),'[^A-Za-z0-9]','','g'));
    if v_plate !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
      raise exception 'invalid vehicle plate';
    end if;
    if length(regexp_replace(coalesce(new.cnh_number,''),'\D','','g')) <> 11 then
      raise exception 'invalid cnh';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.is_valid_cpf(text) from public, anon;
grant execute on function public.is_valid_cpf(text) to authenticated, service_role;
revoke all on function public.validate_courier_identity_fields() from public, anon, authenticated;
grant execute on function public.validate_courier_identity_fields() to service_role;

drop trigger if exists trg_validate_courier_identity_fields on public.couriers;
create trigger trg_validate_courier_identity_fields
before insert or update of cpf,birth_date,vehicle_type,vehicle_plate,cnh_number on public.couriers
for each row execute function public.validate_courier_identity_fields();
