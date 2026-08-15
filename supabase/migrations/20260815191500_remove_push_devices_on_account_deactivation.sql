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

  perform 1 from public.profiles p where p.id = v_user_id for update;
  if not found then
    raise exception 'profile not found';
  end if;

  if exists (
    select 1 from public.orders o
    where o.customer_user_id = v_user_id
      and o.status not in ('delivered','cancelled','refunded')
  ) then
    raise exception 'active customer order must be completed or cancelled before account deactivation';
  end if;

  if exists (
    select 1
    from public.delivery_jobs dj
    join public.couriers c on c.id = dj.courier_id
    where c.user_id = v_user_id
      and dj.status in ('accepted','arriving_pickup','at_pickup','picked_up','on_the_way','arrived_destination')
  ) then
    raise exception 'active delivery must be completed before account deactivation';
  end if;

  if exists (
    select 1 from public.merchants m
    where m.owner_user_id = v_user_id
      and m.is_active = true
  ) then
    raise exception 'active merchant ownership must be transferred or merchant disabled before account deactivation';
  end if;

  update public.profiles p
  set is_active = false,
      blocked_reason = 'Conta desativada pelo usuário',
      updated_at = now()
  where p.id = v_user_id;

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

  delete from public.push_devices d where d.user_id = v_user_id;
end;
$function$;

revoke all on function public.deactivate_own_account() from public;
grant execute on function public.deactivate_own_account() to authenticated;
