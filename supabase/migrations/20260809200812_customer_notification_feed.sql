create or replace function public.get_my_notification_feed(_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_user_id is null or not public.current_user_is_active() then
    raise exception 'active account required';
  end if;

  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc),'[]'::jsonb)
    into v_result
  from (
    select *
    from public.notifications n
    where n.user_id = v_user_id
    order by n.created_at desc
    limit greatest(1,least(coalesce(_limit,100),200))
  ) n;

  return v_result;
end;
$function$;

create or replace function public.read_my_notification(_notification_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_has_read_at boolean;
  v_has_is_read boolean;
  v_has_status boolean;
begin
  if v_user_id is null or not public.current_user_is_active() then
    raise exception 'active account required';
  end if;
  if not exists(
    select 1 from public.notifications n
    where n.id=_notification_id and n.user_id=v_user_id
  ) then
    raise exception 'notification not found';
  end if;

  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='read_at'),
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='is_read'),
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='status')
    into v_has_read_at,v_has_is_read,v_has_status;

  if v_has_read_at then
    execute 'update public.notifications set read_at=coalesce(read_at,now()) where id=$1 and user_id=$2' using _notification_id,v_user_id;
  elsif v_has_is_read then
    execute 'update public.notifications set is_read=true where id=$1 and user_id=$2' using _notification_id,v_user_id;
  elsif v_has_status then
    execute 'update public.notifications set status=''read'' where id=$1 and user_id=$2' using _notification_id,v_user_id;
  else
    raise exception 'notification table has no readable state column';
  end if;
end;
$function$;

create or replace function public.read_all_my_notifications()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_count integer := 0;
  v_has_read_at boolean;
  v_has_is_read boolean;
  v_has_status boolean;
begin
  if v_user_id is null or not public.current_user_is_active() then
    raise exception 'active account required';
  end if;

  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='read_at'),
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='is_read'),
         exists(select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='status')
    into v_has_read_at,v_has_is_read,v_has_status;

  if v_has_read_at then
    execute 'update public.notifications set read_at=coalesce(read_at,now()) where user_id=$1 and read_at is null' using v_user_id;
  elsif v_has_is_read then
    execute 'update public.notifications set is_read=true where user_id=$1 and coalesce(is_read,false)=false' using v_user_id;
  elsif v_has_status then
    execute 'update public.notifications set status=''read'' where user_id=$1 and status is distinct from ''read''' using v_user_id;
  else
    raise exception 'notification table has no readable state column';
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.get_my_notification_feed(integer) from public;
revoke all on function public.read_my_notification(uuid) from public;
revoke all on function public.read_all_my_notifications() from public;
grant execute on function public.get_my_notification_feed(integer) to authenticated;
grant execute on function public.read_my_notification(uuid) to authenticated;
grant execute on function public.read_all_my_notifications() to authenticated;
