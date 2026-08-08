-- APOIS ENTREGAS — audited admin actions for core configuration.

CREATE OR REPLACE FUNCTION public.admin_set_city_active(_city_id uuid, _is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  SELECT to_jsonb(c) INTO v_before FROM public.cities c WHERE c.id = _city_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'city not found'; END IF;

  UPDATE public.cities c
  SET is_active = _is_active, updated_at = now()
  WHERE c.id = _city_id
  RETURNING to_jsonb(c) INTO v_after;

  INSERT INTO public.admin_audit_logs(admin_id, action, entity_type, entity_id, before_data, after_data)
  VALUES ((SELECT auth.uid()), 'set_city_active', 'city', _city_id::text, v_before, v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_fee_rule_active(_fee_rule_id uuid, _is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  SELECT to_jsonb(f) INTO v_before FROM public.fee_rules f WHERE f.id = _fee_rule_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'fee rule not found'; END IF;

  UPDATE public.fee_rules f
  SET is_active = _is_active, updated_at = now()
  WHERE f.id = _fee_rule_id
  RETURNING to_jsonb(f) INTO v_after;

  INSERT INTO public.admin_audit_logs(admin_id, action, entity_type, entity_id, before_data, after_data)
  VALUES ((SELECT auth.uid()), 'set_fee_rule_active', 'fee_rule', _fee_rule_id::text, v_before, v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_city_active(uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_fee_rule_active(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_city_active(uuid,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_fee_rule_active(uuid,boolean) TO authenticated, service_role;
