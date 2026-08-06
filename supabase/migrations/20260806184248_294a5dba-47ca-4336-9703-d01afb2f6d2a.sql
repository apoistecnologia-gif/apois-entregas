-- Garantir que estamos no schema public
set search_path = public;

-- 1. Criar o Enum para Papéis (usando if not exists se possível, mas como é enum, vamos tentar criar direto ou ignorar erro se já existir)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'moderator', 'customer');
  end if;
end$$;

-- 2. Tabela de Perfis
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  phone text,
  email text,
  avatar_url text,
  created_at timestamp with time zone default now()
);

-- 3. Tabela de Papéis de Usuário
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);

-- Index para performance
create index if not exists user_roles_user_id_idx on public.user_roles (user_id);

-- 4. Habilitar RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

-- 5. Grant de permissões
grant select, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant all on public.profiles to service_role;
grant all on public.user_roles to service_role;

-- 6. Políticas RLS
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can view own roles" on public.user_roles;
create policy "Users can view own roles"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id);

-- 7. Função de Automação para Novos Usuários
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.email
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'customer');

  return new;
end;
$$;

-- Revogar execução pública
revoke execute on function public.handle_new_user() from public;

-- 8. Trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
