do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_order_atomic_v2'
    and pg_get_function_identity_arguments(p.oid) = 'p_customer_user_id uuid, p_merchant_id uuid, p_items jsonb, p_payment_method text, p_delivery_address jsonb, p_request_key uuid, p_fulfillment_type text, p_coupon_code text, p_observation text';

  if v_definition is null then
    raise exception 'create_order_atomic_v2 definition not found';
  end if;

  v_definition := replace(
    v_definition,
    'on conflict(order_id) do nothing',
    'on conflict on constraint coupon_redemptions_order_id_key do nothing'
  );

  execute v_definition;
end;
$migration$;
