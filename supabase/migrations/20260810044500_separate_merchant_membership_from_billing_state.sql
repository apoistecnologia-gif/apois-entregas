create or replace function public.current_user_is_merchant_member(_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.current_user_is_merchant_manager(_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.current_user_is_merchant_owner(_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
$$;
