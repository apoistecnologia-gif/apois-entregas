create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_full_name text;
  v_avatar_url text;
begin
  v_full_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );

  v_avatar_url := coalesce(
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    nullif(new.raw_user_meta_data->>'picture', '')
  );

  insert into public.profiles (id, full_name, phone, avatar_url)
  values (
    new.id,
    v_full_name,
    nullif(new.raw_user_meta_data->>'phone', ''),
    v_avatar_url
  )
  on conflict (id) do update
  set full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
      avatar_url = coalesce(nullif(public.profiles.avatar_url, ''), excluded.avatar_url);

  insert into public.user_roles (user_id, role)
  values (new.id, 'customer')
  on conflict (user_id, role) do nothing;

  return new;
end;
$function$;
