-- APOIS ENTREGAS — server-side account blocking and merchant member administration.

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id=ur.user_id
    WHERE ur.user_id=(SELECT auth.uid())
      AND ur.role='admin'::public.app_role
      AND p.is_active=true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_merchant_member(_merchant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.merchant_members mm
    JOIN public.merchants m ON m.id=mm.merchant_id
    JOIN public.profiles p ON p.id=mm.user_id
    WHERE mm.merchant_id=_merchant_id
      AND mm.user_id=(SELECT auth.uid())
      AND mm.status='active'
      AND p.is_active=true
      AND m.is_active=true
      AND m.approval_status='approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_merchant_manager(_merchant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.merchant_members mm
    JOIN public.merchants m ON m.id=mm.merchant_id
    JOIN public.profiles p ON p.id=mm.user_id
    WHERE mm.merchant_id=_merchant_id
      AND mm.user_id=(SELECT auth.uid())
      AND mm.status='active'
      AND mm.role IN ('owner','manager')
      AND p.is_active=true
      AND m.is_active=true
      AND m.approval_status='approved'
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_admin(),public.current_user_is_merchant_member(uuid),public.current_user_is_merchant_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin(),public.current_user_is_merchant_member(uuid),public.current_user_is_merchant_manager(uuid) TO authenticated,service_role;

-- Any order creation path must reference an active customer profile.
CREATE OR REPLACE FUNCTION public.enforce_active_order_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  IF NEW.customer_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=NEW.customer_user_id AND p.is_active=true
  ) THEN
    RAISE EXCEPTION 'customer account is blocked or unavailable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_require_active_customer ON public.orders;
CREATE TRIGGER orders_require_active_customer
BEFORE INSERT OR UPDATE OF customer_user_id ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_active_order_customer();

CREATE OR REPLACE FUNCTION public.admin_set_user_active(
  _user_id uuid,
  _is_active boolean,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.current_user_is_admin() THEN RAISE EXCEPTION 'admin access required'; END IF;
  IF _user_id=(SELECT auth.uid()) AND NOT _is_active THEN RAISE EXCEPTION 'administrator cannot block own account'; END IF;
  IF NOT _is_active AND NULLIF(btrim(_reason),'') IS NULL THEN RAISE EXCEPTION 'block reason is required'; END IF;

  SELECT to_jsonb(p) INTO v_before FROM public.profiles p WHERE p.id=_user_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;

  UPDATE public.profiles p
  SET is_active=_is_active,
      blocked_reason=CASE WHEN _is_active THEN NULL ELSE btrim(_reason) END
  WHERE p.id=_user_id
  RETURNING to_jsonb(p) INTO v_after;

  -- Force all courier operation off when the user is blocked.
  IF NOT _is_active THEN
    UPDATE public.courier_availability a
    SET is_online=false,online_since=NULL,last_seen_at=now()
    WHERE a.courier_id IN (SELECT c.id FROM public.couriers c WHERE c.user_id=_user_id);
  END IF;

  INSERT INTO public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  VALUES((SELECT auth.uid()),CASE WHEN _is_active THEN 'unblock_user' ELSE 'block_user' END,'profile',_user_id::text,v_before,v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_merchant_member(
  _merchant_id uuid,
  _user_id uuid,
  _role text,
  _status text DEFAULT 'active'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT (public.current_user_is_admin() OR public.current_user_is_merchant_manager(_merchant_id)) THEN
    RAISE EXCEPTION 'merchant manager access required';
  END IF;
  IF _role NOT IN ('owner','manager','staff') THEN RAISE EXCEPTION 'invalid member role'; END IF;
  IF _status NOT IN ('active','inactive') THEN RAISE EXCEPTION 'invalid member status'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=_user_id) THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.merchants m WHERE m.id=_merchant_id) THEN RAISE EXCEPTION 'merchant not found'; END IF;

  SELECT to_jsonb(mm) INTO v_before
  FROM public.merchant_members mm
  WHERE mm.merchant_id=_merchant_id AND mm.user_id=_user_id;

  INSERT INTO public.merchant_members(merchant_id,user_id,role,status)
  VALUES(_merchant_id,_user_id,_role,_status)
  ON CONFLICT(merchant_id,user_id) DO UPDATE
  SET role=EXCLUDED.role,status=EXCLUDED.status,updated_at=now();

  SELECT to_jsonb(mm) INTO v_after
  FROM public.merchant_members mm
  WHERE mm.merchant_id=_merchant_id AND mm.user_id=_user_id;

  IF public.current_user_is_admin() THEN
    INSERT INTO public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
    VALUES((SELECT auth.uid()),'manage_merchant_member','merchant_member',_merchant_id::text||':'||_user_id::text,v_before,v_after);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_active(uuid,boolean,text),public.manage_merchant_member(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid,boolean,text),public.manage_merchant_member(uuid,uuid,text,text) TO authenticated,service_role;
