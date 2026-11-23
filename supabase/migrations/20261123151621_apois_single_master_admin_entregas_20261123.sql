-- Executed in Supabase production on 2026-11-23; retained for audit and recovery.
do $lockdown$
declare master_id uuid;
begin
 select id into master_id from auth.users where lower(email)='master@apoisbrasil.com.br';
 if master_id is null then raise exception 'ABORT: master account is missing'; end if;
 if not exists (select 1 from public.profiles where id=master_id and is_active is true) then
   raise exception 'ABORT: master Entregas profile not active';
 end if;
 if not exists (select 1 from auth.mfa_factors where user_id=master_id and status='verified') then
   raise exception 'ABORT: master Entregas MFA not verified';
 end if;
 if not exists(select 1 from public.user_roles where user_id=master_id and role='admin'::public.app_role) then
   raise exception 'ABORT: master Entregas admin role missing';
 end if;
 if (select count(*) from public.user_roles where role='admin'::public.app_role) <> 4 then
   raise exception 'ABORT: Entregas admin count changed; inspect before proceeding';
 end if;
 delete from public.user_roles
 where role='admin'::public.app_role and user_id <> master_id;
 if (select count(*) from public.user_roles where role='admin'::public.app_role) <> 1 then
   raise exception 'ABORT: Entregas must have exactly one administrator';
 end if;
end;
$lockdown$;
create unique index if not exists apois_single_admin_role_20261123
on public.user_roles ((true)) where role='admin'::public.app_role;
