create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_legal_version text := nullif(btrim(new.raw_user_meta_data->>'legal_version'),'');
  v_cpf text := regexp_replace(coalesce(new.raw_user_meta_data->>'cpf',''), '\D', '', 'g');
  v_birth_date date := null;
  v_avatar_url text := coalesce(nullif(new.raw_user_meta_data->>'avatar_url',''), nullif(new.raw_user_meta_data->>'picture',''));
begin
  if nullif(new.raw_user_meta_data->>'birth_date','') is not null then
    begin
      v_birth_date := (new.raw_user_meta_data->>'birth_date')::date;
    exception when others then
      v_birth_date := null;
    end;
  end if;

  insert into public.profiles (id, full_name, phone, cpf, birth_date, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'phone',
    case when length(v_cpf) = 11 then v_cpf else null end,
    v_birth_date,
    v_avatar_url
  )
  on conflict (id) do update
  set full_name = coalesce(excluded.full_name, public.profiles.full_name),
      phone = coalesce(excluded.phone, public.profiles.phone),
      cpf = coalesce(excluded.cpf, public.profiles.cpf),
      birth_date = coalesce(excluded.birth_date, public.profiles.birth_date),
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  insert into public.user_roles (user_id, role)
  values (new.id, 'customer'::public.app_role)
  on conflict (user_id, role) do nothing;

  if v_legal_version is not null
     and nullif(new.raw_user_meta_data->>'terms_accepted_at','') is not null
     and nullif(new.raw_user_meta_data->>'privacy_accepted_at','') is not null then
    insert into public.legal_acceptances(user_id,terms_version,privacy_version,accepted_at,source)
    values(new.id,v_legal_version,v_legal_version,now(),'signup')
    on conflict(user_id,terms_version,privacy_version) do nothing;
  end if;

  return new;
end;
$function$;
