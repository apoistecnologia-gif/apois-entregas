create or replace function public.deactivate_own_account()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if public.current_user_is_admin() then
    raise exception 'administrator account cannot be self-deactivated';
  end if;

  update public.profiles p
  set is_active = false,
      blocked_reason = 'Conta desativada pelo usuário',
      updated_at = now()
  where p.id = v_user_id;

  if not found then
    raise exception 'profile not found';
  end if;

  update public.courier_availability a
  set is_online = false,
      online_since = null,
      last_seen_at = now()
  where a.courier_id in (
    select c.id from public.couriers c where c.user_id = v_user_id
  );

  update public.courier_online_sessions s
  set ended_at = greatest(now(), s.started_at),
      updated_at = now()
  where s.courier_id in (
    select c.id from public.couriers c where c.user_id = v_user_id
  )
    and s.ended_at is null;
end;
$function$;

revoke all on function public.deactivate_own_account() from public;
grant execute on function public.deactivate_own_account() to authenticated;
