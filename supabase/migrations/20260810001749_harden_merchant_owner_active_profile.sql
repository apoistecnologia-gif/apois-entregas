create or replace function public.current_user_is_merchant_owner(_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select public.current_user_is_active()
    and exists (
      select 1
      from public.merchants m
      left join public.merchant_members mm
        on mm.merchant_id = m.id
       and mm.user_id = (select auth.uid())
       and mm.status = 'active'
       and mm.role = 'owner'
      where m.id = _merchant_id
        and (m.owner_user_id = (select auth.uid()) or mm.id is not null)
    );
$function$;

revoke all on function public.current_user_is_merchant_owner(uuid) from public, anon;
grant execute on function public.current_user_is_merchant_owner(uuid) to authenticated, service_role;
