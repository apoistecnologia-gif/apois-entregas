do $migration$
declare
  v_definition text;
  v_name text;
begin
  foreach v_name in array array['ensure_delivery_job','ensure_pickup_confirmation_secret']
  loop
    select pg_get_functiondef(p.oid)
      into v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_name
      and pg_get_function_identity_arguments(p.oid) = '_order_id uuid';

    if v_definition is null then
      raise exception '% definition not found', v_name;
    end if;

    v_definition := replace(
      v_definition,
      'gen_random_bytes(2)',
      'extensions.gen_random_bytes(2)'
    );
    execute v_definition;
  end loop;
end;
$migration$;
