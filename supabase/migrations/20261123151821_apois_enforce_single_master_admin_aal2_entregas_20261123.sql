-- Executed in Supabase production on 2026-11-23; retained for audit and recovery.
do $enforce$
declare master_id uuid;
begin
  select id into master_id from auth.users where lower(email)='master@apoisbrasil.com.br';
  if master_id is null then raise exception 'ABORT: master absent'; end if;
  if (select count(*) from public.user_roles where role='admin'::public.app_role) <> 1 then
    raise exception 'ABORT: exactly one Entregas admin required';
  end if;
  if not exists (select 1 from public.user_roles where role='admin'::public.app_role and user_id=master_id) then
    raise exception 'ABORT: master is not Entregas admin';
  end if;
  if not exists (select 1 from public.profiles where id=master_id and is_active=true) then
    raise exception 'ABORT: master profile inactive';
  end if;
  if not exists (select 1 from auth.mfa_factors where user_id=master_id and factor_type='totp' and status='verified') then
    raise exception 'ABORT: master TOTP has not been verified';
  end if;
  update private.apois_admin_mfa_enforcement
  set enforce_aal2=true,updated_at=now()
  where singleton=true;
  if not found then raise exception 'ABORT: MFA enforcement singleton missing'; end if;
end;
$enforce$;
