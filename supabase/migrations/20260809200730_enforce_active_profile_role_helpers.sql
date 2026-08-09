create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select public.current_user_is_active()
    and public.has_role((select auth.uid()), 'admin'::public.app_role);
$function$;

create or replace function public.current_user_is_merchant_member(_merchant_id uuid)
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
      where m.id = _merchant_id
        and (
          m.owner_user_id = (select auth.uid())
          or exists (
            select 1
            from public.merchant_members mm
            where mm.merchant_id = _merchant_id
              and mm.user_id = (select auth.uid())
              and mm.status = 'active'
          )
        )
    );
$function$;

create or replace function public.current_user_is_merchant_manager(_merchant_id uuid)
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
      where m.id = _merchant_id
        and (
          m.owner_user_id = (select auth.uid())
          or exists (
            select 1
            from public.merchant_members mm
            where mm.merchant_id = _merchant_id
              and mm.user_id = (select auth.uid())
              and mm.status = 'active'
              and mm.role in ('owner','manager')
          )
        )
    );
$function$;

revoke all on function public.current_user_is_admin() from public;
revoke all on function public.current_user_is_merchant_member(uuid) from public;
revoke all on function public.current_user_is_merchant_manager(uuid) from public;
grant execute on function public.current_user_is_admin() to authenticated, service_role;
grant execute on function public.current_user_is_merchant_member(uuid) to authenticated, service_role;
grant execute on function public.current_user_is_merchant_manager(uuid) to authenticated, service_role;
