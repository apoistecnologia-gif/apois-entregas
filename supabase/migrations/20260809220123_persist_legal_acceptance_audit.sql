create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  source text not null default 'signup',
  created_at timestamptz not null default now(),
  constraint legal_acceptances_source_check check (source in ('signup','profile','admin_migration')),
  constraint legal_acceptances_user_version_unique unique (user_id, terms_version, privacy_version)
);

create index if not exists legal_acceptances_user_id_idx on public.legal_acceptances(user_id);

alter table public.legal_acceptances enable row level security;

drop policy if exists "Users read own legal acceptances" on public.legal_acceptances;
create policy "Users read own legal acceptances"
on public.legal_acceptances
for select
to authenticated
using (user_id = (select auth.uid()) and public.current_user_is_active());

drop policy if exists "Admins read legal acceptances" on public.legal_acceptances;
create policy "Admins read legal acceptances"
on public.legal_acceptances
for select
to authenticated
using (public.current_user_is_admin());

revoke all on table public.legal_acceptances from anon, authenticated;
grant select on table public.legal_acceptances to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_legal_version text := nullif(btrim(new.raw_user_meta_data->>'legal_version'),'');
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      phone = excluded.phone;

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

insert into public.legal_acceptances(user_id,terms_version,privacy_version,accepted_at,source)
select
  u.id,
  nullif(btrim(u.raw_user_meta_data->>'legal_version'),''),
  nullif(btrim(u.raw_user_meta_data->>'legal_version'),''),
  coalesce(
    case
      when coalesce(u.raw_user_meta_data->>'terms_accepted_at','') ~ '^\d{4}-\d{2}-\d{2}T' then (u.raw_user_meta_data->>'terms_accepted_at')::timestamptz
      else null
    end,
    u.created_at,
    now()
  ),
  'admin_migration'
from auth.users u
where nullif(btrim(u.raw_user_meta_data->>'legal_version'),'') is not null
  and nullif(u.raw_user_meta_data->>'terms_accepted_at','') is not null
  and nullif(u.raw_user_meta_data->>'privacy_accepted_at','') is not null
on conflict(user_id,terms_version,privacy_version) do nothing;

revoke execute on function public.handle_new_user() from public, anon, authenticated;