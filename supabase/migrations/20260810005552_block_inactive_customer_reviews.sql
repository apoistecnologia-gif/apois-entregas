create or replace function public.submit_order_review(
  _order_id uuid,
  _merchant_rating smallint,
  _courier_rating smallint default null::smallint,
  _comment text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_courier_id uuid;
  v_review_id uuid;
begin
  if not public.current_user_is_active() then
    raise exception 'active account required';
  end if;

  select * into v_order
  from public.orders o
  where o.id=_order_id and o.customer_user_id=(select auth.uid())
  for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status<>'delivered' then raise exception 'order is not delivered'; end if;
  if _merchant_rating not between 1 and 5 then raise exception 'invalid merchant rating'; end if;
  if _courier_rating is not null and _courier_rating not between 1 and 5 then raise exception 'invalid courier rating'; end if;
  if _comment is not null and char_length(_comment)>1000 then raise exception 'comment is too long'; end if;

  select dj.courier_id into v_courier_id
  from public.delivery_jobs dj
  where dj.order_id=_order_id;

  if exists(
    select 1 from public.reviews r
    where r.order_id=_order_id and r.customer_user_id=(select auth.uid())
  ) then
    raise exception 'order already reviewed';
  end if;

  insert into public.reviews(
    order_id,customer_user_id,merchant_id,courier_id,merchant_rating,courier_rating,comment
  ) values(
    _order_id,(select auth.uid()),v_order.merchant_id,v_courier_id,_merchant_rating,
    case when v_courier_id is null then null else _courier_rating end,
    nullif(btrim(_comment),'')
  ) returning id into v_review_id;
  return v_review_id;
end;
$function$;

revoke all on function public.submit_order_review(uuid,smallint,smallint,text) from public, anon;
grant execute on function public.submit_order_review(uuid,smallint,smallint,text) to authenticated, service_role;
