create or replace function public.merchant_request_courier(_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders;
  v_job public.delivery_jobs;
  v_job_id uuid;
  v_existing_job_id uuid;
  v_dispatch_radius_km numeric;
  v_is_admin boolean := public.current_user_is_admin();
begin
  select * into v_order
  from public.orders o
  where o.id = _order_id
  for update;

  if not found then raise exception 'order not found'; end if;
  if not public.current_user_is_merchant_member(v_order.merchant_id) and not v_is_admin then
    raise exception 'merchant access required';
  end if;
  if v_order.fulfillment_type <> 'delivery' then raise exception 'delivery order required'; end if;
  if v_order.payment_method = 'pix' and v_order.payment_status <> 'paid' then
    raise exception 'pix payment must be confirmed before courier dispatch';
  end if;
  if v_order.status not in (
    'ready','searching_driver','driver_assigned','driver_arriving_store','picked_up','out_for_delivery','on_the_way'
  ) then
    raise exception 'order must be ready before courier dispatch';
  end if;

  select dj.id into v_existing_job_id
  from public.delivery_jobs dj
  where dj.order_id = _order_id
  limit 1;

  if v_existing_job_id is not null and v_order.status = 'ready' then
    update public.delivery_jobs
    set status = 'searching',
        courier_id = null,
        search_started_at = now(),
        updated_at = now()
    where id = v_existing_job_id
      and courier_id is null
      and status = 'cancelled';

    if found then
      update public.orders set status = 'searching_driver' where id = _order_id;
      insert into public.order_status_history(order_id,status,changed_by_user_id)
      values(_order_id,'searching_driver',(select auth.uid()));
      insert into public.delivery_events(delivery_job_id,event_type,from_status,to_status,metadata)
      values(
        v_existing_job_id,
        'courier_search_restarted',
        'cancelled',
        'searching',
        jsonb_build_object('requested_by', auth.uid())
      );
    end if;
  end if;

  v_job_id := public.ensure_delivery_job(_order_id);

  select c.courier_dispatch_radius_km into v_dispatch_radius_km
  from public.merchants m
  join public.cities c on c.id = m.city_id
  where m.id = v_order.merchant_id
    and c.is_active = true
  limit 1;

  if v_dispatch_radius_km is null or v_dispatch_radius_km <= 0 then
    raise exception 'courier dispatch radius required';
  end if;

  select dj.* into v_job
  from public.delivery_jobs dj
  where dj.id = v_job_id
  for update;

  if not found then raise exception 'delivery job missing for dispatched order'; end if;

  if v_job.courier_id is null and v_job.status in ('searching','offered') then
    perform public.dispatch_delivery_job_offers(v_job.id);
  end if;

  if v_is_admin and v_existing_job_id is null then
    insert into public.admin_audit_logs(
      admin_id,action,entity_type,entity_id,before_data,after_data
    ) values (
      (select auth.uid()),
      'admin_request_courier',
      'order',
      _order_id::text,
      to_jsonb(v_order),
      jsonb_build_object('delivery_job_id',v_job_id)
    );
  end if;

  return v_job_id;
end;
$function$;

revoke all on function public.merchant_request_courier(uuid) from public, anon;
grant execute on function public.merchant_request_courier(uuid) to authenticated, service_role;
